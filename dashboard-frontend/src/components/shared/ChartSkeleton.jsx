import { message as localizedMessage } from '../../i18n/core.mjs'
import { useLanguage } from '../../context/LanguageContext'
export default function ChartSkeleton({
  height = 280,
  label = localizedMessage('common.loading_data'),
  showLegend = true,
}) {
  const { t } = useLanguage()
  return (
    <div
      className="dashboard-chart-skeleton"
      style={{ '--chart-skeleton-height': `${height}px` }}
      role="status"
      aria-live="polite"
      aria-label={t(label)}
    >
      <div className="dashboard-chart-skeleton__plot" aria-hidden="true">
        <span className="dashboard-chart-skeleton__axis dashboard-chart-skeleton__axis--y" />
        <span className="dashboard-chart-skeleton__axis dashboard-chart-skeleton__axis--x" />
        <span className="dashboard-chart-skeleton__tick dashboard-chart-skeleton__tick--1" />
        <span className="dashboard-chart-skeleton__tick dashboard-chart-skeleton__tick--2" />
        <span className="dashboard-chart-skeleton__tick dashboard-chart-skeleton__tick--3" />
        <span className="dashboard-chart-skeleton__tick dashboard-chart-skeleton__tick--4" />
        <span className="dashboard-chart-skeleton__shimmer" />
      </div>
      {showLegend && (
        <div className="dashboard-chart-skeleton__legend" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      )}
      <span className="dashboard-chart-skeleton__label">{t(label)}</span>
    </div>
  )
}
