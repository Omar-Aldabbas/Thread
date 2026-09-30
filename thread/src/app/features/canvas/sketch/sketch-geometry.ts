import { getStroke, type StrokeOptions } from 'perfect-freehand';
import { SketchPoint, SketchStroke } from '../canvas.model';

export function brushDiameter(brush: SketchStroke['brush'], size: number): number {
  return brush === 'marker' ? size * 1.9 : brush === 'highlighter' ? size * 4 : brush === 'neon' ? size * 1.35 : size;
}

function options(stroke: Pick<SketchStroke, 'brush' | 'size'>, complete: boolean): StrokeOptions {
  const brush = stroke.brush;
  return {
    size: brushDiameter(brush, stroke.size),
    thinning: brush === 'highlighter' ? 0 : brush === 'marker' ? .3 : .58,
    smoothing: brush === 'highlighter' ? .35 : brush === 'marker' ? .72 : .62,
    streamline: brush === 'highlighter' ? .2 : brush === 'marker' ? .36 : .48,
    simulatePressure: false,
    start: { cap: true }, end: { cap: true }, last: complete,
  };
}

export function strokeOutlinePath(stroke: Pick<SketchStroke, 'brush' | 'points' | 'size'>, complete = true): string {
  if (!stroke.points.length) return '';
  const points = getStroke(stroke.points.map(point => [point.x, point.y, point.pressure] as [number, number, number]), options(stroke, complete));
  if (!points.length) return '';
  let path = `M ${points[0][0]} ${points[0][1]}`;
  for (let i = 1; i < points.length - 1; i++) path += ` Q ${points[i][0]} ${points[i][1]} ${(points[i][0] + points[i + 1][0]) / 2} ${(points[i][1] + points[i + 1][1]) / 2}`;
  return `${path} L ${points.at(-1)![0]} ${points.at(-1)![1]} Z`;
}

export function strokeCenterPath(points: SketchPoint[]): string {
  if (!points.length) return '';
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) path += ` Q ${points[i].x} ${points[i].y} ${(points[i].x + points[i + 1].x) / 2} ${(points[i].y + points[i + 1].y) / 2}`;
  return `${path} L ${points.at(-1)!.x} ${points.at(-1)!.y}`;
}

export function strokeBounds(strokes: SketchStroke[]): { x: number; y: number; width: number; height: number } {
  const points = strokes.flatMap(stroke => stroke.points);
  const padding = Math.max(8, ...strokes.map(stroke => brushDiameter(stroke.brush, stroke.size) / 2 + (stroke.brush === 'neon' ? 20 : 4)));
  const minX = Math.min(...points.map(point => point.x)) - padding, minY = Math.min(...points.map(point => point.y)) - padding;
  const maxX = Math.max(...points.map(point => point.x)) + padding, maxY = Math.max(...points.map(point => point.y)) + padding;
  return { x: minX, y: minY, width: Math.max(16, maxX - minX), height: Math.max(16, maxY - minY) };
}

export function distanceToStroke(point: { x: number; y: number }, stroke: SketchStroke): number {
  let nearest = Infinity;
  for (let index = 0; index < stroke.points.length; index++) {
    const a = stroke.points[index], b = stroke.points[index + 1] || a;
    const dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    nearest = Math.min(nearest, Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy));
  }
  return nearest;
}
