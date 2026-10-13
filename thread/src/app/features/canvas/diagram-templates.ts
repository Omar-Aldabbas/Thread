import { CanvasConnection, CanvasItem, ShapeKind } from './canvas.model';
import { canvasId } from './canvas-id';

export type DiagramType = 'mind-map' | 'process-map' | 'business-map';
export const diagramCatalog: { type: DiagramType; name: string; description: string }[] = [
  { type: 'mind-map', name: 'Mind map', description: 'Explore a central idea' },
  { type: 'process-map', name: 'Process map', description: 'See steps, decisions, and handoffs' },
  { type: 'business-map', name: 'Business map', description: 'Connect goals, capabilities, and systems' },
];

type Node = [string, string, number, number, ShapeKind?];
type Edge = [string, string, string?];
const blueprints: Record<DiagramType, { nodes: Node[]; edges: Edge[] }> = {
  'mind-map': {
    nodes: [['idea', 'Central idea', 300, 180, 'circle'], ['why', 'Why?', 20, 20], ['who', 'For whom?', 580, 20], ['how', 'How?', 20, 340], ['next', 'Next steps', 580, 340]],
    edges: [['idea', 'why'], ['idea', 'who'], ['idea', 'how'], ['idea', 'next']],
  },
  'process-map': {
    nodes: [['start', 'Start', 20, 160, 'pill'], ['work', 'Do the work', 270, 160], ['decision', 'Approved?', 520, 160, 'diamond'], ['done', 'Complete', 790, 40, 'pill'], ['revise', 'Revise', 790, 310]],
    edges: [['start', 'work'], ['work', 'decision'], ['decision', 'done', 'Yes'], ['decision', 'revise', 'No'], ['revise', 'work']],
  },
  'business-map': {
    nodes: [['goal', 'Business goal', 340, 20, 'hexagon'], ['capability', 'Capability', 340, 210], ['team', 'Owning team', 20, 410], ['system', 'Supporting system', 660, 410]],
    edges: [['goal', 'capability', 'needs'], ['capability', 'team', 'owned by'], ['capability', 'system', 'enabled by']],
  },
};

export function createDiagramTemplate(type: DiagramType, center: { x: number; y: number }, parentId: string | null): { items: CanvasItem[]; connections: CanvasConnection[] } {
  const blueprint = blueprints[type];
  const offsetX = center.x - 500;
  const offsetY = center.y - 290;
  const ids = new Map(blueprint.nodes.map(([key]) => [key, canvasId()]));
  const now = new Date().toISOString();
  const items: CanvasItem[] = blueprint.nodes.map(([key, title, x, y, shapeKind = 'rounded']) => ({
    id: ids.get(key)!, type: 'shape', parentId, x: x + offsetX, y: y + offsetY,
    width: 200, height: 112, title, shapeKind, shapeFill: '#fff8f5', shapeStroke: '#d4111c',
    shapeStrokeWidth: 2, textColor: '#1e293b', fontSize: 16, createdAt: now, updatedAt: now,
  }));
  const connections: CanvasConnection[] = blueprint.edges.map(([from, to, label]) => ({
    id: canvasId(), sourceId: ids.get(from)!, targetId: ids.get(to)!, label,
    direction: type === 'mind-map' ? 'none' : 'forward', kind: type === 'mind-map' ? 'curved' : 'elbow',
  }));
  return { items, connections };
}
