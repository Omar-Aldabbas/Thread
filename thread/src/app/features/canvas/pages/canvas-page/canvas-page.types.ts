import type {
  CanvasConnection,
  CanvasItem,
  CanvasJunction,
  ConnectorSide,
  ThreadDataset,
} from '../../canvas.model';

export type Tool = 'select' | 'hand' | 'text' | 'add' | 'connect' | 'sketch' | 'shape';
export type EditField = 'title' | 'body' | 'content';

export type CanvasState = {
  items: CanvasItem[];
  connections: CanvasConnection[];
  junctions?: CanvasJunction[];
  datasets?: ThreadDataset[];
};

export type CanvasSession = {
  kind:
    | 'pan'
    | 'move'
    | 'resize'
    | 'rotate'
    | 'marquee'
    | 'place'
    | 'crop'
    | 'connect'
    | 'rebind'
    | 'route'
    | 'branch'
    | 'junction-slide'
    | 'sketch'
    | 'erase';
  pointerId: number;
  clientX: number;
  clientY: number;
  x: number;
  y: number;
  itemId?: string;
  connectionId?: string;
  junctionId?: string;
  ratio?: number;
  terminal?: 'source' | 'target';
  side?: ConnectorSide;
  corner?: 'nw' | 'ne' | 'sw' | 'se';
  before?: CanvasState;
  origins?: Map<string, { x: number; y: number }>;
  groupCenter?: { x: number; y: number };
  groupIds?: string[];
  moved?: boolean;
};
