import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, computed, effect, inject, signal } from '@angular/core';

export type ThemeChoice = 'light' | 'dark' | 'system';

@Injectable({ providedIn: 'root' })
export class PreferencesService {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly document = inject(DOCUMENT);
  readonly theme = signal<ThemeChoice>(this.readTheme());
  readonly profileName = signal(this.readName());
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
  setTheme(value: ThemeChoice): void {
    this.theme.set(value);
  }
  setProfileName(value: string): void {
    this.profileName.set(value.trim() || 'Thread user');
  }
}
