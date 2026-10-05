import type { CanvasConnection, CanvasItem } from './canvas.model';

export interface ErPoint { x: number; y: number }
export interface ErRoute { points: ErPoint[]; label: ErPoint }
type Box = { left: number; right: number; top: number; bottom: number };
const horizontal = (a: CanvasItem, b: CanvasItem) => Math.abs(b.x + b.width / 2 - a.x - a.width / 2) - (a.width + b.width) / 2 >= Math.abs(b.y + b.height / 2 - a.y - a.height / 2) - (a.height + b.height) / 2;
const side = (a: CanvasItem, b: CanvasItem) => horizontal(a, b) ? (b.x + b.width / 2 >= a.x + a.width / 2 ? 'right' : 'left') : (b.y + b.height / 2 >= a.y + a.height / 2 ? 'bottom' : 'top');
const blocked = (a: ErPoint, b: ErPoint, boxes: Box[]) => boxes.some(r => a.x === b.x
  ? a.x > r.left && a.x < r.right && Math.max(a.y, b.y) > r.top && Math.min(a.y, b.y) < r.bottom
  : a.y > r.top && a.y < r.bottom && Math.max(a.x, b.x) > r.left && Math.min(a.x, b.x) < r.right);

/** Separate ports, then route orthogonal lines outside cards, penalizing shared lanes. */
export function routeErConnections(items: CanvasItem[], connections: CanvasConnection[]): Map<string, ErRoute> {
  const entities = new Map(items.filter(item => item.type === 'er-entity').map(item => [item.id, item]));
  const eligible = connections.filter(c => entities.has(c.sourceId) && entities.has(c.targetId) && c.kind === 'elbow' && !c.routeOffset && !c.sourceJunctionId && !c.targetJunctionId && c.sourceBinding?.mode !== 'precise' && c.targetBinding?.mode !== 'precise');
  const result = new Map<string, ErRoute>();
  const used: [ErPoint, ErPoint][] = [];
  const port = (id: string, otherId: string, connection: CanvasConnection, terminal: 'source' | 'target') => {
    const item = entities.get(id)!, other = entities.get(otherId)!, edge = id === otherId ? 'right' : side(item, other);
    const peers = eligible.filter(c => (c.sourceId === id && (c.targetId === id ? 'right' : side(item, entities.get(c.targetId)!)) === edge) || (c.targetId === id && (c.sourceId === id ? 'right' : side(item, entities.get(c.sourceId)!)) === edge));
    peers.sort((a, b) => {
      const first = entities.get(a.sourceId === id ? a.targetId : a.sourceId)!, second = entities.get(b.sourceId === id ? b.targetId : b.sourceId)!;
      return (edge === 'left' || edge === 'right' ? first.y + first.height / 2 - second.y - second.height / 2 : first.x + first.width / 2 - second.x - second.width / 2) || a.id.localeCompare(b.id);
    });
    const selfPeers = eligible.filter(c => c.sourceId === id && c.targetId === id);
    const selfRatio = (selfPeers.findIndex(c => c.id === connection.id) + 1) / (2 * selfPeers.length + 2);
    const ratio = id === otherId ? terminal === 'source' ? selfRatio : 1 - selfRatio : (peers.findIndex(c => c.id === connection.id) + 1) / (peers.length + 1);
    const p = { x: edge === 'left' ? item.x : edge === 'right' ? item.x + item.width : item.x + 24 + (item.width - 48) * ratio, y: edge === 'top' ? item.y : edge === 'bottom' ? item.y + item.height : item.y + 24 + (item.height - 48) * ratio };
    const stub = { x: p.x + (edge === 'right' ? 28 : edge === 'left' ? -28 : 0), y: p.y + (edge === 'bottom' ? 28 : edge === 'top' ? -28 : 0) };
    return { p, stub };
  };
  for (const connection of eligible) {
    const a = port(connection.sourceId, connection.targetId, connection, 'source'), b = port(connection.targetId, connection.sourceId, connection, 'target');
    const area = { left: Math.min(a.stub.x, b.stub.x) - 200, right: Math.max(a.stub.x, b.stub.x) + 200, top: Math.min(a.stub.y, b.stub.y) - 200, bottom: Math.max(a.stub.y, b.stub.y) + 200 };
    const nearbyUsed = used.filter(([p, q]) => Math.max(p.x, q.x) >= area.left && Math.min(p.x, q.x) <= area.right && Math.max(p.y, q.y) >= area.top && Math.min(p.y, q.y) <= area.bottom);
    const boxes = items.filter(i => !['frame', 'zone', 'workspace', 'text', 'sketch'].includes(i.type) && i.x < area.right && i.x + i.width > area.left && i.y < area.bottom && i.y + i.height > area.top).map(i => ({ left: i.x - 12, right: i.x + i.width + 12, top: i.y - 12, bottom: i.y + i.height + 12 }));
    const xs = [...new Set([a.stub.x, b.stub.x, ...boxes.flatMap(r => [r.left - 8, r.right + 8]), ...nearbyUsed.flatMap(([p, q]) => p.x === q.x ? [p.x - 16, p.x + 16] : [])])].sort((x, y) => x - y);
    const ys = [...new Set([a.stub.y, b.stub.y, ...boxes.flatMap(r => [r.top - 8, r.bottom + 8]), ...nearbyUsed.flatMap(([p, q]) => p.y === q.y ? [p.y - 16, p.y + 16] : [])])].sort((x, y) => x - y);
    const width = xs.length, count = width * ys.length;
    const point = (index: number) => ({ x: xs[index % width], y: ys[Math.floor(index / width)] });
    const start = ys.indexOf(a.stub.y) * width + xs.indexOf(a.stub.x), end = ys.indexOf(b.stub.y) * width + xs.indexOf(b.stub.x);
    const distances = new Map<number, number>(), parents = new Map<number, number>();
    const heap: { state: number; cost: number }[] = [];
    const push = (entry: { state: number; cost: number }) => { heap.push(entry); let i = heap.length - 1; while (i > 0) { const parent = (i - 1) >> 1; if (heap[parent].cost <= entry.cost) break; heap[i] = heap[parent]; i = parent; } heap[i] = entry; };
    const pop = () => { const root = heap[0], last = heap.pop()!; if (heap.length) { let i = 0; while (i * 2 + 1 < heap.length) { let child = i * 2 + 1; if (child + 1 < heap.length && heap[child + 1].cost < heap[child].cost) child++; if (heap[child].cost >= last.cost) break; heap[i] = heap[child]; i = child; } heap[i] = last; } return root; };
    distances.set(start * 2, 0); distances.set(start * 2 + 1, 0); push({ state: start * 2, cost: 0 }); push({ state: start * 2 + 1, cost: 0 });
    let finish: number | undefined;
    while (heap.length) {
      const current = pop(); if (current.cost !== distances.get(current.state)) continue;
      const index = Math.floor(current.state / 2), axis = current.state % 2;
      if (index === end) { finish = current.state; break; }
      const p = point(index), column = index % width;
      for (const [next, direction] of [[column > 0 ? index - 1 : -1, 0], [column < width - 1 ? index + 1 : -1, 0], [index - width, 1], [index + width, 1]]) {
        if (next < 0 || next >= count) continue;
        const q = point(next); if (blocked(p, q, boxes)) continue;
        let overlap = 0;
        for (const [u, v] of nearbyUsed) {
          if (direction === 0 && u.y === v.y && p.y === u.y) overlap += Math.max(0, Math.min(Math.max(p.x, q.x), Math.max(u.x, v.x)) - Math.max(Math.min(p.x, q.x), Math.min(u.x, v.x)));
          if (direction === 1 && u.x === v.x && p.x === u.x) overlap += Math.max(0, Math.min(Math.max(p.y, q.y), Math.max(u.y, v.y)) - Math.max(Math.min(p.y, q.y), Math.min(u.y, v.y)));
        }
        const cost = current.cost + Math.abs(p.x - q.x) + Math.abs(p.y - q.y) + (axis === direction ? 0 : 24) + overlap * 8;
        const state = next * 2 + direction;
        if (cost < (distances.get(state) ?? Infinity)) { distances.set(state, cost); parents.set(state, current.state); push({ state, cost }); }
      }
    }
    if (finish === undefined) continue; // Overlapping cards retain a manual route until arranged.
    const middle: ErPoint[] = [];
    for (let state: number | undefined = finish; state !== undefined; state = parents.get(state)) middle.unshift(point(Math.floor(state / 2)));
    const raw = [a.p, ...middle, b.p], points = raw.filter((p, i) => !i || i === raw.length - 1 || !((raw[i - 1].x === p.x && p.x === raw[i + 1].x) || (raw[i - 1].y === p.y && p.y === raw[i + 1].y)));
    let longest = -1, label = a.stub;
    for (let i = 1; i < points.length; i++) { const p = points[i - 1], q = points[i], length = Math.abs(q.x - p.x) + Math.abs(q.y - p.y); used.push([p, q]); if (length > longest) { longest = length; label = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }; } }
    if (longest < 0) label = { x: (a.stub.x + b.stub.x) / 2, y: (a.stub.y + b.stub.y) / 2 };
    result.set(connection.id, { points, label });
  }
  return result;
}

/** Place related entities in columns; cycles and disconnected groups remain bounded. */
export function arrangeErEntities(items: CanvasItem[], connections: CanvasConnection[]): Map<string, ErPoint> {
  const entities = items.filter(i => i.type === 'er-entity'), ids = new Set(entities.map(i => i.id)), ranks = new Map<string, number>();
  if (!entities.length) return new Map();
  const edges = connections.filter(c => ids.has(c.sourceId) && ids.has(c.targetId) && c.sourceId !== c.targetId);
  const visit = (root: string) => { const queue = [root]; ranks.set(root, 0); for (let i = 0; i < queue.length; i++) for (const edge of edges.filter(c => c.sourceId === queue[i])) if (!ranks.has(edge.targetId)) { ranks.set(edge.targetId, ranks.get(queue[i])! + 1); queue.push(edge.targetId); } };
  for (const entity of entities.filter(i => !edges.some(c => c.targetId === i.id))) if (!ranks.has(entity.id)) visit(entity.id);
  for (const entity of entities) if (!ranks.has(entity.id)) visit(entity.id);
  const left = Math.min(...entities.map(i => i.x)), top = Math.min(...entities.map(i => i.y)), positions = new Map<string, ErPoint>();
  let x = left;
  for (let rank = 0; rank <= Math.max(...ranks.values()); rank++) { const column = entities.filter(i => ranks.get(i.id) === rank); let y = top; for (const entity of column) { positions.set(entity.id, { x, y }); y += entity.height + 90; } x += Math.max(220, ...column.map(i => i.width)) + 160; }
  return positions;
}
