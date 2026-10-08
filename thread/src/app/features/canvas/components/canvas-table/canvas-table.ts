import { Component, Input, signal } from '@angular/core';
import { CanvasItem } from '../../canvas.model';
import { ScrollDirective } from '../../../../shared/scroll.directive';
import {
  ThreadCheckbox,
  ThreadOption,
  ThreadSelect,
} from '../../../../shared/controls/thread-controls';
import type { CanvasPage } from '../../pages/canvas-page/canvas-page';

@Component({
  selector: 'app-canvas-table',
  standalone: true,
  imports: [ScrollDirective, ThreadCheckbox, ThreadOption, ThreadSelect],
  templateUrl: './canvas-table.html',
  styleUrl: './canvas-table.css',
})
export class CanvasTable {
  @Input({ required: true }) item!: CanvasItem;
  @Input({ required: true }) page!: CanvasPage;
  readonly activeColumnId = signal<string | null>(null);

  toggleColumnMenu(columnId: string): void {
    this.activeColumnId.update((current) => (current === columnId ? null : columnId));
  }
}
