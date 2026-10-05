import '@angular/compiler';
import { Injector, runInInjectionContext } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GiphyService } from '../giphy.service';
import { MediaPicker } from './media-picker';

function picker() {
  const fetch = vi.fn((_kind: string, _query: string, _offset: number, _signal: AbortSignal) => new Promise<any>(() => {}));
  const injector = Injector.create({ providers: [{ provide: GiphyService, useValue: { fetch } }] });
  const instance = runInInjectionContext(injector, () => new MediaPicker());
  instance.kind = 'sticker'; instance.ngOnInit();
  return { instance, fetch };
}

beforeEach(() => localStorage.clear());

describe('sticker packs', () => {
  it('opens Wevi and keeps the two local packs separate', () => {
    const { instance } = picker();
    expect(instance.visible()).toHaveLength(66);
    expect(instance.visible().every(entry => instance.previewSrc(entry).startsWith('/stickers/wevi/'))).toBe(true);
    instance.setCollection('Essentials');
    expect(instance.visible()).toHaveLength(20);
    expect(instance.visible().every(entry => !instance.previewSrc(entry).startsWith('/stickers/wevi/'))).toBe(true);
    instance.ngOnDestroy();
  });

  it('searches the selected Wevi group', () => {
    const { instance } = picker();
    instance.setCategory('Wevi Actions');
    instance.search({ target: { value: 'look here' } } as unknown as Event);
    expect(instance.visible().map(entry => entry.id)).toEqual(['wevi_actions.look-here']);
    instance.ngOnDestroy();
  });

  it('clears remote loading when returning to a local pack', () => {
    const { instance, fetch } = picker();
    instance.setCollection('GIPHY');
    const signal = fetch.mock.calls[0][3] as AbortSignal;
    expect(instance.loading()).toBe(true);
    instance.setCollection('Wevi');
    expect(signal.aborted).toBe(true);
    expect(instance.loading()).toBe(false);
    expect(instance.visible()).toHaveLength(66);
    instance.ngOnDestroy();
  });

  it('restores a remote sticker in Recent after reopening the picker', () => {
    const { instance } = picker();
    const entry = { id: 'remote-sticker', name: 'Celebration', previewUrl: 'https://example.com/preview.gif', sourceUrl: 'https://example.com/sticker.gif', width: 200, height: 200, keywords: ['celebration'] };
    instance.choose(entry); instance.ngOnDestroy();
    const reopened = picker().instance;
    reopened.setCollection('Recent');
    expect(reopened.visible().map(asset => asset.id)).toEqual(['remote-sticker']);
    expect(reopened.previewSrc(reopened.visible()[0])).toBe(entry.previewUrl);
    const emitted = vi.fn(); reopened.picked.subscribe(emitted);
    reopened.choose(reopened.visible()[0]);
    expect(emitted).toHaveBeenCalledWith(expect.objectContaining({ src: entry.sourceUrl, kind: 'sticker' }));
    reopened.ngOnDestroy();
  });
});
