import { describe, expect, it } from 'vitest';
import type { CanvasConnection, CanvasItem } from './canvas.model';
import { arrangeErEntities, routeErConnections } from './er-layout';

const entity = (id: string, x: number, y: number, height = 180): CanvasItem => ({ id, type: 'er-entity', parentId: null, title: id, x, y, width: 240, height, createdAt: '', updatedAt: '' });
const relation = (id: string, sourceId: string, targetId: string): CanvasConnection => ({ id, sourceId, targetId, kind: 'elbow' });

describe('ER routing', () => {
  it('draws a visible self-reference loop outside the entity', () => {
    const routes = routeErConnections([entity('a', 0, 0)], [relation('self', 'a', 'a')]);
    const route = routes.get('self')!;
    expect(route.points.length).toBeGreaterThanOrEqual(4);
    expect(route.points[0].y).not.toBe(route.points.at(-1)!.y);
    expect(route.label.x).toBeGreaterThan(240);
  });
  it('routes around a card between two entities', () => {
    const items = [entity('a', 0, 0), entity('b', 750, 0), entity('obstacle', 375, -30, 260)];
    const route = routeErConnections(items, [relation('ab', 'a', 'b')]).get('ab')!;
    expect(route).toBeDefined();
    expect(route.points.length).toBeGreaterThan(2);
    for (let i = 1; i < route.points.length; i++) {
      const p = route.points[i - 1], q = route.points[i];
      expect(p.x === q.x || p.y === q.y).toBe(true);
      const enters = p.x === q.x ? p.x > 375 && p.x < 615 && Math.max(p.y, q.y) > -30 && Math.min(p.y, q.y) < 230 : p.y > -30 && p.y < 230 && Math.max(p.x, q.x) > 375 && Math.min(p.x, q.x) < 615;
      expect(enters).toBe(false);
    }
  });

  it('gives outgoing relationships different ports and labels', () => {
    const routes = routeErConnections([entity('a', 0, 100, 250), entity('b', 500, 0), entity('c', 500, 350)], [relation('ab', 'a', 'b'), relation('ac', 'a', 'c')]);
    expect(routes.size).toBe(2);
    expect(routes.get('ab')!.points[0]).not.toEqual(routes.get('ac')!.points[0]);
    expect(routes.get('ab')!.label).not.toEqual(routes.get('ac')!.label);
  });

  it('separates existing parallel relationships without losing either', () => {
    const routes = routeErConnections([entity('a', 0, 0), entity('b', 500, 0)], [relation('one', 'a', 'b'), relation('two', 'a', 'b')]);
    expect(routes.size).toBe(2);
    expect(routes.get('one')!.points).not.toEqual(routes.get('two')!.points);
  });

  it('preserves precise bindings and manually offset routes', () => {
    const connections = [{ ...relation('manual', 'a', 'b'), routeOffset: 45 }, { ...relation('precise', 'a', 'b'), sourceBinding: { mode: 'precise' as const, anchor: { x: 1, y: .5 } } }];
    expect(routeErConnections([entity('a', 0, 0), entity('b', 500, 0)], connections).size).toBe(0);
  });

  it('keeps the label on a line when entities connect on different sides', () => {
    const route = routeErConnections([entity('a', 0, 0), entity('b', 400, 260)], [relation('ab', 'a', 'b')]).get('ab')!;
    expect(route.points.some((p, i) => { const q = route.points[i + 1]; return q && route.label.x >= Math.min(p.x, q.x) && route.label.x <= Math.max(p.x, q.x) && route.label.y >= Math.min(p.y, q.y) && route.label.y <= Math.max(p.y, q.y); })).toBe(true);
  });
});

describe('ER arrangement', () => {
  it('spaces connected, cyclic, and disconnected entities without overlaps', () => {
    const items = [entity('a', 0, 0, 300), entity('b', 0, 0), entity('c', 0, 0), entity('d', 0, 0)];
    const positions = arrangeErEntities(items, [relation('ab', 'a', 'b'), relation('bc', 'b', 'c'), relation('ca', 'c', 'a')]);
    expect(positions.size).toBe(4);
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
      const a = positions.get(items[i].id)!, b = positions.get(items[j].id)!;
      expect(a.x + items[i].width <= b.x || b.x + items[j].width <= a.x || a.y + items[i].height <= b.y || b.y + items[j].height <= a.y).toBe(true);
    }
    expect(arrangeErEntities([], []).size).toBe(0);
  });
});
