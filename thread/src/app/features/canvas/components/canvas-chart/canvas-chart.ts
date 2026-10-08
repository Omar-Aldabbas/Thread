import { Component, Input, signal } from '@angular/core';
import { CanvasItem } from '../../canvas.model';
import { ThreadOption, ThreadSelect } from '../../../../shared/controls/thread-controls';
import { ThreadChart } from '../thread-chart';
import type { CanvasPage } from '../../pages/canvas-page/canvas-page';

@Component({
  selector: 'app-canvas-chart',
  standalone: true,
  imports: [ThreadOption, ThreadSelect, ThreadChart],
  host: { '[class.menu-open]': 'menuOpen()' },
  templateUrl: './canvas-chart.html',
  styleUrl: './canvas-chart.css',
})
export class CanvasChart {
  @Input({ required: true }) item!: CanvasItem;
  @Input({ required: true }) page!: CanvasPage;
  readonly menuOpen = signal(false);
}
