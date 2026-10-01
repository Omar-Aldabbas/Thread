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
  viewport.setPointerCapture = vi.fn();
  viewport.hasPointerCapture = vi.fn().mockReturnValue(false);
  page.viewport = () => ({ nativeElement: viewport });
  page.panX = signal(20); page.panY = signal(-10); page.zoom = signal(2);
  page.tool = signal('select'); page.spaceHeld = signal(false); page.pendingType = signal(null); page.pendingAsset = signal(null);
  page.paletteOpen = signal(false); page.placement = signal(null); page.sketchPoints = signal([]);
  page.selectedIds = signal([]); page.items = signal([]); page.connections = signal([]);
  page.junctions = signal([]); page.datasetStore = new DatasetStore();
  page.datasets = page.datasetStore.datasets; page.shapeKind = signal('rectangle');
  page.marquee = signal(null); page.snapGuide = signal(null); page.transformGuide = signal(null);
  page.connectionPreview = signal(null); page.connectionTargetId = signal(null);
  page.precisePreview = signal(null); page.junctionCandidate = signal(null); page.isPanning = signal(false);
  page.pointers = new Map(); page.history = []; page.future = [];
  page.startEditing = vi.fn();
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
