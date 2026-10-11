import { Component, input, output } from '@angular/core';

@Component({
  selector: 'app-canvas-zoom-controls',
  template: `
    <div class="zoom-controls" data-ui role="group" aria-label="Canvas zoom">
      <button type="button" (click)="zoomChange.emit(0.8)" aria-label="Zoom out" title="Zoom out">−</button>
      <button class="zoom-value" type="button" (click)="fit.emit()" aria-label="Fit canvas to view" title="Fit canvas to view">{{ label() }}</button>
      <button type="button" (click)="zoomChange.emit(1.25)" aria-label="Zoom in" title="Zoom in">+</button>
      <span aria-hidden="true"></span>
      <button type="button" (click)="fit.emit()" aria-label="Fit all" title="Fit all">⛶</button>
    </div>
  `,
  styles: [`
    :host { position:absolute; right:18px; bottom:18px; z-index:25; }
    .zoom-controls { display:flex; align-items:center; gap:2px; padding:5px; border:1px solid var(--color-border); border-radius:10px; background:var(--color-surface); box-shadow:var(--shadow-sm); }
    button { display:grid; place-items:center; min-width:32px; height:32px; padding:0 6px; border:0; border-radius:6px; background:transparent; color:var(--color-text-secondary); font-size:17px; cursor:pointer; }
    button:hover,button:focus-visible { outline:none; background:var(--color-primary-subtle); color:var(--color-primary); }
    .zoom-value { min-width:48px; font-size:11px; font-weight:750; font-variant-numeric:tabular-nums; }
    span { width:1px; height:20px; margin:0 3px; background:var(--color-border-light); }
    @media(max-width:700px) { :host { top:64px; right:8px; bottom:auto; } }
  `],
})
export class CanvasZoomControls {
  readonly label = input.required<string>();
  readonly zoomChange = output<number>();
  readonly fit = output<void>();
}
