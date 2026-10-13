import { describe, expect, it } from 'vitest';
import { createWorkspaceBackup, parseWorkspaceBackup, restoreWorkspaceBackup } from './workspace-backup';

function storage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() { return data.size; },
    clear: () => data.clear(),
    key: (index: number) => [...data.keys()][index] || null,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); },
  };
}

describe('workspace backup', () => {
  it('round trips spaces and canvas data without overwriting preferences', () => {
    const source = storage();
    source.setItem('thread-spaces', '[]');
    source.setItem('thread-canvas-1', JSON.stringify({ items: [], connections: [] }));
    source.setItem('thread-theme', 'dark');
    const backup = parseWorkspaceBackup(JSON.stringify(createWorkspaceBackup(source)));
    const target = storage();
    target.setItem('thread-theme', 'light');
    restoreWorkspaceBackup(target, backup);
    expect(target.getItem('thread-canvas-1')).toBe(source.getItem('thread-canvas-1'));
    expect(target.getItem('thread-theme')).toBe('light');
  });

  it('rejects malformed canvas entries before restoring', () => {
    expect(() => parseWorkspaceBackup(JSON.stringify({ format: 'thread-backup', version: 1, storage: { 'thread-canvas-1': '{}' } }))).toThrow();
  });
});
