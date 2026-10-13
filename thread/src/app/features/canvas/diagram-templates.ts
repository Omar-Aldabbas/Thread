import { CanvasConnection, CanvasItem, ShapeKind } from './canvas.model';
import { canvasId } from './canvas-id';

export type DiagramType = 'mind-map' | 'user-flow' | 'swimlane' | 'timeline' | 'org-chart' |
  'journey' | 'architecture' | 'sequence' | 'state' | 'decision-tree' | 'concept-map' |
  'gantt' | 'uml-class' | 'network' | 'bpmn';

export const diagramCatalog: { type: DiagramType; name: string; description: string; group: string }[] = [
  { type: 'mind-map', name: 'Mind map', description: 'Branch ideas from a central topic', group: 'Ideas' },
  { type: 'concept-map', name: 'Concept map', description: 'Label how ideas relate', group: 'Ideas' },
  { type: 'decision-tree', name: 'Decision tree', description: 'Explore choices and outcomes', group: 'Ideas' },
  { type: 'user-flow', name: 'User flow', description: 'Map screens and decisions', group: 'Product' },
  { type: 'journey', name: 'Customer journey', description: 'Track actions and pain points', group: 'Product' },
  { type: 'swimlane', name: 'Swimlane flowchart', description: 'Show steps by owner', group: 'Process' },
  { type: 'timeline', name: 'Timeline', description: 'Arrange milestones in time', group: 'Process' },
  { type: 'gantt', name: 'Gantt chart', description: 'Show tasks and durations', group: 'Process' },
  { type: 'org-chart', name: 'Org chart', description: 'Map roles and reporting', group: 'Process' },
  { type: 'bpmn', name: 'BPMN starter', description: 'Model an approval process', group: 'Process' },
  { type: 'architecture', name: 'System architecture', description: 'Connect services and storage', group: 'Technical' },
  { type: 'sequence', name: 'Sequence diagram', description: 'Show interactions over time', group: 'Technical' },
  { type: 'state', name: 'State diagram', description: 'Show changes of state', group: 'Technical' },
  { type: 'uml-class', name: 'UML class starter', description: 'Sketch classes and relationships', group: 'Technical' },
  { type: 'network', name: 'Network diagram', description: 'Map connected devices', group: 'Technical' },
];

type Node = [string, string, number, number, ShapeKind?, number?, number?];
type Edge = [string, string, string?];
interface Blueprint { nodes: Node[]; edges: Edge[]; }

const blueprints: Record<DiagramType, Blueprint> = {
  'mind-map': { nodes: [
    ['topic','Central idea',300,190,'circle',190,130],['why','Why?',40,40],['who','For whom?',570,40],
    ['how','How?',40,340],['next','Next steps',570,340],
  ], edges: [['topic','why'],['topic','who'],['topic','how'],['topic','next']] },
  'concept-map': { nodes: [
    ['idea','Main concept',290,50],['part','Part',40,250],['effect','Effect',290,250],['context','Context',540,250],
  ], edges: [['idea','part','contains'],['idea','effect','causes'],['context','idea','shapes'],['part','effect','influences']] },
  'decision-tree': { nodes: [
    ['question','Choose an approach?',290,30,'diamond'],['yes','Yes',60,240],['no','No',530,240],
    ['act','Take action',60,430],['rethink','Explore options',530,430],
  ], edges: [['question','yes','Yes'],['question','no','No'],['yes','act'],['no','rethink']] },
  'user-flow': { nodes: [
    ['start','Start',30,180,'pill'],['screen','Landing screen',270,180],['choice','Signed in?',520,180,'diamond'],
    ['account','Account',770,60],['signup','Sign up',770,310],
  ], edges: [['start','screen'],['screen','choice'],['choice','account','Yes'],['choice','signup','No']] },
  'journey': { nodes: [
    ['discover','Discover\nUser sees an offer',20,100,'rounded',210,120],
    ['consider','Consider\nCompare options',260,100,'rounded',210,120],
    ['buy','Purchase\nComplete checkout',500,100,'rounded',210,120],
    ['return','Return\nGet support',740,100,'rounded',210,120],
    ['pain','Pain point\nToo many steps',500,310,'document',210,110],
  ], edges: [['discover','consider'],['consider','buy'],['buy','return'],['buy','pain','friction']] },
  'swimlane': { nodes: [
    ['request','Customer\nSubmit request',30,60],['review','Team\nReview request',290,220],
    ['approve','Manager\nApprove?',550,380,'diamond'],['reply','Customer\nReceive reply',810,60],
  ], edges: [['request','review'],['review','approve'],['approve','reply']] },
  'timeline': { nodes: [
    ['one','October\nResearch',20,150],['two','November\nPrototype',260,150],
    ['three','December\nTesting',500,150],['four','January\nLaunch',740,150],
  ], edges: [['one','two'],['two','three'],['three','four']] },
  'gantt': { nodes: [
    ['research','Research · Week 1–2',40,80,'rounded',350,80],
    ['design','Design · Week 2–4',220,190,'rounded',440,80],
    ['build','Build · Week 4–7',440,300,'rounded',500,80],
    ['test','Test · Week 7–8',720,410,'rounded',240,80],
  ], edges: [['research','design'],['design','build'],['build','test']] },
  'org-chart': { nodes: [
    ['lead','Team lead',390,30],['design','Design',80,240],['product','Product',390,240],
    ['engineering','Engineering',700,240],['frontend','Frontend',610,440],['backend','Backend',860,440],
  ], edges: [['lead','design'],['lead','product'],['lead','engineering'],['engineering','frontend'],['engineering','backend']] },
  'bpmn': { nodes: [
    ['start','Start',20,190,'circle',120,120],['submit','Submit request',200,190],
    ['review','Review',440,190],['gateway','Approved?',680,190,'diamond'],
    ['finish','Complete',920,70,'circle',140,120],['revise','Revise',920,320],
  ], edges: [['start','submit'],['submit','review'],['review','gateway'],['gateway','finish','Yes'],['gateway','revise','No'],['revise','review']] },
  'architecture': { nodes: [
    ['client','Web client',20,170],['api','API',290,170],['auth','Authentication',560,20],
    ['db','Database',560,310,'cylinder'],['storage','File storage',820,310,'cylinder'],
  ], edges: [['client','api','requests'],['api','auth'],['api','db'],['api','storage']] },
  'sequence': { nodes: [
    ['user','User\n1. Send request',20,40,'rounded',220,110],['app','App\n2. Validate',280,190,'rounded',220,110],
    ['server','Server\n3. Fetch data',540,340,'rounded',220,110],['response','App\n4. Show result',800,490,'rounded',220,110],
  ], edges: [['user','app','request'],['app','server','query'],['server','response','result']] },
  'state': { nodes: [
    ['draft','Draft',20,170],['review','In review',270,170],['approved','Approved',520,50],
    ['changes','Changes needed',520,310],['done','Done',780,50],
  ], edges: [['draft','review','submit'],['review','approved','approve'],['review','changes','request edits'],['changes','draft','revise'],['approved','done','publish']] },
  'uml-class': { nodes: [
    ['user','User\nid: UUID\nname: string',30,80,'rectangle',260,190],
    ['order','Order\nid: UUID\ntotal: number',400,80,'rectangle',260,190],
    ['item','OrderItem\nquantity: number',770,80,'rectangle',260,190],
  ], edges: [['user','order','places'],['order','item','contains']] },
  'network': { nodes: [
    ['internet','Internet',20,180,'cloud'],['router','Router',300,180],
    ['switch','Switch',570,180],['laptop','Laptop',850,20],['server','Server',850,340],
  ], edges: [['internet','router'],['router','switch'],['switch','laptop'],['switch','server']] },
};

export function createDiagramTemplate(type: DiagramType, center: { x: number; y: number }, parentId: string | null): { items: CanvasItem[]; connections: CanvasConnection[] } {
  const blueprint = blueprints[type];
  const minX = Math.min(...blueprint.nodes.map((node) => node[2]));
  const minY = Math.min(...blueprint.nodes.map((node) => node[3]));
  const maxX = Math.max(...blueprint.nodes.map((node) => node[2] + (node[5] || 200)));
  const maxY = Math.max(...blueprint.nodes.map((node) => node[3] + (node[6] || 110)));
  const offsetX = center.x - (minX + maxX) / 2;
  const offsetY = center.y - (minY + maxY) / 2;
  const ids = new Map(blueprint.nodes.map((node) => [node[0], canvasId()]));
  const now = new Date().toISOString();
  const items: CanvasItem[] = blueprint.nodes.map(([key, title, x, y, kind = 'rounded', width = 200, height = 110]) => ({
    id: ids.get(key)!, type: 'shape', parentId, x: x + offsetX, y: y + offsetY, width, height,
    title, shapeKind: kind, shapeFill: '#fff8f5', shapeStroke: '#d4111c', shapeStrokeWidth: 2,
    textColor: '#1e293b', fontSize: 16, accent: '#d4111c', createdAt: now, updatedAt: now,
  }));
  const connections: CanvasConnection[] = blueprint.edges.map(([from, to, label]) => ({
    id: canvasId(), sourceId: ids.get(from)!, targetId: ids.get(to)!, label,
    direction: type === 'mind-map' || type === 'concept-map' || type === 'org-chart' || type === 'network' ? 'none' : 'forward',
    kind: type === 'mind-map' || type === 'concept-map' ? 'curved' : 'elbow',
  }));
  return { items, connections };
}
