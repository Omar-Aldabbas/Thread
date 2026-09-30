import { CommonModule, isPlatformBrowser } from '@angular/common';
import { AfterViewInit, Component, ElementRef, HostListener, PLATFORM_ID, computed, effect, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CanvasCard } from '../../components/canvas-card';
import { CanvasConnection, CanvasItem, ItemType, demoConnections, demoItems } from '../../canvas.model';

type Tool = 'select' | 'hand' | 'edit' | 'add' | 'connect';
type Session = { kind: 'pan' | 'move' | 'resize' | 'marquee'; pointerId: number; clientX: number; clientY: number; x: number; y: number; itemId?: string };
type State = { items: CanvasItem[]; connections: CanvasConnection[] };

@Component({ selector: 'app-canvas-page', standalone: true, imports: [CanvasCard, CommonModule], templateUrl: './canvas-page.html', styleUrl: './canvas-page.css' })
export class CanvasPage implements AfterViewInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
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

  readonly spaceName = computed(() => {
    if (!this.browser) return 'Thread development';
    try { const spaces = JSON.parse(localStorage.getItem('thread-spaces') || '[]') as { id: string; title: string }[]; return spaces.find((space) => space.id === this.spaceId)?.title || (this.spaceId === 'thread' ? 'Thread development' : 'Untitled space'); }
    catch { return 'Thread development'; }
  });
  readonly context = computed(() => this.items().find((item) => item.id === this.contextId()) || null);
  readonly breadcrumbs = computed(() => { const path: CanvasItem[] = []; let current = this.context(); while (current) { path.unshift(current); current = this.items().find((item) => item.id === current?.parentId) || null; } return path; });
  readonly visibleItems = computed(() => this.items().filter((item) => {
    const parent = this.items().find((entry) => entry.id === item.parentId);
    const inContext = item.parentId === this.contextId() || (this.contextId() === null && parent?.type === 'workspace');
    return inContext && (!this.search() || item.title.toLowerCase().includes(this.search().toLowerCase()));
  }));
  readonly visibleConnections = computed(() => this.connections().filter((connection) => this.visibleItems().some((item) => item.id === connection.sourceId) && this.visibleItems().some((item) => item.id === connection.targetId)));
  readonly selected = computed(() => this.items().find((item) => item.id === this.selectedIds()[0]) || null);
  readonly worldTransform = computed(() => `translate(${this.panX()}px, ${this.panY()}px) scale(${this.zoom()})`);
  readonly gridSize = computed(() => `${24 * this.zoom()}px ${24 * this.zoom()}px`);
  readonly gridPosition = computed(() => `${this.panX()}px ${this.panY()}px`);
  readonly zoomLabel = computed(() => `${Math.round(this.zoom() * 100)}%`);
  childCount(id: string): number { return this.items().filter((item) => item.parentId === id).length; }

  constructor() { effect(() => { if (this.browser) localStorage.setItem(this.storageKey, JSON.stringify({ items: this.items(), connections: this.connections() })); }); }
  ngAfterViewInit(): void { setTimeout(() => this.fitView()); }

  private read(): State {
    if (!this.browser) return { items: demoItems, connections: demoConnections };
    try { const stored = localStorage.getItem(this.storageKey); if (stored) return JSON.parse(stored); } catch { }
    return this.spaceId === 'thread' ? { items: demoItems, connections: demoConnections } : { items: [], connections: [] };
  }
  private snapshot(): void { this.history.push({ items: structuredClone(this.items()), connections: structuredClone(this.connections()) }); this.history = this.history.slice(-40); this.future = []; }
  undo(): void { const state = this.history.pop(); if (!state) return; this.future.push({ items: structuredClone(this.items()), connections: structuredClone(this.connections()) }); this.items.set(state.items); this.connections.set(state.connections); }
  redo(): void { const state = this.future.pop(); if (!state) return; this.history.push({ items: structuredClone(this.items()), connections: structuredClone(this.connections()) }); this.items.set(state.items); this.connections.set(state.connections); }
  setTool(tool: Tool): void { this.tool.set(tool); this.paletteOpen.set(tool === 'add'); if (tool !== 'add') this.pendingType.set(null); this.connectionSourceId.set(null); }

  @HostListener('window:keydown', ['$event'])
  keyDown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable) return;
    if (event.code === 'Space') { event.preventDefault(); this.spaceHeld.set(true); return; }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? this.redo() : this.undo(); return; }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') { event.preventDefault(); this.duplicate(); return; }
    if (event.key === 'Delete' || event.key === 'Backspace') { this.removeSelected(); return; }
    if (event.key === 'Escape') { this.selectedIds.set([]); this.connectionSourceId.set(null); this.setTool('select'); return; }
    const keys: Record<string, Tool> = { v: 'select', h: 'hand', e: 'edit', n: 'add', c: 'connect' };
    if (keys[event.key.toLowerCase()]) this.setTool(keys[event.key.toLowerCase()]);
  }
  @HostListener('window:keyup', ['$event']) keyUp(event: KeyboardEvent): void { if (event.code === 'Space') this.spaceHeld.set(false); }
  @HostListener('window:blur') blur(): void { this.spaceHeld.set(false); this.session = null; this.isPanning.set(false); }

  private point(clientX: number, clientY: number): { x: number; y: number } { const rect = this.viewport()?.nativeElement.getBoundingClientRect(); return { x: (clientX - (rect?.left || 0) - this.panX()) / this.zoom(), y: (clientY - (rect?.top || 0) - this.panY()) / this.zoom() }; }
  pointerDown(event: PointerEvent): void {
    if (event.button !== 0 && event.button !== 1) return;
    if ((event.target as HTMLElement).closest('[data-ui], [data-item]')) return;
    const point = this.point(event.clientX, event.clientY);
    if (event.button === 1 || this.spaceHeld() || this.tool() === 'hand') { this.session = { kind: 'pan', pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, x: this.panX(), y: this.panY() }; this.isPanning.set(true); }
    else if (this.tool() === 'select') { if (!event.shiftKey) this.selectedIds.set([]); this.session = { kind: 'marquee', pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, x: point.x, y: point.y }; this.marquee.set({ x: point.x, y: point.y, width: 0, height: 0 }); }
    else if (this.tool() === 'add' && this.pendingType()) { this.place(this.pendingType()!, point); return; }
    else if (this.tool() === 'connect') this.connectionSourceId.set(null);
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }
  itemPointerDown(event: PointerEvent, item: CanvasItem): void {
    if (event.button !== 0 || (event.target as HTMLElement).closest('button, input, a')) return;
    event.stopPropagation();
    if (this.spaceHeld() || this.tool() === 'hand') { this.session = { kind: 'pan', pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, x: this.panX(), y: this.panY() }; this.isPanning.set(true); }
    else if (this.tool() === 'connect') { const source = this.connectionSourceId(); if (source && source !== item.id) { this.snapshot(); this.connections.update((connections) => [...connections, { id: crypto.randomUUID(), sourceId: source, targetId: item.id, direction: 'forward' }]); this.setTool('select'); } else this.connectionSourceId.set(item.id); return; }
    else { this.selectedIds.update((ids) => event.shiftKey ? (ids.includes(item.id) ? ids.filter((id) => id !== item.id) : [...ids, item.id]) : [item.id]); if (this.tool() === 'edit') { this.inspectorOpen.set(true); return; } if (this.tool() !== 'select' || item.locked) return; this.snapshot(); this.session = { kind: 'move', pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, x: item.x, y: item.y, itemId: item.id }; }
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }
  resizeDown(event: PointerEvent, item: CanvasItem): void { event.stopPropagation(); this.snapshot(); this.session = { kind: 'resize', pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, x: item.width, y: item.height, itemId: item.id }; (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId); }
  pointerMove(event: PointerEvent): void {
    const session = this.session; if (!session || session.pointerId !== event.pointerId) return;
    const dx = event.clientX - session.clientX; const dy = event.clientY - session.clientY;
    if (session.kind === 'pan') { this.panX.set(session.x + dx); this.panY.set(session.y + dy); }
    if (session.kind === 'move') this.items.update((items) => items.map((item) => item.id === session.itemId ? { ...item, x: session.x + dx / this.zoom(), y: session.y + dy / this.zoom() } : item));
    if (session.kind === 'resize') this.items.update((items) => items.map((item) => item.id === session.itemId ? { ...item, width: Math.max(170, session.x + dx / this.zoom()), height: Math.max(110, session.y + dy / this.zoom()) } : item));
    if (session.kind === 'marquee') { const point = this.point(event.clientX, event.clientY); this.marquee.set({ x: Math.min(session.x, point.x), y: Math.min(session.y, point.y), width: Math.abs(point.x - session.x), height: Math.abs(point.y - session.y) }); }
  }
  pointerUp(event: PointerEvent): void { if (this.session?.kind === 'marquee' && this.marquee()) { const rect = this.marquee()!; if (rect.width > 4 || rect.height > 4) this.selectedIds.set(this.visibleItems().filter((item) => item.x < rect.x + rect.width && item.x + item.width > rect.x && item.y < rect.y + rect.height && item.y + item.height > rect.y).map((item) => item.id)); } this.session = null; this.marquee.set(null); this.isPanning.set(false); const target = event.currentTarget as HTMLElement; if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId); }
  wheel(event: WheelEvent): void { event.preventDefault(); if (event.ctrlKey || event.metaKey) this.zoomAt(event.clientX, event.clientY, this.zoom() * (event.deltaY > 0 ? .9 : 1.1)); else { this.panX.update((x) => x - event.deltaX); this.panY.update((y) => y - event.deltaY); } }
  zoomAt(clientX: number, clientY: number, value: number): void { const rect = this.viewport()?.nativeElement.getBoundingClientRect(); if (!rect) return; const point = this.point(clientX, clientY); const zoom = Math.min(2.5, Math.max(.35, value)); this.zoom.set(zoom); this.panX.set(clientX - rect.left - point.x * zoom); this.panY.set(clientY - rect.top - point.y * zoom); }
  zoomBy(factor: number): void { const rect = this.viewport()?.nativeElement.getBoundingClientRect(); if (rect) this.zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, this.zoom() * factor); }
  fitView(): void { const rect = this.viewport()?.nativeElement.getBoundingClientRect(); const frames = this.visibleItems().filter((item) => item.type === 'workspace'); const targets = frames.length ? frames : this.visibleItems(); if (!rect || !targets.length) { this.panX.set(0); this.panY.set(0); this.zoom.set(1); return; } const minX = Math.min(...targets.map((item) => item.x)); const minY = Math.min(...targets.map((item) => item.y)); const maxX = Math.max(...targets.map((item) => item.x + item.width)); const maxY = Math.max(...targets.map((item) => item.y + item.height)); const zoom = Math.min(1.15, Math.max(.35, Math.min((rect.width - 170) / (maxX - minX), (rect.height - 150) / (maxY - minY)))); this.zoom.set(zoom); this.panX.set((rect.width - (maxX - minX) * zoom) / 2 - minX * zoom); this.panY.set((rect.height - (maxY - minY) * zoom) / 2 - minY * zoom); }
  enter(item: CanvasItem): void { if (item.type !== 'zone' && item.type !== 'workspace') return; this.navigate(item.zoneType === 'portal' && item.portalTargetId ? item.portalTargetId : item.id); }
  navigate(id: string | null): void { this.contextId.set(id); this.selectedIds.set([]); queueMicrotask(() => this.fitView()); }
  goToSpaces(): void { this.router.navigate(['/spaces']); }
  create(type: ItemType): void { const rect = this.viewport()?.nativeElement.getBoundingClientRect(); const point = rect ? this.point(rect.left + rect.width * .52, rect.top + rect.height * .5) : { x: 350, y: 250 }; const width = type === 'workspace' ? 740 : type === 'zone' ? 310 : 270; const height = type === 'workspace' ? 520 : type === 'zone' ? 230 : 200; const item: CanvasItem = { id: crypto.randomUUID(), type, parentId: this.contextId(), x: point.x - width / 2, y: point.y - height / 2, width, height, title: type === 'workspace' ? 'New workspace' : type === 'zone' ? 'New zone' : `Untitled ${type}`, body: type === 'note' ? 'Start writing here...' : '', accent: '#c88369', zoneType: type === 'zone' ? 'standard' : undefined, checklist: type === 'checklist' ? [{ label: 'First step', completed: false }] : undefined, rows: type === 'budget' ? [{ label: 'New item', value: 0 }] : undefined, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; this.snapshot(); this.items.update((items) => [...items, item]); this.selectedIds.set([item.id]); this.inspectorOpen.set(true); this.setTool('edit'); }
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
  duplicate(): void { const selected = this.selected(); if (!selected) return; this.snapshot(); const copy = { ...structuredClone(selected), id: crypto.randomUUID(), title: `${selected.title} copy`, x: selected.x + 32, y: selected.y + 32 }; this.items.update((items) => [...items, copy]); this.selectedIds.set([copy.id]); }
  removeSelected(): void { const ids = this.selectedIds(); if (!ids.length) return; this.snapshot(); const removed = new Set(ids); let changed = true; while (changed) { changed = false; for (const item of this.items()) if (item.parentId && removed.has(item.parentId) && !removed.has(item.id)) { removed.add(item.id); changed = true; } } this.items.update((items) => items.filter((item) => !removed.has(item.id))); this.connections.update((connections) => connections.filter((connection) => !removed.has(connection.sourceId) && !removed.has(connection.targetId))); this.selectedIds.set([]); }
  connectionPath(connection: CanvasConnection): string { const source = this.items().find((item) => item.id === connection.sourceId)!; const target = this.items().find((item) => item.id === connection.targetId)!; const x1 = source.x + source.width; const y1 = source.y + source.height / 2; const x2 = target.x; const y2 = target.y + target.height / 2; const bend = Math.max(60, Math.abs(x2 - x1) * .45); return `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`; }
  connectionLabelX(connection: CanvasConnection): number { const a = this.items().find((item) => item.id === connection.sourceId)!; const b = this.items().find((item) => item.id === connection.targetId)!; return (a.x + a.width + b.x) / 2; }
  connectionLabelY(connection: CanvasConnection): number { const a = this.items().find((item) => item.id === connection.sourceId)!; const b = this.items().find((item) => item.id === connection.targetId)!; return (a.y + a.height / 2 + b.y + b.height / 2) / 2 - 12; }
}
