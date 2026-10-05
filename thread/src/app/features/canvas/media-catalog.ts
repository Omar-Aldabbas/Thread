import { weviStickers } from './wevi-stickers';

export interface GifResult {
  id: string;
  name: string;
  previewUrl: string;
  sourceUrl: string;
  width: number;
  height: number;
  keywords: string[];
}

export type StickerCategory =
  'Thread' | 'Doodles' | 'Arrows' | 'Shapes' | 'Tape' | 'Labels' | 'Nature'
  | 'Wevi Actions' | 'Wevi Moments' | 'Canvas Icons' | 'Workflow';
export interface StickerAsset {
  id: string;
  name: string;
  category: StickerCategory;
  src: string;
  width: number;
  height: number;
  keywords: string[];
}

const sticker = (
  id: string,
  name: string,
  category: StickerCategory,
  keywords: string[],
): StickerAsset => ({
  id,
  name,
  category,
  keywords,
  width: 160,
  height: 120,
  src: `/stickers/${id}.svg`,
});

export const stickers: StickerAsset[] = [
  sticker('thread-loop', 'Red thread loop', 'Thread', ['thread', 'red', 'loop', 'circle', 'wool']),
  sticker('thread-knot', 'Thread knot', 'Thread', ['thread', 'knot', 'red', 'wool']),
  sticker('wool-ball', 'Wool ball', 'Thread', ['wool', 'ball', 'thread', 'red']),
  sticker('curved-arrow', 'Curved arrow', 'Arrows', [
    'arrow',
    'red',
    'curved',
    'direction',
    'doodle',
  ]),
  sticker('double-arrow', 'Double arrow', 'Arrows', ['arrow', 'black', 'double', 'direction']),
  sticker('rough-star', 'Rough star', 'Doodles', ['star', 'hand drawn', 'sparkle', 'doodle']),
  sticker('scribble', 'Scribble underline', 'Doodles', ['scribble', 'underline', 'red', 'mark']),
  sticker('rough-circle', 'Rough circle', 'Shapes', ['circle', 'highlight', 'red', 'shape']),
  sticker('paper-tape', 'Paper tape', 'Tape', ['tape', 'paper', 'sticky', 'yellow']),
  sticker('pink-tape', 'Pink tape', 'Tape', ['tape', 'pink', 'sticky']),
  sticker('speech-label', 'Speech label', 'Labels', ['speech', 'bubble', 'label', 'note']),
  sticker('leaf-sprig', 'Leaf sprig', 'Nature', ['leaf', 'plant', 'green', 'nature']),
  sticker('sparkle-red', 'Red sparkle', 'Doodles', ['sparkle', 'star', 'red']),
  sticker('check-mark', 'Check mark', 'Doodles', ['check', 'done', 'yes']),
  sticker('heart-outline', 'Heart outline', 'Shapes', ['heart', 'love', 'red']),
  sticker('sunburst', 'Sunburst', 'Nature', ['sun', 'yellow', 'rays']),
  sticker('zigzag', 'Zigzag', 'Doodles', ['zigzag', 'line', 'red']),
  sticker('corner-arrow', 'Corner arrow', 'Arrows', ['arrow', 'corner', 'direction']),
  sticker('burst-circle', 'Burst circle', 'Shapes', ['burst', 'circle', 'highlight']),
  sticker('underline-swoosh', 'Underline swoosh', 'Doodles', ['underline', 'red', 'line']),
  ...weviStickers,
];
