import { Component, output } from '@angular/core';
import { LucideDynamicIcon, LucideStickyNote, LucideType, LucideCheck, LucideList, LucideSquareDashed, LucideFrame, LucideWallet, LucideTable2, LucideChartColumn, LucideDatabase, LucideImagePlus, LucideMic, LucideClapperboard, LucideSticker, LucideLink, LucidePencil, LucideWaypoints, LucideNetwork, LucideChevronDown } from '@lucide/angular';
import type { ItemType } from '../canvas.model';
import { diagramCatalog, DiagramType } from '../diagram-templates';

@Component({
  selector: 'app-canvas-add-palette',
  imports: [LucideDynamicIcon],
  template: `
    <button
      class="palette-backdrop"
      type="button"
      (click)="close.emit()"
      aria-label="Close add menu"
    ></button>
    <section class="create-palette" data-ui aria-label="Add to canvas">
      <div class="palette-section">Quick</div>
      <div class="palette-grid">
        @for (entry of quick; track entry.type) {
          <button type="button" (click)="chooseType.emit(entry.type)">
            <svg [lucideIcon]="entry.icon" aria-hidden="true"></svg>{{ entry.label }}
          </button>
        }
      </div>
      <details class="palette-group">
      <summary>Media <svg [lucideIcon]="icons.chevron" aria-hidden="true"></svg></summary>
      <div class="palette-group-content">
      <button class="palette-media" type="button" (click)="openFiles.emit()">
        <span aria-hidden="true"><svg [lucideIcon]="icons.imagePlus"></svg></span>Add media<small>Image · audio · video · document</small>
      </button>
      <button class="palette-media" type="button" (click)="recordVoice.emit()">
        <span aria-hidden="true"><svg [lucideIcon]="icons.mic"></svg></span>Record voice<small>Start a microphone recording</small>
      </button>
      <div class="palette-grid secondary-media">
        <button type="button" (click)="openMedia.emit('gif')">
          <svg [lucideIcon]="icons.gif" aria-hidden="true"></svg>GIF
        </button>
        <button type="button" (click)="openMedia.emit('sticker')">
          <svg [lucideIcon]="icons.sticker" aria-hidden="true"></svg>Sticker
        </button>
        <button type="button" (click)="chooseType.emit('link')">
          <svg [lucideIcon]="icons.link" aria-hidden="true"></svg>Link
        </button>
      </div>
      </div>
      </details>
      <details class="palette-group">
      <summary>Organize <svg [lucideIcon]="icons.chevron" aria-hidden="true"></svg></summary>
      <div class="palette-group-content">
      <div class="palette-grid">
        @for (entry of organize; track entry.type) {
          <button type="button" (click)="chooseType.emit(entry.type)">
            <svg [lucideIcon]="entry.icon" aria-hidden="true"></svg>{{ entry.label }}
          </button>
        }
      </div>
      <button class="palette-feature" type="button" (click)="sketch.emit()">
        <svg [lucideIcon]="icons.pencil" aria-hidden="true"></svg>Sketch directly on canvas
      </button>
      <button class="palette-feature" type="button" (click)="erStarter.emit()">
        <svg [lucideIcon]="icons.database" aria-hidden="true"></svg><span
          ><strong>ER diagram starter</strong
          ><small>Two linked entities with example keys</small></span
        >
      </button>
      </div>
      </details>
      <div class="palette-section">Systems</div>
      <button class="palette-feature palette-system" type="button" (click)="designSystem.emit()"><svg [lucideIcon]="icons.network" aria-hidden="true"></svg><span><strong>Design a system</strong><small>Components, connections, and review</small></span></button>
      <details class="palette-group">
      <summary>Mapping <svg [lucideIcon]="icons.chevron" aria-hidden="true"></svg></summary>
      <div class="palette-group-content">
      <div class="diagram-picker">
        @for (diagram of diagramCatalog; track diagram.type) {
          <button type="button" (click)="chooseDiagram.emit(diagram.type)"><strong>{{ diagram.name }}</strong><small>{{ diagram.description }}</small></button>
        }
      </div>
      </div>
      </details>
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
      .palette-grid button > svg {
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
      .palette-feature > svg {
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
      .palette-system { border-color:var(--color-border-light); background:var(--color-surface); }
      .palette-system:hover,.palette-system:focus-visible { border-color:var(--color-primary); background:var(--color-primary-subtle); }
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
        max-height: min(72dvh, 620px);
        padding: 12px;
        overflow-x: hidden;
        overflow-y: auto;
        scrollbar-width: none;
        transform: translateY(-50%);
      }
      .create-palette::-webkit-scrollbar { display: none; }
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
      .palette-grid button > svg {
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
      .palette-group { margin-top:5px; border:1px solid var(--color-border-light); border-radius:7px; }
      .palette-group summary { display:flex; align-items:center; justify-content:space-between; min-height:36px; padding:7px 9px; color:var(--color-text-primary); font-size:11px; font-weight:700; cursor:pointer; list-style:none; }
      .palette-group summary::-webkit-details-marker { display:none; }
      .palette-group summary:focus-visible { outline:2px solid var(--color-primary); outline-offset:2px; }
      .palette-group summary svg { width:16px; height:16px; color:var(--color-primary); transition:transform .15s ease; }
      .palette-group[open] summary svg { transform:rotate(180deg); }
      .palette-grid button > svg,.palette-feature > svg { width:18px; height:18px; flex:none; color:var(--color-primary); }
      .palette-media svg { width:17px; height:17px; }
      .palette-group-content { padding:0 6px 7px; border-top:1px solid var(--color-border-light); }
      .diagram-picker { padding-top:5px; }
      .diagram-group { margin:9px 4px 3px; color:var(--color-text-muted); font-size:9px; font-weight:800; letter-spacing:.1em; text-transform:uppercase; }
      .diagram-picker button { display:flex; flex-direction:column; gap:2px; width:100%; padding:7px 8px; text-align:left; border-radius:5px; }
      .diagram-picker button:hover,.diagram-picker button:focus-visible { background:var(--color-primary-subtle); }
      .diagram-picker button strong { font-size:11px; }
      .diagram-picker button small { color:var(--color-text-muted); font-size:10px; }
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
          max-height: min(62dvh, 490px);
          padding: 10px;
          transform: none;
        }
        .palette-grid button {
          min-height: 38px;
        }
        .palette-feature:not(.palette-system) small { display:none; }
        .palette-feature { min-height:34px; }
      }
    `,
  ],
})
export class CanvasAddPalette {
  readonly icons = { chevron: LucideChevronDown, imagePlus: LucideImagePlus, mic: LucideMic, gif: LucideClapperboard, sticker: LucideSticker, link: LucideLink, pencil: LucidePencil, database: LucideDatabase, network: LucideNetwork };
  readonly close = output<void>();
  readonly chooseType = output<ItemType>();
  readonly openFiles = output<void>();
  readonly recordVoice = output<void>();
  readonly openMedia = output<'gif' | 'sticker'>();
  readonly sketch = output<void>();
  readonly erStarter = output<void>();
  readonly chooseDiagram = output<DiagramType>();
  readonly diagramCatalog = diagramCatalog;
  readonly designSystem = output<void>();
  readonly quick = [
    { type: 'note' as ItemType, icon: LucideStickyNote, label: 'Note' },
    { type: 'text' as ItemType, icon: LucideType, label: 'Text' },
    { type: 'task' as ItemType, icon: LucideCheck, label: 'Task' },
    { type: 'list' as ItemType, icon: LucideList, label: 'List' },
  ];
  readonly organize = [
    { type: 'zone' as ItemType, icon: LucideSquareDashed, label: 'Zone' },
    { type: 'frame' as ItemType, icon: LucideFrame, label: 'Frame' },
    { type: 'budget' as ItemType, icon: LucideWallet, label: 'Budget' },
    { type: 'table' as ItemType, icon: LucideTable2, label: 'Table' },
    { type: 'chart' as ItemType, icon: LucideChartColumn, label: 'Chart' },
    { type: 'er-entity' as ItemType, icon: LucideDatabase, label: 'ER entity' },
  ];
}
