import { CanvasItem, ConnectorSide } from '../canvas.model';
import { shapeOutline } from '../shapes';

export interface Point { x: number; y: number }
const center = (item: CanvasItem): Point => ({ x: item.x + item.width / 2, y: item.y + item.height / 2 });
const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

function outline(item: CanvasItem): Point[] { return shapeOutline(item.shapeKind); }

function local(item: CanvasItem, point: Point): Point {
  const c = center(item), angle = -(item.rotation || 0) * Math.PI / 180;
  const dx = point.x - c.x, dy = point.y - c.y;
  return { x: (dx * Math.cos(angle) - dy * Math.sin(angle)) / item.width + .5, y: (dx * Math.sin(angle) + dy * Math.cos(angle)) / item.height + .5 };
}
export function world(item: CanvasItem, anchor: Point): Point {
  const c = center(item), angle = (item.rotation || 0) * Math.PI / 180;
  const dx = (anchor.x - .5) * item.width, dy = (anchor.y - .5) * item.height;
  return { x: c.x + dx * Math.cos(angle) - dy * Math.sin(angle), y: c.y + dx * Math.sin(angle) + dy * Math.cos(angle) };
}
export function perimeterPoint(item: CanvasItem, toward: Point): Point {
  const p = local(item, toward), dx = p.x - .5, dy = p.y - .5;
  if (Math.abs(dx) + Math.abs(dy) < 1e-8) return world(item, { x: .98, y: .5 });
  if (item.shapeKind === 'circle') {
    const scale = 1 / Math.hypot(dx / .48, dy / .48);
    return world(item, { x: .5 + dx * scale, y: .5 + dy * scale });
  }
  const vertices = outline(item); let best = Infinity;
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i], b = vertices[(i + 1) % vertices.length], ex = b.x - a.x, ey = b.y - a.y;
    const denominator = dx * ey - dy * ex;
    if (Math.abs(denominator) < 1e-9) continue;
    const ox = a.x - .5, oy = a.y - .5;
    const t = (ox * ey - oy * ex) / denominator, u = (ox * dy - oy * dx) / denominator;
    if (t >= 0 && u >= 0 && u <= 1 && t < best) best = t;
  }
  return world(item, { x: .5 + dx * (Number.isFinite(best) ? best : 1), y: .5 + dy * (Number.isFinite(best) ? best : 1) });
}
export function sidePoint(item: CanvasItem, side: ConnectorSide): Point {
  return perimeterPoint(item, world(item, side === 'top' ? {x:.5,y:0} : side === 'right' ? {x:1,y:.5} : side === 'bottom' ? {x:.5,y:1} : {x:0,y:.5}));
}
export function nearestPerimeter(item: CanvasItem, point: Point): { point: Point; anchor: Point; distance: number } {
  const vertices = item.shapeKind === 'circle' ? Array.from({length:96}, (_, i) => ({x:.5 + .48*Math.cos(i*Math.PI/48), y:.5 + .48*Math.sin(i*Math.PI/48)})) : outline(item);
  let nearest = world(item, vertices[0]), distance = Infinity;
  for (let i = 0; i < vertices.length; i++) {
    const a = world(item, vertices[i]), b = world(item, vertices[(i+1)%vertices.length]);
    const dx = b.x-a.x, dy = b.y-a.y, t = clamp(((point.x-a.x)*dx+(point.y-a.y)*dy)/(dx*dx+dy*dy || 1),0,1);
    const candidate = {x:a.x+t*dx,y:a.y+t*dy}, d = Math.hypot(point.x-candidate.x,point.y-candidate.y);
    if (d < distance) { distance = d; nearest = candidate; }
  }
  return { point: nearest, anchor: local(item, nearest), distance };
}
export function containsShape(item: CanvasItem, point: Point): boolean {
  const p = local(item, point);
  if (item.shapeKind === 'circle') return ((p.x-.5)/.48)**2 + ((p.y-.5)/.48)**2 <= 1;
  const vertices = outline(item); let inside = false;
  for (let i=0,j=vertices.length-1;i<vertices.length;j=i++) {
    const a=vertices[i],b=vertices[j];
    if ((a.y>p.y)!==(b.y>p.y) && p.x < (b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x) inside=!inside;
  }
  return inside;
}
