export interface GifResult {
  id: string;
  name: string;
  previewUrl: string;
  sourceUrl: string;
  width: number;
  height: number;
  keywords: string[];
}

export interface GifProvider {
  search(query: string): Promise<GifResult[]>;
}

const gif = (
  id: string,
  name: string,
  width: number,
  height: number,
  keywords: string[],
): GifResult => ({
  id,
  name,
  width,
  height,
  keywords,
  previewUrl: `https://media.giphy.com/media/${id}/giphy.gif`,
  sourceUrl: `https://media.giphy.com/media/${id}/giphy.gif`,
});

// Curated results keep the picker useful until a searchable media provider is configured.
export const curatedGifs: GifResult[] = [
  gif('g9582DNuQppxC', 'Celebration confetti', 320, 240, ['celebrate', 'party', 'yes', 'happy']),
  gif('l0MYt5jPR6QX5pnqM', 'Dancing celebration', 320, 240, ['celebrate', 'dance', 'funny']),
  gif('3o7aD2saalBwwftBIu', 'Happy reaction', 320, 240, ['happy', 'reaction', 'yes']),
  gif('5GoVLqeAOo6PK', 'Success reaction', 320, 240, ['yes', 'success', 'reaction', 'celebrate']),
  gif('26ufdipQqU2lhNA4g', 'Coding reaction', 320, 240, ['coding', 'work', 'computer']),
  gif('xT9IgzoKnwFNmISR8I', 'Coffee time', 320, 240, ['coffee', 'morning', 'work']),
  gif('3o7TKr3nzbh5WgCFxe', 'No reaction', 320, 240, ['no', 'reaction', 'funny']),
  gif('l3q2K5jinAlChoCLS', 'Thinking reaction', 320, 240, ['thinking', 'reaction', 'funny']),
];

export const curatedGifProvider: GifProvider = {
  async search(query) {
    const value = query.trim().toLowerCase();
    return value
      ? curatedGifs.filter((gif) =>
          `${gif.name} ${gif.keywords.join(' ')}`.toLowerCase().includes(value),
        )
      : curatedGifs;
  },
};

export type StickerCategory =
  'Thread' | 'Doodles' | 'Arrows' | 'Shapes' | 'Tape' | 'Labels' | 'Nature';
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
];
