/** A body-mounted overlay stays above canvas transforms and scrolling panels. */
export class ControlPopover {
  private static current: ControlPopover | null = null;
  private marker?: Comment;
  private panel?: HTMLElement;
  private trigger?: HTMLElement;
  private cleanup: (() => void)[] = [];
  constructor(private document: Document, private onDismiss: () => void) {}
  open(panel: HTMLElement, trigger: HTMLElement, width = 0): void {
    ControlPopover.current?.dismiss(false);
    ControlPopover.current = this;
    this.panel = panel; this.trigger = trigger;
    this.marker = this.document.createComment('thread-control-overlay');
    panel.before(this.marker); this.document.body.append(panel);
    panel.hidden = false;
    const view = this.document.defaultView!;
    const rect = trigger.getBoundingClientRect(), margin = 12;
    const availableWidth = Math.max(0, view.innerWidth - margin * 2);
    const desiredWidth = Math.min(availableWidth, width || Math.max(200, rect.width));
    panel.style.position = 'fixed'; panel.style.width = `${desiredWidth}px`;
    panel.style.maxHeight = `${Math.max(80, view.innerHeight - margin * 2)}px`;
    const desiredHeight = panel.getBoundingClientRect().height;
    const below = view.innerHeight - rect.bottom - margin, above = rect.top - margin;
    const useBelow = below >= desiredHeight || below >= above;
    const space = Math.max(80, Math.min(view.innerHeight - margin * 2, (useBelow ? below : above) - 6));
    panel.style.maxHeight = `${space}px`; panel.style.setProperty('--thread-popup-space', `${space}px`);
    const height = Math.min(desiredHeight, space);
    const top = useBelow ? Math.min(rect.bottom + 6, view.innerHeight - height - margin) : Math.max(margin, rect.top - height - 6);
    panel.style.left = `${Math.max(margin, Math.min(rect.left, view.innerWidth - desiredWidth - margin))}px`;
    panel.style.top = `${Math.max(margin, top)}px`;
    const outside = (event: Event) => { const target = event.target as Node; if (!panel.contains(target) && !trigger.contains(target)) this.dismiss(false); };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); this.dismiss(true); } };
    const scroll = (event: Event) => { if (!panel.contains(event.target as Node)) this.dismiss(false); };
    const resize = () => this.dismiss(false);
    this.document.addEventListener('pointerdown', outside, true);
    this.document.addEventListener('focusin', outside, true);
    this.document.addEventListener('keydown', key, true);
    this.document.addEventListener('scroll', scroll, true);
    view.addEventListener('resize', resize);
    this.cleanup = [() => this.document.removeEventListener('pointerdown', outside, true), () => this.document.removeEventListener('focusin', outside, true), () => this.document.removeEventListener('keydown', key, true), () => this.document.removeEventListener('scroll', scroll, true), () => view.removeEventListener('resize', resize)];
  }
  close(focus = true): void {
    this.cleanup.forEach(cleanup => cleanup()); this.cleanup = [];
    if (this.panel) { this.panel.hidden = true; if (this.marker?.parentNode) this.marker.replaceWith(this.panel); }
    if (focus && this.trigger?.isConnected) this.trigger.focus();
    this.marker = undefined; this.panel = undefined;
    if (ControlPopover.current === this) ControlPopover.current = null;
  }
  private dismiss(focus: boolean): void { this.close(focus); this.onDismiss(); }
}

export function controlChange(value: string, checked?: boolean): Event {
  const event = new Event('change');
  Object.defineProperty(event, 'target', { value: { value, checked } });
  return event;
}
