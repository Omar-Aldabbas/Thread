import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, computed, effect, inject, signal } from '@angular/core';

export type ThemeChoice = 'light' | 'dark' | 'system';
export type ConnectorChoice = 'straight' | 'elbow' | 'curved';
export type CurrencyChoice = 'JOD' | 'USD' | 'EUR' | 'GBP';
export type ChartChoice = 'auto' | 'bar' | 'line' | 'donut' | 'comparison';
export type ShapeChoice = 'rectangle' | 'rounded' | 'circle' | 'diamond';

@Injectable({ providedIn: 'root' })
export class PreferencesService {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly document = inject(DOCUMENT);
  readonly theme = signal<ThemeChoice>(this.readTheme());
  readonly profileName = signal(this.readName());
  readonly minZoomPercent = signal(this.readMinZoom());
  readonly defaultZoomPercent = signal(this.readNumber('thread-default-zoom', 100, 25, 200));
  readonly fitOnOpen = signal(this.readBoolean('thread-fit-on-open', true));
  readonly zoomSpeed = signal(this.readNumber('thread-zoom-speed', 10, 5, 20));
  readonly showGrid = signal(this.readBoolean('thread-show-grid', true));
  readonly snapToObjects = signal(this.readBoolean('thread-snap-objects', true));
  readonly snapToGrid = signal(this.readBoolean('thread-snap-grid', false));
  readonly defaultConnector = signal<ConnectorChoice>(this.readChoice('thread-default-connector', ['straight', 'elbow', 'curved'], 'elbow'));
  readonly defaultNoteColor = signal(this.readColor('thread-default-note-color', '#d4111c'));
  readonly defaultFontSize = signal(this.readNumber('thread-default-font-size', 21, 12, 40));
  readonly defaultCurrency = signal<CurrencyChoice>(this.readChoice('thread-default-currency', ['JOD', 'USD', 'EUR', 'GBP'], 'JOD'));
  readonly defaultChart = signal<ChartChoice>(this.readChoice('thread-default-chart', ['auto', 'bar', 'line', 'donut', 'comparison'], 'auto'));
  readonly defaultShape = signal<ShapeChoice>(this.readChoice('thread-default-shape', ['rectangle', 'rounded', 'circle', 'diamond'], 'rectangle'));
  readonly preferredSpaceId = signal(this.browser ? localStorage.getItem('thread-preferred-space') || '' : '');
  readonly reducedMotion = signal(this.readBoolean('thread-reduced-motion', false));
  readonly largerControls = signal(this.readBoolean('thread-larger-controls', false));
  readonly highContrast = signal(this.readBoolean('thread-high-contrast', false));
  readonly reopenLastSpace = signal(this.readBoolean('thread-reopen-last-space', false));
  readonly systemDark = signal(this.browser && typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches);
  readonly dark = computed(
    () => this.theme() === 'dark' || (this.theme() === 'system' && this.systemDark()),
  );
  readonly initials = computed(
    () =>
      this.profileName()
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() || '')
        .join('') || 'T',
  );

  constructor() {
    if (this.browser && typeof matchMedia === 'function') {
      const media = matchMedia('(prefers-color-scheme: dark)');
      media.addEventListener('change', (event) => this.systemDark.set(event.matches));
    }
    effect(() => {
      this.document.documentElement.dataset['theme'] = this.dark() ? 'dark' : 'light';
    });
    effect(() => {
      if (this.browser) localStorage.setItem('thread-theme', this.theme());
    });
    effect(() => {
      if (this.browser) localStorage.setItem('thread-profile-name', this.profileName());
    });
    effect(() => {
      if (this.browser) localStorage.setItem('thread-min-zoom-percent', String(this.minZoomPercent()));
    });
    const entries: [string, () => string][] = [
      ['thread-default-zoom', () => String(this.defaultZoomPercent())],
      ['thread-fit-on-open', () => String(this.fitOnOpen())],
      ['thread-zoom-speed', () => String(this.zoomSpeed())],
      ['thread-show-grid', () => String(this.showGrid())],
      ['thread-snap-objects', () => String(this.snapToObjects())],
      ['thread-snap-grid', () => String(this.snapToGrid())],
      ['thread-default-connector', () => this.defaultConnector()],
      ['thread-default-note-color', () => this.defaultNoteColor()],
      ['thread-default-font-size', () => String(this.defaultFontSize())],
      ['thread-default-currency', () => this.defaultCurrency()],
      ['thread-default-chart', () => this.defaultChart()],
      ['thread-default-shape', () => this.defaultShape()],
      ['thread-preferred-space', () => this.preferredSpaceId()],
      ['thread-reduced-motion', () => String(this.reducedMotion())],
      ['thread-larger-controls', () => String(this.largerControls())],
      ['thread-high-contrast', () => String(this.highContrast())],
      ['thread-reopen-last-space', () => String(this.reopenLastSpace())],
    ];
    for (const [key, value] of entries) effect(() => { if (this.browser) localStorage.setItem(key, value()); });
    effect(() => {
      this.document.documentElement.classList.toggle('reduced-motion', this.reducedMotion());
      this.document.documentElement.classList.toggle('larger-controls', this.largerControls());
      this.document.documentElement.classList.toggle('high-contrast', this.highContrast());
    });
  }
  private readBoolean(key: string, fallback: boolean): boolean {
    return this.browser ? (localStorage.getItem(key) === null ? fallback : localStorage.getItem(key) === 'true') : fallback;
  }
  private readNumber(key: string, fallback: number, min: number, max: number): number {
    if (!this.browser) return fallback;
    const raw = localStorage.getItem(key);
    const value = raw === null ? NaN : Number(raw);
    return Number.isFinite(value) && value >= min && value <= max ? value : fallback;
  }
  private readChoice<T extends string>(key: string, choices: readonly T[], fallback: T): T {
    const value = this.browser ? localStorage.getItem(key) : null;
    return choices.find((choice) => choice === value) || fallback;
  }
  private readColor(key: string, fallback: string): string {
    const value = this.browser ? localStorage.getItem(key) : null;
    return value && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
  }
  private readTheme(): ThemeChoice {
    if (!this.browser) return 'system';
    const value = localStorage.getItem('thread-theme');
    return value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
  }
  private readName(): string {
    return this.browser
      ? localStorage.getItem('thread-profile-name') || 'Thread user'
      : 'Thread user';
  }
  private readMinZoom(): number {
    if (!this.browser) return 12;
    const value = Number(localStorage.getItem('thread-min-zoom-percent'));
    return Number.isFinite(value) && value >= 5 && value <= 100 ? Math.round(value) : 12;
  }
  setTheme(value: ThemeChoice): void {
    this.theme.set(value);
  }
  setProfileName(value: string): void {
    this.profileName.set(value.trim() || 'Thread user');
  }
  setMinZoomPercent(value: number): void {
    if (Number.isFinite(value)) this.minZoomPercent.set(Math.max(5, Math.min(100, Math.round(value))));
  }
}
