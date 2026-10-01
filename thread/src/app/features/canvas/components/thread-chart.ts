import { isPlatformBrowser } from '@angular/common';
import { AfterViewInit, Component, ElementRef, OnDestroy, PLATFORM_ID, computed, effect, inject, input, viewChild } from '@angular/core';
import { BarChart, LineChart, PieChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import * as echarts from 'echarts/core';
import { ChartConfig, ThreadDataset } from '../canvas.model';

echarts.use([BarChart, LineChart, PieChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);

@Component({
  selector: 'app-thread-chart', standalone: true,
  template: `<div class="chart-block"><div #plot class="chart-plot" aria-hidden="true"></div>@if (!hasData()) { <div class="chart-empty">{{ dataset() ? 'Add numeric data to chart' : 'Choose a data source' }}</div> }</div>`,
  styles: [`:host{display:block;width:100%;height:100%;min-width:0;min-height:0}.chart-block{position:relative;width:100%;height:100%;padding:12px;box-sizing:border-box;container-type:size}.chart-plot{width:100%;height:100%}.chart-empty{position:absolute;inset:0;display:grid;place-items:center;padding:20px;color:var(--color-text-muted);font-size:12px;text-align:center;pointer-events:none}`]
})
export class ThreadChart implements AfterViewInit, OnDestroy {
  readonly dataset = input<ThreadDataset | undefined>();
  readonly config = input<ChartConfig | undefined>();
  readonly plot = viewChild<ElementRef<HTMLElement>>('plot');
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private chart?: echarts.ECharts;
  private observer?: ResizeObserver;
  readonly hasData = computed(() => {
    const data = this.dataset(), config = this.config();
    return !!data?.rows.some(row => Number.isFinite(Number(row.values[config?.valueField || data.columns.find(column => column.type === 'number' || column.type === 'currency')?.key || ''])));
  });
  constructor() { effect(() => { this.dataset(); this.config(); queueMicrotask(() => this.render()); }); }
  ngAfterViewInit(): void {
    if (!this.browser) return;
    const element = this.plot()?.nativeElement; if (!element) return;
    this.chart = echarts.init(element, undefined, { renderer: 'canvas' });
    this.observer = new ResizeObserver(() => { this.chart?.resize(); this.render(); }); this.observer.observe(element);
    this.render();
  }
  ngOnDestroy(): void { this.observer?.disconnect(); this.chart?.dispose(); }
  private render(): void {
    if (!this.chart) return;
    const data = this.dataset(), config = this.config();
    if (!data || !config || !this.hasData()) { this.chart.clear(); return; }
    const labelKey = config.categoryField || data.columns.find(column => column.type === 'text' || column.type === 'category' || column.type === 'date')?.key || data.columns[0]?.key;
    const valueKey = config.valueField || data.columns.find(column => column.type === 'number' || column.type === 'currency')?.key;
    if (!labelKey || !valueKey) { this.chart.clear(); return; }
    const labels = data.rows.map(row => String(row.values[labelKey] ?? ''));
    const values = data.rows.map(row => Number(row.values[valueKey]) || 0);
    const compact = (this.plot()?.nativeElement.clientWidth || 0) < 300;
    const common = { animationDuration: 180, textStyle: { fontFamily: 'Inter, system-ui, sans-serif', color: '#555' }, tooltip: { trigger: config.type === 'donut' ? 'item' : 'axis' }, color: ['#d4111c', '#393e46', '#9ca3af', '#c9c4bc', '#737373'] };
    if (config.type === 'donut') {
      const groups = new Map<string, number>();
      labels.forEach((name, i) => { if (name.trim()) groups.set(name, (groups.get(name) || 0) + Math.max(0, values[i])); });
      this.chart.setOption({ ...common, series: [{ type: 'pie', radius: compact ? ['48%', '70%'] : ['52%', '74%'], center: ['50%', '52%'], avoidLabelOverlap: true, label: { show: !compact, formatter: '{b}' }, data: [...groups].map(([name, value]) => ({ name, value })) }] }, true);
      return;
    }
    const seriesKeys = config.type === 'comparison' ? (config.series?.length ? config.series : [valueKey]) : [valueKey];
    this.chart.setOption({ ...common, grid: { left: compact ? 30 : 44, right: 12, top: 16, bottom: compact ? 28 : 38 }, legend: { show: !compact && seriesKeys.length > 1, bottom: 0 }, xAxis: { type: 'category', data: labels, axisLabel: { hideOverlap: true, overflow: 'truncate', width: compact ? 38 : 85 }, axisLine: { lineStyle: { color: '#aaa' } }, axisTick: { show: false } }, yAxis: { type: 'value', splitLine: { lineStyle: { color: '#ecebea' } }, axisLabel: { fontSize: 10 } }, series: seriesKeys.map((key, i) => ({ name: data.columns.find(column => column.key === key)?.label || key, type: config.type === 'line' ? 'line' : 'bar', smooth: config.type === 'line', showSymbol: config.type === 'line' && !compact, barMaxWidth: 22, itemStyle: { color: i ? '#51565e' : '#d4111c' }, data: data.rows.map(row => Number(row.values[key]) || 0) })) }, true);
  }
}
