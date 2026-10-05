import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ThreadCheckbox } from '../../../shared/controls/thread-controls';
import { CanvasItem } from '../canvas.model';

@Component({
  selector: 'app-canvas-card',
  standalone: true,
  imports: [ThreadCheckbox],
  template: `
    <div
      class="h-full w-full overflow-hidden rounded-[6px] border border-[var(--color-border)] bg-[var(--color-surface)]"
      [class.!bg-[var(--color-primary-subtle)]]="item.type === 'note'"
    >
      @if (item.type === 'image' && item.image) {
        <img
          class="h-[65%] w-full object-cover"
          [src]="item.image"
          [alt]="item.title"
          draggable="false"
        />
        <div class="px-4 py-3">
          <h3 class="m-0 text-[15px] font-semibold">{{ item.title }}</h3>
          <p class="mt-1 line-clamp-1 text-xs text-stone-500">{{ item.body }}</p>
        </div>
      } @else {
        <div class="flex h-full flex-col p-4">
          <div
            class="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[.12em] text-stone-500"
          >
            <span
              class="h-2 w-2 rounded-full"
              [style.background]="item.accent || 'var(--color-text-muted)'"
            ></span>
            {{ label }}
            @if (item.type === 'task' && item.priority) {
              <span
                class="ml-auto rounded-full bg-orange-50 px-2 py-1 text-[10px] text-orange-700"
                >{{ item.priority }}</span
              >
            }
          </div>
          <h3
            class="m-0 text-[16px] font-semibold leading-tight tracking-[-.02em] text-[var(--color-text-primary)]"
          >
            {{ item.title }}
          </h3>
          @if (item.type === 'note' || item.type === 'task' || item.type === 'link') {
            @if (item.bodyHtml) {
              <div
                class="rich-content mt-2 overflow-auto text-[13px] leading-[1.55] text-[var(--color-text-secondary)]"
                [innerHTML]="item.bodyHtml"
              ></div>
            } @else {
              <p
                class="mt-2 line-clamp-5 whitespace-pre-line text-[13px] leading-[1.55] text-[var(--color-text-secondary)]"
              >
                {{ item.body }}
              </p>
            }
          }
          @if (item.type === 'task') {
            <div class="mt-auto flex items-center gap-2 pt-3 text-xs text-stone-500">
              <thread-checkbox

                [checked]="item.completed"
                (change)="toggleTask.emit()"
                (pointerdown)="$event.stopPropagation()"
                aria-label="Complete task"
              ></thread-checkbox>
              {{ item.due || 'No due date' }}
            </div>
          }
          @if (item.type === 'checklist') {
            <div class="mt-3 space-y-2 overflow-auto">
              @for (entry of item.checklist || []; track $index) {
                <label class="flex items-start gap-2 text-[12px] text-stone-600"
                  ><thread-checkbox

                    class="mt-[2px]"
                    [checked]="entry.completed"
                    (change)="toggleChecklist.emit($index)"
                    (pointerdown)="$event.stopPropagation()"
                  ></thread-checkbox><span [class.line-through]="entry.completed">{{ entry.label }}</span></label
                >
              }
            </div>
          }
          @if (item.type === 'file') {
            <div class="mt-4 flex items-center gap-3 rounded-xl bg-stone-50 p-3">
              <span
                class="rounded-lg bg-[var(--color-primary-subtle)] px-2 py-3 text-[10px] font-bold text-[var(--color-primary)]"
                >PDF</span
              >
              <div class="min-w-0">
                <div class="truncate text-xs font-medium">
                  {{ item.filename || 'Document.pdf' }}
                </div>
                <div class="mt-1 text-[11px] text-stone-400">{{ item.body }}</div>
              </div>
            </div>
          }
          @if (item.type === 'link') {
            <a
              class="mt-auto truncate pt-2 text-[11px] text-[var(--color-primary)] underline"
              [href]="item.url"
              target="_blank"
              rel="noopener noreferrer"
              (pointerdown)="$event.stopPropagation()"
              >{{ item.url }}</a
            >
          }
          @if (item.type === 'table') {
            <div class="mt-3 overflow-hidden rounded-lg border border-stone-200 text-xs">
              <div class="grid grid-cols-2 bg-stone-50 px-3 py-2 font-semibold">
                <span>Milestone</span><span>When</span>
              </div>
              @for (row of tableRows; track $index) {
                <div class="grid grid-cols-2 border-t border-stone-100 px-3 py-2">
                  <span>{{ row[0] }}</span
                  ><span class="text-stone-500">{{ row[1] }}</span>
                </div>
              }
            </div>
          }
          @if (item.type === 'budget') {
            <div class="mt-3 space-y-2 text-xs">
              @for (row of item.rows || []; track $index) {
                <div class="flex justify-between text-stone-600">
                  <span>{{ row.label }}</span
                  ><span>{{ '$' }}{{ row.value }}</span>
                </div>
              }
              <div class="flex justify-between border-t border-stone-200 pt-2 font-semibold">
                <span>Total</span><span>{{ '$' }}{{ budgetTotal }}</span>
              </div>
            </div>
          }
          @if (item.type === 'voice') {
            <div class="mt-auto flex items-center gap-3 rounded-xl bg-stone-50 p-3 text-xs">
              <span class="text-lg">▶</span
              ><span class="tracking-[.16em] text-[var(--color-primary)]">▂▄▆▃▅▇▄▂▆▃▅</span
              ><span class="ml-auto">{{ item.duration || '0:42' }}</span>
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class CanvasCard {
  @Input({ required: true }) item!: CanvasItem;
  @Output() toggleTask = new EventEmitter<void>();
  @Output() toggleChecklist = new EventEmitter<number>();

  get label(): string {
    return this.item.type === 'voice' ? 'Voice note' : this.item.type;
  }
  get budgetTotal(): number {
    return (this.item.rows || []).reduce((sum, row) => sum + row.value, 0);
  }
  get tableRows(): string[][] {
    return (this.item.body || '')
      .split('\n')
      .filter(Boolean)
      .map((row) => row.split('|'));
  }
}
