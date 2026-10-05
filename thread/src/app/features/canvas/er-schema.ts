import type { CanvasItem, ErField } from './canvas.model';

export const erDataTypes = ['UUID', 'INTEGER', 'BIGINT', 'SMALLINT', 'VARCHAR', 'TEXT', 'BOOLEAN', 'DECIMAL', 'FLOAT', 'DOUBLE', 'DATE', 'TIME', 'TIMESTAMP', 'JSON', 'BINARY', 'ENUM'];
export function enumValues(value: string): string[] { return [...new Set(value.split(/[,\n]/).map(value => value.trim()).filter(Boolean))]; }
export function erFieldIssue(entity: CanvasItem, field: ErField, entities: CanvasItem[]): string {
  if ((entity.erFields || []).filter(other => other.name.toLowerCase() === field.name.toLowerCase()).length > 1) return 'Field names must be unique in this entity.';
  if (field.dataType === 'ENUM' && !field.enumValues?.length) return 'Add at least one enum value.';
  if (field.dataType === 'CUSTOM') return 'Enter the custom data type.';
  if (field.dataType === 'ENUM' && field.defaultValue && !field.enumValues?.includes(field.defaultValue)) return 'The default must be one of the allowed enum values.';
  if (field.key === 'foreign' && !field.reference) return 'Choose the entity and field this foreign key references.';
  if (field.reference) {
    const targetEntity = entities.find(item => item.id === field.reference!.entityId), target = targetEntity?.erFields?.find(other => other.id === field.reference!.fieldId);
    if (!target) return 'The referenced field no longer exists. Choose another field.';
    if (target.key !== 'primary' && !target.unique) return 'The referenced field must be a primary or unique key.';
    if (target.key === 'primary' && !target.unique && (targetEntity?.erFields || []).filter(other => other.key === 'primary').length > 1) return 'This field is part of a composite primary key. Use a separately unique field for this reference.';
    if (target.dataType !== field.dataType) return 'The reference and its target must use the same data type.';
  }
  return '';
}
const quote = (value: string) => '"' + value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]/g, ' ') + '"';
const literal = (value: string) => "'" + value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/[\r\n]/g, ' ') + "'";
export function exportErDbml(items: CanvasItem[]): string {
  const entities = items.filter(item => item.type === 'er-entity');
  const enumNames = new Map<string, string>();
  const blocks: string[] = ['// Thread ER diagram'];
  for (const entity of entities) for (const field of entity.erFields || []) if (field.dataType === 'ENUM') {
    let owner = entity, definition = field;
    const visited = new Set<string>();
    while (definition.reference) {
      const key = `${owner.id}/${definition.id}`; if (visited.has(key)) break; visited.add(key);
      const target = entities.find(item => item.id === definition.reference!.entityId), targetField = target?.erFields?.find(other => other.id === definition.reference!.fieldId);
      if (!target || targetField?.dataType !== 'ENUM') break;
      owner = target; definition = targetField;
    }
    const key = `${owner.id}/${definition.id}`;
    let name = enumNames.get(key);
    if (!name) { name = `enum_${new Set(enumNames.values()).size + 1}`; enumNames.set(key, name); blocks.push(`Enum ${name} {\n${(definition.enumValues || []).map(value => '  ' + quote(value)).join('\n')}\n}`); }
    enumNames.set(`${entity.id}/${field.id}`, name);
  }
  for (const entity of entities) {
    const primary = (entity.erFields || []).filter(field => field.key === 'primary');
    const fields = (entity.erFields || []).map(field => {
      const settings = [field.key === 'primary' && primary.length === 1 ? 'pk' : '', field.required || field.key === 'primary' ? 'not null' : '', field.unique ? 'unique' : '', field.note ? `note: ${literal(field.note)}` : ''].filter(Boolean);
      if (field.defaultValue?.trim()) { const value = field.defaultValue.trim(); settings.push(`default: ${/^-?\d+(\.\d+)?$|^(true|false|null)$/i.test(value) ? value.toLowerCase() : value === 'now()' ? '`now()`' : literal(value)}`); }
      const type = enumNames.get(`${entity.id}/${field.id}`) || (/^[a-zA-Z][a-zA-Z0-9_]*(\([\d, ]+\))?$/.test(field.dataType) ? field.dataType : quote(field.dataType));
      return `  ${quote(field.name)} ${type}${settings.length ? ' [' + settings.join(', ') + ']' : ''}`;
    });
    const composite = primary.length > 1 ? `\n\n  indexes {\n    (${primary.map(field => quote(field.name)).join(', ')}) [pk]\n  }` : '';
    blocks.push(`Table ${quote(entity.title || 'Unnamed entity')} {\n${fields.join('\n')}${composite}\n}`);
  }
  for (const entity of entities) for (const field of entity.erFields || []) if (field.reference) {
    const target = entities.find(item => item.id === field.reference!.entityId), targetField = target?.erFields?.find(other => other.id === field.reference!.fieldId);
    if (target && targetField) blocks.push(`Ref: ${quote(entity.title)}.${quote(field.name)} ${field.unique || field.key === 'primary' ? '-' : '>'} ${quote(target.title)}.${quote(targetField.name)}`);
  }
  return blocks.join('\n\n') + '\n';
}
