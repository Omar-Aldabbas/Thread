export type ItemType =
  | 'workspace'
  | 'zone'
  | 'note'
  | 'text'
  | 'task'
  | 'list'
  | 'checklist'
  | 'image'
  | 'gif'
  | 'sticker'
  | 'file'
  | 'link'
  | 'table'
  | 'sketch'
  | 'voice'
  | 'budget';
export type ZoneType = 'standard' | 'nested' | 'portal';
export type SketchBrush = 'pen' | 'marker' | 'highlighter' | 'neon';
export interface SketchPoint { x: number; y: number; pressure: number }
export interface SketchStroke { id: string; brush: SketchBrush; points: SketchPoint[]; color: string; size: number; opacity: number }

export interface CanvasItem {
  id: string;
  type: ItemType;
  parentId: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex?: number;
  rotation?: number;
  cropX?: number;
  cropY?: number;
  cropScale?: number;
  fontSize?: number;
  fontWeight?: number;
  fontFamily?: 'sans' | 'mono';
  textAlign?: 'left' | 'center' | 'right';
  textColor?: string;
  background?: string;
  ordered?: boolean;
  textAutoSize?: boolean;
  title: string;
  body?: string;
  bodyHtml?: string;
  accent?: string;
  image?: string;
  url?: string;
  filename?: string;
  duration?: string;
  due?: string;
  priority?: 'Low' | 'Medium' | 'High';
  completed?: boolean;
  checklist?: { label: string; completed: boolean }[];
  rows?: { label: string; value: number }[];
  tableColumns?: string[];
  tableRows?: string[][];
  strokes?: { x: number; y: number; pressure?: number }[][];
  sketchStrokes?: SketchStroke[];
  sketchAsset?: 'sticker' | 'gif';
  assetId?: string;
  flipX?: boolean;
  flipY?: boolean;
  brush?: 'pen' | 'marker' | 'highlighter';
  strokeWidth?: number;
  strokeOpacity?: number;
  sourceWidth?: number;
  sourceHeight?: number;
  zoneType?: ZoneType;
  portalTargetId?: string;
  locked?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CanvasConnection {
  id: string;
  sourceId: string;
  targetId: string;
  label?: string;
  style?: 'solid' | 'dashed';
  direction?: 'none' | 'forward' | 'both';
}

const now = '2026-09-29T00:00:00.000Z';

export const demoItems: CanvasItem[] = [
  {
    id: 'product',
    type: 'workspace',
    parentId: null,
    x: 170,
    y: 185,
    width: 1080,
    height: 740,
    title: 'Product direction',
    body: 'From the first spark to something real.',
    accent: '#ca644e',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'studio',
    type: 'workspace',
    parentId: null,
    x: 1370,
    y: 245,
    width: 640,
    height: 690,
    title: 'Creative studio',
    body: 'Visual references and experiments.',
    accent: '#8b9472',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'research',
    type: 'zone',
    parentId: 'product',
    x: 215,
    y: 340,
    width: 315,
    height: 230,
    title: 'Research',
    body: 'Insights, references, and open questions',
    accent: '#d4111c',
    zoneType: 'nested',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'roadmap',
    type: 'zone',
    parentId: 'product',
    x: 775,
    y: 355,
    width: 345,
    height: 230,
    title: 'Roadmap',
    body: 'What we are building next',
    accent: '#111111',
    zoneType: 'standard',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'note-1',
    type: 'note',
    parentId: 'product',
    x: 218,
    y: 635,
    width: 270,
    height: 208,
    title: 'The idea',
    body: 'A quieter way to see how your work connects. Give thoughts room to grow, then follow the thread between them.',
    accent: '#d4111c',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'task-1',
    type: 'task',
    parentId: 'product',
    x: 530,
    y: 625,
    width: 220,
    height: 170,
    title: 'Shape the first release',
    body: 'Define the smallest useful canvas experience.',
    due: 'Oct 12',
    priority: 'High',
    completed: false,
    accent: '#d4111c',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'check-1',
    type: 'checklist',
    parentId: 'product',
    x: 785,
    y: 650,
    width: 280,
    height: 205,
    title: 'This week',
    checklist: [
      { label: 'Map the core journey', completed: true },
      { label: 'Explore spatial patterns', completed: true },
      { label: 'Prototype zone navigation', completed: false },
      { label: 'Share the first draft', completed: false },
    ],
    accent: '#111111',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'image-1',
    type: 'image',
    parentId: 'studio',
    x: 1420,
    y: 365,
    width: 310,
    height: 290,
    title: 'Light & form',
    body: 'A little inspiration for the visual language.',
    image: '/images/architecture-study.png',
    accent: '#111111',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'link-1',
    type: 'link',
    parentId: 'studio',
    x: 1740,
    y: 440,
    width: 220,
    height: 150,
    title: 'Design principles',
    body: 'A collection of useful reading',
    url: 'https://example.com',
    accent: '#111111',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'file-1',
    type: 'file',
    parentId: 'studio',
    x: 1420,
    y: 705,
    width: 290,
    height: 155,
    title: 'Brand notes',
    filename: 'thread-visual-notes.pdf',
    body: 'PDF document · 2.4 MB',
    accent: '#d4111c',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'research-note',
    type: 'note',
    parentId: 'research',
    x: 130,
    y: 170,
    width: 290,
    height: 200,
    title: 'Questions to explore',
    body: 'How can the canvas stay calm as the number of ideas grows?',
    accent: '#e6bc8e',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'research-deep',
    type: 'zone',
    parentId: 'research',
    x: 490,
    y: 165,
    width: 320,
    height: 220,
    title: 'Canvas engine',
    body: 'Interaction studies and technical notes',
    accent: '#9b9b79',
    zoneType: 'nested',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'engine-task',
    type: 'task',
    parentId: 'research-deep',
    x: 150,
    y: 170,
    width: 275,
    height: 175,
    title: 'Test cursor zoom',
    body: 'Keep the world point beneath the pointer fixed.',
    priority: 'Medium',
    due: 'Oct 8',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'roadmap-budget',
    type: 'budget',
    parentId: 'roadmap',
    x: 130,
    y: 165,
    width: 270,
    height: 240,
    title: 'Launch budget',
    rows: [
      { label: 'Hosting', value: 20 },
      { label: 'Domain', value: 12 },
      { label: 'Promotion', value: 150 },
    ],
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'roadmap-table',
    type: 'table',
    parentId: 'roadmap',
    x: 465,
    y: 165,
    width: 310,
    height: 215,
    title: 'Milestones',
    body: 'Prototype|October\nTesting|November\nLaunch|December',
    createdAt: now,
    updatedAt: now,
  },
];

export const demoConnections: CanvasConnection[] = [
  { id: 'c1', sourceId: 'research', targetId: 'roadmap', label: 'informs', direction: 'forward' },
  { id: 'c2', sourceId: 'note-1', targetId: 'task-1', label: 'becomes', direction: 'forward' },
  { id: 'c3', sourceId: 'task-1', targetId: 'check-1', style: 'dashed', direction: 'forward' },
];
