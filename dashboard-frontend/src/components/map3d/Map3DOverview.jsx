import { defaultT } from '../../i18n/core.mjs'
import { useLanguage } from '../../context/LanguageContext'
import { Link } from 'react-router-dom'
import { useMap3DContext } from '../../context/Map3DContext'
import { ROUTES } from '../../routes'

function toEnergy(leq) {
  return Math.pow(10, leq / 10)
}

function toDbfs(energy) {
  return energy > 0 ? 10 * Math.log10(energy) : null
}

function relativeTime(value, t = defaultT) {
  if (!value) return t('maps.no_communication_recorded')
  try {
    return new Intl.RelativeTimeFormat('es', { numeric: 'auto' }).format(
      Math.round((new Date(value).getTime() - Date.now()) / 60000),
      'minute',
    )
  } catch {
    return t('maps.date_unavailable')
  }
}

export default function Map3DOverview() {
  const { t } = useLanguage()
  const { stations, updatedAt, loadingStations, refreshingStations, refreshStations, selectStation } = useMap3DContext()
  const observedStations = stations.filter(station => Number.isFinite(station.current_leq_dbfs))
  const activeStations = stations.filter(station => station.is_active)
  const cityLeq = observedStations.length
    ? toDbfs(observedStations.reduce((total, station) => total + toEnergy(station.current_leq_dbfs), 0) / observedStations.length)
    : null
  const recentStation = [...stations].sort((a, b) => new Date(b.last_seen_at ?? 0) - new Date(a.last_seen_at ?? 0))[0]

  return (
    <div className="map3d-overview">
      <div className="map3d-overview__intro">
        <div>
          <h2>{t('maps.explore_the_acoustic_network_without_leaving_the_map')}</h2>
          <p>{t('maps.select_a_column_or_station_to_open_its_analysis')}</p>
        </div>
        <button type="button" className="map3d-primary-button" onClick={() => refreshStations()} disabled={refreshingStations}>
          {refreshingStations ? t('maps.updating') : t('maps.refresh_snapshot')}
        </button>
      </div>

      <div className="map3d-summary-grid" aria-label={t('maps.acoustic_network_summary')}>
        <div className="map3d-summary-stat"><span>{t('maps.active_stations')}</span><strong>{loadingStations ? '—' : `${activeStations.length}/${stations.length}`}</strong><small>{t('maps.operational_network')}</small></div>
        <div className="map3d-summary-stat"><span>{t('maps.city_leq')}</span><strong>{cityLeq == null ? '—' : t.fixed(cityLeq, 1)}</strong><small>{t('maps.dbfs_energy_average')}</small></div>
        <div className="map3d-summary-stat"><span>{t('maps.with_recent_measurements')}</span><strong>{observedStations.length}</strong><small>{t('maps.observed_stations')}</small></div>
        <div className="map3d-summary-stat"><span>{t('maps.last_communication')}</span><strong>{recentStation ? relativeTime(recentStation.last_seen_at, t) : '—'}</strong><small>{updatedAt ? `snapshot ${updatedAt.toLocaleTimeString(t.locale, { hour: '2-digit', minute: '2-digit' })}` : t('maps.no_snapshot')}</small></div>
      </div>

      <div className="map3d-overview__footer">
        <p><strong>{t('maps.reading_the_map')}</strong>{' ' + t('maps.the_height_of_each_column_represents_relative_leq_intensity')}</p>
        <div className="map3d-overview__links">
          <Link to={ROUTES.map3DData}>{t('maps.open_data_portal')}</Link>
          {stations[0] && <button type="button" onClick={() => selectStation(stations[0].station_code)}>{t('maps.open_a_station')}</button>}
        </div>
      </div>
    </div>
  )
}
