import '@angular/compiler';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { validConnections } from '../../connector-rules';
import { CanvasPage } from './canvas-page';

function setup() {
  const page: any = Object.create(CanvasPage.prototype);
  const items = ['a', 'b', 'c', 'd'].map((id) => ({ id, type: 'shape', title: id, x: 0, y: 0, width: 100, height: 60 }));
  const lines = [
    { id: 'l1', sourceId: 'a', targetId: 'b', kind: 'elbow' },
    { id: 'l2', sourceId: 'c', targetId: 'd', kind: 'straight' },
  ];
  page.items = signal(items);
  page.connections = signal(lines);
  page.junctions = signal([]);
  page.tool = signal('connect');
  page.connectionSourceId = signal(null);
  page.connectionSourceLine = signal(null);
  page.selectedConnectionId = signal(null);
  page.selectedIds = signal([]);
  page.snapshot = vi.fn();
  page.point = () => ({ x: 50, y: 50 });
  page.nearestOnConnection = (line: { id: string }) => ({ connectionId: line.id, ratio: 0.5, x: 50, y: 50, distance: 0 });
  page.getOrCreateJunction = ({ connectionId }: { connectionId: string }) => {
    const id = `j-${connectionId}`;
    if (!page.junctions().some((entry: { id: string }) => entry.id === id)) page.junctions.update((entries: unknown[]) => [...entries, { id, parentConnectorId: connectionId, positionRatio: 0.5 }]);
    return { id };
  };
  page.setTool = (tool: string) => { page.tool.set(tool); page.connectionSourceId.set(null); page.connectionSourceLine.set(null); };
  const event = { clientX: 50, clientY: 50, preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as PointerEvent;
  return { page, items, lines, event };
}

describe('Connect mode targets', () => {
  it('connects an item to a line junction', () => {
    const { page, items, lines, event } = setup();
    page.connectionSourceId.set('c');
    page.connectLineClick(event, lines[0]);
    expect(page.connections()[2]).toMatchObject({ sourceId: 'c', targetId: 'b', targetJunctionId: 'j-l1' });
    expect(validConnections(items, page.connections(), page.junctions())).toHaveLength(3);
    expect(page.tool()).toBe('select');
  });

  it('connects a line junction to an item', () => {
    const { page, items, lines, event } = setup();
    page.connectLineClick(event, lines[0]);
    page.connectLineToItem(items[2]);
    expect(page.connections()[2]).toMatchObject({ sourceId: 'a', sourceJunctionId: 'j-l1', targetId: 'c' });
    expect(validConnections(items, page.connections(), page.junctions())).toHaveLength(3);
  });

  it('connects two lines and rejects selecting the same line twice', () => {
    const { page, items, lines, event } = setup();
    page.connectLineClick(event, lines[0]);
    page.connectLineClick(event, lines[0]);
    expect(page.connections()).toHaveLength(2);
    page.connectLineClick(event, lines[1]);
    expect(page.connections()[2]).toMatchObject({ sourceJunctionId: 'j-l1', targetJunctionId: 'j-l2' });
    expect(validConnections(items, page.connections(), page.junctions())).toHaveLength(3);
  });

  it('does not connect a line to one of its own branches', () => {
    const { page, lines, event } = setup();
    page.connections.set([...lines, { id: 'branch', sourceId: 'a', sourceJunctionId: 'existing', targetId: 'c', kind: 'elbow' }]);
    page.junctions.set([{ id: 'existing', parentConnectorId: 'l1', positionRatio: 0.5 }]);
    page.connectLineClick(event, lines[0]);
    expect(page.canConnectToLine(page.connections()[2])).toBe(false);
    page.connectLineClick(event, page.connections()[2]);
    expect(page.connections()).toHaveLength(3);
  });
});
