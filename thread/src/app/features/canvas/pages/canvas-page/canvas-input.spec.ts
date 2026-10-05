import '@angular/compiler';
import { signal } from '@angular/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { canvasId } from '../../canvas-id';
import { DatasetStore } from '../../data/dataset-store';
import { CanvasPage } from './canvas-page';

function canvas() {
  const page: any = Object.create(CanvasPage.prototype);
  const viewport = document.createElement('main');
  viewport.getBoundingClientRect = () => ({ left: 100, top: 40, right: 1100, bottom: 840, width: 1000, height: 800, x: 100, y: 40, toJSON: () => ({}) });
  Object.defineProperty(viewport, 'clientWidth', { value: 1000 });
  Object.defineProperty(viewport, 'clientHeight', { value: 800 });
  viewport.setPointerCapture = vi.fn();
  viewport.hasPointerCapture = vi.fn().mockReturnValue(false);
  page.viewport = () => ({ nativeElement: viewport });
  page.panX = signal(20); page.panY = signal(-10); page.zoom = signal(2);
  page.tool = signal('select'); page.spaceHeld = signal(false); page.pendingType = signal(null); page.pendingAsset = signal(null);
  page.paletteOpen = signal(false); page.placement = signal(null); page.sketchPoints = signal([]);
  page.editingId = signal(null); page.richFocusId = signal(null); page.cropId = signal(null);
  page.inspectorOpen = signal(false); page.selectedConnectionId = signal(null);
  page.connectionSourceId = signal(null); page.mediaPicker = signal(null); page.sketchEraser = signal(false);
  page.selectedIds = signal([]); page.items = signal([]); page.connections = signal([]);
  page.junctions = signal([]); page.datasetStore = new DatasetStore();
  page.datasets = page.datasetStore.datasets; page.shapeKind = signal('rectangle');
  page.marquee = signal(null); page.snapGuide = signal(null); page.transformGuide = signal(null);
  page.connectionPreview = signal(null); page.connectionTargetId = signal(null);
  page.precisePreview = signal(null); page.junctionCandidate = signal(null); page.isPanning = signal(false);
  page.pointers = new Map(); page.history = []; page.future = [];
  page.startEditing = vi.fn();
  page.selected = () => page.items().find((item: any) => item.id === page.selectedIds()[0]) || null;
  return { page, viewport };
}

function pointer(viewport: HTMLElement, pointerType: string, pointerId = 1) {
  return { button: 0, pointerId, pointerType, clientX: 300, clientY: 240,
    target: viewport, currentTarget: viewport, stopPropagation: vi.fn() } as unknown as PointerEvent;
}

afterEach(() => vi.unstubAllGlobals());

describe('canvas pointer placement', () => {
  for (const pointerType of ['mouse', 'touch', 'pen']) {
    it(`creates and selects a shape at the world point with ${pointerType}`, () => {
      const { page, viewport } = canvas();
      page.chooseType('shape');
      const event = pointer(viewport, pointerType);
      page.pointerDown(event); page.pointerUp(event);
      expect(page.items()).toHaveLength(1);
      expect(page.items()[0]).toMatchObject({ type: 'shape', x: 90, y: 105 });
      expect(page.selectedIds()).toEqual([page.items()[0].id]);
    });
  }

  it('places on an existing item without requiring hover', () => {
    const { page, viewport } = canvas();
    const item = document.createElement('div'); item.dataset['item'] = 'true';
    viewport.append(item);
    page.chooseType('shape');
    const event = { ...pointer(viewport, 'touch'), target: item, currentTarget: item } as PointerEvent;
    item.setPointerCapture = vi.fn(); item.hasPointerCapture = vi.fn().mockReturnValue(false);
    page.itemPointerDown(event, { id: 'existing' } as any);
    page.pointerUp(event);
    expect(page.items()[0]).toMatchObject({ type: 'shape', x: 90, y: 105 });
  });

  it('does not create an item when touch input is cancelled', () => {
    const { page, viewport } = canvas();
    page.chooseType('shape');
    const event = pointer(viewport, 'touch');
    page.pointerDown(event); page.pointerCancel(event);
    expect(page.items()).toHaveLength(0);
    expect(page.pendingType()).toBe('shape');
  });
});

describe('canvas IDs on a LAN origin', () => {
  it('creates an ID when randomUUID is unavailable', () => {
    vi.stubGlobal('crypto', { getRandomValues: (bytes: Uint8Array) => bytes.map((_, index) => index) });
    expect(canvasId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('creates and selects a table with its dataset when randomUUID is unavailable', () => {
    let seed = 0;
    vi.stubGlobal('crypto', { getRandomValues: (bytes: Uint8Array) => bytes.map((_, index) => (index + seed++) & 255) });
    const { page, viewport } = canvas();
    page.chooseType('table');
    const event = pointer(viewport, 'touch');
    page.pointerDown(event); page.pointerUp(event);
    expect(page.items()).toHaveLength(1);
    expect(page.selectedIds()).toEqual([page.items()[0].id]);
    expect(page.datasetStore.get(page.items()[0].datasetId)).toBeDefined();
  });
});

describe('ER diagram workflow', () => {
  it('opens entity editing and clears an earlier placement tool', () => {
    const { page } = canvas();
    page.chooseType('shape');
    page.createAt('er-entity', { x: 100, y: 100 });
    expect(page.pendingType()).toBeNull();
    expect(page.inspectorOpen()).toBe(true);
    expect(page.items()[0].erFields[0]).toMatchObject({ name: 'id', key: 'primary', required: true });
  });

  it('creates a linked starter with a primary and foreign key', () => {
    const { page } = canvas();
    page.createErStarter();
    expect(page.items().map((item: any) => item.title)).toEqual(['Customer', 'Order']);
    expect(page.items()[1].erFields[1]).toMatchObject({ name: 'customer_id', key: 'foreign' });
    expect(page.connections()[0]).toMatchObject({ sourceId: page.items()[0].id, targetId: page.items()[1].id, sourceCardinality: '1', targetCardinality: 'many', kind: 'elbow' });
  });

  it('keeps primary keys required and prevents blank field labels', () => {
    const { page } = canvas();
    page.createAt('er-entity', { x: 100, y: 100 });
    const item = page.items()[0];
    page.updateErField(item, item.erFields[0].id, { required: false, name: '  ', dataType: '  ' });
    expect(page.items()[0].erFields[0]).toMatchObject({ required: true, name: 'field', dataType: 'VARCHAR' });
  });

  it('keeps the entity header and controls usable when resized smaller', () => {
    const { page, viewport } = canvas();
    page.createAt('er-entity', { x: 100, y: 100 });
    const item = page.items()[0];
    const event = pointer(viewport, 'mouse');
    page.resizeDown(event, item);
    page.pointerMove({ ...event, clientX: -1000, clientY: -1000 });
    expect(page.items()[0]).toMatchObject({ width: 220, height: 136 });
  });
});

describe('touch navigation over cards', () => {
  it('starts pinch zoom over a card and cancels the accidental card drag', () => {
    const { page, viewport } = canvas();
    const node = document.createElement('article'); node.dataset['item'] = 'true'; viewport.append(node);
    node.setPointerCapture = vi.fn(); node.hasPointerCapture = vi.fn().mockReturnValue(false);
    const item = { id: 'note', type: 'note', title: 'Note', x: 0, y: 0, width: 260, height: 170 };
    page.items.set([item]);
    const first = { ...pointer(viewport, 'touch', 1), target: node, currentTarget: node } as PointerEvent;
    page.itemPointerDown(first, item);
    page.pointerMove({ ...first, clientX: 340 });
    expect(page.items()[0].x).not.toBe(0);
    const second = { ...pointer(viewport, 'touch', 2), clientX: 500 } as PointerEvent;
    page.pointerDown(second);
    expect(page.items()[0].x).toBe(0);
    expect(page.session).toBeNull();
    page.pointerMove({ ...second, clientX: 600 });
    expect(page.zoom()).toBeGreaterThan(2);
    page.pointerUp(second);
    expect(page.session.kind).toBe('pan');
    page.pointerUp(first);
    expect(page.pointers.size).toBe(0);
  });
});
