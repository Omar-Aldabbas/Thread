import { Component, input, output } from '@angular/core';
import type { ItemType } from '../canvas.model';
import type { Tool } from '../pages/canvas-page/canvas-page.types';

@Component({
  selector: 'app-canvas-tool-rail',
  template: `
    <nav class="tool-rail" data-ui aria-label="Canvas tools">
      <button type="button" [class.active]="tool() === 'select' && !pendingType()" [attr.aria-pressed]="tool() === 'select' && !pendingType()" (click)="toolChange.emit('select')" aria-label="Select" title="Select (V): select, edit, and move objects" data-shortcut="V">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 3 13 9-6 1.3L9 20 5 3Z" /></svg><small>Select</small>
      </button>
      <span class="divider" aria-hidden="true"></span>
      <button type="button" [class.active]="tool() === 'hand'" [attr.aria-pressed]="tool() === 'hand'" (click)="toolChange.emit('hand')" aria-label="Pan board" title="Pan (H): move the board. Hold Space for temporary pan." data-shortcut="H">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 12V8a1.5 1.5 0 0 1 3 0v3-6a1.5 1.5 0 0 1 3 0v6-4a1.5 1.5 0 0 1 3 0v4-2a1.5 1.5 0 0 1 3 0v6c0 3-2 5-5 5h-3c-2 0-3-1-4-2l-3-4a1.6 1.6 0 0 1 2.5-2L7 13" /></svg><small>Pan</small>
      </button>
      <span class="divider" aria-hidden="true"></span>
      <button type="button" [class.active]="paletteOpen() || (!!pendingType() && tool() !== 'system')" [attr.aria-pressed]="paletteOpen() || (!!pendingType() && tool() !== 'system')" (click)="toolChange.emit('add')" aria-label="Add content" title="Add content (N)" data-shortcut="N">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v16M4 12h16" /></svg><small>Add</small>
      </button>
      <button type="button" [class.active]="tool() === 'sketch' || tool() === 'shape' || tool() === 'connect' || tool() === 'text' || tool() === 'system'" [attr.aria-pressed]="tool() === 'sketch' || tool() === 'shape' || tool() === 'connect' || tool() === 'text' || tool() === 'system'" (click)="toolChange.emit('sketch')" aria-label="Sketch" title="Sketch (P)" data-shortcut="P">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 20 4.5-1 11-11a2 2 0 0 0-3-3l-11 11L4 20ZM14 7l3 3" /></svg><small>Sketch</small>
      </button>
    </nav>
  `,
  styles: [`
    :host { position:absolute; z-index:30; top:50%; left:20px; transform:translateY(-50%); }
    .tool-rail { display:flex; flex-direction:column; gap:4px; padding:6px; border:1px solid var(--color-border); border-radius:var(--radius-md); background:var(--color-surface); box-shadow:var(--shadow-md); }
    button { position:relative; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:3px; width:48px; height:48px; padding:0; border:0; border-radius:var(--radius-sm); background:transparent; color:var(--color-text-primary); cursor:pointer; }
    button:hover { background:var(--color-primary-subtle); color:var(--color-primary); }
    button.active { background:var(--color-primary); color:var(--color-text-inverse); }
    button:focus-visible { outline:2px solid var(--color-primary); outline-offset:2px; }
    button svg { width:19px; height:19px; fill:none; stroke:currentColor; stroke-width:1.8; stroke-linecap:round; stroke-linejoin:round; }
    button small { font-size:9px; font-weight:650; line-height:1; }
    .divider { width:70%; height:1px; margin:2px auto; background:var(--color-border-light); }
    @media(max-width:700px) {
      :host { top:auto; right:0; bottom:0; left:0; transform:none; }
      .tool-rail { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:0; padding:5px 8px calc(5px + env(safe-area-inset-bottom)); border:0; border-top:1px solid var(--color-border); border-radius:0; }
      button { width:100%; height:53px; }
      button small { font-size:10px; }
      .divider { display:none; }
    }
  `],
})
export class CanvasToolRail {
  readonly tool = input.required<Tool>();
  readonly pendingType = input<ItemType | null>(null);
  readonly paletteOpen = input(false);
  readonly toolChange = output<Tool>();
}
