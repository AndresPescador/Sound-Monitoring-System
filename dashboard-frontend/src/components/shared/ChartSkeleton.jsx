export default function ChartSkeleton({
  height = 280,
  label = 'Cargando datos...',
  showLegend = true,
}) {
  return (
    <div
      className="dashboard-chart-skeleton"
      style={{ '--chart-skeleton-height': `${height}px` }}
      role="status"
      aria-live="polite"
      aria-label={label}
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
      <span className="dashboard-chart-skeleton__label">{label}</span>
    </div>
  )
}
