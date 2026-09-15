import MetricPlot from './MetricPlot'
import { compactEmptyTimeBuckets, getChartDataWindow } from './timeAxis'
import { getCompareSeriesStyles } from './compareSeriesColors'
export default function CompareChart({ series = [], metric = 'leq_hour', axisMode = 'range', range = null }) {
  const styles = getCompareSeriesStyles(series.map(s => s.station_code))
  const columns = series.map(s => ({ key: s.station_code, label: s.displayName ?? s.locality ?? s.station_code, metric, color: styles.get(s.station_code)?.color, dash: styles.get(s.station_code)?.strokeDasharray }))
  const rows = new Map()
  series.forEach(s => s.data.forEach(point => {
    const row = rows.get(point.hour_start) ?? { t: point.hour_start }
    row[s.station_code] = point.value
    row[`${s.station_code}_min`] = point.value_min
    row[`${s.station_code}_max`] = point.value_max
    rows.set(point.hour_start, row)
  }))
  const data = [...rows.values()].sort((a, b) => a.t.localeCompare(b.t))
  const focused = getChartDataWindow(data, axisMode, columns.map(col => col.key))
  return <MetricPlot data={axisMode === 'data' ? compactEmptyTimeBuckets(focused, columns.map(col => col.key)) : focused} columns={columns} metric={metric} height={280} axisMode={axisMode} range={range} interactiveLegend compressed />
}
