import { Component, EventEmitter, Input, OnDestroy, OnInit, Output, computed, inject, signal } from '@angular/core';
import { GifResult, StickerAsset, stickers } from '../media-catalog';
import { GiphyService } from '../giphy.service';
import { ScrollDirective } from '../../../shared/scroll.directive';

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
  imports: [ScrollDirective],
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
        aria-label="Search media"
        [placeholder]="kind === 'gif' ? 'Search GIFs' : 'Search stickers'"
        [value]="query()"
        (input)="search($event)"
      />
      @if (kind === 'sticker') {
        <nav class="sticker-packs" appScroll="x" scrollbar="hover" aria-label="Sticker packs">
          @for (pack of stickerPacks; track pack.id) {
            <button type="button" [class.active]="collection() === pack.id" [attr.aria-pressed]="collection() === pack.id" (click)="setCollection(pack.id)">
              <span class="pack-preview">@if (pack.image) { <img [src]="pack.image" alt="" /> } @else { <span>{{ pack.icon }}</span> }</span>
              <strong>{{ pack.id }}</strong>
            </button>
          }
        </nav>
      }
      @if (categories().length) { <nav class="media-categories" appScroll="x" scrollbar="hover" aria-label="Categories">
        @for (entry of categories(); track entry) {
          <button type="button" [class.active]="category() === entry" [attr.aria-pressed]="category() === entry" (click)="setCategory(entry)">
            {{ categoryLabel(entry) }}
          </button>
        }
      </nav> }
      @if (kind === 'sticker') { <p class="media-guide">Choose a sticker, then tap the canvas to place it. Drag its corner to resize.</p> }
      <div class="media-results" appScroll="y" scrollbar="auto" [class.gif-results]="kind === 'gif'">
        @for (entry of visible(); track entry.id) {
          <button
            type="button"
            class="media-result"
            (click)="choose(entry)"
            [attr.aria-label]="'Place ' + entry.name"
            [attr.title]="entry.name"
          >
            <img
              [src]="previewSrc(entry)"
              [alt]="entry.name"
              [attr.width]="entry.width"
              [attr.height]="entry.height"
              loading="lazy"
              draggable="false"
            /><span>{{ entry.name }}</span>
          </button>
        }
        @if (loading()) { <p class="media-empty">Loading media...</p> }
        @else if (error()) { <p class="media-empty">{{ error() }}</p> }
        @else if (!visible().length) {
          <p class="media-empty">No matches found.</p>
        }
      </div>
      @if (more() && !loading()) { <button class="media-more" type="button" (click)="loadMore()">Load more</button> }
      @if (kind === 'sticker' && collection() !== 'GIPHY') { <p class="sticker-footer">{{ visible().length }} stickers · {{ collection() }}</p> }
      @if (kind === 'gif' || category() === 'GIPHY') { <p class="media-caption">Powered by GIPHY</p> }
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
        width: 380px;
        max-width: calc(100% - 100px);
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
      }
      .sticker-packs { display:flex; flex:none; gap:8px; margin:0 15px 12px; padding:2px 0 5px; overflow-x:auto; }
      .sticker-packs > button { display:flex; flex:1 0 72px; flex-direction:column; align-items:center; gap:6px; min-width:72px; padding:7px 5px; border:1px solid var(--color-border-light); border-radius:10px; background:var(--color-surface); color:var(--color-text-secondary); cursor:pointer; }
      .sticker-packs > button.active { border-color:var(--color-primary); background:var(--color-primary-subtle); color:var(--color-primary); }
      .pack-preview { display:grid; place-items:center; width:48px; height:42px; }
      .pack-preview img { width:100%; height:100%; object-fit:contain; }
      .pack-preview > span { font-size:27px; font-weight:700; }
      .sticker-packs strong { font-size:11px; font-weight:700; }
      .sticker-footer { flex:none; margin:0; padding:10px 15px; border-top:1px solid var(--color-border-light); color:var(--color-text-muted); font-size:11px; }
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
        align-content:start;
        min-height:0;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 7px;
        overflow-x: hidden;
        overflow-y: auto;
        padding: 4px 15px 15px;
      }
      .media-guide { margin:0 15px 8px; color:var(--color-text-muted); font-size:11px; line-height:1.4; }
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
        padding: 8px 5px;
        border: 1px solid var(--color-border-light);
        border-radius: 8px;
        background: var(--color-surface-muted);
        cursor: pointer;
      }
      .media-result:hover,
      .media-result:focus-visible {
        border-color: var(--color-primary);
        background: var(--color-primary-subtle);
      }
      .media-result img {
        width: 100%;
        height: 100px;
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
      .media-more { margin:8px 15px; min-height:36px; border:1px solid var(--color-border); border-radius:7px; background:var(--color-surface); color:var(--color-text-primary); cursor:pointer; }
      @media (max-width: 700px) {
        .media-search { height: 46px; font-size: 16px; }
        .media-picker {
          top: auto;
          right: 0;
          bottom: calc(64px + env(safe-area-inset-bottom));
          left: 0;
          width: 100%;
          max-width:none;
          max-height: min(72vh, 620px);
          max-height: min(74dvh, 680px);
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
export class MediaPicker implements OnInit, OnDestroy {
  private readonly giphy = inject(GiphyService);
  @Input({ required: true }) kind!: 'gif' | 'sticker';
  @Output() closed = new EventEmitter<void>();
  @Output() picked = new EventEmitter<PickedMedia>();
  readonly query = signal('');
  readonly category = signal('Featured');
  readonly collection = signal('Wevi');
  readonly stickerPacks = [
    { id: 'Wevi', image: '/stickers/wevi/wevi_moments/wave.png', icon: '' },
    { id: 'Essentials', image: '/stickers/rough-star.svg', icon: '' },
    { id: 'Recent', image: '', icon: '↶' },
    { id: 'GIPHY', image: '', icon: '▧' },
  ];
  readonly gifs = signal<GifResult[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly more = signal(false);
  private offset = 0;
  private request?: AbortController;
  private debounce?: ReturnType<typeof setTimeout>;
  readonly recent = signal<string[]>([]);
  readonly recentMedia = signal<(GifResult | StickerAsset)[]>([]);
  readonly categories = computed(() =>
    this.kind === 'gif'
      ? ['Trending', 'Recent']
      : this.collection() === 'Wevi' ? ['Wevi', 'Wevi Actions', 'Wevi Moments', 'Canvas Icons', 'Workflow']
      : this.collection() === 'Essentials' ? ['Featured', 'Thread', 'Doodles', 'Arrows', 'Shapes', 'Tape', 'Labels', 'Nature'] : [],
  );
  readonly visible = computed(() => {
    const query = this.query().trim().toLowerCase();
    const available: (GifResult | StickerAsset)[] = this.kind === 'gif' ? this.recentMedia() : [...stickers, ...this.recentMedia()];
    const data: (GifResult | StickerAsset)[] = this.category() === 'Recent'
      ? this.recent().map(id => available.find(entry => entry.id === id)).filter((entry): entry is GifResult | StickerAsset => !!entry)
      : this.kind === 'gif' || this.category() === 'GIPHY' ? this.gifs() : stickers;
    return data.filter((entry) => {
      if (this.kind === 'sticker' && this.collection() === 'Essentials' && ['Wevi Actions', 'Wevi Moments', 'Canvas Icons', 'Workflow'].includes((entry as StickerAsset).category)) return false;
      if (this.category() === 'Recent' && !this.recent().includes(entry.id)) return false;
      if (
        this.kind === 'sticker' &&
        !['Featured', 'Recent', 'GIPHY'].includes(this.category()) &&
        (this.category() === 'Wevi'
          ? !['Wevi Actions', 'Wevi Moments', 'Canvas Icons', 'Workflow'].includes((entry as StickerAsset).category)
          : (entry as StickerAsset).category !== this.category())
      )
        return false;
      return (this.category() !== 'Recent' && (this.kind === 'gif' || this.category() === 'GIPHY')) || !query || `${entry.name} ${entry.keywords.join(' ')}`.toLowerCase().includes(query);
    });
  });
  ngOnInit(): void {
    this.category.set(this.kind === 'gif' ? 'Trending' : 'Wevi');
    try {
      const ids = JSON.parse(localStorage.getItem(`thread-recent-${this.kind}`) || '[]');
      const assets = JSON.parse(localStorage.getItem(`thread-recent-assets-${this.kind}`) || '[]');
      this.recent.set(Array.isArray(ids) ? ids.filter(id => typeof id === 'string').slice(0, 12) : []);
      this.recentMedia.set(Array.isArray(assets) ? assets.filter(entry => entry && typeof entry.id === 'string' && typeof entry.name === 'string' && Array.isArray(entry.keywords) && entry.width > 0 && entry.height > 0 && (typeof entry.src === 'string' || (typeof entry.sourceUrl === 'string' && typeof entry.previewUrl === 'string'))).slice(0, 12) : []);
    } catch {
      this.recent.set([]);
    }
    if (this.kind === 'gif') this.load();
  }
  ngOnDestroy(): void { clearTimeout(this.debounce); this.request?.abort(); }
  search(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.query.set(value);
    if (this.kind === 'gif' || this.category() === 'GIPHY') { clearTimeout(this.debounce); this.debounce = setTimeout(() => this.load(), 300); }
  }
  setCategory(value: string): void {
    clearTimeout(this.debounce);
    this.category.set(value);
    if ((this.kind === 'sticker' && value === 'GIPHY') || (this.kind === 'gif' && value === 'Trending')) this.load();
    else { this.request?.abort(); this.loading.set(false); this.error.set(''); this.more.set(false); }
  }
  setCollection(value: string): void { this.collection.set(value); this.setCategory(value === 'Essentials' ? 'Featured' : value); }
  categoryLabel(value: string): string { return ({ Wevi: 'All', Featured: 'All', 'Wevi Actions': 'Actions', 'Wevi Moments': 'Moments', 'Canvas Icons': 'Canvas' } as Record<string, string>)[value] || value; }
  loadMore(): void { this.load(true); }
  previewSrc(entry: GifResult | StickerAsset): string { return 'previewUrl' in entry ? entry.previewUrl : entry.src; }
  private load(append = false): void {
    this.request?.abort();
    if (!append) { this.gifs.set([]); this.more.set(false); }
    const request = new AbortController(); this.request = request;
    const offset = append ? this.offset : 0;
    this.loading.set(true); this.error.set('');
    void this.giphy.fetch(this.kind, this.query(), offset, request.signal).then(page => {
      if (request.signal.aborted) return;
      this.gifs.set(append ? [...this.gifs(), ...page.results] : page.results);
      this.offset = offset + page.results.length;
      this.more.set(page.more);
    }).catch(error => { if (!request.signal.aborted) this.error.set(error instanceof Error ? error.message : 'Media could not load.'); })
      .finally(() => { if (!request.signal.aborted) this.loading.set(false); });
  }
  choose(entry: GifResult | StickerAsset): void {
    const recent = [entry.id, ...this.recent().filter((id) => id !== entry.id)].slice(0, 12);
    this.recent.set(recent);
    this.recentMedia.set([entry, ...this.recentMedia().filter(asset => asset.id !== entry.id)].slice(0, 12));
    try {
      localStorage.setItem(`thread-recent-${this.kind}`, JSON.stringify(recent));
      localStorage.setItem(`thread-recent-assets-${this.kind}`, JSON.stringify(this.recentMedia()));
    } catch {
      /* storage may be unavailable */
    }
    this.picked.emit({
      kind: this.kind,
      id: entry.id,
      name: entry.name,
      src: 'sourceUrl' in entry ? entry.sourceUrl : entry.src,
      width: entry.width,
      height: entry.height,
    });
  }
}
