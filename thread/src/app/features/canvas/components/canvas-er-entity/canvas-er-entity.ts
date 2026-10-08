import { Component, Input } from '@angular/core';
import { CanvasItem } from '../../canvas.model';
import { ScrollDirective } from '../../../../shared/scroll.directive';
import { ThreadOption, ThreadSelect } from '../../../../shared/controls/thread-controls';
import type { CanvasPage } from '../../pages/canvas-page/canvas-page';

@Component({
  selector: 'app-canvas-er-entity',
  standalone: true,
  imports: [ScrollDirective, ThreadOption, ThreadSelect],
  templateUrl: './canvas-er-entity.html',
  styleUrl: './canvas-er-entity.css',
})
export class CanvasErEntity {
  @Input({ required: true }) item!: CanvasItem;
  @Input({ required: true }) page!: CanvasPage;
}
