import { Component, Input, signal } from '@angular/core';
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
  readonly settingsOpen = signal(false);
  readonly periodMenuOpen = signal(false);
  readonly rowMenu = signal<{ rowId: string; group: string } | null>(null);
  readonly groupMenu = signal<string | null>(null);

  toggleSettings(): void {
    this.periodMenuOpen.set(false);
    this.rowMenu.set(null);
    this.groupMenu.set(null);
    this.settingsOpen.update((open) => !open);
  }

  toggleRowMenu(rowId: string, group: string): void {
    this.settingsOpen.set(false);
    this.periodMenuOpen.set(false);
    this.groupMenu.set(null);
    this.rowMenu.update((current) => current?.rowId === rowId ? null : { rowId, group });
  }
  toggleGroupMenu(group: string): void {
    this.settingsOpen.set(false);
    this.periodMenuOpen.set(false);
    this.rowMenu.set(null);
    this.groupMenu.update((current) => current === group ? null : group);
  }
  togglePeriodMenu(): void {
    this.settingsOpen.set(false);
    this.rowMenu.set(null);
    this.groupMenu.set(null);
    this.periodMenuOpen.update((open) => !open);
  }
}
