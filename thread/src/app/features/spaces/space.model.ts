export type SpaceTone = 'red' | 'blue' | 'yellow' | 'green' | 'neutral';
export type SpaceTool = 'select' | 'hand' | 'edit' | 'add';

export type SpacePreview = 'mixed' | 'checklist' | 'notes' | 'visual';

export interface SpaceCard {
  id: string;

  title: string;

  itemCount: number;

  updatedAt: string;

  x: number;
  y: number;

  tone: SpaceTone;

  preview: SpacePreview;
}
