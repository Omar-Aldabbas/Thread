import { CommonModule, isPlatformBrowser } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import {
  AfterViewInit,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  BudgetCurrency,
  CanvasConnection,
  CanvasItem,
  CanvasJunction,
  ChartConfig,
  ConnectorKind,
  ConnectorSide,
  ErField,
  ItemType,
  ShapeKind,
  SketchBrush,
  SketchStroke,
  ThreadDataset,
  demoConnections,
  demoItems,
} from '../../canvas.model';
import { DatasetStore } from '../../data/dataset-store';
import { canvasId } from '../../canvas-id';
import { arrangeErEntities, routeErConnections } from '../../er-layout';
import { erDataTypes, enumValues, erFieldIssue, exportErDbml } from '../../er-schema';
import { shapeKinds, shapeNames, shapePaths, shapeThemes } from '../../shapes';
import { ThreadChart } from '../../components/thread-chart';
import {
  containsShape,
  nearestPerimeter,
  perimeterPoint,
  sidePoint,
  world,
} from '../../sketch/connector-geometry';
import { RichTextEditor } from '../../components/rich-text-editor';
import { PreferencesService } from '../../../../shared/preferences.service';
import { MediaPicker, PickedMedia } from '../../components/media-picker';
import { CanvasTransformOverlay } from '../../transform/canvas-transform-overlay';
import { SketchRenderer } from '../../sketch/sketch-renderer';
import {
  ThreadSelect,
  ThreadOption,
  ThreadCheckbox,
  ThreadColor,
} from '../../../../shared/controls/thread-controls';
import { ThreadHeader } from '../../../../shared/thread-header';
import { ScrollDirective } from '../../../../shared/scroll.directive';
import {
  brushDiameter,
  distanceToStroke,
  strokeBounds,
  strokeOutlinePath,
} from '../../sketch/sketch-geometry';
import { elbowRoute } from '../../sketch/elbow-route';
import { connectorSides, isConnectableItem, validConnections } from '../../connector-rules';

type Tool = 'select' | 'hand' | 'text' | 'add' | 'connect' | 'sketch' | 'shape';
type EditField = 'title' | 'body' | 'content';
type Session = {
  kind:
    | 'pan'
    | 'move'
    | 'resize'
    | 'rotate'
    | 'marquee'
    | 'place'
    | 'crop'
    | 'connect'
    | 'rebind'
    | 'route'
    | 'branch'
    | 'junction-slide'
    | 'sketch'
    | 'erase';
  pointerId: number;
  clientX: number;
  clientY: number;
  x: number;
  y: number;
  itemId?: string;
  connectionId?: string;
  junctionId?: string;
  ratio?: number;
  terminal?: 'source' | 'target';
  side?: ConnectorSide;
  corner?: 'nw' | 'ne' | 'sw' | 'se';
  before?: State;
  origins?: Map<string, { x: number; y: number }>;
  groupCenter?: { x: number; y: number };
  groupIds?: string[];
  moved?: boolean;
};
type State = {
  items: CanvasItem[];
  connections: CanvasConnection[];
  junctions?: CanvasJunction[];
  datasets?: ThreadDataset[];
};

@Component({
  selector: 'app-canvas-page',
  standalone: true,
  providers: [DatasetStore],
  imports: [
    CommonModule,
    RichTextEditor,
    MediaPicker,
    SketchRenderer,
    ThreadHeader,
    ScrollDirective,
    ThreadChart,
    ThreadSelect,
    ThreadOption,
    ThreadCheckbox,
    ThreadColor,
  ],
  templateUrl: './canvas-page.html',
  styleUrl: './canvas-page.css',
})
export class CanvasPage implements AfterViewInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly sanitizer = inject(DomSanitizer);
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
  readonly erRoutes = computed(() => routeErConnections(this.items(), this.connections()));
  readonly erEntities = computed(() => this.items().filter((item) => item.type === 'er-entity'));
  readonly erExpandedFieldId = signal<string | null>(null);
  readonly erDataTypes = [
    'UUID',
    'VARCHAR',
    'TEXT',
    'INTEGER',
    'DECIMAL',
    'BOOLEAN',
    'DATE',
    'TIMESTAMP',
    'ENUM',
    ...erDataTypes.filter(
      (type) =>
        ![
          'UUID',
          'VARCHAR',
          'TEXT',
          'INTEGER',
          'DECIMAL',
          'BOOLEAN',
          'DATE',
          'TIMESTAMP',
          'ENUM',
        ].includes(type),
    ),
  ];
  readonly shapeKinds = shapeKinds;
  readonly shapeNames = shapeNames;
  readonly shapePaths = shapePaths;
  readonly shapeThemes = shapeThemes;
  readonly shapeTheme = signal(0);
  readonly junctions = signal<CanvasJunction[]>(this.initial.junctions || []);
  readonly contextId = signal<string | null>(null);
  readonly selectedIds = signal<string[]>([]);
  readonly tool = signal<Tool>('select');
  readonly spaceHeld = signal(false);
  readonly paletteOpen = signal(false);
  readonly activityOpen = signal(false);
  readonly timerSeconds = signal(25 * 60);
  readonly timerMinutes = signal(25);
  readonly timerRunning = signal(false);
  readonly musicPlaying = signal(false);
  readonly musicTrack = signal<'keys' | 'rain'>('keys');
  readonly musicVolume = signal(0.45);
  readonly isRecording = signal(false);
  readonly recordingSeconds = signal(0);
  readonly recordingPaused = signal(false);
  readonly spotifyLink = signal('');
  readonly spotifyEmbed = signal<SafeResourceUrl | null>(null);
  readonly spotifyEmbedHeight = signal(152);
  readonly selectedBoardAudioId = signal('');
  readonly boardAudioItems = computed(() =>
    this.items().filter((item) => item.type === 'voice' && !!item.url),
  );
  readonly voicePlayback = signal<
    Record<string, { current: number; duration: number; playing: boolean }>
  >({});
  private readonly voiceFrames = new Map<string, number>();
  readonly activityError = signal('');
  readonly pendingType = signal<ItemType | null>(null);
  readonly editingId = signal<string | null>(null);
  readonly richFocusId = signal<string | null>(null);
  private richBefore: State | null = null;
  readonly placement = signal<{ x: number; y: number; width: number; height: number } | null>(null);
  readonly dropActive = signal(false);
  readonly cropId = signal<string | null>(null);
  readonly connectionPreview = signal<{ x1: number; y1: number; x2: number; y2: number } | null>(
    null,
  );
  readonly sketchPoints = signal<{ x: number; y: number; pressure?: number }[]>([]);
  readonly sketchColor = signal('#d4111c');
  readonly sketchEraser = signal(false);
  readonly brush = signal<SketchBrush>('pen');
  readonly shapeKind = signal<ShapeKind>('rectangle');
  shapeIcon(kind: ShapeKind): string {
    return shapeNames[kind];
  }
  applyShapeTheme(item: CanvasItem, index: number): void {
    const theme = shapeThemes[index];
    if (theme)
      this.setStyle(item.id, {
        shapeFill: theme.fill,
        shapeStroke: theme.stroke,
        textColor: theme.text,
      });
  }
  readonly connectorKind = signal<ConnectorKind>('elbow');
  readonly connectorSides = connectorSides;
  readonly connectionTargetId = signal<string | null>(null);
  readonly junctionCandidate = signal<{
    connectionId: string;
    ratio: number;
    x: number;
    y: number;
  } | null>(null);
  readonly selectedConnectionId = signal<string | null>(null);
  readonly hoveredConnectionId = signal<string | null>(null);
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
  readonly connectionSourceEntity = computed(
    () => this.items().find((item) => item.id === this.connectionSourceId()) || null,
  );
  readonly search = signal('');
  readonly searchOpen = signal(false);
  readonly panX = signal(0);
  readonly panY = signal(0);
  readonly zoom = signal(1);
  readonly isPanning = signal(false);
  readonly marquee = signal<{ x: number; y: number; width: number; height: number } | null>(null);
  private session: Session | null = null;
  private suppressCanvasClick = false;
  private readonly captureCanvasPointerDown = (event: PointerEvent): void =>
    this.canvasPointerDown(event);
  canvasPointerDown(event: PointerEvent): void {
    if (event.button !== 0 && event.button !== 1) return;
    const target = event.target as Element;
    const viewport = this.viewport()?.nativeElement;
    if (!viewport || !target || !viewport.contains(target)) return;
    const node = target.closest<HTMLElement>('[data-node-id]');
    const item = this.items().find((entry) => entry.id === node?.dataset['nodeId']);
    const control = target.closest(
      'button, input, select, textarea, a, summary, thread-select, thread-checkbox, thread-color, [role="button"], [contenteditable="true"], app-rich-text-editor, td, th, [data-ui]',
    );
    const handle = target.closest(
      '.resize-handle, .rotate-handle, .shape-port, .connect-handle, .table-resize, .connections',
    );
    const edit = target.closest<HTMLElement>('[data-edit-field]');
    // A held Space key owns the gesture before any nested control can act.
    if (this.spaceHeld()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.suppressCanvasClick = true;
      this.beginPan(event, viewport);
      return;
    }
    if (target.closest('.sketch-layer')) return;
    if (handle) return; // Explicit handles keep their existing session handlers.
    if (control) return;
    if (this.pendingType() || this.pendingAsset() || this.tool() === 'text') {
      event.stopImmediatePropagation();
      this.pointerDown(event);
      return;
    }
    if (edit && item && this.tool() === 'select') {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.startEditing(item.id, (edit.dataset['editField'] || 'title') as EditField);
      return;
    }
    if (item) {
      event.stopImmediatePropagation();
      this.itemPointerDown(event, item);
      return;
    }
    event.stopImmediatePropagation();
    this.pointerDown(event);
  }
  private readonly captureCanvasClick = (event: MouseEvent): void => {
    if (!this.suppressCanvasClick) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.suppressCanvasClick = false;
  };
  private history: State[] = [];
  private future: State[] = [];
  private dataEditBefore: State | null = null;
  readonly editingDataCell = signal<string | null>(null);
  readonly selectedDataCell = signal<string | null>(null);
  readonly collapsedBudgetGroups = signal<string[]>([]);
  readonly tableSort = signal<{ itemId: string; key: string; direction: 1 | -1 } | null>(null);
  readonly tableFilter = signal<{
    itemId: string;
    key: string;
    operator: string;
    value: string;
    second?: string;
  } | null>(null);
  readonly tableSummary = signal<Record<string, 'sum' | 'average' | 'min' | 'max' | 'count'>>({});
  readonly tableGroup = signal<{ itemId: string; key: string } | null>(null);
  readonly collapsedTableGroups = signal<string[]>([]);
  readonly draggedTableColumn = signal<string | null>(null);
  readonly chartSelection = signal<{ itemId: string; label: string } | null>(null);
  private transformOverlay: CanvasTransformOverlay | null = null;
  private transformBefore: State | null = null;
  private transformStart: CanvasItem | null = null;
  private transformFrame = 0;
  private timerInterval: ReturnType<typeof setInterval> | null = null;
  private timerDeadline = 0;
  private musicContext: AudioContext | null = null;
  private musicGain: GainNode | null = null;
  private musicInterval: ReturnType<typeof setInterval> | null = null;
  private musicStep = 0;
  private recorder: MediaRecorder | null = null;
  private recordingStream: MediaStream | null = null;
  private recordingChunks: Blob[] = [];
  private recordingStartedAt = 0;
  private recordingElapsedMs = 0;
  private recordingInterval: ReturnType<typeof setInterval> | null = null;
  readonly transformGuide = signal<{ label: string; x: number; y: number } | null>(null);
  readonly snapGuide = signal<{ x?: number; y?: number } | null>(null);

  readonly spaceName = computed(() => {
    if (!this.browser) return 'Thread development';
    try {
      const spaces = JSON.parse(localStorage.getItem('thread-spaces') || '[]') as {
        id: string;
        title: string;
      }[];
      return (
        spaces.find((space) => space.id === this.spaceId)?.title ||
        (this.spaceId === 'thread' ? 'Thread development' : 'Untitled space')
      );
    } catch {
      return 'Thread development';
    }
  });
  readonly context = computed(
    () => this.items().find((item) => item.id === this.contextId()) || null,
  );
  readonly breadcrumbs = computed(() => {
    const path: CanvasItem[] = [];
    let current = this.context();
    while (current) {
      path.unshift(current);
      current = this.items().find((item) => item.id === current?.parentId) || null;
    }
    return path;
  });
  readonly visibleItems = computed(() =>
    this.items().filter(
      (item) =>
        !this.search() ||
        `${item.title} ${item.body || ''}`.toLowerCase().includes(this.search().toLowerCase()),
    ),
  );
  readonly visibleConnections = computed(() =>
    this.connections().filter(
      (connection) =>
        this.visibleItems().some((item) => item.id === connection.sourceId) &&
        this.visibleItems().some((item) => item.id === connection.targetId),
    ),
  );
  readonly selected = computed(
    () => this.items().find((item) => item.id === this.selectedIds()[0]) || null,
  );
  readonly selectedConnection = computed(
    () =>
      this.connections().find((connection) => connection.id === this.selectedConnectionId()) ||
      null,
  );
  readonly groupBounds = computed(() => {
    const selected = this.items().filter((item) => this.selectedIds().includes(item.id));
    if (selected.length < 2) return null;
    const corners = selected.flatMap((item) => {
      const cx = item.x + item.width / 2,
        cy = item.y + item.height / 2,
        a = ((item.rotation || 0) * Math.PI) / 180;
      return [-1, 1].flatMap((sx) =>
        [-1, 1].map((sy) => ({
          x: cx + ((sx * item.width) / 2) * Math.cos(a) - ((sy * item.height) / 2) * Math.sin(a),
          y: cy + ((sx * item.width) / 2) * Math.sin(a) + ((sy * item.height) / 2) * Math.cos(a),
        })),
      );
    });
    const x = Math.min(...corners.map((point) => point.x)),
      y = Math.min(...corners.map((point) => point.y));
    return {
      x,
      y,
      width: Math.max(...corners.map((point) => point.x)) - x,
      height: Math.max(...corners.map((point) => point.y)) - y,
    };
  });
  readonly worldTransform = computed(
    () => `translate(${this.panX()}px, ${this.panY()}px) scale(${this.zoom()})`,
  );
  readonly gridSize = computed(() => `${24 * this.zoom()}px ${24 * this.zoom()}px`);
  readonly gridPosition = computed(() => `${this.panX()}px ${this.panY()}px`);
  readonly zoomLabel = computed(() => `${Math.round(this.zoom() * 100)}%`);
  childCount(id: string): number {
    return this.items().filter((item) => item.parentId === id).length;
  }

  constructor() {
    this.datasetStore.replace(this.initial.datasets || []);
    effect(() => {
      if (this.browser) {
        try {
          localStorage.setItem(
            this.storageKey,
            JSON.stringify({
              version: 3,
              items: this.items(),
              connections: this.connections(),
              junctions: this.junctions(),
              datasets: this.datasets(),
            }),
          );
        } catch {
          /* Large files can exceed local storage. */
        }
      }
    });
    effect(() => {
      this.selectedIds();
      this.zoom();
      this.panX();
      this.panY();
      if (this.browser) this.queueTransformSync();
    });
  }
  ngAfterViewInit(): void {
    const viewport = this.viewport()?.nativeElement;
    viewport?.addEventListener('pointerdown', this.captureCanvasPointerDown, true);
    viewport?.addEventListener('click', this.captureCanvasClick, true);
    setTimeout(() => {
      this.fitView();
      this.queueTransformSync();
      const entryTool = this.route.snapshot.queryParamMap.get('tool');
      if (entryTool === 'task') this.chooseType('task');
      else if (entryTool === 'text' || entryTool === 'sketch' || entryTool === 'connect')
        this.setTool(entryTool);
    });
  }
  ngOnDestroy(): void {
    const viewport = this.viewport()?.nativeElement;
    viewport?.removeEventListener('pointerdown', this.captureCanvasPointerDown, true);
    viewport?.removeEventListener('click', this.captureCanvasClick, true);
    if (this.transformFrame) cancelAnimationFrame(this.transformFrame);
    this.transformOverlay?.destroy();
    this.pauseTimer();
    this.stopMusic();
    for (const id of this.voiceFrames.keys()) this.stopVoiceFrame(id);
    this.stopVoiceRecording(false);
  }
  private queueTransformSync(): void {
    if (!this.browser || this.transformFrame) return;
    this.transformFrame = requestAnimationFrame(() => {
      this.transformFrame = 0;
      const viewport = this.viewport()?.nativeElement;
      if (!viewport || !this.transformOverlay) return;
      const ids = this.selectedIds();
      const targets = ids
        .map((id) => viewport.querySelector<HTMLElement>(`[data-node-id="${id}"]`))
        .filter((value): value is HTMLElement => !!value);
      const others = [...viewport.querySelectorAll<HTMLElement>('[data-node-id]')].filter(
        (element) => !ids.includes(element.dataset['nodeId'] || ''),
      );
      const item = this.selected();
      this.transformOverlay.update(
        targets,
        others,
        !!item && ['image', 'gif', 'sticker', 'sketch'].includes(item.type),
      );
    });
  }
  private beginTransform(): void {
    this.transformStart = this.selected();
    this.transformBefore = this.state();
  }
  private resizeTransform(width: number, height: number, direction: number[]): void {
    const item = this.transformStart;
    if (!item) return;
    const nextWidth = Math.max(40, width),
      nextHeight = Math.max(40, height);
    const sx = direction[0] || 1,
      sy = direction[1] || 1;
    const angle = ((item.rotation || 0) * Math.PI) / 180,
      cos = Math.cos(angle),
      sin = Math.sin(angle);
    const oldOppX = (-sx * item.width) / 2,
      oldOppY = (-sy * item.height) / 2;
    const newOppX = (-sx * nextWidth) / 2,
      newOppY = (-sy * nextHeight) / 2;
    const anchorX = item.x + item.width / 2 + oldOppX * cos - oldOppY * sin;
    const anchorY = item.y + item.height / 2 + oldOppX * sin + oldOppY * cos;
    const centerX = anchorX - newOppX * cos + newOppY * sin;
    const centerY = anchorY - newOppX * sin - newOppY * cos;
    this.update(item.id, {
      x: centerX - nextWidth / 2,
      y: centerY - nextHeight / 2,
      width: nextWidth,
      height: nextHeight,
      textAutoSize: false,
    });
    this.setTransformGuide(`${Math.round(nextWidth)} × ${Math.round(nextHeight)}`);
    this.queueTransformSync();
  }
  private rotateTransform(degrees: number): void {
    const item = this.transformStart;
    if (!item) return;
    const rotation = Math.round(degrees);
    this.update(item.id, { rotation });
    this.setTransformGuide(`${rotation}°`);
    this.queueTransformSync();
  }
  private setTransformGuide(label: string): void {
    const item = this.selected(),
      viewport = this.viewport()?.nativeElement;
    if (!item || !viewport) return;
    const x = this.panX() + (item.x + item.width / 2) * this.zoom();
    const top = this.panY() + item.y * this.zoom();
    const bottom = this.panY() + (item.y + item.height) * this.zoom();
    this.transformGuide.set({ label, x, y: top >= 44 ? top - 35 : bottom + 16 });
  }
  private endTransform(): void {
    if (this.transformBefore) this.commit(this.transformBefore);
    this.transformBefore = null;
    this.transformStart = null;
    this.transformGuide.set(null);
    this.queueTransformSync();
  }

  private read(): State {
    if (!this.browser) return { items: demoItems, connections: demoConnections };
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        const state = JSON.parse(stored) as State & { version?: number };
        if (state.version !== 2 && state.version !== 3) return this.normalizeLegacy(state);
        return {
          items: this.expandSketchItems(
            state.items.map((item) =>
              item.sketchAsset === 'sticker'
                ? {
                    ...item,
                    type: 'sticker' as const,
                    title: 'Rough star',
                    image: '/stickers/rough-star.svg',
                    assetId: 'rough-star',
                    sketchAsset: undefined,
                  }
                : item.sketchAsset === 'gif'
                  ? { ...item, type: 'gif' as const, sketchAsset: undefined }
                  : item,
            ),
          ),
          connections: state.connections,
          junctions: state.junctions || [],
          datasets: state.datasets,
        };
      }
    } catch {}
    return this.spaceId === 'thread'
      ? {
          items: [
            {
              ...demoItems.find((item) => item.id === 'research')!,
              parentId: null,
              x: 170,
              y: 150,
              width: 730,
              height: 450,
              title: 'Ideas in progress',
            },
            {
              ...demoItems.find((item) => item.id === 'note-1')!,
              parentId: 'research',
              x: 220,
              y: 250,
              width: 270,
              height: 190,
            },
            {
              ...demoItems.find((item) => item.id === 'task-1')!,
              parentId: 'research',
              x: 550,
              y: 315,
              width: 240,
              height: 170,
            },
            {
              ...demoItems.find((item) => item.id === 'image-1')!,
              parentId: null,
              x: 1000,
              y: 210,
              width: 360,
              height: 330,
            },
          ],
          connections: [],
        }
      : { items: [], connections: [] };
  }
  private normalizeLegacy(state: State): State {
    const items = structuredClone(state.items);
    const byId = new Map(items.map((item) => [item.id, item]));
    const positions = new Map<string, { x: number; y: number }>();
    const position = (item: CanvasItem): { x: number; y: number } => {
      if (positions.has(item.id)) return positions.get(item.id)!;
      const parent = item.parentId ? byId.get(item.parentId) : null;
      const base = parent && parent.type !== 'workspace' ? position(parent) : { x: 0, y: 0 };
      const value = { x: item.x + base.x, y: item.y + base.y };
      positions.set(item.id, value);
      return value;
    };
    for (const item of items) {
      if (
        [
          'research-note',
          'research-deep',
          'engine-task',
          'roadmap-budget',
          'roadmap-table',
        ].includes(item.id)
      ) {
        const p = position(item);
        item.x = p.x;
        item.y = p.y;
      }
    }
    return { items: this.expandSketchItems(items), connections: state.connections };
  }
  private upgradeDataState(state: State): State {
    const datasets = structuredClone(state.datasets || []);
    const items = state.items.map((item) => {
      if (item.type !== 'budget' && item.type !== 'table') return item;
      if (item.datasetId && datasets.some((data) => data.id === item.datasetId)) {
        if (item.type === 'budget')
          this.upgradeBudgetDataset(datasets.find((data) => data.id === item.datasetId)!);
        return item;
      }
      const id = item.datasetId || canvasId();
      if (item.type === 'budget') {
        datasets.push({
          id,
          columns: [
            { id: canvasId(), key: 'item', label: 'Category', type: 'text' },
            { id: canvasId(), key: 'planned', label: 'Planned', type: 'currency' },
            { id: canvasId(), key: 'actual', label: 'Actual', type: 'currency' },
            {
              id: canvasId(),
              key: 'remaining',
              label: 'Remaining',
              type: 'calculated',
              calculation: { left: 'planned', operator: '-', right: 'actual' },
            },
            { id: canvasId(), key: 'group', label: 'Group', type: 'category' },
          ],
          rows: (item.rows || [])
            .filter((row) => row.label !== 'New item' || row.value !== 0)
            .map((row) => ({
              id: canvasId(),
              values: {
                item: row.label,
                planned: row.value,
                actual: 0,
                remaining: row.value,
                group: '',
              },
            })),
        });
      } else {
        const oldRows = item.tableRows?.length
          ? item.tableRows
          : item.body
            ? item.body
                .split('\n')
                .filter(Boolean)
                .map((row) => row.split('|'))
            : [];
        const labels = item.tableColumns?.length ? item.tableColumns : ['Column 1', 'Column 2'];
        const columns = labels.map((label, index) => {
          const values = oldRows.map((row) => row[index]?.trim()).filter(Boolean) as string[];
          return {
            id: canvasId(),
            key: `column_${index + 1}`,
            label,
            type: /^(date|month|year|day)$/i.test(label)
              ? ('date' as const)
              : values.length && values.every((value) => Number.isFinite(Number(value)))
                ? ('number' as const)
                : ('text' as const),
          };
        });
        datasets.push({
          id,
          columns,
          rows: oldRows
            .filter((row) => row.some((value) => value.trim()))
            .map((row) => ({
              id: canvasId(),
              values: Object.fromEntries(
                columns.map((column, index) => [column.key, row[index] || '']),
              ),
            })),
        });
      }
      return {
        ...item,
        datasetId: id,
        rows: undefined,
        tableColumns: undefined,
        tableRows: undefined,
      };
    });
    const connections = validConnections(items, state.connections, state.junctions || []);
    if (
      this.browser &&
      connections.length !== (Array.isArray(state.connections) ? state.connections.length : 0)
    ) {
      try {
        const backupKey = `${this.storageKey}-connector-backup`;
        if (!localStorage.getItem(backupKey))
          localStorage.setItem(backupKey, JSON.stringify(state));
      } catch {
        /* The board still loads if browser storage is full. */
      }
    }
    return {
      items,
      connections,
      junctions: (state.junctions || []).filter((junction) =>
        connections.some((connection) => connection.id === junction.parentConnectorId),
      ),
      datasets,
    };
  }
  private upgradeBudgetDataset(data: ThreadDataset): void {
    const amount = data.columns.find((column) => column.key === 'amount');
    const numeric = data.columns.filter(
      (column) => column.type === 'number' || column.type === 'currency',
    );
    const estimate =
      data.columns.find((column) =>
        /^(estimate|estimated|plan|planned|budget)$/i.test(column.label),
      ) ||
      amount ||
      numeric[0];
    const spent =
      data.columns.find((column) => /^(spent|actual|paid|cost)$/i.test(column.label)) ||
      numeric.find((column) => column.id !== estimate?.id);
    if (!data.columns.some((column) => column.label === 'Planned')) {
      data.columns.push({ id: canvasId(), key: 'planned', label: 'Planned', type: 'currency' });
      data.rows.forEach(
        (row) => (row.values['planned'] = Number(row.values[estimate?.key || '']) || 0),
      );
    }
    if (!data.columns.some((column) => column.label === 'Actual')) {
      data.columns.push({ id: canvasId(), key: 'actual', label: 'Actual', type: 'currency' });
      data.rows.forEach(
        (row) => (row.values['actual'] = Number(row.values[spent?.key || '']) || 0),
      );
    }
    const planned = data.columns.find((column) => column.label === 'Planned')!.key;
    const actual = data.columns.find((column) => column.label === 'Actual')!.key;
    if (!data.columns.some((column) => column.label === 'Remaining'))
      data.columns.push({
        id: canvasId(),
        key: 'remaining',
        label: 'Remaining',
        type: 'calculated',
      });
    const remaining = data.columns.find((column) => column.label === 'Remaining')!;
    remaining.type = 'calculated';
    remaining.calculation = { left: planned, operator: '-', right: actual };
    data.rows.forEach(
      (row) =>
        (row.values[remaining.key] =
          (Number(row.values[planned]) || 0) - (Number(row.values[actual]) || 0)),
    );
    if (!data.columns.some((column) => column.key === 'group'))
      data.columns.push({ id: canvasId(), key: 'group', label: 'Group', type: 'category' });
  }
  private expandSketchItems(items: CanvasItem[]): CanvasItem[] {
    return items.flatMap((item) => {
      const strokes = (
        item.sketchStrokes ||
        (item.strokes || []).map((points, index): SketchStroke => ({
          id: `${item.id}-${index}`,
          brush: 'pen',
          points: points.map((point) => ({
            x: point.x,
            y: point.y,
            pressure: point.pressure ?? 0.5,
          })),
          color: item.accent || '#d4111c',
          size: item.strokeWidth || 3,
          opacity: item.strokeOpacity || 1,
        }))
      ).filter((stroke) => stroke.points.length);
      if (item.type !== 'sketch' || strokes.length <= 1) return [item];
      const angle = ((item.rotation || 0) * Math.PI) / 180,
        cos = Math.cos(angle),
        sin = Math.sin(angle);
      return strokes.map((stroke, index) => {
        const world = {
          ...stroke,
          points: stroke.points.map((point) => {
            const dx = (point.x * item.width) / (item.sourceWidth || item.width) - item.width / 2,
              dy = (point.y * item.height) / (item.sourceHeight || item.height) - item.height / 2;
            return {
              ...point,
              x: item.x + item.width / 2 + dx * cos - dy * sin,
              y: item.y + item.height / 2 + dx * sin + dy * cos,
            };
          }),
        };
        const bounds = strokeBounds([world]);
        return {
          ...item,
          id: index === 0 ? item.id : `${item.id}:${stroke.id}`,
          x: bounds.x,
          y: bounds.y,
          width: bounds.width,
          height: bounds.height,
          sourceWidth: bounds.width,
          sourceHeight: bounds.height,
          rotation: 0,
          groupId: undefined,
          strokes: undefined,
          sketchStrokes: [
            {
              ...world,
              points: world.points.map((point) => ({
                ...point,
                x: point.x - bounds.x,
                y: point.y - bounds.y,
              })),
            },
          ],
        };
      });
    });
  }
  private state(): State {
    return {
      items: structuredClone(this.items()),
      connections: structuredClone(this.connections()),
      junctions: structuredClone(this.junctions()),
      datasets: structuredClone(this.datasets()),
    };
  }
  private commit(before: State): void {
    if (JSON.stringify(before) === JSON.stringify(this.state())) return;
    this.history.push(before);
    this.history = this.history.slice(-60);
    this.future = [];
  }
  private snapshot(): void {
    this.history.push(this.state());
    this.history = this.history.slice(-60);
    this.future = [];
  }
  beginDataEdit(): void {
    if (!this.dataEditBefore) this.dataEditBefore = this.state();
  }
  endDataEdit(): void {
    if (this.dataEditBefore) this.commit(this.dataEditBefore);
    this.dataEditBefore = null;
  }
  undo(): void {
    const state = this.history.pop();
    if (!state) return;
    this.future.push(this.state());
    this.items.set(state.items);
    this.connections.set(state.connections);
    this.junctions.set(state.junctions || []);
    this.datasetStore.replace(state.datasets || []);
  }
  redo(): void {
    const state = this.future.pop();
    if (!state) return;
    this.history.push(this.state());
    this.items.set(state.items);
    this.connections.set(state.connections);
    this.junctions.set(state.junctions || []);
    this.datasetStore.replace(state.datasets || []);
  }
  setTool(tool: Tool): void {
    this.cancelConnectorGesture();
    this.finishEditing();
    this.tool.set(tool);
    this.paletteOpen.set(tool === 'add');
    this.pendingType.set(tool === 'shape' ? 'shape' : null);
    if (tool !== 'select') {
      this.inspectorOpen.set(false);
      this.selectedConnectionId.set(null);
    }
    if (tool !== 'sketch') this.sketchEraser.set(false);
    else this.selectedIds.set([]);
    this.pendingAsset.set(null);
    this.mediaPicker.set(null);
    this.connectionSourceId.set(null);
    this.connectionTargetId.set(null);
  }
  chooseType(type: ItemType): void {
    this.finishEditing();
    this.inspectorOpen.set(false);
    this.selectedConnectionId.set(null);
    if (type === 'gif' || type === 'sticker') {
      this.openMedia(type);
      return;
    }
    this.pendingType.set(type);
    this.paletteOpen.set(false);
    this.tool.set('select');
  }
  formatTimer(): string {
    const seconds = this.timerSeconds();
    return `${Math.floor(seconds / 60)
      .toString()
      .padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
  }
  setTimerMinutes(minutes: number): void {
    if (this.timerRunning()) this.pauseTimer();
    this.timerMinutes.set(minutes);
    this.timerSeconds.set(minutes * 60);
  }
  toggleTimer(): void {
    if (this.timerRunning()) {
      this.pauseTimer();
      return;
    }
    if (!this.timerSeconds()) this.timerSeconds.set(this.timerMinutes() * 60);
    this.timerDeadline = Date.now() + this.timerSeconds() * 1000;
    this.timerRunning.set(true);
    this.timerInterval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((this.timerDeadline - Date.now()) / 1000));
      this.timerSeconds.set(remaining);
      if (!remaining) this.pauseTimer();
    }, 250);
  }
  pauseTimer(): void {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = null;
    this.timerRunning.set(false);
  }
  resetTimer(): void {
    this.pauseTimer();
    this.timerSeconds.set(this.timerMinutes() * 60);
  }
  async toggleMusic(): Promise<void> {
    this.activityError.set('');
    if (this.musicPlaying()) {
      this.stopMusic();
      return;
    }
    try {
      const context = new AudioContext(),
        gain = context.createGain();
      gain.gain.value = this.musicVolume();
      gain.connect(context.destination);
      this.musicContext = context;
      this.musicGain = gain;
      this.musicPlaying.set(true);
      await context.resume();
      if (this.musicTrack() === 'rain') this.startRainSound(context, gain);
      else {
        this.musicStep = 0;
        this.playSoftFocusNote();
        this.musicInterval = setInterval(() => this.playSoftFocusNote(), 850);
      }
    } catch {
      this.stopMusic();
      this.activityError.set('Audio playback is not available in this browser.');
    }
  }
  setMusicTrack(track: 'keys' | 'rain'): void {
    if (track === this.musicTrack()) return;
    const wasPlaying = this.musicPlaying();
    this.stopMusic();
    this.musicTrack.set(track);
    if (wasPlaying) void this.toggleMusic();
  }
  setMusicVolume(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.musicVolume.set(value);
    if (this.musicGain && this.musicContext)
      this.musicGain.gain.setTargetAtTime(value, this.musicContext.currentTime, 0.08);
  }
  private playSoftFocusNote(): void {
    const context = this.musicContext,
      output = this.musicGain;
    if (!context || !output) return;
    const melody = [196, 247, 294, 370, 330, 294, 247, 220];
    const now = context.currentTime,
      oscillator = context.createOscillator(),
      filter = context.createBiquadFilter(),
      envelope = context.createGain();
    oscillator.type = 'triangle';
    oscillator.frequency.value = melody[this.musicStep++ % melody.length];
    filter.type = 'lowpass';
    filter.frequency.value = 1150;
    envelope.gain.setValueAtTime(0.001, now);
    envelope.gain.exponentialRampToValueAtTime(0.18, now + 0.08);
    envelope.gain.exponentialRampToValueAtTime(0.001, now + 1.55);
    oscillator.connect(filter);
    filter.connect(envelope);
    envelope.connect(output);
    oscillator.start(now);
    oscillator.stop(now + 1.6);
  }
  private startRainSound(context: AudioContext, output: GainNode): void {
    const buffer = context.createBuffer(1, context.sampleRate * 3, context.sampleRate),
      channel = buffer.getChannelData(0);
    for (let index = 0; index < channel.length; index++)
      channel[index] = (Math.random() * 2 - 1) * 0.22;
    const source = context.createBufferSource(),
      filter = context.createBiquadFilter(),
      gain = context.createGain();
    source.buffer = buffer;
    source.loop = true;
    filter.type = 'lowpass';
    filter.frequency.value = 680;
    gain.gain.value = 0.3;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(output);
    source.start();
  }
  private stopMusic(): void {
    if (this.musicInterval) clearInterval(this.musicInterval);
    this.musicInterval = null;
    const context = this.musicContext;
    this.musicContext = null;
    this.musicGain = null;
    this.musicPlaying.set(false);
    if (context && context.state !== 'closed') void context.close();
  }
  async toggleVoiceRecording(): Promise<void> {
    if (this.isRecording()) return;
    this.activityError.set('');
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      this.activityError.set('Voice recording is not supported in this browser.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const supported = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find((type) =>
        MediaRecorder.isTypeSupported(type),
      );
      const recorder = new MediaRecorder(
        stream,
        supported ? { mimeType: supported, audioBitsPerSecond: 48000 } : undefined,
      );
      this.recordingStream = stream;
      this.recorder = recorder;
      this.recordingChunks = [];
      this.recordingStartedAt = Date.now();
      this.recordingElapsedMs = 0;
      this.recordingSeconds.set(0);
      this.recordingPaused.set(false);
      this.isRecording.set(true);
      this.paletteOpen.set(false);
      recorder.ondataavailable = (event) => {
        if (event.data.size) this.recordingChunks.push(event.data);
      };
      recorder.onerror = () => {
        this.activityError.set(
          'Recording stopped unexpectedly. Check your microphone and try again.',
        );
        this.stopVoiceRecording(false);
      };
      recorder.onstop = () => {
        const elapsed =
          this.recordingElapsedMs +
          (this.recordingPaused() ? 0 : Date.now() - this.recordingStartedAt);
        const seconds = Math.max(1, Math.round(elapsed / 1000)),
          chunks = this.recordingChunks.splice(0);
        this.recordingStream?.getTracks().forEach((track) => track.stop());
        this.recordingStream = null;
        this.recorder = null;
        if (!chunks.length) return;
        const type = recorder.mimeType || chunks[0].type || 'audio/webm',
          file = new File(
            [new Blob(chunks, { type })],
            `Voice note ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.${type.includes('mp4') ? 'm4a' : 'webm'}`,
            { type },
          );
        void this.importFiles([file], this.centerPoint(), this.formatDuration(seconds)).catch(() =>
          this.activityError.set('The recording could not be added to this board.'),
        );
      };
      recorder.start(250);
      this.recordingInterval = setInterval(() => {
        const elapsed =
          this.recordingElapsedMs +
          (this.recordingPaused() ? 0 : Date.now() - this.recordingStartedAt);
        this.recordingSeconds.set(Math.floor(elapsed / 1000));
        if (elapsed >= 180_000) this.stopVoiceRecording(true);
      }, 250);
    } catch {
      this.activityError.set(
        'Microphone access was blocked. Allow microphone access and try again.',
      );
      this.isRecording.set(false);
      this.recordingStream?.getTracks().forEach((track) => track.stop());
      this.recordingStream = null;
    }
  }
  formatDuration(seconds: number): string {
    return `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, '0')}`;
  }
  toggleVoicePause(): void {
    const recorder = this.recorder;
    if (!recorder || !this.isRecording()) return;
    if (recorder.state === 'recording') {
      this.recordingElapsedMs += Date.now() - this.recordingStartedAt;
      recorder.pause();
      this.recordingPaused.set(true);
    } else if (recorder.state === 'paused') {
      this.recordingStartedAt = Date.now();
      recorder.resume();
      this.recordingPaused.set(false);
    }
  }
  stopVoiceRecording(save: boolean): void {
    if (this.recordingInterval) clearInterval(this.recordingInterval);
    this.recordingInterval = null;
    const recorder = this.recorder;
    if (recorder && recorder.state !== 'inactive') {
      if (!save) recorder.onstop = null;
      recorder.stop();
    } else {
      this.recordingStream?.getTracks().forEach((track) => track.stop());
      this.recordingStream = null;
      this.recorder = null;
    }
    this.isRecording.set(false);
    this.recordingPaused.set(false);
  }
  openMediaFiles(): void {
    this.finishEditing();
    this.paletteOpen.set(false);
    this.pendingType.set(null);
    this.replaceId = null;
    this.imagePlacement = this.centerPoint();
    const input = this.fileInput()?.nativeElement;
    if (input) {
      input.accept = 'image/*,audio/*,video/*,.pdf,.txt,.doc,.docx';
      input.click();
    }
  }
  loadSpotifyEmbed(): void {
    const value = this.spotifyLink().trim();
    const uri = value.match(/^spotify:(track|playlist|album|artist|episode|show):([A-Za-z0-9]+)$/i);
    let match = uri;
    if (!match) {
      try {
        const url = new URL(value);
        if (url.hostname !== 'open.spotify.com') throw new Error();
        match = url.pathname.match(
          /^\/(track|playlist|album|artist|episode|show)\/([A-Za-z0-9]+)/i,
        );
      } catch {
        match = null;
      }
    }
    if (!match) {
      this.activityError.set('Paste a Spotify track, playlist, album, or show link.');
      return;
    }
    const kind = match[1].toLowerCase(),
      id = match[2];
    this.spotifyEmbedHeight.set(['playlist', 'album', 'artist', 'show'].includes(kind) ? 352 : 152);
    this.spotifyEmbed.set(
      this.sanitizer.bypassSecurityTrustResourceUrl(
        `https://open.spotify.com/embed/${kind}/${id}?utm_source=thread&theme=0`,
      ),
    );
    this.activityError.set('');
  }
  setBoardAudio(event: Event): void {
    this.selectedBoardAudioId.set((event.target as HTMLSelectElement).value);
  }
  selectedBoardAudioUrl(): string | null {
    return (
      this.boardAudioItems().find((item) => item.id === this.selectedBoardAudioId())?.url || null
    );
  }
  voiceAudioElement(id: string): HTMLAudioElement | null {
    return document.querySelector<HTMLAudioElement>(`audio[data-voice-id="${CSS.escape(id)}"]`);
  }
  toggleVoicePlayback(id: string): void {
    const audio = this.voiceAudioElement(id);
    if (!audio) return;
    if (audio.paused) {
      if (audio.ended) audio.currentTime = 0;
      void audio.play().catch(() => this.syncVoicePlayback(id, audio));
    } else audio.pause();
  }
  syncVoicePlayback(id: string, audio: HTMLAudioElement): void {
    const ended = audio.ended;
    const current =
      ended && Number.isFinite(audio.duration)
        ? audio.duration
        : Number.isFinite(audio.currentTime)
          ? audio.currentTime
          : 0;
    const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
    this.voicePlayback.update((state) => ({
      ...state,
      [id]: { current, duration, playing: !audio.paused && !ended },
    }));
    if (!audio.paused && !ended) this.startVoiceFrame(id, audio);
    else this.stopVoiceFrame(id);
  }
  private startVoiceFrame(id: string, audio: HTMLAudioElement): void {
    if (this.voiceFrames.has(id)) return;
    const tick = () => {
      if (audio.paused || audio.ended) {
        this.voiceFrames.delete(id);
        this.syncVoicePlayback(id, audio);
        return;
      }
      this.syncVoicePlaybackState(id, audio);
      this.voiceFrames.set(id, requestAnimationFrame(tick));
    };
    this.voiceFrames.set(id, requestAnimationFrame(tick));
  }
  private syncVoicePlaybackState(id: string, audio: HTMLAudioElement): void {
    this.voicePlayback.update((state) => ({
      ...state,
      [id]: {
        current: Number.isFinite(audio.currentTime) ? audio.currentTime : 0,
        duration: Number.isFinite(audio.duration) ? audio.duration : 0,
        playing: !audio.paused && !audio.ended,
      },
    }));
  }
  private stopVoiceFrame(id: string): void {
    const frame = this.voiceFrames.get(id);
    if (frame !== undefined) cancelAnimationFrame(frame);
    this.voiceFrames.delete(id);
  }
  seekVoice(id: string, event: Event): void {
    const audio = this.voiceAudioElement(id),
      input = event.target as HTMLInputElement;
    if (!audio || !audio.duration) return;
    audio.currentTime = Number(input.value);
    this.syncVoicePlayback(id, audio);
  }
  voiceTime(id: string, duration = false): string {
    const state = this.voicePlayback()[id];
    return this.formatDuration(Math.floor(duration ? state?.duration || 0 : state?.current || 0));
  }
  voiceProgress(id: string): number {
    const state = this.voicePlayback()[id];
    return state?.duration ? (state.current / state.duration) * 100 : 0;
  }
  voiceWaveform(item: CanvasItem): number[] {
    return item.waveform?.length
      ? item.waveform
      : Array.from(
          { length: 48 },
          (_, i) => 0.18 + Math.abs(Math.sin(i * 1.71) * Math.cos(i * 0.39)) * 0.62,
        );
  }
  seekVoiceAt(id: string, event: PointerEvent): void {
    const audio = this.voiceAudioElement(id),
      bar = event.currentTarget as HTMLElement;
    if (!audio?.duration) return;
    const bounds = bar.getBoundingClientRect(),
      ratio = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
    audio.currentTime = ratio * audio.duration;
    this.syncVoicePlayback(id, audio);
  }
  waveformKey(id: string, event: KeyboardEvent): void {
    if (
      event.key !== 'ArrowLeft' &&
      event.key !== 'ArrowRight' &&
      event.key !== 'Home' &&
      event.key !== 'End'
    )
      return;
    event.preventDefault();
    const audio = this.voiceAudioElement(id);
    if (!audio?.duration) return;
    audio.currentTime =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? audio.duration
          : Math.max(
              0,
              Math.min(audio.duration, audio.currentTime + (event.key === 'ArrowRight' ? 2 : -2)),
            );
    this.syncVoicePlayback(id, audio);
  }
  openMedia(kind: 'gif' | 'sticker'): void {
    this.finishEditing();
    this.inspectorOpen.set(false);
    this.selectedConnectionId.set(null);
    this.paletteOpen.set(false);
    this.pendingType.set(null);
    this.mediaPicker.set(kind);
    this.pendingAsset.set(null);
  }
  pickMedia(asset: PickedMedia): void {
    this.mediaPicker.set(null);
    this.pendingAsset.set(asset);
    this.assetPreview.set(this.centerPoint());
    this.selectedIds.set([]);
    this.sketchEraser.set(false);
    this.tool.set('select');
  }
  placeMedia(asset: PickedMedia, point: { x: number; y: number }): void {
    const scale = Math.min(1, 280 / asset.width, 220 / asset.height);
    const width = Math.round(asset.width * scale),
      height = Math.round(asset.height * scale);
    const item: CanvasItem = {
      id: canvasId(),
      type: asset.kind,
      parentId: this.containerAt(point)?.id || null,
      x: point.x - width / 2,
      y: point.y - height / 2,
      width,
      height,
      title: asset.name,
      image: asset.src,
      assetId: asset.id,
      rotation: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.snapshot();
    this.items.update((items) => [...items, item]);
    this.selectedIds.set([item.id]);
    this.pendingAsset.set(null);
    this.assetPreview.set(null);
    this.tool.set('select');
  }
  brushSize(): number {
    return brushDiameter(this.brush(), this.brushWidth());
  }
  brushOpacity(): number {
    return this.brush() === 'highlighter' ? 0.34 : this.brush() === 'marker' ? 0.9 : 1;
  }
  readonly currentStroke = computed<SketchStroke | null>(() =>
    this.sketchPoints().length
      ? {
          id: 'current',
          brush: this.brush(),
          points: this.sketchPoints().map((point) => ({
            x: point.x,
            y: point.y,
            pressure: point.pressure ?? 0.5,
          })),
          color: this.sketchColor(),
          size: this.brushWidth(),
          opacity: this.brushOpacity(),
        }
      : null,
  );
  readonly activeRendered = computed(() =>
    this.activeSketchStrokes().map((stroke) => ({ stroke, path: strokeOutlinePath(stroke) })),
  );
  strokeOutlinePath(stroke: SketchStroke): string {
    return strokeOutlinePath(stroke, false);
  }

  @HostListener('window:keydown', ['$event'])
  keyDown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement;
    if (event.key === 'Escape' && this.session) {
      const viewport = this.viewport()?.nativeElement;
      this.pointerCancel({
        pointerId: this.session.pointerId,
        currentTarget: viewport,
      } as unknown as PointerEvent);
      return;
    }
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable) {
      if (event.key === 'Escape' && this.editingId()) {
        event.preventDefault();
        target.blur();
        this.finishEditing();
        return;
      }
      if (
        event.key !== 'Escape' ||
        !(
          this.pendingType() ||
          this.pendingAsset() ||
          this.mediaPicker() ||
          this.paletteOpen() ||
          this.tool() !== 'select'
        )
      )
        return;
    }
    if (event.code === 'Space') {
      event.preventDefault();
      this.spaceHeld.set(true);
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
      event.preventDefault();
      this.selectedIds.set(this.visibleItems().map((item) => item.id));
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
      event.preventDefault();
      this.copy();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'x') {
      event.preventDefault();
      this.copy();
      this.removeSelected();
      return;
    }
    if (
      (event.ctrlKey || event.metaKey) &&
      event.key.toLowerCase() === 'v' &&
      this.clipboard.length
    ) {
      event.preventDefault();
      this.paste();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      event.shiftKey ? this.redo() : this.undo();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      this.redo();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') {
      event.preventDefault();
      this.duplicate();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'g') {
      event.preventDefault();
      event.shiftKey ? this.ungroupSelected() : this.groupSelected();
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      if (this.selectedConnectionId()) this.removeSelectedConnection();
      else this.removeSelected();
      return;
    }
    if (event.key === 'Escape') {
      if (this.cropId()) {
        this.finishCrop(false);
        return;
      }
      if (this.editingId()) {
        this.finishEditing();
        this.tool.set('select');
        return;
      }
      if (this.pendingAsset()) {
        this.pendingAsset.set(null);
        return;
      }
      if (this.mediaPicker()) {
        this.mediaPicker.set(null);
        return;
      }
      if (this.pendingType()) {
        this.pendingType.set(null);
        this.tool.set('select');
        return;
      }
      if (this.paletteOpen()) {
        this.paletteOpen.set(false);
        this.tool.set('select');
        return;
      }
      if (this.tool() !== 'select') {
        this.setTool('select');
        return;
      }
      this.connectionSourceId.set(null);
      this.selectedConnectionId.set(null);
      this.selectedIds.set([]);
      return;
    }
    if (event.key === 'Enter' && this.cropId()) {
      this.finishCrop(true);
      return;
    }
    if (event.key === 'Enter' && this.selected()?.type === 'shape') {
      event.preventDefault();
      this.startEditing(this.selected()!.id);
      return;
    }
    const keys: Record<string, Tool> = {
      v: 'select',
      h: 'hand',
      t: 'text',
      n: 'add',
      c: 'connect',
      s: 'shape',
      p: 'sketch',
    };
    if (keys[event.key.toLowerCase()]) this.setTool(keys[event.key.toLowerCase()]);
  }
  @HostListener('window:keyup', ['$event']) keyUp(event: KeyboardEvent): void {
    if (event.code === 'Space') this.spaceHeld.set(false);
  }
  @HostListener('window:blur') blur(): void {
    this.spaceHeld.set(false);
    this.cancelConnectorGesture();
    this.session = null;
    this.isPanning.set(false);
    this.pointers.clear();
    this.pinch = null;
    this.clearConnectionDraft();
  }

  private point(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.viewport()?.nativeElement.getBoundingClientRect();
    return {
      x: (clientX - (rect?.left || 0) - this.panX()) / this.zoom(),
      y: (clientY - (rect?.top || 0) - this.panY()) / this.zoom(),
    };
  }
  isConnectable(item: CanvasItem): boolean {
    return isConnectableItem(item);
  }
  private clearConnectionDraft(): void {
    this.connectionPreview.set(null);
    this.connectionTargetId.set(null);
    this.precisePreview.set(null);
    this.junctionCandidate.set(null);
  }
  private cancelConnectorGesture(): boolean {
    if (
      !this.session ||
      !['connect', 'rebind', 'branch', 'route', 'junction-slide'].includes(this.session.kind)
    )
      return false;
    if (this.session.before) {
      this.items.set(this.session.before.items);
      this.connections.set(this.session.before.connections);
      this.junctions.set(this.session.before.junctions || []);
      this.datasetStore.replace(this.session.before.datasets || []);
    }
    this.session = null;
    this.clearConnectionDraft();
    return true;
  }
  private closestSide(item: CanvasItem, point: { x: number; y: number }): ConnectorSide {
    return connectorSides.reduce(
      (best, side) =>
        Math.hypot(sidePoint(item, side).x - point.x, sidePoint(item, side).y - point.y) <
        Math.hypot(sidePoint(item, best).x - point.x, sidePoint(item, best).y - point.y)
          ? side
          : best,
      'right' as ConnectorSide,
    );
  }
  private beginTouch(event: PointerEvent): boolean {
    if (event.pointerType !== 'touch') return false;
    if (
      this.session &&
      ['connect', 'rebind', 'branch', 'route', 'junction-slide'].includes(this.session.kind)
    )
      return false;
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
    if (this.pointers.size < 2) return false;
    if (this.session?.before) {
      this.items.set(this.session.before.items);
      this.connections.set(this.session.before.connections);
      this.junctions.set(this.session.before.junctions || []);
      this.datasetStore.replace(this.session.before.datasets || []);
    }
    const [a, b] = [...this.pointers.values()];
    this.pinch = {
      distance: Math.hypot(a.x - b.x, a.y - b.y),
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
    };
    this.session = null;
    this.sketchPoints.set([]);
    this.marquee.set(null);
    this.placement.set(null);
    this.snapGuide.set(null);
    this.transformGuide.set(null);
    this.isPanning.set(false);
    return true;
  }
  private beginPan(event: PointerEvent, capture: Element = event.currentTarget as Element): void {
    if (this.beginTouch(event)) return;
    if (this.session) return;
    this.session = {
      kind: 'pan',
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      x: this.panX(),
      y: this.panY(),
    };
    this.isPanning.set(true);
    capture.setPointerCapture(event.pointerId);
  }
  pointerDown(event: PointerEvent): void {
    if (event.button !== 0 && event.button !== 1) return;
    if (this.pendingAsset()) {
      this.placeMedia(this.pendingAsset()!, this.point(event.clientX, event.clientY));
      return;
    }
    if (this.beginTouch(event)) return;
    if (this.session) return;
    const point = this.point(event.clientX, event.clientY);
    if (event.button === 1 || this.spaceHeld() || this.tool() === 'hand') {
      this.session = {
        kind: 'pan',
        pointerId: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY,
        x: this.panX(),
        y: this.panY(),
      };
      this.isPanning.set(true);
    } else if (this.pendingType()) {
      this.session = {
        kind: 'place',
        pointerId: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY,
        x: point.x,
        y: point.y,
      };
      if (this.pendingType() === 'zone' || this.pendingType() === 'shape')
        this.placement.set({ x: point.x, y: point.y, width: 0, height: 0 });
    } else if (this.tool() === 'text') {
      this.createAt('text', point);
      return;
    } else if (this.tool() === 'sketch') {
      this.session = {
        kind: this.sketchEraser() ? 'erase' : 'sketch',
        pointerId: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY,
        x: point.x,
        y: point.y,
      };
      if (this.sketchEraser()) {
        this.snapshot();
        this.eraseSketchAt(point);
      } else this.sketchPoints.set([{ ...point, pressure: event.pressure || 0.5 }]);
    } else if (this.tool() === 'select') {
      this.finishEditing();
      this.selectedConnectionId.set(null);
      if (!event.shiftKey) this.selectedIds.set([]);
      this.session = {
        kind: 'marquee',
        pointerId: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY,
        x: point.x,
        y: point.y,
      };
    } else if (this.tool() === 'connect') this.connectionSourceId.set(null);
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }
  itemPointerDown(event: PointerEvent, item: CanvasItem): void {
    if (event.button !== 0) return;
    if (this.pendingType() || this.pendingAsset() || this.tool() === 'text') {
      event.stopPropagation();
      this.pointerDown(event);
      return;
    }
    event.stopPropagation();
    if (this.beginTouch(event)) return;
    this.selectedConnectionId.set(null);
    if (this.tool() === 'shape') return;
    if (item.type === 'sketch' && this.tool() === 'select') {
      const point = this.point(event.clientX, event.clientY),
        angle = (-(item.rotation || 0) * Math.PI) / 180;
      const dx = point.x - item.x - item.width / 2,
        dy = point.y - item.y - item.height / 2;
      const local = {
        x:
          ((dx * Math.cos(angle) - dy * Math.sin(angle) + item.width / 2) *
            (item.sourceWidth || item.width)) /
          item.width,
        y:
          ((dx * Math.sin(angle) + dy * Math.cos(angle) + item.height / 2) *
            (item.sourceHeight || item.height)) /
          item.height,
      };
      const stroke = item.sketchStrokes?.[0];
      if (
        stroke &&
        distanceToStroke(local, stroke) >
          Math.max(10 / this.zoom(), brushDiameter(stroke.brush, stroke.size) / 2 + 4)
      ) {
        this.selectedIds.set([]);
        return;
      }
    }
    if (this.cropId() === item.id) {
      this.session = {
        kind: 'crop',
        pointerId: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY,
        x: item.cropX || 0,
        y: item.cropY || 0,
        itemId: item.id,
      };
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
      return;
    }
    if (this.spaceHeld() || this.tool() === 'hand') {
      this.session = {
        kind: 'pan',
        pointerId: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY,
        x: this.panX(),
        y: this.panY(),
      };
      this.isPanning.set(true);
    } else if (this.tool() === 'connect') {
      if (!isConnectableItem(item)) return;
      const source = this.connectionSourceId();
      if (source && source !== item.id) {
        this.addConnection(source, item.id);
        this.setTool('select');
      } else {
        this.connectionSourceId.set(item.id);
        this.selectedIds.set([item.id]);
      }
      return;
    } else {
      this.finishEditing();
      const current = this.selectedIds();
      const members = item.groupId
        ? this.items()
            .filter((entry) => entry.groupId === item.groupId)
            .map((entry) => entry.id)
        : [item.id];
      this.selectedIds.set(
        event.shiftKey
          ? current.includes(item.id)
            ? current.filter((id) => !members.includes(id))
            : [...new Set([...current, ...members])]
          : current.includes(item.id)
            ? current
            : members,
      );
      if (event.shiftKey || this.tool() !== 'select' || item.locked) return;
      if (
        ['zone', 'workspace', 'frame'].includes(item.type) &&
        !(event.target as Element).closest('.zone-label')
      )
        return;
      const moving = new Set(this.selectedIds());
      let changed = true;
      while (changed) {
        changed = false;
        for (const child of this.items())
          if (child.parentId && moving.has(child.parentId) && !moving.has(child.id)) {
            moving.add(child.id);
            changed = true;
          }
      }
      const origins = new Map(
        this.items()
          .filter((entry) => moving.has(entry.id))
          .map((entry) => [entry.id, { x: entry.x, y: entry.y }]),
      );
      this.session = {
        kind: 'move',
        pointerId: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY,
        x: item.x,
        y: item.y,
        itemId: item.id,
        origins,
        before: this.state(),
      };
    }
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }
  resizeDown(
    event: PointerEvent,
    item: CanvasItem,
    corner: 'nw' | 'ne' | 'sw' | 'se' = 'se',
  ): void {
    event.stopPropagation();
    this.session = {
      kind: 'resize',
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      x: item.width,
      y: item.height,
      itemId: item.id,
      corner,
      before: this.state(),
    };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }
  rotateDown(event: PointerEvent, item: CanvasItem): void {
    event.stopPropagation();
    const point = this.point(event.clientX, event.clientY);
    const angle = Math.atan2(point.y - item.y - item.height / 2, point.x - item.x - item.width / 2);
    this.session = {
      kind: 'rotate',
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      x: angle,
      y: item.rotation || 0,
      itemId: item.id,
      before: this.state(),
    };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }
  rotateGroupDown(event: PointerEvent): void {
    event.stopPropagation();
    const bounds = this.groupBounds();
    if (!bounds) return;
    const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 },
      point = this.point(event.clientX, event.clientY);
    this.session = {
      kind: 'rotate',
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      x: Math.atan2(point.y - center.y, point.x - center.x),
      y: 0,
      groupCenter: center,
      groupIds: [...this.selectedIds()],
      before: this.state(),
    };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }
  connectDown(event: PointerEvent, item: CanvasItem, side: ConnectorSide = 'right'): void {
    if (!isConnectableItem(item)) return;
    event.preventDefault();
    event.stopPropagation();
    const anchor = sidePoint(item, side);
    this.session = {
      kind: 'connect',
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      x: anchor.x,
      y: anchor.y,
      itemId: item.id,
      side,
    };
    this.connectionPreview.set({ x1: anchor.x, y1: anchor.y, x2: anchor.x, y2: anchor.y });
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }
  selectConnection(event: PointerEvent, connection: CanvasConnection): void {
    if (this.tool() !== 'select' && this.tool() !== 'connect') return;
    event.stopPropagation();
    this.selectedIds.set([]);
    this.selectedConnectionId.set(connection.id);
    this.inspectorOpen.set(false);
  }
  private linePoints(connection: CanvasConnection): { x: number; y: number }[] {
    return [...this.connectionPath(connection).matchAll(/[ML]\s*(-?[\d.]+)\s+(-?[\d.]+)/g)].map(
      (match) => ({ x: Number(match[1]), y: Number(match[2]) }),
    );
  }
  private connectorRoutePoints(connection: CanvasConnection): { x: number; y: number }[] {
    const routed = this.erRoutes().get(connection.id);
    if (!routed || !connection.routeOffset || routed.points.length < 3)
      return routed?.points.map((point) => ({ ...point })) || this.linePoints(connection);
    const points = routed.points.map((point) => ({ ...point }));
    let segment = 1,
      longest = -1;
    for (let index = 1; index < points.length; index++) {
      const length = Math.hypot(
        points[index].x - points[index - 1].x,
        points[index].y - points[index - 1].y,
      );
      if (length > longest) {
        longest = length;
        segment = index;
      }
    }
    const a = points[segment - 1],
      b = points[segment];
    const axis = connection.routeAxis || (Math.abs(a.x - b.x) < Math.abs(a.y - b.y) ? 'x' : 'y');
    const delta = connection.routeOffset;
    if (axis === 'x') {
      if (segment > 1) points[segment - 1].x += delta;
      if (segment < points.length - 1) points[segment].x += delta;
    } else {
      if (segment > 1) points[segment - 1].y += delta;
      if (segment < points.length - 1) points[segment].y += delta;
    }
    return points;
  }
  private pathPoint(connection: CanvasConnection, ratio: number): { x: number; y: number } {
    const points = this.linePoints(connection);
    if (!points.length) return { x: 0, y: 0 };
    const lengths = points
      .slice(1)
      .map((point, index) => Math.hypot(point.x - points[index].x, point.y - points[index].y));
    let remaining =
      lengths.reduce((sum, length) => sum + length, 0) * Math.max(0, Math.min(1, ratio));
    for (let index = 0; index < lengths.length; index++) {
      if (remaining <= lengths[index] || index === lengths.length - 1) {
        const t = lengths[index] ? Math.min(1, remaining / lengths[index]) : 0;
        return {
          x: points[index].x + (points[index + 1].x - points[index].x) * t,
          y: points[index].y + (points[index + 1].y - points[index].y) * t,
        };
      }
      remaining -= lengths[index];
    }
    return points[0];
  }
  junctionPoint(junction: CanvasJunction): { x: number; y: number } {
    const parent = this.connections().find((entry) => entry.id === junction.parentConnectorId);
    return parent ? this.pathPoint(parent, junction.positionRatio) : { x: 0, y: 0 };
  }
  private nearestOnConnection(
    connection: CanvasConnection,
    point: { x: number; y: number },
  ): { connectionId: string; ratio: number; x: number; y: number; distance: number } {
    const points = this.linePoints(connection);
    const lengths = points
      .slice(1)
      .map((next, index) => Math.hypot(next.x - points[index].x, next.y - points[index].y));
    const total = lengths.reduce((sum, length) => sum + length, 0) || 1;
    let traveled = 0,
      best = {
        connectionId: connection.id,
        ratio: 0,
        x: points[0]?.x || 0,
        y: points[0]?.y || 0,
        distance: Infinity,
      };
    for (let index = 0; index < lengths.length; index++) {
      const a = points[index],
        b = points[index + 1],
        dx = b.x - a.x,
        dy = b.y - a.y;
      const t = Math.max(
        0,
        Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (lengths[index] ** 2 || 1)),
      );
      const x = a.x + dx * t,
        y = a.y + dy * t,
        distance = Math.hypot(point.x - x, point.y - y);
      if (distance < best.distance)
        best = {
          connectionId: connection.id,
          ratio: (traveled + lengths[index] * t) / total,
          x,
          y,
          distance,
        };
      traveled += lengths[index];
    }
    return best;
  }
  private joinCandidate(point: { x: number; y: number }, excludeId?: string) {
    let best: ReturnType<CanvasPage['nearestOnConnection']> | null = null;
    for (const connection of this.visibleConnections()) {
      if (
        connection.id === excludeId ||
        connection.kind === 'curved' ||
        this.dependsOn(connection.id, excludeId)
      )
        continue;
      const candidate = this.nearestOnConnection(connection, point);
      if (candidate.distance < 14 / this.zoom() && (!best || candidate.distance < best.distance))
        best = candidate;
    }
    return best;
  }
  private dependsOn(id: string, ancestor?: string, seen = new Set<string>()): boolean {
    if (!ancestor || seen.has(id)) return false;
    if (id === ancestor) return true;
    seen.add(id);
    const connection = this.connections().find((entry) => entry.id === id);
    return (
      !!connection &&
      [connection.sourceJunctionId, connection.targetJunctionId].some((jid) => {
        const parent = this.junctions().find((j) => j.id === jid)?.parentConnectorId;
        return !!parent && this.dependsOn(parent, ancestor, seen);
      })
    );
  }
  private getOrCreateJunction(candidate: {
    connectionId: string;
    ratio: number;
    x: number;
    y: number;
  }): CanvasJunction {
    const existing = this.junctions().find(
      (j) =>
        j.parentConnectorId === candidate.connectionId &&
        Math.hypot(this.junctionPoint(j).x - candidate.x, this.junctionPoint(j).y - candidate.y) <
          12 / this.zoom(),
    );
    if (existing) return existing;
    const junction = {
      id: canvasId(),
      parentConnectorId: candidate.connectionId,
      positionRatio: candidate.ratio,
    };
    this.junctions.update((entries) => [...entries, junction]);
    return junction;
  }
  connectionHover(event: PointerEvent, connection: CanvasConnection): void {
    if (this.session || this.editingId() || (this.tool() !== 'select' && this.tool() !== 'connect'))
      return;
    const candidate = this.nearestOnConnection(
      connection,
      this.point(event.clientX, event.clientY),
    );
    this.junctionCandidate.set(candidate);
  }
  connectionLeave(connection: CanvasConnection): void {
    if (!this.session && this.junctionCandidate()?.connectionId === connection.id)
      this.junctionCandidate.set(null);
  }
  canBranch(connection: CanvasConnection): boolean {
    return !connection.sourceFieldId && !connection.targetFieldId && connection.kind !== 'curved';
  }
  branchDown(event: PointerEvent, connection: CanvasConnection): void {
    if ((this.tool() !== 'select' && this.tool() !== 'connect') || !this.canBranch(connection))
      return;
    event.preventDefault();
    event.stopPropagation();
    this.finishEditing();
    this.selectedIds.set([]);
    this.selectedConnectionId.set(connection.id);
    this.inspectorOpen.set(false);
    const candidate = this.nearestOnConnection(
      connection,
      this.point(event.clientX, event.clientY),
    );
    this.session = {
      kind: 'branch',
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      x: candidate.x,
      y: candidate.y,
      connectionId: connection.id,
      ratio: candidate.ratio,
    };
    this.connectionPreview.set({
      x1: candidate.x,
      y1: candidate.y,
      x2: candidate.x,
      y2: candidate.y,
    });
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
  }
  junctionDown(event: PointerEvent, junction: CanvasJunction): void {
    const parent = this.connections().find(
      (connection) => connection.id === junction.parentConnectorId,
    );
    if (!parent || !this.canBranch(parent)) return;
    event.preventDefault();
    event.stopPropagation();
    this.selectedIds.set([]);
    this.selectedConnectionId.set(parent.id);
    this.inspectorOpen.set(false);
    const point = this.junctionPoint(junction);
    if (event.shiftKey)
      this.session = {
        kind: 'junction-slide',
        pointerId: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY,
        x: point.x,
        y: point.y,
        junctionId: junction.id,
        connectionId: parent.id,
        before: this.state(),
      };
    else {
      this.session = {
        kind: 'branch',
        pointerId: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY,
        x: point.x,
        y: point.y,
        connectionId: parent.id,
        junctionId: junction.id,
        ratio: junction.positionRatio,
      };
      this.connectionPreview.set({ x1: point.x, y1: point.y, x2: point.x, y2: point.y });
    }
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
  }
  endpoint(connection: CanvasConnection, terminal: 'source' | 'target'): { x: number; y: number } {
    const ends = this.connectionEnds(connection);
    return terminal === 'source' ? ends.a : ends.b;
  }
  rebindDown(
    event: PointerEvent,
    connection: CanvasConnection,
    terminal: 'source' | 'target',
  ): void {
    event.preventDefault();
    event.stopPropagation();
    this.selectedIds.set([]);
    this.selectedConnectionId.set(connection.id);
    const end = this.endpoint(connection, terminal);
    this.session = {
      kind: 'rebind',
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      x: end.x,
      y: end.y,
      connectionId: connection.id,
      terminal,
    };
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
  }
  routeHandle(connection: CanvasConnection): { x: number; y: number } {
    const routed = this.erRoutes().get(connection.id);
    if (routed) {
      const points = this.connectorRoutePoints(connection);
      let best = -1,
        label = routed.label;
      for (let index = 1; index < points.length; index++) {
        const a = points[index - 1],
          b = points[index],
          length = Math.hypot(b.x - a.x, b.y - a.y);
        if (length > best) {
          best = length;
          label = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        }
      }
      return label;
    }
    if ((!connection.kind || connection.kind === 'elbow') && !connection.routeOffset) {
      const matches = [
        ...this.connectionPath(connection).matchAll(/[ML]\s*(-?[\d.]+)\s+(-?[\d.]+)/g),
      ];
      const points = matches.map((match) => ({ x: Number(match[1]), y: Number(match[2]) }));
      let best = -1,
        label = points[0] || { x: 0, y: 0 };
      for (let index = 1; index < points.length; index++) {
        const a = points[index - 1],
          b = points[index],
          length = Math.hypot(b.x - a.x, b.y - a.y);
        if (length > best) {
          best = length;
          label = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        }
      }
      return label;
    }
    const { a, b, source, target } = this.connectionEnds(connection),
      horizontal = this.horizontalConnection(source, target);
    return horizontal
      ? { x: (a.x + b.x) / 2 + (connection.routeOffset || 0), y: (a.y + b.y) / 2 }
      : { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 + (connection.routeOffset || 0) };
  }
  branchControlPoint(connection: CanvasConnection): { x: number; y: number } {
    const point = this.routeHandle(connection);
    return { x: point.x + 27 / this.zoom(), y: point.y - 27 / this.zoom() };
  }
  routeDown(event: PointerEvent, connection: CanvasConnection): void {
    if (this.tool() !== 'select') return;
    event.preventDefault();
    event.stopPropagation();
    this.finishEditing();
    this.selectedIds.set([]);
    this.selectedConnectionId.set(connection.id);
    this.inspectorOpen.set(false);
    const point = this.point(event.clientX, event.clientY),
      points = this.linePoints(connection),
      ends = this.connectionEnds(connection);
    let best = Infinity,
      axis: 'x' | 'y' =
        connection.routeAxis || (this.horizontalConnection(ends.source, ends.target) ? 'x' : 'y'),
      lane = axis === 'x' ? (ends.a.x + ends.b.x) / 2 : (ends.a.y + ends.b.y) / 2;
    for (let index = 1; index < points.length; index++) {
      const a = points[index - 1],
        b = points[index],
        dx = b.x - a.x,
        dy = b.y - a.y;
      const t = Math.max(
        0,
        Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy || 1)),
      );
      const distance = Math.hypot(point.x - a.x - dx * t, point.y - a.y - dy * t);
      if (distance < best && Math.abs(dx) + Math.abs(dy) > 1) {
        best = distance;
        axis = Math.abs(dx) < Math.abs(dy) ? 'x' : 'y';
        lane = axis === 'x' ? a.x : a.y;
      }
    }
    if (this.erRoutes().has(connection.id)) {
      const routePoints = this.erRoutes().get(connection.id)!.points;
      let segmentIndex = 1,
        segmentLength = -1;
      for (let index = 1; index < routePoints.length; index++) {
        const a = routePoints[index - 1],
          b = routePoints[index],
          length = Math.hypot(b.x - a.x, b.y - a.y);
        if (length > segmentLength) {
          segmentLength = length;
          segmentIndex = index;
        }
      }
      const a = routePoints[segmentIndex - 1],
        b = routePoints[segmentIndex];
      axis = Math.abs(a.x - b.x) < Math.abs(a.y - b.y) ? 'x' : 'y';
      lane = axis === 'x' ? a.x : a.y;
    }
    const midpoint = axis === 'x' ? (ends.a.x + ends.b.x) / 2 : (ends.a.y + ends.b.y) / 2;
    this.session = {
      kind: 'route',
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      x: lane - midpoint,
      y: axis === 'x' ? 1 : 0,
      connectionId: connection.id,
      before: this.state(),
    };
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
  }
  pointerMove(event: PointerEvent): void {
    if (this.pendingAsset()) this.assetPreview.set(this.point(event.clientX, event.clientY));
    if (this.pointers.has(event.pointerId)) {
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (this.pointers.size === 2 && this.pinch) {
        const [a, b] = [...this.pointers.values()];
        const distance = Math.hypot(a.x - b.x, a.y - b.y),
          x = (a.x + b.x) / 2,
          y = (a.y + b.y) / 2;
        this.panX.update((v) => v + x - this.pinch!.x);
        this.panY.update((v) => v + y - this.pinch!.y);
        this.zoomAt(x, y, (this.zoom() * distance) / Math.max(1, this.pinch.distance));
        this.pinch = { distance, x, y };
        return;
      }
    }
    const session = this.session;
    if (!session || session.pointerId !== event.pointerId) return;
    const dx = event.clientX - session.clientX;
    const dy = event.clientY - session.clientY;
    if (Math.abs(dx) + Math.abs(dy) > 3) session.moved = true;
    if (session.kind === 'pan') {
      this.panX.set(session.x + dx);
      this.panY.set(session.y + dy);
    }
    if (session.kind === 'move' && session.origins && session.moved) {
      let offsetX = dx / this.zoom(),
        offsetY = dy / this.zoom();
      const moving = this.items().find((item) => item.id === session.itemId);
      const origin = moving && session.origins.get(moving.id);
      let guideX: number | undefined, guideY: number | undefined;
      if (moving && origin) {
        const ownX = [
          origin.x + offsetX,
          origin.x + offsetX + moving.width / 2,
          origin.x + offsetX + moving.width,
        ];
        const ownY = [
          origin.y + offsetY,
          origin.y + offsetY + moving.height / 2,
          origin.y + offsetY + moving.height,
        ];
        let bestX = 6 / this.zoom(),
          bestY = 6 / this.zoom(),
          snapX = 0,
          snapY = 0;
        for (const other of this.items()) {
          if (session.origins.has(other.id)) continue;
          for (const target of [other.x, other.x + other.width / 2, other.x + other.width])
            for (const value of ownX) {
              const distance = Math.abs(target - value);
              if (distance < bestX) {
                bestX = distance;
                guideX = target;
                snapX = target - value;
              }
            }
          for (const target of [other.y, other.y + other.height / 2, other.y + other.height])
            for (const value of ownY) {
              const distance = Math.abs(target - value);
              if (distance < bestY) {
                bestY = distance;
                guideY = target;
                snapY = target - value;
              }
            }
        }
        offsetX += snapX;
        offsetY += snapY;
      }
      this.snapGuide.set(
        guideX !== undefined || guideY !== undefined ? { x: guideX, y: guideY } : null,
      );
      this.items.update((items) =>
        items.map((item) => {
          const start = session.origins!.get(item.id);
          return start ? { ...item, x: start.x + offsetX, y: start.y + offsetY } : item;
        }),
      );
      this.queueTransformSync();
    }
    if (session.kind === 'resize') {
      this.items.update((items) =>
        items.map((item) => {
          if (item.id !== session.itemId) return item;
          const original = session.before!.items.find((entry) => entry.id === item.id)!;
          const corner = session.corner || 'se',
            sx = corner.endsWith('e') ? 1 : -1,
            sy = corner.startsWith('s') ? 1 : -1;
          const angle = ((original.rotation || 0) * Math.PI) / 180,
            cos = Math.cos(angle),
            sin = Math.sin(angle);
          const localX = (dx * cos + dy * sin) / this.zoom(),
            localY = (-dx * sin + dy * cos) / this.zoom();
          let width = Math.max(
            item.type === 'er-entity' ? 220 : item.type === 'text' ? 50 : 40,
            original.width + sx * localX,
          );
          let height = Math.max(
            item.type === 'er-entity' ? 136 : item.type === 'text' ? 34 : 40,
            original.height + sy * localY,
          );
          if (['image', 'gif', 'sticker', 'sketch'].includes(item.type) && !event.shiftKey) {
            const ratio = original.width / original.height;
            if (Math.abs(localX / original.width) >= Math.abs(localY / original.height))
              height = width / ratio;
            else width = height * ratio;
          }
          const oldOppX = (-sx * original.width) / 2,
            oldOppY = (-sy * original.height) / 2;
          const newOppX = (-sx * width) / 2,
            newOppY = (-sy * height) / 2;
          const anchorX = original.x + original.width / 2 + oldOppX * cos - oldOppY * sin;
          const anchorY = original.y + original.height / 2 + oldOppX * sin + oldOppY * cos;
          const centerX = anchorX - newOppX * cos + newOppY * sin;
          const centerY = anchorY - newOppX * sin - newOppY * cos;
          return { ...item, x: centerX - width / 2, y: centerY - height / 2, width, height };
        }),
      );
      const item = this.items().find((entry) => entry.id === session.itemId);
      if (item) this.setTransformGuide(`${Math.round(item.width)} × ${Math.round(item.height)}`);
      this.queueTransformSync();
    }
    if (session.kind === 'rotate' && session.itemId) {
      const item = this.items().find((entry) => entry.id === session.itemId);
      if (item) {
        const point = this.point(event.clientX, event.clientY);
        const angle = Math.atan2(
          point.y - item.y - item.height / 2,
          point.x - item.x - item.width / 2,
        );
        let rotation = session.y + ((angle - session.x) * 180) / Math.PI;
        if (event.shiftKey) rotation = Math.round(rotation / 15) * 15;
        this.update(item.id, { rotation });
        this.setTransformGuide(`${Math.round(rotation)}°`);
        this.queueTransformSync();
      }
    }
    if (session.kind === 'rotate' && session.groupCenter && session.groupIds && session.before) {
      const center = session.groupCenter,
        point = this.point(event.clientX, event.clientY);
      let delta = Math.atan2(point.y - center.y, point.x - center.x) - session.x;
      if (event.shiftKey) delta = (Math.round((delta * 180) / Math.PI / 15) * 15 * Math.PI) / 180;
      const selected = new Set(session.groupIds),
        before = new Map(session.before.items.map((item) => [item.id, item]));
      this.items.update((items) =>
        items.map((item) => {
          const original = before.get(item.id);
          if (!selected.has(item.id) || !original) return item;
          const dx = original.x + original.width / 2 - center.x,
            dy = original.y + original.height / 2 - center.y;
          return {
            ...item,
            x: center.x + dx * Math.cos(delta) - dy * Math.sin(delta) - original.width / 2,
            y: center.y + dx * Math.sin(delta) + dy * Math.cos(delta) - original.height / 2,
            rotation: (original.rotation || 0) + (delta * 180) / Math.PI,
          };
        }),
      );
      this.queueTransformSync();
    }
    if (session.kind === 'marquee') {
      const point = this.point(event.clientX, event.clientY);
      this.marquee.set({
        x: Math.min(session.x, point.x),
        y: Math.min(session.y, point.y),
        width: Math.abs(point.x - session.x),
        height: Math.abs(point.y - session.y),
      });
    }
    if (
      session.kind === 'place' &&
      (this.pendingType() === 'zone' || this.pendingType() === 'shape')
    ) {
      const point = this.point(event.clientX, event.clientY);
      this.placement.set({
        x: Math.min(session.x, point.x),
        y: Math.min(session.y, point.y),
        width: Math.abs(point.x - session.x),
        height: Math.abs(point.y - session.y),
      });
    }
    if (session.kind === 'crop' && session.itemId)
      this.update(session.itemId, {
        cropX: session.x + dx / this.zoom(),
        cropY: session.y + dy / this.zoom(),
      });
    if (session.kind === 'connect') {
      const point = this.point(event.clientX, event.clientY);
      const target = this.connectorTarget(point, session.itemId || '');
      const lineJoin = !target ? this.joinCandidate(point) : null;
      const end = target
        ? sidePoint(target, this.closestSide(target, point))
        : lineJoin
          ? { x: lineJoin.x, y: lineJoin.y }
          : point;
      this.junctionCandidate.set(lineJoin);
      this.connectionTargetId.set(target?.id || null);
      this.precisePreview.set(target ? end : lineJoin ? end : null);
      this.connectionPreview.set({ x1: session.x, y1: session.y, x2: end.x, y2: end.y });
    }
    if (session.kind === 'branch' && session.connectionId) {
      const parent = this.connections().find(
        (connection) => connection.id === session.connectionId,
      );
      if (parent) {
        const point = this.point(event.clientX, event.clientY);
        const candidate = this.connectorTarget(point, parent.sourceId);
        const target = candidate?.id === parent.targetId ? undefined : candidate;
        const end = target ? sidePoint(target, this.closestSide(target, point)) : point;
        this.connectionTargetId.set(target?.id || null);
        this.precisePreview.set(target ? end : null);
        this.connectionPreview.set({ x1: session.x, y1: session.y, x2: end.x, y2: end.y });
      }
    }
    if (session.kind === 'route' && session.connectionId && session.moved)
      this.connections.update((entries) =>
        entries.map((entry) =>
          entry.id === session.connectionId
            ? {
                ...entry,
                routeAxis: session.y ? 'x' : 'y',
                routeOffset: session.x + (session.y ? dx : dy) / this.zoom(),
              }
            : entry,
        ),
      );
    if (session.kind === 'rebind' && session.connectionId) {
      const connection = this.connections().find((entry) => entry.id === session.connectionId);
      if (connection) {
        const point = this.point(event.clientX, event.clientY),
          other = this.endpoint(connection, session.terminal === 'source' ? 'target' : 'source'),
          target = this.connectorTarget(
            point,
            session.terminal === 'source' ? connection.targetId : connection.sourceId,
          ),
          end = target ? sidePoint(target, this.closestSide(target, point)) : point;
        this.connectionTargetId.set(target?.id || null);
        this.precisePreview.set(target ? end : null);
        this.connectionPreview.set({ x1: other.x, y1: other.y, x2: end.x, y2: end.y });
      }
    }
    if (session.kind === 'junction-slide' && session.junctionId && session.connectionId) {
      const parent = this.connections().find((c) => c.id === session.connectionId);
      if (parent) {
        const candidate = this.nearestOnConnection(
          parent,
          this.point(event.clientX, event.clientY),
        );
        this.junctions.update((entries) =>
          entries.map((j) =>
            j.id === session.junctionId ? { ...j, positionRatio: candidate.ratio } : j,
          ),
        );
      }
    }
    if (session.kind === 'sketch') {
      const point = this.point(event.clientX, event.clientY);
      const last = this.sketchPoints().at(-1);
      if (!last || Math.hypot(point.x - last.x, point.y - last.y) > 1.5)
        this.sketchPoints.update((points) => [
          ...points,
          { ...point, pressure: event.pressure || 0.5 },
        ]);
    }
    if (session.kind === 'erase') this.eraseSketchAt(this.point(event.clientX, event.clientY));
  }
  pointerUp(event: PointerEvent): void {
    const wasPinching = !!this.pinch;
    this.pointers.delete(event.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    if (wasPinching) {
      const remaining = [...this.pointers.entries()][0];
      this.session = remaining
        ? {
            kind: 'pan',
            pointerId: remaining[0],
            clientX: remaining[1].x,
            clientY: remaining[1].y,
            x: this.panX(),
            y: this.panY(),
          }
        : null;
      this.isPanning.set(!!remaining);
      return;
    }
    const session = this.session;
    if (session?.pointerId !== event.pointerId) return;
    this.transformGuide.set(null);
    if (session?.kind === 'marquee' && this.marquee()) {
      const rect = this.marquee()!;
      if (rect.width > 4 || rect.height > 4)
        this.selectedIds.set(
          this.visibleItems()
            .filter(
              (item) =>
                item.x < rect.x + rect.width &&
                item.x + item.width > rect.x &&
                item.y < rect.y + rect.height &&
                item.y + item.height > rect.y,
            )
            .map((item) => item.id),
        );
    }
    if (session?.kind === 'place' && this.pendingType()) {
      const box = this.placement();
      this.createAt(
        this.pendingType()!,
        {
          x: box?.width && box.width > 10 ? box.x : session.x,
          y: box?.height && box.height > 10 ? box.y : session.y,
        },
        box?.width && box.width > 10 ? box : undefined,
      );
      this.pendingType.set(null);
    }
    if (session?.kind === 'connect' && session.itemId) {
      const point = this.point(event.clientX, event.clientY);
      const target = this.connectorTarget(point, session.itemId);
      const join = !target ? this.joinCandidate(point) : null;
      if (join) {
        const parent = this.connections().find((connection) => connection.id === join.connectionId);
        if (
          parent &&
          parent.sourceId !== session.itemId &&
          parent.targetId !== session.itemId &&
          !this.connections().some(
            (connection) =>
              connection.sourceId === session.itemId && connection.targetId === parent.targetId,
          )
        ) {
          this.snapshot();
          const junction = this.getOrCreateJunction(join);
          this.connections.update((entries) => [
            ...entries,
            {
              id: canvasId(),
              sourceId: session.itemId!,
              sourceSide: session.side,
              targetId: parent.targetId,
              targetJunctionId: junction.id,
              direction: 'forward',
              kind: 'elbow',
            },
          ]);
          this.selectedConnectionId.set(parent.id);
        }
      } else if (target)
        this.addConnection(
          session.itemId!,
          target.id,
          session.side,
          this.closestSide(target, point),
        );
    }
    if (session?.kind === 'branch' && session.connectionId && session.moved) {
      const parent = this.connections().find(
        (connection) => connection.id === session.connectionId,
      );
      const point = this.point(event.clientX, event.clientY);
      const target = parent ? this.connectorTarget(point, parent.sourceId) : undefined;
      if (
        parent &&
        target &&
        target.id !== parent.targetId &&
        !this.connections().some(
          (connection) =>
            connection.sourceJunctionId === session.junctionId && connection.targetId === target.id,
        )
      ) {
        this.snapshot();
        const junction = session.junctionId
          ? this.junctions().find((entry) => entry.id === session.junctionId)
          : this.getOrCreateJunction({
              connectionId: parent.id,
              ratio: session.ratio!,
              x: session.x,
              y: session.y,
            });
        if (
          junction &&
          !this.connections().some(
            (connection) =>
              connection.sourceJunctionId === junction.id && connection.targetId === target.id,
          )
        ) {
          const branch: CanvasConnection = {
            id: canvasId(),
            sourceId: parent.sourceId,
            sourceJunctionId: junction.id,
            targetId: target.id,
            targetSide: this.closestSide(target, point),
            direction: 'forward',
            kind: 'elbow',
          };
          this.connections.update((entries) => [...entries, branch]);
          this.selectedConnectionId.set(branch.id);
        }
      }
    }
    if (session?.kind === 'branch' && !session.moved && session.connectionId)
      this.selectedConnectionId.set(session.connectionId);
    if (session?.kind === 'rebind' && session.connectionId && session.terminal) {
      const connection = this.connections().find((entry) => entry.id === session.connectionId);
      if (connection) {
        const point = this.point(event.clientX, event.clientY),
          otherId = session.terminal === 'source' ? connection.targetId : connection.sourceId,
          target = this.connectorTarget(point, otherId);
        if (
          target &&
          !this.connections().some(
            (entry) =>
              entry.id !== connection.id &&
              entry.sourceId ===
                (session.terminal === 'source' ? target.id : connection.sourceId) &&
              entry.targetId ===
                (session.terminal === 'target' ? target.id : connection.targetId) &&
              !entry.sourceFieldId &&
              !entry.targetFieldId,
          )
        ) {
          this.snapshot();
          this.connections.update((entries) =>
            entries.map((entry) =>
              entry.id === connection.id
                ? session.terminal === 'source'
                  ? {
                      ...entry,
                      sourceId: target.id,
                      sourceSide: this.closestSide(target, point),
                      sourceJunctionId: undefined,
                      sourceBinding: { mode: 'auto' },
                    }
                  : {
                      ...entry,
                      targetId: target.id,
                      targetSide: this.closestSide(target, point),
                      targetJunctionId: undefined,
                      targetBinding: { mode: 'auto' },
                    }
                : entry,
            ),
          );
        }
      }
    }
    if (session?.before && ['move', 'resize', 'rotate'].includes(session.kind)) {
      if (
        session.kind === 'resize' &&
        session.itemId &&
        this.items().find((entry) => entry.id === session.itemId)?.type === 'text'
      )
        this.update(session.itemId, { textAutoSize: false });
      if (session.kind === 'move' && session.moved && session.itemId) this.reparent(session.itemId);
      this.commit(session.before);
    }
    if (session?.kind === 'route' && session.before) this.commit(session.before);
    if (session?.kind === 'junction-slide' && session.before) this.commit(session.before);
    if (session?.kind === 'sketch') this.finishSketch();
    this.session = null;
    this.sketchPoints.set([]);
    this.marquee.set(null);
    this.snapGuide.set(null);
    this.placement.set(null);
    this.connectionPreview.set(null);
    this.connectionTargetId.set(null);
    this.precisePreview.set(null);
    this.junctionCandidate.set(null);
    this.isPanning.set(false);
    if (this.suppressCanvasClick) setTimeout(() => (this.suppressCanvasClick = false), 250);
    const target = event.currentTarget as HTMLElement;
    if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
  }
  pointerCancel(event: PointerEvent): void {
    this.pointers.delete(event.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    const session = this.session;
    if (session?.pointerId !== event.pointerId) return;
    if (session.before) {
      this.items.set(session.before.items);
      this.connections.set(session.before.connections);
      this.junctions.set(session.before.junctions || []);
      this.datasetStore.replace(session.before.datasets || []);
    }
    this.session = null;
    this.sketchPoints.set([]);
    this.marquee.set(null);
    this.placement.set(null);
    this.snapGuide.set(null);
    this.transformGuide.set(null);
    this.connectionPreview.set(null);
    this.connectionTargetId.set(null);
    this.precisePreview.set(null);
    this.junctionCandidate.set(null);
    this.isPanning.set(false);
    const target = event.currentTarget as Element;
    if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
  }
  wheel(event: WheelEvent): void {
    event.preventDefault();
    if (event.ctrlKey || event.metaKey)
      this.zoomAt(event.clientX, event.clientY, this.zoom() * (event.deltaY > 0 ? 0.9 : 1.1));
    else {
      this.panX.update((x) => x - event.deltaX);
      this.panY.update((y) => y - event.deltaY);
    }
  }
  zoomAt(clientX: number, clientY: number, value: number): void {
    const rect = this.viewport()?.nativeElement.getBoundingClientRect();
    if (!rect) return;
    const point = this.point(clientX, clientY);
    const zoom = Math.min(3, Math.max(0.08, value));
    this.zoom.set(zoom);
    this.panX.set(clientX - rect.left - point.x * zoom);
    this.panY.set(clientY - rect.top - point.y * zoom);
  }
  zoomBy(factor: number): void {
    const rect = this.viewport()?.nativeElement.getBoundingClientRect();
    if (rect)
      this.zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, this.zoom() * factor);
  }
  fitView(): void {
    const rect = this.viewport()?.nativeElement.getBoundingClientRect();
    const frames = this.visibleItems().filter((item) => item.type === 'workspace');
    const targets = frames.length ? frames : this.visibleItems();
    if (!rect || !targets.length) {
      this.panX.set(0);
      this.panY.set(0);
      this.zoom.set(1);
      return;
    }
    const minX = Math.min(...targets.map((item) => item.x));
    const minY = Math.min(...targets.map((item) => item.y));
    const maxX = Math.max(...targets.map((item) => item.x + item.width));
    const maxY = Math.max(...targets.map((item) => item.y + item.height));
    const mobile = rect.width <= 700;
    const horizontalSpace = Math.max(80, rect.width - (mobile ? 28 : 170));
    const verticalSpace = Math.max(80, rect.height - (mobile ? 170 : 150));
    const zoom = Math.min(
      1.15,
      Math.max(
        0.08,
        Math.min(
          horizontalSpace / Math.max(1, maxX - minX),
          verticalSpace / Math.max(1, maxY - minY),
        ),
      ),
    );
    this.zoom.set(zoom);
    this.panX.set((rect.width - (maxX - minX) * zoom) / 2 - minX * zoom);
    this.panY.set((rect.height - (maxY - minY) * zoom) / 2 - minY * zoom);
  }
  enter(item: CanvasItem): void {
    if (item.type !== 'zone' && item.type !== 'workspace') return;
    this.navigate(
      item.zoneType === 'portal' && item.portalTargetId ? item.portalTargetId : item.id,
    );
  }
  navigate(id: string | null): void {
    this.contextId.set(id);
    this.selectedIds.set([]);
    queueMicrotask(() => this.fitView());
  }
  goToSpaces(): void {
    this.router.navigate(['/spaces']);
  }
  goToSettings(): void {
    this.router.navigate(['/settings']);
  }
  create(type: ItemType): void {
    this.createAt(type, this.centerPoint());
  }
  update(id: string, patch: Partial<CanvasItem>): void {
    this.items.update((items) =>
      items.map((item) =>
        item.id === id ? { ...item, ...patch, updatedAt: new Date().toISOString() } : item,
      ),
    );
  }
  field(event: Event, key: keyof CanvasItem): void {
    const selected = this.selected();
    if (selected) this.update(selected.id, { [key]: (event.target as HTMLInputElement).value });
  }
  richInput(event: Event): void {
    const selected = this.selected();
    if (selected) this.update(selected.id, { bodyHtml: (event.target as HTMLElement).innerHTML });
  }
  formatText(command: string): void {
    document.execCommand(command, false);
  }
  toggleTask(id: string): void {
    const item = this.items().find((item) => item.id === id);
    if (item) {
      this.snapshot();
      this.update(id, { completed: !item.completed });
    }
  }
  toggleChecklist(id: string, index: number): void {
    const item = this.items().find((item) => item.id === id);
    if (item) {
      this.snapshot();
      this.update(id, {
        checklist: item.checklist?.map((entry, i) =>
          i === index ? { ...entry, completed: !entry.completed } : entry,
        ),
      });
    }
  }
  addChecklistRow(): void {
    const item = this.selected();
    if (item)
      this.update(item.id, {
        checklist: [...(item.checklist || []), { label: 'New item', completed: false }],
      });
  }
  editChecklistRow(index: number, event: Event): void {
    const item = this.selected();
    if (item)
      this.update(item.id, {
        checklist: item.checklist?.map((entry, i) =>
          i === index ? { ...entry, label: (event.target as HTMLInputElement).value } : entry,
        ),
      });
  }
  addBudgetRow(): void {
    const item = this.selected();
    if (item)
      this.update(item.id, { rows: [...(item.rows || []), { label: 'New item', value: 0 }] });
  }
  editBudgetRow(index: number, key: 'label' | 'value', event: Event): void {
    const item = this.selected();
    if (item)
      this.update(item.id, {
        rows: item.rows?.map((row, i) =>
          i === index
            ? {
                ...row,
                [key]:
                  key === 'value'
                    ? Number((event.target as HTMLInputElement).value)
                    : (event.target as HTMLInputElement).value,
              }
            : row,
        ),
      });
  }
  duplicate(): void {
    this.insertCopies(this.items().filter((item) => this.selectedIds().includes(item.id)));
  }
  groupSelected(): void {
    if (this.selectedIds().length < 2) return;
    const id = canvasId(),
      selected = new Set(this.selectedIds());
    this.snapshot();
    this.items.update((items) =>
      items.map((item) => (selected.has(item.id) ? { ...item, groupId: id } : item)),
    );
  }
  ungroupSelected(): void {
    const groups = new Set(
      this.items()
        .filter((item) => this.selectedIds().includes(item.id) && item.groupId)
        .map((item) => item.groupId),
    );
    if (!groups.size) return;
    this.snapshot();
    this.items.update((items) =>
      items.map((item) =>
        item.groupId && groups.has(item.groupId) ? { ...item, groupId: undefined } : item,
      ),
    );
  }
  private insertCopies(selected: CanvasItem[]): CanvasItem[] {
    if (!selected.length) return [];
    const ids = new Map(selected.map((item) => [item.id, canvasId()])),
      fieldIds = new Map(
        selected.flatMap((item) =>
          (item.erFields || []).map((field) => [field.id, canvasId()] as const),
        ),
      ),
      groups = new Map(
        selected.filter((item) => item.groupId).map((item) => [item.groupId!, canvasId()]),
      );
    const names = new Set(
      this.items()
        .filter((item) => item.type === 'er-entity')
        .map((item) => item.title.toLowerCase()),
    );
    const copies = selected.map((item) => {
      let title = item.title;
      if (item.type === 'er-entity') {
        let number = 1;
        title = item.title + ' copy';
        while (names.has(title.toLowerCase())) title = item.title + ' copy ' + ++number;
        names.add(title.toLowerCase());
      }
      return {
        ...structuredClone(item),
        id: ids.get(item.id)!,
        title,
        groupId: item.groupId ? groups.get(item.groupId) : undefined,
        parentId: item.parentId && ids.has(item.parentId) ? ids.get(item.parentId)! : item.parentId,
        x: item.x + 24,
        y: item.y + 24,
        erFields: item.erFields?.map((field) => ({
          ...structuredClone(field),
          id: fieldIds.get(field.id)!,
          reference: field.reference
            ? {
                entityId: ids.get(field.reference.entityId) || field.reference.entityId,
                fieldId: ids.has(field.reference.entityId)
                  ? fieldIds.get(field.reference.fieldId) || field.reference.fieldId
                  : field.reference.fieldId,
              }
            : undefined,
        })),
      };
    });
    const connectionIds = new Map<string, string>(),
      junctionIds = new Map<string, string>();
    const relationships: CanvasConnection[] = [];
    const copiedJunctions: CanvasJunction[] = [];
    let added = true;
    while (added) {
      added = false;
      for (const connection of this.connections()) {
        if (
          connectionIds.has(connection.id) ||
          !ids.has(connection.sourceId) ||
          !ids.has(connection.targetId)
        )
          continue;
        const originalJunctions = [connection.sourceJunctionId, connection.targetJunctionId].filter(
          (id): id is string => !!id,
        );
        if (
          originalJunctions.some(
            (id) =>
              !connectionIds.has(
                this.junctions().find((junction) => junction.id === id)?.parentConnectorId || '',
              ),
          )
        )
          continue;
        for (const id of originalJunctions)
          if (!junctionIds.has(id)) {
            const junction = this.junctions().find((entry) => entry.id === id)!;
            const copyId = canvasId();
            junctionIds.set(id, copyId);
            copiedJunctions.push({
              ...junction,
              id: copyId,
              parentConnectorId: connectionIds.get(junction.parentConnectorId)!,
            });
          }
        const copyId = canvasId();
        connectionIds.set(connection.id, copyId);
        relationships.push({
          ...structuredClone(connection),
          id: copyId,
          sourceId: ids.get(connection.sourceId)!,
          targetId: ids.get(connection.targetId)!,
          sourceJunctionId: connection.sourceJunctionId
            ? junctionIds.get(connection.sourceJunctionId)
            : undefined,
          targetJunctionId: connection.targetJunctionId
            ? junctionIds.get(connection.targetJunctionId)
            : undefined,
          sourceFieldId: connection.sourceFieldId
            ? fieldIds.get(connection.sourceFieldId)
            : undefined,
          targetFieldId: connection.targetFieldId
            ? fieldIds.get(connection.targetFieldId)
            : undefined,
        });
        added = true;
      }
    }
    for (const copy of copies)
      for (const field of copy.erFields || [])
        if (
          field.reference &&
          !relationships.some(
            (connection) =>
              connection.targetId === copy.id && connection.targetFieldId === field.id,
          )
        )
          relationships.push({
            id: canvasId(),
            sourceId: field.reference.entityId,
            sourceFieldId: field.reference.fieldId,
            targetId: copy.id,
            targetFieldId: field.id,
            kind: 'elbow',
            direction: 'none',
            sourceCardinality: field.required ? '1' : '0..1',
            targetCardinality: field.unique ? '0..1' : '0..many',
          });
    this.snapshot();
    this.items.update((items) => [...items, ...copies]);
    this.junctions.update((entries) => [...entries, ...copiedJunctions]);
    this.connections.update((entries) => [...entries, ...relationships]);
    this.selectedIds.set(copies.map((item) => item.id));
    return copies;
  }

  quickConnectedShape(source: CanvasItem): void {
    const now = new Date().toISOString();
    const item: CanvasItem = {
      id: canvasId(),
      type: 'shape',
      shapeKind: source.shapeKind || 'rectangle',
      shapeFill: source.shapeFill || '#ffffff',
      shapeStroke: source.shapeStroke || '#475569',
      shapeStrokeWidth: source.shapeStrokeWidth || 2,
      parentId: source.parentId,
      x: source.x + source.width + 100,
      y: source.y,
      width: source.width,
      height: source.height,
      title: '',
      shapeStrokeStyle: source.shapeStrokeStyle,
      textColor: source.textColor,
      rotation: 0,
      zIndex: Math.max(1, ...this.items().map((entry) => entry.zIndex || 1)) + 1,
      createdAt: now,
      updatedAt: now,
    };
    this.snapshot();
    this.items.update((items) => [...items, item]);
    this.connections.update((connections) => [
      ...connections,
      {
        id: canvasId(),
        sourceId: source.id,
        targetId: item.id,
        direction: 'forward',
        kind: this.connectorKind(),
      },
    ]);
    this.selectedIds.set([item.id]);
    queueMicrotask(() => this.startEditing(item.id));
  }
  removeSelected(): void {
    const ids = this.selectedIds();
    if (!ids.length) return;
    this.snapshot();
    const removed = new Set(ids);
    let changed = true;
    while (changed) {
      changed = false;
      for (const item of this.items())
        if (item.parentId && removed.has(item.parentId) && !removed.has(item.id)) {
          removed.add(item.id);
          changed = true;
        }
    }
    this.items.update((items) => items.filter((item) => !removed.has(item.id)));
    this.removeConnectionGraph(
      new Set(
        this.connections()
          .filter((c) => removed.has(c.sourceId) || removed.has(c.targetId))
          .map((c) => c.id),
      ),
    );
    this.selectedIds.set([]);
  }
  removeSelectedConnection(): void {
    const id = this.selectedConnectionId();
    if (!id) return;
    this.snapshot();
    const connection = this.connections().find((entry) => entry.id === id);
    if (connection?.targetFieldId)
      this.items.update((items) =>
        items.map((item) =>
          item.id === connection.targetId
            ? {
                ...item,
                erFields: item.erFields?.map((field) =>
                  field.id === connection.targetFieldId
                    ? { ...field, key: 'none', reference: undefined }
                    : field,
                ),
              }
            : item,
        ),
      );
    this.removeConnectionGraph(new Set([id]));
    this.selectedConnectionId.set(null);
  }
  private removeConnectionGraph(removed: Set<string>): void {
    let changed = true;
    while (changed) {
      changed = false;
      for (const connection of this.connections()) {
        const parents = [connection.sourceJunctionId, connection.targetJunctionId].map(
          (id) => this.junctions().find((j) => j.id === id)?.parentConnectorId,
        );
        if (!removed.has(connection.id) && parents.some((id) => id && removed.has(id))) {
          removed.add(connection.id);
          changed = true;
        }
      }
    }
    const remaining = this.connections().filter((connection) => !removed.has(connection.id));
    const usedJunctions = new Set(
      remaining.flatMap((connection) =>
        [connection.sourceJunctionId, connection.targetJunctionId].filter(
          (id): id is string => !!id,
        ),
      ),
    );
    this.connections.set(remaining);
    this.junctions.update((entries) =>
      entries.filter(
        (junction) => !removed.has(junction.parentConnectorId) && usedJunctions.has(junction.id),
      ),
    );
  }
  private connectorTarget(
    point: { x: number; y: number },
    sourceId: string,
  ): CanvasItem | undefined {
    const visible = this.visibleItems()
      .map((item, index) => ({ item, index }))
      .sort(
        (a, b) =>
          (b.item.zIndex ?? (['zone', 'frame', 'workspace'].includes(b.item.type) ? 0 : 1)) -
            (a.item.zIndex ?? (['zone', 'frame', 'workspace'].includes(a.item.type) ? 0 : 1)) ||
          b.index - a.index,
      )
      .map((entry) => entry.item);
    const underPointer = visible.find(
      (item) => item.id !== sourceId && item.type !== 'workspace' && containsShape(item, point),
    );
    if (underPointer) return isConnectableItem(underPointer) ? underPointer : undefined;
    return visible.find(
      (item) =>
        item.id !== sourceId &&
        isConnectableItem(item) &&
        nearestPerimeter(item, point).distance <= 20 / this.zoom(),
    );
  }
  private horizontalConnection(source: CanvasItem, target: CanvasItem): boolean {
    return (
      Math.abs(target.x + target.width / 2 - source.x - source.width / 2) -
        (source.width + target.width) / 2 >=
      Math.abs(target.y + target.height / 2 - source.y - source.height / 2) -
        (source.height + target.height) / 2
    );
  }
  private connectionEnds(connection: CanvasConnection): {
    a: { x: number; y: number };
    b: { x: number; y: number };
    source: CanvasItem;
    target: CanvasItem;
  } {
    const source = this.items().find((item) => item.id === connection.sourceId)!;
    const target = this.items().find((item) => item.id === connection.targetId)!;
    const sourceCenter = { x: source.x + source.width / 2, y: source.y + source.height / 2 };
    const targetCenter = { x: target.x + target.width / 2, y: target.y + target.height / 2 };
    const dx = targetCenter.x - sourceCenter.x,
      dy = targetCenter.y - sourceCenter.y;
    const horizontal = this.horizontalConnection(source, target);
    const sourceSide: ConnectorSide =
      connection.sourceSide ||
      (horizontal ? (dx >= 0 ? 'right' : 'left') : dy >= 0 ? 'bottom' : 'top');
    const targetSide: ConnectorSide =
      connection.targetSide ||
      (horizontal ? (dx >= 0 ? 'left' : 'right') : dy >= 0 ? 'top' : 'bottom');
    const orthogonal =
      !connection.kind || connection.kind === 'elbow' || connection.kind === 'curved';
    const sourceJunction = this.junctions().find((j) => j.id === connection.sourceJunctionId);
    const targetJunction = this.junctions().find((j) => j.id === connection.targetJunctionId);
    const junctionA = sourceJunction ? this.junctionPoint(sourceJunction) : null,
      junctionB = targetJunction ? this.junctionPoint(targetJunction) : null;
    const a =
      junctionA ||
      (connection.sourceSide
        ? sidePoint(source, sourceSide)
        : connection.sourceBinding?.mode === 'precise' && connection.sourceBinding.anchor
          ? world(source, connection.sourceBinding.anchor)
          : orthogonal && !junctionB
            ? sidePoint(source, sourceSide)
            : perimeterPoint(source, junctionB || targetCenter));
    const b =
      junctionB ||
      (connection.targetSide
        ? sidePoint(target, targetSide)
        : connection.targetBinding?.mode === 'precise' && connection.targetBinding.anchor
          ? world(target, connection.targetBinding.anchor)
          : orthogonal && !junctionA
            ? sidePoint(target, targetSide)
            : perimeterPoint(target, junctionA || sourceCenter));
    const routed = this.erRoutes().get(connection.id);
    return { a: routed?.points[0] || a, b: routed?.points.at(-1) || b, source, target };
  }
  connectionPath(connection: CanvasConnection): string {
    const routed = this.erRoutes().get(connection.id);
    if (routed) {
      const points = this.connectorRoutePoints(connection);
      return points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
    }
    const { a, b, source, target } = this.connectionEnds(connection);
    if (connection.kind === 'straight') return `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
    const horizontal = this.horizontalConnection(source, target);
    if (!connection.kind || connection.kind === 'elbow') {
      if (connection.sourceJunctionId && !connection.targetJunctionId) {
        const sourceSide: ConnectorSide =
          Math.abs(b.x - a.x) >= Math.abs(b.y - a.y)
            ? b.x >= a.x
              ? 'right'
              : 'left'
            : b.y >= a.y
              ? 'bottom'
              : 'top';
        const targetSide = connection.targetSide || this.closestSide(target, a);
        const targetPoint = sidePoint(target, targetSide);
        return elbowRoute(
          a,
          targetPoint,
          sourceSide,
          targetSide,
          { x: a.x, y: a.y, width: 0, height: 0 },
          target,
        )
          .map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`)
          .join(' ');
      }
      if (
        !connection.routeAxis &&
        !connection.routeOffset &&
        !connection.sourceJunctionId &&
        !connection.targetJunctionId
      ) {
        const sourceCenter = { x: source.x + source.width / 2, y: source.y + source.height / 2 };
        const targetCenter = { x: target.x + target.width / 2, y: target.y + target.height / 2 };
        const autoHorizontal = this.horizontalConnection(source, target);
        const sourceSide =
          connection.sourceSide ||
          (autoHorizontal
            ? targetCenter.x >= sourceCenter.x
              ? 'right'
              : 'left'
            : targetCenter.y >= sourceCenter.y
              ? 'bottom'
              : 'top');
        const targetSide =
          connection.targetSide ||
          (autoHorizontal
            ? targetCenter.x >= sourceCenter.x
              ? 'left'
              : 'right'
            : targetCenter.y >= sourceCenter.y
              ? 'top'
              : 'bottom');
        return elbowRoute(a, b, sourceSide, targetSide, source, target)
          .map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`)
          .join(' ');
      }
      const axis = connection.routeAxis || (horizontal ? 'x' : 'y');
      if (axis === 'x') {
        const mx = (a.x + b.x) / 2 + (connection.routeOffset || 0);
        return `M ${a.x} ${a.y} L ${mx} ${a.y} L ${mx} ${b.y} L ${b.x} ${b.y}`;
      }
      const my = (a.y + b.y) / 2 + (connection.routeOffset || 0);
      return `M ${a.x} ${a.y} L ${a.x} ${my} L ${b.x} ${my} L ${b.x} ${b.y}`;
    }
    const bend = Math.min(
      90,
      Math.max(24, (horizontal ? Math.abs(b.x - a.x) : Math.abs(b.y - a.y)) * 0.35),
    );
    if (horizontal) {
      const sign = Math.sign(b.x - a.x) || 1;
      return `M ${a.x} ${a.y} C ${a.x + sign * bend} ${a.y}, ${b.x - sign * bend} ${b.y}, ${b.x} ${b.y}`;
    }
    const sign = Math.sign(b.y - a.y) || 1;
    return `M ${a.x} ${a.y} C ${a.x} ${a.y + sign * bend}, ${b.x} ${b.y - sign * bend}, ${b.x} ${b.y}`;
  }
  previewPath(preview: { x1: number; y1: number; x2: number; y2: number }): string {
    const { x1, y1, x2, y2 } = preview;
    if (this.connectorKind() === 'elbow') {
      const mid = (x1 + x2) / 2;
      return `M ${x1} ${y1} L ${mid} ${y1} L ${mid} ${y2} L ${x2} ${y2}`;
    }
    if (this.connectorKind() === 'curved') {
      const bend = Math.max(40, Math.abs(x2 - x1) * 0.45),
        direction = Math.sign(x2 - x1 || 1);
      return `M ${x1} ${y1} C ${x1 + direction * bend} ${y1}, ${x2 - direction * bend} ${y2}, ${x2} ${y2}`;
    }
    return `M ${x1} ${y1} L ${x2} ${y2}`;
  }
  connectionLabelX(connection: CanvasConnection): number {
    if (this.junctions().some((junction) => junction.parentConnectorId === connection.id))
      return this.pathPoint(connection, 0.25).x;
    if (connection.kind === 'elbow') return this.routeHandle(connection).x;
    const { a, b } = this.connectionEnds(connection);
    return (a.x + b.x) / 2;
  }
  connectionLabelY(connection: CanvasConnection): number {
    if (this.junctions().some((junction) => junction.parentConnectorId === connection.id))
      return this.pathPoint(connection, 0.25).y;
    if (connection.kind === 'elbow') return this.routeHandle(connection).y;
    const { a, b } = this.connectionEnds(connection);
    return (a.y + b.y) / 2;
  }
  private containerAt(point: { x: number; y: number }, excludeId?: string): CanvasItem | undefined {
    return this.items()
      .map((item, index) => ({ item, index }))
      .filter(
        ({ item }) =>
          (item.type === 'zone' || item.type === 'frame') &&
          item.id !== excludeId &&
          point.x >= item.x &&
          point.x <= item.x + item.width &&
          point.y >= item.y &&
          point.y <= item.y + item.height,
      )
      .sort((a, b) => b.index - a.index)[0]?.item;
  }
  private reparent(id: string): void {
    const item = this.items().find((entry) => entry.id === id);
    if (!item || item.type === 'zone' || item.type === 'workspace' || item.type === 'frame') return;
    const zone = this.containerAt({ x: item.x + item.width / 2, y: item.y + item.height / 2 }, id);
    if (item.parentId !== (zone?.id || null)) this.update(id, { parentId: zone?.id || null });
  }
  createAt(
    type: ItemType,
    point: { x: number; y: number },
    box?: { width: number; height: number },
  ): void {
    this.finishEditing();
    if (type === 'file' || type === 'voice') {
      this.replaceId = null;
      this.imagePlacement = point;
      this.fileInput()?.nativeElement.click();
      return;
    }
    const viewport = this.viewport()?.nativeElement;
    const mobile = !!viewport && viewport.clientWidth <= 700;
    const visibleWidth = viewport ? viewport.clientWidth / this.zoom() : 390;
    const width = Math.max(
      100,
      box?.width ||
        (type === 'shape'
          ? this.shapeKind() === 'circle'
            ? 160
            : 200
          : type === 'zone' || type === 'frame'
            ? 420
            : type === 'er-entity'
              ? 360
              : type === 'budget'
                ? 640
                : type === 'table'
                  ? 680
                  : type === 'chart'
                    ? 640
                    : type === 'image'
                      ? 340
                      : type === 'list'
                        ? 300
                        : type === 'task'
                          ? 280
                          : type === 'link'
                            ? 320
                            : type === 'text'
                              ? 180
                              : 260),
    );
    const height = Math.max(
      40,
      box?.height ||
        (type === 'shape'
          ? this.shapeKind() === 'circle'
            ? 160
            : ['diamond', 'triangle', 'cylinder'].includes(this.shapeKind())
              ? 150
              : 120
          : type === 'zone' || type === 'frame'
            ? 280
            : type === 'er-entity'
              ? 210
              : type === 'budget'
                ? 430
                : type === 'table'
                  ? 370
                  : type === 'chart'
                    ? 390
                    : type === 'image'
                      ? 230
                      : type === 'task'
                        ? 78
                        : type === 'list'
                          ? 150
                          : type === 'link'
                            ? 115
                            : type === 'text'
                              ? 46
                              : 170),
    );
    const placedWidth = mobile && !box ? Math.min(width, visibleWidth - 32 / this.zoom()) : width;
    const left = -this.panX() / this.zoom() + 16 / this.zoom();
    const x =
      mobile && !box
        ? Math.max(
            left,
            Math.min(
              point.x - placedWidth / 2,
              left + visibleWidth - 32 / this.zoom() - placedWidth,
            ),
          )
        : point.x;
    this.snapshot();
    const dataset =
      type === 'budget'
        ? this.datasetStore.create([
            { label: 'Category', type: 'text', key: 'item' },
            { label: 'Planned', type: 'currency', key: 'planned' },
            { label: 'Actual', type: 'currency', key: 'actual' },
            { label: 'Remaining', type: 'calculated', key: 'remaining' },
            { label: 'Group', type: 'category', key: 'group' },
          ])
        : type === 'table'
          ? this.datasetStore.create([
              { label: 'Column 1', type: 'text' },
              { label: 'Column 2', type: 'text' },
            ])
          : undefined;
    const chartSource =
      type === 'chart' ? this.datasets().find((data) => this.canChart(data)) : undefined;
    if (dataset && type === 'budget')
      this.datasetStore.setCalculation(
        dataset.id,
        dataset.columns.find((column) => column.key === 'remaining')!.id,
        { left: 'planned', operator: '-', right: 'actual' },
      );
    const parentId = ['zone', 'workspace', 'frame'].includes(type)
      ? null
      : this.containerAt({ x: x + placedWidth / 2, y: point.y + height / 2 })?.id || null;
    const item: CanvasItem = {
      id: canvasId(),
      type,
      parentId,
      x,
      y: point.y,
      width: placedWidth,
      height,
      title: type === 'er-entity' ? 'New entity' : '',
      body: '',
      erFields:
        type === 'er-entity'
          ? [{ id: canvasId(), name: 'id', dataType: 'UUID', key: 'primary', required: true }]
          : undefined,
      datasetId: dataset?.id || chartSource?.id,
      chartConfig: type === 'chart' ? this.defaultChartConfig(chartSource) : undefined,
      budgetMode: type === 'budget' ? 'simple' : undefined,
      budgetCurrency: type === 'budget' ? 'JOD' : undefined,
      budgetPeriod: type === 'budget' ? 'one-time' : undefined,
      textAutoSize: type === 'text',
      accent: '#d4111c',
      shapeKind: type === 'shape' ? this.shapeKind() : undefined,
      shapeFill: type === 'shape' ? shapeThemes[this.shapeTheme()].fill : undefined,
      shapeStrokeWidth: type === 'shape' ? 2 : undefined,
      textColor: type === 'shape' ? shapeThemes[this.shapeTheme()].text : undefined,
      zoneType: type === 'zone' ? 'standard' : undefined,
      checklist:
        type === 'checklist' || type === 'list' ? [{ label: '', completed: false }] : undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.items.update((items) => [...items, item]);
    this.selectedIds.set([item.id]);
    this.selectedConnectionId.set(null);
    this.pendingType.set(null);
    this.paletteOpen.set(false);
    this.tool.set('select');
    if (type === 'er-entity') {
      this.inspectorOpen.set(false);
      setTimeout(() => {
        const input = document.querySelector<HTMLInputElement>(
          `[data-node-id="${item.id}"] .er-name-input`,
        );
        input?.focus();
        input?.select();
      });
    }
    if (mobile && viewport) {
      const focusZoom = Math.min(1, (viewport.clientWidth - 32) / Math.max(1, placedWidth));
      this.zoom.set(focusZoom);
      this.panX.set(viewport.clientWidth / 2 - (item.x + item.width / 2) * focusZoom);
      this.panY.set((viewport.clientHeight - 130) / 2 - (item.y + item.height / 2) * focusZoom);
    }
    if (
      [
        'note',
        'text',
        'task',
        'zone',
        'frame',
        'link',
        'list',
        'budget',
        'table',
        'shape',
      ].includes(type)
    )
      queueMicrotask(() => this.startEditing(item.id));
  }
  selectImageForBlock(id: string): void {
    const item = this.items().find((entry) => entry.id === id);
    if (!item || item.type !== 'image') return;
    this.selectedIds.set([id]);
    this.replaceId = id;
    this.imagePlacement = { x: item.x, y: item.y };
    const input = this.fileInput()?.nativeElement;
    if (input) {
      input.accept = 'image/*';
      input.click();
    }
  }
  canvasDoubleClick(event: MouseEvent): void {
    if (this.tool() !== 'select' || this.pendingType() || this.pendingAsset()) return;
    if ((event.target as HTMLElement).closest('[data-item], [data-ui]')) return;
    this.createAt('note', this.point(event.clientX, event.clientY));
  }
  itemDoubleClick(event: MouseEvent, item: CanvasItem): void {
    if (this.tool() !== 'select' || this.editingId() === item.id) return;
    const edit = (event.target as Element).closest<HTMLElement>('[data-edit-field]');
    if (edit) this.startEditing(item.id, edit.dataset['editField'] as EditField);
  }
  startEditing(id: string, field: EditField = 'title'): void {
    const item = this.items().find((entry) => entry.id === id);
    if (this.tool() === 'hand' || !item) return;
    if (item.type === 'er-entity') {
      this.editErFields(item);
      return;
    }
    this.selectedIds.set([id]);
    this.richBefore = this.state();
    const rich = item.type === 'text' || (item.type === 'note' && field === 'body');
    this.richFocusId.set(rich ? id : null);
    this.editingId.set(id);
    if (rich) return;
    setTimeout(() => {
      const node = document.querySelector<HTMLElement>(`[data-node-id="${id}"]`);
      const element =
        node?.querySelector<HTMLElement>(`[data-edit-field="${field}"][data-edit-id="${id}"]`) ||
        node?.querySelector<HTMLElement>(`[data-edit-id="${id}"]`);
      element?.focus();
      if (element?.isContentEditable) {
        const range = document.createRange();
        range.selectNodeContents(element);
        range.collapse(false);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
    });
  }
  finishEditing(): void {
    if (this.richBefore) this.commit(this.richBefore);
    this.richBefore = null;
    this.richFocusId.set(null);
    this.editingId.set(null);
  }
  richContent(id: string): string {
    const item = this.items().find((entry) => entry.id === id);
    const content = item?.bodyHtml || (item?.type === 'text' ? item.title : item?.body) || '';
    if (item?.bodyHtml) return content;
    const escaped = content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');
    return `<p>${escaped}</p>`;
  }
  richChanged(id: string, event: { html: string; text: string }): void {
    const item = this.items().find((entry) => entry.id === id);
    if (!item) return;
    this.update(
      id,
      item.type === 'text'
        ? { bodyHtml: event.html, title: event.text }
        : { bodyHtml: event.html, body: event.text },
    );
  }
  inlineInput(event: Event, id: string, key: 'title' | 'body'): void {
    /* Keep the browser's live contenteditable DOM intact until blur. */
  }
  inlineBlur(event: Event, id: string, key: 'title' | 'body'): void {
    const value = (event.target as HTMLElement).innerText;
    const current = this.items().find((item) => item.id === id);
    if (current && current[key] !== value) {
      if (!this.richBefore) this.snapshot();
      const patch: Partial<CanvasItem> = { [key]: value };
      if (current.type === 'text' && current.textAutoSize && key === 'title') {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (context) {
          context.font = `${current.fontWeight || 600} ${current.fontSize || 21}px sans-serif`;
          patch.width = Math.max(
            80,
            Math.min(520, ...value.split('\n').map((line) => context.measureText(line).width + 12)),
          );
          patch.height = Math.max(
            36,
            value.split('\n').length * (current.fontSize || 21) * 1.35 + 6,
          );
        }
      }
      this.update(id, patch);
    }
    const next = (event as FocusEvent).relatedTarget as HTMLElement | null;
    if (!next?.closest(`[data-node-id="${id}"]`)) this.finishEditing();
  }
  inlineKey(event: KeyboardEvent): void {
    const id = this.editingId();
    const item = this.items().find((entry) => entry.id === id);
    if (
      event.key === 'Escape' ||
      ((event.ctrlKey || event.metaKey) && event.key === 'Enter') ||
      (item?.type === 'task' && event.key === 'Enter')
    ) {
      event.preventDefault();
      (event.target as HTMLElement).blur();
      this.finishEditing();
    }
  }
  taskTitleKey(event: KeyboardEvent, id: string): void {
    if (event.key === 'Enter' || event.key === 'Escape') {
      event.preventDefault();
      (event.target as HTMLInputElement).blur();
    }
  }
  taskTitleBlur(event: Event, id: string): void {
    const value = (event.target as HTMLInputElement).value.trim() || 'New task';
    const item = this.items().find((entry) => entry.id === id);
    if (item && item.title !== value) {
      if (!this.richBefore) this.snapshot();
      this.update(id, { title: value });
    }
    this.finishEditing();
  }
  setStyle(id: string, patch: Partial<CanvasItem>): void {
    const item = this.items().find((entry) => entry.id === id);
    if (!item) return;
    this.snapshot();
    this.update(
      id,
      item.type === 'sketch' && patch.accent
        ? {
            ...patch,
            sketchStrokes: item.sketchStrokes?.map((stroke) => ({
              ...stroke,
              color: patch.accent!,
            })),
          }
        : patch,
    );
  }
  addErField(item: CanvasItem): void {
    const current = this.items().find((entry) => entry.id === item.id);
    if (!current) return;
    const fields = current.erFields || [],
      id = canvasId();
    let number = fields.length + 1;
    while (fields.some((field) => field.name === `field_${number}`)) number++;
    this.inspectorOpen.set(false);
    this.erExpandedFieldId.set(null);
    this.selectedIds.set([item.id]);
    this.selectedConnectionId.set(null);
    this.setStyle(item.id, {
      erFields: [
        ...fields,
        { id, name: `field_${number}`, dataType: 'VARCHAR', key: 'none', required: false },
      ],
      height: Math.max(current.height, 150 + (fields.length + 1) * 44),
    });
    setTimeout(() => {
      const input = document.querySelector<HTMLInputElement>(
        `${this.inspectorOpen() ? '.inspector ' : ''}[data-er-field="${id}"]`,
      );
      input?.focus();
      input?.select();
    });
  }
  erFieldKey(event: KeyboardEvent, item: CanvasItem): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      (event.target as HTMLInputElement).blur();
      this.addErField(item);
    } else if (event.key === 'Escape') {
      event.stopPropagation();
      (event.target as HTMLInputElement).blur();
    }
  }
  erControlDown(event: PointerEvent, item: CanvasItem): void {
    event.stopPropagation();
  }
  openErField(item: CanvasItem, field: ErField): void {
    this.setTool('select');
    this.selectedIds.set([item.id]);
    this.inspectorOpen.set(false);
    this.erExpandedFieldId.set(field.id);
    setTimeout(() =>
      document.querySelector<HTMLInputElement>('.er-settings-name')?.focus({ preventScroll: true }),
    );
  }
  erEditingField(item: CanvasItem): ErField | undefined {
    return item.type === 'er-entity'
      ? item.erFields?.find((field) => field.id === this.erExpandedFieldId())
      : undefined;
  }
  closeErField(): void {
    const id = this.erExpandedFieldId();
    this.erExpandedFieldId.set(null);
    setTimeout(() => document.querySelector<HTMLInputElement>(`[data-er-field="${id}"]`)?.focus());
  }
  erSettingsKey(event: KeyboardEvent): void {
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      this.closeErField();
    }
  }
  erTypeChoice(field: ErField): string {
    return erDataTypes.includes(field.dataType) ? field.dataType : 'CUSTOM';
  }
  erTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      UUID: 'UUID (identifier)',
      VARCHAR: 'VARCHAR (short text)',
      TEXT: 'TEXT (long text)',
      INTEGER: 'INTEGER (whole number)',
      BIGINT: 'BIGINT (large whole number)',
      SMALLINT: 'SMALLINT (small whole number)',
      DECIMAL: 'DECIMAL (exact number)',
      FLOAT: 'FLOAT (decimal number)',
      DOUBLE: 'DOUBLE (precise decimal number)',
      BOOLEAN: 'BOOLEAN (yes or no)',
      DATE: 'DATE (calendar date)',
      TIME: 'TIME (time of day)',
      TIMESTAMP: 'TIMESTAMP (date and time)',
      JSON: 'JSON (structured data)',
      BINARY: 'BINARY (file data)',
      ENUM: 'ENUM (allowed values)',
    };
    return labels[type] || type;
  }
  setErType(item: CanvasItem, field: ErField, value: string): void {
    const patch: Partial<ErField> =
      value === 'REFERENCE'
        ? { key: 'foreign', dataType: field.reference ? field.dataType : 'UUID' }
        : {
            dataType: value,
            reference: undefined,
            key: field.key === 'foreign' ? 'none' : field.key,
          };
    if (value !== 'ENUM' && value !== 'REFERENCE') patch.enumValues = undefined;
    this.updateErField(item, field.id, patch);
    if (['ENUM', 'REFERENCE', 'CUSTOM'].includes(value)) this.openErField(item, field);
  }
  erReferenceOptions(item: CanvasItem, field: ErField): { value: string; label: string }[] {
    return this.erEntities().flatMap((entity) =>
      (entity.erFields || [])
        .filter(
          (other) =>
            (other.unique ||
              (other.key === 'primary' &&
                (entity.erFields || []).filter((entry) => entry.key === 'primary').length === 1)) &&
            other.id !== field.id,
        )
        .map((other) => ({
          value: `${entity.id}/${other.id}`,
          label: `${entity.title || 'Unnamed entity'}.${other.name} (${other.dataType})`,
        })),
    );
  }
  erReferenceLabel(field: ErField): string {
    const entity = this.items().find((item) => item.id === field.reference?.entityId),
      target = entity?.erFields?.find((other) => other.id === field.reference?.fieldId);
    return entity && target ? `${entity.title}.${target.name}` : 'Missing reference';
  }
  setErReference(item: CanvasItem, field: ErField, value: string): void {
    const [entityId, fieldId] = value.split('/'),
      entity = this.items().find((entry) => entry.id === entityId),
      targetField = entity?.erFields?.find((entry) => entry.id === fieldId);
    if (!value) {
      this.updateErField(item, field.id, {
        reference: undefined,
        key: field.key === 'foreign' ? 'none' : field.key,
      });
      return;
    }
    if (
      !entity ||
      !targetField ||
      targetField.id === field.id ||
      (targetField.key !== 'primary' && !targetField.unique)
    )
      return;
    if (
      !targetField.unique &&
      (entity.erFields || []).filter((entry) => entry.key === 'primary').length > 1
    )
      return;
    this.updateErField(item, field.id, {
      key: 'foreign',
      dataType: targetField.dataType,
      enumValues: targetField.enumValues,
      reference: { entityId, fieldId },
    });
    this.connections.update((entries) => [
      ...entries.filter(
        (entry) => !(entry.targetId === item.id && entry.targetFieldId === field.id),
      ),
      {
        id: canvasId(),
        sourceId: entityId,
        sourceFieldId: fieldId,
        targetId: item.id,
        targetFieldId: field.id,
        kind: 'elbow',
        direction: 'none',
        sourceCardinality: field.required ? '1' : '0..1',
        targetCardinality: field.unique ? '0..1' : '0..many',
      },
    ]);
  }
  erFieldIssue(item: CanvasItem, field: ErField): string {
    return erFieldIssue(item, field, this.erEntities());
  }
  erEntityIssue(item: CanvasItem): string {
    if (!item.title.trim()) return 'Give this entity a name.';
    if (
      this.erEntities().some(
        (other) =>
          other.id !== item.id &&
          other.title.trim().toLowerCase() === item.title.trim().toLowerCase(),
      )
    )
      return 'Another entity has this name.';
    return item.erFields?.some((field) => field.key === 'primary')
      ? ''
      : 'Add a primary key to identify each record.';
  }
  setErEnum(item: CanvasItem, field: ErField, event: Event): void {
    this.updateErField(item, field.id, {
      enumValues: enumValues((event.target as HTMLTextAreaElement).value),
    });
  }
  moveErField(item: CanvasItem, fieldId: string, direction: number): void {
    const fields = [...(this.items().find((entry) => entry.id === item.id)?.erFields || [])],
      index = fields.findIndex((field) => field.id === fieldId),
      target = index + direction;
    if (index < 0 || target < 0 || target >= fields.length) return;
    [fields[index], fields[target]] = [fields[target], fields[index]];
    this.setStyle(item.id, { erFields: fields });
  }
  exportErDiagram(): void {
    const blob = new Blob([exportErDbml(this.items())], { type: 'text/plain;charset=utf-8' }),
      url = URL.createObjectURL(blob),
      link = document.createElement('a');
    link.href = url;
    link.download = 'thread-schema.dbml';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  editErFields(item: CanvasItem): void {
    this.setTool('select');
    this.selectedIds.set([item.id]);
    this.selectedConnectionId.set(null);
    this.inspectorOpen.set(true);
  }
  connectErTarget(sourceId: string, targetId: string): void {
    if (
      !targetId ||
      sourceId === targetId ||
      !this.items().some((item) => item.id === targetId && item.type === 'er-entity')
    )
      return;
    this.addConnection(sourceId, targetId);
    this.setTool('select');
  }
  arrangeErDiagram(): void {
    this.finishEditing();
    const positions = arrangeErEntities(this.visibleItems(), this.connections());
    if (!positions.size) return;
    this.snapshot();
    this.items.update((items) =>
      items.map((item) =>
        positions.has(item.id)
          ? {
              ...item,
              ...positions.get(item.id)!,
              rotation: 0,
              updatedAt: new Date().toISOString(),
            }
          : item,
      ),
    );
    this.connections.update((entries) =>
      entries.map((entry) =>
        positions.has(entry.sourceId) && positions.has(entry.targetId)
          ? {
              ...entry,
              kind: 'elbow',
              routeOffset: 0,
              routeAxis: undefined,
              sourceBinding: { mode: 'auto' },
              targetBinding: { mode: 'auto' },
            }
          : entry,
      ),
    );
    this.selectedIds.set([...positions.keys()]);
    this.selectedConnectionId.set(null);
    this.inspectorOpen.set(false);
    this.setTool('select');
    const arranged = this.items().filter((item) => positions.has(item.id)),
      viewport = this.viewport()?.nativeElement;
    if (viewport) {
      const left = Math.min(...arranged.map((item) => item.x)),
        top = Math.min(...arranged.map((item) => item.y)),
        width = Math.max(...arranged.map((item) => item.x + item.width)) - left,
        height = Math.max(...arranged.map((item) => item.y + item.height)) - top;
      const zoom = Math.max(
        0.08,
        Math.min(
          1,
          (viewport.clientWidth - (viewport.clientWidth <= 700 ? 32 : 180)) / width,
          (viewport.clientHeight - 200) / height,
        ),
      );
      this.zoom.set(zoom);
      this.panX.set(viewport.clientWidth / 2 - (left + width / 2) * zoom);
      this.panY.set((viewport.clientHeight - 70) / 2 - (top + height / 2) * zoom);
    }
  }
  updateErField(item: CanvasItem, fieldId: string, patch: Partial<ErField>): void {
    this.setStyle(item.id, {
      erFields: (this.items().find((entry) => entry.id === item.id)?.erFields || []).map(
        (field) => {
          if (field.id !== fieldId) return field;
          const next = { ...field, ...patch };
          return {
            ...next,
            reference: next.key === 'foreign' ? next.reference : undefined,
            name: next.name.trim() || 'field',
            dataType: next.dataType.trim() || 'VARCHAR',
            required: next.key === 'primary' || next.required,
          };
        },
      ),
    });
    const updated = this.items()
      .find((entry) => entry.id === item.id)
      ?.erFields?.find((field) => field.id === fieldId);
    if (!updated?.reference)
      this.connections.update((entries) =>
        entries.filter((entry) => !(entry.targetId === item.id && entry.targetFieldId === fieldId)),
      );
    else
      this.connections.update((entries) =>
        entries.map((entry) =>
          entry.targetId === item.id && entry.targetFieldId === fieldId
            ? {
                ...entry,
                sourceCardinality: updated.required ? '1' : '0..1',
                targetCardinality: updated.unique ? '0..1' : '0..many',
              }
            : entry,
        ),
      );
    if (updated)
      this.items.update((items) =>
        items.map((entity) => ({
          ...entity,
          erFields: entity.erFields?.map((field) =>
            field.reference?.entityId === item.id && field.reference.fieldId === fieldId
              ? { ...field, dataType: updated.dataType, enumValues: updated.enumValues }
              : field,
          ),
        })),
      );
  }
  removeErField(item: CanvasItem, fieldId: string): void {
    this.setStyle(item.id, {
      erFields: (this.items().find((entry) => entry.id === item.id)?.erFields || []).filter(
        (field) => field.id !== fieldId,
      ),
    });
    this.connections.update((entries) =>
      entries.filter(
        (entry) =>
          !(entry.sourceId === item.id && entry.sourceFieldId === fieldId) &&
          !(entry.targetId === item.id && entry.targetFieldId === fieldId),
      ),
    );
  }
  beginErConnection(item: CanvasItem): void {
    this.setTool('connect');
    this.connectionSourceId.set(item.id);
    this.selectedIds.set([item.id]);
    this.inspectorOpen.set(false);
  }
  cardinalityMarker(value: CanvasConnection['sourceCardinality']): string | null {
    return value
      ? `url(#er-${value === '1' ? 'one' : value === '0..1' ? 'optional-one' : value === 'many' ? 'many' : 'optional-many'})`
      : null;
  }
  connectionFieldLabel(connection: CanvasConnection, full = false): string {
    const source = this.items().find((item) => item.id === connection.sourceId),
      target = this.items().find((item) => item.id === connection.targetId);
    const sourceField = source?.erFields?.find((field) => field.id === connection.sourceFieldId),
      targetField = target?.erFields?.find((field) => field.id === connection.targetFieldId);
    if (sourceField && targetField)
      return `${full ? source?.title + '.' : ''}${sourceField.name} → ${full ? target?.title + '.' : ''}${targetField.name}`;
    return full ? `${source?.title || 'Source'} → ${target?.title || 'Target'}` : '';
  }
  addRelatedErEntity(source: CanvasItem): void {
    this.finishEditing();
    this.pendingType.set(null);
    const now = new Date().toISOString();
    const foreignKey = `${
      source.title
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '') || 'entity'
    }_id`;
    const target: CanvasItem = {
      id: canvasId(),
      type: 'er-entity',
      parentId: source.parentId,
      x: source.x + source.width + 110,
      y: source.y,
      width: 280,
      height: 202,
      title: 'Related entity',
      erFields: [
        { id: canvasId(), name: 'id', dataType: 'UUID', key: 'primary', required: true },
        {
          id: canvasId(),
          name: foreignKey,
          dataType: source.erFields?.find((field) => field.key === 'primary')?.dataType || 'UUID',
          key: 'foreign',
          required: true,
        },
      ],
      createdAt: now,
      updatedAt: now,
    };
    while (
      this.items().some(
        (item) =>
          !['workspace', 'zone', 'frame'].includes(item.type) &&
          target.x < item.x + item.width + 30 &&
          target.x + target.width + 30 > item.x &&
          target.y < item.y + item.height + 30 &&
          target.y + target.height + 30 > item.y,
      )
    )
      target.y += target.height + 70;
    const primary = source.erFields?.find((field) => field.key === 'primary');
    if (primary) target.erFields![1].reference = { entityId: source.id, fieldId: primary.id };
    this.snapshot();
    this.items.update((items) => [...items, target]);
    this.connections.update((entries) => [
      ...entries,
      {
        id: canvasId(),
        sourceId: source.id,
        sourceFieldId: primary?.id,
        targetFieldId: primary ? target.erFields![1].id : undefined,
        targetId: target.id,
        kind: 'elbow',
        direction: 'none',
        sourceCardinality: '1',
        targetCardinality: 'many',
      },
    ]);
    this.selectedIds.set([target.id]);
    this.selectedConnectionId.set(null);
    this.inspectorOpen.set(false);
    this.tool.set('select');
    const viewport = this.viewport()?.nativeElement;
    if (viewport) {
      this.panX.set(viewport.clientWidth / 2 - (target.x + target.width / 2) * this.zoom());
      this.panY.set(viewport.clientHeight / 2 - (target.y + target.height / 2) * this.zoom());
    }
  }
  createErStarter(): void {
    this.finishEditing();
    this.pendingType.set(null);
    this.paletteOpen.set(false);
    const center = this.centerPoint();
    const now = new Date().toISOString();
    const base = {
      type: 'er-entity' as const,
      parentId: null,
      width: 260,
      height: 202,
      rotation: 0,
      createdAt: now,
      updatedAt: now,
    };
    const customer: CanvasItem = {
      ...base,
      id: canvasId(),
      x: center.x - 300,
      y: center.y - 100,
      title: 'Customer',
      erFields: [
        { id: canvasId(), name: 'id', dataType: 'UUID', key: 'primary', required: true },
        { id: canvasId(), name: 'email', dataType: 'VARCHAR', key: 'none', required: true },
      ],
    };
    const order: CanvasItem = {
      ...base,
      id: canvasId(),
      x: center.x + 40,
      y: center.y - 100,
      title: 'Order',
      erFields: [
        { id: canvasId(), name: 'id', dataType: 'UUID', key: 'primary', required: true },
        { id: canvasId(), name: 'customer_id', dataType: 'UUID', key: 'foreign', required: true },
      ],
    };
    order.erFields![1].reference = { entityId: customer.id, fieldId: customer.erFields![0].id };
    const relation: CanvasConnection = {
      id: canvasId(),
      sourceId: customer.id,
      sourceFieldId: customer.erFields![0].id,
      targetFieldId: order.erFields![1].id,
      targetId: order.id,
      label: 'places',
      sourceCardinality: '1',
      targetCardinality: 'many',
      kind: 'elbow',
      direction: 'none',
    };
    this.snapshot();
    this.items.update((items) => [...items, customer, order]);
    this.connections.update((entries) => [...entries, relation]);
    this.selectedIds.set([customer.id]);
    this.selectedConnectionId.set(null);
    this.inspectorOpen.set(false);
    this.tool.set('select');
    const viewport = this.viewport()?.nativeElement;
    if (viewport) {
      const zoom = Math.min(
        1,
        (viewport.clientWidth - 36) / 600,
        (viewport.clientHeight - 150) / 250,
      );
      this.zoom.set(Math.max(0.08, zoom));
      this.panX.set(viewport.clientWidth / 2 - center.x * this.zoom());
      this.panY.set(
        (viewport.clientHeight - (viewport.clientWidth <= 700 ? 100 : 0)) / 2 -
          center.y * this.zoom(),
      );
    }
  }
  setConnection(id: string, patch: Partial<CanvasConnection>): void {
    this.snapshot();
    this.connections.update((entries) =>
      entries.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
    );
  }
  addParallelRelationship(connection: CanvasConnection): void {
    const id = canvasId();
    this.snapshot();
    this.connections.update((entries) => [
      ...entries,
      {
        ...connection,
        id,
        label: '',
        sourceFieldId: undefined,
        targetFieldId: undefined,
        kind: 'elbow',
        routeOffset: 0,
        sourceBinding: { mode: 'auto' },
        targetBinding: { mode: 'auto' },
        sourceJunctionId: undefined,
        targetJunctionId: undefined,
      },
    ]);
    this.selectedIds.set([]);
    this.selectedConnectionId.set(id);
  }
  private addConnection(
    sourceId: string,
    targetId: string,
    sourceSide?: ConnectorSide,
    targetSide?: ConnectorSide,
  ): void {
    const source = this.items().find((item) => item.id === sourceId);
    const target = this.items().find((item) => item.id === targetId);
    const isEr = source?.type === 'er-entity' && target?.type === 'er-entity';
    if (
      !source ||
      !target ||
      !isConnectableItem(source) ||
      !isConnectableItem(target) ||
      sourceId === targetId
    )
      return;
    const existing = this.connections().find(
      (entry) =>
        !entry.sourceFieldId &&
        !entry.targetFieldId &&
        ((entry.sourceId === sourceId && entry.targetId === targetId) ||
          (isEr && entry.sourceId === targetId && entry.targetId === sourceId)),
    );
    if (existing) {
      this.selectedIds.set([]);
      this.selectedConnectionId.set(existing.id);
      return;
    }
    const connection: CanvasConnection = {
      id: canvasId(),
      sourceId,
      targetId,
      sourceSide,
      targetSide,
      sourceBinding: { mode: 'auto' },
      targetBinding: { mode: 'auto' },
      direction: isEr ? 'none' : 'forward',
      kind: 'elbow',
      sourceCardinality: isEr ? '1' : undefined,
      targetCardinality: isEr ? 'many' : undefined,
    };
    this.snapshot();
    this.connections.update((entries) => [...entries, connection]);
    this.selectedIds.set([]);
    this.selectedConnectionId.set(connection.id);
  }
  setTextSize(id: string, event: Event): void {
    this.setStyle(id, { fontSize: Number((event.target as HTMLSelectElement).value) });
  }
  setFontFamily(id: string, event: Event): void {
    this.setStyle(id, {
      fontFamily: (event.target as HTMLSelectElement).value as CanvasItem['fontFamily'],
    });
  }
  setAlignment(id: string, event: Event): void {
    this.setStyle(id, {
      textAlign: (event.target as HTMLSelectElement).value as CanvasItem['textAlign'],
    });
  }
  toggleBold(id: string): void {
    const item = this.items().find((entry) => entry.id === id);
    if (item) this.setStyle(id, { fontWeight: (item.fontWeight || 600) >= 700 ? 400 : 700 });
  }
  setProperty(id: string, key: 'x' | 'y' | 'width' | 'height', event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    if (!Number.isFinite(value)) return;
    const item = this.items().find((entry) => entry.id === id);
    const minimum =
      item?.type === 'er-entity' ? (key === 'width' ? 220 : key === 'height' ? 136 : 30) : 30;
    this.setStyle(id, {
      [key]: key === 'width' || key === 'height' ? Math.max(minimum, value) : value,
    });
  }
  setString(id: string, key: 'title' | 'due' | 'priority' | 'body', event: Event): void {
    this.setStyle(id, { [key]: (event.target as HTMLInputElement).value });
  }
  setTaskStatus(id: string, event: Event): void {
    this.setStyle(id, { completed: (event.target as HTMLSelectElement).value === 'done' });
  }
  setOrdered(id: string, event: Event): void {
    this.setStyle(id, { ordered: (event.target as HTMLInputElement).checked });
  }
  addSubtask(id: string): void {
    const item = this.items().find((entry) => entry.id === id);
    if (!item) return;
    this.setStyle(id, {
      checklist: [...(item.checklist || []), { label: 'New subtask', completed: false }],
      height: Math.max(item.height, 155),
    });
  }
  addTaskNear(id: string): void {
    const item = this.items().find((entry) => entry.id === id);
    if (!item) return;
    this.finishEditing();
    this.createAt('task', { x: item.x, y: item.y + item.height + 18 });
  }
  setListRow(id: string, index: number, event: Event): void {
    const item = this.items().find((entry) => entry.id === id);
    if (!item) return;
    const value = (event.target as HTMLInputElement).value;
    if (item.checklist?.[index]?.label === value) return;
    this.setStyle(id, {
      checklist: item.checklist?.map((row, i) => (i === index ? { ...row, label: value } : row)),
    });
  }
  addListRow(id: string): void {
    const item = this.items().find((entry) => entry.id === id);
    if (!item) return;
    const index = item.checklist?.length || 0;
    this.setStyle(id, {
      checklist: [...(item.checklist || []), { label: '', completed: false }],
      height: Math.max(item.height, 95 + (index + 1) * 32),
    });
    setTimeout(() =>
      document
        .querySelector<HTMLInputElement>(
          `[data-node-id="${id}"] .list-row:nth-child(${index + 1}) input`,
        )
        ?.focus(),
    );
  }
  listKey(event: KeyboardEvent, id: string, index: number): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.setListRow(id, index, event);
      this.addListRow(id);
    } else if (event.key === 'Escape') (event.target as HTMLInputElement).blur();
  }
  dataset(item: CanvasItem): ThreadDataset | undefined {
    return this.datasetStore.get(item.datasetId);
  }
  dataSources(excludeId?: string): { item: CanvasItem; data: ThreadDataset }[] {
    return this.items()
      .filter((item) => ['budget', 'table'].includes(item.type) && item.id !== excludeId)
      .flatMap((item) => {
        const data = this.dataset(item);
        return data ? [{ item, data }] : [];
      });
  }
  private numericColumns(data?: ThreadDataset) {
    return (
      data?.columns.filter((column) => column.type === 'number' || column.type === 'currency') || []
    );
  }
  canChart(data?: ThreadDataset): boolean {
    return (
      !!data &&
      !!this.numericColumns(data).length &&
      !!data.columns.find((column) => ['text', 'category', 'date'].includes(column.type))
    );
  }
  canBudget(data?: ThreadDataset): boolean {
    if (!data || !data.columns.some((column) => ['text', 'category'].includes(column.type)))
      return false;
    const labels = data.columns.map((column) => column.label.trim().toLowerCase());
    return (
      (labels.includes('planned') && labels.includes('actual')) ||
      ((labels.includes('estimate') || labels.includes('estimated')) &&
        (labels.includes('spent') || labels.includes('paid')))
    );
  }
  private defaultChartConfig(data?: ThreadDataset): ChartConfig {
    const label = data?.columns.find((column) =>
      ['text', 'category', 'date'].includes(column.type),
    );
    const numbers = this.numericColumns(data),
      planned = data?.columns.find((column) => column.label === 'Planned'),
      actual = data?.columns.find((column) => column.label === 'Actual');
    const series =
      planned && actual
        ? [planned.key, actual.key]
        : numbers.slice(0, 2).map((column) => column.key);
    return {
      type: label?.type === 'date' ? 'line' : numbers.length > 1 ? 'comparison' : 'bar',
      categoryField: label?.key,
      valueField: planned?.key || numbers[0]?.key,
      series: numbers.length > 1 ? series : undefined,
    };
  }
  money(value: number | string | null | undefined, currency?: BudgetCurrency): string {
    const amount = Number(value);
    return (
      new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(
        Number.isFinite(amount) ? amount : 0,
      ) + (currency ? ' ' + currency : '')
    );
  }
  isNegative(value: number | string | null | undefined): boolean {
    return (Number(value) || 0) < 0;
  }
  budgetItemField(data?: ThreadDataset): string {
    return (
      data?.columns.find((column) => column.key === 'item')?.key ||
      data?.columns.find((column) => ['text', 'category', 'date'].includes(column.type))?.key ||
      'item'
    );
  }
  budgetAmountField(data?: ThreadDataset): string {
    return (
      data?.columns.find((column) => column.key === 'amount')?.key ||
      this.numericColumns(data)[0]?.key ||
      'amount'
    );
  }
  budgetCategoryField(data?: ThreadDataset): string {
    return (
      data?.columns.find((column) => column.key === 'group')?.key ||
      data?.columns.find((column) => column.type === 'category')?.key ||
      'group'
    );
  }
  budgetValue(data: ThreadDataset | undefined, key: string, group?: string): number {
    return (data?.rows || [])
      .filter(
        (row) =>
          group === undefined || String(row.values[this.budgetCategoryField(data)] || '') === group,
      )
      .reduce((sum, row) => sum + (Number(row.values[key]) || 0), 0);
  }
  budgetGroups(data: ThreadDataset): string[] {
    return [
      ...new Set([
        ...(data.groups || []),
        ...data.rows
          .map((row) => String(row.values[this.budgetCategoryField(data)] || '').trim())
          .filter(Boolean),
      ]),
    ];
  }
  budgetSections(data: ThreadDataset): string[] {
    return ['', ...this.budgetGroups(data)];
  }
  budgetRows(data: ThreadDataset, group: string) {
    return data.rows.filter(
      (row) => String(row.values[this.budgetCategoryField(data)] || '').trim() === group,
    );
  }
  budgetUsed(item: CanvasItem): number {
    const data = this.dataset(item);
    return this.budgetValue(data, this.budgetField(data, 'Actual'));
  }
  chartSourceId(item: CanvasItem): string {
    return this.dataSources().find((source) => source.data.id === item.datasetId)?.item.id || '';
  }
  linkedViewCount(item: CanvasItem): number {
    return this.items().filter((view) => view.datasetId === item.datasetId).length;
  }
  remaining(item: CanvasItem): number {
    return (item.budgetTarget || 0) - this.budgetUsed(item);
  }
  usedPercent(item: CanvasItem): number {
    return item.budgetTarget ? Math.min(100, (this.budgetUsed(item) / item.budgetTarget) * 100) : 0;
  }
  budgetHeight(item: CanvasItem): number {
    return Math.min(
      480,
      Math.max(
        260,
        160 + (this.dataset(item)?.rows.length || 0) * 38 + (item.budgetTarget ? 38 : 0),
      ),
    );
  }
  setBudgetCell(item: CanvasItem, rowId: string, key: string, event: Event): void {
    const data = this.dataset(item);
    if (!data) return;
    const column = data.columns.find((entry) => entry.key === key);
    const raw = (event.target as HTMLInputElement).value;
    const value = column?.type === 'currency' || column?.type === 'number' ? Number(raw) || 0 : raw;
    if (data.rows.find((row) => row.id === rowId)?.values[key] === value) return;
    if (!this.dataEditBefore) this.snapshot();
    this.datasetStore.updateCell(data.id, rowId, key, value);
  }
  budgetKey(event: KeyboardEvent, item: CanvasItem, rowId: string): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      if (this.dataEditBefore) {
        this.datasetStore.replace(this.dataEditBefore.datasets || []);
        this.dataEditBefore = null;
      }
      this.editingDataCell.set(null);
      (event.target as HTMLInputElement).blur();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      (event.target as HTMLInputElement).blur();
    }
  }
  addBudgetEntry(id: string, group = ''): void {
    const item = this.items().find((entry) => entry.id === id),
      data = item && this.dataset(item);
    if (!item || !data) return;
    this.snapshot();
    const row = this.datasetStore.addRow(data.id, {
      [this.budgetItemField(data)]: '',
      [this.budgetField(data, 'Planned')]: 0,
      [this.budgetField(data, 'Actual')]: 0,
      [this.budgetCategoryField(data)]: group,
    });
    this.update(id, { height: this.budgetHeight(item) });
    queueMicrotask(() => this.startDataCellEdit(item.id, row.id, this.budgetItemField(data)));
  }
  deleteBudgetEntry(item: CanvasItem, rowId: string): void {
    if (!item.datasetId) return;
    this.snapshot();
    this.datasetStore.deleteRow(item.datasetId, rowId);
    this.update(item.id, { height: this.budgetHeight(item) });
  }
  setBudgetCurrency(item: CanvasItem, event: Event): void {
    this.setStyle(item.id, {
      budgetCurrency: (event.target as HTMLSelectElement).value as BudgetCurrency,
    });
  }
  addBudgetGroup(item: CanvasItem): void {
    const data = this.dataset(item);
    if (!data) return;
    let name = 'New group',
      index = 2;
    while (this.budgetGroups(data).includes(name)) name = `New group ${index++}`;
    this.snapshot();
    this.datasetStore.addGroup(data.id, name);
  }
  renameBudgetGroup(item: CanvasItem, oldName: string, event: Event): void {
    const name = (event.target as HTMLInputElement).value.trim(),
      data = this.dataset(item);
    if (!data || !name || name === oldName) return;
    this.snapshot();
    this.datasetStore.renameGroup(data.id, oldName, name);
  }
  deleteBudgetGroup(item: CanvasItem, name: string): void {
    const data = this.dataset(item);
    if (!data) return;
    this.snapshot();
    this.datasetStore.deleteGroup(data.id, name);
  }
  moveBudgetGroup(item: CanvasItem, name: string, step: number): void {
    const data = this.dataset(item);
    if (!data) return;
    this.snapshot();
    this.datasetStore.moveGroup(data.id, name, step);
  }
  toggleBudgetGroup(name: string): void {
    this.collapsedBudgetGroups.update((groups) =>
      groups.includes(name) ? groups.filter((group) => group !== name) : [...groups, name],
    );
  }
  setBudgetGroup(item: CanvasItem, rowId: string, event: Event): void {
    const data = this.dataset(item);
    if (!data) return;
    this.snapshot();
    this.datasetStore.updateCell(
      data.id,
      rowId,
      this.budgetCategoryField(data),
      (event.target as HTMLSelectElement).value,
    );
  }
  budgetField(data: ThreadDataset | undefined, label: string): string {
    return data?.columns.find((column) => column.label === label)?.key || label.toLowerCase();
  }
  setBudgetTarget(item: CanvasItem, event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.setStyle(item.id, {
      budgetTarget: value > 0 ? value : undefined,
      height: value > 0 ? Math.min(420, item.height + 38) : Math.max(172, item.height - 38),
    });
  }
  setBudgetPeriod(item: CanvasItem, event: Event): void {
    const value = (event.target as HTMLSelectElement).value as 'one-time' | 'monthly',
      data = this.dataset(item);
    if (!data || item.budgetPeriod === value) return;
    this.snapshot();
    if (value === 'monthly')
      this.datasetStore.enablePeriods(data.id, new Date().toISOString().slice(0, 7));
    this.update(item.id, { budgetPeriod: value });
  }
  budgetMonthLabel(data: ThreadDataset): string {
    return data.activePeriod
      ? new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(
          new Date(data.activePeriod + '-01T00:00:00'),
        )
      : '';
  }
  changeBudgetMonth(item: CanvasItem, step: number, copyPlanned: boolean): void {
    const data = this.dataset(item);
    if (!data?.activePeriod) return;
    const date = new Date(data.activePeriod + '-01T00:00:00');
    date.setMonth(date.getMonth() + step);
    this.snapshot();
    this.datasetStore.switchPeriod(data.id, date.toISOString().slice(0, 7), copyPlanned);
  }
  startDataCellEdit(itemId: string, rowId: string, key: string): void {
    const id = `${itemId}:${rowId}:${key}`;
    this.editingDataCell.set(id);
    this.selectedDataCell.set(id);
    queueMicrotask(() => {
      const input = document.querySelector<HTMLInputElement>(`[data-edit-cell="${id}"]`);
      input?.focus();
      input?.select();
    });
  }
  stopDataCellEdit(): void {
    this.editingDataCell.set(null);
    this.endDataEdit();
  }
  dataCellKey(
    event: KeyboardEvent,
    item: CanvasItem,
    rowId: string,
    key: string,
    fields: string[],
  ): void {
    if (event.key === 'Escape') {
      this.budgetKey(event, item, rowId);
      return;
    }
    if (event.key !== 'Tab' && event.key !== 'Enter') return;
    event.preventDefault();
    const data = this.dataset(item);
    if (!data) return;
    const index = fields.indexOf(key),
      next = event.key === 'Enter' ? index + 1 : index + (event.shiftKey ? -1 : 1);
    (event.target as HTMLInputElement).blur();
    if (fields[next]) queueMicrotask(() => this.startDataCellEdit(item.id, rowId, fields[next]));
  }
  setLinkUrl(id: string, event: Event): void {
    const url = (event.target as HTMLInputElement).value.trim();
    this.setStyle(id, { url, title: this.items().find((entry) => entry.id === id)?.title || url });
  }
  copy(): void {
    const ids = new Set(this.selectedIds());
    this.clipboard = structuredClone(this.items().filter((item) => ids.has(item.id)));
  }
  paste(): void {
    const copies = this.insertCopies(this.clipboard);
    if (copies.length) this.clipboard = structuredClone(copies);
  }
  async fileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = input.files;
    if (files?.length) await this.importFiles(files, this.imagePlacement || this.centerPoint());
    input.value = '';
    input.accept = 'image/*,audio/*,video/*,.pdf,.txt,.doc,.docx';
    this.imagePlacement = null;
    this.replaceId = null;
  }
  private centerPoint(): { x: number; y: number } {
    const rect = this.viewport()?.nativeElement.getBoundingClientRect();
    return rect
      ? this.point(rect.left + rect.width / 2, rect.top + rect.height / 2)
      : { x: 0, y: 0 };
  }
  private async buildWaveform(source: string): Promise<number[]> {
    try {
      const response = await fetch(source),
        buffer = await response.arrayBuffer(),
        context = new AudioContext();
      try {
        const decoded = await context.decodeAudioData(buffer),
          channel = decoded.getChannelData(0),
          bars = 48,
          samplesPerBar = Math.max(1, Math.floor(channel.length / bars));
        return Array.from({ length: bars }, (_, bar) => {
          const start = bar * samplesPerBar,
            end = Math.min(channel.length, start + samplesPerBar);
          let peak = 0;
          for (let i = start; i < end; i += 4) peak = Math.max(peak, Math.abs(channel[i]));
          return Math.max(0.08, Math.min(1, peak));
        });
      } finally {
        await context.close();
      }
    } catch {
      return [];
    }
  }
  private async importFiles(
    files: FileList | File[],
    point: { x: number; y: number },
    duration?: string,
  ): Promise<void> {
    let index = 0;
    for (const file of Array.from(files)) {
      const source = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      const image = file.type.startsWith('image/'),
        audio = file.type.startsWith('audio/'),
        video = file.type.startsWith('video/');
      const waveform = audio ? await this.buildWaveform(source) : undefined;
      let width = audio ? 300 : video ? 320 : 260,
        height = audio ? 150 : video ? 210 : 130;
      if (image) {
        const size = await new Promise<{ width: number; height: number }>((resolve) => {
          const img = new Image();
          img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
          img.onerror = () => resolve({ width: 320, height: 240 });
          img.src = source;
        });
        const scale = Math.min(1, 520 / size.width, 420 / size.height);
        width = size.width * scale;
        height = size.height * scale;
      }
      if (image && this.replaceId) {
        this.snapshot();
        this.update(this.replaceId, {
          image: source,
          title: file.name,
          cropX: 0,
          cropY: 0,
          cropScale: 1,
        });
        break;
      }
      const item: CanvasItem = {
        id: canvasId(),
        type: image ? 'image' : audio ? 'voice' : video ? 'video' : 'file',
        parentId:
          this.containerAt({
            x: point.x + 24 * index + width / 2,
            y: point.y + 24 * index + height / 2,
          })?.id || null,
        x: point.x + 24 * index,
        y: point.y + 24 * index,
        width,
        height,
        title: file.name,
        body: audio ? 'A voice note from this board.' : undefined,
        duration: audio ? duration : undefined,
        waveform,
        image: image ? source : undefined,
        filename: file.name,
        url: image ? undefined : source,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      this.snapshot();
      this.items.update((items) => [...items, item]);
      this.selectedIds.set([item.id]);
      index++;
    }
  }
  dragOver(event: DragEvent): void {
    if (event.dataTransfer?.types.includes('Files')) {
      event.preventDefault();
      this.dropActive.set(true);
    }
  }
  dragLeave(): void {
    this.dropActive.set(false);
  }
  async drop(event: DragEvent): Promise<void> {
    event.preventDefault();
    this.dropActive.set(false);
    if (!event.dataTransfer?.files.length) return;
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-node-id]');
    const item = this.items().find((entry) => entry.id === target?.dataset['nodeId']);
    this.replaceId = item?.type === 'image' && !item.image ? item.id : null;
    await this.importFiles(event.dataTransfer.files, this.point(event.clientX, event.clientY));
    this.replaceId = null;
  }
  @HostListener('window:paste', ['$event']) async onPaste(event: ClipboardEvent): Promise<void> {
    const target = event.target as HTMLElement;
    if (target.isContentEditable || ['INPUT', 'TEXTAREA'].includes(target.tagName)) return;
    const files = Array.from(event.clipboardData?.files || []);
    if (files.length) {
      event.preventDefault();
      await this.importFiles(files, this.centerPoint());
      return;
    }
    const value = event.clipboardData?.getData('text/plain')?.trim();
    if (value && !this.clipboard.length) {
      event.preventDefault();
      this.createAt(/^https?:\/\//.test(value) ? 'link' : 'text', this.centerPoint());
      const item = this.selected();
      if (item)
        this.update(item.id, { title: value, url: item.type === 'link' ? value : undefined });
    }
  }
  replaceImage(): void {
    const item = this.selected();
    if (item?.type === 'image') this.selectImageForBlock(item.id);
  }
  startCrop(): void {
    const item = this.selected();
    if (item?.type !== 'image') return;
    this.cropBefore = this.state();
    this.cropId.set(item.id);
    this.inspectorOpen.set(false);
  }
  cropZoom(factor: number): void {
    const item = this.selected();
    if (item?.type === 'image')
      this.update(item.id, { cropScale: Math.max(1, Math.min(5, (item.cropScale || 1) * factor)) });
  }
  finishCrop(save: boolean): void {
    if (this.cropBefore) {
      if (save) this.commit(this.cropBefore);
      else {
        this.items.set(this.cropBefore.items);
        this.connections.set(this.cropBefore.connections);
      }
    }
    this.cropBefore = null;
    this.cropId.set(null);
  }
  imageTransform(item: CanvasItem): string {
    const scale = item.cropScale || 1;
    return `translate(${item.cropX || 0}px, ${item.cropY || 0}px) scale(${scale * (item.flipX ? -1 : 1)}, ${scale * (item.flipY ? -1 : 1)})`;
  }
  layer(direction: 'front' | 'back' | 'top' | 'bottom'): void {
    const selected = new Set(this.selectedIds());
    if (!selected.size) return;
    const ordered = [...this.items()].sort(
      (a, b) =>
        (a.zIndex ?? (a.type === 'zone' || a.type === 'workspace' || a.type === 'frame' ? 0 : 1)) -
        (b.zIndex ?? (b.type === 'zone' || b.type === 'workspace' || b.type === 'frame' ? 0 : 1)),
    );
    if (direction === 'top' || direction === 'bottom') {
      const chosen = ordered.filter((item) => selected.has(item.id)),
        rest = ordered.filter((item) => !selected.has(item.id));
      ordered.splice(
        0,
        ordered.length,
        ...(direction === 'top' ? [...rest, ...chosen] : [...chosen, ...rest]),
      );
    } else {
      const indexes = direction === 'front' ? [...ordered.keys()].reverse() : [...ordered.keys()];
      for (const index of indexes) {
        const next = index + (direction === 'front' ? 1 : -1);
        if (
          next < 0 ||
          next >= ordered.length ||
          !selected.has(ordered[index].id) ||
          selected.has(ordered[next].id)
        )
          continue;
        [ordered[index], ordered[next]] = [ordered[next], ordered[index]];
      }
    }
    const levels = new Map(ordered.map((item, index) => [item.id, index + 1]));
    this.snapshot();
    this.items.update((items) => items.map((item) => ({ ...item, zIndex: levels.get(item.id) })));
  }
  flip(id: string, axis: 'x' | 'y'): void {
    const item = this.items().find((entry) => entry.id === id);
    if (item) this.setStyle(id, axis === 'x' ? { flipX: !item.flipX } : { flipY: !item.flipY });
  }
  align(axis: 'x' | 'y'): void {
    const targets = this.items().filter((item) => this.selectedIds().includes(item.id));
    if (targets.length < 2) return;
    const value = Math.min(...targets.map((item) => item[axis]));
    this.snapshot();
    targets.forEach((item) => this.update(item.id, { [axis]: value }));
  }
  private eraseSketchAt(point: { x: number; y: number }): void {
    const radius = 18 / this.zoom();
    this.activeSketchStrokes.update((strokes) =>
      strokes.filter(
        (stroke) =>
          distanceToStroke(point, stroke) > radius + brushDiameter(stroke.brush, stroke.size) / 2,
      ),
    );
    this.items.update((items) =>
      items.flatMap((item) => {
        if (item.type !== 'sketch' || item.id === this.editingSketchId()) return [item];
        const angle = (-(item.rotation || 0) * Math.PI) / 180,
          cos = Math.cos(angle),
          sin = Math.sin(angle);
        const dx = point.x - item.x - item.width / 2,
          dy = point.y - item.y - item.height / 2;
        const localX = dx * cos - dy * sin + item.width / 2,
          localY = dx * sin + dy * cos + item.height / 2;
        const sourceX = (localX * (item.sourceWidth || item.width)) / item.width,
          sourceY = (localY * (item.sourceHeight || item.height)) / item.height;
        const scale = Math.max(
          (item.sourceWidth || item.width) / item.width,
          (item.sourceHeight || item.height) / item.height,
        );
        const existing =
          item.sketchStrokes ||
          (item.strokes || []).map((points, index): SketchStroke => ({
            id: `${item.id}-${index}`,
            brush: 'pen',
            points: points.map((p) => ({ x: p.x, y: p.y, pressure: p.pressure ?? 0.5 })),
            color: item.accent || '#d4111c',
            size: item.strokeWidth || 3,
            opacity: item.strokeOpacity || 1,
          }));
        const remaining = existing.filter(
          (stroke) =>
            distanceToStroke({ x: sourceX, y: sourceY }, stroke) >
            radius * scale + brushDiameter(stroke.brush, stroke.size) / 2,
        );
        return remaining.length ? [{ ...item, sketchStrokes: remaining, strokes: undefined }] : [];
      }),
    );
  }
  private finishSketch(): void {
    if (!this.sketchPoints().length) return;
    const stroke: SketchStroke = {
      id: canvasId(),
      brush: this.brush(),
      points: this.sketchPoints().map((point) => ({
        x: point.x,
        y: point.y,
        pressure: point.pressure ?? 0.5,
      })),
      color: this.sketchColor(),
      size: this.brushWidth(),
      opacity: this.brushOpacity(),
    };
    const bounds = strokeBounds([stroke]);
    const normalized = {
      ...stroke,
      points: stroke.points.map((point) => ({
        ...point,
        x: point.x - bounds.x,
        y: point.y - bounds.y,
      })),
    };
    const item: CanvasItem = {
      id: stroke.id,
      type: 'sketch',
      parentId: null,
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      sourceWidth: bounds.width,
      sourceHeight: bounds.height,
      title: 'Stroke',
      sketchStrokes: [normalized],
      rotation: 0,
      zIndex: Math.max(1, ...this.items().map((entry) => entry.zIndex || 1)) + 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.snapshot();
    this.items.update((items) => [...items, item]);
  }
  undoSketchStroke(): void {
    this.undo();
  }
  redoSketchStroke(): void {
    this.redo();
  }
  editSketch(id: string): void {
    const item = this.items().find((entry) => entry.id === id);
    if (!item || item.type !== 'sketch') return;
    this.setTool('sketch');
    this.editingSketchId.set(id);
    const angle = ((item.rotation || 0) * Math.PI) / 180,
      cos = Math.cos(angle),
      sin = Math.sin(angle);
    const strokes =
      item.sketchStrokes ||
      (item.strokes || []).map((points, index): SketchStroke => ({
        id: `${id}-${index}`,
        brush: 'pen',
        points: points.map((point) => ({
          x: point.x,
          y: point.y,
          pressure: point.pressure ?? 0.5,
        })),
        color: item.accent || '#d4111c',
        size: item.strokeWidth || 3,
        opacity: item.strokeOpacity || 1,
      }));
    this.activeSketchStrokes.set(
      strokes.map((stroke) => ({
        ...stroke,
        points: stroke.points.map((point) => {
          const x = (point.x * item.width) / (item.sourceWidth || item.width) - item.width / 2,
            y = (point.y * item.height) / (item.sourceHeight || item.height) - item.height / 2;
          return {
            ...point,
            x: item.x + item.width / 2 + x * cos - y * sin,
            y: item.y + item.height / 2 + x * sin + y * cos,
          };
        }),
      })),
    );
  }
  private completeSketch(): void {
    this.activeSketchStrokes.set([]);
    this.undoneSketchStrokes.set([]);
    this.editingSketchId.set(null);
  }
  tableColumns(item: CanvasItem) {
    return this.dataset(item)?.columns || [];
  }
  tableViewColumns(item: CanvasItem, data: ThreadDataset) {
    const order = item.tableColumnOrder || [];
    return [...data.columns].sort((a, b) => {
      const ai = order.indexOf(a.id),
        bi = order.indexOf(b.id);
      return (
        (ai < 0 ? data.columns.indexOf(a) + order.length : ai) -
        (bi < 0 ? data.columns.indexOf(b) + order.length : bi)
      );
    });
  }
  dragTableColumn(columnId: string, event: DragEvent): void {
    this.draggedTableColumn.set(columnId);
    event.dataTransfer?.setData('text/plain', columnId);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }
  dropTableColumn(item: CanvasItem, data: ThreadDataset, targetId: string, event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const source = this.draggedTableColumn();
    this.draggedTableColumn.set(null);
    if (!source || source === targetId) return;
    const order = this.tableViewColumns(item, data).map((column) => column.id),
      from = order.indexOf(source),
      to = order.indexOf(targetId);
    if (from < 0 || to < 0) return;
    order.splice(from, 1);
    order.splice(to, 0, source);
    this.setStyle(item.id, { tableColumnOrder: order });
  }
  resizeTableColumn(event: PointerEvent, item: CanvasItem, columnId: string): void {
    event.preventDefault();
    event.stopPropagation();
    const before = this.state(),
      start = event.clientX,
      width = item.tableColumnWidths?.[columnId] || 120;
    const move = (next: PointerEvent) => {
      this.update(item.id, {
        tableColumnWidths: {
          ...item.tableColumnWidths,
          [columnId]: Math.max(90, Math.min(420, width + (next.clientX - start) / this.zoom())),
        },
      });
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      this.commit(before);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop, { once: true });
  }
  fitTableColumn(item: CanvasItem, data: ThreadDataset, columnId: string): void {
    const column = data.columns.find((entry) => entry.id === columnId);
    if (!column) return;
    const max = Math.max(
      column.label.length,
      ...data.rows.map((row) => String(row.values[column.key] ?? '').length),
    );
    this.setStyle(item.id, {
      tableColumnWidths: {
        ...item.tableColumnWidths,
        [columnId]: Math.max(90, Math.min(320, max * 8 + 28)),
      },
    });
  }
  tableRows(item: CanvasItem) {
    return this.dataset(item)?.rows || [];
  }
  setTableHeader(item: CanvasItem, columnId: string, event: Event): void {
    const data = this.dataset(item);
    if (!data) return;
    const label = (event.target as HTMLInputElement).value.trim() || 'Column';
    this.snapshot();
    this.datasetStore.renameColumn(data.id, columnId, label);
    if (/^(date|month|year|day)$/i.test(label))
      this.datasetStore.setColumnType(data.id, columnId, 'date');
  }
  setTableColumnType(item: CanvasItem, columnId: string, event: Event): void {
    if (!item.datasetId) return;
    this.snapshot();
    this.datasetStore.setColumnType(
      item.datasetId,
      columnId,
      (event.target as HTMLSelectElement).value as
        'text' | 'number' | 'currency' | 'date' | 'category' | 'checkbox',
    );
  }
  setTableCell(item: CanvasItem, rowId: string, key: string, event: Event): void {
    const data = this.dataset(item);
    if (!data) return;
    const column = data.columns.find((entry) => entry.key === key);
    if (!column || column.type === 'calculated') return;
    const input = event.target as HTMLInputElement,
      raw = input.value;
    const value =
      column.type === 'checkbox'
        ? input.checked
          ? 1
          : 0
        : column.type === 'number' || column.type === 'currency'
          ? raw.trim()
            ? Number(raw)
            : null
          : raw;
    if (typeof value === 'number' && !Number.isFinite(value)) return;
    this.datasetStore.updateCell(data.id, rowId, key, value);
  }
  addTableRow(id: string): void {
    const item = this.items().find((entry) => entry.id === id);
    if (!item?.datasetId) return;
    this.snapshot();
    this.datasetStore.addRow(item.datasetId);
    this.update(id, {
      height: Math.min(640, Math.max(item.height, 150 + this.tableRows(item).length * 38)),
    });
  }
  addTableColumn(id: string, label?: string, type?: string): void {
    const item = this.items().find((entry) => entry.id === id);
    if (!item?.datasetId) return;
    this.snapshot();
    this.datasetStore.addColumn(
      item.datasetId,
      label?.trim() || `Column ${this.tableColumns(item).length + 1}`,
      (type || 'text') as 'text' | 'number' | 'currency' | 'date' | 'category' | 'checkbox',
    );
    this.update(id, { width: item.width + 120 });
  }
  removeTableRow(item: CanvasItem, rowId: string): void {
    if (!item.datasetId) return;
    this.snapshot();
    this.datasetStore.deleteRow(item.datasetId, rowId);
  }
  removeTableColumn(item: CanvasItem, columnId: string): void {
    if (!item.datasetId || this.tableColumns(item).length <= 1) return;
    this.snapshot();
    this.datasetStore.deleteColumn(item.datasetId, columnId);
  }
  tableVisibleRows(item: CanvasItem, data: ThreadDataset): ThreadDataset['rows'] {
    let rows = [...data.rows];
    const filter = this.tableFilter();
    if (filter?.itemId === item.id && (filter.value || filter.operator === 'empty'))
      rows = rows.filter((row) => {
        const raw = row.values[filter.key],
          text = String(raw ?? '').toLowerCase(),
          value = filter.value.toLowerCase();
        if (filter.operator === 'empty') return raw === null || raw === undefined || raw === '';
        if (filter.operator === 'is') return text === value;
        if (filter.operator === 'not') return text !== value;
        if (filter.operator === 'gt' || filter.operator === 'lt' || filter.operator === 'between') {
          if (
            raw === null ||
            raw === undefined ||
            raw === '' ||
            !Number.isFinite(Number(raw)) ||
            !Number.isFinite(Number(filter.value))
          )
            return false;
          const a = Number(raw),
            b = Number(filter.value);
          return filter.operator === 'gt'
            ? a > b
            : filter.operator === 'lt'
              ? a < b
              : Number.isFinite(Number(filter.second)) &&
                filter.second !== '' &&
                a >= b &&
                a <= Number(filter.second);
        }
        return text.includes(value);
      });
    const sort = this.tableSort();
    if (sort?.itemId === item.id) {
      const numeric = ['number', 'currency', 'calculated'].includes(
        data.columns.find((column) => column.key === sort.key)?.type || '',
      );
      rows.sort((a, b) => {
        const av = a.values[sort.key],
          bv = b.values[sort.key];
        if (av === null || av === undefined || av === '')
          return bv === null || bv === undefined || bv === '' ? 0 : 1;
        if (bv === null || bv === undefined || bv === '') return -1;
        return (
          (numeric ? Number(av) - Number(bv) : String(av).localeCompare(String(bv))) *
          sort.direction
        );
      });
    }
    return rows;
  }
  tableGroupedRows(
    item: CanvasItem,
    data: ThreadDataset,
  ): { id: string; row?: ThreadDataset['rows'][number]; group?: string; count?: number }[] {
    const rows = this.tableVisibleRows(item, data),
      group = this.tableGroup();
    if (group?.itemId !== item.id) return rows.map((row) => ({ id: row.id, row }));
    const buckets = new Map<string, ThreadDataset['rows']>();
    for (const row of rows) {
      const name = String(row.values[group.key] ?? 'Ungrouped') || 'Ungrouped';
      buckets.set(name, [...(buckets.get(name) || []), row]);
    }
    return [...buckets].flatMap(([name, members]) => [
      { id: `group:${name}`, group: name, count: members.length },
      ...(this.collapsedTableGroups().includes(`${item.id}:${name}`)
        ? []
        : members.map((row) => ({ id: row.id, row }))),
    ]);
  }
  setTableGroup(item: CanvasItem, key: string): void {
    this.tableGroup.set({ itemId: item.id, key });
  }
  clearTableGroup(): void {
    this.tableGroup.set(null);
  }
  toggleTableGroup(item: CanvasItem, name: string): void {
    const id = `${item.id}:${name}`;
    this.collapsedTableGroups.update((groups) =>
      groups.includes(id) ? groups.filter((group) => group !== id) : [...groups, id],
    );
  }
  selectTableCell(item: CanvasItem, rowId: string, key: string): void {
    this.selectedDataCell.set(`${item.id}:${rowId}:${key}`);
  }
  editTableCell(item: CanvasItem, rowId: string, key: string): void {
    const column = this.dataset(item)?.columns.find((entry) => entry.key === key);
    if (column?.type === 'calculated') return;
    this.startDataCellEdit(item.id, rowId, key);
  }
  tableCellKey(event: KeyboardEvent, item: CanvasItem, rowId: string, key: string): void {
    const data = this.dataset(item);
    if (!data) return;
    if (event.key === 'Enter' || event.key === 'F2') {
      event.preventDefault();
      this.editTableCell(item, rowId, key);
      return;
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
      event.preventDefault();
      this.editTableCell(item, rowId, key);
      queueMicrotask(() => {
        const input = document.querySelector<HTMLInputElement>(
          `[data-edit-cell="${item.id}:${rowId}:${key}"]`,
        );
        if (input) {
          input.value = event.key;
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      });
      return;
    }
    const rows = this.tableVisibleRows(item, data),
      columns = this.tableViewColumns(item, data),
      ri = rows.findIndex((row) => row.id === rowId),
      ci = columns.findIndex((column) => column.key === key);
    let nr = ri,
      nc = ci;
    if (event.key === 'ArrowDown') nr++;
    else if (event.key === 'ArrowUp') nr--;
    else if (event.key === 'ArrowRight') nc++;
    else if (event.key === 'ArrowLeft') nc--;
    else return;
    event.preventDefault();
    const target = rows[Math.max(0, Math.min(rows.length - 1, nr))],
      column = columns[Math.max(0, Math.min(columns.length - 1, nc))];
    if (target && column) {
      this.selectTableCell(item, target.id, column.key);
      queueMicrotask(() =>
        document
          .querySelector<HTMLElement>(`[data-select-cell="${item.id}:${target.id}:${column.key}"]`)
          ?.focus(),
      );
    }
  }
  tableEditKey(event: KeyboardEvent, item: CanvasItem, rowId: string, key: string): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      if (this.dataEditBefore) {
        this.datasetStore.replace(this.dataEditBefore.datasets || []);
        this.dataEditBefore = null;
      }
      this.editingDataCell.set(null);
      return;
    }
    if (event.key !== 'Enter' && event.key !== 'Tab') return;
    event.preventDefault();
    const data = this.dataset(item);
    if (!data) return;
    const cols = this.tableViewColumns(item, data),
      rows = this.tableVisibleRows(item, data),
      ci = cols.findIndex((column) => column.key === key),
      ri = rows.findIndex((row) => row.id === rowId);
    (event.target as HTMLInputElement).blur();
    const next =
      event.key === 'Enter'
        ? { r: Math.min(ri + 1, rows.length - 1), c: ci }
        : { r: ri, c: Math.max(0, Math.min(cols.length - 1, ci + (event.shiftKey ? -1 : 1))) };
    const target = rows[next.r],
      column = cols[next.c];
    if (target && column) queueMicrotask(() => this.editTableCell(item, target.id, column.key));
  }
  setTableSort(item: CanvasItem, key: string, direction: 1 | -1): void {
    this.tableSort.set({ itemId: item.id, key, direction });
  }
  clearTableSort(): void {
    this.tableSort.set(null);
  }
  setTableFilter(item: CanvasItem, key: string, event: Event): void {
    const current = this.tableFilter();
    this.tableFilter.set({
      itemId: item.id,
      key,
      operator: current?.key === key ? current.operator : 'contains',
      value: (event.target as HTMLInputElement).value,
      second: current?.key === key ? current.second : undefined,
    });
  }
  setTableFilterOperator(item: CanvasItem, key: string, event: Event): void {
    const current = this.tableFilter();
    this.tableFilter.set({
      itemId: item.id,
      key,
      operator: (event.target as HTMLSelectElement).value,
      value: current?.key === key ? current.value : '',
    });
  }
  setTableFilterSecond(item: CanvasItem, key: string, event: Event): void {
    const current = this.tableFilter();
    this.tableFilter.set({
      itemId: item.id,
      key,
      operator: 'between',
      value: current?.key === key ? current.value : '',
      second: (event.target as HTMLInputElement).value,
    });
  }
  clearTableFilter(): void {
    this.tableFilter.set(null);
  }
  tableSum(data: ThreadDataset, key: string): number {
    return data.rows.reduce((sum, row) => sum + (Number(row.values[key]) || 0), 0);
  }
  setTableSummary(item: CanvasItem, key: string, event: Event): void {
    const value = (event.target as HTMLSelectElement).value as
      'sum' | 'average' | 'min' | 'max' | 'count';
    this.tableSummary.update((current) => ({ ...current, [`${item.id}:${key}`]: value }));
  }
  tableSummaryLabel(item: CanvasItem, key: string): string {
    const value = this.tableSummary()[`${item.id}:${key}`] || 'sum';
    return value[0].toUpperCase() + value.slice(1);
  }
  tableSummaryValue(item: CanvasItem, data: ThreadDataset, key: string): number {
    const rows = this.tableVisibleRows(item, data),
      values = rows
        .map((row) => row.values[key])
        .filter((value) => value !== null && value !== undefined && value !== '')
        .map(Number)
        .filter(Number.isFinite),
      kind = this.tableSummary()[`${item.id}:${key}`] || 'sum';
    if (kind === 'count') return rows.length;
    if (!values.length) return 0;
    if (kind === 'average') return values.reduce((sum, value) => sum + value, 0) / values.length;
    if (kind === 'min') return Math.min(...values);
    if (kind === 'max') return Math.max(...values);
    return values.reduce((sum, value) => sum + value, 0);
  }
  useCostEstimate(item: CanvasItem): void {
    if (item.type !== 'table') return;
    this.snapshot();
    const data = this.datasetStore.create([
      { label: 'Item', type: 'text', key: 'item' },
      { label: 'Quantity', type: 'number', key: 'quantity' },
      { label: 'Unit Cost', type: 'currency', key: 'unit_cost' },
      { label: 'Total Cost', type: 'calculated', key: 'total_cost' },
    ]);
    this.datasetStore.setCalculation(data.id, data.columns[3].id, {
      left: 'quantity',
      operator: '*',
      right: 'unit_cost',
    });
    this.update(item.id, {
      datasetId: data.id,
      title: item.title || 'Cost estimate',
      width: Math.max(item.width, 440),
      height: Math.max(item.height, 240),
    });
  }
  addCalculatedColumn(
    item: CanvasItem,
    label: string,
    left: string,
    operator: string,
    right: string,
  ): void {
    const data = this.dataset(item);
    if (!data || !label.trim() || !left || !right) return;
    this.snapshot();
    this.datasetStore.addColumn(data.id, label.trim(), 'calculated');
    const column = this.datasetStore.get(data.id)?.columns.at(-1);
    if (column)
      this.datasetStore.setCalculation(data.id, column.id, {
        left,
        operator: operator as '+' | '-' | '*' | '/' | '%',
        right,
      });
  }
  chartTypes(data?: ThreadDataset): ChartConfig['type'][] {
    if (!this.canChart(data)) return [];
    return [
      'bar',
      'line',
      'donut',
      ...(this.numericColumns(data).length > 1 ? ['comparison' as const] : []),
    ];
  }
  createLinkedView(
    source: CanvasItem,
    type: 'budget' | 'table' | 'chart',
    chartType?: ChartConfig['type'],
  ): void {
    const data = this.dataset(source);
    if (
      !data ||
      (type === 'chart' && !this.canChart(data)) ||
      (type === 'budget' && !this.canBudget(data))
    )
      return;
    this.snapshot();
    if (type === 'budget') this.upgradeBudgetDataset(data);
    const current = this.datasetStore.get(data.id) || data;
    const now = new Date().toISOString();
    const item: CanvasItem = {
      id: canvasId(),
      type,
      parentId: source.parentId,
      x: source.x + source.width + 28,
      y: source.y,
      width: type === 'table' ? 680 : 640,
      height: type === 'budget' ? 430 : type === 'table' ? 370 : 390,
      title: '',
      datasetId: data.id,
      budgetMode: type === 'budget' ? 'project' : undefined,
      budgetCurrency: type === 'budget' ? 'JOD' : undefined,
      chartConfig:
        type === 'chart'
          ? {
              ...this.defaultChartConfig(current),
              type: chartType || this.defaultChartConfig(current).type,
            }
          : undefined,
      zIndex: Math.max(1, ...this.items().map((entry) => entry.zIndex || 1)) + 1,
      createdAt: now,
      updatedAt: now,
    };
    this.items.update((items) => [...items, item]);
    this.selectedIds.set([item.id]);
  }
  linkChartSource(item: CanvasItem, event: Event): void {
    const sourceId = (event.target as HTMLSelectElement).value,
      source = this.items().find((entry) => entry.id === sourceId),
      data = source && this.dataset(source);
    if (!data || !this.canChart(data)) return;
    this.chartSelection.set(null);
    this.setStyle(item.id, { datasetId: data.id, chartConfig: this.defaultChartConfig(data) });
  }
  setChartConfig(item: CanvasItem, patch: Partial<ChartConfig>): void {
    this.setStyle(item.id, {
      chartConfig: {
        ...this.defaultChartConfig(this.dataset(item)),
        ...item.chartConfig,
        ...patch,
      },
    });
  }
  chartTitle(item: CanvasItem): string {
    const data = this.dataset(item);
    if (!data) return 'Choose a Budget or Table to visualize';
    const config = item.chartConfig;
    const source = this.dataSources().find((entry) => entry.data.id === data.id)?.item;
    const value =
      data.columns.find((column) => column.key === config?.valueField)?.label || 'Values';
    return `${config?.type === 'comparison' ? 'Compare values' : value} · ${source?.title || source?.type || 'Table'}`;
  }
  chartHasBudget(item: CanvasItem): boolean {
    const data = this.dataset(item);
    return (
      !!data &&
      !!data.columns.find((column) => column.label === 'Planned') &&
      !!data.columns.find((column) => column.label === 'Actual')
    );
  }
  setChartType(item: CanvasItem, event: Event): void {
    const type = (event.target as HTMLSelectElement).value as ChartConfig['type'];
    this.chartSelection.set(null);
    this.setChartConfig(item, { type });
  }
  setChartField(item: CanvasItem, field: 'categoryField' | 'valueField', event: Event): void {
    this.chartSelection.set(null);
    const key = (event.target as HTMLSelectElement).value;
    const data = this.dataset(item);
    const other = this.numericColumns(data).find((column) => column.key !== key)?.key;
    this.setChartConfig(
      item,
      field === 'valueField' && item.chartConfig?.type === 'comparison'
        ? { valueField: key, series: other ? [key, other] : [key] }
        : { [field]: key },
    );
  }
  setChartPreset(item: CanvasItem, preset: 'comparison' | 'actual' | 'distribution'): void {
    const data = this.dataset(item);
    if (!data) return;
    const planned = this.budgetField(data, 'Planned'),
      actual = this.budgetField(data, 'Actual');
    this.setChartConfig(
      item,
      preset === 'comparison'
        ? { type: 'comparison', valueField: planned, series: [planned, actual] }
        : preset === 'distribution'
          ? { type: 'donut', valueField: planned, series: undefined }
          : { type: 'bar', valueField: actual, series: undefined },
    );
  }
  selectChartPoint(item: CanvasItem, label: string): void {
    if (label) this.chartSelection.set({ itemId: item.id, label });
  }
  chartSelectedValue(item: CanvasItem, field: 'Planned' | 'Actual'): number {
    const data = this.dataset(item),
      label = this.chartSelection()?.label,
      key =
        item.chartConfig?.categoryField ||
        data?.columns.find((column) => column.type === 'text' || column.type === 'category')?.key;
    if (!data || !label || !key) return 0;
    return data.rows
      .filter((row) => String(row.values[key] ?? '') === label)
      .reduce((sum, row) => sum + (Number(row.values[this.budgetField(data, field)]) || 0), 0);
  }
  focusLinkedView(chart: CanvasItem, type: 'budget' | 'table'): void {
    const target = this.items().find(
      (item) => item.type === type && item.datasetId === chart.datasetId,
    );
    if (!target) return;
    this.selectedIds.set([target.id]);
    const viewport = this.viewport()?.nativeElement;
    if (viewport) {
      this.panX.set(viewport.clientWidth / 2 - (target.x + target.width / 2) * this.zoom());
      this.panY.set(viewport.clientHeight / 2 - (target.y + target.height / 2) * this.zoom());
    }
  }
}
