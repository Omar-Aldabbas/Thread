import { describe, expect, it } from 'vitest';
import type { CanvasConnection, CanvasItem } from './canvas.model';
import { isConnectableItem, validConnections } from './connector-rules';

const item = (id: string, type: CanvasItem['type']): CanvasItem => ({
  id, type, parentId: null, x: 0, y: 0, width: 100, height: 80,
  title: id, createdAt: '', updatedAt: '',
});
const connection = (sourceId: string, targetId: string, id = 'c'): CanvasConnection => ({ id, sourceId, targetId, kind: 'elbow' });

describe('connector capabilities', () => {
  it('allows semantic cards and shapes', () => {
    for (const type of ['note', 'text', 'task', 'checklist', 'shape', 'er-entity', 'image'] as const)
      expect(isConnectableItem(item(type, type))).toBe(true);
  });
  it('excludes drawing and decorative items', () => {
    for (const type of ['sketch', 'sticker', 'gif', 'workspace', 'file', 'voice'] as const)
      expect(isConnectableItem(item(type, type))).toBe(false);
  });
  it('discards dangling, invalid anchor, self, and duplicate IDs on load', () => {
    const items = [item('a', 'note'), item('b', 'task'), item('s', 'sketch')];
    const records = [connection('a', 'b'), connection('a', 'missing', 'missing'),
      connection('a', 's', 'sketch'), connection('a', 'a', 'self'),
      { ...connection('a', 'b', 'anchor'), sourceSide: 'diagonal' },
      { ...connection('a', 'b', 'junction'), targetJunctionId: 'j1' },
      connection('a', 'b'), connection('a', 'b', 'parallel')];
    expect(validConnections(items, records)).toEqual([records[0]]);
  });
  it('keeps valid branches and rejects orphan or cyclic junctions', () => {
    const items = [item('a', 'note'), item('b', 'task'), item('c', 'checklist')];
    const base = connection('a', 'b', 'base');
    const branch = { ...connection('a', 'c', 'branch'), sourceJunctionId: 'joint' };
    const cyclic = { ...connection('a', 'c', 'cyclic'), sourceJunctionId: 'cycle' };
    expect(validConnections(items, [base, branch, cyclic], [
      { id: 'joint', parentConnectorId: 'base', positionRatio: .5 },
      { id: 'cycle', parentConnectorId: 'cyclic', positionRatio: .5 },
    ])).toEqual([base, branch]);
  });
});
