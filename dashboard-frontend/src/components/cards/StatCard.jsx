import { useLanguage } from '../../context/LanguageContext'
export default function StatCard({ label, value, sub, accent = false }) {
  const { t } = useLanguage()
  return (
    <div className={`dashboard-stat-card ${accent ? 'dashboard-stat-card--accent' : ''}`}>
      <span className="dashboard-stat-card__label">{t(label)}</span>
      <span className="dashboard-stat-card__value">{value ?? t('common.no_reading')}</span>
      {sub && <span className="dashboard-stat-card__sub">{sub}</span>}
    </div>
  )
}
