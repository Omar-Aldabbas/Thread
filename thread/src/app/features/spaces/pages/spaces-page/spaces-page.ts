import {
  Component,
  computed,
  effect,
  ElementRef,
  HostListener,
  inject,
  PLATFORM_ID,
  signal,
  viewChild,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';

type Tool = 'select' | 'hand' | 'edit' | 'add';

type SpaceTone = 'red' | 'blue' | 'yellow' | 'green' | 'neutral';

type SpacePreview = 'mixed' | 'checklist' | 'notes' | 'visual';

interface SpaceCard {
  id: string;

  title: string;

  itemCount: number;

  updatedAt: string;

  x: number;
  y: number;

  tone: SpaceTone;

  preview: SpacePreview;
}

interface PanSession {
  pointerId: number;

  startClientX: number;
  startClientY: number;

  startPanX: number;
  startPanY: number;
}

interface DragSession {
  pointerId: number;

  spaceId: string;

  startClientX: number;
  startClientY: number;

  startSpaceX: number;
  startSpaceY: number;

  moved: boolean;
}

@Component({
  selector: 'app-spaces-page',
  imports: [],
  templateUrl: './spaces-page.html',
  styleUrl: './spaces-page.css',
})
export class SpacesPage {
  private readonly router = inject(Router);

  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly viewport = viewChild<ElementRef<HTMLElement>>('viewport');

  private readonly spacesStorageKey = 'thread-spaces';

  private readonly viewStorageKey = 'thread-spaces-view';

  private readonly cardWidth = 320;
  private readonly cardHeight = 208;

  /*
   * =========================
   * TOOLS
   * =========================
   */

  readonly activeTool = signal<Tool>('select');

  readonly previousTool = signal<Tool>('select');

  readonly isSpacebarDown = signal(false);

  readonly cursorClass = computed(() => {
    if (this.isSpacebarDown()) {
      return 'tool-hand';
    }

    return `tool-${this.activeTool()}`;
  });

  setTool(tool: Tool): void {
    this.activeTool.set(tool);

    if (tool !== 'add') {
      this.previousTool.set(tool);
    }

    this.cancelInteractions();

    if (tool !== 'edit') {
      this.editingSpaceId.set(null);
    }
  }

  /*
   * =========================
   * SPACES
   * =========================
   */

  readonly spaces = signal<SpaceCard[]>(this.loadSpaces());

  readonly selectedSpaceId = signal<string | null>(null);

  readonly selectedSpace = computed(() => {
    const id = this.selectedSpaceId();

    if (!id) {
      return null;
    }

    return this.spaces().find((space) => space.id === id) ?? null;
  });

  /*
   * =========================
   * SEARCH
   * =========================
   */

  readonly searchQuery = signal('');

  readonly visibleSpaces = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();

    if (!query) {
      return this.spaces();
    }

    return this.spaces().filter((space) => space.title.toLowerCase().includes(query));
  });

  /*
   * =========================
   * CAMERA
   * =========================
   */

  private readonly savedView = this.loadView();

  readonly panX = signal(this.savedView.x);

  readonly panY = signal(this.savedView.y);

  readonly zoom = signal(this.savedView.zoom);

  readonly isPanning = signal(false);

  readonly draggingSpaceId = signal<string | null>(null);

  readonly zoomPercent = computed(() => Math.round(this.zoom() * 100));

  readonly worldTransform = computed(
    () =>
      `translate3d(
          ${this.panX()}px,
          ${this.panY()}px,
          0
        )
        scale(${this.zoom()})`,
  );

  readonly gridSize = computed(() => {
    const value = 24 * this.zoom();

    return `${value}px ${value}px`;
  });

  readonly gridPosition = computed(() => `${this.panX()}px ${this.panY()}px`);

  /*
   * =========================
   * EDITOR
   * =========================
   */

  readonly editingSpaceId = signal<string | null>(null);

  readonly titleDraft = signal('');

  /*
   * =========================
   * POINTER SESSIONS
   * =========================
   */

  private panSession: PanSession | null = null;

  private dragSession: DragSession | null = null;

  constructor() {
    effect(() => {
      if (!this.isBrowser) {
        return;
      }

      localStorage.setItem(this.spacesStorageKey, JSON.stringify(this.spaces()));
    });

    effect(() => {
      if (!this.isBrowser) {
        return;
      }

      localStorage.setItem(
        this.viewStorageKey,
        JSON.stringify({
          x: this.panX(),
          y: this.panY(),
          zoom: this.zoom(),
        }),
      );
    });
  }

  /*
   * =========================
   * KEYBOARD
   * =========================
   */

  @HostListener('window:keydown', ['$event'])
  handleKeyDown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement;

    const typing = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';

    if (typing) {
      return;
    }

    if (event.code === 'Space' && !event.repeat) {
      event.preventDefault();

      this.isSpacebarDown.set(true);

      this.cancelInteractions();

      return;
    }

    switch (event.key.toLowerCase()) {
      case 'v':
        this.setTool('select');
        break;

      case 'h':
        this.setTool('hand');
        break;

      case 'e':
        this.setTool('edit');
        break;

      case 'n':
        this.setTool('add');
        break;

      case 'escape':
        this.selectedSpaceId.set(null);

        this.editingSpaceId.set(null);

        if (this.activeTool() === 'add') {
          this.setTool(this.previousTool());
        }

        break;

      case 'delete':
      case 'backspace':
        this.deleteSelectedSpace();
        break;
    }
  }

  @HostListener('window:keyup', ['$event'])
  handleKeyUp(event: KeyboardEvent): void {
    if (event.code === 'Space') {
      this.isSpacebarDown.set(false);

      this.cancelInteractions();
    }
  }

  /*
   * =========================
   * SEARCH
   * =========================
   */

  updateSearch(event: Event): void {
    const input = event.target as HTMLInputElement;

    this.searchQuery.set(input.value);
  }

  clearSearch(): void {
    this.searchQuery.set('');
  }

  /*
   * =========================
   * VIEWPORT POINTER
   * =========================
   */

  viewportPointerDown(event: PointerEvent): void {
    const target = event.target as HTMLElement;

    if (
      target.closest('.space-card') ||
      target.closest('.toolbox') ||
      target.closest('.editor-panel') ||
      target.closest('.intro-panel')
    ) {
      return;
    }

    /*
     * Middle mouse always pans.
     */
    if (event.button === 1) {
      this.startPan(event);

      return;
    }

    /*
     * Spacebar temporarily behaves
     * like hand tool.
     */
    if (this.isSpacebarDown() || this.activeTool() === 'hand') {
      this.startPan(event);

      return;
    }

    /*
     * Add tool creates a Space
     * wherever user clicks.
     */
    if (this.activeTool() === 'add') {
      this.createSpaceAtClientPosition(event.clientX, event.clientY);

      /*
       * Return to Select like
       * design applications often do
       * after placing one item.
       */
      this.setTool('select');

      return;
    }

    /*
     * Clicking empty board with
     * select/edit clears selection.
     */
    this.selectedSpaceId.set(null);

    this.editingSpaceId.set(null);
  }

  viewportPointerMove(event: PointerEvent): void {
    this.panCanvas(event);
  }

  viewportPointerUp(event: PointerEvent): void {
    this.stopPan(event);
  }

  /*
   * =========================
   * SPACE POINTER
   * =========================
   */

  spacePointerDown(event: PointerEvent, space: SpaceCard): void {
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return;
    }

    event.stopPropagation();

    /*
     * Spacebar = hand/pan even
     * when cursor is on card.
     */
    if (this.isSpacebarDown()) {
      this.startPanFromCard(event);

      return;
    }

    switch (this.activeTool()) {
      case 'hand':
        this.startPanFromCard(event);

        break;

      case 'select':
        this.selectSpace(space);

        this.startSpaceDrag(event, space);

        break;

      case 'edit':
        this.selectSpace(space);

        this.startEditingSpace(space);

        break;

      case 'add':
        /*
         * Clicking an existing card
         * should not create another
         * card underneath it.
         */
        break;
    }
  }

  spacePointerMove(event: PointerEvent): void {
    if (this.dragSession) {
      this.moveSpace(event);

      return;
    }

    if (this.panSession) {
      this.panCanvas(event);
    }
  }

  spacePointerUp(event: PointerEvent): void {
    if (this.dragSession) {
      this.endSpaceDrag(event);

      return;
    }

    if (this.panSession) {
      this.stopPan(event);
    }
  }

  openSpace(space: SpaceCard): void {
    this.router.navigate(['/space', space.id]);
  }

  selectSpace(space: SpaceCard): void {
    this.selectedSpaceId.set(space.id);
  }

  /*
   * =========================
   * DRAG CARD
   * =========================
   */

  private startSpaceDrag(event: PointerEvent, space: SpaceCard): void {
    const element = event.currentTarget as HTMLElement;

    element.setPointerCapture(event.pointerId);

    this.dragSession = {
      pointerId: event.pointerId,

      spaceId: space.id,

      startClientX: event.clientX,

      startClientY: event.clientY,

      startSpaceX: space.x,

      startSpaceY: space.y,

      moved: false,
    };

    this.draggingSpaceId.set(space.id);
  }

  private moveSpace(event: PointerEvent): void {
    const session = this.dragSession;

    if (!session || session.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = (event.clientX - session.startClientX) / this.zoom();

    const deltaY = (event.clientY - session.startClientY) / this.zoom();

    if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
      session.moved = true;
    }

    this.spaces.update((spaces) =>
      spaces.map((space) =>
        space.id === session.spaceId
          ? {
              ...space,

              x: session.startSpaceX + deltaX,

              y: session.startSpaceY + deltaY,
            }
          : space,
      ),
    );
  }

  private endSpaceDrag(event: PointerEvent): void {
    const currentTarget = event.currentTarget as HTMLElement;

    if (currentTarget.hasPointerCapture(event.pointerId)) {
      currentTarget.releasePointerCapture(event.pointerId);
    }

    this.dragSession = null;

    this.draggingSpaceId.set(null);
  }

  /*
   * =========================
   * PAN
   * =========================
   */

  private startPan(event: PointerEvent): void {
    const element = event.currentTarget as HTMLElement;

    element.setPointerCapture(event.pointerId);

    this.panSession = {
      pointerId: event.pointerId,

      startClientX: event.clientX,

      startClientY: event.clientY,

      startPanX: this.panX(),

      startPanY: this.panY(),
    };

    this.isPanning.set(true);
  }

  private startPanFromCard(event: PointerEvent): void {
    const viewport = this.viewport()?.nativeElement;

    if (!viewport) {
      return;
    }

    viewport.setPointerCapture(event.pointerId);

    this.panSession = {
      pointerId: event.pointerId,

      startClientX: event.clientX,

      startClientY: event.clientY,

      startPanX: this.panX(),

      startPanY: this.panY(),
    };

    this.isPanning.set(true);
  }

  private panCanvas(event: PointerEvent): void {
    const session = this.panSession;

    if (!session || session.pointerId !== event.pointerId) {
      return;
    }

    this.panX.set(session.startPanX + event.clientX - session.startClientX);

    this.panY.set(session.startPanY + event.clientY - session.startClientY);
  }

  private stopPan(event: PointerEvent): void {
    if (!this.panSession) {
      return;
    }

    const viewport = this.viewport()?.nativeElement;

    if (viewport?.hasPointerCapture(event.pointerId)) {
      viewport.releasePointerCapture(event.pointerId);
    }

    this.panSession = null;

    this.isPanning.set(false);
  }

  /*
   * =========================
   * FIGMA-LIKE WHEEL
   * =========================
   */

  handleWheel(event: WheelEvent): void {
    event.preventDefault();

    /*
     * Ctrl + wheel:
     * zoom toward cursor.
     *
     * This also works well with
     * trackpad pinch because browser
     * commonly reports pinch as
     * ctrlKey + wheel.
     */
    if (event.ctrlKey) {
      const factor = event.deltaY > 0 ? 0.9 : 1.1;

      this.zoomAroundPoint(
        event.clientX,
        event.clientY,

        this.clamp(
          this.zoom() * factor,

          0.25,

          2.5,
        ),
      );

      return;
    }

    /*
     * Normal wheel / trackpad pans.
     */
    if (event.shiftKey) {
      this.panX.update((value) => value - event.deltaY);

      return;
    }

    this.panX.update((value) => value - event.deltaX);

    this.panY.update((value) => value - event.deltaY);
  }

  zoomIn(): void {
    this.zoomFromCenter(this.zoom() * 1.15);
  }

  zoomOut(): void {
    this.zoomFromCenter(this.zoom() / 1.15);
  }

  private zoomFromCenter(zoom: number): void {
    const viewport = this.viewport()?.nativeElement;

    if (!viewport) {
      return;
    }

    const rect = viewport.getBoundingClientRect();

    this.zoomAroundPoint(
      rect.left + rect.width / 2,

      rect.top + rect.height / 2,

      this.clamp(zoom, 0.25, 2.5),
    );
  }

  private zoomAroundPoint(clientX: number, clientY: number, newZoom: number): void {
    const viewport = this.viewport()?.nativeElement;

    if (!viewport) {
      return;
    }

    const rect = viewport.getBoundingClientRect();

    const currentZoom = this.zoom();

    const worldX = (clientX - rect.left - this.panX()) / currentZoom;

    const worldY = (clientY - rect.top - this.panY()) / currentZoom;

    this.zoom.set(newZoom);

    this.panX.set(clientX - rect.left - worldX * newZoom);

    this.panY.set(clientY - rect.top - worldY * newZoom);
  }

  resetView(): void {
    this.panX.set(0);

    this.panY.set(0);

    this.zoom.set(1);
  }

  fitSpaces(): void {
    const viewport = this.viewport()?.nativeElement;

    const spaces = this.spaces();

    if (!viewport || spaces.length === 0) {
      return;
    }

    const rect = viewport.getBoundingClientRect();

    const minX = Math.min(...spaces.map((space) => space.x));

    const minY = Math.min(...spaces.map((space) => space.y));

    const maxX = Math.max(...spaces.map((space) => space.x + this.cardWidth));

    const maxY = Math.max(...spaces.map((space) => space.y + this.cardHeight));

    const width = maxX - minX;

    const height = maxY - minY;

    const padding = 120;

    const zoom = this.clamp(
      Math.min(
        (rect.width - padding * 2) / width,

        (rect.height - padding * 2) / height,
      ),

      0.25,

      1.25,
    );

    this.zoom.set(zoom);

    this.panX.set((rect.width - width * zoom) / 2 - minX * zoom);

    this.panY.set((rect.height - height * zoom) / 2 - minY * zoom);
  }

  /*
   * =========================
   * ADD SPACE
   * =========================
   */

  addSpaceFromToolbar(): void {
    this.setTool('add');
  }

  private createSpaceAtClientPosition(clientX: number, clientY: number): void {
    const viewport = this.viewport()?.nativeElement;

    if (!viewport) {
      return;
    }

    const rect = viewport.getBoundingClientRect();

    const worldX = (clientX - rect.left - this.panX()) / this.zoom();

    const worldY = (clientY - rect.top - this.panY()) / this.zoom();

    const space: SpaceCard = {
      id: this.createId(),

      title: 'Untitled Space',

      itemCount: 0,

      updatedAt: 'Just now',

      x: worldX - this.cardWidth / 2,

      y: worldY - this.cardHeight / 2,

      tone: 'neutral',

      preview: 'mixed',
    };

    this.spaces.update((spaces) => [...spaces, space]);

    this.selectedSpaceId.set(space.id);

    this.startEditingSpace(space);
  }

  /*
   * =========================
   * EDITOR
   * =========================
   */

  startEditingSpace(space: SpaceCard): void {
    this.selectedSpaceId.set(space.id);

    this.editingSpaceId.set(space.id);

    this.titleDraft.set(space.title);
  }

  updateTitleDraft(event: Event): void {
    const input = event.target as HTMLInputElement;

    this.titleDraft.set(input.value);
  }

  saveTitle(): void {
    const id = this.editingSpaceId();

    if (!id) {
      return;
    }

    const title = this.titleDraft().trim();

    this.updateSpace(id, {
      title: title || 'Untitled Space',

      updatedAt: 'Just now',
    });
  }

  changeTone(tone: SpaceTone): void {
    const id = this.selectedSpaceId();

    if (!id) {
      return;
    }

    this.updateSpace(id, {
      tone,

      updatedAt: 'Just now',
    });
  }

  changePreview(preview: SpacePreview): void {
    const id = this.selectedSpaceId();

    if (!id) {
      return;
    }

    this.updateSpace(id, {
      preview,

      updatedAt: 'Just now',
    });
  }

  private updateSpace(id: string, changes: Partial<SpaceCard>): void {
    this.spaces.update((spaces) =>
      spaces.map((space) =>
        space.id === id
          ? {
              ...space,
              ...changes,
            }
          : space,
      ),
    );
  }

  duplicateSelectedSpace(): void {
    const selected = this.selectedSpace();

    if (!selected) {
      return;
    }

    const duplicate: SpaceCard = {
      ...selected,

      id: this.createId(),

      title: `${selected.title} Copy`,

      x: selected.x + 36,

      y: selected.y + 36,

      updatedAt: 'Just now',
    };

    this.spaces.update((spaces) => [...spaces, duplicate]);

    this.selectedSpaceId.set(duplicate.id);
  }

  deleteSelectedSpace(): void {
    const selected = this.selectedSpace();

    if (!selected) {
      return;
    }

    this.spaces.update((spaces) => spaces.filter((space) => space.id !== selected.id));

    this.selectedSpaceId.set(null);

    this.editingSpaceId.set(null);
  }

  /*
   * =========================
   * STORAGE
   * =========================
   */

  private loadSpaces(): SpaceCard[] {
    if (!this.isBrowser) {
      return this.defaultSpaces();
    }

    const stored = localStorage.getItem(this.spacesStorageKey);

    if (!stored) {
      return this.defaultSpaces();
    }

    try {
      return JSON.parse(stored) as SpaceCard[];
    } catch {
      return this.defaultSpaces();
    }
  }

  private loadView() {
    const fallback = {
      x: 0,
      y: 0,
      zoom: 1,
    };

    if (!this.isBrowser) {
      return fallback;
    }

    const stored = localStorage.getItem(this.viewStorageKey);

    if (!stored) {
      return fallback;
    }

    try {
      return JSON.parse(stored) as typeof fallback;
    } catch {
      return fallback;
    }
  }

  private defaultSpaces(): SpaceCard[] {
    return [
      {
        id: 'wevra',

        title: 'Wevra HR',

        itemCount: 23,

        updatedAt: 'Updated today',

        x: 520,

        y: 100,

        tone: 'red',

        preview: 'mixed',
      },

      {
        id: 'angular',

        title: 'Angular Learning',

        itemCount: 12,

        updatedAt: 'Updated yesterday',

        x: 930,

        y: 160,

        tone: 'blue',

        preview: 'checklist',
      },

      {
        id: 'travel',

        title: 'Travel Plans',

        itemCount: 8,

        updatedAt: 'Updated 2 days ago',

        x: 300,

        y: 400,

        tone: 'blue',

        preview: 'visual',
      },

      {
        id: 'thread',

        title: 'Thread App',

        itemCount: 14,

        updatedAt: 'Updated today',

        x: 860,

        y: 450,

        tone: 'red',

        preview: 'notes',
      },

      {
        id: 'personal',

        title: 'Personal',

        itemCount: 6,

        updatedAt: 'Updated today',

        x: 520,

        y: 720,

        tone: 'yellow',

        preview: 'mixed',
      },
    ];
  }

  private cancelInteractions(): void {
    this.dragSession = null;

    this.panSession = null;

    this.draggingSpaceId.set(null);

    this.isPanning.set(false);
  }

  private createId(): string {
    if (this.isBrowser && crypto.randomUUID) {
      return crypto.randomUUID();
    }

    return `${Date.now()}-${Math.random()}`;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }
}
