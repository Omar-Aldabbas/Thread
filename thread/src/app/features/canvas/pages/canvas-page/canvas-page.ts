import { CommonModule, isPlatformBrowser } from '@angular/common';
import { AfterViewInit, Component, ElementRef, HostListener, OnDestroy, PLATFORM_ID, computed, effect, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CanvasConnection, CanvasItem, ItemType, SketchBrush, SketchStroke, demoConnections, demoItems } from '../../canvas.model';
import { RichTextEditor } from '../../components/rich-text-editor';
import { PreferencesService } from '../../../../shared/preferences.service';
import { MediaPicker, PickedMedia } from '../../components/media-picker';
import { CanvasTransformOverlay } from '../../transform/canvas-transform-overlay';
import { SketchRenderer } from '../../sketch/sketch-renderer';
import { brushDiameter, distanceToStroke, strokeBounds, strokeOutlinePath } from '../../sketch/sketch-geometry';

type Tool = 'select' | 'hand' | 'text' | 'add' | 'connect' | 'sketch';
type Session = { kind: 'pan' | 'move' | 'resize' | 'rotate' | 'marquee' | 'place' | 'crop' | 'connect' | 'sketch' | 'erase'; pointerId: number; clientX: number; clientY: number; x: number; y: number; itemId?: string; corner?: 'nw' | 'ne' | 'sw' | 'se'; before?: State; origins?: Map<string, { x: number; y: number }>; moved?: boolean };
type State = { items: CanvasItem[]; connections: CanvasConnection[] };

@Component({ selector: 'app-canvas-page', standalone: true, imports: [CommonModule, RichTextEditor, MediaPicker, SketchRenderer], templateUrl: './canvas-page.html', styleUrl: './canvas-page.css' })
export class CanvasPage implements AfterViewInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly preferences = inject(PreferencesService);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly spaceId = this.route.snapshot.paramMap.get('id') || 'thread';
  private readonly storageKey = `thread-canvas-${this.spaceId}`;
  readonly viewport = viewChild<ElementRef<HTMLElement>>('viewport');
  private readonly initial = this.read();
  readonly items = signal<CanvasItem[]>(this.initial.items);
  readonly connections = signal<CanvasConnection[]>(this.initial.connections);
  readonly contextId = signal<string | null>(null);
  readonly selectedIds = signal<string[]>([]);
  readonly tool = signal<Tool>('select');
  readonly spaceHeld = signal(false);
  readonly paletteOpen = signal(false);
  readonly pendingType = signal<ItemType | null>(null);
  readonly editingId = signal<string | null>(null);
  readonly richFocusId = signal<string | null>(null);
  private richBefore: State | null = null;
  readonly placement = signal<{ x: number; y: number; width: number; height: number } | null>(null);
  readonly dropActive = signal(false);
  readonly cropId = signal<string | null>(null);
  readonly connectionPreview = signal<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  readonly sketchPoints = signal<{ x: number; y: number; pressure?: number }[]>([]);
  readonly sketchColor = signal('#d4111c');
  readonly sketchEraser = signal(false);
  readonly brush = signal<SketchBrush>('pen');
  readonly brushWidth = signal(3);
  readonly activeSketchStrokes = signal<SketchStroke[]>([]);
  readonly undoneSketchStrokes = signal<SketchStroke[]>([]);
  readonly editingSketchId = signal<string | null>(null);
  readonly mediaPicker = signal<'gif' | 'sticker' | null>(null);
  readonly pendingAsset = signal<PickedMedia | null>(null);
  readonly assetPreview = signal<{ x: number; y: number } | null>(null);
  private cropBefore: State | null = null;
  private replaceId: string | null = null;
  readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');
  private imagePlacement: { x: number; y: number } | null = null;
  private clipboard: CanvasItem[] = [];
  private pointers = new Map<number, { x: number; y: number }>();
  private pinch: { distance: number; x: number; y: number } | null = null;
  readonly inspectorOpen = signal(false);
  readonly connectionSourceId = signal<string | null>(null);
  readonly search = signal('');
  readonly panX = signal(0);
  readonly panY = signal(0);
  readonly zoom = signal(1);
  readonly isPanning = signal(false);
  readonly marquee = signal<{ x: number; y: number; width: number; height: number } | null>(null);
  private session: Session | null = null;
  private history: State[] = [];
  private future: State[] = [];
  private transformOverlay: CanvasTransformOverlay | null = null;
  private transformBefore: State | null = null;
  private transformStart: CanvasItem | null = null;
  private transformFrame = 0;
  readonly transformGuide = signal<{ label: string; x: number; y: number } | null>(null);
  readonly snapGuide = signal<{ x?: number; y?: number } | null>(null);

  readonly spaceName = computed(() => {
    if (!this.browser) return 'Thread development';
    try { const spaces = JSON.parse(localStorage.getItem('thread-spaces') || '[]') as { id: string; title: string }[]; return spaces.find((space) => space.id === this.spaceId)?.title || (this.spaceId === 'thread' ? 'Thread development' : 'Untitled space'); }
    catch { return 'Thread development'; }
  });
  readonly context = computed(() => this.items().find((item) => item.id === this.contextId()) || null);
  readonly breadcrumbs = computed(() => { const path: CanvasItem[] = []; let current = this.context(); while (current) { path.unshift(current); current = this.items().find((item) => item.id === current?.parentId) || null; } return path; });
  readonly visibleItems = computed(() => this.items().filter((item) => !this.search() || `${item.title} ${item.body || ''}`.toLowerCase().includes(this.search().toLowerCase())));
  readonly visibleConnections = computed(() => this.connections().filter((connection) => this.visibleItems().some((item) => item.id === connection.sourceId) && this.visibleItems().some((item) => item.id === connection.targetId)));
  readonly selected = computed(() => this.items().find((item) => item.id === this.selectedIds()[0]) || null);
  readonly worldTransform = computed(() => `translate(${this.panX()}px, ${this.panY()}px) scale(${this.zoom()})`);
  readonly gridSize = computed(() => `${24 * this.zoom()}px ${24 * this.zoom()}px`);
  readonly gridPosition = computed(() => `${this.panX()}px ${this.panY()}px`);
  readonly zoomLabel = computed(() => `${Math.round(this.zoom() * 100)}%`);
  childCount(id: string): number { return this.items().filter((item) => item.parentId === id).length; }

  constructor() {
    effect(() => { if (this.browser) { try { localStorage.setItem(this.storageKey, JSON.stringify({ version: 2, items: this.items(), connections: this.connections() })); } catch { /* Large files can exceed local storage. */ } } });
    effect(() => { this.selectedIds(); this.zoom(); this.panX(); this.panY(); if (this.browser) this.queueTransformSync(); });
  }
  ngAfterViewInit(): void {
    if (this.browser && this.viewport()) {
      this.transformOverlay = new CanvasTransformOverlay(this.viewport()!.nativeElement, {
        start: () => this.beginTransform(),
        resize: (width, height, direction) => this.resizeTransform(width, height, direction),
        rotate: degrees => this.rotateTransform(degrees),
        end: () => this.endTransform(),
      });
    }
    setTimeout(() => { this.fitView(); this.queueTransformSync(); const entryTool = this.route.snapshot.queryParamMap.get('tool'); if (entryTool === 'task') this.chooseType('task'); else if (entryTool === 'text' || entryTool === 'sketch' || entryTool === 'connect') this.setTool(entryTool); });
  }
  ngOnDestroy(): void { if (this.transformFrame) cancelAnimationFrame(this.transformFrame); this.transformOverlay?.destroy(); }
  private queueTransformSync(): void { if (!this.browser || this.transformFrame) return; this.transformFrame = requestAnimationFrame(() => { this.transformFrame = 0; const viewport = this.viewport()?.nativeElement; if (!viewport || !this.transformOverlay) return; const ids = this.selectedIds(); const targets = ids.map(id => viewport.querySelector<HTMLElement>(`[data-node-id="${id}"]`)).filter((value): value is HTMLElement => !!value); const others = [...viewport.querySelectorAll<HTMLElement>('[data-node-id]')].filter(element => !ids.includes(element.dataset['nodeId'] || '')); const item = this.selected(); this.transformOverlay.update(targets, others, !!item && ['image', 'gif', 'sticker', 'sketch'].includes(item.type)); }); }
  private beginTransform(): void { this.transformStart = this.selected(); this.transformBefore = this.state(); }
  private resizeTransform(width: number, height: number, direction: number[]): void {
    const item = this.transformStart; if (!item) return;
    const nextWidth = Math.max(40, width), nextHeight = Math.max(40, height);
    const sx = direction[0] || 1, sy = direction[1] || 1;
    const angle = (item.rotation || 0) * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle);
    const oldOppX = -sx * item.width / 2, oldOppY = -sy * item.height / 2;
    const newOppX = -sx * nextWidth / 2, newOppY = -sy * nextHeight / 2;
    const anchorX = item.x + item.width / 2 + oldOppX * cos - oldOppY * sin;
    const anchorY = item.y + item.height / 2 + oldOppX * sin + oldOppY * cos;
    const centerX = anchorX - newOppX * cos + newOppY * sin;
    const centerY = anchorY - newOppX * sin - newOppY * cos;
    this.update(item.id, { x: centerX - nextWidth / 2, y: centerY - nextHeight / 2, width: nextWidth, height: nextHeight, textAutoSize: false });
    this.setTransformGuide(`${Math.round(nextWidth)} × ${Math.round(nextHeight)}`);
    this.queueTransformSync();
  }
  private rotateTransform(degrees: number): void { const item = this.transformStart; if (!item) return; const rotation = Math.round(degrees); this.update(item.id, { rotation }); this.setTransformGuide(`${rotation}°`); this.queueTransformSync(); }
  private setTransformGuide(label: string): void { const item = this.selected(), viewport = this.viewport()?.nativeElement; if (!item || !viewport) return; const x = this.panX() + (item.x + item.width / 2) * this.zoom(); const top = this.panY() + item.y * this.zoom(); const bottom = this.panY() + (item.y + item.height) * this.zoom(); this.transformGuide.set({ label, x, y: top >= 44 ? top - 35 : bottom + 16 }); }
  private endTransform(): void { if (this.transformBefore) this.commit(this.transformBefore); this.transformBefore = null; this.transformStart = null; this.transformGuide.set(null); this.queueTransformSync(); }

  private read(): State {
    if (!this.browser) return { items: demoItems, connections: demoConnections };
    try { const stored = localStorage.getItem(this.storageKey); if (stored) { const state = JSON.parse(stored) as State & { version?: number }; if (state.version !== 2) return this.normalizeLegacy(state); return { items: state.items.map(item => item.sketchAsset === 'sticker' ? { ...item, type: 'sticker' as const, title: 'Rough star', image: '/stickers/rough-star.svg', assetId: 'rough-star', sketchAsset: undefined } : item.sketchAsset === 'gif' ? { ...item, type: 'gif' as const, sketchAsset: undefined } : item), connections: state.connections }; } } catch { }
    return this.spaceId === 'thread' ? { items: [
      { ...demoItems.find(item => item.id === 'research')!, parentId: null, x: 170, y: 150, width: 730, height: 450, title: 'Ideas in progress' },
      { ...demoItems.find(item => item.id === 'note-1')!, parentId: 'research', x: 220, y: 250, width: 270, height: 190 },
      { ...demoItems.find(item => item.id === 'task-1')!, parentId: 'research', x: 550, y: 315, width: 240, height: 170 },
      { ...demoItems.find(item => item.id === 'image-1')!, parentId: null, x: 1000, y: 210, width: 360, height: 330 },
    ], connections: [] } : { items: [], connections: [] };
  }
  private normalizeLegacy(state: State): State { const items = structuredClone(state.items); const byId = new Map(items.map(item => [item.id, item])); const positions = new Map<string, { x: number; y: number }>(); const position = (item: CanvasItem): { x: number; y: number } => { if (positions.has(item.id)) return positions.get(item.id)!; const parent = item.parentId ? byId.get(item.parentId) : null; const base = parent && parent.type !== 'workspace' ? position(parent) : { x: 0, y: 0 }; const value = { x: item.x + base.x, y: item.y + base.y }; positions.set(item.id, value); return value; }; for (const item of items) { if (['research-note', 'research-deep', 'engine-task', 'roadmap-budget', 'roadmap-table'].includes(item.id)) { const p = position(item); item.x = p.x; item.y = p.y; } } return { items, connections: state.connections }; }
  private state(): State { return { items: structuredClone(this.items()), connections: structuredClone(this.connections()) }; }
  private commit(before: State): void { if (JSON.stringify(before) === JSON.stringify(this.state())) return; this.history.push(before); this.history = this.history.slice(-60); this.future = []; }
  private snapshot(): void { this.history.push(this.state()); this.history = this.history.slice(-60); this.future = []; }
  undo(): void { const state = this.history.pop(); if (!state) return; this.future.push({ items: structuredClone(this.items()), connections: structuredClone(this.connections()) }); this.items.set(state.items); this.connections.set(state.connections); }
  redo(): void { const state = this.future.pop(); if (!state) return; this.history.push({ items: structuredClone(this.items()), connections: structuredClone(this.connections()) }); this.items.set(state.items); this.connections.set(state.connections); }
  setTool(tool: Tool): void { if (this.tool() === 'sketch' && tool !== 'sketch') this.completeSketch(); this.finishEditing(); this.tool.set(tool); this.paletteOpen.set(tool === 'add'); if (tool !== 'add') this.pendingType.set(null); if (tool !== 'sketch') this.sketchEraser.set(false); else this.selectedIds.set([]); this.pendingAsset.set(null); this.mediaPicker.set(null); this.connectionSourceId.set(null); }
  chooseType(type: ItemType): void { if (type === 'gif' || type === 'sticker') { this.openMedia(type); return; } this.pendingType.set(type); this.paletteOpen.set(false); this.tool.set('select'); }
  openMedia(kind: 'gif' | 'sticker'): void { this.paletteOpen.set(false); this.mediaPicker.set(kind); this.pendingAsset.set(null); }
  pickMedia(asset: PickedMedia): void { this.mediaPicker.set(null); this.pendingAsset.set(asset); this.assetPreview.set(this.centerPoint()); this.selectedIds.set([]); this.sketchEraser.set(false); this.tool.set('select'); }
  placeMedia(asset: PickedMedia, point: { x: number; y: number }): void {
    const scale = Math.min(1, 280 / asset.width, 220 / asset.height);
    const width = Math.round(asset.width * scale), height = Math.round(asset.height * scale);
    const item: CanvasItem = { id: crypto.randomUUID(), type: asset.kind, parentId: null, x: point.x - width / 2, y: point.y - height / 2, width, height, title: asset.name, image: asset.src, assetId: asset.id, rotation: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    this.snapshot(); this.items.update(items => [...items, item]); this.selectedIds.set([item.id]); this.pendingAsset.set(null); this.assetPreview.set(null); this.tool.set('select');
  }
  brushSize(): number { return brushDiameter(this.brush(), this.brushWidth()); }
  brushOpacity(): number { return this.brush() === 'highlighter' ? .34 : this.brush() === 'marker' ? .9 : 1; }
  readonly currentStroke = computed<SketchStroke | null>(() => this.sketchPoints().length ? { id: 'current', brush: this.brush(), points: this.sketchPoints().map(point => ({ x: point.x, y: point.y, pressure: point.pressure ?? .5 })), color: this.sketchColor(), size: this.brushWidth(), opacity: this.brushOpacity() } : null);
  readonly activeRendered = computed(() => this.activeSketchStrokes().map(stroke => ({ stroke, path: strokeOutlinePath(stroke) })));
  strokeOutlinePath(stroke: SketchStroke): string { return strokeOutlinePath(stroke, false); }

  @HostListener('window:keydown', ['$event'])
  keyDown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable) return;
    if (event.code === 'Space') { event.preventDefault(); this.spaceHeld.set(true); return; }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') { event.preventDefault(); this.selectedIds.set(this.visibleItems().map(item => item.id)); return; }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') { event.preventDefault(); this.copy(); return; }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'x') { event.preventDefault(); this.copy(); this.removeSelected(); return; }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v' && this.clipboard.length) { event.preventDefault(); this.paste(); return; }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); if (this.tool() === 'sketch') event.shiftKey ? this.redoSketchStroke() : this.undoSketchStroke(); else event.shiftKey ? this.redo() : this.undo(); return; }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y' && this.tool() === 'sketch') { event.preventDefault(); this.redoSketchStroke(); return; }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') { event.preventDefault(); this.duplicate(); return; }
    if (event.key === 'Delete' || event.key === 'Backspace') { this.removeSelected(); return; }
    if (event.key === 'Escape') { if (this.cropId()) this.finishCrop(false); else if (this.editingId()) this.finishEditing(); else if (this.pendingAsset()) this.pendingAsset.set(null); else if (this.mediaPicker()) this.mediaPicker.set(null); else if (this.pendingType()) this.pendingType.set(null); else if (this.paletteOpen()) this.paletteOpen.set(false); else this.selectedIds.set([]); this.connectionSourceId.set(null); return; }
    if (event.key === 'Enter' && this.cropId()) { this.finishCrop(true); return; }
    const keys: Record<string, Tool> = { v: 'select', h: 'hand', t: 'text', n: 'add', c: 'connect', s: 'sketch', p: 'sketch' };
    if (keys[event.key.toLowerCase()]) this.setTool(keys[event.key.toLowerCase()]);
  }
  @HostListener('window:keyup', ['$event']) keyUp(event: KeyboardEvent): void { if (event.code === 'Space') this.spaceHeld.set(false); }
  @HostListener('window:blur') blur(): void { this.spaceHeld.set(false); this.session = null; this.isPanning.set(false); this.pointers.clear(); this.pinch = null; }

  private point(clientX: number, clientY: number): { x: number; y: number } { const rect = this.viewport()?.nativeElement.getBoundingClientRect(); return { x: (clientX - (rect?.left || 0) - this.panX()) / this.zoom(), y: (clientY - (rect?.top || 0) - this.panY()) / this.zoom() }; }
  pointerDown(event: PointerEvent): void {
    if (event.button !== 0 && event.button !== 1) return;
    if ((event.target as HTMLElement).closest('[data-ui], [data-item]')) return;
    if (this.pendingAsset()) { this.placeMedia(this.pendingAsset()!, this.point(event.clientX, event.clientY)); return; }
    if (event.pointerType === 'touch') { this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY }); if (this.pointers.size === 2) { const [a, b] = [...this.pointers.values()]; this.pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; this.session = null; this.sketchPoints.set([]); return; } }
    const point = this.point(event.clientX, event.clientY);
    if (event.button === 1 || this.spaceHeld() || this.tool() === 'hand') { this.session = { kind: 'pan', pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, x: this.panX(), y: this.panY() }; this.isPanning.set(true); }
    else if (this.pendingType()) { this.session = { kind: 'place', pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, x: point.x, y: point.y }; if (this.pendingType() === 'zone') this.placement.set({ x: point.x, y: point.y, width: 0, height: 0 }); }
    else if (this.tool() === 'text') { this.createAt('text', point); return; }
    else if (this.tool() === 'sketch') { this.session = { kind: this.sketchEraser() ? 'erase' : 'sketch', pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, x: point.x, y: point.y }; if (this.sketchEraser()) { this.snapshot(); this.eraseSketchAt(point); } else this.sketchPoints.set([{ ...point, pressure: event.pressure || .5 }]); }
    else if (this.tool() === 'select') { this.finishEditing(); if (!event.shiftKey) this.selectedIds.set([]); this.session = event.pointerType === 'touch' ? { kind: 'pan', pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, x: this.panX(), y: this.panY() } : { kind: 'marquee', pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, x: point.x, y: point.y }; }
    else if (this.tool() === 'connect') this.connectionSourceId.set(null);
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }
  itemPointerDown(event: PointerEvent, item: CanvasItem): void {
    if (event.button !== 0 || (event.target as HTMLElement).closest('button, input, a, [contenteditable="true"]')) return;
    event.stopPropagation();
    if (this.cropId() === item.id) { this.session = { kind: 'crop', pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, x: item.cropX || 0, y: item.cropY || 0, itemId: item.id }; (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId); return; }
    if (this.spaceHeld() || this.tool() === 'hand') { this.session = { kind: 'pan', pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, x: this.panX(), y: this.panY() }; this.isPanning.set(true); }
    else if (this.tool() === 'connect') { const source = this.connectionSourceId(); if (source && source !== item.id) { this.snapshot(); this.connections.update((connections) => [...connections, { id: crypto.randomUUID(), sourceId: source, targetId: item.id, direction: 'forward' }]); this.setTool('select'); } else { this.connectionSourceId.set(item.id); this.selectedIds.set([item.id]); } return; }
    else { this.finishEditing(); const current = this.selectedIds(); this.selectedIds.set(event.shiftKey ? (current.includes(item.id) ? current.filter(id => id !== item.id) : [...current, item.id]) : current.includes(item.id) ? current : [item.id]); if (event.shiftKey || this.tool() !== 'select' || item.locked) return; const moving = new Set(this.selectedIds()); let changed = true; while (changed) { changed = false; for (const child of this.items()) if (child.parentId && moving.has(child.parentId) && !moving.has(child.id)) { moving.add(child.id); changed = true; } } const origins = new Map(this.items().filter(entry => moving.has(entry.id)).map(entry => [entry.id, { x: entry.x, y: entry.y }])); this.session = { kind: 'move', pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, x: item.x, y: item.y, itemId: item.id, origins, before: this.state() }; }
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }
  resizeDown(event: PointerEvent, item: CanvasItem, corner: 'nw' | 'ne' | 'sw' | 'se' = 'se'): void { event.stopPropagation(); this.session = { kind: 'resize', pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, x: item.width, y: item.height, itemId: item.id, corner, before: this.state() }; (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId); }
  rotateDown(event: PointerEvent, item: CanvasItem): void { event.stopPropagation(); const point = this.point(event.clientX, event.clientY); const angle = Math.atan2(point.y - item.y - item.height / 2, point.x - item.x - item.width / 2); this.session = { kind: 'rotate', pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, x: angle, y: item.rotation || 0, itemId: item.id, before: this.state() }; (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId); }
  connectDown(event: PointerEvent, item: CanvasItem): void { event.preventDefault(); event.stopPropagation(); const x = item.x + item.width, y = item.y + item.height / 2; this.session = { kind: 'connect', pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, x, y, itemId: item.id }; this.connectionPreview.set({ x1: x, y1: y, x2: x, y2: y }); (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId); }
  pointerMove(event: PointerEvent): void {
    if (this.pendingAsset()) this.assetPreview.set(this.point(event.clientX, event.clientY));
    if (this.pointers.has(event.pointerId)) { this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY }); if (this.pointers.size === 2 && this.pinch) { const [a, b] = [...this.pointers.values()]; const distance = Math.hypot(a.x - b.x, a.y - b.y), x = (a.x + b.x) / 2, y = (a.y + b.y) / 2; this.panX.update(v => v + x - this.pinch!.x); this.panY.update(v => v + y - this.pinch!.y); this.zoomAt(x, y, this.zoom() * distance / Math.max(1, this.pinch.distance)); this.pinch = { distance, x, y }; return; } }
    const session = this.session; if (!session || session.pointerId !== event.pointerId) return;
    const dx = event.clientX - session.clientX; const dy = event.clientY - session.clientY;
    if (Math.abs(dx) + Math.abs(dy) > 3) session.moved = true;
    if (session.kind === 'pan') { this.panX.set(session.x + dx); this.panY.set(session.y + dy); }
    if (session.kind === 'move' && session.origins) {
      let offsetX = dx / this.zoom(), offsetY = dy / this.zoom();
      const moving = this.items().find(item => item.id === session.itemId);
      const origin = moving && session.origins.get(moving.id);
      let guideX: number | undefined, guideY: number | undefined;
      if (moving && origin) {
        const ownX = [origin.x + offsetX, origin.x + offsetX + moving.width / 2, origin.x + offsetX + moving.width];
        const ownY = [origin.y + offsetY, origin.y + offsetY + moving.height / 2, origin.y + offsetY + moving.height];
        let bestX = 6 / this.zoom(), bestY = 6 / this.zoom(), snapX = 0, snapY = 0;
        for (const other of this.items()) {
          if (session.origins.has(other.id)) continue;
          for (const target of [other.x, other.x + other.width / 2, other.x + other.width]) for (const value of ownX) { const distance = Math.abs(target - value); if (distance < bestX) { bestX = distance; guideX = target; snapX = target - value; } }
          for (const target of [other.y, other.y + other.height / 2, other.y + other.height]) for (const value of ownY) { const distance = Math.abs(target - value); if (distance < bestY) { bestY = distance; guideY = target; snapY = target - value; } }
        }
        offsetX += snapX; offsetY += snapY;
      }
      this.snapGuide.set(guideX !== undefined || guideY !== undefined ? { x: guideX, y: guideY } : null);
      this.items.update(items => items.map(item => { const start = session.origins!.get(item.id); return start ? { ...item, x: start.x + offsetX, y: start.y + offsetY } : item; }));
      this.queueTransformSync();
    }
    if (session.kind === 'resize') { this.items.update((items) => items.map((item) => {
      if (item.id !== session.itemId) return item;
      const original = session.before!.items.find(entry => entry.id === item.id)!;
      const corner = session.corner || 'se', sx = corner.endsWith('e') ? 1 : -1, sy = corner.startsWith('s') ? 1 : -1;
      const angle = (original.rotation || 0) * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle);
      const localX = (dx * cos + dy * sin) / this.zoom(), localY = (-dx * sin + dy * cos) / this.zoom();
      let width = Math.max(item.type === 'text' ? 50 : 40, original.width + sx * localX);
      let height = Math.max(item.type === 'text' ? 34 : 40, original.height + sy * localY);
      if (['image', 'gif', 'sticker', 'sketch'].includes(item.type) && !event.shiftKey) {
        const ratio = original.width / original.height;
        if (Math.abs(localX / original.width) >= Math.abs(localY / original.height)) height = width / ratio;
        else width = height * ratio;
      }
      const oldOppX = -sx * original.width / 2, oldOppY = -sy * original.height / 2;
      const newOppX = -sx * width / 2, newOppY = -sy * height / 2;
      const anchorX = original.x + original.width / 2 + oldOppX * cos - oldOppY * sin;
      const anchorY = original.y + original.height / 2 + oldOppX * sin + oldOppY * cos;
      const centerX = anchorX - newOppX * cos + newOppY * sin;
      const centerY = anchorY - newOppX * sin - newOppY * cos;
      return { ...item, x: centerX - width / 2, y: centerY - height / 2, width, height };
    })); const item = this.items().find(entry => entry.id === session.itemId); if (item) this.setTransformGuide(`${Math.round(item.width)} × ${Math.round(item.height)}`); this.queueTransformSync(); }
    if (session.kind === 'rotate' && session.itemId) { const item = this.items().find(entry => entry.id === session.itemId); if (item) { const point = this.point(event.clientX, event.clientY); const angle = Math.atan2(point.y - item.y - item.height / 2, point.x - item.x - item.width / 2); let rotation = session.y + (angle - session.x) * 180 / Math.PI; if (event.shiftKey) rotation = Math.round(rotation / 15) * 15; this.update(item.id, { rotation }); this.setTransformGuide(`${Math.round(rotation)}°`); this.queueTransformSync(); } }
    if (session.kind === 'marquee') { const point = this.point(event.clientX, event.clientY); this.marquee.set({ x: Math.min(session.x, point.x), y: Math.min(session.y, point.y), width: Math.abs(point.x - session.x), height: Math.abs(point.y - session.y) }); }
    if (session.kind === 'place' && this.pendingType() === 'zone') { const point = this.point(event.clientX, event.clientY); this.placement.set({ x: Math.min(session.x, point.x), y: Math.min(session.y, point.y), width: Math.abs(point.x - session.x), height: Math.abs(point.y - session.y) }); }
    if (session.kind === 'crop' && session.itemId) this.update(session.itemId, { cropX: session.x + dx / this.zoom(), cropY: session.y + dy / this.zoom() });
    if (session.kind === 'connect') { const point = this.point(event.clientX, event.clientY); this.connectionPreview.set({ x1: session.x, y1: session.y, x2: point.x, y2: point.y }); }
    if (session.kind === 'sketch') { const point = this.point(event.clientX, event.clientY); const last = this.sketchPoints().at(-1); if (!last || Math.hypot(point.x - last.x, point.y - last.y) > 1.5) this.sketchPoints.update(points => [...points, { ...point, pressure: event.pressure || .5 }]); }
    if (session.kind === 'erase') this.eraseSketchAt(this.point(event.clientX, event.clientY));
  }
  pointerUp(event: PointerEvent): void { this.pointers.delete(event.pointerId); if (this.pointers.size < 2) this.pinch = null; const session = this.session; this.transformGuide.set(null); if (session?.kind === 'marquee' && this.marquee()) { const rect = this.marquee()!; if (rect.width > 4 || rect.height > 4) this.selectedIds.set(this.visibleItems().filter((item) => item.x < rect.x + rect.width && item.x + item.width > rect.x && item.y < rect.y + rect.height && item.y + item.height > rect.y).map((item) => item.id)); } if (session?.kind === 'place' && this.pendingType()) { const box = this.placement(); this.createAt(this.pendingType()!, { x: box?.width && box.width > 10 ? box.x : session.x, y: box?.height && box.height > 10 ? box.y : session.y }, box?.width && box.width > 10 ? box : undefined); this.pendingType.set(null); } if (session?.kind === 'connect' && session.itemId) { const point = this.point(event.clientX, event.clientY); const target = [...this.items()].reverse().find(item => item.id !== session.itemId && point.x >= item.x && point.x <= item.x + item.width && point.y >= item.y && point.y <= item.y + item.height); if (target) { this.snapshot(); this.connections.update(connections => [...connections, { id: crypto.randomUUID(), sourceId: session.itemId!, targetId: target.id, direction: 'forward' }]); } } if ((session?.kind === 'move' || session?.kind === 'resize' || session?.kind === 'rotate') && session.before) { if (session.kind === 'resize' && session.itemId && this.items().find(entry => entry.id === session.itemId)?.type === 'text') this.update(session.itemId, { textAutoSize: false }); if (session.kind === 'move' && session.moved && session.itemId) this.reparent(session.itemId); this.commit(session.before); } if (session?.kind === 'sketch') this.finishSketch(); this.session = null; this.sketchPoints.set([]); this.marquee.set(null); this.snapGuide.set(null); this.placement.set(null); this.connectionPreview.set(null); this.isPanning.set(false); const target = event.currentTarget as HTMLElement; if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId); }
  wheel(event: WheelEvent): void { event.preventDefault(); if (event.ctrlKey || event.metaKey) this.zoomAt(event.clientX, event.clientY, this.zoom() * (event.deltaY > 0 ? .9 : 1.1)); else { this.panX.update((x) => x - event.deltaX); this.panY.update((y) => y - event.deltaY); } }
  zoomAt(clientX: number, clientY: number, value: number): void { const rect = this.viewport()?.nativeElement.getBoundingClientRect(); if (!rect) return; const point = this.point(clientX, clientY); const zoom = Math.min(3, Math.max(.25, value)); this.zoom.set(zoom); this.panX.set(clientX - rect.left - point.x * zoom); this.panY.set(clientY - rect.top - point.y * zoom); }
  zoomBy(factor: number): void { const rect = this.viewport()?.nativeElement.getBoundingClientRect(); if (rect) this.zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, this.zoom() * factor); }
  fitView(): void { const rect = this.viewport()?.nativeElement.getBoundingClientRect(); const frames = this.visibleItems().filter((item) => item.type === 'workspace'); const targets = frames.length ? frames : this.visibleItems(); if (!rect || !targets.length) { this.panX.set(0); this.panY.set(0); this.zoom.set(1); return; } const minX = Math.min(...targets.map((item) => item.x)); const minY = Math.min(...targets.map((item) => item.y)); const maxX = Math.max(...targets.map((item) => item.x + item.width)); const maxY = Math.max(...targets.map((item) => item.y + item.height)); const zoom = Math.min(1.15, Math.max(.35, Math.min((rect.width - 170) / (maxX - minX), (rect.height - 150) / (maxY - minY)))); this.zoom.set(zoom); this.panX.set((rect.width - (maxX - minX) * zoom) / 2 - minX * zoom); this.panY.set((rect.height - (maxY - minY) * zoom) / 2 - minY * zoom); }
  enter(item: CanvasItem): void { if (item.type !== 'zone' && item.type !== 'workspace') return; this.navigate(item.zoneType === 'portal' && item.portalTargetId ? item.portalTargetId : item.id); }
  navigate(id: string | null): void { this.contextId.set(id); this.selectedIds.set([]); queueMicrotask(() => this.fitView()); }
  goToSpaces(): void { this.router.navigate(['/spaces']); }
  goToSettings(): void { this.router.navigate(['/settings']); }
  create(type: ItemType): void { this.createAt(type, this.centerPoint()); }
  update(id: string, patch: Partial<CanvasItem>): void { this.items.update((items) => items.map((item) => item.id === id ? { ...item, ...patch, updatedAt: new Date().toISOString() } : item)); }
  field(event: Event, key: keyof CanvasItem): void { const selected = this.selected(); if (selected) this.update(selected.id, { [key]: (event.target as HTMLInputElement).value }); }
  richInput(event: Event): void { const selected = this.selected(); if (selected) this.update(selected.id, { bodyHtml: (event.target as HTMLElement).innerHTML }); }
  formatText(command: string): void { document.execCommand(command, false); }
  toggleTask(id: string): void { const item = this.items().find((item) => item.id === id); if (item) { this.snapshot(); this.update(id, { completed: !item.completed }); } }
  toggleChecklist(id: string, index: number): void { const item = this.items().find((item) => item.id === id); if (item) { this.snapshot(); this.update(id, { checklist: item.checklist?.map((entry, i) => i === index ? { ...entry, completed: !entry.completed } : entry) }); } }
  addChecklistRow(): void { const item = this.selected(); if (item) this.update(item.id, { checklist: [...(item.checklist || []), { label: 'New item', completed: false }] }); }
  editChecklistRow(index: number, event: Event): void { const item = this.selected(); if (item) this.update(item.id, { checklist: item.checklist?.map((entry, i) => i === index ? { ...entry, label: (event.target as HTMLInputElement).value } : entry) }); }
  addBudgetRow(): void { const item = this.selected(); if (item) this.update(item.id, { rows: [...(item.rows || []), { label: 'New item', value: 0 }] }); }
  editBudgetRow(index: number, key: 'label' | 'value', event: Event): void { const item = this.selected(); if (item) this.update(item.id, { rows: item.rows?.map((row, i) => i === index ? { ...row, [key]: key === 'value' ? Number((event.target as HTMLInputElement).value) : (event.target as HTMLInputElement).value } : row) }); }
  duplicate(): void { if (!this.selectedIds().length) return; const selected = this.items().filter(item => this.selectedIds().includes(item.id)); const ids = new Map(selected.map(item => [item.id, crypto.randomUUID()])); const copies = selected.map(item => ({ ...structuredClone(item), id: ids.get(item.id)!, parentId: item.parentId && ids.has(item.parentId) ? ids.get(item.parentId)! : item.parentId, x: item.x + 24, y: item.y + 24 })); this.snapshot(); this.items.update(items => [...items, ...copies]); this.selectedIds.set(copies.map(item => item.id)); }
  removeSelected(): void { const ids = this.selectedIds(); if (!ids.length) return; this.snapshot(); const removed = new Set(ids); let changed = true; while (changed) { changed = false; for (const item of this.items()) if (item.parentId && removed.has(item.parentId) && !removed.has(item.id)) { removed.add(item.id); changed = true; } } this.items.update((items) => items.filter((item) => !removed.has(item.id))); this.connections.update((connections) => connections.filter((connection) => !removed.has(connection.sourceId) && !removed.has(connection.targetId))); this.selectedIds.set([]); }
  connectionPath(connection: CanvasConnection): string { const source = this.items().find((item) => item.id === connection.sourceId)!; const target = this.items().find((item) => item.id === connection.targetId)!; const x1 = source.x + source.width; const y1 = source.y + source.height / 2; const x2 = target.x; const y2 = target.y + target.height / 2; const bend = Math.max(60, Math.abs(x2 - x1) * .45); return `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`; }
  connectionLabelX(connection: CanvasConnection): number { const a = this.items().find((item) => item.id === connection.sourceId)!; const b = this.items().find((item) => item.id === connection.targetId)!; return (a.x + a.width + b.x) / 2; }
  connectionLabelY(connection: CanvasConnection): number { const a = this.items().find((item) => item.id === connection.sourceId)!; const b = this.items().find((item) => item.id === connection.targetId)!; return (a.y + a.height / 2 + b.y + b.height / 2) / 2 - 12; }
  private reparent(id: string): void { const item = this.items().find(entry => entry.id === id); if (!item || item.type === 'zone' || item.type === 'workspace') return; const x = item.x + item.width / 2, y = item.y + item.height / 2; const zone = [...this.items()].reverse().find(entry => entry.type === 'zone' && entry.id !== id && x >= entry.x && x <= entry.x + entry.width && y >= entry.y && y <= entry.y + entry.height); if (zone) this.update(id, { parentId: zone.id }); else if (this.items().find(entry => entry.id === item.parentId)?.type === 'zone') this.update(id, { parentId: null }); }
  createAt(type: ItemType, point: { x: number; y: number }, box?: { width: number; height: number }): void {
    if (type === 'file' || type === 'voice') { this.replaceId = null; this.imagePlacement = point; this.fileInput()?.nativeElement.click(); return; }
    const viewport = this.viewport()?.nativeElement;
    const mobile = !!viewport && viewport.clientWidth <= 700;
    const visibleWidth = viewport ? viewport.clientWidth / this.zoom() : 390;
    const width = Math.max(100, box?.width || (type === 'zone' ? 420 : type === 'budget' ? 360 : type === 'table' ? 390 : type === 'image' ? 340 : type === 'list' ? 300 : type === 'task' ? 280 : type === 'link' ? 320 : type === 'text' ? 180 : 260));
    const height = Math.max(40, box?.height || (type === 'zone' ? 280 : type === 'budget' ? 280 : type === 'table' ? 220 : type === 'image' ? 230 : type === 'task' ? 78 : type === 'list' ? 150 : type === 'link' ? 115 : type === 'text' ? 46 : 170));
    const placedWidth = mobile && !box ? Math.min(width, visibleWidth - 32 / this.zoom()) : width;
    const left = -this.panX() / this.zoom() + 16 / this.zoom();
    const x = mobile && !box ? Math.max(left, Math.min(point.x - placedWidth / 2, left + visibleWidth - 32 / this.zoom() - placedWidth)) : point.x;
    const item: CanvasItem = { id: crypto.randomUUID(), type, parentId: null, x, y: point.y, width: placedWidth, height, title: '', body: '', textAutoSize: type === 'text', accent: '#d4111c', zoneType: type === 'zone' ? 'standard' : undefined, checklist: type === 'checklist' || type === 'list' ? [{ label: '', completed: false }] : undefined, rows: type === 'budget' ? [{ label: 'New item', value: 0 }] : undefined, tableColumns: type === 'table' ? ['Column 1', 'Column 2'] : undefined, tableRows: type === 'table' ? [['', '']] : undefined, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    this.snapshot(); this.items.update(items => [...items, item]); this.selectedIds.set([item.id]); this.tool.set('select');
    if (['note', 'text', 'task', 'zone', 'link', 'list', 'budget', 'table'].includes(type)) queueMicrotask(() => this.startEditing(item.id));
  }
  selectImageForBlock(id: string): void { const item = this.items().find(entry => entry.id === id); if (!item || item.type !== 'image') return; this.selectedIds.set([id]); this.replaceId = id; this.imagePlacement = { x: item.x, y: item.y }; const input = this.fileInput()?.nativeElement; if (input) { input.accept = 'image/*'; input.click(); } }
  canvasDoubleClick(event: MouseEvent): void { if ((event.target as HTMLElement).closest('[data-item], [data-ui]')) return; this.createAt('note', this.point(event.clientX, event.clientY)); }
  startEditing(id: string, target?: EventTarget | null): void { const item = this.items().find(entry => entry.id === id); this.selectedIds.set([id]); this.richBefore = this.state(); this.richFocusId.set(item?.type === 'text' || (target instanceof HTMLElement && target.classList.contains('note-body')) ? id : null); this.editingId.set(id); if (this.richFocusId() === id) return; setTimeout(() => { const element = document.querySelector<HTMLElement>(`[data-edit-id="${id}"]`); element?.focus(); if (element?.isContentEditable) { const range = document.createRange(); range.selectNodeContents(element); range.collapse(false); const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range); } }); }
  finishEditing(): void { if (this.richBefore) this.commit(this.richBefore); this.richBefore = null; this.richFocusId.set(null); this.editingId.set(null); }
  richContent(id: string): string { const item = this.items().find(entry => entry.id === id); const content = item?.bodyHtml || (item?.type === 'text' ? item.title : item?.body) || ''; if (item?.bodyHtml) return content; const escaped = content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>'); return `<p>${escaped}</p>`; }
  richChanged(id: string, event: { html: string; text: string }): void { const item = this.items().find(entry => entry.id === id); if (!item) return; this.update(id, item.type === 'text' ? { bodyHtml: event.html, title: event.text } : { bodyHtml: event.html, body: event.text }); }
  inlineInput(event: Event, id: string, key: 'title' | 'body'): void { /* Keep the browser's live contenteditable DOM intact until blur. */ }
  inlineBlur(event: Event, id: string, key: 'title' | 'body'): void { const value = (event.target as HTMLElement).innerText; const current = this.items().find(item => item.id === id); if (current && current[key] !== value) { if (!this.richBefore) this.snapshot(); const patch: Partial<CanvasItem> = { [key]: value }; if (current.type === 'text' && current.textAutoSize && key === 'title') { const canvas = document.createElement('canvas'); const context = canvas.getContext('2d'); if (context) { context.font = `${current.fontWeight || 600} ${current.fontSize || 21}px sans-serif`; patch.width = Math.max(80, Math.min(520, ...value.split('\n').map(line => context.measureText(line).width + 12))); patch.height = Math.max(36, value.split('\n').length * (current.fontSize || 21) * 1.35 + 6); } } this.update(id, patch); } const next = (event as FocusEvent).relatedTarget as HTMLElement | null; if (!next?.closest(`[data-node-id="${id}"]`)) this.finishEditing(); }
  inlineKey(event: KeyboardEvent): void { const id = this.editingId(); const item = this.items().find(entry => entry.id === id); if (event.key === 'Escape' || ((event.ctrlKey || event.metaKey) && event.key === 'Enter') || (item?.type === 'task' && event.key === 'Enter')) { event.preventDefault(); (event.target as HTMLElement).blur(); this.finishEditing(); } }
  taskTitleKey(event: KeyboardEvent, id: string): void { if (event.key === 'Enter' || event.key === 'Escape') { event.preventDefault(); (event.target as HTMLInputElement).blur(); } }
  taskTitleBlur(event: Event, id: string): void { const value = (event.target as HTMLInputElement).value.trim() || 'New task'; const item = this.items().find(entry => entry.id === id); if (item && item.title !== value) { if (!this.richBefore) this.snapshot(); this.update(id, { title: value }); } this.finishEditing(); }
  setStyle(id: string, patch: Partial<CanvasItem>): void { this.snapshot(); this.update(id, patch); }
  setTextSize(id: string, event: Event): void { this.setStyle(id, { fontSize: Number((event.target as HTMLSelectElement).value) }); }
  setFontFamily(id: string, event: Event): void { this.setStyle(id, { fontFamily: (event.target as HTMLSelectElement).value as CanvasItem['fontFamily'] }); }
  setAlignment(id: string, event: Event): void { this.setStyle(id, { textAlign: (event.target as HTMLSelectElement).value as CanvasItem['textAlign'] }); }
  toggleBold(id: string): void { const item = this.items().find(entry => entry.id === id); if (item) this.setStyle(id, { fontWeight: (item.fontWeight || 600) >= 700 ? 400 : 700 }); }
  setProperty(id: string, key: 'x' | 'y' | 'width' | 'height', event: Event): void { const value = Number((event.target as HTMLInputElement).value); if (Number.isFinite(value)) this.setStyle(id, { [key]: key === 'width' || key === 'height' ? Math.max(30, value) : value }); }
  setString(id: string, key: 'due' | 'priority' | 'body', event: Event): void { this.setStyle(id, { [key]: (event.target as HTMLInputElement).value }); }
  setTaskStatus(id: string, event: Event): void { this.setStyle(id, { completed: (event.target as HTMLSelectElement).value === 'done' }); }
  setOrdered(id: string, event: Event): void { this.setStyle(id, { ordered: (event.target as HTMLInputElement).checked }); }
  addSubtask(id: string): void { const item = this.items().find(entry => entry.id === id); if (!item) return; this.setStyle(id, { checklist: [...(item.checklist || []), { label: 'New subtask', completed: false }], height: Math.max(item.height, 155) }); }
  addTaskNear(id: string): void { const item = this.items().find(entry => entry.id === id); if (!item) return; this.finishEditing(); this.createAt('task', { x: item.x, y: item.y + item.height + 18 }); }
  setListRow(id: string, index: number, event: Event): void { const item = this.items().find(entry => entry.id === id); if (!item) return; const value = (event.target as HTMLInputElement).value; if (item.checklist?.[index]?.label === value) return; this.setStyle(id, { checklist: item.checklist?.map((row, i) => i === index ? { ...row, label: value } : row) }); }
  addListRow(id: string): void { const item = this.items().find(entry => entry.id === id); if (!item) return; const index = item.checklist?.length || 0; this.setStyle(id, { checklist: [...(item.checklist || []), { label: '', completed: false }], height: Math.max(item.height, 95 + (index + 1) * 32) }); setTimeout(() => document.querySelector<HTMLInputElement>(`[data-node-id="${id}"] .list-row:nth-child(${index + 1}) input`)?.focus()); }
  listKey(event: KeyboardEvent, id: string, index: number): void { if (event.key === 'Enter') { event.preventDefault(); this.setListRow(id, index, event); this.addListRow(id); } else if (event.key === 'Escape') (event.target as HTMLInputElement).blur(); }
  setBudgetRow(id: string, index: number, key: 'label' | 'value', event: Event): void { const item = this.items().find(entry => entry.id === id); if (!item) return; const raw = (event.target as HTMLInputElement).value; this.setStyle(id, { rows: item.rows?.map((row, i) => i === index ? { ...row, [key]: key === 'value' ? Number(raw) : raw } : row) }); }
  addBudgetEntry(id: string): void { const item = this.items().find(entry => entry.id === id); if (item) this.setStyle(id, { rows: [...(item.rows || []), { label: '', value: 0 }], height: item.height + 32 }); }
  budgetTotal(item: CanvasItem): number { return (item.rows || []).reduce((sum, row) => sum + row.value, 0); }
  setLinkUrl(id: string, event: Event): void { const url = (event.target as HTMLInputElement).value.trim(); this.setStyle(id, { url, title: this.items().find(entry => entry.id === id)?.title || url }); }
  copy(): void { const ids = new Set(this.selectedIds()); this.clipboard = structuredClone(this.items().filter(item => ids.has(item.id))); }
  paste(): void { if (!this.clipboard.length) return; const copies = this.clipboard.map(item => ({ ...structuredClone(item), id: crypto.randomUUID(), x: item.x + 24, y: item.y + 24 })); this.snapshot(); this.items.update(items => [...items, ...copies]); this.selectedIds.set(copies.map(item => item.id)); this.clipboard = structuredClone(copies); }
  async fileSelected(event: Event): Promise<void> { const input = event.target as HTMLInputElement; const files = input.files; if (files?.length) await this.importFiles(files, this.imagePlacement || this.centerPoint()); input.value = ''; input.accept = 'image/*,audio/*,.pdf,.txt,.doc,.docx'; this.imagePlacement = null; this.replaceId = null; }
  private centerPoint(): { x: number; y: number } { const rect = this.viewport()?.nativeElement.getBoundingClientRect(); return rect ? this.point(rect.left + rect.width / 2, rect.top + rect.height / 2) : { x: 0, y: 0 }; }
  private async importFiles(files: FileList | File[], point: { x: number; y: number }): Promise<void> { let index = 0; for (const file of Array.from(files)) { const source = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file); }); let width = 260, height = 130; const image = file.type.startsWith('image/'); if (image) { const size = await new Promise<{ width: number; height: number }>(resolve => { const img = new Image(); img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight }); img.onerror = () => resolve({ width: 320, height: 240 }); img.src = source; }); const scale = Math.min(1, 520 / size.width, 420 / size.height); width = size.width * scale; height = size.height * scale; } if (image && this.replaceId) { this.snapshot(); this.update(this.replaceId, { image: source, title: file.name, cropX: 0, cropY: 0, cropScale: 1 }); break; } const item: CanvasItem = { id: crypto.randomUUID(), type: image ? 'image' : file.type.startsWith('audio/') ? 'voice' : 'file', parentId: null, x: point.x + 24 * index, y: point.y + 24 * index, width, height, title: file.name, image: image ? source : undefined, filename: file.name, url: image ? undefined : source, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; this.snapshot(); this.items.update(items => [...items, item]); this.selectedIds.set([item.id]); index++; } }
  dragOver(event: DragEvent): void { if (event.dataTransfer?.types.includes('Files')) { event.preventDefault(); this.dropActive.set(true); } }
  dragLeave(): void { this.dropActive.set(false); }
  async drop(event: DragEvent): Promise<void> { event.preventDefault(); this.dropActive.set(false); if (!event.dataTransfer?.files.length) return; const target = (event.target as HTMLElement).closest<HTMLElement>('[data-node-id]'); const item = this.items().find(entry => entry.id === target?.dataset['nodeId']); this.replaceId = item?.type === 'image' && !item.image ? item.id : null; await this.importFiles(event.dataTransfer.files, this.point(event.clientX, event.clientY)); this.replaceId = null; }
  @HostListener('window:paste', ['$event']) async onPaste(event: ClipboardEvent): Promise<void> { const target = event.target as HTMLElement; if (target.isContentEditable || ['INPUT', 'TEXTAREA'].includes(target.tagName)) return; const files = Array.from(event.clipboardData?.files || []); if (files.length) { event.preventDefault(); await this.importFiles(files, this.centerPoint()); return; } const value = event.clipboardData?.getData('text/plain')?.trim(); if (value && !this.clipboard.length) { event.preventDefault(); this.createAt(/^https?:\/\//.test(value) ? 'link' : 'text', this.centerPoint()); const item = this.selected(); if (item) this.update(item.id, { title: value, url: item.type === 'link' ? value : undefined }); } }
  replaceImage(): void { const item = this.selected(); if (item?.type === 'image') this.selectImageForBlock(item.id); }
  startCrop(): void { const item = this.selected(); if (item?.type !== 'image') return; this.cropBefore = this.state(); this.cropId.set(item.id); this.inspectorOpen.set(false); }
  cropZoom(factor: number): void { const item = this.selected(); if (item?.type === 'image') this.update(item.id, { cropScale: Math.max(1, Math.min(5, (item.cropScale || 1) * factor)) }); }
  finishCrop(save: boolean): void { if (this.cropBefore) { if (save) this.commit(this.cropBefore); else { this.items.set(this.cropBefore.items); this.connections.set(this.cropBefore.connections); } } this.cropBefore = null; this.cropId.set(null); }
  imageTransform(item: CanvasItem): string { const scale = item.cropScale || 1; return `translate(${item.cropX || 0}px, ${item.cropY || 0}px) scale(${scale * (item.flipX ? -1 : 1)}, ${scale * (item.flipY ? -1 : 1)})`; }
  layer(direction: 'front' | 'back' | 'top' | 'bottom'): void {
    const selected = new Set(this.selectedIds()); if (!selected.size) return;
    const ordered = [...this.items()].sort((a, b) => (a.zIndex ?? (a.type === 'zone' || a.type === 'workspace' ? 0 : 1)) - (b.zIndex ?? (b.type === 'zone' || b.type === 'workspace' ? 0 : 1)));
    if (direction === 'top' || direction === 'bottom') {
      const chosen = ordered.filter(item => selected.has(item.id)), rest = ordered.filter(item => !selected.has(item.id));
      ordered.splice(0, ordered.length, ...(direction === 'top' ? [...rest, ...chosen] : [...chosen, ...rest]));
    } else {
      const indexes = direction === 'front' ? [...ordered.keys()].reverse() : [...ordered.keys()];
      for (const index of indexes) { const next = index + (direction === 'front' ? 1 : -1); if (next < 0 || next >= ordered.length || !selected.has(ordered[index].id) || selected.has(ordered[next].id)) continue; [ordered[index], ordered[next]] = [ordered[next], ordered[index]]; }
    }
    const levels = new Map(ordered.map((item, index) => [item.id, index + 1]));
    this.snapshot(); this.items.update(items => items.map(item => ({ ...item, zIndex: levels.get(item.id) })));
  }
  flip(id: string, axis: 'x' | 'y'): void { const item = this.items().find(entry => entry.id === id); if (item) this.setStyle(id, axis === 'x' ? { flipX: !item.flipX } : { flipY: !item.flipY }); }
  align(axis: 'x' | 'y'): void { const targets = this.items().filter(item => this.selectedIds().includes(item.id)); if (targets.length < 2) return; const value = Math.min(...targets.map(item => item[axis])); this.snapshot(); targets.forEach(item => this.update(item.id, { [axis]: value })); }
  private eraseSketchAt(point: { x: number; y: number }): void {
    const radius = 18 / this.zoom();
    this.activeSketchStrokes.update(strokes => strokes.filter(stroke => distanceToStroke(point, stroke) > radius + brushDiameter(stroke.brush, stroke.size) / 2));
    this.items.update(items => items.flatMap(item => {
      if (item.type !== 'sketch' || item.id === this.editingSketchId()) return [item];
      const angle = -(item.rotation || 0) * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle);
      const dx = point.x - item.x - item.width / 2, dy = point.y - item.y - item.height / 2;
      const localX = dx * cos - dy * sin + item.width / 2, localY = dx * sin + dy * cos + item.height / 2;
      const sourceX = localX * (item.sourceWidth || item.width) / item.width, sourceY = localY * (item.sourceHeight || item.height) / item.height;
      const scale = Math.max((item.sourceWidth || item.width) / item.width, (item.sourceHeight || item.height) / item.height);
      const existing = item.sketchStrokes || (item.strokes || []).map((points, index): SketchStroke => ({ id: `${item.id}-${index}`, brush: 'pen', points: points.map(p => ({ x: p.x, y: p.y, pressure: p.pressure ?? .5 })), color: item.accent || '#d4111c', size: item.strokeWidth || 3, opacity: item.strokeOpacity || 1 }));
      const remaining = existing.filter(stroke => distanceToStroke({ x: sourceX, y: sourceY }, stroke) > radius * scale + brushDiameter(stroke.brush, stroke.size) / 2);
      return remaining.length ? [{ ...item, sketchStrokes: remaining, strokes: undefined }] : [];
    }));
  }
  private finishSketch(): void {
    if (this.sketchPoints().length < 2) return;
    const stroke: SketchStroke = { id: crypto.randomUUID(), brush: this.brush(), points: this.sketchPoints().map(point => ({ x: point.x, y: point.y, pressure: point.pressure ?? .5 })), color: this.sketchColor(), size: this.brushWidth(), opacity: this.brushOpacity() };
    this.activeSketchStrokes.update(strokes => [...strokes, stroke]); this.undoneSketchStrokes.set([]);
  }
  undoSketchStroke(): void { const strokes = this.activeSketchStrokes(); if (!strokes.length) return; this.undoneSketchStrokes.update(undone => [...undone, strokes.at(-1)!]); this.activeSketchStrokes.set(strokes.slice(0, -1)); }
  redoSketchStroke(): void { const undone = this.undoneSketchStrokes(); if (!undone.length) return; this.activeSketchStrokes.update(strokes => [...strokes, undone.at(-1)!]); this.undoneSketchStrokes.set(undone.slice(0, -1)); }
  editSketch(id: string): void {
    const item = this.items().find(entry => entry.id === id); if (!item || item.type !== 'sketch') return;
    this.setTool('sketch'); this.editingSketchId.set(id);
    const angle = (item.rotation || 0) * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle);
    const strokes = item.sketchStrokes || (item.strokes || []).map((points, index): SketchStroke => ({ id: `${id}-${index}`, brush: 'pen', points: points.map(point => ({ x: point.x, y: point.y, pressure: point.pressure ?? .5 })), color: item.accent || '#d4111c', size: item.strokeWidth || 3, opacity: item.strokeOpacity || 1 }));
    this.activeSketchStrokes.set(strokes.map(stroke => ({ ...stroke, points: stroke.points.map(point => { const x = point.x * item.width / (item.sourceWidth || item.width) - item.width / 2, y = point.y * item.height / (item.sourceHeight || item.height) - item.height / 2; return { ...point, x: item.x + item.width / 2 + x * cos - y * sin, y: item.y + item.height / 2 + x * sin + y * cos }; }) })));
  }
  private completeSketch(): void {
    const strokes = this.activeSketchStrokes(), editingId = this.editingSketchId();
    if (!strokes.length) { if (editingId) { this.snapshot(); this.items.update(items => items.filter(item => item.id !== editingId)); } this.activeSketchStrokes.set([]); this.undoneSketchStrokes.set([]); this.editingSketchId.set(null); return; }
    const bounds = strokeBounds(strokes);
    const normalized = strokes.map(stroke => ({ ...stroke, points: stroke.points.map(point => ({ ...point, x: point.x - bounds.x, y: point.y - bounds.y })) }));
    this.snapshot();
    if (editingId) { this.update(editingId, { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, sourceWidth: bounds.width, sourceHeight: bounds.height, rotation: 0, sketchStrokes: normalized, strokes: undefined }); this.selectedIds.set([editingId]); }
    else { const item: CanvasItem = { id: crypto.randomUUID(), type: 'sketch', parentId: null, x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, sourceWidth: bounds.width, sourceHeight: bounds.height, title: 'Sketch', sketchStrokes: normalized, rotation: 0, zIndex: Math.max(1, ...this.items().map(entry => entry.zIndex || 1)) + 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; this.items.update(items => [...items, item]); this.selectedIds.set([item.id]); }
    this.activeSketchStrokes.set([]); this.undoneSketchStrokes.set([]); this.editingSketchId.set(null);
  }
  tableColumns(item: CanvasItem): string[] { return item.tableColumns?.length ? item.tableColumns : ['Column 1', 'Column 2']; }
  tableRows(item: CanvasItem): string[][] { if (item.tableRows?.length) return item.tableRows; if (item.body) return item.body.split('\n').filter(Boolean).map(row => row.split('|')); return [['', '']]; }
  setTableHeader(id: string, column: number, event: Event): void { const item = this.items().find(entry => entry.id === id); if (!item) return; const columns = [...this.tableColumns(item)]; columns[column] = (event.target as HTMLInputElement).value; this.setStyle(id, { tableColumns: columns, tableRows: this.tableRows(item) }); }
  setTableCell(id: string, row: number, column: number, event: Event): void { const item = this.items().find(entry => entry.id === id); if (!item) return; const rows = this.tableRows(item).map(entry => [...entry]); rows[row] ??= Array(this.tableColumns(item).length).fill(''); rows[row][column] = (event.target as HTMLInputElement).value; this.setStyle(id, { tableRows: rows, tableColumns: this.tableColumns(item) }); }
  addTableRow(id: string): void { const item = this.items().find(entry => entry.id === id); if (!item) return; const columns = this.tableColumns(item); this.setStyle(id, { tableColumns: columns, tableRows: [...this.tableRows(item), Array(columns.length).fill('')], height: item.height + 34 }); }
  addTableColumn(id: string): void { const item = this.items().find(entry => entry.id === id); if (!item) return; const columns = [...this.tableColumns(item), `Column ${this.tableColumns(item).length + 1}`]; this.setStyle(id, { tableColumns: columns, tableRows: this.tableRows(item).map(row => [...row, '']), width: item.width + 120 }); }
  removeTableRow(id: string, row: number): void { const item = this.items().find(entry => entry.id === id); if (!item || this.tableRows(item).length <= 1) return; this.setStyle(id, { tableRows: this.tableRows(item).filter((_, index) => index !== row), tableColumns: this.tableColumns(item) }); }
  removeTableColumn(id: string, column: number): void { const item = this.items().find(entry => entry.id === id); if (!item || this.tableColumns(item).length <= 1) return; this.setStyle(id, { tableColumns: this.tableColumns(item).filter((_, index) => index !== column), tableRows: this.tableRows(item).map(row => row.filter((_, index) => index !== column)) }); }
}
