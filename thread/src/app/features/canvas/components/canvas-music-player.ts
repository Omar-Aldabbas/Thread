import { Component, OnDestroy, OnInit, signal, viewChild, ElementRef } from '@angular/core';

type Track = { id: string; name: string; blob: Blob; url?: string };

@Component({
  selector: 'app-canvas-music-player',
  standalone: true,
  template: `
    <section class="playlist-player" aria-label="Your music">
      <header><div><strong>Your music</strong><small>Files stay in this browser</small></div>
        <label class="add-music">+ Add files<input type="file" accept="audio/*" multiple (change)="addFiles($event)" /></label>
      </header>
      @if (tracks().length) {
        <div class="now-playing"><span class="cover">♫</span><div><strong>{{ currentTrack()?.name || 'Choose a track' }}</strong><small>{{ tracks().length }} tracks in playlist</small></div></div>
        <audio #player (timeupdate)="syncTime()" (loadedmetadata)="syncTime()" (ended)="onEnded()" (play)="playing.set(true)" (pause)="playing.set(false)"></audio>
        <label class="seek"><span>{{ time(currentTime()) }}</span><input type="range" min="0" [max]="duration() || 1" step="0.1" [value]="currentTime()" (input)="seek($event)" aria-label="Seek track" /><span>{{ time(duration()) }}</span></label>
        <div class="player-controls">
          <button [class.active]="shuffle()" (click)="shuffle.set(!shuffle())" aria-label="Toggle shuffle" title="Shuffle">⇄</button>
          <button (click)="previous()" aria-label="Previous track" title="Previous">⏮</button>
          <button class="play" (click)="toggle()" [attr.aria-label]="playing() ? 'Pause' : 'Play'">{{ playing() ? 'Ⅱ' : '▶' }}</button>
          <button (click)="next()" aria-label="Next track" title="Next">⏭</button>
          <button [class.active]="repeat()" (click)="repeat.set(!repeat())" aria-label="Toggle repeat" title="Repeat">↻</button>
        </div>
        <label class="player-volume">Volume <input type="range" min="0" max="1" step="0.05" [value]="volume()" (input)="setVolume($event)" /></label>
        <div class="track-list" aria-label="Playlist">
          @for (track of tracks(); track track.id; let index = $index) {
            <div class="track" [class.selected]="currentId() === track.id">
              <button (click)="select(index)" [attr.aria-label]="'Play ' + track.name"><span>{{ index + 1 }}</span>{{ track.name }}</button>
              <button class="remove" (click)="remove(track.id)" [attr.aria-label]="'Remove ' + track.name" title="Remove">×</button>
            </div>
          }
        </div>
      } @else { <p class="empty">Add music or sound files to make a playlist.</p> }
      @if (error()) { <p class="error" role="status">{{ error() }}</p> }
    </section>
  `,
  styles: [`
    .playlist-player{padding:14px 16px;border-top:1px solid var(--color-border-light);font-size:11px}
    header,.now-playing,.player-controls,.seek,.player-volume,.track{display:flex;align-items:center}
    header{justify-content:space-between;gap:8px} header strong,.now-playing strong{display:block;font-size:12px} header small,.now-playing small{display:block;color:var(--color-text-muted);font-size:10px;margin-top:3px}
    .add-music{padding:7px 9px;border-radius:7px;background:var(--color-primary-subtle);color:var(--color-primary);font-weight:700;cursor:pointer;white-space:nowrap}.add-music input{display:none}
    .now-playing{gap:9px;margin:13px 0 8px;min-width:0}.now-playing>div{min-width:0}.now-playing strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.cover{display:grid;place-items:center;width:34px;height:34px;flex:none;border-radius:8px;background:var(--color-primary-subtle);color:var(--color-primary);font-size:20px}
    .seek{gap:7px;color:var(--color-text-muted);font-variant-numeric:tabular-nums;font-size:10px}.seek input,.player-volume input{flex:1;min-width:0;accent-color:var(--color-primary)}
    .player-controls{justify-content:center;gap:13px;margin:9px 0}.player-controls button{width:26px;height:26px;border:0;background:none;color:var(--color-text-secondary);cursor:pointer;font-size:17px}.player-controls button.active{color:var(--color-primary)}.player-controls .play{width:34px;height:34px;border-radius:50%;background:var(--color-primary);color:white}
    .player-volume{gap:8px;color:var(--color-text-muted);font-size:10px}.track-list{max-height:160px;overflow:auto;margin-top:10px}.track{border-radius:6px}.track.selected{background:var(--color-primary-subtle)}.track button{border:0;background:none;color:var(--color-text-secondary);cursor:pointer}.track button:first-child{display:flex;align-items:center;gap:9px;min-width:0;flex:1;padding:7px;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.track span{color:var(--color-text-muted)}.track .remove{font-size:18px;padding:3px 8px}.empty,.error{color:var(--color-text-muted);font-size:10px;line-height:1.4}.error{color:var(--color-primary)}
  `],
})
export class CanvasMusicPlayer implements OnInit, OnDestroy {
  readonly player = viewChild<ElementRef<HTMLAudioElement>>('player');
  readonly tracks = signal<Track[]>([]);
  readonly currentId = signal('');
  readonly currentTime = signal(0);
  readonly duration = signal(0);
  readonly playing = signal(false);
  readonly shuffle = signal(false);
  readonly repeat = signal(false);
  readonly volume = signal(0.7);
  readonly error = signal('');
  private database: IDBDatabase | null = null;
  currentTrack(): Track | undefined { return this.tracks().find(track => track.id === this.currentId()); }
  async ngOnInit(): Promise<void> {
    try {
      const request = indexedDB.open('thread-music', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('tracks', { keyPath: 'id' });
      this.database = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
      const tx = this.database.transaction('tracks', 'readonly');
      const read = tx.objectStore('tracks').getAll();
      const tracks = await new Promise<Track[]>((resolve, reject) => { read.onsuccess = () => resolve(read.result); read.onerror = () => reject(read.error); });
      this.tracks.set(tracks.map(track => ({ ...track, url: URL.createObjectURL(track.blob) })));
      if (tracks.length) this.currentId.set(tracks[0].id);
    } catch { this.error.set('Music storage is unavailable in this browser.'); }
  }
  ngOnDestroy(): void { this.player()?.nativeElement.pause(); this.tracks().forEach(track => { if (track.url) URL.revokeObjectURL(track.url); }); this.database?.close(); }
  async addFiles(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files || []).filter(file => file.type.startsWith('audio/'));
    input.value = '';
    if (!files.length) return;
    const added = files.map(file => ({ id: crypto.randomUUID(), name: file.name.replace(/\.[^.]+$/, ''), blob: file, url: URL.createObjectURL(file) }));
    this.tracks.update(tracks => [...tracks, ...added]);
    if (!this.currentId()) this.currentId.set(added[0].id);
    try {
      if (!this.database) throw new Error('Storage unavailable');
      const tx = this.database.transaction('tracks', 'readwrite');
      added.forEach(({ id, name, blob }) => tx.objectStore('tracks').put({ id, name, blob }));
      await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
      this.error.set('');
    } catch { this.error.set('Files can play now, but could not be saved for next time.'); }
  }
  private async playCurrent(): Promise<void> {
    const audio = this.player()?.nativeElement;
    const track = this.currentTrack();
    if (!audio || !track?.url) return;
    if (audio.src !== track.url) audio.src = track.url;
    audio.volume = this.volume();
    try { await audio.play(); this.error.set(''); } catch { this.error.set('This audio file could not be played.'); }
  }
  toggle(): void { const audio = this.player()?.nativeElement; if (!audio) return; if (audio.paused) void this.playCurrent(); else audio.pause(); }
  select(index: number): void { const track = this.tracks()[index]; if (!track) return; this.currentId.set(track.id); void this.playCurrent(); }
  next(): void { const tracks = this.tracks(); if (!tracks.length) return; const current = tracks.findIndex(t => t.id === this.currentId()); const index = this.shuffle() && tracks.length > 1 ? (current + 1 + Math.floor(Math.random() * (tracks.length - 1))) % tracks.length : (current + 1) % tracks.length; this.select(index); }
  previous(): void { const audio = this.player()?.nativeElement; if (audio && audio.currentTime > 3) { audio.currentTime = 0; return; } const tracks = this.tracks(); if (tracks.length) this.select((tracks.findIndex(t => t.id === this.currentId()) - 1 + tracks.length) % tracks.length); }
  onEnded(): void { if (this.repeat()) { const audio = this.player()?.nativeElement; if (audio) { audio.currentTime = 0; void audio.play(); } } else this.next(); }
  syncTime(): void { const audio = this.player()?.nativeElement; if (audio) { this.currentTime.set(audio.currentTime || 0); this.duration.set(Number.isFinite(audio.duration) ? audio.duration : 0); } }
  seek(event: Event): void { const audio = this.player()?.nativeElement; if (audio) audio.currentTime = Number((event.target as HTMLInputElement).value); }
  setVolume(event: Event): void { const value = Number((event.target as HTMLInputElement).value); this.volume.set(value); const audio = this.player()?.nativeElement; if (audio) audio.volume = value; }
  remove(id: string): void {
    const track = this.tracks().find(item => item.id === id);
    if (!track) return;
    const wasCurrent = this.currentId() === id;
    if (wasCurrent) { this.player()?.nativeElement.pause(); this.player()?.nativeElement.removeAttribute('src'); }
    this.tracks.update(tracks => tracks.filter(item => item.id !== id));
    if (wasCurrent) { this.currentId.set(this.tracks()[0]?.id || ''); this.currentTime.set(0); this.duration.set(0); }
    if (track.url) URL.revokeObjectURL(track.url);
    try { this.database?.transaction('tracks', 'readwrite').objectStore('tracks').delete(id); } catch { this.error.set('Could not remove this track from storage.'); }
  }
  time(seconds: number): string { return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`; }
}
