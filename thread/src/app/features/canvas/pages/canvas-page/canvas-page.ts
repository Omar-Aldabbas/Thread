import { CommonModule, isPlatformBrowser } from '@angular/common';
import { AfterViewInit, Component, ElementRef, HostListener, OnDestroy, PLATFORM_ID, computed, effect, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { BudgetCurrency, BudgetMode, CanvasConnection, CanvasItem, CanvasJunction, ChartConfig, ConnectorKind, ConnectorSide, ItemType, ShapeKind, SketchBrush, SketchStroke, ThreadDataset, demoConnections, demoItems } from '../../canvas.model';
import { DatasetStore } from '../../data/dataset-store';
import { ThreadChart } from '../../components/thread-chart';
import { containsShape, nearestPerimeter, perimeterPoint, sidePoint, world } from '../../sketch/connector-geometry';
import { RichTextEditor } from '../../components/rich-text-editor';
import { PreferencesService } from '../../../../shared/preferences.service';
import { MediaPicker, PickedMedia } from '../../components/media-picker';
import { CanvasTransformOverlay } from '../../transform/canvas-transform-overlay';
import { SketchRenderer } from '../../sketch/sketch-renderer';
import { ThreadHeader } from '../../../../shared/thread-header';
import { ScrollDirective } from '../../../../shared/scroll.directive';
import { brushDiameter, distanceToStroke, strokeBounds, strokeOutlinePath } from '../../sketch/sketch-geometry';

type Tool = 'select' | 'hand' | 'text' | 'add' | 'connect' | 'sketch' | 'shape';
type Session = { kind: 'pan' | 'move' | 'resize' | 'rotate' | 'marquee' | 'place' | 'crop' | 'connect' | 'rebind' | 'route' | 'branch' | 'junction-slide' | 'sketch' | 'erase'; pointerId: number; clientX: number; clientY: number; x: number; y: number; itemId?: string; connectionId?: string; junctionId?: string; ratio?: number; terminal?: 'source' | 'target'; side?: ConnectorSide; corner?: 'nw' | 'ne' | 'sw' | 'se'; before?: State; origins?: Map<string, { x: number; y: number }>; groupCenter?: { x: number; y: number }; groupIds?: string[]; moved?: boolean };
type State = { items: CanvasItem[]; connections: CanvasConnection[]; junctions?: CanvasJunction[]; datasets?: ThreadDataset[] };

@Component({ selector: 'app-canvas-page', standalone: true, providers: [DatasetStore], imports: [CommonModule, RichTextEditor, MediaPicker, SketchRenderer, ThreadHeader, ScrollDirective, ThreadChart], templateUrl: './canvas-page.html', styleUrl: './canvas-page.css' })
export class CanvasPage implements AfterViewInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly datasetStore = inject(DatasetStore);
  readonly datasets = this.datasetStore.datasets;
  readonly preferences = inject(PreferencesService);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly spaceId = this.route.snapshot.paramMap.get('id') || 'thread';
  private readonly storageKey = `thread-canvas-${this.spaceId}`;
  readonly viewport = viewChild<ElementRef<HTMLElement>>('viewport');
  private readonly initial = this.upgradeDataState(this.read());
  readonly items = signal<CanvasItem[]>(this.initial.items);
  readonly connections = signal<CanvasConnection[]>(this.initial.connections);
  readonly junctions = signal<CanvasJunction[]>(this.initial.junctions || []);
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
  readonly shapeKind = signal<ShapeKind>('rectangle');
  shapeIcon(kind: ShapeKind): string { return ({ rectangle: '□', rounded: '▢', circle: '○', diamond: '◇', triangle: '△', cloud: '☁' } as Record<ShapeKind, string>)[kind]; }
  readonly connectorKind = signal<ConnectorKind>('straight');
  readonly connectionTargetId = signal<string | null>(null);
  readonly junctionCandidate = signal<{ connectionId: string; ratio: number; x: number; y: number } | null>(null);
  readonly selectedConnectionId = signal<string | null>(null);
  readonly precisePreview = signal<{ x: number; y: number } | null>(null);
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
  private dataEditBefore: State | null = null;
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
  readonly groupBounds = computed(() => { const selected = this.items().filter(item => this.selectedIds().includes(item.id)); if (selected.length < 2) return null; const corners = selected.flatMap(item => { const cx = item.x + item.width / 2, cy = item.y + item.height / 2, a = (item.rotation || 0) * Math.PI / 180; return [-1, 1].flatMap(sx => [-1, 1].map(sy => ({ x: cx + sx * item.width / 2 * Math.cos(a) - sy * item.height / 2 * Math.sin(a), y: cy + sx * item.width / 2 * Math.sin(a) + sy * item.height / 2 * Math.cos(a) }))); }); const x = Math.min(...corners.map(point => point.x)), y = Math.min(...corners.map(point => point.y)); return { x, y, width: Math.max(...corners.map(point => point.x)) - x, height: Math.max(...corners.map(point => point.y)) - y }; });
  readonly worldTransform = computed(() => `translate(${this.panX()}px, ${this.panY()}px) scale(${this.zoom()})`);
  readonly gridSize = computed(() => `${24 * this.zoom()}px ${24 * this.zoom()}px`);
  readonly gridPosition = computed(() => `${this.panX()}px ${this.panY()}px`);
  readonly zoomLabel = computed(() => `${Math.round(this.zoom() * 100)}%`);
  childCount(id: string): number { return this.items().filter((item) => item.parentId === id).length; }

  constructor() {
    this.datasetStore.replace(this.initial.datasets || []);
    effect(() => { if (this.browser) { try { localStorage.setItem(this.storageKey, JSON.stringify({ version: 3, items: this.items(), connections: this.connections(), junctions: this.junctions(), datasets: this.datasets() })); } catch { /* Large files can exceed local storage. */ } } });
    effect(() => { this.selectedIds(); this.zoom(); this.panX(); this.panY(); if (this.browser) this.queueTransformSync(); });
  }
  ngAfterViewInit(): void {
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
    try { const stored = localStorage.getItem(this.storageKey); if (stored) { const state = JSON.parse(stored) as State & { version?: number }; if (state.version !== 2 && state.version !== 3) return this.normalizeLegacy(state); return { items: this.expandSketchItems(state.items.map(item => item.sketchAsset === 'sticker' ? { ...item, type: 'sticker' as const, title: 'Rough star', image: '/stickers/rough-star.svg', assetId: 'rough-star', sketchAsset: undefined } : item.sketchAsset === 'gif' ? { ...item, type: 'gif' as const, sketchAsset: undefined } : item)), connections: state.connections, junctions: state.junctions || [], datasets: state.datasets }; } } catch { }
    return this.spaceId === 'thread' ? { items: [
      { ...demoItems.find(item => item.id === 'research')!, parentId: null, x: 170, y: 150, width: 730, height: 450, title: 'Ideas in progress' },
      { ...demoItems.find(item => item.id === 'note-1')!, parentId: 'research', x: 220, y: 250, width: 270, height: 190 },
      { ...demoItems.find(item => item.id === 'task-1')!, parentId: 'research', x: 550, y: 315, width: 240, height: 170 },
      { ...demoItems.find(item => item.id === 'image-1')!, parentId: null, x: 1000, y: 210, width: 360, height: 330 },
    ], connections: [] } : { items: [], connections: [] };
  }
  private normalizeLegacy(state: State): State { const items = structuredClone(state.items); const byId = new Map(items.map(item => [item.id, item])); const positions = new Map<string, { x: number; y: number }>(); const position = (item: CanvasItem): { x: number; y: number } => { if (positions.has(item.id)) return positions.get(item.id)!; const parent = item.parentId ? byId.get(item.parentId) : null; const base = parent && parent.type !== 'workspace' ? position(parent) : { x: 0, y: 0 }; const value = { x: item.x + base.x, y: item.y + base.y }; positions.set(item.id, value); return value; }; for (const item of items) { if (['research-note', 'research-deep', 'engine-task', 'roadmap-budget', 'roadmap-table'].includes(item.id)) { const p = position(item); item.x = p.x; item.y = p.y; } } return { items: this.expandSketchItems(items), connections: state.connections }; }
  private upgradeDataState(state: State): State {
    const datasets = structuredClone(state.datasets || []);
    const items = state.items.map(item => {
      if (item.type !== 'budget' && item.type !== 'table') return item;
      if (item.datasetId && datasets.some(data => data.id === item.datasetId)) return item;
      const id = item.datasetId || crypto.randomUUID();
      if (item.type === 'budget') {
        datasets.push({ id, columns: [
          {id:crypto.randomUUID(),key:'item',label:'Item',type:'text'},
          {id:crypto.randomUUID(),key:'amount',label:'Amount',type:'currency'},
          {id:crypto.randomUUID(),key:'category',label:'Category',type:'category'}
        ], rows: (item.rows || []).filter(row => row.label !== 'New item' || row.value !== 0).map(row => ({id:crypto.randomUUID(),values:{item:row.label,amount:row.value,category:''}})) });
      } else {
        const oldRows = item.tableRows?.length ? item.tableRows : item.body ? item.body.split('\n').filter(Boolean).map(row => row.split('|')) : [];
        const labels = item.tableColumns?.length ? item.tableColumns : ['Column 1','Column 2'];
        const columns = labels.map((label,index) => { const values=oldRows.map(row=>row[index]?.trim()).filter(Boolean) as string[]; return {id:crypto.randomUUID(),key:`column_${index+1}`,label,type:/^(date|month|year|day)$/i.test(label)?'date' as const:values.length&&values.every(value=>Number.isFinite(Number(value)))?'number' as const:'text' as const}; });
        datasets.push({id,columns,rows:oldRows.filter(row=>row.some(value=>value.trim())).map(row=>({id:crypto.randomUUID(),values:Object.fromEntries(columns.map((column,index)=>[column.key,row[index]||'']))}))});
      }
      return { ...item, datasetId:id, rows:undefined, tableColumns:undefined, tableRows:undefined };
    });
    return {items,connections:state.connections,junctions:state.junctions || [],datasets};
  }
  private expandSketchItems(items: CanvasItem[]): CanvasItem[] {
    return items.flatMap(item => {
      const strokes = (item.sketchStrokes || (item.strokes || []).map((points, index): SketchStroke => ({ id: `${item.id}-${index}`, brush: 'pen', points: points.map(point => ({ x: point.x, y: point.y, pressure: point.pressure ?? .5 })), color: item.accent || '#d4111c', size: item.strokeWidth || 3, opacity: item.strokeOpacity || 1 }))).filter(stroke => stroke.points.length);
      if (item.type !== 'sketch' || strokes.length <= 1) return [item];
      const angle = (item.rotation || 0) * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle);
      return strokes.map((stroke, index) => {
        const world = { ...stroke, points: stroke.points.map(point => { const dx = point.x * item.width / (item.sourceWidth || item.width) - item.width / 2, dy = point.y * item.height / (item.sourceHeight || item.height) - item.height / 2; return { ...point, x: item.x + item.width / 2 + dx * cos - dy * sin, y: item.y + item.height / 2 + dx * sin + dy * cos }; }) };
        const bounds = strokeBounds([world]);
        return { ...item, id: index === 0 ? item.id : `${item.id}:${stroke.id}`, x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, sourceWidth: bounds.width, sourceHeight: bounds.height, rotation: 0, groupId: undefined, strokes: undefined, sketchStrokes: [{ ...world, points: world.points.map(point => ({ ...point, x: point.x - bounds.x, y: point.y - bounds.y })) }] };
      });
    });
  }
  private state(): State { return { items: structuredClone(this.items()), connections: structuredClone(this.connections()), junctions: structuredClone(this.junctions()), datasets: structuredClone(this.datasets()) }; }
  private commit(before: State): void { if (JSON.stringify(before) === JSON.stringify(this.state())) return; this.history.push(before); this.history = this.history.slice(-60); this.future = []; }
  private snapshot(): void { this.history.push(this.state()); this.history = this.history.slice(-60); this.future = []; }
  beginDataEdit(): void { if (!this.dataEditBefore) this.dataEditBefore=this.state(); }
  endDataEdit(): void { if (this.dataEditBefore) this.commit(this.dataEditBefore); this.dataEditBefore=null; }
  undo(): void { const state = this.history.pop(); if (!state) return; this.future.push(this.state()); this.items.set(state.items); this.connections.set(state.connections); this.junctions.set(state.junctions || []); this.datasetStore.replace(state.datasets || []); }
  redo(): void { const state = this.future.pop(); if (!state) return; this.history.push(this.state()); this.items.set(state.items); this.connections.set(state.connections); this.junctions.set(state.junctions || []); this.datasetStore.replace(state.datasets || []); }
  setTool(tool: Tool): void { this.finishEditing(); this.tool.set(tool); this.paletteOpen.set(tool === 'add'); this.pendingType.set(tool === 'shape' ? 'shape' : null); if (tool !== 'sketch') this.sketchEraser.set(false); else this.selectedIds.set([]); this.pendingAsset.set(null); this.mediaPicker.set(null); this.connectionSourceId.set(null); this.connectionTargetId.set(null); }
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
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? this.redo() : this.undo(); return; }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); this.redo(); return; }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') { event.preventDefault(); this.duplicate(); return; }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'g') { event.preventDefault(); event.shiftKey ? this.ungroupSelected() : this.groupSelected(); return; }
    if (event.key === 'Delete' || event.key === 'Backspace') { if (this.selectedConnectionId()) this.removeSelectedConnection(); else this.removeSelected(); return; }
    if (event.key === 'Escape') { if (this.cropId()) this.finishCrop(false); else if (this.editingId()) this.finishEditing(); else if (this.pendingAsset()) this.pendingAsset.set(null); else if (this.mediaPicker()) this.mediaPicker.set(null); else if (this.pendingType()) this.pendingType.set(null); else if (this.paletteOpen()) this.paletteOpen.set(false); else this.selectedIds.set([]); this.connectionSourceId.set(null); return; }
    if (event.key === 'Enter' && this.cropId()) { this.finishCrop(true); return; }
    if (event.key === 'Enter' && this.selected()?.type === 'shape') { event.preventDefault(); this.startEditing(this.selected()!.id); return; }
    const keys: Record<string, Tool> = { v: 'select', h: 'hand', t: 'text', n: 'add', c: 'connect', s: 'shape', p: 'sketch' };
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
    else if (this.pendingType()) { this.session = { kind: 'place', pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, x: point.x, y: point.y }; if (this.pendingType() === 'zone' || this.pendingType() === 'shape') this.placement.set({ x: point.x, y: point.y, width: 0, height: 0 }); }
    else if (this.tool() === 'text') { this.createAt('text', point); return; }
    else if (this.tool() === 'sketch') { this.session = { kind: this.sketchEraser() ? 'erase' : 'sketch', pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, x: point.x, y: point.y }; if (this.sketchEraser()) { this.snapshot(); this.eraseSketchAt(point); } else this.sketchPoints.set([{ ...point, pressure: event.pressure || .5 }]); }
    else if (this.tool() === 'select') { this.finishEditing(); this.selectedConnectionId.set(null); if (!event.shiftKey) this.selectedIds.set([]); this.session = event.pointerType === 'touch' ? { kind: 'pan', pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, x: this.panX(), y: this.panY() } : { kind: 'marquee', pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, x: point.x, y: point.y }; }
    else if (this.tool() === 'connect') this.connectionSourceId.set(null);
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }
  itemPointerDown(event: PointerEvent, item: CanvasItem): void {
    if (event.button !== 0 || (event.target as HTMLElement).closest('button, input, a, [contenteditable="true"]')) return;
    event.stopPropagation();
    this.selectedConnectionId.set(null);
    if (this.tool() === 'shape') return;
    if (item.type === 'sketch' && this.tool() === 'select') {
      const point = this.point(event.clientX, event.clientY), angle = -(item.rotation || 0) * Math.PI / 180;
      const dx = point.x - item.x - item.width / 2, dy = point.y - item.y - item.height / 2;
      const local = { x: (dx * Math.cos(angle) - dy * Math.sin(angle) + item.width / 2) * (item.sourceWidth || item.width) / item.width, y: (dx * Math.sin(angle) + dy * Math.cos(angle) + item.height / 2) * (item.sourceHeight || item.height) / item.height };
      const stroke = item.sketchStrokes?.[0];
      if (stroke && distanceToStroke(local, stroke) > Math.max(10 / this.zoom(), brushDiameter(stroke.brush, stroke.size) / 2 + 4)) { this.selectedIds.set([]); return; }
    }
    if (this.cropId() === item.id) { this.session = { kind: 'crop', pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, x: item.cropX || 0, y: item.cropY || 0, itemId: item.id }; (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId); return; }
    if (this.spaceHeld() || this.tool() === 'hand') { this.session = { kind: 'pan', pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, x: this.panX(), y: this.panY() }; this.isPanning.set(true); }
    else if (this.tool() === 'connect') { if (item.type === 'chart') return; const source = this.connectionSourceId(); if (source && source !== item.id) { this.snapshot(); this.connections.update((connections) => [...connections, { id: crypto.randomUUID(), sourceId: source, targetId: item.id, sourceBinding: { mode: 'auto' }, targetBinding: { mode: 'auto' }, direction: 'forward', kind: this.connectorKind() }]); this.setTool('select'); } else { this.connectionSourceId.set(item.id); this.selectedIds.set([item.id]); } return; }
    else { this.finishEditing(); const current = this.selectedIds(); const members = item.groupId ? this.items().filter(entry => entry.groupId === item.groupId).map(entry => entry.id) : [item.id]; this.selectedIds.set(event.shiftKey ? (current.includes(item.id) ? current.filter(id => !members.includes(id)) : [...new Set([...current, ...members])]) : current.includes(item.id) ? current : members); if (event.shiftKey || this.tool() !== 'select' || item.locked) return; const moving = new Set(this.selectedIds()); let changed = true; while (changed) { changed = false; for (const child of this.items()) if (child.parentId && moving.has(child.parentId) && !moving.has(child.id)) { moving.add(child.id); changed = true; } } const origins = new Map(this.items().filter(entry => moving.has(entry.id)).map(entry => [entry.id, { x: entry.x, y: entry.y }])); this.session = { kind: 'move', pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, x: item.x, y: item.y, itemId: item.id, origins, before: this.state() }; }
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }
  resizeDown(event: PointerEvent, item: CanvasItem, corner: 'nw' | 'ne' | 'sw' | 'se' = 'se'): void { event.stopPropagation(); this.session = { kind: 'resize', pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, x: item.width, y: item.height, itemId: item.id, corner, before: this.state() }; (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId); }
  rotateDown(event: PointerEvent, item: CanvasItem): void { event.stopPropagation(); const point = this.point(event.clientX, event.clientY); const angle = Math.atan2(point.y - item.y - item.height / 2, point.x - item.x - item.width / 2); this.session = { kind: 'rotate', pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, x: angle, y: item.rotation || 0, itemId: item.id, before: this.state() }; (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId); }
  rotateGroupDown(event: PointerEvent): void { event.stopPropagation(); const bounds = this.groupBounds(); if (!bounds) return; const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }, point = this.point(event.clientX, event.clientY); this.session = { kind: 'rotate', pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, x: Math.atan2(point.y - center.y, point.x - center.x), y: 0, groupCenter: center, groupIds: [...this.selectedIds()], before: this.state() }; (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId); }
  connectDown(event: PointerEvent, item: CanvasItem, side: ConnectorSide = 'right'): void { event.preventDefault(); event.stopPropagation(); const anchor = sidePoint(item, side); this.session = { kind: 'connect', pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, x: anchor.x, y: anchor.y, itemId: item.id, side }; this.connectionPreview.set({ x1: anchor.x, y1: anchor.y, x2: anchor.x, y2: anchor.y }); (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId); }
  selectConnection(event: PointerEvent, connection: CanvasConnection): void { if (this.tool() !== 'select' && this.tool() !== 'connect') return; event.stopPropagation(); this.selectedIds.set([]); this.selectedConnectionId.set(connection.id); }
  private pathPoint(connection: CanvasConnection, ratio: number): {x:number;y:number} {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', this.connectionPath(connection));
    const point = path.getPointAtLength(path.getTotalLength() * Math.max(0, Math.min(1, ratio)));
    return { x: point.x, y: point.y };
  }
  junctionPoint(junction: CanvasJunction): {x:number;y:number} { const parent=this.connections().find(entry=>entry.id===junction.parentConnectorId); return parent?this.pathPoint(parent,junction.positionRatio):{x:0,y:0}; }
  private nearestOnConnection(connection: CanvasConnection, point: {x:number;y:number}): {connectionId:string;ratio:number;x:number;y:number;distance:number} {
    const path=document.createElementNS('http://www.w3.org/2000/svg','path'); path.setAttribute('d',this.connectionPath(connection));
    const length=path.getTotalLength(); let best={connectionId:connection.id,ratio:0,x:0,y:0,distance:Infinity};
    const steps=Math.max(24,Math.ceil(length/8));
    for(let i=0;i<=steps;i++){ const ratio=i/steps, p=path.getPointAtLength(length*ratio), distance=Math.hypot(point.x-p.x,point.y-p.y); if(distance<best.distance) best={connectionId:connection.id,ratio,x:p.x,y:p.y,distance}; }
    return best;
  }
  private joinCandidate(point:{x:number;y:number}, excludeId?:string) { let best:ReturnType<CanvasPage['nearestOnConnection']>|null=null; for(const connection of this.visibleConnections()) { if(connection.id===excludeId || this.dependsOn(connection.id,excludeId)) continue; const candidate=this.nearestOnConnection(connection,point); if(candidate.distance<14/this.zoom() && (!best||candidate.distance<best.distance)) best=candidate; } return best; }
  private dependsOn(id:string,ancestor?:string,seen=new Set<string>()):boolean { if(!ancestor||seen.has(id)) return false; if(id===ancestor) return true; seen.add(id); const connection=this.connections().find(entry=>entry.id===id); return !!connection && [connection.sourceJunctionId,connection.targetJunctionId].some(jid=>{const parent=this.junctions().find(j=>j.id===jid)?.parentConnectorId; return !!parent&&this.dependsOn(parent,ancestor,seen);}); }
  private getOrCreateJunction(candidate:{connectionId:string;ratio:number;x:number;y:number}):CanvasJunction { const existing=this.junctions().find(j=>j.parentConnectorId===candidate.connectionId&&Math.hypot(this.junctionPoint(j).x-candidate.x,this.junctionPoint(j).y-candidate.y)<12/this.zoom()); if(existing) return existing; const junction={id:crypto.randomUUID(),parentConnectorId:candidate.connectionId,positionRatio:candidate.ratio}; this.junctions.update(entries=>[...entries,junction]); return junction; }
  connectionHover(event:PointerEvent,connection:CanvasConnection):void { if(this.session||this.editingId()||(this.tool()!=='select'&&this.tool()!=='connect')) return; const candidate=this.nearestOnConnection(connection,this.point(event.clientX,event.clientY)); this.junctionCandidate.set(candidate); }
  connectionLeave(connection:CanvasConnection):void { if(!this.session&&this.junctionCandidate()?.connectionId===connection.id) this.junctionCandidate.set(null); }
  branchDown(event:PointerEvent,connection:CanvasConnection):void { if(this.tool()!=='select'&&this.tool()!=='connect') return; event.preventDefault(); event.stopPropagation(); const candidate=this.nearestOnConnection(connection,this.point(event.clientX,event.clientY)); this.junctionCandidate.set(candidate); this.session={kind:'branch',pointerId:event.pointerId,clientX:event.clientX,clientY:event.clientY,x:candidate.x,y:candidate.y,connectionId:connection.id,ratio:candidate.ratio}; this.connectionPreview.set({x1:candidate.x,y1:candidate.y,x2:candidate.x,y2:candidate.y}); (event.currentTarget as Element).setPointerCapture(event.pointerId); }
  junctionDown(event:PointerEvent,junction:CanvasJunction):void { event.preventDefault(); event.stopPropagation(); const point=this.junctionPoint(junction); if(this.tool()==='connect'){this.session={kind:'branch',pointerId:event.pointerId,clientX:event.clientX,clientY:event.clientY,x:point.x,y:point.y,connectionId:junction.parentConnectorId,junctionId:junction.id}; this.connectionPreview.set({x1:point.x,y1:point.y,x2:point.x,y2:point.y});} else {this.session={kind:'junction-slide',pointerId:event.pointerId,clientX:event.clientX,clientY:event.clientY,x:point.x,y:point.y,junctionId:junction.id,connectionId:junction.parentConnectorId,before:this.state()};} (event.currentTarget as Element).setPointerCapture(event.pointerId); }
  endpoint(connection: CanvasConnection, terminal: 'source' | 'target'): {x:number;y:number} { const ends=this.connectionEnds(connection); return terminal === 'source' ? ends.a : ends.b; }
  rebindDown(event: PointerEvent, connection: CanvasConnection, terminal: 'source' | 'target'): void {
    event.preventDefault(); event.stopPropagation(); this.selectedIds.set([]); this.selectedConnectionId.set(connection.id);
    const end=this.endpoint(connection, terminal);
    this.session={kind:'rebind',pointerId:event.pointerId,clientX:event.clientX,clientY:event.clientY,x:end.x,y:end.y,connectionId:connection.id,terminal};
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
  }
  routeHandle(connection: CanvasConnection): {x:number;y:number} { const {a,b,source,target}=this.connectionEnds(connection), horizontal=this.horizontalConnection(source,target); return horizontal?{x:(a.x+b.x)/2+(connection.routeOffset||0),y:(a.y+b.y)/2}:{x:(a.x+b.x)/2,y:(a.y+b.y)/2+(connection.routeOffset||0)}; }
  routeDown(event: PointerEvent, connection: CanvasConnection): void { event.preventDefault(); event.stopPropagation(); const {source,target}=this.connectionEnds(connection), horizontal=this.horizontalConnection(source,target); this.session={kind:'route',pointerId:event.pointerId,clientX:event.clientX,clientY:event.clientY,x:connection.routeOffset||0,y:horizontal?1:0,connectionId:connection.id,before:this.state()}; (event.currentTarget as Element).setPointerCapture(event.pointerId); }
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
    if (session.kind === 'rotate' && session.groupCenter && session.groupIds && session.before) {
      const center = session.groupCenter, point = this.point(event.clientX, event.clientY);
      let delta = Math.atan2(point.y - center.y, point.x - center.x) - session.x;
      if (event.shiftKey) delta = Math.round(delta * 180 / Math.PI / 15) * 15 * Math.PI / 180;
      const selected = new Set(session.groupIds), before = new Map(session.before.items.map(item => [item.id, item]));
      this.items.update(items => items.map(item => { const original = before.get(item.id); if (!selected.has(item.id) || !original) return item; const dx = original.x + original.width / 2 - center.x, dy = original.y + original.height / 2 - center.y; return { ...item, x: center.x + dx * Math.cos(delta) - dy * Math.sin(delta) - original.width / 2, y: center.y + dx * Math.sin(delta) + dy * Math.cos(delta) - original.height / 2, rotation: (original.rotation || 0) + delta * 180 / Math.PI }; }));
      this.queueTransformSync();
    }
    if (session.kind === 'marquee') { const point = this.point(event.clientX, event.clientY); this.marquee.set({ x: Math.min(session.x, point.x), y: Math.min(session.y, point.y), width: Math.abs(point.x - session.x), height: Math.abs(point.y - session.y) }); }
    if (session.kind === 'place' && (this.pendingType() === 'zone' || this.pendingType() === 'shape')) { const point = this.point(event.clientX, event.clientY); this.placement.set({ x: Math.min(session.x, point.x), y: Math.min(session.y, point.y), width: Math.abs(point.x - session.x), height: Math.abs(point.y - session.y) }); }
    if (session.kind === 'crop' && session.itemId) this.update(session.itemId, { cropX: session.x + dx / this.zoom(), cropY: session.y + dy / this.zoom() });
    if (session.kind === 'connect' || session.kind === 'branch') { const point = this.point(event.clientX, event.clientY); const sourceId=session.itemId || this.connections().find(c=>c.id===session.connectionId)?.sourceId || ''; const target = this.connectorTarget(point, sourceId); const precise = target ? nearestPerimeter(target, point) : null; const isPrecise = !!precise && precise.distance <= 12 / this.zoom(); const join=target?null:this.joinCandidate(point,session.connectionId); const end = target ? isPrecise ? precise!.point : perimeterPoint(target, {x:session.x,y:session.y}) : join || point; this.connectionTargetId.set(target?.id || null); this.precisePreview.set(isPrecise ? end : null); this.junctionCandidate.set(join); this.connectionPreview.set({ x1: session.x, y1: session.y, x2: end.x, y2: end.y }); }
    if (session.kind === 'route' && session.connectionId) this.connections.update(entries=>entries.map(entry=>entry.id===session.connectionId?{...entry,routeOffset:session.x+(session.y?dx:dy)/this.zoom()}:entry));
    if (session.kind === 'rebind' && session.connectionId) { const connection=this.connections().find(entry=>entry.id===session.connectionId); if (connection) { const point=this.point(event.clientX,event.clientY), other=this.endpoint(connection,session.terminal==='source'?'target':'source'), target=this.connectorTarget(point,session.terminal==='source'?connection.targetId:connection.sourceId), precise=target?nearestPerimeter(target,point):null, isPrecise=!!precise&&precise.distance<=12/this.zoom(), end=target?(isPrecise?precise!.point:perimeterPoint(target,other)):point; this.connectionTargetId.set(target?.id||null); this.precisePreview.set(isPrecise?end:null); this.connectionPreview.set({x1:other.x,y1:other.y,x2:end.x,y2:end.y}); } }
    if (session.kind === 'junction-slide' && session.junctionId && session.connectionId) { const parent=this.connections().find(c=>c.id===session.connectionId); if(parent){const candidate=this.nearestOnConnection(parent,this.point(event.clientX,event.clientY)); this.junctions.update(entries=>entries.map(j=>j.id===session.junctionId?{...j,positionRatio:candidate.ratio}:j));} }
    if (session.kind === 'sketch') { const point = this.point(event.clientX, event.clientY); const last = this.sketchPoints().at(-1); if (!last || Math.hypot(point.x - last.x, point.y - last.y) > 1.5) this.sketchPoints.update(points => [...points, { ...point, pressure: event.pressure || .5 }]); }
    if (session.kind === 'erase') this.eraseSketchAt(this.point(event.clientX, event.clientY));
  }
  pointerUp(event: PointerEvent): void {
    this.pointers.delete(event.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    const session = this.session;
    if (session?.pointerId !== event.pointerId) return;
    this.transformGuide.set(null);
    if (session?.kind === 'marquee' && this.marquee()) {
      const rect = this.marquee()!;
      if (rect.width > 4 || rect.height > 4) this.selectedIds.set(this.visibleItems().filter(item => item.x < rect.x + rect.width && item.x + item.width > rect.x && item.y < rect.y + rect.height && item.y + item.height > rect.y).map(item => item.id));
    }
    if (session?.kind === 'place' && this.pendingType()) {
      const box = this.placement();
      this.createAt(this.pendingType()!, { x: box?.width && box.width > 10 ? box.x : session.x, y: box?.height && box.height > 10 ? box.y : session.y }, box?.width && box.width > 10 ? box : undefined);
      this.pendingType.set(null);
    }
    if (session?.kind === 'connect' && session.itemId) {
      const point = this.point(event.clientX, event.clientY);
      const target = this.connectorTarget(point, session.itemId);
      if (target) { this.snapshot(); this.connections.update(connections => [...connections, { id: crypto.randomUUID(), sourceId: session.itemId!, targetId: target.id, sourceBinding: { mode: 'auto' }, targetBinding: { mode: 'auto' }, direction: 'forward', kind: this.connectorKind() }]); }
      else { const join=this.joinCandidate(point); if(join){const parent=this.connections().find(c=>c.id===join.connectionId)!; this.snapshot(); const junction=this.getOrCreateJunction(join); this.connections.update(entries=>[...entries,{id:crypto.randomUUID(),sourceId:session.itemId!,targetId:parent.targetId,targetJunctionId:junction.id,sourceBinding:{mode:'auto'},direction:'forward',kind:this.connectorKind()}]);} }
    }
    if(session?.kind==='branch' && session.connectionId && session.moved){const parent=this.connections().find(c=>c.id===session.connectionId), point=this.point(event.clientX,event.clientY); if(parent){const target=this.connectorTarget(point,parent.sourceId), join=target?null:this.joinCandidate(point,parent.id); if(target||join){this.snapshot(); const origin=session.junctionId?this.junctions().find(j=>j.id===session.junctionId):this.getOrCreateJunction({connectionId:parent.id,ratio:session.ratio!,x:session.x,y:session.y}); if(origin){const other=join?this.connections().find(c=>c.id===join.connectionId):null; const destination=join?this.getOrCreateJunction(join):null; this.connections.update(entries=>[...entries,{id:crypto.randomUUID(),sourceId:parent.sourceId,sourceJunctionId:origin.id,targetId:target?.id||other!.targetId,targetJunctionId:destination?.id,direction:'forward',kind:this.connectorKind()}]);}}} }
    if(session?.kind==='branch' && !session.moved && session.connectionId) this.selectedConnectionId.set(session.connectionId);
    if (session?.kind === 'rebind' && session.connectionId && session.terminal) {
      const connection=this.connections().find(entry=>entry.id===session.connectionId);
      if (connection) { const point=this.point(event.clientX,event.clientY), otherId=session.terminal==='source'?connection.targetId:connection.sourceId, target=this.connectorTarget(point,otherId);
        if (target) { this.snapshot(); this.connections.update(entries=>entries.map(entry=>entry.id===connection.id?(session.terminal==='source'?{...entry,sourceId:target.id,sourceJunctionId:undefined,sourceBinding:{mode:'auto'}}:{...entry,targetId:target.id,targetJunctionId:undefined,targetBinding:{mode:'auto'}}):entry)); }
        else { const join=this.joinCandidate(point,connection.id); if(join){const parent=this.connections().find(c=>c.id===join.connectionId)!; this.snapshot(); const junction=this.getOrCreateJunction(join); this.connections.update(entries=>entries.map(entry=>entry.id===connection.id?(session.terminal==='source'?{...entry,sourceId:parent.sourceId,sourceJunctionId:junction.id}:{...entry,targetId:parent.targetId,targetJunctionId:junction.id}):entry));} }
      }
    }
    if (session?.before && ['move', 'resize', 'rotate'].includes(session.kind)) {
      if (session.kind === 'resize' && session.itemId && this.items().find(entry => entry.id === session.itemId)?.type === 'text') this.update(session.itemId, { textAutoSize: false });
      if (session.kind === 'move' && session.moved && session.itemId) this.reparent(session.itemId);
      this.commit(session.before);
    }
    if (session?.kind === 'route' && session.before) this.commit(session.before);
    if (session?.kind === 'junction-slide' && session.before) this.commit(session.before);
    if (session?.kind === 'sketch') this.finishSketch();
    this.session = null; this.sketchPoints.set([]); this.marquee.set(null); this.snapGuide.set(null); this.placement.set(null); this.connectionPreview.set(null); this.connectionTargetId.set(null); this.precisePreview.set(null); this.junctionCandidate.set(null); this.isPanning.set(false);
    const target = event.currentTarget as HTMLElement;
    if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
  }
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
  duplicate(): void { if (!this.selectedIds().length) return; const selected = this.items().filter(item => this.selectedIds().includes(item.id)); const ids = new Map(selected.map(item => [item.id, crypto.randomUUID()])); const groups = new Map(selected.filter(item => item.groupId).map(item => [item.groupId!, crypto.randomUUID()])); const copies = selected.map(item => ({ ...structuredClone(item), id: ids.get(item.id)!, groupId: item.groupId ? groups.get(item.groupId) : undefined, parentId: item.parentId && ids.has(item.parentId) ? ids.get(item.parentId)! : item.parentId, x: item.x + 24, y: item.y + 24 })); this.snapshot(); this.items.update(items => [...items, ...copies]); this.selectedIds.set(copies.map(item => item.id)); }
  groupSelected(): void { if (this.selectedIds().length < 2) return; const id = crypto.randomUUID(), selected = new Set(this.selectedIds()); this.snapshot(); this.items.update(items => items.map(item => selected.has(item.id) ? { ...item, groupId: id } : item)); }
  ungroupSelected(): void { const groups = new Set(this.items().filter(item => this.selectedIds().includes(item.id) && item.groupId).map(item => item.groupId)); if (!groups.size) return; this.snapshot(); this.items.update(items => items.map(item => item.groupId && groups.has(item.groupId) ? { ...item, groupId: undefined } : item)); }
  quickConnectedShape(source: CanvasItem): void {
    const now = new Date().toISOString();
    const item: CanvasItem = { id: crypto.randomUUID(), type: 'shape', shapeKind: source.shapeKind || 'rectangle', shapeFill: source.shapeFill || '#ffffff', shapeStroke: source.shapeStroke || '#6b7280', shapeStrokeWidth: source.shapeStrokeWidth || 1, parentId: source.parentId, x: source.x + source.width + 100, y: source.y, width: source.width, height: source.height, title: '', rotation: 0, zIndex: Math.max(1, ...this.items().map(entry => entry.zIndex || 1)) + 1, createdAt: now, updatedAt: now };
    this.snapshot(); this.items.update(items => [...items, item]); this.connections.update(connections => [...connections, { id: crypto.randomUUID(), sourceId: source.id, targetId: item.id, direction: 'forward', kind: this.connectorKind() }]); this.selectedIds.set([item.id]); queueMicrotask(() => this.startEditing(item.id));
  }
  removeSelected(): void { const ids = this.selectedIds(); if (!ids.length) return; this.snapshot(); const removed = new Set(ids); let changed = true; while (changed) { changed = false; for (const item of this.items()) if (item.parentId && removed.has(item.parentId) && !removed.has(item.id)) { removed.add(item.id); changed = true; } } this.items.update((items) => items.filter((item) => !removed.has(item.id))); this.removeConnectionGraph(new Set(this.connections().filter(c=>removed.has(c.sourceId)||removed.has(c.targetId)).map(c=>c.id))); this.selectedIds.set([]); }
  removeSelectedConnection(): void { const id=this.selectedConnectionId(); if (!id) return; this.snapshot(); this.removeConnectionGraph(new Set([id])); this.selectedConnectionId.set(null); }
  private removeConnectionGraph(removed:Set<string>):void {let changed=true; while(changed){changed=false; for(const connection of this.connections()){const parents=[connection.sourceJunctionId,connection.targetJunctionId].map(id=>this.junctions().find(j=>j.id===id)?.parentConnectorId); if(!removed.has(connection.id)&&parents.some(id=>id&&removed.has(id))){removed.add(connection.id);changed=true;}}} this.connections.update(entries=>entries.filter(c=>!removed.has(c.id))); this.junctions.update(entries=>entries.filter(j=>!removed.has(j.parentConnectorId)));}
  private connectorTarget(point: {x:number;y:number}, sourceId: string): CanvasItem | undefined {
    return [...this.items()].reverse().find(item => item.id !== sourceId && item.type !== 'workspace' && item.type !== 'frame' && item.type !== 'zone' && item.type !== 'chart' && (containsShape(item, point) || nearestPerimeter(item, point).distance <= 16 / this.zoom()));
  }
  private horizontalConnection(source: CanvasItem,target: CanvasItem): boolean { return Math.abs(target.x+target.width/2-source.x-source.width/2)-(source.width+target.width)/2 >= Math.abs(target.y+target.height/2-source.y-source.height/2)-(source.height+target.height)/2; }
  private connectionEnds(connection: CanvasConnection): { a: { x: number; y: number }; b: { x: number; y: number }; source: CanvasItem; target: CanvasItem } {
    const source = this.items().find(item => item.id === connection.sourceId)!;
    const target = this.items().find(item => item.id === connection.targetId)!;
    const sourceCenter = {x:source.x+source.width/2,y:source.y+source.height/2};
    const targetCenter = {x:target.x+target.width/2,y:target.y+target.height/2};
    const dx=targetCenter.x-sourceCenter.x, dy=targetCenter.y-sourceCenter.y;
    const horizontal=this.horizontalConnection(source,target);
    const sourceSide: ConnectorSide=horizontal?(dx>=0?'right':'left'):(dy>=0?'bottom':'top');
    const targetSide: ConnectorSide=horizontal?(dx>=0?'left':'right'):(dy>=0?'top':'bottom');
    const orthogonal=connection.kind==='elbow' || connection.kind==='curved';
    const sourceJunction=this.junctions().find(j=>j.id===connection.sourceJunctionId);
    const targetJunction=this.junctions().find(j=>j.id===connection.targetJunctionId);
    const junctionA=sourceJunction?this.junctionPoint(sourceJunction):null, junctionB=targetJunction?this.junctionPoint(targetJunction):null;
    const a = junctionA || (connection.sourceBinding?.mode === 'precise' && connection.sourceBinding.anchor ? world(source, connection.sourceBinding.anchor) : orthogonal && !junctionB ? sidePoint(source,sourceSide) : perimeterPoint(source,junctionB || targetCenter));
    const b = junctionB || (connection.targetBinding?.mode === 'precise' && connection.targetBinding.anchor ? world(target, connection.targetBinding.anchor) : orthogonal && !junctionA ? sidePoint(target,targetSide) : perimeterPoint(target,junctionA || sourceCenter));
    return { a, b, source, target };
  }
  connectionPath(connection: CanvasConnection): string {
    const { a, b, source, target } = this.connectionEnds(connection);
    if (!connection.kind || connection.kind === 'straight') return `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
    const horizontal = this.horizontalConnection(source,target);
    if (connection.kind === 'elbow') {
      if (horizontal) { const mx=(a.x+b.x)/2+(connection.routeOffset||0); return `M ${a.x} ${a.y} L ${mx} ${a.y} L ${mx} ${b.y} L ${b.x} ${b.y}`; }
      const my=(a.y+b.y)/2+(connection.routeOffset||0); return `M ${a.x} ${a.y} L ${a.x} ${my} L ${b.x} ${my} L ${b.x} ${b.y}`;
    }
    const bend = Math.min(90, Math.max(24, (horizontal ? Math.abs(b.x-a.x) : Math.abs(b.y-a.y))*.35));
    if (horizontal) { const sign=Math.sign(b.x-a.x)||1; return `M ${a.x} ${a.y} C ${a.x+sign*bend} ${a.y}, ${b.x-sign*bend} ${b.y}, ${b.x} ${b.y}`; }
    const sign=Math.sign(b.y-a.y)||1; return `M ${a.x} ${a.y} C ${a.x} ${a.y+sign*bend}, ${b.x} ${b.y-sign*bend}, ${b.x} ${b.y}`;
  }
  previewPath(preview: { x1: number; y1: number; x2: number; y2: number }): string {
    const { x1, y1, x2, y2 } = preview;
    if (this.connectorKind() === 'elbow') { const mid = (x1 + x2) / 2; return `M ${x1} ${y1} L ${mid} ${y1} L ${mid} ${y2} L ${x2} ${y2}`; }
    if (this.connectorKind() === 'curved') { const bend = Math.max(40, Math.abs(x2 - x1) * .45), direction = Math.sign(x2 - x1 || 1); return `M ${x1} ${y1} C ${x1 + direction * bend} ${y1}, ${x2 - direction * bend} ${y2}, ${x2} ${y2}`; }
    return `M ${x1} ${y1} L ${x2} ${y2}`;
  }
  connectionLabelX(connection: CanvasConnection): number { const a = this.items().find((item) => item.id === connection.sourceId)!; const b = this.items().find((item) => item.id === connection.targetId)!; return (a.x + a.width + b.x) / 2; }
  connectionLabelY(connection: CanvasConnection): number { const a = this.items().find((item) => item.id === connection.sourceId)!; const b = this.items().find((item) => item.id === connection.targetId)!; return (a.y + a.height / 2 + b.y + b.height / 2) / 2 - 12; }
  private reparent(id: string): void { const item = this.items().find(entry => entry.id === id); if (!item || item.type === 'zone' || item.type === 'workspace' || item.type === 'frame') return; const x = item.x + item.width / 2, y = item.y + item.height / 2; const zone = [...this.items()].reverse().find(entry => (entry.type === 'zone' || entry.type === 'frame') && entry.id !== id && x >= entry.x && x <= entry.x + entry.width && y >= entry.y && y <= entry.y + entry.height); if (zone) this.update(id, { parentId: zone.id }); else if (['zone', 'frame'].includes(this.items().find(entry => entry.id === item.parentId)?.type || '')) this.update(id, { parentId: null }); }
  createAt(type: ItemType, point: { x: number; y: number }, box?: { width: number; height: number }): void {
    if (type === 'file' || type === 'voice') { this.replaceId = null; this.imagePlacement = point; this.fileInput()?.nativeElement.click(); return; }
    const viewport = this.viewport()?.nativeElement;
    const mobile = !!viewport && viewport.clientWidth <= 700;
    const visibleWidth = viewport ? viewport.clientWidth / this.zoom() : 390;
    const width = Math.max(100, box?.width || (type === 'shape' ? 180 : type === 'zone' || type === 'frame' ? 420 : type === 'budget' ? 320 : type === 'table' ? 390 : type === 'chart' ? 390 : type === 'image' ? 340 : type === 'list' ? 300 : type === 'task' ? 280 : type === 'link' ? 320 : type === 'text' ? 180 : 260));
    const height = Math.max(40, box?.height || (type === 'shape' ? 110 : type === 'zone' || type === 'frame' ? 280 : type === 'budget' ? 172 : type === 'table' ? 180 : type === 'chart' ? 270 : type === 'image' ? 230 : type === 'task' ? 78 : type === 'list' ? 150 : type === 'link' ? 115 : type === 'text' ? 46 : 170));
    const placedWidth = mobile && !box ? Math.min(width, visibleWidth - 32 / this.zoom()) : width;
    const left = -this.panX() / this.zoom() + 16 / this.zoom();
    const x = mobile && !box ? Math.max(left, Math.min(point.x - placedWidth / 2, left + visibleWidth - 32 / this.zoom() - placedWidth)) : point.x;
    this.snapshot();
    const dataset = type === 'budget' ? this.datasetStore.create([{label:'Item',type:'text',key:'item'},{label:'Amount',type:'currency',key:'amount'},{label:'Category',type:'category',key:'category'}]) : type === 'table' ? this.datasetStore.create([{label:'Column 1',type:'text'},{label:'Column 2',type:'text'}]) : undefined;
    const chartSource = type === 'chart' ? this.datasets().find(data => this.canChart(data)) : undefined;
    const item: CanvasItem = { id: crypto.randomUUID(), type, parentId: null, x, y: point.y, width: placedWidth, height, title: '', body: '', datasetId: dataset?.id || chartSource?.id, chartConfig: type === 'chart' ? this.defaultChartConfig(chartSource) : undefined, budgetMode:type==='budget'?'simple':undefined, budgetCurrency:type==='budget'?'JOD':undefined, textAutoSize: type === 'text', accent: '#d4111c', shapeKind: type === 'shape' ? this.shapeKind() : undefined, shapeFill: type === 'shape' ? '#ffffff' : undefined, shapeStroke: type === 'shape' ? '#6b7280' : undefined, shapeStrokeWidth: type === 'shape' ? 1 : undefined, zoneType: type === 'zone' ? 'standard' : undefined, checklist: type === 'checklist' || type === 'list' ? [{ label: '', completed: false }] : undefined, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    this.items.update(items => [...items, item]); this.selectedIds.set([item.id]); this.tool.set('select');
    if (['note', 'text', 'task', 'zone', 'frame', 'link', 'list', 'budget', 'table', 'shape'].includes(type)) queueMicrotask(() => this.startEditing(item.id));
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
  setStyle(id: string, patch: Partial<CanvasItem>): void { const item = this.items().find(entry => entry.id === id); if (!item) return; this.snapshot(); this.update(id, item.type === 'sketch' && patch.accent ? { ...patch, sketchStrokes: item.sketchStrokes?.map(stroke => ({ ...stroke, color: patch.accent! })) } : patch); }
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
  dataset(item: CanvasItem): ThreadDataset | undefined { return this.datasetStore.get(item.datasetId); }
  dataSources(excludeId?: string): { item: CanvasItem; data: ThreadDataset }[] { return this.items().filter(item => ['budget','table'].includes(item.type) && item.id !== excludeId).flatMap(item => { const data=this.dataset(item); return data ? [{item,data}] : []; }); }
  private numericColumns(data?: ThreadDataset) { return data?.columns.filter(column => column.type === 'number' || column.type === 'currency') || []; }
  canChart(data?: ThreadDataset): boolean { return !!data && !!this.numericColumns(data).length && !!data.columns.find(column => ['text','category','date'].includes(column.type)); }
  canBudget(data?: ThreadDataset): boolean { return this.canChart(data); }
  private defaultChartConfig(data?: ThreadDataset): ChartConfig { const label=data?.columns.find(column=>['text','category','date'].includes(column.type)); const numbers=this.numericColumns(data), planned=data?.columns.find(column=>column.label==='Planned'), actual=data?.columns.find(column=>column.label==='Actual'); const series=planned&&actual?[planned.key,actual.key]:numbers.slice(0,2).map(column=>column.key); return { type:label?.type==='date'?'line':numbers.length>1?'comparison':'bar',categoryField:label?.key,valueField:planned?.key||numbers[0]?.key,series:numbers.length>1?series:undefined }; }
  money(value: number | string | null | undefined): string { return new Intl.NumberFormat('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(value)||0); }
  budgetItemField(data?: ThreadDataset): string { return data?.columns.find(column=>column.key==='item')?.key || data?.columns.find(column=>['text','category','date'].includes(column.type))?.key || 'item'; }
  budgetAmountField(data?: ThreadDataset): string { return data?.columns.find(column=>column.key==='amount')?.key || this.numericColumns(data)[0]?.key || 'amount'; }
  budgetCategoryField(data?: ThreadDataset): string { return data?.columns.find(column=>column.type==='category')?.key || 'category'; }
  budgetValue(data: ThreadDataset | undefined, key: string): number { return (data?.rows||[]).reduce((sum,row)=>sum+(Number(row.values[key])||0),0); }
  budgetUsed(item: CanvasItem): number { const data=this.dataset(item); return this.budgetValue(data,item.budgetMode==='project'?this.budgetField(data,'Actual'):this.budgetAmountField(data)); }
  chartSourceId(item: CanvasItem): string { return this.dataSources().find(source=>source.data.id===item.datasetId)?.item.id||''; }
  remaining(item: CanvasItem): number { return Math.max(0,(item.budgetTarget||0)-this.budgetUsed(item)); }
  usedPercent(item: CanvasItem): number { return item.budgetTarget ? Math.min(100,this.budgetUsed(item)/item.budgetTarget*100) : 0; }
  budgetHeight(item: CanvasItem): number { return Math.min(420,Math.max(172,128+(this.dataset(item)?.rows.length||0)*34+(item.budgetTarget?38:0))); }
  setBudgetCell(item: CanvasItem, rowId: string, key: string, event: Event): void { const data=this.dataset(item); if (!data) return; const column=data.columns.find(entry=>entry.key===key); const raw=(event.target as HTMLInputElement).value; const value=column?.type==='currency'||column?.type==='number'?Number(raw)||0:raw; if (data.rows.find(row=>row.id===rowId)?.values[key]===value) return; if (!this.dataEditBefore) this.snapshot(); this.datasetStore.updateCell(data.id,rowId,key,value); }
  budgetKey(event: KeyboardEvent, item: CanvasItem, rowId: string): void { if (event.key==='Escape') { const data=this.dataset(item), row=data?.rows.find(entry=>entry.id===rowId); if (row && !String(row.values[this.budgetItemField(data)]||'').trim() && !Number(row.values[this.budgetAmountField(data)]) && !Number(row.values[this.budgetField(data,'Planned')]) && !Number(row.values[this.budgetField(data,'Actual')])) { if (!this.dataEditBefore) this.snapshot(); this.datasetStore.deleteRow(item.datasetId!,rowId); } (event.target as HTMLInputElement).blur(); } else if (event.key==='Enter') { event.preventDefault(); (event.target as HTMLInputElement).blur(); } }
  addBudgetEntry(id: string): void { const item=this.items().find(entry=>entry.id===id), data=item&&this.dataset(item); if (!item||!data) return; this.snapshot(); const row=this.datasetStore.addRow(data.id,{[this.budgetItemField(data)]:'',[this.budgetAmountField(data)]:0,[this.budgetCategoryField(data)]:''}); this.update(id,{height:this.budgetHeight(item)}); queueMicrotask(()=>document.querySelector<HTMLInputElement>(`[data-budget-row="${row.id}"] input`)?.focus()); }
  deleteBudgetEntry(item: CanvasItem,rowId:string): void { if (!item.datasetId) return; this.snapshot(); this.datasetStore.deleteRow(item.datasetId,rowId); this.update(item.id,{height:this.budgetHeight(item)}); }
  setBudgetCurrency(item: CanvasItem,event: Event): void { this.setStyle(item.id,{budgetCurrency:(event.target as HTMLSelectElement).value as BudgetCurrency}); }
  setBudgetMode(item: CanvasItem,mode: BudgetMode): void { const data=this.dataset(item); if (!data||item.budgetMode===mode) return; this.snapshot(); if (mode==='project' && !data.columns.some(column=>column.label==='Planned')) { this.datasetStore.addColumn(data.id,'Planned','currency'); this.datasetStore.addColumn(data.id,'Actual','currency'); const updated=this.datasetStore.get(data.id)!; const planned=updated.columns.find(column=>column.label==='Planned')!,actual=updated.columns.find(column=>column.label==='Actual')!; for (const row of updated.rows) { this.datasetStore.updateCell(data.id,row.id,planned.key,Number(row.values[this.budgetAmountField(data)])||0); this.datasetStore.updateCell(data.id,row.id,actual.key,0); } } this.update(item.id,{budgetMode:mode,height:Math.min(420,this.budgetHeight(item)+(mode==='project'?42:0))}); }
  budgetField(data:ThreadDataset|undefined,label:string): string { return data?.columns.find(column=>column.label===label)?.key||label.toLowerCase(); }
  setBudgetTarget(item: CanvasItem,event: Event): void { const value=Number((event.target as HTMLInputElement).value); this.setStyle(item.id,{budgetTarget:value>0?value:undefined,height:value>0?Math.min(420,item.height+38):Math.max(172,item.height-38)}); }
  setLinkUrl(id: string, event: Event): void { const url = (event.target as HTMLInputElement).value.trim(); this.setStyle(id, { url, title: this.items().find(entry => entry.id === id)?.title || url }); }
  copy(): void { const ids = new Set(this.selectedIds()); this.clipboard = structuredClone(this.items().filter(item => ids.has(item.id))); }
  paste(): void { if (!this.clipboard.length) return; const groups = new Map(this.clipboard.filter(item => item.groupId).map(item => [item.groupId!, crypto.randomUUID()])); const copies = this.clipboard.map(item => ({ ...structuredClone(item), id: crypto.randomUUID(), groupId: item.groupId ? groups.get(item.groupId) : undefined, x: item.x + 24, y: item.y + 24 })); this.snapshot(); this.items.update(items => [...items, ...copies]); this.selectedIds.set(copies.map(item => item.id)); this.clipboard = structuredClone(copies); }
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
    const ordered = [...this.items()].sort((a, b) => (a.zIndex ?? (a.type === 'zone' || a.type === 'workspace' || a.type === 'frame' ? 0 : 1)) - (b.zIndex ?? (b.type === 'zone' || b.type === 'workspace' || b.type === 'frame' ? 0 : 1)));
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
    if (!this.sketchPoints().length) return;
    const stroke: SketchStroke = { id: crypto.randomUUID(), brush: this.brush(), points: this.sketchPoints().map(point => ({ x: point.x, y: point.y, pressure: point.pressure ?? .5 })), color: this.sketchColor(), size: this.brushWidth(), opacity: this.brushOpacity() };
    const bounds = strokeBounds([stroke]);
    const normalized = { ...stroke, points: stroke.points.map(point => ({ ...point, x: point.x - bounds.x, y: point.y - bounds.y })) };
    const item: CanvasItem = { id: stroke.id, type: 'sketch', parentId: null, x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, sourceWidth: bounds.width, sourceHeight: bounds.height, title: 'Stroke', sketchStrokes: [normalized], rotation: 0, zIndex: Math.max(1, ...this.items().map(entry => entry.zIndex || 1)) + 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    this.snapshot(); this.items.update(items => [...items, item]);
  }
  undoSketchStroke(): void { this.undo(); }
  redoSketchStroke(): void { this.redo(); }
  editSketch(id: string): void {
    const item = this.items().find(entry => entry.id === id); if (!item || item.type !== 'sketch') return;
    this.setTool('sketch'); this.editingSketchId.set(id);
    const angle = (item.rotation || 0) * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle);
    const strokes = item.sketchStrokes || (item.strokes || []).map((points, index): SketchStroke => ({ id: `${id}-${index}`, brush: 'pen', points: points.map(point => ({ x: point.x, y: point.y, pressure: point.pressure ?? .5 })), color: item.accent || '#d4111c', size: item.strokeWidth || 3, opacity: item.strokeOpacity || 1 }));
    this.activeSketchStrokes.set(strokes.map(stroke => ({ ...stroke, points: stroke.points.map(point => { const x = point.x * item.width / (item.sourceWidth || item.width) - item.width / 2, y = point.y * item.height / (item.sourceHeight || item.height) - item.height / 2; return { ...point, x: item.x + item.width / 2 + x * cos - y * sin, y: item.y + item.height / 2 + x * sin + y * cos }; }) })));
  }
  private completeSketch(): void {
    this.activeSketchStrokes.set([]); this.undoneSketchStrokes.set([]); this.editingSketchId.set(null);
  }
  tableColumns(item: CanvasItem) { return this.dataset(item)?.columns || []; }
  tableRows(item: CanvasItem) { return this.dataset(item)?.rows || []; }
  setTableHeader(item: CanvasItem, columnId: string, event: Event): void { const data=this.dataset(item); if (!data) return; const label=(event.target as HTMLInputElement).value.trim()||'Column'; this.snapshot(); this.datasetStore.renameColumn(data.id,columnId,label); if (/^(date|month|year|day)$/i.test(label)) this.datasetStore.setColumnType(data.id,columnId,'date'); }
  setTableColumnType(item: CanvasItem,columnId:string,event:Event): void { if (!item.datasetId) return; this.snapshot(); this.datasetStore.setColumnType(item.datasetId,columnId,(event.target as HTMLSelectElement).value as 'text'|'number'|'currency'|'date'|'category'); }
  setTableCell(item: CanvasItem, rowId: string, key: string, event: Event): void { const data=this.dataset(item); if (!data) return; const raw=(event.target as HTMLInputElement).value; const column=data.columns.find(entry=>entry.key===key); if (!this.dataEditBefore) this.snapshot(); if (column?.type==='text' && raw.trim() && Number.isFinite(Number(raw)) && (data.rows.every(row=>!String(row.values[key]||'').trim()||Number.isFinite(Number(row.values[key]))))) this.datasetStore.setColumnType(data.id,column.id,'number'); const numeric=this.datasetStore.get(data.id)?.columns.find(entry=>entry.key===key)?.type; this.datasetStore.updateCell(data.id,rowId,key,numeric==='number'||numeric==='currency'?Number(raw)||0:raw); }
  addTableRow(id: string): void { const item=this.items().find(entry=>entry.id===id); if (!item?.datasetId) return; this.snapshot(); this.datasetStore.addRow(item.datasetId); this.update(id,{height:Math.min(420,Math.max(item.height,126+this.tableRows(item).length*35))}); }
  addTableColumn(id: string): void { const item=this.items().find(entry=>entry.id===id); if (!item?.datasetId) return; this.snapshot(); this.datasetStore.addColumn(item.datasetId,`Column ${this.tableColumns(item).length+1}`); this.update(id,{width:item.width+120}); }
  removeTableRow(item: CanvasItem, rowId: string): void { if (!item.datasetId) return; this.snapshot(); this.datasetStore.deleteRow(item.datasetId,rowId); }
  removeTableColumn(item: CanvasItem, columnId: string): void { if (!item.datasetId||this.tableColumns(item).length<=1) return; this.snapshot(); this.datasetStore.deleteColumn(item.datasetId,columnId); }
  chartTypes(data?: ThreadDataset): ChartConfig['type'][] { if (!this.canChart(data)) return []; const numbers=this.numericColumns(data), dated=!!data?.columns.some(column=>column.type==='date'); return [...(dated?['line' as const]:[]),'bar',...(!dated?['donut' as const]:[]),...(numbers.length>1?['comparison' as const]:[])]; }
  createLinkedView(source: CanvasItem,type: 'budget'|'table'|'chart',chartType?:ChartConfig['type']): void { const data=this.dataset(source); if (!data || (type==='chart'&&!this.canChart(data)) || (type==='budget'&&!this.canBudget(data))) return; this.snapshot(); if (type==='budget'&&!data.columns.some(column=>column.type==='category')) this.datasetStore.addColumn(data.id,'Category','category'); const now=new Date().toISOString(); const item:CanvasItem={id:crypto.randomUUID(),type,parentId:source.parentId,x:source.x+source.width+28,y:source.y,width:type==='budget'?320:390,height:type==='budget'?172:type==='table'?180:270,title:'',datasetId:data.id,budgetMode:type==='budget'?'simple':undefined,budgetCurrency:type==='budget'?'JOD':undefined,chartConfig:type==='chart'?{...this.defaultChartConfig(data),type:chartType||this.defaultChartConfig(data).type}:undefined,zIndex:Math.max(1,...this.items().map(entry=>entry.zIndex||1))+1,createdAt:now,updatedAt:now}; this.items.update(items=>[...items,item]); this.selectedIds.set([item.id]); }
  linkChartSource(item: CanvasItem,event: Event): void { const sourceId=(event.target as HTMLSelectElement).value,source=this.items().find(entry=>entry.id===sourceId),data=source&&this.dataset(source); if (!data||!this.canChart(data)) return; this.setStyle(item.id,{datasetId:data.id,chartConfig:this.defaultChartConfig(data)}); }
  setChartConfig(item: CanvasItem,patch: Partial<ChartConfig>): void { this.setStyle(item.id,{chartConfig:{...this.defaultChartConfig(this.dataset(item)),...item.chartConfig,...patch}}); }
}
