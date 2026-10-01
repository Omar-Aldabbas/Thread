import { Injectable, signal } from '@angular/core';
import { DataColumnType, ThreadDataColumn, ThreadDataRow, ThreadDataset } from '../canvas.model';
import { canvasId } from '../canvas-id';

@Injectable()
export class DatasetStore {
  readonly datasets = signal<ThreadDataset[]>([]);

  get(id?: string): ThreadDataset | undefined { return this.datasets().find(dataset => dataset.id === id); }
  create(columns: { label: string; type: DataColumnType; key?: string }[], rows: Record<string, string | number | null>[] = []): ThreadDataset {
    const used = new Set<string>();
    const mapped: ThreadDataColumn[] = columns.map((column, index) => {
      const base = (column.key || column.label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || `column_${index + 1}`);
      let key = base, suffix = 2; while (used.has(key)) key = `${base}_${suffix++}`; used.add(key);
      return { id: canvasId(), key, label: column.label, type: column.type };
    });
    const dataset = { id: canvasId(), columns: mapped, rows: rows.map(values => ({ id: canvasId(), values })) };
    this.datasets.update(current => [...current, dataset]); return dataset;
  }
  updateCell(id: string, rowId: string, key: string, value: string | number | null): void {
    this.datasets.update(all => all.map(data => data.id === id ? { ...data, rows: data.rows.map(row => row.id === rowId ? { ...row, values: this.calculate(data.columns, { ...row.values, [key]: value }) } : row) } : data));
  }
  addRow(id: string, values: Record<string, string | number | null> = {}): ThreadDataRow {
    const data = this.get(id); const row = { id: canvasId(), values: this.calculate(data?.columns || [], values) }; this.datasets.update(all => all.map(entry => entry.id === id ? { ...entry, rows: [...entry.rows, row] } : entry)); return row;
  }
  deleteRow(id: string, rowId: string): void { this.datasets.update(all => all.map(data => data.id === id ? { ...data, rows: data.rows.filter(row => row.id !== rowId) } : data)); }
  addColumn(id: string, label = 'Column', type: DataColumnType = 'text'): void {
    this.datasets.update(all => all.map(data => {
      if (data.id !== id) return data;
      const key = `field_${canvasId().slice(0, 8)}`;
      return { ...data, columns: [...data.columns, { id: canvasId(), key, label, type }] };
    }));
  }
  renameColumn(id: string, columnId: string, label: string): void { this.datasets.update(all => all.map(data => data.id === id ? { ...data, columns: data.columns.map(column => column.id === columnId ? { ...column, label } : column) } : data)); }
  setColumnType(id: string, columnId: string, type: DataColumnType): void { this.datasets.update(all => all.map(data => data.id === id ? { ...data, columns: data.columns.map(column => column.id === columnId ? { ...column, type } : column) } : data)); }
  deleteColumn(id: string, columnId: string): void { this.datasets.update(all => all.map(data => data.id === id ? { ...data, columns: data.columns.filter(column => column.id !== columnId) } : data)); }
  addGroup(id: string, name: string): void { this.datasets.update(all => all.map(data => data.id === id ? { ...data, groups: [...(data.groups || []), name] } : data)); }
  renameGroup(id: string, oldName: string, name: string): void { this.datasets.update(all => all.map(data => data.id === id ? { ...data, groups: (data.groups || []).map(group => group === oldName ? name : group), rows: data.rows.map(row => row.values['group'] === oldName ? { ...row, values: { ...row.values, group: name } } : row) } : data)); }
  deleteGroup(id: string, name: string): void { this.datasets.update(all => all.map(data => data.id === id ? { ...data, groups: (data.groups || []).filter(group => group !== name), rows: data.rows.map(row => row.values['group'] === name ? { ...row, values: { ...row.values, group: '' } } : row) } : data)); }
  moveGroup(id: string, name: string, step: number): void { this.datasets.update(all => all.map(data => { if(data.id!==id)return data;const groups=[...(data.groups||[])],index=groups.indexOf(name),next=index+step;if(index<0||next<0||next>=groups.length)return data;[groups[index],groups[next]]=[groups[next],groups[index]];return {...data,groups}; })); }
  enablePeriods(id:string,month:string):void { this.datasets.update(all=>all.map(data=>{if(data.id!==id||data.activePeriod)return data;const planned=data.columns.find(column=>column.label==='Planned')?.key||'planned',actual=data.columns.find(column=>column.label==='Actual')?.key||'actual';const values=Object.fromEntries(data.rows.map(row=>[row.id,{planned:Number(row.values[planned])||0,actual:Number(row.values[actual])||0}]));return {...data,activePeriod:month,periodValues:{[month]:values}};})); }
  switchPeriod(id:string,month:string,copyPlanned:boolean):void { this.datasets.update(all=>all.map(data=>{if(data.id!==id)return data;const planned=data.columns.find(column=>column.label==='Planned')?.key||'planned',actual=data.columns.find(column=>column.label==='Actual')?.key||'actual';const previous=data.activePeriod||month;const saved=Object.fromEntries(data.rows.map(row=>[row.id,{planned:Number(row.values[planned])||0,actual:Number(row.values[actual])||0}]));const periods={...(data.periodValues||{}),[previous]:saved};const incoming=periods[month]||Object.fromEntries(data.rows.map(row=>[row.id,{planned:copyPlanned?Number(row.values[planned])||0:0,actual:0}]));periods[month]=incoming;return {...data,activePeriod:month,periodValues:periods,rows:data.rows.map(row=>{const values=incoming[row.id]||{planned:0,actual:0};return {...row,values:this.calculate(data.columns,{...row.values,[planned]:values.planned,[actual]:values.actual})};})};})); }
  setCalculation(id: string, columnId: string, calculation: ThreadDataColumn['calculation']): void { this.datasets.update(all => all.map(data => { if (data.id !== id) return data; const columns = data.columns.map(column => column.id === columnId ? { ...column, type: 'calculated' as const, calculation } : column); return { ...data, columns, rows: data.rows.map(row => ({ ...row, values: this.calculate(columns, row.values) })) }; })); }
  private calculate(columns: ThreadDataColumn[], original: ThreadDataRow['values']): ThreadDataRow['values'] {
    const values = { ...original };
    for (const column of columns) {
      if (column.type !== 'calculated' || !column.calculation) continue;
      const { left, right, operator } = column.calculation;
      const a = Number(values[left]) || 0, b = Number(values[right]) || 0;
      const result = operator === '+' ? a + b : operator === '-' ? a - b : operator === '*' ? a * b : operator === '/' ? (b ? a / b : null) : (b ? a / b * 100 : null);
      values[column.key] = result !== null && Number.isFinite(result) ? result : null;
    }
    return values;
  }
  duplicate(id: string): ThreadDataset | undefined { const data = this.get(id); if (!data) return; const copy = { ...structuredClone(data), id: canvasId(), rows: data.rows.map(row => ({ ...structuredClone(row), id: canvasId() })) }; this.datasets.update(all => [...all, copy]); return copy; }
  replace(datasets: ThreadDataset[]): void { this.datasets.set(datasets); }
}
