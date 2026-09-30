import { Component, EventEmitter, Input, OnInit, Output, computed, signal } from '@angular/core';
import { GifResult, StickerAsset, curatedGifProvider, stickers } from '../media-catalog';

export interface PickedMedia {
  kind: 'gif' | 'sticker';
  id: string;
  name: string;
  src: string;
  width: number;
  height: number;
}

@Component({
  selector: 'app-media-picker',
  standalone: true,
  template: `
    <aside
      class="media-picker"
      data-ui
      [attr.aria-label]="kind === 'gif' ? 'GIF browser' : 'Sticker browser'"
    >
      <header>
        <div>
          <small>ADD MEDIA</small>
          <h2>{{ kind === 'gif' ? 'GIFs' : 'Stickers' }}</h2>
        </div>
        <button type="button" (click)="closed.emit()" aria-label="Close picker">×</button>
      </header>
      <input
        class="media-search"
        type="search"
        [placeholder]="kind === 'gif' ? 'Search GIFs' : 'Search stickers'"
        [value]="query()"
        (input)="search($event)"
      />
      <nav class="media-categories" aria-label="Categories">
        @for (entry of categories(); track entry) {
          <button type="button" [class.active]="category() === entry" (click)="setCategory(entry)">
            {{ entry }}
          </button>
        }
      </nav>
      <div class="media-results" [class.gif-results]="kind === 'gif'">
        @for (entry of visible(); track entry.id) {
          <button
            type="button"
            class="media-result"
            (click)="choose(entry)"
            [attr.aria-label]="'Place ' + entry.name"
          >
            <img
              [src]="kind === 'gif' ? $any(entry).previewUrl : $any(entry).src"
              [alt]="entry.name"
              loading="lazy"
            /><span>{{ entry.name }}</span>
          </button>
        }
        @if (!visible().length) {
          <p class="media-empty">No matches in this collection.</p>
        }
      </div>
      @if (kind === 'gif') {
        <p class="media-caption">Curated GIFs · more results can be added with a media provider</p>
      }
    </aside>
  `,
  styles: [
    `
      .media-picker {
        position: absolute;
        z-index: 60;
        top: 68px;
        left: 82px;
        display: flex;
        flex-direction: column;
        width: 340px;
        max-height: min(620px, calc(100% - 90px));
        overflow: hidden;
        border: 1px solid var(--color-border);
        border-radius: 12px;
        background: var(--color-surface);
        box-shadow: var(--shadow-lg);
      }
      .media-picker header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 15px 17px 11px;
      }
      .media-picker header small {
        color: var(--color-primary);
        font-size: 10px;
        font-weight: 800;
        letter-spacing: 0.1em;
      }
      .media-picker h2 {
        margin: 3px 0 0;
        font-size: 19px;
      }
      .media-picker header button {
        width: 34px;
        height: 34px;
        border: 0;
        background: transparent;
        color: var(--color-text-secondary);
        font-size: 24px;
        cursor: pointer;
      }
      .media-search {
        height: 40px;
        margin: 0 15px 10px;
        padding: 0 12px;
        border: 1px solid var(--color-border);
        border-radius: 7px;
        outline: 0;
        background: var(--color-background);
        color: var(--color-text-primary);
        font-size: 13px;
      }
      .media-search:focus {
        border-color: var(--color-primary);
      }
      .media-categories {
        display: flex;
        gap: 5px;
        flex: none;
        overflow-x: auto;
        padding: 0 15px 10px;
        scrollbar-width: thin;
      }
      .media-categories button {
        min-height: 30px;
        padding: 5px 10px;
        border: 1px solid var(--color-border);
        border-radius: 999px;
        background: transparent;
        color: var(--color-text-secondary);
        white-space: nowrap;
        font-size: 11px;
        cursor: pointer;
      }
      .media-categories button.active {
        border-color: var(--color-primary);
        background: var(--color-primary-subtle);
        color: var(--color-primary);
      }
      .media-results {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 7px;
        overflow: auto;
        padding: 4px 15px 15px;
      }
      .media-results.gif-results {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        align-items: start;
      }
      .media-result {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 5px;
        min-width: 0;
        padding: 4px;
        border: 1px solid transparent;
        border-radius: 8px;
        background: transparent;
        cursor: pointer;
      }
      .media-result:hover,
      .media-result:focus-visible {
        border-color: var(--color-primary);
        background: var(--color-primary-subtle);
      }
      .media-result img {
        width: 100%;
        height: 88px;
        object-fit: contain;
      }
      .gif-results .media-result img {
        height: auto;
        min-height: 95px;
        max-height: 170px;
        object-fit: contain;
      }
      .media-result span {
        overflow: hidden;
        width: 100%;
        color: var(--color-text-secondary);
        text-align: center;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 10px;
      }
      .media-empty {
        grid-column: 1/-1;
        padding: 35px 10px;
        color: var(--color-text-muted);
        text-align: center;
        font-size: 12px;
      }
      .media-caption {
        margin: 0;
        padding: 8px 15px;
        border-top: 1px solid var(--color-border-light);
        color: var(--color-text-muted);
        font-size: 10px;
      }
      @media (max-width: 700px) {
        .media-picker {
          top: auto;
          right: 0;
          bottom: calc(64px + env(safe-area-inset-bottom));
          left: 0;
          width: 100%;
          max-height: min(72vh, 620px);
          border-radius: 16px 16px 0 0;
        }
        .media-result img {
          height: 96px;
        }
        .media-categories button {
          min-height: 38px;
          font-size: 12px;
        }
      }
    `,
  ],
})
export class MediaPicker implements OnInit {
  @Input({ required: true }) kind!: 'gif' | 'sticker';
  @Output() closed = new EventEmitter<void>();
  @Output() picked = new EventEmitter<PickedMedia>();
  readonly query = signal('');
  readonly category = signal('Featured');
  readonly gifs = signal<GifResult[]>([]);
  readonly recent = signal<string[]>([]);
  readonly categories = computed(() =>
    this.kind === 'gif'
      ? ['Trending', 'Recent']
      : ['Featured', 'Recent', 'Thread', 'Doodles', 'Arrows', 'Shapes', 'Tape', 'Labels', 'Nature'],
  );
  readonly visible = computed(() => {
    const query = this.query().trim().toLowerCase();
    const data: (GifResult | StickerAsset)[] = this.kind === 'gif' ? this.gifs() : stickers;
    return data.filter((entry) => {
      if (this.category() === 'Recent' && !this.recent().includes(entry.id)) return false;
      if (
        this.kind === 'sticker' &&
        !['Featured', 'Recent'].includes(this.category()) &&
        (entry as StickerAsset).category !== this.category()
      )
        return false;
      return !query || `${entry.name} ${entry.keywords.join(' ')}`.toLowerCase().includes(query);
    });
  });
  ngOnInit(): void {
    this.category.set(this.kind === 'gif' ? 'Trending' : 'Featured');
    try {
      this.recent.set(JSON.parse(localStorage.getItem(`thread-recent-${this.kind}`) || '[]'));
    } catch {
      this.recent.set([]);
    }
    if (this.kind === 'gif')
      void curatedGifProvider.search('').then((value) => this.gifs.set(value));
  }
  search(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.query.set(value);
    if (this.kind === 'gif') void curatedGifProvider.search(value).then(results => { if (this.query() === value) this.gifs.set(results); });
  }
  setCategory(value: string): void {
    this.category.set(value);
  }
  choose(entry: GifResult | StickerAsset): void {
    const recent = [entry.id, ...this.recent().filter((id) => id !== entry.id)].slice(0, 12);
    this.recent.set(recent);
    try {
      localStorage.setItem(`thread-recent-${this.kind}`, JSON.stringify(recent));
    } catch {
      /* storage may be unavailable */
    }
    this.picked.emit({
      kind: this.kind,
      id: entry.id,
      name: entry.name,
      src: this.kind === 'gif' ? (entry as GifResult).sourceUrl : (entry as StickerAsset).src,
      width: entry.width,
      height: entry.height,
    });
  }
}
