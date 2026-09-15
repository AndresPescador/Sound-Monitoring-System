import MetricPlot from './MetricPlot'
import { getMetric, observedNumber } from '../shared/metricCatalog'
import { useLanguage } from '../../context/LanguageContext'
export default function TimeSeriesChart({ data = [], metric = 'leq_dbfs', metricLabel, compact = false, height = 220, series, axisMode = 'range', range = null }) {
  const { t } = useLanguage()
  const columns = series?.length ? series.map(s => ({ key: s.dataKey, label: s.label, metric: s.dataKey, color: s.color, dash: s.dataKey === 'ch_right_dbfs' ? '6 3' : undefined }))
    : [{ key: 'value', label: typeof metricLabel === 'string' && !metricLabel.includes('_') ? metricLabel : getMetric(metric, t).label, metric }]
  const rows = data.map(row => ({ ...row, t: row.recorded_at, ...Object.fromEntries(columns.map(col => [col.key, observedNumber(row[col.key])])) }))
  return <MetricPlot data={rows} columns={columns} metric={metric} axisMode={axisMode} range={range} compact={compact} height={height} />
}
