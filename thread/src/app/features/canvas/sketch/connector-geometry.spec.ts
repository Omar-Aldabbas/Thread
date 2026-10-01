import { describe, expect, it } from 'vitest';
import { CanvasItem } from '../canvas.model';
import { perimeterPoint, sidePoint } from './connector-geometry';

const shape = (kind: CanvasItem['shapeKind']): CanvasItem => ({
  id: 'shape', type: 'shape', shapeKind: kind, x: 0, y: 0, width: 200, height: 100,
  title: '', createdAt: '', updatedAt: '',
});

describe('connector attachment to shape geometry', () => {
  it('attaches to the ellipse circumference rather than its bounding box', () => {
    const point = perimeterPoint(shape('circle'), { x: 250, y: 100 });
    const normalized = ((point.x - 100) / 96) ** 2 + ((point.y - 50) / 48) ** 2;
    expect(normalized).toBeCloseTo(1, 5);
  });

  it('uses the diamond edge for a diagonal connection', () => {
    const point = perimeterPoint(shape('diamond'), { x: 250, y: 0 });
    expect(point.x).toBeLessThan(196);
    expect(point.y).toBeGreaterThan(2);
  });

  it('keeps four cardinal ports on the visible rounded perimeter', () => {
    const item = shape('rounded');
    expect(sidePoint(item, 'top').y).toBeCloseTo(2, 5);
    expect(sidePoint(item, 'right').x).toBeCloseTo(196, 5);
    expect(sidePoint(item, 'bottom').y).toBeCloseTo(98, 5);
    expect(sidePoint(item, 'left').x).toBeCloseTo(4, 5);
  });
});
