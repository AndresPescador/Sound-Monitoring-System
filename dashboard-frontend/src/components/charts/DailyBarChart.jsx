import MetricPlot from './MetricPlot'
export default function DailyBarChart({ data = [] }) {
  const rows = Array.from({ length: 24 }, (_, hour) => ({ t: `${String(hour).padStart(2, '0')}:00`, leq_hour: data.find(row => row.hour === hour)?.leq_hour ?? null }))
  return <MetricPlot data={rows} columns={[{ key: 'leq_hour', label: 'Leq', metric: 'leq_hour' }]} metric="leq_hour" kind="bar" categorical />
}
