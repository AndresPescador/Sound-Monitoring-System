import MetricPlot from './MetricPlot'
import { useLanguage } from '../../context/LanguageContext'
import { getMetric } from '../shared/metricCatalog'
export default function LevelBandChart({ data = [], axisMode = 'range', range = null }) {
  const { t } = useLanguage()
  const columns = ['leq_hour', 'l10', 'l50', 'l90'].map((key, i) => ({ key, label: key === 'leq_hour' ? 'Leq' : getMetric(key, t).label, metric: key, dash: ['', '8 4', '3 3', '12 3 2 3'][i] }))
  return <MetricPlot data={data.map(row => ({ ...row, t: row.hour_start }))} columns={columns} metric="leq_hour" kind="line" axisMode={axisMode} range={range} />
}
