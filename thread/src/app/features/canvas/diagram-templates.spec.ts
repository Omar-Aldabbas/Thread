import { describe, expect, it } from 'vitest';
import { createDiagramTemplate, diagramCatalog } from './diagram-templates';

describe('diagram starters', () => {
  it('creates every listed diagram with editable shapes and valid relationships', () => {
    for (const diagram of diagramCatalog) {
      const result = createDiagramTemplate(diagram.type, { x: 500, y: 400 }, null);
      const ids = new Set(result.items.map((item) => item.id));
      expect(result.items.length, diagram.name).toBeGreaterThanOrEqual(3);
      expect(result.connections.length, diagram.name).toBeGreaterThan(0);
      expect(ids.size, diagram.name).toBe(result.items.length);
      expect(result.items.every((item) => item.type === 'shape' && item.title && item.width > 0 && item.height > 0)).toBe(true);
      expect(result.connections.every((connection) => ids.has(connection.sourceId) && ids.has(connection.targetId))).toBe(true);
    }
  });

  it('creates fresh ids each time so multiple diagrams can coexist', () => {
    const first = createDiagramTemplate('mind-map', { x: 0, y: 0 }, null);
    const second = createDiagramTemplate('mind-map', { x: 0, y: 0 }, null);
    expect(first.items.some((item) => second.items.some((other) => other.id === item.id))).toBe(false);
  });
});
