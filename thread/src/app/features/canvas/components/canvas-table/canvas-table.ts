import { Component, Input, signal } from '@angular/core';
import { CanvasItem, ThreadDataset } from '../../canvas.model';
import { ScrollDirective } from '../../../../shared/scroll.directive';
import { ThreadOption, ThreadSelect } from '../../../../shared/controls/thread-controls';
import type { CanvasPage } from '../../pages/canvas-page/canvas-page';

@Component({
  selector: 'app-canvas-table',
  standalone: true,
  imports: [ScrollDirective, ThreadOption, ThreadSelect],
  host: { '[class.menu-open]': 'activeColumnId() !== null || activeAddMenu() !== null' },
  templateUrl: './canvas-table.html',
  styleUrl: './canvas-table.css',
})
export class CanvasTable {
  @Input({ required: true }) item!: CanvasItem;
  @Input({ required: true }) page!: CanvasPage;
  readonly activeColumnId = signal<string | null>(null);
  readonly activeAddMenu = signal<'column' | 'calculation' | null>(null);

  toggleAddMenu(menu: 'column' | 'calculation'): void {
    this.activeColumnId.set(null);
    this.activeAddMenu.update((current) => current === menu ? null : menu);
  }

  focusCell(event: MouseEvent): void {
    if (event.target instanceof HTMLInputElement) return;
    (event.currentTarget as HTMLElement)
      .querySelector<HTMLElement>('[data-table-cell]')
      ?.focus();
  }

  toggleColumnMenu(columnId: string): void {
    this.activeAddMenu.set(null);
    this.activeColumnId.update((current) => (current === columnId ? null : columnId));
  }

  tableWidth(data: ThreadDataset): number {
    return this.page
      .tableViewColumns(this.item, data)
      .reduce(
        (width, column) => width + Math.max(90, this.item.tableColumnWidths?.[column.id] || 120),
        32,
      );
  }
}
