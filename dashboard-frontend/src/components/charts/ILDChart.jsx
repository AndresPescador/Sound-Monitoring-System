import MetricPlot from './MetricPlot'
import { useLanguage } from '../../context/LanguageContext'
export default function ILDChart({ data = [], axisMode = 'range', range = null }) {
  const { t } = useLanguage()
  return <><MetricPlot data={data.map(row => ({ ...row, t: row.recorded_at }))} columns={[{ key: 'ild_db', label: 'ILD', metric: 'ild_db' }]} metric="ild_db" kind="bar" axisMode={axisMode} range={range} colorByValue={value => value >= 0 ? 'var(--dashboard-chart-series-1)' : 'var(--dashboard-chart-series-6)'} /><p className="ux-note">{t('ux.ildHelp')}</p></>
}
