import type { CanvasConnection, CanvasItem, ConnectorSide } from './canvas.model';

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

export function validConnections(items: CanvasItem[], connections: unknown): CanvasConnection[] {
  if (!Array.isArray(connections)) return [];
  const byId = new Map(items.map(item => [item.id, item]));
  const ids = new Set<string>();
  const pairs = new Set<string>();
  return connections.filter((entry): entry is CanvasConnection => {
    if (!entry || typeof entry !== 'object') return false;
    const connection = entry as CanvasConnection;
    const source = byId.get(connection.sourceId), target = byId.get(connection.targetId);
    if (typeof connection.id !== 'string' || ids.has(connection.id) || !source || !target) return false;
    if (!isConnectableItem(source) || !isConnectableItem(target)) return false;
    if (source.id === target.id && source.type !== 'er-entity') return false;
    if (connection.sourceJunctionId || connection.targetJunctionId) return false;
    if (connection.kind !== undefined && !['straight', 'elbow', 'curved'].includes(connection.kind)) return false;
    if (connection.sourceSide !== undefined && !isConnectorSide(connection.sourceSide)) return false;
    if (connection.targetSide !== undefined && !isConnectorSide(connection.targetSide)) return false;
    for (const binding of [connection.sourceBinding, connection.targetBinding]) {
      if (binding?.mode === 'precise' && (!binding.anchor || !Number.isFinite(binding.anchor.x) || !Number.isFinite(binding.anchor.y) || binding.anchor.x < 0 || binding.anchor.x > 1 || binding.anchor.y < 0 || binding.anchor.y > 1)) return false;
    }
    const er = source.type === 'er-entity' && target.type === 'er-entity';
    const pair = `${source.id}\u0000${target.id}`;
    if (!er && pairs.has(pair)) return false;
    ids.add(connection.id);
    if (!er) pairs.add(pair);
    return true;
  });
}
