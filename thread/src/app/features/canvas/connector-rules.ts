import type { CanvasConnection, CanvasItem, CanvasJunction, ConnectorSide } from './canvas.model';

const connectable = new Set<CanvasItem['type']>([
  'note', 'text', 'task', 'checklist', 'list', 'shape', 'frame', 'zone',
  'er-entity', 'image', 'table', 'budget', 'chart',
]);
export const connectorSides: ConnectorSide[] = ['top', 'right', 'bottom', 'left'];

export function isConnectableItem(item: CanvasItem): boolean {
  return connectable.has(item.type);
}

export function isConnectorSide(value: unknown): value is ConnectorSide {
  return typeof value === 'string' && connectorSides.includes(value as ConnectorSide);
}

export function validConnections(items: CanvasItem[], connections: unknown, junctions: CanvasJunction[] = []): CanvasConnection[] {
  if (!Array.isArray(connections)) return [];
  const byId = new Map(items.map(item => [item.id, item]));
  const byConnection = new Map<string, CanvasConnection>(connections.filter((entry): entry is CanvasConnection => !!entry && typeof entry === 'object' && typeof entry.id === 'string').map(entry => [entry.id, entry]));
  const byJunction = new Map(junctions.map(junction => [junction.id, junction]));
  const ids = new Set<string>();
  const pairs = new Set<string>();
  const validJunction = (id: string, seen: Set<string>): boolean => {
    const junction = byJunction.get(id);
    if (!junction || !Number.isFinite(junction.positionRatio) || junction.positionRatio < 0 || junction.positionRatio > 1 || seen.has(junction.parentConnectorId)) return false;
    const parent = byConnection.get(junction.parentConnectorId);
    if (!parent || !byId.has(parent.sourceId) || !byId.has(parent.targetId)) return false;
    seen.add(parent.id);
    return (!parent.sourceJunctionId || validJunction(parent.sourceJunctionId, seen)) && (!parent.targetJunctionId || validJunction(parent.targetJunctionId, seen));
  };
  let accepted = connections.filter((entry): entry is CanvasConnection => {
    if (!entry || typeof entry !== 'object') return false;
    const connection = entry as CanvasConnection;
    const source = byId.get(connection.sourceId), target = byId.get(connection.targetId);
    if (typeof connection.id !== 'string' || ids.has(connection.id) || !source || !target) return false;
    if (!isConnectableItem(source) || !isConnectableItem(target)) return false;
    if (source.id === target.id && source.type !== 'er-entity') return false;
    if (connection.sourceJunctionId && !validJunction(connection.sourceJunctionId, new Set([connection.id]))) return false;
    if (connection.targetJunctionId && !validJunction(connection.targetJunctionId, new Set([connection.id]))) return false;
    if (connection.kind !== undefined && !['straight', 'elbow', 'curved'].includes(connection.kind)) return false;
    if (connection.routeAxis !== undefined && connection.routeAxis !== 'x' && connection.routeAxis !== 'y') return false;
    if (connection.sourceSide !== undefined && !isConnectorSide(connection.sourceSide)) return false;
    if (connection.targetSide !== undefined && !isConnectorSide(connection.targetSide)) return false;
    for (const binding of [connection.sourceBinding, connection.targetBinding]) {
      if (binding?.mode === 'precise' && (!binding.anchor || !Number.isFinite(binding.anchor.x) || !Number.isFinite(binding.anchor.y) || binding.anchor.x < 0 || binding.anchor.x > 1 || binding.anchor.y < 0 || binding.anchor.y > 1)) return false;
    }
    const er = source.type === 'er-entity' && target.type === 'er-entity';
    const pair = `${source.id}\u0000${target.id}\u0000${connection.sourceJunctionId || ''}\u0000${connection.targetJunctionId || ''}`;
    if (!er && pairs.has(pair)) return false;
    ids.add(connection.id);
    if (!er) pairs.add(pair);
    return true;
  });
  let changed = true;
  while (changed) {
    const acceptedIds = new Set(accepted.map(connection => connection.id));
    const next = accepted.filter(connection => [connection.sourceJunctionId, connection.targetJunctionId]
      .every(id => !id || acceptedIds.has(byJunction.get(id)?.parentConnectorId || '')));
    changed = next.length !== accepted.length;
    accepted = next;
  }
  return accepted;
}
