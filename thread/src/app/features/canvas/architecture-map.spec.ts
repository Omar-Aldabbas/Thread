import { describe, expect, it } from 'vitest';
import { architectureShape, architectureStarter, reviewArchitecture } from './architecture-map';

describe('infrastructure mapping', () => {
  it('creates structured components and connected starter flows', () => {
    const map = architectureStarter({ x: 500, y: 400 }, null);
    const ids = new Set(map.items.map((item) => item.id));
    expect(map.items.length).toBe(6);
    expect(map.items.every((item) => !!item.architecture)).toBe(true);
    expect(map.connections.every((connection) => ids.has(connection.sourceId) && ids.has(connection.targetId))).toBe(true);
    expect(map.items.find((item) => item.architecture?.kind === 'service')?.architecture?.capability).toBe('Customer service');
  });

  it('flags disconnected components, missing owners, and missing business purpose', () => {
    const service = architectureShape('service', { x: 0, y: 0 }, null, 'API');
    const review = reviewArchitecture([service], []);
    expect(review.issues.map((issue) => issue.message)).toEqual([
      'API: no architecture connection', 'API: owner missing', 'API: business capability missing',
    ]);
    service.architecture = { ...service.architecture!, owner: 'Platform', capability: 'Orders', monthlyCost: 42 };
    expect(reviewArchitecture([service], []).monthlyCost).toBe(42);
  });

  it('flags a production service without monitoring', () => {
    const service = architectureShape('service', { x: 0, y: 0 }, null, 'API');
    service.architecture = { ...service.architecture!, environment: 'production', owner: 'Platform', capability: 'Orders' };
    expect(reviewArchitecture([service], []).issues.some((issue) => issue.message.includes('no monitoring link'))).toBe(true);
  });
});
