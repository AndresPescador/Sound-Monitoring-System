import { useLanguage } from '../../context/LanguageContext'
import { getMetric, RAW_METRIC_IDS } from './metricCatalog'
export default function MetricSelector({ value, onChange, className = '', id, group }) {
  const { t } = useLanguage()
  return <select id={id} value={value} onChange={e => onChange(e.target.value)} className={className || 'dashboard-select'}>
    {RAW_METRIC_IDS.filter(key => !group || getMetric(key).group === group).map(key => <option key={key} value={key}>{getMetric(key, t).label}</option>)}
  </select>
}
