import { DOCUMENT } from '@angular/common';
import { AfterViewInit, Component, ContentChildren, ElementRef, EventEmitter, Input, OnDestroy, Output, QueryList, ViewChild, booleanAttribute, inject, signal } from '@angular/core';
import { ControlPopover, controlChange } from './control-popover';
import { hexToHsv, hsvToHex, normalizeHex } from './color-utils';

let controlId = 0;
function controlLabel(host: HTMLElement, explicit: string, fallback: string): string {
  const label = host.closest('label') || (host.id ? Array.from(host.ownerDocument.querySelectorAll('label')).find(label => label.htmlFor === host.id) : undefined);
  const text = label ? Array.from(label.childNodes).filter(node => node.nodeType === 3).map(node => node.textContent?.trim()).join(' ').trim() : '';
  return explicit || host.getAttribute('aria-label') || text || fallback;
}

@Component({ selector: 'thread-option', standalone: true, template: '', host: { style: 'display:none' } })
export class ThreadOption {
  readonly value = signal<string | number | undefined>(undefined);
  readonly label = signal('');
  readonly disabled = signal(false);
  @Input('value') set optionValueInput(value: string | number | undefined) { this.value.set(value); }
  @Input('label') set labelInput(value: string) { this.label.set(value); }
  @Input('disabled') set disabledInput(value: unknown) { this.disabled.set(booleanAttribute(value)); }
  optionValue(): string { return String(this.value() ?? this.label()); }
}

@Component({
  selector: 'thread-select', standalone: true, styleUrl: './thread-controls.css', host: { 'data-control': 'select', 'data-ui': '', '[attr.data-size]': 'size()', '(pointerdown)': '$event.stopPropagation()' },
  template: `
    <button #trigger class="thread-select-trigger" type="button" role="combobox" aria-haspopup="listbox" [attr.aria-label]="accessibleLabel()" [attr.aria-expanded]="opened()" [attr.aria-controls]="menuId" [title]="selectedLabel()" [disabled]="disabled()" (click)="toggle()" (keydown)="triggerKey($event)">
      <span>{{ selectedLabel() }}</span><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 7 5 5 5-5" /></svg>
    </button>
    <span hidden><ng-content /></span>
    <div #panel class="thread-control-panel thread-select-panel" data-ui [hidden]="!opened()" (pointerdown)="$event.stopPropagation()" (keydown)="menuKey($event)">
      @if (options().length > 8) { <div class="thread-option-search"><input #searchInput type="search" aria-label="Filter options" placeholder="Search options…" [value]="query()" (input)="search($event)" (change)="$event.stopPropagation()" /></div> }
      <div class="thread-option-list" role="listbox" [id]="menuId" [attr.aria-label]="accessibleLabel()">
        @for (option of filtered(); track option) {
          <button class="thread-option" type="button" role="option" [id]="menuId + '-' + $index" [class.is-active]="active() === $index" [attr.aria-selected]="value === option.optionValue()" [disabled]="option.disabled()" (pointerdown)="$event.preventDefault()" (pointerenter)="active.set($index)" (click)="choose(option)">
            <span>{{ option.label() }}</span><svg viewBox="0 0 20 20" aria-hidden="true" [class.is-visible]="value === option.optionValue()"><path d="m4 10 4 4 8-8" /></svg>
          </button>
        } @empty { <p class="thread-control-empty">No matching options</p> }
      </div>
    </div>
  `,
})
export class ThreadSelect implements OnDestroy {
  readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  @ContentChildren(ThreadOption, { descendants: true }) optionChildren!: QueryList<ThreadOption>;
  options(): readonly ThreadOption[] { return this.optionChildren?.toArray() || []; }
  readonly disabled = signal(false);
  readonly size = signal<'compact' | 'regular'>('regular');
  readonly ariaLabel = signal('');
  @Input('disabled') set disabledInput(value: unknown) { this.disabled.set(booleanAttribute(value)); }
  @Input('size') set sizeInput(value: 'compact' | 'regular') { this.size.set(value); }
  @Input('aria-label') set ariaLabelInput(value: string) { this.ariaLabel.set(value); }
  readonly opened = signal(false); readonly query = signal(''); readonly active = signal(-1);
  readonly selectedValue = signal<string | null>(null);
  readonly menuId = `thread-options-${++controlId}`;
  private readonly popup = new ControlPopover(inject(DOCUMENT), () => this.opened.set(false));
  @ViewChild('trigger', { static: true }) trigger!: ElementRef<HTMLButtonElement>;
  @ViewChild('panel', { static: true }) panel!: ElementRef<HTMLElement>;
  @ViewChild('searchInput') searchInput?: ElementRef<HTMLInputElement>;
  @Input() set value(value: string | number | null | undefined) { this.selectedValue.set(value == null ? '' : String(value)); }
  get value(): string { return this.selectedValue() ?? this.options().find(option => !option.disabled())?.optionValue() ?? ''; }
  @Output() readonly change = new EventEmitter<Event>();
  @Output() readonly valueChange = new EventEmitter<string>();
  accessibleLabel(): string { return controlLabel(this.host.nativeElement, this.ariaLabel(), 'Choose an option'); }
  selectedLabel(): string { return this.options().find(option => option.optionValue() === this.value)?.label() || 'Choose…'; }
  filtered(): readonly ThreadOption[] { const query = this.query().trim().toLowerCase(); return this.options().filter(option => !query || option.label().toLowerCase().includes(query)); }
  toggle(): void { this.opened() ? this.close() : this.open(); }
  open(): void {
    if (this.disabled()) return;
    this.query.set(''); const selected = this.options().findIndex(option => option.optionValue() === this.value && !option.disabled()); this.active.set(selected >= 0 ? selected : this.options().findIndex(option => !option.disabled()));
    this.opened.set(true); this.popup.open(this.panel.nativeElement, this.trigger.nativeElement);
    setTimeout(() => this.opened() && (this.searchInput?.nativeElement || this.panel.nativeElement.querySelector<HTMLButtonElement>(`#${this.menuId}-${this.active()}`))?.focus());
  }
  close(): void { this.opened.set(false); this.popup.close(); }
  choose(option: ThreadOption): void { if (option.disabled()) return; const value = option.optionValue(); this.selectedValue.set(value); this.close(); this.valueChange.emit(value); this.change.emit(controlChange(value)); }
  search(event: Event): void { this.query.set((event.target as HTMLInputElement).value); this.active.set(this.filtered().findIndex(option => !option.disabled())); }
  triggerKey(event: KeyboardEvent): void {
    event.stopPropagation();
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) { event.preventDefault(); event.stopPropagation(); if (!this.opened()) this.open(); this.navigate(event.key === 'ArrowUp' ? -1 : 1, event.key); }
    else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && event.key !== ' ') { event.stopPropagation(); this.open(); this.query.set(event.key); this.active.set(this.filtered().findIndex(option => !option.disabled())); }
  }
  menuKey(event: KeyboardEvent): void {
    event.stopPropagation();
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) { event.preventDefault(); this.navigate(event.key === 'ArrowUp' ? -1 : 1, event.key); }
    else if (event.key === 'Enter' || event.key === ' ' && (event.target as HTMLElement).tagName !== 'INPUT') { event.preventDefault(); const option = this.filtered()[this.active()]; if (option) this.choose(option); }
    else if (event.key === 'Tab') { this.close(); }
  }
  private navigate(direction: number, key: string): void {
    const options = this.filtered(); if (!options.length || options.every(option => option.disabled())) return;
    let index = key === 'Home' ? -1 : key === 'End' ? options.length : this.active();
    if (key === 'End') direction = -1; if (key === 'Home') direction = 1;
    for (let step = 0; step < options.length; step++) { index = (index + direction + options.length) % options.length; if (!options[index].disabled()) { this.active.set(index); const option = this.panel.nativeElement.querySelector<HTMLElement>(`#${this.menuId}-${index}`); option?.scrollIntoView?.({ block: 'nearest' }); if ((this.host.nativeElement.ownerDocument.activeElement as HTMLElement)?.tagName !== 'INPUT') option?.focus(); return; } }
  }
  ngOnDestroy(): void { this.opened.set(false); this.popup.close(false); }
}

@Component({
  selector: 'thread-checkbox', standalone: true, styleUrl: './thread-controls.css', host: { 'data-control': 'checkbox', 'data-ui': '', '(pointerdown)': '$event.stopPropagation()' },
  template: `<button #trigger type="button" class="thread-checkbox-trigger" role="checkbox" [attr.aria-label]="accessibleLabel()" [attr.aria-checked]="indeterminate() ? 'mixed' : checked" [disabled]="disabled()" [class.is-checked]="checked || indeterminate()" (click)="toggle(); $event.stopPropagation()" (keydown)="$event.stopPropagation()"><svg viewBox="0 0 20 20" aria-hidden="true">@if (indeterminate()) { <path d="M5 10h10" /> } @else { <path d="m4 10 4 4 8-8" /> }</svg></button>`,
})
export class ThreadCheckbox implements AfterViewInit, OnDestroy {
  readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly disabled = signal(false); readonly indeterminate = signal(false);
  readonly ariaLabel = signal(''); readonly checkedValue = signal(false);
  @Input('disabled') set disabledInput(value: unknown) { this.disabled.set(booleanAttribute(value)); }
  @Input('indeterminate') set indeterminateInput(value: unknown) { this.indeterminate.set(booleanAttribute(value)); }
  @Input('aria-label') set ariaLabelInput(value: string) { this.ariaLabel.set(value); }
  @ViewChild('trigger', { static: true }) trigger!: ElementRef<HTMLButtonElement>;
  @Input() set checked(value: unknown) { this.checkedValue.set(booleanAttribute(value)); }
  get checked(): boolean { return this.checkedValue(); }
  @Output() readonly change = new EventEmitter<Event>(); @Output() readonly checkedChange = new EventEmitter<boolean>();
  private label?: HTMLLabelElement;
  private labelClick = (event: Event) => { if (!this.host.nativeElement.contains(event.target as Node)) { event.preventDefault(); if (this.disabled()) return; this.trigger.nativeElement.focus(); this.toggle(); } };
  private labelDown = (event: Event) => event.stopPropagation();
  accessibleLabel(): string { return controlLabel(this.host.nativeElement, this.ariaLabel(), 'Toggle'); }
  toggle(): void { if (this.disabled()) return; this.checkedValue.set(!this.checked); this.checkedChange.emit(this.checked); this.change.emit(controlChange(this.checked ? '1' : '0', this.checked)); }
  ngAfterViewInit(): void { this.label = this.host.nativeElement.closest('label') || undefined; this.label?.addEventListener('click', this.labelClick); this.label?.addEventListener('pointerdown', this.labelDown); }
  ngOnDestroy(): void { this.label?.removeEventListener('click', this.labelClick); this.label?.removeEventListener('pointerdown', this.labelDown); }
}

@Component({
  selector: 'thread-color', standalone: true, styleUrl: './thread-controls.css', host: { 'data-control': 'color', 'data-ui': '', '(pointerdown)': '$event.stopPropagation()' },
  template: `
    <button #trigger type="button" class="thread-color-trigger" [attr.aria-label]="accessibleLabel() + ': ' + value" aria-haspopup="dialog" [attr.aria-expanded]="opened()" [disabled]="disabled()" (click)="toggle()" (keydown)="$event.stopPropagation()"><span [style.background]="value"></span><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 7 5 5 5-5" /></svg></button>
    <div #panel class="thread-control-panel thread-color-panel" data-ui role="dialog" [attr.aria-label]="accessibleLabel()" [hidden]="!opened()" (pointerdown)="$event.stopPropagation()" (keydown)="$event.stopPropagation()">
      <header><strong>{{ accessibleLabel() }}</strong><button type="button" (click)="close()" aria-label="Close color picker">×</button></header>
      <div class="thread-color-plane" tabindex="0" role="slider" aria-label="Saturation and brightness" aria-valuemin="0" aria-valuemax="100" [attr.aria-valuenow]="saturation() * 100" [attr.aria-valuetext]="colorDescription()" [style.background-color]="hueColor()" (pointerdown)="planeDown($event)" (pointermove)="planeMove($event)" (pointerup)="endGesture($event)" (pointercancel)="cancelGesture($event)" (keydown)="planeKey($event)"><i [style.left.%]="saturation() * 100" [style.top.%]="(1 - brightness()) * 100" [style.background]="value"></i></div>
      <div class="thread-hue-slider" tabindex="0" role="slider" aria-label="Hue" aria-valuemin="0" aria-valuemax="360" [attr.aria-valuenow]="hue()" (pointerdown)="hueDown($event)" (pointermove)="hueMove($event)" (pointerup)="endGesture($event)" (pointercancel)="cancelGesture($event)" (keydown)="hueKey($event)"><i [style.left.%]="hue() / 360 * 100"></i></div>
      <div class="thread-color-swatches">@for (color of palette; track color) { <button type="button" [style.background]="color" [class.is-selected]="value === color" [attr.aria-label]="'Use ' + color" [attr.aria-pressed]="value === color" (click)="commit(color)">@if (value === color) { <svg viewBox="0 0 20 20" aria-hidden="true" [style.color]="contrast(color)"><path d="m4 10 4 4 8-8" /></svg> }</button> }</div>
      <label class="thread-hex-label">HEX<input [value]="value" maxlength="7" aria-label="Hex color" spellcheck="false" [attr.aria-invalid]="invalid()" (change)="hexChanged($event)" (keydown.enter)="hexChanged($event)" /></label>
      @if (invalid()) { <p class="thread-control-error" role="status">Use a hex color, for example #D4111C.</p> }
      <footer><span [style.background]="value"></span><code>{{ value.toUpperCase() }}</code><button type="button" (click)="close()">Done</button></footer>
    </div>
  `,
})
export class ThreadColor implements OnDestroy {
  readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly disabled = signal(false); readonly ariaLabel = signal('');
  @Input('disabled') set disabledInput(value: unknown) { this.disabled.set(booleanAttribute(value)); }
  @Input('aria-label') set ariaLabelInput(value: string) { this.ariaLabel.set(value); }
  readonly opened = signal(false); readonly invalid = signal(false); readonly color = signal('#111111');
  readonly hue = signal(0); readonly saturation = signal(0); readonly brightness = signal(17 / 255);
  readonly palette = ['#111111','#62615e','#ffffff','#d4111c','#fb7185','#f97316','#fbbf24','#84cc16','#18864b','#14b8a6','#38bdf8','#315b89','#6366f1','#9b4dcc','#e9e7e2','#fff3d6'];
  private readonly popup = new ControlPopover(inject(DOCUMENT), () => { this.opened.set(false); this.abortGesture(); });
  private gesture: { pointer: number; kind: 'plane' | 'hue'; before: string } | null = null;
  private committedColor = '#111111';
  @ViewChild('trigger', { static: true }) trigger!: ElementRef<HTMLButtonElement>;
  @ViewChild('panel', { static: true }) panel!: ElementRef<HTMLElement>;
  @Input() set value(value: string | null | undefined) { const normalized = normalizeHex(value || '') || '#111111'; this.setColor(normalized); this.committedColor = normalized; }
  get value(): string { return this.color(); }
  @Output() readonly change = new EventEmitter<Event>(); @Output() readonly valueChange = new EventEmitter<string>();
  accessibleLabel(): string { return controlLabel(this.host.nativeElement, this.ariaLabel(), 'Color'); }
  hueColor(): string { return hsvToHex(this.hue(), 1, 1); }
  colorDescription(): string { return `Saturation ${Math.round(this.saturation() * 100)}%, brightness ${Math.round(this.brightness() * 100)}%`; }
  contrast(color: string): string { const hex = color.slice(1); return .299 * parseInt(hex.slice(0,2),16) + .587 * parseInt(hex.slice(2,4),16) + .114 * parseInt(hex.slice(4,6),16) > 150 ? '#111111' : '#ffffff'; }
  private setColor(value: string): void { const hsv = hexToHsv(value); this.color.set(value); this.hue.set(hsv.h); this.saturation.set(hsv.s); this.brightness.set(hsv.v); }
  toggle(): void { if (this.disabled()) return; if (this.opened()) this.close(); else { this.opened.set(true); this.invalid.set(false); this.popup.open(this.panel.nativeElement, this.trigger.nativeElement, 280); this.panel.nativeElement.querySelector<HTMLElement>('.thread-color-plane')?.focus(); } }
  close(): void { this.abortGesture(); this.opened.set(false); this.popup.close(); }
  commit(value = this.value): void { const normalized = normalizeHex(value); if (!normalized) return; if (normalized !== this.value) this.setColor(normalized); this.invalid.set(false); if (normalized === this.committedColor) return; this.committedColor = normalized; this.valueChange.emit(normalized); this.change.emit(controlChange(normalized)); }
  private abortGesture(): void { if (this.gesture) this.setColor(this.gesture.before); this.gesture = null; }
  hexChanged(event: Event): void { event.stopPropagation(); const value = normalizeHex((event.target as HTMLInputElement).value); this.invalid.set(!value); if (value) this.commit(value); }
  private preview(): void { this.color.set(hsvToHex(this.hue(), this.saturation(), this.brightness())); }
  planeDown(event: PointerEvent): void { if (event.button !== 0) return; event.preventDefault(); this.gesture = { pointer: event.pointerId, kind: 'plane', before: this.value }; (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId); this.planeMove(event); }
  planeMove(event: PointerEvent): void { if (this.gesture?.pointer !== event.pointerId || this.gesture.kind !== 'plane') return; const rect = (event.currentTarget as HTMLElement).getBoundingClientRect(); this.saturation.set(Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width)))); this.brightness.set(1 - Math.max(0, Math.min(1, (event.clientY - rect.top) / Math.max(1, rect.height)))); this.preview(); }
  hueDown(event: PointerEvent): void { if (event.button !== 0) return; event.preventDefault(); this.gesture = { pointer: event.pointerId, kind: 'hue', before: this.value }; (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId); this.hueMove(event); }
  hueMove(event: PointerEvent): void { if (this.gesture?.pointer !== event.pointerId || this.gesture.kind !== 'hue') return; const rect = (event.currentTarget as HTMLElement).getBoundingClientRect(); this.hue.set(Math.max(0, Math.min(360, (event.clientX - rect.left) / Math.max(1, rect.width) * 360))); this.preview(); }
  endGesture(event: PointerEvent): void { if (this.gesture?.pointer !== event.pointerId) return; this.gesture = null; this.commit(); }
  cancelGesture(event: PointerEvent): void { if (this.gesture?.pointer !== event.pointerId) return; this.setColor(this.gesture.before); this.gesture = null; }
  planeKey(event: KeyboardEvent): void { if (!event.key.startsWith('Arrow')) return; event.preventDefault(); const step = event.shiftKey ? .05 : .01; this.saturation.set(Math.max(0, Math.min(1, this.saturation() + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0)))); this.brightness.set(Math.max(0, Math.min(1, this.brightness() + (event.key === 'ArrowUp' ? step : event.key === 'ArrowDown' ? -step : 0)))); this.preview(); this.commit(); }
  hueKey(event: KeyboardEvent): void { if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return; event.preventDefault(); this.hue.set(event.key === 'Home' ? 0 : event.key === 'End' ? 360 : Math.max(0, Math.min(360, this.hue() + (event.key === 'ArrowRight' ? 1 : -1) * (event.shiftKey ? 10 : 1)))); this.preview(); this.commit(); }
  ngOnDestroy(): void { this.opened.set(false); this.popup.close(false); }
}
