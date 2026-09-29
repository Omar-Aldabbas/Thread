import {
  Component,
  computed,
  ElementRef,
  HostListener,
  inject,
  PLATFORM_ID,
  signal,
  viewChild,
} from '@angular/core';

import { isPlatformBrowser } from '@angular/common';

import { ActivatedRoute, Router, RouterLink, RouterOutlet } from '@angular/router';

import { toSignal } from '@angular/core/rxjs-interop';

interface StoredSpace {
  id: string;
  title: string;
  itemCount: number;
  updatedAt: string;
}

@Component({
  selector: 'app-canvas-layout',

  imports: [RouterOutlet, RouterLink],

  templateUrl: './canvas-layout.html',

  styleUrl: './canvas-layout.css',
})
export class CanvasLayout {
  private readonly router = inject(Router);

  private readonly route = inject(ActivatedRoute);

  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly storageKey = 'thread-spaces';

  /*
   * =========================
   * SEARCH
   * =========================
   */

  readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  readonly searchQuery = signal('');

  readonly isSearchExpanded = signal(false);

  /*
   * =========================
   * PANELS
   * =========================
   */

  readonly isInfoPanelOpen = signal(false);

  readonly isProfileOpen = signal(false);

  /*
   * =========================
   * ROUTE
   * =========================
   */

  private readonly routeParams = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });

  readonly spaceId = computed(() => {
    return this.routeParams().get('id') ?? '';
  });

  /*
   * =========================
   * LOCAL DATA
   * =========================
   */

  readonly spaces = signal<StoredSpace[]>(this.loadSpaces());

  readonly currentSpace = computed<StoredSpace | null>(() => {
    const id = this.spaceId();

    return this.spaces().find((space) => space.id === id) ?? null;
  });

  readonly spaceName = computed(() => {
    return this.currentSpace()?.title ?? 'Untitled Space';
  });

  readonly spaceItemCount = computed(() => {
    return this.currentSpace()?.itemCount ?? 0;
  });

  readonly spaceUpdatedAt = computed(() => {
    return this.currentSpace()?.updatedAt ?? 'Not available';
  });

  /*
   * =========================
   * NAVIGATION
   * =========================
   */

  goToSpaces(): void {
    this.router.navigate(['/spaces']);
  }

  /*
   * =========================
   * SEARCH
   * =========================
   */

  updateSearch(event: Event): void {
    const input = event.target as HTMLInputElement;

    this.searchQuery.set(input.value);
  }

  clearSearch(): void {
    this.searchQuery.set('');

    this.searchInput()?.nativeElement.focus();
  }

  openSearch(): void {
    this.isSearchExpanded.set(true);

    setTimeout(() => {
      this.searchInput()?.nativeElement.focus();
    });
  }

  closeSearch(): void {
    if (this.searchQuery().trim()) {
      return;
    }

    this.isSearchExpanded.set(false);
  }

  /*
   * =========================
   * INFO PANEL
   * =========================
   */

  toggleInfoPanel(): void {
    this.isInfoPanelOpen.update((value) => !value);

    this.isProfileOpen.set(false);
  }

  closeInfoPanel(): void {
    this.isInfoPanelOpen.set(false);
  }

  /*
   * =========================
   * PROFILE
   * =========================
   */

  toggleProfile(): void {
    this.isProfileOpen.update((value) => !value);

    this.isInfoPanelOpen.set(false);
  }

  closeProfile(): void {
    this.isProfileOpen.set(false);
  }

  /*
   * =========================
   * KEYBOARD
   * =========================
   */

  @HostListener('window:keydown', ['$event'])
  handleKeyboard(event: KeyboardEvent): void {
    const target = event.target as HTMLElement;

    const isTyping = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';

    /*
     * / opens search
     */
    if (event.key === '/' && !isTyping) {
      event.preventDefault();

      this.openSearch();

      return;
    }

    /*
     * Escape closes overlays
     */
    if (event.key === 'Escape') {
      this.isInfoPanelOpen.set(false);

      this.isProfileOpen.set(false);

      if (this.searchQuery()) {
        this.clearSearch();
      } else {
        this.isSearchExpanded.set(false);
      }
    }
  }

  /*
   * =========================
   * STORAGE
   * =========================
   */

  private loadSpaces(): StoredSpace[] {
    if (!this.isBrowser) {
      return [];
    }

    const stored = localStorage.getItem(this.storageKey);

    if (!stored) {
      return [];
    }

    try {
      return JSON.parse(stored) as StoredSpace[];
    } catch {
      return [];
    }
  }
}
