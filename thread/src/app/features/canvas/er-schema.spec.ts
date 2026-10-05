import { describe, expect, it } from 'vitest';
import type { CanvasItem, ErField } from './canvas.model';
import { enumValues, erFieldIssue, exportErDbml } from './er-schema';
const field = (id: string, patch: Partial<ErField> = {}): ErField => ({ id, name: id, dataType: 'UUID', key: 'none', required: false, ...patch });
const entity = (id: string, fields: ErField[]): CanvasItem => ({ id, title: id, type: 'er-entity', parentId: null, x: 0, y: 0, width: 300, height: 200, erFields: fields, createdAt: '', updatedAt: '' });

describe('ER schema', () => {
  it('normalizes enum values without losing their order', () => {
    expect(enumValues(' draft, active\narchived, draft, , ')).toEqual(['draft', 'active', 'archived']);
  });
  it('reports incomplete enums, duplicate names, and unresolved references', () => {
    const item = entity('Order', [field('id'), field('status', { dataType: 'ENUM' })]);
    expect(erFieldIssue(item, item.erFields![1], [item])).toContain('enum value');
    item.erFields!.push(field('duplicate', { name: 'ID' }));
    expect(erFieldIssue(item, item.erFields![0], [item])).toContain('unique');
    expect(erFieldIssue(item, field('fk', { key: 'foreign' }), [item])).toContain('references');
  });
  it('requires a unique, type-compatible reference target', () => {
    const parent = entity('Customer', [field('id', { key: 'primary' })]), child = entity('Order', []);
    const fk = field('customer_id', { key: 'foreign', reference: { entityId: parent.id, fieldId: 'id' } });
    expect(erFieldIssue(child, fk, [parent, child])).toBe('');
    parent.erFields![0].dataType = 'INTEGER';
    expect(erFieldIssue(child, fk, [parent, child])).toContain('same data type');
    parent.erFields = [];
    expect(erFieldIssue(child, fk, [parent, child])).toContain('no longer exists');
  });
  it('exports enums, defaults, constraints, notes, and field references', () => {
    const parent = entity('Customer', [field('id', { key: 'primary' })]);
    const child = entity('Order', [field('customer_id', { key: 'foreign', reference: { entityId: parent.id, fieldId: 'id' } }), field('status', { dataType: 'ENUM', enumValues: ['draft', 'paid'], defaultValue: 'draft', note: "Customer's status" }), field('created_at', { dataType: 'TIMESTAMP', defaultValue: 'now()' }), field('amount', { dataType: 'DECIMAL(10,2)', defaultValue: '0', unique: true })]);
    const dbml = exportErDbml([parent, child]);
    expect(dbml).toContain('Enum enum_1'); expect(dbml).toContain('"paid"');
    expect(dbml).toContain('"id" UUID [pk, not null]');
    expect(dbml).toContain("default: 'draft'"); expect(dbml).toContain("Customer\\'s status");
    expect(dbml).toContain('default: `now()`'); expect(dbml).toContain('DECIMAL(10,2) [unique, default: 0]');
    expect(dbml).toContain('Ref: "Order"."customer_id" > "Customer"."id"');
  });
  it('exports composite primary keys as an index', () => {
    const item = entity('Membership', [field('user_id', { key: 'primary' }), field('team_id', { key: 'primary' })]);
    expect(exportErDbml([item])).toContain('("user_id", "team_id") [pk]');
    const ref = field('fk', { key: 'foreign', reference: { entityId: item.id, fieldId: 'user_id' } });
    expect(erFieldIssue(entity('Child', [ref]), ref, [item])).toContain('composite primary key');
  });
  it('uses the same enum type for a referenced enum key', () => {
    const parent = entity('Status', [field('code', { key: 'primary', dataType: 'ENUM', enumValues: ['draft', 'paid'] })]);
    const child = entity('Order', [field('status', { key: 'foreign', dataType: 'ENUM', enumValues: ['draft', 'paid'], reference: { entityId: parent.id, fieldId: 'code' } })]);
    const dbml = exportErDbml([child, parent]);
    expect(dbml.match(/Enum /g)).toHaveLength(1);
    expect(dbml).toContain('"status" enum_1'); expect(dbml).toContain('"code" enum_1');
  });
});
