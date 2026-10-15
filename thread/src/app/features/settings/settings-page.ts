import { Component, inject } from '@angular/core';
import { signal } from '@angular/core';
import { LucideDynamicIcon, LucideSun, LucideMoon, LucideMonitor } from '@lucide/angular';
import { Router } from '@angular/router';
import { PreferencesService, ThemeChoice } from '../../shared/preferences.service';
import { ThreadHeader } from '../../shared/thread-header';
import { ScrollDirective } from '../../shared/scroll.directive';
import { createWorkspaceBackup, parseWorkspaceBackup, restoreWorkspaceBackup } from './workspace-backup';

@Component({
  selector: 'app-settings-page',
  standalone: true,
  imports: [ThreadHeader, ScrollDirective, LucideDynamicIcon],
  template: `
    <main class="settings-page">
      <app-thread-header title="Settings" />
      <div class="settings-scroll" appScroll="y" scrollbar="auto">
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
                <span class="theme-icon"><svg [lucideIcon]="option.icon" aria-hidden="true"></svg></span
                ><strong>{{ option.label }}</strong
                ><small>{{ option.description }}</small>
              </button>
            }
          </div>
          <p class="setting-help">
            System follows your device appearance. Your choice applies to every Thread screen.
          </p>
        </section>
        <section class="settings-section" aria-labelledby="canvas-heading">
          <div class="section-heading">
            <div>
              <small>03 / CANVAS</small>
              <h2 id="canvas-heading">Canvas zoom</h2>
            </div>
          </div>
          <label class="setting-label" for="min-zoom">Minimum zoom</label>
          <div class="zoom-setting">
            <input id="min-zoom" type="range" min="5" max="100" step="1"
              [value]="preferences.minZoomPercent()"
              (input)="saveMinZoom($event)" />
            <output for="min-zoom">{{ preferences.minZoomPercent() }}%</output>
          </div>
          <p class="setting-help">The canvas will not zoom out below this level. Default: 12%.</p>
          <div class="settings-grid">
            <label class="setting-label">Opening zoom <input type="number" min="25" max="200" [disabled]="preferences.fitOnOpen()" [value]="preferences.defaultZoomPercent()" (change)="setNumber('defaultZoomPercent', $event, 25, 200)" /></label>
            <label class="setting-label">Zoom speed <input type="range" min="5" max="20" [value]="preferences.zoomSpeed()" (input)="setNumber('zoomSpeed', $event, 5, 20)" /><span>{{ preferences.zoomSpeed() }}</span></label>
            <label class="setting-label">New connector style <select [value]="preferences.defaultConnector()" (change)="setChoice('defaultConnector', $event)"><option value="elbow">Elbow</option><option value="straight">Straight</option><option value="curved">Curved</option></select></label>
          </div>
          <div class="toggle-list">
            <label><span><strong>Fit canvas on open</strong><small>Show the whole board when opening a space.</small></span><input type="checkbox" [checked]="preferences.fitOnOpen()" (change)="preferences.fitOnOpen.set(checked($event))" /></label>
            <label><span><strong>Show grid</strong><small>Display canvas dots.</small></span><input type="checkbox" [checked]="preferences.showGrid()" (change)="preferences.showGrid.set(checked($event))" /></label>
            <label><span><strong>Snap to objects</strong><small>Align moved items with nearby items.</small></span><input type="checkbox" [checked]="preferences.snapToObjects()" (change)="preferences.snapToObjects.set(checked($event))" /></label>
            <label><span><strong>Snap to grid</strong><small>Place moved items on the 24 px grid.</small></span><input type="checkbox" [checked]="preferences.snapToGrid()" (change)="preferences.snapToGrid.set(checked($event))" /></label>
          </div>
        </section>
        <section class="settings-section" aria-labelledby="defaults-heading">
          <div class="section-heading"><div><small>04 / DEFAULTS</small><h2 id="defaults-heading">New items</h2></div></div>
          <div class="settings-grid">
            <label class="setting-label">Note accent <input type="color" [value]="preferences.defaultNoteColor()" (input)="setChoice('defaultNoteColor', $event)" /></label>
            <label class="setting-label">Text size <input type="number" min="12" max="40" [value]="preferences.defaultFontSize()" (change)="setNumber('defaultFontSize', $event, 12, 40)" /></label>
            <label class="setting-label">Budget currency <select [value]="preferences.defaultCurrency()" (change)="setChoice('defaultCurrency', $event)"><option>JOD</option><option>USD</option><option>EUR</option><option>GBP</option></select></label>
            <label class="setting-label">Chart type <select [value]="preferences.defaultChart()" (change)="setChoice('defaultChart', $event)"><option value="auto">Automatic</option><option value="bar">Bar</option><option value="line">Line</option><option value="donut">Donut</option><option value="comparison">Comparison</option></select></label>
            <label class="setting-label">Shape <select [value]="preferences.defaultShape()" (change)="setChoice('defaultShape', $event)"><option value="rectangle">Rectangle</option><option value="rounded">Rounded</option><option value="circle">Circle</option><option value="diamond">Diamond</option></select></label>
          </div>
        </section>
        <section class="settings-section" aria-labelledby="access-heading">
          <div class="section-heading"><div><small>05 / ACCESSIBILITY</small><h2 id="access-heading">Comfort and clarity</h2></div></div>
          <div class="toggle-list">
            <label><span><strong>Reduce motion</strong><small>Remove interface transitions and animation.</small></span><input type="checkbox" [checked]="preferences.reducedMotion()" (change)="preferences.reducedMotion.set(checked($event))" /></label>
            <label><span><strong>Larger controls</strong><small>Increase the size of buttons and fields.</small></span><input type="checkbox" [checked]="preferences.largerControls()" (change)="preferences.largerControls.set(checked($event))" /></label>
            <label><span><strong>High contrast</strong><small>Strengthen text and borders.</small></span><input type="checkbox" [checked]="preferences.highContrast()" (change)="preferences.highContrast.set(checked($event))" /></label>
          </div>
          <details class="shortcut-help"><summary>Keyboard shortcuts</summary><p>V select · H pan · N add · T text · S shapes · P sketch · C connect · Ctrl/Cmd + Z undo · Delete remove selection.</p></details>
        </section>
        <section class="settings-section" aria-labelledby="workspace-heading">
          <div class="section-heading"><div><small>06 / WORKSPACE</small><h2 id="workspace-heading">Opening Thread</h2></div></div>
          <div class="toggle-list"><label><span><strong>Reopen last space</strong><small>Open the last visited canvas when Thread starts.</small></span><input type="checkbox" [checked]="preferences.reopenLastSpace()" (change)="preferences.reopenLastSpace.set(checked($event))" /></label></div>
          @if (spaces().length) { <label class="setting-label preferred-space">Default space <select [value]="preferences.preferredSpaceId()" (change)="setChoice('preferredSpaceId', $event)"><option value="">Spaces overview</option>@for (space of spaces(); track space.id) { <option [value]="space.id">{{ space.title }}</option> }</select></label> }
        </section>
        <section class="settings-section" aria-labelledby="data-heading">
          <div class="section-heading"><div><small>07 / DATA</small><h2 id="data-heading">Backup and storage</h2></div></div>
          <p class="setting-help">Spaces are stored in this browser. Download a backup before clearing browser data or moving devices.</p>
          <div class="data-actions"><button type="button" (click)="downloadBackup()">Download backup</button><button type="button" (click)="backupInput.click()">Restore backup</button><input #backupInput type="file" accept="application/json,.json" hidden (change)="restoreBackup($event)" /></div>
          <p class="setting-help" role="status">{{ dataMessage() }}</p>
          <p class="setting-help">Thread data uses approximately {{ storageSize() }} in this browser.</p>
          @if (spaces().length) {
            <div class="stored-spaces"><strong>Saved spaces</strong>
              @for (space of spaces(); track space.id) {
                <div><span>{{ space.title }}</span><button type="button" (click)="deleteSpace(space.id, space.title)" [attr.aria-label]="'Delete ' + space.title">Delete</button></div>
              }
            </div>
          }
        </section>
        <section class="settings-section about">
          <div class="section-heading">
            <div>
              <small>08 / ABOUT</small>
              <h2>Thread</h2>
            </div>
          </div>
          <p>A quiet place to arrange ideas, tasks, images, and the connections between them.</p>
          <p>Canvas content and preferences are saved locally in this browser.</p>
        </section>
      </div>
      </div>
    </main>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100dvh;
        overflow: hidden;
        background: var(--color-background);
        color: var(--color-text-primary);
      }
      .settings-page {
        display:flex;
        flex-direction:column;
        height:100%;
        min-height:0;
        font-family: Inter, ui-sans-serif, system-ui, sans-serif;
      }
      .settings-scroll { flex:1; min-height:0; }
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
      .setting-label select { height:39px; padding:0 11px; border:1px solid var(--color-border); background:var(--color-surface); color:var(--color-text-primary); }
      .setting-label input[type=color] { width:74px; padding:3px; cursor:pointer; }
      .settings-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:18px; margin-top:22px; }
      .settings-grid .setting-label { min-width:0; }
      .toggle-list { margin-top:20px; border-top:1px solid var(--color-border-light); }
      .toggle-list label { display:flex; align-items:center; justify-content:space-between; gap:20px; padding:13px 2px; border-bottom:1px solid var(--color-border-light); cursor:pointer; }
      .toggle-list label span { display:flex; flex-direction:column; gap:3px; }
      .toggle-list strong,.stored-spaces strong { font-size:13px; }
      .toggle-list small { color:var(--color-text-secondary); font-size:11px; }
      .toggle-list input { width:18px; height:18px; accent-color:var(--color-primary); }
      .shortcut-help { margin-top:17px; color:var(--color-text-secondary); font-size:12px; }
      .shortcut-help summary { cursor:pointer; font-weight:700; }
      .shortcut-help p { line-height:1.7; }
      .data-actions { display:flex; flex-wrap:wrap; gap:9px; margin-top:17px; }
      .data-actions button,.stored-spaces button { padding:9px 13px; border:1px solid var(--color-border); background:var(--color-surface); color:var(--color-text-primary); font:inherit; font-size:12px; font-weight:700; cursor:pointer; }
      .data-actions button:hover,.stored-spaces button:hover { border-color:var(--color-primary); color:var(--color-primary); }
      .stored-spaces { margin-top:22px; }
      .preferred-space { margin-top:20px; }
      .stored-spaces > div { display:flex; justify-content:space-between; align-items:center; gap:12px; padding:8px 0; border-bottom:1px solid var(--color-border-light); font-size:12px; }
      .stored-spaces button { color:var(--color-primary); }
      .setting-help {
        margin: 10px 0 0;
      }
      .zoom-setting { display:flex; align-items:center; gap:16px; width:min(360px,100%); }
      .zoom-setting input { flex:1; min-width:0; accent-color:var(--color-primary); cursor:pointer; }
      .zoom-setting output { min-width:42px; font-size:13px; font-weight:750; font-variant-numeric:tabular-nums; }
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
        .settings-grid { grid-template-columns:1fr; }
      }
    `,
  ],
})
export class SettingsPage {
  readonly preferences = inject(PreferencesService);
  private readonly router = inject(Router);
  readonly dataMessage = signal('');
  readonly spaces = signal<{ id: string; title: string }[]>(this.readSpaces());
  readonly themes = [
    { value: 'light' as ThemeChoice, label: 'Light', icon: LucideSun, description: 'Warm and bright' },
    { value: 'dark' as ThemeChoice, label: 'Dark', icon: LucideMoon, description: 'Quiet after hours' },
    { value: 'system' as ThemeChoice, label: 'System', icon: LucideMonitor, description: 'Match your device' },
  ];
  back(): void {
    this.router.navigate(['/spaces']);
  }
  saveName(event: Event): void {
    this.preferences.setProfileName((event.target as HTMLInputElement).value);
  }
  saveMinZoom(event: Event): void {
    this.preferences.setMinZoomPercent(Number((event.target as HTMLInputElement).value));
  }
  checked(event: Event): boolean { return (event.target as HTMLInputElement).checked; }
  setNumber(key: 'defaultZoomPercent' | 'zoomSpeed' | 'defaultFontSize', event: Event, min: number, max: number): void {
    const input = event.target as HTMLInputElement;
    const value = Number(input.value);
    if (!Number.isFinite(value)) return;
    const next = Math.min(max, Math.max(min, Math.round(value)));
    this.preferences[key].set(next);
    input.value = String(next);
  }
  setChoice(key: 'defaultConnector' | 'defaultNoteColor' | 'defaultCurrency' | 'defaultChart' | 'defaultShape' | 'preferredSpaceId', event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    if (key === 'defaultConnector' && ['straight', 'elbow', 'curved'].includes(value))
      this.preferences.defaultConnector.set(value as 'straight' | 'elbow' | 'curved');
    if (key === 'defaultCurrency' && ['JOD', 'USD', 'EUR', 'GBP'].includes(value))
      this.preferences.defaultCurrency.set(value as 'JOD' | 'USD' | 'EUR' | 'GBP');
    if (key === 'defaultNoteColor' && /^#[0-9a-f]{6}$/i.test(value)) this.preferences.defaultNoteColor.set(value);
    if (key === 'defaultChart' && ['auto', 'bar', 'line', 'donut', 'comparison'].includes(value))
      this.preferences.defaultChart.set(value as 'auto' | 'bar' | 'line' | 'donut' | 'comparison');
    if (key === 'defaultShape' && ['rectangle', 'rounded', 'circle', 'diamond'].includes(value))
      this.preferences.defaultShape.set(value as 'rectangle' | 'rounded' | 'circle' | 'diamond');
    if (key === 'preferredSpaceId' && (!value || this.spaces().some((space) => space.id === value)))
      this.preferences.preferredSpaceId.set(value);
  }
  private readSpaces(): { id: string; title: string }[] {
    try {
      const spaces = JSON.parse(localStorage.getItem('thread-spaces') || '[]');
      return Array.isArray(spaces) ? spaces.filter((space) => typeof space.id === 'string' && typeof space.title === 'string') : [];
    } catch { return []; }
  }
  storageSize(): string {
    try {
      const bytes = new Blob(Object.values(createWorkspaceBackup(localStorage).storage)).size;
      return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
    } catch { return 'unavailable'; }
  }
  downloadBackup(): void {
    try {
      const backup = createWorkspaceBackup(localStorage);
      const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `thread-backup-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      this.dataMessage.set('Backup downloaded.');
    } catch { this.dataMessage.set('Could not create the backup.'); }
  }
  async restoreBackup(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const backup = parseWorkspaceBackup(await file.text());
      if (!window.confirm('Replace the saved spaces on this device with this backup?')) return;
      restoreWorkspaceBackup(localStorage, backup);
      this.spaces.set(this.readSpaces());
      this.dataMessage.set('Backup restored. Open Spaces to see your boards.');
    } catch (error) {
      this.dataMessage.set(error instanceof Error ? error.message : 'Could not restore the backup.');
    } finally { input.value = ''; }
  }
  deleteSpace(id: string, title: string): void {
    if (!window.confirm(`Delete “${title}” and its canvas from this device?`)) return;
    const remaining = this.readSpaces().filter((space) => space.id !== id);
    try {
      localStorage.setItem('thread-spaces', JSON.stringify(remaining));
      localStorage.removeItem(`thread-canvas-${id}`);
      if (this.preferences.preferredSpaceId() === id) this.preferences.preferredSpaceId.set('');
      this.spaces.set(remaining);
      this.dataMessage.set(`Deleted ${title}.`);
    } catch { this.dataMessage.set('Could not delete this space.'); }
  }
}
