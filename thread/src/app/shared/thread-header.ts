import { Component, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { PreferencesService } from './preferences.service';

@Component({
  selector: 'app-thread-header',
  standalone: true,
  template: `
    <header class="thread-header" data-ui>
      <div class="header-identity">
        <button class="brand-button" type="button" (click)="goToSpaces()" aria-label="All spaces">THREA<span>D</span>.</button>
        @if (title()) { <span class="header-divider"></span><span class="space-name">{{ title() }}</span> }
      </div>
      <div class="header-actions"><ng-content /></div>
      <button class="profile-button" type="button" (click)="goToSettings()"
        [attr.aria-label]="'Profile and settings for ' + preferences.profileName()" title="Profile and settings">
        {{ preferences.initials() }}
      </button>
    </header>
  `,
  styles: [`
    :host { display:block; flex:none; position:relative; z-index:200; }
    .thread-header { display:flex; align-items:center; gap:16px; height:60px; padding:0 20px; border-bottom:1px solid var(--color-border-light); background:color-mix(in srgb,var(--color-surface) 94%,var(--color-background)); box-shadow:0 2px 12px rgba(27,24,20,.035); }
    button { cursor:pointer; border:0; }
    .header-identity { display:flex; align-items:center; gap:14px; min-width:0; }
    .brand-button { position:relative; flex:none; padding:7px 0; background:none; color:var(--color-text-primary); font-size:15px; font-weight:900; letter-spacing:-.055em; }
    .brand-button span { color:var(--color-primary); }
    .brand-button::after { position:absolute; right:0; bottom:3px; left:0; height:2px; border-radius:2px; background:var(--color-primary); content:''; transform:scaleX(.32); transform-origin:left; transition:transform 180ms ease; }
    .brand-button:hover::after,.brand-button:focus-visible::after { transform:scaleX(1); }
    .header-divider { flex:none; height:23px; width:1px; background:var(--color-border); }
    .space-name { min-width:0; flex:0 1 auto; overflow:hidden; max-width:35vw; white-space:nowrap; text-overflow:ellipsis; color:var(--color-text-primary); font-size:13px; font-weight:750; }
    .header-actions { display:flex; align-items:center; gap:7px; min-width:0; margin-left:auto; }
    .profile-button { display:grid; place-items:center; flex:none; width:36px; height:36px; border:1px solid var(--color-border); border-radius:11px; background:var(--color-surface); color:var(--color-text-primary); font-size:11px; font-weight:800; }
    .profile-button:hover,.profile-button:focus-visible { border-color:var(--color-primary); color:var(--color-primary); outline:none; }
    @media(max-width:960px) { .thread-header { gap:10px; padding-inline:12px; }.space-name { max-width:27vw; } }
    @media(max-width:700px) { .thread-header { height:54px; gap:8px; padding:0 10px; }.header-identity { gap:8px; }.brand-button { font-size:13px; }.space-name { max-width:30vw; font-size:11px; }.header-divider { height:17px; }.header-actions { gap:3px; }.profile-button { width:33px; height:33px; border-radius:9px; } }
  `],
})
export class ThreadHeader {
  readonly title = input('');
  readonly preferences = inject(PreferencesService);
  private readonly router = inject(Router);
  goToSpaces(): void { this.router.navigate(['/spaces']); }
  goToSettings(): void { this.router.navigate(['/settings']); }
}
