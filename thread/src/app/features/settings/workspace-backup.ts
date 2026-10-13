export interface ThreadBackup {
  format: 'thread-backup';
  version: 1;
  exportedAt: string;
  storage: Record<string, string>;
}

const backedUpKey = (key: string): boolean =>
  key === 'thread-spaces' || key.startsWith('thread-canvas-') || key.startsWith('thread-dataset-');

export function createWorkspaceBackup(storage: Storage): ThreadBackup {
  const entries: Record<string, string> = {};
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (key && backedUpKey(key)) entries[key] = storage.getItem(key) || '';
  }
  return { format: 'thread-backup', version: 1, exportedAt: new Date().toISOString(), storage: entries };
}

export function parseWorkspaceBackup(text: string): ThreadBackup {
  const data: unknown = JSON.parse(text);
  if (!data || typeof data !== 'object') throw new Error('This is not a Thread backup.');
  const backup = data as Partial<ThreadBackup>;
  if (backup.format !== 'thread-backup' || backup.version !== 1 || !backup.storage || typeof backup.storage !== 'object' || Array.isArray(backup.storage))
    throw new Error('This is not a supported Thread backup.');
  for (const [key, value] of Object.entries(backup.storage)) {
    if (!backedUpKey(key) || typeof value !== 'string') throw new Error('The backup contains an invalid entry.');
    const parsed = JSON.parse(value);
    if (key === 'thread-spaces' && !Array.isArray(parsed)) throw new Error('The space list is invalid.');
    if (key.startsWith('thread-canvas-') && (!parsed || !Array.isArray(parsed.items) || !Array.isArray(parsed.connections)))
      throw new Error('A canvas in the backup is invalid.');
  }
  return backup as ThreadBackup;
}

export function restoreWorkspaceBackup(storage: Storage, backup: ThreadBackup): void {
  const previous = createWorkspaceBackup(storage).storage;
  try {
    for (const key of Object.keys(previous)) storage.removeItem(key);
    for (const [key, value] of Object.entries(backup.storage)) storage.setItem(key, value);
  } catch (error) {
    for (const key of Object.keys(backup.storage)) storage.removeItem(key);
    for (const [key, value] of Object.entries(previous)) storage.setItem(key, value);
    throw error;
  }
}
