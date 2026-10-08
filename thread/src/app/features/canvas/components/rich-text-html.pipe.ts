import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Pipe, PipeTransform, PLATFORM_ID, SecurityContext, inject } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

const allowedTags = new Set([
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'span', 'div',
]);
const discardedTags = new Set(['script', 'style', 'iframe', 'object', 'embed', 'svg', 'math', 'form']);
const safeColor = /^(?:#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})|rgba?\([\d.,%\s/]+\))$/i;

@Pipe({ name: 'richTextHtml', standalone: true, pure: true })
export class RichTextHtmlPipe implements PipeTransform {
  private readonly document = inject(DOCUMENT);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  transform(html: string | undefined): SafeHtml | string {
    if (!html) return '';
    if (!this.browser) return this.sanitizer.sanitize(SecurityContext.HTML, html) || '';

    const source = this.document.createElement('template');
    const output = this.document.createElement('div');
    source.innerHTML = html;

    const copy = (node: Node, parent: Node): void => {
      if (node.nodeType === 3) {
        parent.appendChild(this.document.createTextNode(node.textContent || ''));
        return;
      }
      if (node.nodeType !== 1) return;
      const element = node as HTMLElement;
      const tag = element.tagName.toLowerCase();
      if (discardedTags.has(tag)) return;
      const allowed = allowedTags.has(tag);
      const destination = allowed ? this.document.createElement(tag) : parent;
      if (allowed) {
        const safeElement = destination as HTMLElement;
        if (tag === 'span') {
          const color = element.style.color.trim();
          const fontSize = element.style.fontSize.trim();
          if (safeColor.test(color)) safeElement.style.color = color;
          if (/^\d+(?:\.\d+)?px$/.test(fontSize)) {
            const size = Number.parseFloat(fontSize);
            if (size >= 8 && size <= 96)
              safeElement.style.fontSize = `${size}px`;
          }
        }
        if (tag === 'ol') {
          const start = Number(element.getAttribute('start'));
          if (Number.isSafeInteger(start) && start > 0) safeElement.setAttribute('start', String(start));
        }
        parent.appendChild(destination);
      }
      for (const child of Array.from(element.childNodes)) copy(child, destination);
    };

    for (const child of Array.from(source.content.childNodes)) copy(child, output);
    return this.sanitizer.bypassSecurityTrustHtml(output.innerHTML);
  }
}
