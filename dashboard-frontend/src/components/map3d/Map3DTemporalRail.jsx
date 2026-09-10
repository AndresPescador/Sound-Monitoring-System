import { useLanguage } from '../../context/LanguageContext'
import { useMap3DContext } from '../../context/Map3DContext'

function formatValue(value, digits = 1, t) {
  return Number.isFinite(Number(value)) ? t.fixed(Number(value), digits) : '—'
}

function NetworkRail({ stations, updatedAt }) {
  const { t } = useLanguage()
  const activeStations = stations.filter(station => station.is_active)
  const measuredStations = stations.filter(station => Number.isFinite(station.current_leq_dbfs))
  const cityLeq = measuredStations.length
    ? measuredStations.reduce((sum, station) => sum + Number(station.current_leq_dbfs), 0) / measuredStations.length
    : null

  return (
    <div className="map3d-rail__network" aria-label={t('maps.network_time_summary')}>
      <div className="map3d-rail__context">
        <span className="map3d-rail__label">{t('maps.network_status')}</span>
        <strong>{t('maps.urban_noise_in_bogota')}</strong>
        <small>{updatedAt ? t('maps.snapshot', { p0: updatedAt.toLocaleTimeString(t.locale, { hour: '2-digit', minute: '2-digit' }) }) : t('maps.waiting_for_snapshot')}</small>
      </div>
      <div className="map3d-rail__network-stats">
        <div><span>{t('maps.active_3')}</span><strong>{activeStations.length}<small>/{stations.length}</small></strong></div>
        <div><span>{t('maps.mean_leq')}</span><strong>{formatValue(cityLeq, undefined, t)}<small> dBFS</small></strong></div>
        <div><span>{t('maps.with_readings')}</span><strong>{measuredStations.length}<small>{' ' + t('maps.stations', { count: measuredStations.length })}</small></strong></div>
      </div>
    </div>
  )
}

export default function Map3DTemporalRail({ mode }) {
  const { t } = useLanguage()
  const { stations, selectedStationCode, updatedAt } = useMap3DContext()

  // La estación seleccionada ya tiene una tarjeta contextual en el mapa.
  // El resumen de red solo ocupa esta posición cuando no hay selección.
  if (selectedStationCode) return null

  return (
    <section className={`map3d-rail map3d-rail--${mode}`} aria-label={t('maps.3d_map_timeline')}>
      <NetworkRail stations={stations} updatedAt={updatedAt} />
    </section>
  )
}
