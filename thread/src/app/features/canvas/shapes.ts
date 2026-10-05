import type { ShapeKind } from './canvas.model';
export const shapeKinds: ShapeKind[] = ['rectangle', 'rounded', 'pill', 'circle', 'diamond', 'triangle', 'hexagon', 'parallelogram', 'cylinder', 'document', 'cloud'];
export const shapeNames: Record<ShapeKind, string> = { rectangle: 'Process', rounded: 'Rounded', pill: 'Start / end', circle: 'Ellipse', diamond: 'Decision', triangle: 'Triangle', hexagon: 'Preparation', parallelogram: 'Input / output', cylinder: 'Database', document: 'Document', cloud: 'Cloud' };
export const shapePaths: Record<ShapeKind, string> = {
  rectangle: 'M2 2H98V98H2Z',
  rounded: 'M14 2H86A12 12 0 0 1 98 14V86A12 12 0 0 1 86 98H14A12 12 0 0 1 2 86V14A12 12 0 0 1 14 2Z',
  pill: 'M26 2H74C106 2 106 98 74 98H26C-6 98 -6 2 26 2Z',
  circle: 'M98 50A48 48 0 1 1 2 50A48 48 0 1 1 98 50Z',
  diamond: 'M50 2L98 50L50 98L2 50Z',
  triangle: 'M50 2L98 98H2Z',
  hexagon: 'M24 2H76L98 50L76 98H24L2 50Z',
  parallelogram: 'M22 2H98L78 98H2Z',
  cylinder: 'M2 14C2 -2 98 -2 98 14V86C98 102 2 102 2 86Z',
  document: 'M2 2H98V84C66 64 34 104 2 84Z',
  cloud: 'M22 82C-4 82 -4 44 18 40C10 16 36 2 50 20C64 -2 96 12 88 38C110 44 104 82 80 82Z',
};
export const shapeThemes = [
  { name: 'Paper', fill: '#ffffff', stroke: '#475569', text: '#1e293b' },
  { name: 'Blue', fill: '#eff6ff', stroke: '#3b82f6', text: '#1e3a8a' },
  { name: 'Mint', fill: '#ecfdf5', stroke: '#10b981', text: '#065f46' },
  { name: 'Amber', fill: '#fffbeb', stroke: '#d97706', text: '#78350f' },
  { name: 'Rose', fill: '#fff1f2', stroke: '#e11d48', text: '#881337' },
  { name: 'Violet', fill: '#f5f3ff', stroke: '#8b5cf6', text: '#4c1d95' },
];
type Point = { x: number; y: number };
const cubic = (a: Point, b: Point, c: Point, d: Point): Point[] => Array.from({ length: 13 }, (_, index) => { const t = index / 12, s = 1 - t; return { x: (s ** 3 * a.x + 3 * s * s * t * b.x + 3 * s * t * t * c.x + t ** 3 * d.x) / 100, y: (s ** 3 * a.y + 3 * s * s * t * b.y + 3 * s * t * t * c.y + t ** 3 * d.y) / 100 }; });
export function shapeOutline(kind: ShapeKind = 'rectangle'): Point[] {
  if (kind === 'circle') return Array.from({ length: 96 }, (_, i) => ({ x: .5 + .48 * Math.cos(i * Math.PI / 48), y: .5 + .48 * Math.sin(i * Math.PI / 48) }));
  if (kind === 'rounded') return [[.86, .14, -Math.PI / 2], [.86, .86, 0], [.14, .86, Math.PI / 2], [.14, .14, Math.PI]].flatMap(([x, y, angle]) => Array.from({ length: 13 }, (_, i) => ({ x: x + .12 * Math.cos(angle + i * Math.PI / 24), y: y + .12 * Math.sin(angle + i * Math.PI / 24) })));
  if (kind === 'pill') return [...cubic({x:74,y:2},{x:106,y:2},{x:106,y:98},{x:74,y:98}), ...cubic({x:26,y:98},{x:-6,y:98},{x:-6,y:2},{x:26,y:2})];
  if (kind === 'cylinder') return [...cubic({x:2,y:14},{x:2,y:-2},{x:98,y:-2},{x:98,y:14}), ...cubic({x:98,y:86},{x:98,y:102},{x:2,y:102},{x:2,y:86})];
  if (kind === 'document') return [{x:.02,y:.02},{x:.98,y:.02}, ...cubic({x:98,y:84},{x:66,y:64},{x:34,y:104},{x:2,y:84})];
  if (kind === 'cloud') return [
    ...cubic({x:22,y:82},{x:-4,y:82},{x:-4,y:44},{x:18,y:40}),
    ...cubic({x:18,y:40},{x:10,y:16},{x:36,y:2},{x:50,y:20}),
    ...cubic({x:50,y:20},{x:64,y:-2},{x:96,y:12},{x:88,y:38}),
    ...cubic({x:88,y:38},{x:110,y:44},{x:104,y:82},{x:80,y:82}),
  ];
  const vertices = kind === 'diamond' ? [[50,2],[98,50],[50,98],[2,50]] : kind === 'triangle' ? [[50,2],[98,98],[2,98]] : kind === 'hexagon' ? [[24,2],[76,2],[98,50],[76,98],[24,98],[2,50]] : kind === 'parallelogram' ? [[22,2],[98,2],[78,98],[2,98]] : [[2,2],[98,2],[98,98],[2,98]];
  return vertices.map(([x, y]) => ({ x: x / 100, y: y / 100 }));
}
