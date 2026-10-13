import { ArchitectureDetails, ArchitectureKind, CanvasConnection, CanvasItem, ShapeKind } from './canvas.model';
import { canvasId } from './canvas-id';

export const architectureKinds: { kind: ArchitectureKind; label: string; shortLabel: string; description: string; shape: ShapeKind; fill: string; stroke: string }[] = [
  { kind: 'business', label: 'Business capability', shortLabel: 'Business', description: 'Outcome the system supports', shape: 'hexagon', fill: '#f5efff', stroke: '#7955aa' },
  { kind: 'client', label: 'Client / user', shortLabel: 'Client', description: 'Where requests begin', shape: 'rounded', fill: '#eaf5ff', stroke: '#397ca8' },
  { kind: 'service', label: 'Application / service', shortLabel: 'Service', description: 'Runs business logic', shape: 'rounded', fill: '#fff5e8', stroke: '#bf7930' },
  { kind: 'database', label: 'Database / storage', shortLabel: 'Database', description: 'Stores data', shape: 'cylinder', fill: '#eaf7f0', stroke: '#378566' },
  { kind: 'network', label: 'Network / gateway', shortLabel: 'Network', description: 'Routes or protects traffic', shape: 'hexagon', fill: '#eff3ff', stroke: '#5b70a7' },
  { kind: 'security', label: 'Identity / security', shortLabel: 'Identity', description: 'Controls access', shape: 'diamond', fill: '#fff0f2', stroke: '#b94d62' },
  { kind: 'external', label: 'External system', shortLabel: 'External', description: 'Outside dependency', shape: 'cloud', fill: '#f1f3f5', stroke: '#64717d' },
  { kind: 'observability', label: 'Monitoring', shortLabel: 'Monitor', description: 'Logs, metrics, alerts', shape: 'rounded', fill: '#f6f2e9', stroke: '#9c8254' },
];

export function architectureShape(kind: ArchitectureKind, point: { x: number; y: number }, parentId: string | null, title?: string): CanvasItem {
  const option = architectureKinds.find((entry) => entry.kind === kind)!;
  const now = new Date().toISOString();
  return {
    id: canvasId(), type: 'shape', parentId, x: point.x, y: point.y, width: 220, height: 116,
    title: title || option.label, shapeKind: option.shape, shapeFill: option.fill, shapeStroke: option.stroke,
    shapeStrokeWidth: 2, textColor: '#1e293b', fontSize: 16,
    architecture: { kind, provider: 'agnostic', environment: 'shared', criticality: 'medium' },
    createdAt: now, updatedAt: now,
  };
}

export function architectureStarter(center: { x: number; y: number }, parentId: string | null): { items: CanvasItem[]; connections: CanvasConnection[] } {
  const specs: [string, ArchitectureKind, string, number, number, Partial<ArchitectureDetails>?][] = [
    ['capability', 'business', 'Serve customers', 570, 20, { capability: 'Customer service' }],
    ['client', 'client', 'Web and mobile', 30, 260],
    ['gateway', 'network', 'Gateway', 300, 260],
    ['service', 'service', 'Application API', 570, 260, { capability: 'Customer service' }],
    ['database', 'database', 'Customer data', 840, 120],
    ['monitoring', 'observability', 'Monitoring', 840, 410],
  ];
  const items = specs.map(([key, kind, title, x, y, details]) => {
    const item = architectureShape(kind, { x: center.x + x - 540, y: center.y + y - 260 }, parentId, title);
    item.architecture = { ...item.architecture!, ...details };
    return { key, item };
  });
  const byKey = new Map(items.map(({ key, item }) => [key, item.id]));
  const edges: [string, string, string, string][] = [
    ['client', 'gateway', 'HTTPS', 'HTTPS'],
    ['gateway', 'service', 'API requests', 'HTTPS'],
    ['service', 'database', 'Reads / writes', 'SQL'],
    ['service', 'monitoring', 'Telemetry', 'Events'],
    ['capability', 'service', 'Delivered by', ''],
  ];
  return {
    items: items.map(({ item }) => item),
    connections: edges.map(([from, to, label, protocol]) => ({
      id: canvasId(), sourceId: byKey.get(from)!, targetId: byKey.get(to)!, label,
      protocol, direction: 'forward', kind: 'elbow', dataClassification: 'internal',
    })),
  };
}

export interface ArchitectureIssue { itemId: string; message: string; }
export function reviewArchitecture(items: CanvasItem[], connections: CanvasConnection[]): { count: number; monthlyCost: number; issues: ArchitectureIssue[] } {
  const components = items.filter((item) => !!item.architecture);
  const ids = new Set(components.map((item) => item.id));
  const linked = new Set(connections.filter((connection) => ids.has(connection.sourceId) && ids.has(connection.targetId)).flatMap((connection) => [connection.sourceId, connection.targetId]));
  const issues: ArchitectureIssue[] = [];
  for (const item of components) {
    if (!linked.has(item.id)) issues.push({ itemId: item.id, message: `${item.title}: no architecture connection` });
    if (item.architecture?.kind !== 'business' && !item.architecture?.owner?.trim())
      issues.push({ itemId: item.id, message: `${item.title}: owner missing` });
    if (item.architecture?.kind === 'service' && !item.architecture.capability?.trim())
      issues.push({ itemId: item.id, message: `${item.title}: business capability missing` });
    if (item.architecture?.kind === 'service' && item.architecture.environment === 'production') {
      const hasMonitoring = connections.some((connection) =>
        (connection.sourceId === item.id || connection.targetId === item.id) &&
        components.some((other) => other.id === (connection.sourceId === item.id ? connection.targetId : connection.sourceId) && other.architecture?.kind === 'observability'));
      if (!hasMonitoring) issues.push({ itemId: item.id, message: `${item.title}: production service has no monitoring link` });
    }
  }
  for (const connection of connections) {
    const source = components.find((item) => item.id === connection.sourceId);
    const target = components.find((item) => item.id === connection.targetId);
    if (source && target && source.architecture?.kind === 'client' && target.architecture?.kind === 'database')
      issues.push({ itemId: target.id, message: `${target.title}: client connects directly to data storage` });
  }
  return {
    count: components.length,
    monthlyCost: components.reduce((sum, item) => sum + Math.max(0, Number(item.architecture?.monthlyCost) || 0), 0),
    issues,
  };
}
