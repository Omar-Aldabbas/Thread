import { Injectable, signal } from '@angular/core';
import { DataColumnType, ThreadDataColumn, ThreadDataRow, ThreadDataset } from '../canvas.model';

@Injectable()
export class DatasetStore {
  readonly datasets = signal<ThreadDataset[]>([]);

  get(id?: string): ThreadDataset | undefined { return this.datasets().find(dataset => dataset.id === id); }
  create(columns: { label: string; type: DataColumnType; key?: string }[], rows: Record<string, string | number | null>[] = []): ThreadDataset {
    const used = new Set<string>();
    const mapped: ThreadDataColumn[] = columns.map((column, index) => {
      const base = (column.key || column.label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || `column_${index + 1}`);
      let key = base, suffix = 2; while (used.has(key)) key = `${base}_${suffix++}`; used.add(key);
      return { id: crypto.randomUUID(), key, label: column.label, type: column.type };
    });
    const dataset = { id: crypto.randomUUID(), columns: mapped, rows: rows.map(values => ({ id: crypto.randomUUID(), values })) };
    this.datasets.update(current => [...current, dataset]); return dataset;
  }
  updateCell(id: string, rowId: string, key: string, value: string | number | null): void {
    this.datasets.update(all => all.map(data => data.id === id ? { ...data, rows: data.rows.map(row => row.id === rowId ? { ...row, values: { ...row.values, [key]: value } } : row) } : data));
  }
  addRow(id: string, values: Record<string, string | number | null> = {}): ThreadDataRow {
    const row = { id: crypto.randomUUID(), values }; this.datasets.update(all => all.map(data => data.id === id ? { ...data, rows: [...data.rows, row] } : data)); return row;
  }
  deleteRow(id: string, rowId: string): void { this.datasets.update(all => all.map(data => data.id === id ? { ...data, rows: data.rows.filter(row => row.id !== rowId) } : data)); }
  addColumn(id: string, label = 'Column', type: DataColumnType = 'text'): void {
    this.datasets.update(all => all.map(data => {
      if (data.id !== id) return data;
      const key = `field_${crypto.randomUUID().slice(0, 8)}`;
      return { ...data, columns: [...data.columns, { id: crypto.randomUUID(), key, label, type }] };
    }));
  }
  renameColumn(id: string, columnId: string, label: string): void { this.datasets.update(all => all.map(data => data.id === id ? { ...data, columns: data.columns.map(column => column.id === columnId ? { ...column, label } : column) } : data)); }
  setColumnType(id: string, columnId: string, type: DataColumnType): void { this.datasets.update(all => all.map(data => data.id === id ? { ...data, columns: data.columns.map(column => column.id === columnId ? { ...column, type } : column) } : data)); }
  deleteColumn(id: string, columnId: string): void { this.datasets.update(all => all.map(data => data.id === id ? { ...data, columns: data.columns.filter(column => column.id !== columnId) } : data)); }
  duplicate(id: string): ThreadDataset | undefined { const data = this.get(id); if (!data) return; const copy = { ...structuredClone(data), id: crypto.randomUUID(), rows: data.rows.map(row => ({ ...structuredClone(row), id: crypto.randomUUID() })) }; this.datasets.update(all => [...all, copy]); return copy; }
  replace(datasets: ThreadDataset[]): void { this.datasets.set(datasets); }
}
