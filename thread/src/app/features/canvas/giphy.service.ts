import { Injectable } from '@angular/core';
import { GIPHY_API_KEY } from './giphy.config';
import { GifResult } from './media-catalog';

interface GiphyImage { url?: string; width?: string; height?: string }
interface GiphyItem { id: string; title: string; images: { fixed_width?: GiphyImage; original?: GiphyImage; downsized?: GiphyImage } }
interface GiphyResponse { data: GiphyItem[]; pagination?: { total_count?: number } }

@Injectable({ providedIn: 'root' })
export class GiphyService {
async fetch(kind: 'gif' | 'sticker', query: string, offset: number, signal: AbortSignal): Promise<{ results: GifResult[]; more: boolean }> {
  if (!GIPHY_API_KEY.trim()) throw new Error('Add a GIPHY API key in giphy.config.ts to search GIFs and stickers.');
  const endpoint = `${kind === 'gif' ? 'gifs' : 'stickers'}/${query.trim() ? 'search' : 'trending'}`;
  const url = new URL(`https://api.giphy.com/v1/${endpoint}`);
  url.searchParams.set('api_key', GIPHY_API_KEY);
  url.searchParams.set('limit', '24');
  url.searchParams.set('offset', String(offset));
  url.searchParams.set('rating', 'g');
  if (query.trim()) url.searchParams.set('q', query.trim());
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`GIPHY request failed (${response.status}).`);
  const payload = await response.json() as GiphyResponse;
  const results = payload.data.flatMap((entry): GifResult[] => {
    const source = entry.images.original || entry.images.downsized;
    const preview = entry.images.fixed_width || entry.images.downsized || source;
    if (!source?.url || !preview?.url) return [];
    return [{ id: entry.id, name: entry.title || 'GIPHY media', previewUrl: preview.url, sourceUrl: source.url,
      width: Number(source.width) || 240, height: Number(source.height) || 180, keywords: [] }];
  });
  return { results, more: offset + payload.data.length < (payload.pagination?.total_count || 0) };
}
}
