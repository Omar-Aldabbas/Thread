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
  signal,
} from '@angular/core';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TextStyleKit } from '@tiptap/extension-text-style';
import { ScrollDirective } from '../../../shared/scroll.directive';

@Component({
  selector: 'app-rich-text-editor',
  standalone: true,
  imports: [ScrollDirective],
  encapsulation: ViewEncapsulation.None,
  template: `
    <div
      #mount
      class="rich-mount"
      appScroll="y"
      scrollbar="hover"
      (pointerdown)="$event.stopPropagation()"
      (keydown)="editorKey($event)"
    ></div>
  `,
  styles: [
    `
      app-rich-text-editor {
        display: block;
        min-width: 0;
        min-height: 0;
        width: 100%;
      }
      .rich-mount {
        min-width: 0;
        min-height: 32px;
        max-height: 100%;
        overflow-x: hidden;
        overflow-y: auto;
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
    `,
  ],
})
export class RichTextEditor implements AfterViewInit, OnDestroy {
  editorKey(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    this.finished.emit();
  }
  @ViewChild('mount', { static: true }) mount!: ElementRef<HTMLElement>;
  @Input() html = '';
  @Input() focusOnInit = false;
  @Output() contentChanged = new EventEmitter<{ html: string; text: string }>();
  @Output() finished = new EventEmitter<void>();
  private editor: Editor | null = null;
  private lastSelection: { from: number; to: number } | null = null;
  readonly revision = signal(0);

  ngAfterViewInit(): void {
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
    });
    if (this.focusOnInit) queueMicrotask(() => this.editor?.commands.focus('end'));
  }
  ngOnDestroy(): void {
    this.editor?.destroy();
    this.editor = null;
  }
  active(mark: string): boolean {
    this.revision();
    return this.editor?.isActive(mark) || false;
  }
  command(name: string): void {
    const chain = this.editor?.chain().focus();
    if (!chain) return;
    if (this.lastSelection) chain.setTextSelection(this.lastSelection);
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
    if (!value || !this.editor) return;
    const chain = this.editor.chain().focus();
    if (this.lastSelection) chain.setTextSelection(this.lastSelection);
    chain.setFontSize(`${value}px`).run();
  }
  color(value: string): void {
    if (!this.editor) return;
    const chain = this.editor.chain().focus();
    if (this.lastSelection) chain.setTextSelection(this.lastSelection);
    chain.setColor(value).run();
  }
}
