import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnDestroy,
  Output,
  ViewChild,
  ViewEncapsulation,
  inject,
  signal,
} from '@angular/core';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TextStyleKit } from '@tiptap/extension-text-style';

@Component({
  selector: 'app-rich-text-editor',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: `
    <div #toolbar class="rich-toolbar" (pointerdown)="$event.stopPropagation()">
      <button
        type="button"
        [class.active]="active('bold')"
        (mousedown)="$event.preventDefault()"
        (click)="command('bold')"
        aria-label="Bold"
      >
        <b>B</b>
      </button>
      <button
        type="button"
        [class.active]="active('italic')"
        (mousedown)="$event.preventDefault()"
        (click)="command('italic')"
        aria-label="Italic"
      >
        <i>I</i>
      </button>
      <button
        type="button"
        [class.active]="active('underline')"
        (mousedown)="$event.preventDefault()"
        (click)="command('underline')"
        aria-label="Underline"
      >
        <u>U</u>
      </button>
      <span></span>
      <button
        type="button"
        [class.active]="active('heading')"
        (mousedown)="$event.preventDefault()"
        (click)="command('heading')"
        aria-label="Heading"
      >
        H
      </button>
      <button
        type="button"
        [class.active]="active('bulletList')"
        (mousedown)="$event.preventDefault()"
        (click)="command('bulletList')"
        aria-label="Bulleted list"
      >
        • List
      </button>
      <button
        type="button"
        [class.active]="active('orderedList')"
        (mousedown)="$event.preventDefault()"
        (click)="command('orderedList')"
        aria-label="Numbered list"
      >
        1. List
      </button>
      <select aria-label="Text size" (change)="size($event)">
        <option value="">Size</option>
        <option value="14px">14</option>
        <option value="16px">16</option>
        <option value="20px">20</option>
        <option value="24px">24</option>
        <option value="32px">32</option>
      </select>
      <input type="color" aria-label="Text color" value="#111111" (change)="color($event)" />
    </div>
    <div #mount class="rich-mount" (pointerdown)="$event.stopPropagation()"></div>
  `,
  styles: [
    `
      app-rich-text-editor {
        display: block;
        min-width: 0;
        min-height: 0;
        width: 100%;
      }
      .rich-toolbar {
        position: fixed;
        z-index: 80;
        bottom: calc(18px + env(safe-area-inset-bottom));
        left: 50%;
        display: flex;
        align-items: center;
        gap: 2px;
        width: max-content;
        max-width: calc(100vw - 24px);
        overflow: auto;
        margin: 0;
        padding: 5px;
        transform: translateX(-50%);
        border: 1px solid var(--color-border);
        border-radius: 8px;
        background: var(--color-surface);
        box-shadow: var(--shadow-md);
      }
      .rich-toolbar button {
        min-width: 27px;
        height: 26px;
        padding: 0 5px;
        border: 0;
        background: none;
        color: var(--color-text-secondary);
        font-size: 11px;
        cursor: pointer;
      }
      .rich-toolbar button.active,
      .rich-toolbar button:hover {
        background: var(--color-primary-subtle);
        color: var(--color-primary);
      }
      .rich-toolbar span {
        width: 1px;
        height: 18px;
        margin: 0 3px;
        background: var(--color-border);
      }
      .rich-toolbar select {
        height: 26px;
        max-width: 50px;
        border: 0;
        background: transparent;
        color: var(--color-text-secondary);
        font-size: 11px;
      }
      .rich-toolbar input {
        width: 26px;
        height: 24px;
        padding: 0;
        border: 0;
        background: none;
      }
      .rich-mount {
        min-width: 0;
        min-height: 32px;
        max-height: 100%;
        overflow: auto;
      }
      .rich-mount :focus {
        outline: none;
      }
      .rich-mount .tiptap {
        min-height: 32px;
        outline: 1px solid var(--color-primary);
        outline-offset: 3px;
        overflow-wrap: anywhere;
      }
      .rich-mount p {
        margin: 0 0 0.5em;
      }
      .rich-mount ul,
      .rich-mount ol {
        margin: 0.2em 0 0.5em;
        padding-left: 1.5em;
      }
      .rich-mount h2 {
        margin: 0.25em 0;
        font-size: 1.3em;
      }
      @media (max-width: 700px) {
        .rich-toolbar {
          bottom: calc(73px + env(safe-area-inset-bottom));
          width: calc(100vw - 16px);
          justify-content: flex-start;
        }
        .rich-toolbar button {
          min-width: 38px;
          height: 38px;
          font-size: 14px;
        }
        .rich-toolbar select {
          height: 38px;
          font-size: 14px;
        }
        .rich-toolbar input {
          width: 38px;
          height: 38px;
          flex: none;
        }
      }
    `,
  ],
})
export class RichTextEditor implements AfterViewInit, OnDestroy {
  private readonly host = inject(ElementRef<HTMLElement>);
  @ViewChild('mount', { static: true }) mount!: ElementRef<HTMLElement>;
  @ViewChild('toolbar', { static: true }) toolbar!: ElementRef<HTMLElement>;
  @Input() html = '';
  @Input() focusOnInit = false;
  @Output() contentChanged = new EventEmitter<{ html: string; text: string }>();
  @Output() finished = new EventEmitter<void>();
  private editor: Editor | null = null;
  private lastSelection: { from: number; to: number } | null = null;
  readonly revision = signal(0);

  ngAfterViewInit(): void {
    document.body.appendChild(this.toolbar.nativeElement);
    this.editor = new Editor({
      element: this.mount.nativeElement,
      extensions: [StarterKit, TextStyleKit],
      content: this.html || '<p></p>',
      editorProps: { attributes: { class: 'tiptap' } },
      onUpdate: ({ editor }) => {
        this.contentChanged.emit({ html: editor.getHTML(), text: editor.getText() });
        this.revision.update((value) => value + 1);
      },
      onSelectionUpdate: ({ editor }) => {
        if (editor.isFocused)
          this.lastSelection = { from: editor.state.selection.from, to: editor.state.selection.to };
        this.revision.update((value) => value + 1);
      },
      onBlur: () =>
        setTimeout(() => {
          const active = document.activeElement;
          const node = this.host.nativeElement.closest('[data-node-id]');
          if (
            !this.toolbar.nativeElement.contains(active) &&
            !this.host.nativeElement.contains(active) &&
            (!node || !node.contains(active))
          )
            this.finished.emit();
        }),
    });
    if (this.focusOnInit) queueMicrotask(() => this.editor?.commands.focus('end'));
  }
  ngOnDestroy(): void {
    this.editor?.destroy();
    this.editor = null;
    this.toolbar.nativeElement.remove();
  }
  active(mark: string): boolean {
    this.revision();
    return this.editor?.isActive(mark) || false;
  }
  command(name: string): void {
    const chain = this.editor?.chain().focus();
    if (!chain) return;
    switch (name) {
      case 'bold':
        chain.toggleBold().run();
        break;
      case 'italic':
        chain.toggleItalic().run();
        break;
      case 'underline':
        chain.toggleUnderline().run();
        break;
      case 'heading':
        chain.toggleHeading({ level: 2 }).run();
        break;
      case 'bulletList':
        chain.toggleBulletList().run();
        break;
      case 'orderedList':
        chain.toggleOrderedList().run();
        break;
    }
  }
  size(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (value) this.editor?.chain().focus().setFontSize(value).run();
  }
  color(event: Event): void {
    if (!this.editor) return;
    const chain = this.editor.chain().focus();
    if (this.lastSelection) chain.setTextSelection(this.lastSelection);
    chain.setColor((event.target as HTMLInputElement).value).run();
  }
}
