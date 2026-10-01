import { Directive, computed, input } from '@angular/core';

type ScrollDirection = 'x' | 'y' | 'both';
type ScrollbarMode = 'auto' | 'hover' | 'hidden';

@Directive({
  selector: '[appScroll]',
  standalone: true,
  host: {
    'class': 'app-scroll',
    '[class.app-scroll-x]': "direction() === 'x'",
    '[class.app-scroll-y]': "direction() === 'y'",
    '[class.app-scroll-both]': "direction() === 'both'",
    '[class.app-scroll-hover]': "scrollbar() === 'hover'",
    '[class.app-scroll-hidden]': "scrollbar() === 'hidden'",
  },
})
export class ScrollDirective {
  readonly requestedDirection = input<ScrollDirection | ''>('y', { alias: 'appScroll' });
  readonly direction = computed(() => this.requestedDirection() || 'y');
  readonly scrollbar = input<ScrollbarMode>('auto');
}
