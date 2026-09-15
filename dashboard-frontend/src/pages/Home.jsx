import { bogotaTime } from '../components/shared/dateRangeUtils'
import { useLanguage } from '../context/LanguageContext'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getSystemStats } from '../api/system'
import { getStations }    from '../api/stations'
import StatCard            from '../components/cards/StatCard'
import StationCard         from '../components/cards/StationCard'
import StationMap          from '../components/map/StationMap'
import LoadingSpinner      from '../components/shared/LoadingSpinner'
import { ROUTES } from '../routes'

export default function Home() {
  const { t } = useLanguage()
  const [view, setView] = useState('map')
  const [attempt, setAttempt] = useState(0)
  const [stats,    setStats]    = useState(null)
  const [stations, setStations] = useState([])
  const [stationQuery, setStationQuery] = useState('')
  const [hoveredStationCode, setHoveredStationCode] = useState(null)
  const [selectedStationCode, setSelectedStationCode] = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    Promise.all([getSystemStats(), getStations()])
      .then(([sr, st]) => {
        if (!active) return
        setStats(sr.data)
        setStations(st.data)
      })
      .catch(() => { if (active) setError(true) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [attempt])

  if (loading) return <LoadingSpinner label={t('common.loading_2d_map')} />
  if (error)   return <p className="dashboard-error" role="alert">{t('common.network_error')}<button className="dashboard-button" onClick={() => setAttempt(v => v + 1)}>{t('ux.retry')}</button></p>

  const lastSeen = stats?.last_measurement_received_at
    ? bogotaTime(stats.last_measurement_received_at, t)
    : null
  const normalizedQuery = stationQuery.trim().toLocaleLowerCase('es')
  const filteredStations = normalizedQuery
    ? stations.filter(station => (
      `${station.name} ${station.locality} ${station.station_code}`.toLocaleLowerCase('es').includes(normalizedQuery)
    ))
    : stations

  return (
    <div className="dashboard-page dashboard-home">
      <header className="dashboard-home-header">
        <div className="dashboard-home-header__intro">
          <h1 tabIndex={-1}>{t('common.2d_acoustic_map')}</h1>
          <p>{t('common.explore_bogota_s_binaural_network_and_open_each_station')}</p>
        </div>

        <div className="dashboard-stat-grid" aria-label={t('maps.acoustic_network_summary')}>
          <StatCard
            label={t('common.active_network')}
            value={t('common.of', { p0: stats?.active_stations ?? 0, p1: stats?.total_stations ?? 0 })}
            sub={t('common.operational_stations')}
            accent
          />
          <StatCard label={t('maps.measurements')} value={stats?.total_measurements?.toLocaleString(t.locale)} sub={t('common.total_records')} />
          <StatCard label={t('common.latest_measurement_2')} value={lastSeen ?? t('common.no_record')} sub={t('common.date_and_time')} />
        </div>

        <div className="dashboard-page-header__actions">
          <Link to={ROUTES.map2DCompare} className="dashboard-button dashboard-button--primary">{t('common.compare_data')}</Link>
        </div>
      </header>

      <div className="ux-map-view" role="group" aria-label={t('ux.map')}>{['map', 'list'].map(id => <button type="button" key={id} aria-pressed={view === id} onClick={() => setView(id)}>{t(`ux.${id}`)}</button>)}</div>
      <section className={`dashboard-map-layout ux-map-view--${view}`} aria-label={t('ux.map')}>
        <div className="dashboard-map-panel">
          <div className="dashboard-map-canvas">
            <StationMap
              stations={stations}
              hoveredStationCode={hoveredStationCode}
              selectedStationCode={selectedStationCode}
              onSelect={setSelectedStationCode}
            />
          </div>
          <div className="dashboard-map-legend" aria-label={t('common.noise_levels')}>
            <span className="dashboard-map-legend__title">{t('common.noise_level')}</span>
            <span className="dashboard-map-legend__item"><i className="dashboard-map-legend__dot dashboard-map-legend__dot--low" aria-hidden="true" />{t('common.low')}</span>
            <span className="dashboard-map-legend__item"><i className="dashboard-map-legend__dot dashboard-map-legend__dot--medium" aria-hidden="true" />{t('common.moderate')}</span>
            <span className="dashboard-map-legend__item"><i className="dashboard-map-legend__dot dashboard-map-legend__dot--high" aria-hidden="true" />{t('common.high')}</span>
          </div>
        </div>

        <aside className="dashboard-station-panel" id="estaciones" aria-labelledby="stations-heading">
          <div className="dashboard-station-panel__heading">
            <div className="dashboard-station-panel__title">
              <img
                className="dashboard-station-panel__logo"
                src="/assets/logo-estacion-sonora.png"
                alt=""
                aria-hidden="true"
              />
              <div>
                <h2 id="stations-heading">{t('admin.stations')}</h2>
                <p>{t('common.binaural_listening_network')}</p>
              </div>
            </div>
            <span>{normalizedQuery ? t('common.of', { p0: filteredStations.length, p1: stations.length }) : t('common.registered', { p0: t.number(stations.length), count: stations.length })}</span>
          </div>
          <label className="dashboard-station-search">
            <span>{t('maps.find_a_station')}</span>
            <input
              type="search"
              value={stationQuery}
              onChange={event => setStationQuery(event.target.value)}
              placeholder={t('common.name_locality_or_code')}
            />
          </label>
          <div className="dashboard-station-list">
            {filteredStations.map(s => (
              <StationCard
                key={s.station_code}
                station={s}
                selected={s.station_code === selectedStationCode}
                onHover={setHoveredStationCode}
                onSelect={view === 'list' ? undefined : setSelectedStationCode}
              />
            ))}
            {!stations.length && <p className="dashboard-empty-state">{t('common.no_stations_registered')}</p>}
            {stations.length > 0 && !filteredStations.length && (
              <p className="dashboard-empty-state">{t('maps.no_stations_match_your_search')}</p>
            )}
          </div>
        </aside>
      </section>
    </div>
  )
}
