import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { PreferencesService, ThemeChoice } from '../../shared/preferences.service';

@Component({
  selector: 'app-settings-page',
  standalone: true,
  template: `
    <main class="settings-page">
      <header class="settings-header">
        <button (click)="back()" aria-label="Back to spaces">←</button
        ><strong>THREAD<span>.</span></strong
        ><span>Settings</span>
      </header>
      <div class="settings-shell">
        <div class="settings-intro">
          <span>YOUR SPACE</span>
          <h1>Settings</h1>
          <p>Make Thread feel like your own workspace.</p>
        </div>
        <section class="settings-section" aria-labelledby="profile-heading">
          <div class="section-heading">
            <div>
              <small>01 / ACCOUNT</small>
              <h2 id="profile-heading">Local profile</h2>
            </div>
            <div class="profile-avatar">{{ preferences.initials() }}</div>
          </div>
          <label class="setting-label"
            >Display name<input
              [value]="preferences.profileName()"
              (change)="saveName($event)"
              autocomplete="name"
          /></label>
          <p class="setting-help">
            Your name appears in the workspace header. This profile is saved on this device.
          </p>
        </section>
        <section class="settings-section" aria-labelledby="appearance-heading">
          <div class="section-heading">
            <div>
              <small>02 / APPEARANCE</small>
              <h2 id="appearance-heading">Theme</h2>
            </div>
          </div>
          <div class="theme-options" role="group" aria-label="Theme">
            @for (option of themes; track option.value) {
              <button
                [class.selected]="preferences.theme() === option.value"
                (click)="preferences.setTheme(option.value)"
              >
                <span class="theme-icon">{{ option.icon }}</span
                ><strong>{{ option.label }}</strong
                ><small>{{ option.description }}</small>
              </button>
            }
          </div>
          <p class="setting-help">
            System follows your device appearance. Your choice applies to every Thread screen.
          </p>
        </section>
        <section class="settings-section about">
          <div class="section-heading">
            <div>
              <small>03 / ABOUT</small>
              <h2>Thread</h2>
            </div>
          </div>
          <p>A quiet place to arrange ideas, tasks, images, and the connections between them.</p>
          <p>Canvas content and preferences are saved locally in this browser.</p>
        </section>
      </div>
    </main>
  `,
  styles: [
    `
      :host {
        display: block;
        min-height: 100vh;
        background: var(--color-background);
        color: var(--color-text-primary);
      }
      .settings-page {
        min-height: 100vh;
        font-family: Inter, ui-sans-serif, system-ui, sans-serif;
      }
      .settings-header {
        display: flex;
        align-items: center;
        gap: 13px;
        height: 56px;
        padding: 0 22px;
        border-bottom: 1px solid var(--color-border-light);
        background: var(--color-surface);
      }
      .settings-header button {
        width: 28px;
        height: 28px;
        border: 0;
        background: none;
        color: var(--color-text-secondary);
        font-size: 20px;
        cursor: pointer;
      }
      .settings-header strong {
        font-size: 14px;
        font-weight: 850;
        letter-spacing: -0.05em;
      }
      .settings-header strong span {
        color: var(--color-primary);
      }
      .settings-header > span {
        margin-left: auto;
        color: var(--color-text-secondary);
        font-size: 12px;
      }
      .settings-shell {
        width: min(760px, calc(100% - 36px));
        margin: 56px auto 90px;
      }
      .settings-intro {
        margin-bottom: 40px;
      }
      .settings-intro > span,
      .section-heading small {
        color: var(--color-primary);
        font-size: 10px;
        font-weight: 800;
        letter-spacing: 0.16em;
      }
      .settings-intro h1 {
        margin: 8px 0;
        font-size: 42px;
        line-height: 1.1;
        letter-spacing: -0.055em;
      }
      .settings-intro p,
      .setting-help,
      .about p {
        color: var(--color-text-secondary);
        font-size: 13px;
        line-height: 1.6;
      }
      .settings-section {
        padding: 27px 0 30px;
        border-top: 1px solid var(--color-border);
      }
      .section-heading {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 20px;
      }
      .section-heading h2 {
        margin: 5px 0 0;
        font-size: 19px;
        letter-spacing: -0.035em;
      }
      .profile-avatar {
        display: grid;
        place-items: center;
        width: 43px;
        height: 43px;
        background: var(--color-primary);
        color: white;
        font-size: 14px;
        font-weight: 750;
      }
      .setting-label {
        display: flex;
        flex-direction: column;
        gap: 8px;
        max-width: 360px;
        font-size: 12px;
        font-weight: 650;
      }
      .setting-label input {
        height: 39px;
        padding: 0 11px;
        border: 1px solid var(--color-border);
        background: var(--color-surface);
        color: var(--color-text-primary);
        outline: none;
      }
      .setting-label input:focus {
        border-color: var(--color-primary);
      }
      .setting-help {
        margin: 10px 0 0;
      }
      .theme-options {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 10px;
      }
      .theme-options button {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 5px;
        min-height: 105px;
        padding: 15px;
        border: 1px solid var(--color-border);
        background: var(--color-surface);
        color: var(--color-text-primary);
        text-align: left;
        cursor: pointer;
      }
      .theme-options button.selected {
        border-color: var(--color-primary);
        outline: 1px solid var(--color-primary);
      }
      .theme-icon {
        color: var(--color-primary);
        font-size: 19px;
      }
      .theme-options strong {
        font-size: 13px;
      }
      .theme-options small {
        color: var(--color-text-muted);
        font-size: 11px;
      }
      .about p {
        margin: 5px 0;
      }
      @media (max-width: 600px) {
        .settings-shell {
          margin-top: 34px;
        }
        .settings-intro h1 {
          font-size: 34px;
        }
        .theme-options {
          grid-template-columns: 1fr;
        }
        .theme-options button {
          min-height: 65px;
        }
        .settings-section {
          padding: 23px 0;
        }
      }
    `,
  ],
})
export class SettingsPage {
  readonly preferences = inject(PreferencesService);
  private readonly router = inject(Router);
  readonly themes: { value: ThemeChoice; label: string; icon: string; description: string }[] = [
    { value: 'light', label: 'Light', icon: '☀', description: 'Warm and bright' },
    { value: 'dark', label: 'Dark', icon: '◐', description: 'Quiet after hours' },
    { value: 'system', label: 'System', icon: '◫', description: 'Match your device' },
  ];
  back(): void {
    this.router.navigate(['/spaces']);
  }
  saveName(event: Event): void {
    this.preferences.setProfileName((event.target as HTMLInputElement).value);
  }
}
