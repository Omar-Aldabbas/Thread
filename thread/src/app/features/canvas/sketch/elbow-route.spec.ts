import { describe, expect, it } from 'vitest';
import { elbowRoute } from './elbow-route';

describe('generic elbow routing', () => {
  const source = { x: 0, y: 0, width: 100, height: 80 };
  const target = { x: 240, y: 20, width: 100, height: 80 };
  it('leaves the right edge and enters the left edge without crossing either card', () => {
    const points = elbowRoute({ x: 100, y: 40 }, { x: 240, y: 60 }, 'right', 'left', source, target);
    expect(points[0]).toEqual({ x: 100, y: 40 });
    expect(points.at(-1)).toEqual({ x: 240, y: 60 });
    expect(points[1].x).toBeGreaterThan(100);
    expect(points.at(-2)!.x).toBeLessThan(240);
    expect(points.every((point, index) => index === 0 || point.x === points[index - 1].x || point.y === points[index - 1].y)).toBe(true);
  });
  it('uses bottom and top ports for a vertical relationship', () => {
    const below = { x: 20, y: 240, width: 100, height: 80 };
    const points = elbowRoute({ x: 50, y: 80 }, { x: 70, y: 240 }, 'bottom', 'top', source, below);
    expect(points[1].y).toBeGreaterThan(80);
    expect(points.at(-2)!.y).toBeLessThan(240);
  });
  it('recomputes from current geometry after movement or resize without zoom data', () => {
    const first = elbowRoute({ x: 100, y: 40 }, { x: 240, y: 60 }, 'right', 'left', source, target);
    const moved = elbowRoute({ x: 140, y: 40 }, { x: 240, y: 60 }, 'right', 'left', { ...source, width: 140 }, target);
    expect(moved[0].x).toBe(140);
    expect(moved).not.toEqual(first);
  });
});
