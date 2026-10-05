import '@angular/compiler';
import { computed, signal } from '@angular/core';
import { routeErConnections } from '../../er-layout';
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
  page.erRoutes = computed(() => routeErConnections(page.items(), page.connections()));
  page.visibleItems = () => page.items();
  page.junctions = signal([]); page.datasetStore = new DatasetStore();
  page.datasets = page.datasetStore.datasets; page.shapeKind = signal('rectangle'); page.shapeTheme = signal(0); page.erExpandedFieldId = signal(null); page.erEntities = computed(() => page.items().filter((item: any) => item.type === 'er-entity'));
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

describe('canvas grouping', () => {
  it('groups through the keyboard shortcut and ungroups all members without changing another group', () => {
    const { page, viewport } = canvas();
    page.items.set([
      { id: 'a', type: 'shape', title: 'A' },
      { id: 'b', type: 'shape', title: 'B' },
      { id: 'c', type: 'shape', title: 'C', groupId: 'other-group' },
    ]);
    page.selectedIds.set(['a', 'b']);
    const event = { target: viewport, key: 'g', ctrlKey: true, metaKey: false, shiftKey: false, preventDefault: vi.fn() };
    page.keyDown(event);
    expect(page.items()[0].groupId).toBeTruthy();
    expect(page.items()[1].groupId).toBe(page.items()[0].groupId);
    page.selectedIds.set(['a']);
    page.keyDown({ ...event, shiftKey: true });
    expect(page.items()[0].groupId).toBeUndefined();
    expect(page.items()[1].groupId).toBeUndefined();
    expect(page.items()[2].groupId).toBe('other-group');
    expect(page.history).toHaveLength(2);
  });
});

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
  it('starts inline entity editing without covering the canvas with a sidebar', () => {
    const { page } = canvas();
    page.chooseType('shape');
    page.createAt('er-entity', { x: 100, y: 100 });
    expect(page.pendingType()).toBeNull();
    expect(page.inspectorOpen()).toBe(false);
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
  it('focuses an ER field directly without a preceding selection', () => {
    const { page, viewport } = canvas(); page.createAt('er-entity', { x: 0, y: 0 });
    const item = page.items()[0]; page.selectedIds.set([]);
    const event = pointer(viewport, 'mouse'); page.erControlDown(event, item);
    expect(page.selectedIds()).toEqual([item.id]); expect(page.session).toBeUndefined();
    expect(event.stopPropagation).toHaveBeenCalled();
  });

  it('creates field-level references and keeps their data types synchronized', () => {
    const { page } = canvas(); page.createAt('er-entity', { x: 0, y: 0 }); page.createAt('er-entity', { x: 500, y: 0 });
    const [parent, child] = page.items(); page.addErField(child);
    const fk = page.items()[1].erFields[1], pk = parent.erFields[0];
    page.setErReference(child, fk, `${parent.id}/${pk.id}`);
    expect(page.connections()[0]).toMatchObject({ sourceFieldId: pk.id, targetFieldId: fk.id });
    expect(page.items()[1].erFields[1].reference).toEqual({ entityId: parent.id, fieldId: pk.id });
    page.updateErField(parent, pk.id, { dataType: 'BIGINT' });
    expect(page.items()[1].erFields[1].dataType).toBe('BIGINT');
    page.updateErField(child, fk.id, { unique: true });
    expect(page.connections()[0].targetCardinality).toBe('0..1');
    page.removeErField(parent, pk.id); expect(page.connections()).toHaveLength(0);
    expect(page.erFieldIssue(page.items()[1], page.items()[1].erFields[1])).toContain('no longer exists');
  });

  it('switches between enums and references with editable field options', () => {
    const { page } = canvas(); page.createAt('er-entity', { x: 0, y: 0 }); page.addErField(page.items()[0]);
    const item = page.items()[0], field = item.erFields[1]; page.setErType(item, field, 'ENUM');
    expect(page.erExpandedFieldId()).toBe(field.id);
    page.setErEnum(item, field, { target: { value: 'draft, paid, draft' } });
    expect(page.items()[0].erFields[1].enumValues).toEqual(['draft', 'paid']);
    page.setErType(page.items()[0], page.items()[0].erFields[1], 'REFERENCE');
    expect(page.items()[0].erFields[1].key).toBe('foreign');
    expect(page.erReferenceOptions(item, field)).toHaveLength(1);
  });
  it('removes the foreign-key constraint when its relationship is deleted', () => {
    const { page } = canvas(); page.createErStarter();
    page.selectedIds.set([]); page.selectedConnectionId.set(page.connections()[0].id); page.removeSelectedConnection();
    expect(page.connections()).toHaveLength(0); expect(page.items()[1].erFields[1].reference).toBeUndefined();
    expect(page.items()[1].erFields[1].key).toBe('none');
  });

  it('remaps copied fields and references instead of sharing their IDs', () => {
    const { page } = canvas(); page.createErStarter(); page.selectedIds.set(page.items().map((item: any) => item.id));
    page.duplicate(); const [parent, child, copyParent, copyChild] = page.items();
    expect(copyParent.erFields[0].id).not.toBe(parent.erFields[0].id);
    expect(copyChild.erFields[1].reference).toEqual({ entityId: copyParent.id, fieldId: copyParent.erFields[0].id });
    expect(copyChild.title).not.toBe(child.title); expect(page.connections()).toHaveLength(2);
  });

  it('keeps Select gestures distinct from Pan gestures', () => {
    const { page, viewport } = canvas();
    const event = pointer(viewport, 'touch');
    page.pointerDown(event);
    expect(page.session.kind).toBe('marquee');
    page.pointerUp(event);
    page.setTool('hand'); page.pointerDown(event);
    expect(page.session.kind).toBe('pan');
    page.pointerUp(event);
  });

  it('reuses an existing ER relationship when the same pair is connected again', () => {
    const { page } = canvas();
    page.createAt('er-entity', { x: 0, y: 0 }); page.createAt('er-entity', { x: 500, y: 0 });
    const [a, b] = page.items();
    page.connectErTarget(a.id, b.id); page.connectErTarget(b.id, a.id);
    expect(page.connections()).toHaveLength(1);
    expect(page.selectedConnectionId()).toBe(page.connections()[0].id);
  });

  it('adds fields without discarding a just-committed edit', () => {
    const { page } = canvas(); page.createAt('er-entity', { x: 0, y: 0 });
    const stale = page.items()[0]; page.updateErField(stale, stale.erFields[0].id, { name: 'customer_id' });
    page.addErField(stale);
    expect(page.items()[0].erFields[0].name).toBe('customer_id');
    expect(page.items()[0].erFields).toHaveLength(2);
  });

  it('supports an intentional second relationship and gives it its own route', () => {
    const { page } = canvas(); page.createAt('er-entity', { x: 0, y: 0 }); page.createAt('er-entity', { x: 500, y: 0 });
    const [a, b] = page.items(); page.connectErTarget(a.id, b.id); page.addParallelRelationship(page.connections()[0]);
    expect(page.connections()).toHaveLength(2);
    expect(page.erRoutes().size).toBe(2);
  });

  it('places a related entity away from existing cards', () => {
    const { page } = canvas(); page.createAt('er-entity', { x: 0, y: 0 });
    const source = page.items()[0]; page.addRelatedErEntity(source); page.addRelatedErEntity(source);
    const [, first, second] = page.items();
    expect(second.y).toBeGreaterThanOrEqual(first.y + first.height + 30);
    expect(second.erFields[1].key).toBe('foreign');
  });

  it('arranges the diagram and resets manual routing', () => {
    const { page } = canvas(); page.createAt('er-entity', { x: 0, y: 0 }); page.createAt('er-entity', { x: 0, y: 0 });
    const [a, b] = page.items(); page.connectErTarget(a.id, b.id); page.setConnection(page.connections()[0].id, { routeOffset: 70 });
    page.arrangeErDiagram();
    expect(page.items()[1].x).toBeGreaterThan(page.items()[0].x + page.items()[0].width);
    expect(page.connections()[0].routeOffset).toBe(0);
    expect(page.selectedIds()).toHaveLength(2);
    expect(page.erRoutes().size).toBe(1);
  });

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
