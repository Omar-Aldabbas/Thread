import { Component, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { PreferencesService } from './preferences.service';

@Component({
  selector: 'app-thread-header',
  standalone: true,
  template: `
    <header class="thread-header" data-ui>
      <button class="brand-button" type="button" (click)="goToSpaces()" aria-label="All spaces">THREAD<span>.</span></button>
      @if (title()) { <span class="header-divider"></span><span class="space-name">{{ title() }}</span> }
      <div class="header-actions"><ng-content /></div>
      <button class="profile-button" type="button" (click)="goToSettings()"
        [attr.aria-label]="'Profile and settings for ' + preferences.profileName()" title="Profile and settings">
        {{ preferences.initials() }}
      </button>
    </header>
  `,
  styles: [`
    :host { display:block; flex:none; position:relative; z-index:200; }
    .thread-header { display:flex; align-items:center; gap:16px; height:54px; padding:0 20px; border-bottom:1px solid var(--color-border-light); background:var(--color-surface); }
    button { cursor:pointer; border:0; }
    .brand-button { flex:none; padding:0; background:none; color:var(--color-text-primary); font-size:14px; font-weight:850; letter-spacing:-.045em; }
    .brand-button span { color:var(--color-primary); }
    .header-divider { flex:none; height:19px; width:1px; background:var(--color-border); }
    .space-name { overflow:hidden; max-width:42vw; white-space:nowrap; text-overflow:ellipsis; font-size:13px; font-weight:600; }
    .header-actions { display:flex; align-items:center; gap:7px; min-width:0; margin-left:auto; }
    .profile-button { display:grid; place-items:center; flex:none; width:34px; height:34px; border:1px solid var(--color-border); border-radius:50%; background:var(--color-surface-muted); color:var(--color-text-primary); font-size:11px; font-weight:750; }
    .profile-button:hover,.profile-button:focus-visible { border-color:var(--color-primary); color:var(--color-primary); }
    @media(max-width:700px) { .thread-header { height:52px; gap:10px; padding:0 12px; } .space-name { max-width:35vw; } .profile-button { width:38px; height:38px; } }
  `],
})
export class ThreadHeader {
  readonly title = input('');
  readonly preferences = inject(PreferencesService);
  private readonly router = inject(Router);
  goToSpaces(): void { this.router.navigate(['/spaces']); }
  goToSettings(): void { this.router.navigate(['/settings']); }
}
