import { Component, input, output, signal } from '@angular/core';
import { LucideSearch, LucideX, LucideUndo2, LucideRedo2 } from '@lucide/angular';
import { ThreadHeader } from '../../../shared/thread-header';

@Component({
  selector: 'app-canvas-navigation',
  imports: [ThreadHeader, LucideSearch, LucideX, LucideUndo2, LucideRedo2],
  template: `
    <app-thread-header [title]="title()">
      <label class="canvas-search">
        <svg lucideSearch aria-hidden="true"></svg>
        <input type="search" aria-label="Search canvas" placeholder="Find on canvas" [value]="query()" (input)="queryChange.emit($any($event.target).value)" (keydown.enter)="nextMatch.emit()" />
        @if (query()) { <button type="button" (click)="queryChange.emit('')" aria-label="Clear search"><svg lucideX aria-hidden="true"></svg></button> }
      </label>
      <button class="nav-action mobile-search" type="button" (click)="searchOpen.set(!searchOpen())" [attr.aria-expanded]="searchOpen()" aria-label="Search canvas" title="Search canvas">
        <svg lucideSearch aria-hidden="true"></svg>
      </button>
      <span class="nav-separator" aria-hidden="true"></span>
      <button class="nav-action" type="button" (click)="undo.emit()" aria-label="Undo" title="Undo (Ctrl+Z)">
        <svg lucideUndo2 aria-hidden="true"></svg>
      </button>
      <button class="nav-action" type="button" (click)="redo.emit()" aria-label="Redo" title="Redo (Ctrl+Shift+Z)">
        <svg lucideRedo2 aria-hidden="true"></svg>
      </button>
    </app-thread-header>
    @if (searchOpen()) {
      <div class="mobile-search-panel" data-ui>
        <input type="search" autofocus aria-label="Search canvas" placeholder="Find an item on this canvas" [value]="query()" (input)="queryChange.emit($any($event.target).value)" (keydown.enter)="nextMatch.emit()" />
        <button type="button" (click)="queryChange.emit(''); searchOpen.set(false)" aria-label="Close and clear search"><svg lucideX aria-hidden="true"></svg></button>
      </div>
    }
  `,
  styles: [`
    :host { display:block; position:relative; z-index:200; flex:none; }
    button { cursor:pointer; }
    .canvas-search { display:flex; align-items:center; gap:8px; width:clamp(160px,20vw,260px); height:36px; padding:0 10px; border:1px solid var(--color-border); border-radius:10px; background:var(--color-background); color:var(--color-text-secondary); transition:border-color 160ms ease,box-shadow 160ms ease; }
    .canvas-search:focus-within { border-color:var(--color-primary); box-shadow:0 0 0 3px var(--color-primary-subtle); }
    .canvas-search svg,.nav-action svg { width:18px; height:18px; flex:none; fill:none; stroke:currentColor; stroke-width:1.8; stroke-linecap:round; stroke-linejoin:round; }
    .canvas-search input { width:100%; min-width:0; border:0; outline:0; background:transparent; color:var(--color-text-primary); font-size:12px; }
    .canvas-search input::placeholder { color:var(--color-text-muted); }
    .canvas-search input::-webkit-search-cancel-button,.mobile-search-panel input::-webkit-search-cancel-button { display:none; }
    .canvas-search > button { border:0; background:transparent; color:var(--color-text-secondary); font-size:19px; line-height:1; }
    .nav-action { display:grid; place-items:center; flex:none; width:36px; height:36px; border:1px solid transparent; border-radius:9px; background:transparent; color:var(--color-text-secondary); }
    .nav-action:hover,.nav-action:focus-visible { border-color:var(--color-border-light); outline:none; background:var(--color-primary-subtle); color:var(--color-primary); }
    .nav-separator { width:1px; height:22px; margin:0 3px; background:var(--color-border); }
    .mobile-search { display:none; }
    .mobile-search-panel { position:absolute; top:100%; right:10px; left:10px; display:flex; gap:8px; padding:8px; border:1px solid var(--color-border); border-radius:0 0 12px 12px; background:var(--color-surface); box-shadow:var(--shadow-md); }
    .mobile-search-panel input { flex:1; min-width:0; height:40px; padding:0 10px; border:1px solid var(--color-border); border-radius:7px; outline:none; background:var(--color-background); color:var(--color-text-primary); font-size:16px; }
    .mobile-search-panel input:focus { border-color:var(--color-primary); }
    .mobile-search-panel button { width:40px; border:0; background:transparent; color:var(--color-text-secondary); font-size:24px; }
    @media(max-width:960px) { .canvas-search { display:none; } .mobile-search { display:grid; } }
    @media(max-width:700px) { .nav-action { width:33px; height:33px; } .nav-separator { margin:0 1px; } }
  `],
})
export class CanvasNavigation {
  readonly title = input('');
  readonly query = input('');
  readonly queryChange = output<string>();
  readonly nextMatch = output<void>();
  readonly undo = output<void>();
  readonly redo = output<void>();
  readonly searchOpen = signal(false);
}
