import '@angular/compiler';
import { Component, signal, ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ControlPopover } from './control-popover';
import { ThreadCheckbox, ThreadColor, ThreadOption, ThreadSelect } from './thread-controls';
import { hexToHsv, hsvToHex, normalizeHex } from './color-utils';

TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());

@Component({ standalone: true, imports: [ThreadSelect, ThreadOption, ThreadCheckbox, ThreadColor], template: `
  <label>Data type<thread-select [value]="selected()" (change)="selected.set($any($event.target).value)" aria-label="Data type">
    @for (type of types(); track type) { <thread-option [value]="type" [label]="type" [disabled]="type === 'Disabled'"></thread-option> }
  </thread-select></label>
  <label id="required-label"><thread-checkbox [checked]="checked" [disabled]="disabled()" (change)="checked = $any($event.target).checked; checkboxChanges = checkboxChanges + 1"></thread-checkbox> Required</label>
  <thread-color [value]="color" aria-label="Accent color" (change)="color = $any($event.target).value; colorChanges = colorChanges + 1"></thread-color>
` })
class ControlsHarness {
  selected = signal('UUID'); types = signal(['UUID', 'Disabled', 'VARCHAR', 'INTEGER', 'BOOLEAN', 'DATE', 'TEXT', 'BIGINT', 'JSON', 'ENUM']);
  checked = false; disabled = signal(false); checkboxChanges = 0; color = '#111111'; colorChanges = 0;
}

beforeEach(async () => {
  await ɵresolveComponentResources(() => Promise.resolve(''));
  TestBed.configureTestingModule({ imports: [ControlsHarness] });
  for (const control of [ThreadSelect, ThreadCheckbox, ThreadColor]) TestBed.overrideComponent(control, { set: { styleUrl: undefined, styles: [] } });
});
afterEach(() => TestBed.resetTestingModule());

async function harness() { const fixture = TestBed.createComponent(ControlsHarness); fixture.detectChanges(); await fixture.whenStable(); return { fixture, instance: fixture.componentInstance, element: fixture.nativeElement as HTMLElement }; }
function key(element: Element, name: string) { element.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true })); }

describe('Thread dropdowns', () => {
  it('projects dynamic options, searches them, and emits the existing value contract', async () => {
    const { fixture, instance, element } = await harness();
    const trigger = element.querySelector<HTMLButtonElement>('[role=combobox]')!;
    expect(trigger.textContent).toContain('UUID'); trigger.click(); fixture.detectChanges(); await fixture.whenStable();
    const panel = document.body.querySelector<HTMLElement>('.thread-select-panel')!;
    expect(panel.parentElement).toBe(document.body);
    const search = panel.querySelector<HTMLInputElement>('input')!; search.value = 'integer'; search.dispatchEvent(new Event('input', { bubbles: true })); fixture.detectChanges();
    expect(panel.querySelectorAll('[role=option]')).toHaveLength(1);
    key(search, 'Enter'); fixture.detectChanges();
    expect(instance.selected()).toBe('INTEGER'); expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.body.querySelector(':scope > .thread-select-panel')).toBeNull();
  });
  it('skips disabled options with the keyboard and returns focus on Escape', async () => {
    const { fixture, instance, element } = await harness();
    const trigger = element.querySelector<HTMLButtonElement>('[role=combobox]')!;
    trigger.click(); fixture.detectChanges(); await fixture.whenStable();
    let panel = document.body.querySelector<HTMLElement>('.thread-select-panel')!;
    const search = panel.querySelector('input')!; key(search, 'ArrowDown'); key(search, 'Enter'); fixture.detectChanges();
    expect(instance.selected()).toBe('VARCHAR');
    trigger.click(); fixture.detectChanges(); await fixture.whenStable(); panel = document.body.querySelector<HTMLElement>('.thread-select-panel')!;
    key(panel, 'Escape'); fixture.detectChanges();
    expect(document.activeElement).toBe(trigger); expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });
  it('refreshes labels and options when the data changes', async () => {
    const { fixture, instance, element } = await harness();
    expect(fixture.debugElement.query(By.directive(ThreadSelect)).componentInstance.selectedValue()).toBe('UUID');
    instance.types.set(['UUID', 'REFERENCE']); instance.selected.set('REFERENCE'); fixture.changeDetectorRef.markForCheck(); fixture.detectChanges(); await fixture.whenStable();
    expect(fixture.debugElement.query(By.directive(ThreadSelect)).componentInstance.value).toBe('REFERENCE');
    expect(element.querySelector('[role=combobox]')?.textContent).toContain('REFERENCE');
  });
});

describe('Thread checkboxes', () => {
  it('toggles once from either the button or its surrounding label', async () => {
    const { fixture, instance, element } = await harness();
    const checkbox = element.querySelector<HTMLButtonElement>('[role=checkbox]')!;
    checkbox.click(); fixture.detectChanges(); expect(instance.checked).toBe(true); expect(instance.checkboxChanges).toBe(1);
    element.querySelector<HTMLLabelElement>('#required-label')!.click(); fixture.detectChanges();
    expect(instance.checked).toBe(false); expect(instance.checkboxChanges).toBe(2); expect(checkbox.getAttribute('aria-checked')).toBe('false');
  });
  it('keeps a disabled checkbox unchanged when its label is clicked', async () => {
    const { fixture, instance, element } = await harness(); instance.disabled.set(true); fixture.changeDetectorRef.markForCheck(); fixture.detectChanges();
    expect(fixture.debugElement.query(By.directive(ThreadCheckbox)).componentInstance.disabled()).toBe(true);
    element.querySelector<HTMLLabelElement>('#required-label')!.click(); fixture.detectChanges();
    expect(instance.checked).toBe(false); expect(instance.checkboxChanges).toBe(0);
  });
});

describe('Thread colors', () => {
  it('previews a drag locally and commits only when the pointer is released', async () => {
    const { fixture, instance, element } = await harness();
    element.querySelector<HTMLButtonElement>('.thread-color-trigger')!.click(); fixture.detectChanges();
    const plane = document.body.querySelector<HTMLElement>('.thread-color-plane')!;
    plane.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 150 } as DOMRect); plane.setPointerCapture = vi.fn();
    const pointer = (type: string, x: number, y: number) => { const event = new MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true }); Object.defineProperty(event, 'pointerId', { value: 7 }); plane.dispatchEvent(event); };
    pointer('pointerdown', 100, 0); pointer('pointermove', 150, 30); fixture.detectChanges();
    expect(instance.colorChanges).toBe(0); expect(instance.color).toBe('#111111');
    pointer('pointerup', 150, 30); fixture.detectChanges();
    expect(instance.colorChanges).toBe(1); expect(instance.color).not.toBe('#111111');
  });
  it('rolls back an unfinished color drag on Escape', async () => {
    const { fixture, instance, element } = await harness();
    element.querySelector<HTMLButtonElement>('.thread-color-trigger')!.click(); fixture.detectChanges();
    const plane = document.body.querySelector<HTMLElement>('.thread-color-plane')!;
    plane.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 150 } as DOMRect); plane.setPointerCapture = vi.fn();
    const event = new MouseEvent('pointerdown', { clientX: 150, clientY: 0, button: 0, bubbles: true }); Object.defineProperty(event, 'pointerId', { value: 7 }); plane.dispatchEvent(event);
    key(plane, 'Escape'); fixture.detectChanges();
    expect(instance.colorChanges).toBe(0); expect(instance.color).toBe('#111111');
    expect(fixture.debugElement.query(By.directive(ThreadColor)).componentInstance.value).toBe('#111111');
  });
  it('accepts swatches and hex values, rejects invalid values, and emits once per edit', async () => {
    const { fixture, instance, element } = await harness();
    element.querySelector<HTMLButtonElement>('.thread-color-trigger')!.click(); fixture.detectChanges();
    const panel = document.body.querySelector<HTMLElement>('.thread-color-panel')!;
    panel.querySelector<HTMLButtonElement>('[aria-label="Use #d4111c"]')!.click(); fixture.detectChanges();
    expect(instance.color).toBe('#d4111c'); expect(instance.colorChanges).toBe(1);
    const hex = panel.querySelector<HTMLInputElement>('[aria-label="Hex color"]')!;
    hex.value = '#ABC'; hex.dispatchEvent(new Event('change', { bubbles: true })); fixture.detectChanges();
    expect(instance.color).toBe('#aabbcc'); expect(instance.colorChanges).toBe(2);
    hex.value = 'oops'; hex.dispatchEvent(new Event('change', { bubbles: true })); fixture.detectChanges();
    expect(instance.color).toBe('#aabbcc'); expect(hex.getAttribute('aria-invalid')).toBe('true');
    expect(instance.colorChanges).toBe(2);
  });
  it('keeps only one floating control open at a time', async () => {
    const { fixture, element } = await harness();
    element.querySelector<HTMLButtonElement>('[role=combobox]')!.click(); fixture.detectChanges();
    element.querySelector<HTMLButtonElement>('.thread-color-trigger')!.click(); fixture.detectChanges();
    expect(element.querySelector('[role=combobox]')!.getAttribute('aria-expanded')).toBe('false');
    expect(document.body.querySelectorAll(':scope > .thread-control-panel')).toHaveLength(1);
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })); fixture.detectChanges();
    expect(document.body.querySelectorAll(':scope > .thread-control-panel')).toHaveLength(0);
  });
});

describe('Control overlays', () => {
  it('fits a narrow viewport, flips above a bottom trigger, and restores the original panel on close', () => {
    const width = window.innerWidth, height = window.innerHeight;
    Object.defineProperty(window, 'innerWidth', { value: 320, configurable: true }); Object.defineProperty(window, 'innerHeight', { value: 568, configurable: true });
    const owner = document.createElement('div'), trigger = document.createElement('button'), panel = document.createElement('div'); owner.append(trigger, panel); document.body.append(owner);
    trigger.getBoundingClientRect = () => ({ left: 280, top: 480, bottom: 512, width: 32, height: 32 } as DOMRect); panel.getBoundingClientRect = () => ({ height: 400 } as DOMRect);
    const popup = new ControlPopover(document, vi.fn());
    try { popup.open(panel, trigger, 280); expect(panel.parentElement).toBe(document.body); expect(parseFloat(panel.style.left) + parseFloat(panel.style.width)).toBeLessThanOrEqual(308); expect(parseFloat(panel.style.top)).toBeLessThan(480); popup.close(); expect(panel.parentElement).toBe(owner); expect(panel.hidden).toBe(true); }
    finally { popup.close(false); owner.remove(); Object.defineProperty(window, 'innerWidth', { value: width, configurable: true }); Object.defineProperty(window, 'innerHeight', { value: height, configurable: true }); }
  });
});

describe('Color conversion', () => {
  it('normalizes shorthand and round-trips the full palette', () => {
    expect(normalizeHex('ABC')).toBe('#aabbcc'); expect(normalizeHex('invalid')).toBeNull();
    for (const value of ['#000000', '#ffffff', '#d4111c', '#315b89', '#84cc16', '#e9e7e2']) { const hsv = hexToHsv(value); expect(hsvToHex(hsv.h, hsv.s, hsv.v)).toBe(value); }
  });
});
