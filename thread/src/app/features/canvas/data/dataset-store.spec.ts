import { describe, expect, it } from 'vitest';
import { DatasetStore } from './dataset-store';

describe('DatasetStore', () => {
  it('keeps linked views on one editable dataset', () => {
    const store = new DatasetStore();
    const data = store.create([{ label: 'Item', key: 'item', type: 'text' }, { label: 'Amount', key: 'amount', type: 'currency' }]);
    const first = store.addRow(data.id, { item: 'Food', amount: 100 });
    store.addRow(data.id, { item: 'Transport', amount: 50 });
    const budgetDatasetId = data.id, tableDatasetId = data.id, chartDatasetId = data.id;
    store.updateCell(tableDatasetId, first.id, 'amount', 120);
    expect(store.get(budgetDatasetId)?.rows.map(row => row.values['amount'])).toEqual([120, 50]);
    expect(store.get(chartDatasetId)?.rows.reduce((sum, row) => sum + Number(row.values['amount']), 0)).toBe(170);
    expect(store.datasets()).toHaveLength(1);
  });

  it('changes row and column structure without copying linked data', () => {
    const store = new DatasetStore();
    const data = store.create([{ label: 'Item', type: 'text' }]);
    store.addColumn(data.id, 'Actual', 'currency');
    const amountKey = store.get(data.id)!.columns[1].key;
    const row = store.addRow(data.id, { item: 'Hosting', [amountKey]: 80 });
    expect(store.get(data.id)?.rows[0].values[amountKey]).toBe(80);
    store.deleteRow(data.id, row.id);
    expect(store.get(data.id)?.rows).toHaveLength(0);
  });
});
