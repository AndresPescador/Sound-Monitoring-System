export default function StatCard({ label, value, sub, accent = false }) {
  return (
    <div className={`dashboard-stat-card ${accent ? 'dashboard-stat-card--accent' : ''}`}>
      <span className="dashboard-stat-card__label">{label}</span>
      <span className="dashboard-stat-card__value">{value ?? 'Sin dato'}</span>
      {sub && <span className="dashboard-stat-card__sub">{sub}</span>}
    </div>
  )
}
