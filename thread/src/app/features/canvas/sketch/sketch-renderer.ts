import { Component, Input, OnChanges } from '@angular/core';
import { CanvasItem, SketchStroke } from '../canvas.model';
import { strokeCenterPath, strokeOutlinePath } from './sketch-geometry';

interface RenderedStroke { id: string; brush: SketchStroke['brush']; outline: string; center: string; color: string; opacity: number; size: number }

@Component({
  selector: 'app-sketch-renderer',
  standalone: true,
  template: `
    <svg class="sketch-object" [attr.viewBox]="'0 0 ' + (item.sourceWidth || item.width) + ' ' + (item.sourceHeight || item.height)" preserveAspectRatio="none" aria-label="Sketch">
      <defs><filter [attr.id]="'neon-' + item.id" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="6" /></filter></defs>
      @for (stroke of rendered; track stroke.id) {
        @if (stroke.brush === 'neon') {
          <path [attr.d]="stroke.outline" [attr.fill]="stroke.color" opacity=".85" [attr.filter]="'url(#neon-' + item.id + ')'" />
          <path [attr.d]="stroke.outline" [attr.fill]="stroke.color" opacity=".75" />
          <path [attr.d]="stroke.center" fill="none" stroke="white" [attr.stroke-width]="Math.max(1, stroke.size * .22)" stroke-linecap="round" stroke-linejoin="round" opacity=".85" />
        } @else { <path [attr.d]="stroke.outline" [attr.fill]="stroke.color" [attr.fill-opacity]="stroke.opacity" /> }
      }
    </svg>
  `,
  styles: [`:host { display:block; width:100%; height:100%; overflow:visible; pointer-events:none; } .sketch-object { display:block; width:100%; height:100%; overflow:visible; }`],
})
export class SketchRenderer implements OnChanges {
  @Input({ required: true }) item!: CanvasItem;
  readonly Math = Math;
  rendered: RenderedStroke[] = [];
  ngOnChanges(): void {
    const strokes = this.item.sketchStrokes || (this.item.strokes || []).map((points, index): SketchStroke => ({ id: `${this.item.id}-${index}`, brush: 'pen', points: points.map(point => ({ x: point.x, y: point.y, pressure: point.pressure ?? .5 })), color: this.item.accent || '#d4111c', size: this.item.strokeWidth || 3, opacity: this.item.strokeOpacity || 1 }));
    this.rendered = strokes.map(stroke => ({ id: stroke.id, brush: stroke.brush, outline: strokeOutlinePath(stroke), center: strokeCenterPath(stroke.points), color: stroke.color, opacity: stroke.opacity, size: stroke.size }));
  }
}
