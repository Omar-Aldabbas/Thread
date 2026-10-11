import type { CanvasItem } from './canvas.model';

const typeTerms: Partial<Record<CanvasItem['type'], string>> = {
  image: 'image images photo photos picture pictures pic pics photograph photography',
  gif: 'gif gifs animation animated image images',
  sticker: 'sticker stickers icon icons',
  video: 'video videos movie movies clip clips',
  voice: 'voice audio recording recordings sound',
  file: 'file files document documents attachment attachments pdf',
  link: 'link links url website websites',
  note: 'note notes sticky stickies',
  text: 'text writing paragraph',
  task: 'task tasks todo to-do',
  checklist: 'checklist checklists todo to-do',
  list: 'list lists',
  table: 'table tables spreadsheet data',
  chart: 'chart charts graph graphs data',
  budget: 'budget budgets money finance expenses',
  shape: 'shape shapes diagram diagrams flowchart',
  'er-entity': 'er entity entities database schema diagram diagrams',
  sketch: 'sketch sketches drawing drawings',
  frame: 'frame frames',
  zone: 'zone zones area areas',
  workspace: 'workspace workspaces space spaces',
};

export function matchesCanvasSearch(item: CanvasItem, query: string): boolean {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const searchable = [
    item.type,
    typeTerms[item.type] || '',
    item.title,
    item.body || '',
    item.filename || '',
    item.url || '',
  ].join(' ').toLocaleLowerCase();
  return terms.every((term) => searchable.includes(term));
}
