import type { ConnectorSide } from '../canvas.model';
import type { Point } from './connector-geometry';

type Box = { x: number; y: number; width: number; height: number };
const vector: Record<ConnectorSide, Point> = {
  top: { x: 0, y: -1 }, right: { x: 1, y: 0 },
  bottom: { x: 0, y: 1 }, left: { x: -1, y: 0 },
};
const hit = (a: Point, b: Point, box: Box): boolean => a.x === b.x
  ? a.x > box.x && a.x < box.x + box.width && Math.max(a.y, b.y) > box.y && Math.min(a.y, b.y) < box.y + box.height
  : a.y > box.y && a.y < box.y + box.height && Math.max(a.x, b.x) > box.x && Math.min(a.x, b.x) < box.x + box.width;

/** Routes between edge ports in world coordinates, keeping the first and last stubs outside their cards. */
export function elbowRoute(a: Point, b: Point, sourceSide: ConnectorSide, targetSide: ConnectorSide, source: Box, target: Box): Point[] {
  const clearance = 24;
  const av = vector[sourceSide], bv = vector[targetSide];
  const start = { x: a.x + av.x * clearance, y: a.y + av.y * clearance };
  const end = { x: b.x + bv.x * clearance, y: b.y + bv.y * clearance };
  const xs = [start.x, end.x, (start.x + end.x) / 2, Math.min(source.x, target.x) - clearance, Math.max(source.x + source.width, target.x + target.width) + clearance];
  const ys = [start.y, end.y, (start.y + end.y) / 2, Math.min(source.y, target.y) - clearance, Math.max(source.y + source.height, target.y + target.height) + clearance];
  const candidates: Point[][] = [];
  if (start.x === end.x || start.y === end.y) candidates.push([start, end]);
  for (const x of xs) candidates.push([start, { x, y: start.y }, { x, y: end.y }, end]);
  for (const y of ys) candidates.push([start, { x: start.x, y }, { x: end.x, y }, end]);
  const boxes = [source, target];
  const valid = candidates.filter(points => points.every((point, index) => index === 0 || !boxes.some(box => hit(points[index - 1], point, box))));
  const chosen = (valid.length ? valid : candidates).sort((left, right) => {
    const cost = (points: Point[]) => points.reduce((total, point, index) => index ? total + Math.abs(point.x - points[index - 1].x) + Math.abs(point.y - points[index - 1].y) : 0, 0);
    return cost(left) - cost(right);
  })[0];
  const points = [a, ...chosen, b];
  return points.filter((point, index) => index === 0 || point.x !== points[index - 1].x || point.y !== points[index - 1].y);
}
