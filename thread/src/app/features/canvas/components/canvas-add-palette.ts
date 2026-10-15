import { Component, output, signal } from '@angular/core';
import { LucideDynamicIcon, LucideStickyNote, LucideType, LucideCheck, LucideList, LucideSquareDashed, LucideFrame, LucideWallet, LucideTable2, LucideChartColumn, LucideDatabase, LucideImagePlus, LucideMic, LucideClapperboard, LucideSticker, LucideLink, LucidePencil, LucideNetwork } from '@lucide/angular';
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
      <nav class="palette-tabs" aria-label="Add categories">
        @for (category of categories; track category.id) {
          <button type="button" [class.active]="activeCategory() === category.id" [attr.aria-current]="activeCategory() === category.id ? 'page' : null" (click)="activeCategory.set(category.id)">{{ category.label }}</button>
        }
      </nav>
      <div class="palette-columns">
      <div class="palette-column">
      <div class="palette-category" [class.mobile-active]="activeCategory() === 'quick'">
      <div class="palette-section">Quick</div>
      <div class="palette-grid">
        @for (entry of quick; track entry.type) {
          <button type="button" (click)="chooseType.emit(entry.type)">
            <svg [lucideIcon]="entry.icon" aria-hidden="true"></svg>{{ entry.label }}
          </button>
        }
      </div>
      </div>
      <div class="palette-category" [class.mobile-active]="activeCategory() === 'create'">
      <div class="palette-section">Create &amp; map</div>
      <div class="palette-feature-list">
        <button class="palette-feature" type="button" (click)="sketch.emit()">
          <svg [lucideIcon]="icons.pencil" aria-hidden="true"></svg><span><strong>Draw</strong><small>Sketch freely on the canvas</small></span>
        </button>
        <button class="palette-feature" type="button" (click)="designSystem.emit()"><svg [lucideIcon]="icons.network" aria-hidden="true"></svg><span><strong>Design a system</strong><small>Components and connections</small></span></button>
        <button class="palette-feature" type="button" (click)="erStarter.emit()">
          <svg [lucideIcon]="icons.database" aria-hidden="true"></svg><span><strong>ER diagram starter</strong><small>Two linked entities with keys</small></span>
        </button>
      </div>
      <div class="diagram-picker">
        @for (diagram of diagramCatalog; track diagram.type) {
          <button type="button" (click)="chooseDiagram.emit(diagram.type)"><strong>{{ diagram.name }}</strong><small>{{ diagram.description }}</small></button>
        }
      </div>
      </div>
      </div>
      <div class="palette-column">
      <div class="palette-category" [class.mobile-active]="activeCategory() === 'media'">
      <div class="palette-section">Media</div>
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
      <div class="palette-category" [class.mobile-active]="activeCategory() === 'organize'">
      <div class="palette-section">Organize</div>
      <div class="palette-grid">
        @for (entry of organize; track entry.type) {
          <button type="button" (click)="chooseType.emit(entry.type)">
            <svg [lucideIcon]="entry.icon" aria-hidden="true"></svg>{{ entry.label }}
          </button>
        }
      </div>
      </div>
      </div>
      </div>
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
      .create-palette { display:grid; grid-template-columns:112px minmax(0,1fr); gap:12px; width:min(430px,calc(100vw - 110px)); max-height:calc(100dvh - 120px); padding:12px; scrollbar-width:none; }
      .palette-tabs { display:flex; flex-direction:column; gap:4px; padding-right:10px; border-right:1px solid var(--color-border-light); }
      .palette-tabs button { min-height:40px; padding:8px 10px; border-radius:7px; color:var(--color-text-secondary); text-align:left; font-size:12px; font-weight:650; }
      .palette-tabs button:hover { background:var(--color-surface-muted); }
      .palette-tabs button.active { background:var(--color-primary-subtle); color:var(--color-primary); }
      .palette-columns,.palette-column { display:contents; }
      .palette-category { display:none; min-width:0; }
      .palette-category.mobile-active { display:block; }
      .palette-column .palette-section:first-child { margin-top:0; padding-top:0; border-top:0; }
      .palette-section { margin:14px 0 7px; padding-top:12px; font-size:10px; }
      .palette-section:first-of-type { margin-top:0; padding-top:0; }
      .palette-grid { grid-template-columns:1fr; gap:5px; }
      .palette-grid button { min-height:42px; padding:8px 10px; border-color:var(--color-border-light); border-radius:7px; font-size:12px; }
      .palette-media { min-height:50px; margin-top:6px; border-style:solid; border-color:var(--color-border-light); background:var(--color-surface); }
      .palette-media > span { background:transparent; }
      .palette-media small { font-size:10px; }
      .palette-feature-list { display:grid; gap:6px; }
      .palette-feature { min-height:48px; margin:0; padding:8px 10px; background:var(--color-surface); font-size:12px; }
      .diagram-picker { display:grid; grid-template-columns:1fr; gap:5px; margin-top:6px; }
      .diagram-picker button { min-height:42px; padding:7px; border:1px solid var(--color-border-light); border-radius:7px; }
      .diagram-picker button strong { font-size:10px; }
      .diagram-picker button small { display:block; }
      .palette-grid button > svg,.palette-feature > svg { width:18px; height:18px; flex:none; color:var(--color-primary); }
      .palette-media svg { width:17px; height:17px; }
      .diagram-picker button { display:flex; flex-direction:column; gap:2px; width:100%; text-align:left; }
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
          display:block;
          top: auto;
          right: 8px;
          bottom: calc(70px + env(safe-area-inset-bottom));
          left: 8px;
          width: auto;
          max-height: min(62dvh, 490px);
          padding: 10px;
          transform: none;
        }
        .palette-tabs { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:4px; margin-bottom:8px; padding:0; border:0; }
        .palette-tabs button { min-width:0; min-height:38px; padding:6px 2px; border-radius:7px; color:var(--color-text-secondary); font-size:11px; font-weight:700; }
        .palette-tabs button.active { background:var(--color-primary); color:var(--color-text-inverse); }
        .palette-category { display:none; }
        .palette-category.mobile-active { display:block; }
        .palette-category .palette-section { margin:0 0 7px; padding:0; border:0; }
        .create-palette { max-height:calc(100dvh - 155px); scrollbar-width:none; }
        .palette-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }
        .diagram-picker { grid-template-columns:repeat(3,minmax(0,1fr)); }
        .diagram-picker button small { display:none; }
        .palette-grid button {
          min-height: 38px;
        }
        .palette-feature { min-height:48px; }
      }
    `,
  ],
})
export class CanvasAddPalette {
  readonly categories = [{ id: 'quick', label: 'Quick' }, { id: 'create', label: 'Create' }, { id: 'media', label: 'Media' }, { id: 'organize', label: 'Organize' }] as const;
  readonly activeCategory = signal<(typeof this.categories)[number]['id']>('quick');
  readonly icons = { imagePlus: LucideImagePlus, mic: LucideMic, gif: LucideClapperboard, sticker: LucideSticker, link: LucideLink, pencil: LucidePencil, database: LucideDatabase, network: LucideNetwork };
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
