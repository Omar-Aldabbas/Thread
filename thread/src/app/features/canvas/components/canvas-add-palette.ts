import { Component, output } from '@angular/core';
import type { ItemType } from '../canvas.model';

@Component({
  selector: 'app-canvas-add-palette',
  template: `
    <button
      class="palette-backdrop"
      type="button"
      (click)="close.emit()"
      aria-label="Close add menu"
    ></button>
    <section class="create-palette" data-ui aria-label="Add to canvas">
      <button
        class="palette-close"
        type="button"
        (click)="close.emit()"
        aria-label="Close add menu"
      >
        ×
      </button>
      <div class="palette-section">Quick</div>
      <div class="palette-grid">
        @for (entry of quick; track entry.type) {
          <button type="button" (click)="chooseType.emit(entry.type)">
            <span aria-hidden="true">{{ entry.icon }}</span
            >{{ entry.label }}
          </button>
        }
      </div>
      <div class="palette-section">Media</div>
      <button class="palette-media" type="button" (click)="openFiles.emit()">
        <span aria-hidden="true">＋</span>Add media<small>Image · audio · video · document</small>
      </button>
      <button class="palette-media" type="button" (click)="recordVoice.emit()">
        <span aria-hidden="true">●</span>Record voice<small>Start a microphone recording</small>
      </button>
      <div class="palette-grid secondary-media">
        <button type="button" (click)="openMedia.emit('gif')">
          <span aria-hidden="true">▣</span>GIF
        </button>
        <button type="button" (click)="openMedia.emit('sticker')">
          <span aria-hidden="true">✳</span>Sticker
        </button>
        <button type="button" (click)="chooseType.emit('link')">
          <span aria-hidden="true">↗</span>Link
        </button>
      </div>
      <div class="palette-section">Organize</div>
      <div class="palette-grid">
        @for (entry of organize; track entry.type) {
          <button type="button" (click)="chooseType.emit(entry.type)">
            <span aria-hidden="true">{{ entry.icon }}</span
            >{{ entry.label }}
          </button>
        }
      </div>
      <button class="palette-feature" type="button" (click)="sketch.emit()">
        <span aria-hidden="true">✎</span>Sketch directly on canvas
      </button>
      <button class="palette-feature" type="button" (click)="erStarter.emit()">
        <span aria-hidden="true">◇</span
        ><span
          ><strong>ER diagram starter</strong
          ><small>Two linked entities with example keys</small></span
        >
      </button>
    </section>
  `,
  styles: [
    `
      :host {
        position: absolute;
        z-index: 35;
        top: 50%;
        left: 82px;
        width: 260px;
        max-height: min(78vh, 680px);
        transform: translateY(-50%);
      }
      .create-palette {
        width: 100%;
        max-height: inherit;
        padding: 14px;
        overflow-x: hidden;
        overflow-y: auto;
        border: 1px solid var(--color-border);
        border-radius: 12px;
        background: var(--color-surface);
        box-shadow: var(--shadow-md);
      }
      button {
        border: 0;
        background: transparent;
        color: var(--color-text-primary);
        cursor: pointer;
      }
      button:focus-visible {
        outline: 2px solid var(--color-primary);
        outline-offset: 2px;
      }
      .palette-title {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 2px 2px 7px;
        font-size: 13px;
      }
      .palette-title button {
        width: 28px;
        height: 28px;
        border-radius: 6px;
        color: var(--color-text-secondary);
        font-size: 22px;
        line-height: 1;
      }
      .palette-title button:hover {
        background: var(--color-surface-muted);
      }
      .palette-section {
        margin: 9px 2px 5px;
        padding-top: 9px;
        border-top: 1px solid var(--color-border-light);
        color: var(--color-text-muted);
        font-size: 10px;
        font-weight: 800;
        letter-spacing: 0.1em;
        text-transform: uppercase;
      }
      .palette-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 4px;
      }
      .palette-grid button {
        display: flex;
        align-items: center;
        gap: 8px;
        min-height: 39px;
        padding: 7px;
        border-radius: 0px;
        text-align: left;
        font-size: 12px;
      }
      .palette-grid button:hover,
      .palette-feature:hover {
        background: var(--color-primary-subtle);
        color: var(--color-primary);
      }
      .palette-grid button span {
        width: 19px;
        flex: none;
        color: var(--color-primary);
        text-align: center;
        font-size: 16px;
      }
      .palette-media {
        display: grid;
        grid-template-columns: 30px minmax(0, 1fr);
        grid-template-rows: auto auto;
        align-items: center;
        column-gap: 9px;
        width: 100%;
        min-height: 54px;
        margin-top: 7px;
        padding: 8px 10px;
        border: 1px dashed var(--color-border);
        border-radius: 9px;
        background: var(--color-background);
        text-align: left;
        font-size: 12px;
        font-weight: 700;
      }
      .palette-media > span {
        grid-row: 1 / span 2;
        display: grid;
        place-items: center;
        width: 30px;
        height: 30px;
        border-radius: 50%;
        background: var(--color-primary-subtle);
        color: var(--color-primary);
        font-size: 16px;
      }
      .palette-media small {
        grid-column: 2;
        color: var(--color-text-muted);
        font-size: 9px;
        font-weight: 500;
      }
      .palette-media:hover {
        border-color: var(--color-primary);
        background: var(--color-primary-subtle);
      }
      .secondary-media {
        margin-top: 7px;
      }
      .palette-feature {
        display: flex;
        align-items: center;
        gap: 10px;
        width: 100%;
        min-height: 42px;
        margin-top: 8px;
        padding: 8px;
        border: 1px solid var(--color-border-light);
        border-radius: 7px;
        text-align: left;
        font-size: 12px;
      }
      .palette-feature > span:first-child {
        flex: none;
        color: var(--color-primary);
        font-size: 18px;
      }
      .palette-feature > span:last-child {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .palette-feature small {
        color: var(--color-text-muted);
        font-size: 10px;
      }
      @media (min-width: 701px) and (max-width: 1024px) {
        :host {
          left: 72px;
        }
      }
      .palette-backdrop {
        position: fixed;
        inset: 0;
        z-index: -1;
        width: 100vw;
        height: 100dvh;
        background: transparent;
        cursor: default;
      }
      :host {
        position: fixed;
        inset: 0;
        width: auto;
        max-height: none;
        transform: none;
      }
      .create-palette {
        position: absolute;
        top: 50%;
        left: 82px;
        width: 260px;
        max-height: calc(100dvh - 32px);
        padding: 12px;
        overflow-x: hidden;
        overflow-y: auto;
        transform: translateY(-50%);
      }
      .palette-close {
        position: absolute;
        top: 7px;
        right: 7px;
        width: 24px;
        height: 24px;
        border-radius: 5px;
        color: var(--color-text-muted);
        font-size: 18px;
      }
      .palette-section {
        margin: 7px 2px 4px;
        padding-top: 7px;
      }
      .palette-section:first-of-type {
        margin-top: 2px;
        padding-top: 0;
        border-top: 0;
      }
      .palette-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 3px;
      }
      .palette-grid button {
        min-height: 38px;
        gap: 7px;
        padding: 6px 8px;
        border: 1px solid color-mix(in srgb, var(--color-primary) 14%, var(--color-border-light));
        border-radius: 6px;
        background: var(--color-surface);
        font-size: 11px;
      }
      .palette-grid button:hover,
      .palette-grid button:focus-visible {
        border-color: var(--color-primary);
        background: var(--color-primary-subtle);
      }
      .palette-grid button span {
        width: 17px;
        font-size: 15px;
      }
      .palette-media {
        min-height: 42px;
        margin-top: 5px;
        padding: 5px 7px;
      }
      .palette-feature {
        min-height: 34px;
        margin-top: 5px;
        padding: 6px;
        font-size: 11px;
      }
      .secondary-media {
        margin-top: 5px;
      }
      @media (max-width: 700px) {
        :host {
          inset: 0;
        }
        .palette-backdrop {
          background: rgba(20, 20, 20, 0.08);
        }
        .create-palette {
          top: auto;
          right: 8px;
          bottom: calc(70px + env(safe-area-inset-bottom));
          left: 8px;
          width: auto;
          max-height: calc(100dvh - 86px - env(safe-area-inset-bottom));
          padding: 12px;
          transform: none;
        }
        .palette-close {
          display: none;
        }
        .palette-grid button {
          min-height: 38px;
        }
      }
    `,
  ],
})
export class CanvasAddPalette {
  readonly close = output<void>();
  readonly chooseType = output<ItemType>();
  readonly openFiles = output<void>();
  readonly recordVoice = output<void>();
  readonly openMedia = output<'gif' | 'sticker'>();
  readonly sketch = output<void>();
  readonly erStarter = output<void>();
  readonly quick: { type: ItemType; icon: string; label: string }[] = [
    { type: 'note', icon: '▤', label: 'Note' },
    { type: 'text', icon: 'T', label: 'Text' },
    { type: 'task', icon: '✓', label: 'Task' },
    { type: 'list', icon: '☷', label: 'List' },
  ];
  readonly organize: { type: ItemType; icon: string; label: string }[] = [
    { type: 'zone', icon: '□', label: 'Zone' },
    { type: 'frame', icon: '▧', label: 'Frame' },
    { type: 'budget', icon: '$', label: 'Budget' },
    { type: 'table', icon: '▦', label: 'Table' },
    { type: 'chart', icon: '▥', label: 'Chart' },
    { type: 'er-entity', icon: '◇', label: 'ER entity' },
  ];
}
