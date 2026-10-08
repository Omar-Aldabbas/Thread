import { Component, Input } from '@angular/core';
import { CanvasItem } from '../../canvas.model';
import { ScrollDirective } from '../../../../shared/scroll.directive';
import { ThreadOption, ThreadSelect } from '../../../../shared/controls/thread-controls';
import type { CanvasPage } from '../../pages/canvas-page/canvas-page';

@Component({
  selector: 'app-canvas-budget',
  standalone: true,
  imports: [ScrollDirective, ThreadOption, ThreadSelect],
  templateUrl: './canvas-budget.html',
  styleUrl: './canvas-budget.css',
})
export class CanvasBudget {
  @Input({ required: true }) item!: CanvasItem;
  @Input({ required: true }) page!: CanvasPage;
}
