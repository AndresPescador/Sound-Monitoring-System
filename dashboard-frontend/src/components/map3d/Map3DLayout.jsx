import { useLanguage } from '../../context/LanguageContext'
import { useEffect, useMemo, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import NoiseTwinMap from '../map/NoiseTwinMap'
import { useMap3DContext } from '../../context/Map3DContext'
import { map2DStationPath, ROUTES, stationPageTitle } from '../../routes'
import Map3DStationCard from './Map3DStationCard'
import Map3DTemporalRail from './Map3DTemporalRail'
import Map3DAnalysisPanel from './Map3DAnalysisPanel'
import ThemeToggle from '../shared/ThemeToggle'
import LanguageSwitcher from '../shared/LanguageSwitcher'

function getMode(pathname) {
  if (pathname.includes('/data')) return 'data'
  if (pathname.includes('/stations/')) return 'station'
  return 'overview'
}

function Map3DNav() {
  const { t } = useLanguage()
  const location = useLocation()
  const links = [
    { to: ROUTES.map3D, label: t('landing.3d_map'), end: true },
    { to: ROUTES.map3DData, label: t('maps.open_data') },
  ]

  return (
    <header className="map3d-topbar">
      <Link to={ROUTES.landing} className="map3d-topbar__brand" aria-label={t('maps.back_to_the_acoustic_monitoring_system_home_page')}>
        <img
          className="map3d-topbar__mark"
          src="/assets/logo-oido-urbano.png"
          alt=""
          aria-hidden="true"
        />
        <span>{t('admin.acoustic_monitoring')}<small>{t('landing.3d_map')}</small></span>
      </Link>

      <nav className="map3d-topbar__nav" aria-label={t('maps.3d_experience_tools')}>
        {links.map(link => {
          const isActive = link.to === ROUTES.map3D
            ? location.pathname === ROUTES.map3D || location.pathname.startsWith(`${ROUTES.map3D}/stations/`)
            : location.pathname === link.to
          return (
          <Link
            key={link.to}
            to={link.to}
            className={`map3d-topbar__link ${isActive ? 'is-active' : ''}`}
            aria-current={isActive ? 'page' : undefined}
          >
            {link.label}
          </Link>
          )
        })}
      </nav>

      <div className="map3d-topbar__actions">
        <LanguageSwitcher />
          <ThemeToggle />
        <Link to={ROUTES.map2D} className="map3d-topbar__switch">{t('maps.switch_to_2d_map')}</Link>
      </div>
    </header>
  )
}

function Map3DStationPicker() {
  const { t } = useLanguage()
  const { stations, selectedStationCode, hoveredStationCode, loadingStations, selectStation, setHoveredStationCode } = useMap3DContext()
  // En escritorio la lista es el punto de entrada de la experiencia; en móvil
  // empieza plegada para no tapar el mapa y conserva el mismo control para abrirla.
  const [open, setOpen] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 768)
  const [query, setQuery] = useState('')
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const filteredStations = useMemo(() => (
    normalizedQuery
      ? stations.filter(station => `${station.name} ${station.locality} ${station.station_code}`.toLocaleLowerCase().includes(normalizedQuery))
      : stations
  ), [normalizedQuery, stations])

  return (
    <aside className={`map3d-station-picker map3d-station-picker--floating ${open ? 'is-open' : ''}`} aria-label={t('maps.3d_station_selector')}>
      <button
        type="button"
        className="map3d-station-picker__toggle"
        onClick={() => setOpen(current => !current)}
        aria-expanded={open}
        aria-controls="map3d-station-picker-content"
      >
        <span>
          <span className="map3d-overline">{t('admin.stations')}</span>
          <strong>{selectedStationCode ? t('maps.focused_station') : t('maps.find_a_station')}</strong>
        </span>
        <span className="map3d-station-picker__count">{stations.length}</span>
      </button>

      {open && (
        <div id="map3d-station-picker-content" className="map3d-station-picker__content">
          <div className="map3d-station-picker__intro">
            <strong>{t('maps.explore_by_station')}</strong>
            <span>{t('maps.select_a_row_to_center_the_map_and_see')}</span>
          </div>
          <label className="map3d-search-field">
            <span>{t('maps.filter_by_name_locality_or_code')}</span>
            <input
              type="search"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder={t('maps.e_g_usaquen')}
              autoFocus
            />
          </label>
          <p className="map3d-station-picker__hint">
            {loadingStations ? t('maps.updating_stations') : t('maps.of_stations', { p0: t.number(filteredStations.length), p1: t.number(stations.length), count: stations.length })}
          </p>
          <div className="map3d-station-list" role="list">
            {filteredStations.map(station => (
              <button
                key={station.station_code}
                type="button"
                className={`map3d-station-row ${station.station_code === selectedStationCode ? 'is-selected' : ''}`}
                onClick={() => { selectStation(station.station_code); setOpen(false) }}
                onMouseEnter={() => setHoveredStationCode(station.station_code)}
                onMouseLeave={() => setHoveredStationCode(current => current === station.station_code ? null : current)}
                onFocus={() => setHoveredStationCode(station.station_code)}
                onBlur={() => setHoveredStationCode(current => current === station.station_code ? null : current)}
                aria-pressed={station.station_code === selectedStationCode}
              >
                <span className={`map3d-level-dot ${Number.isFinite(station.current_leq_dbfs) ? station.current_leq_dbfs < -30 ? 'is-low' : station.current_leq_dbfs < -20 ? 'is-medium' : 'is-high' : 'is-unknown'}`} aria-hidden="true" />
                <span className="map3d-station-row__name">
                  <strong>{station.name}</strong>
                  <small>{station.locality} · {station.station_code}</small>
                </span>
                <span className="map3d-data-value">
                  {Number.isFinite(station.current_leq_dbfs) ? `${t.fixed(station.current_leq_dbfs, 1)} dBFS` : t('common.no_reading')}
                </span>
              </button>
            ))}
            {!filteredStations.length && !loadingStations && (
              <p className="map3d-empty-state">{t('maps.no_stations_match_your_search')}</p>
            )}
          </div>
        </div>
      )}
      {hoveredStationCode && !open && <span className="sr-only">{t('maps.station_focused_on_the_map') + ' '}{hoveredStationCode}</span>}
    </aside>
  )
}

function Map3DMapStatus() {
  const { t } = useLanguage()
  const { stationsError, summaryError, refreshStations, refreshingStations } = useMap3DContext()
  const message = stationsError ?? summaryError
  if (!message) return null
  return (
    <div className="map3d-map-status" role="alert">
      <span>{t(message)}</span>
      <button type="button" onClick={() => refreshStations()} disabled={refreshingStations}>
        {refreshingStations ? t('maps.updating') : t('maps.retry')}
      </button>
    </div>
  )
}

export default function Map3DLayout() {
  const { t } = useLanguage()
  const location = useLocation()
  const navigate = useNavigate()
  const { stations, selectedStation, selectedStationCode, hoveredStationCode, highlightedStationCodes, selectStation, setHoveredStationCode } = useMap3DContext()
  const mode = getMode(location.pathname)
  const [stationScreenPosition, setStationScreenPosition] = useState(null)
  const [analysisOpen, setAnalysisOpen] = useState(false)
  const [stationCardVisible, setStationCardVisible] = useState(mode === 'station')

  useEffect(() => {
    setStationScreenPosition(null)
    setAnalysisOpen(mode === 'data')
    setStationCardVisible(mode === 'station')
  }, [mode, location.pathname])

  const openAnalysis = () => {
    if (!selectedStationCode) return
    navigate(map2DStationPath(selectedStationCode))
  }

  const closeAnalysis = () => {
    setAnalysisOpen(false)
    navigate(ROUTES.map3D)
  }

  const pageTitle = mode === 'station'
    ? t('maps.on_the_3d_map', { p0: stationPageTitle(selectedStation?.name ?? selectedStationCode ?? t('common.selected'), t) })
    : mode === 'data'
      ? t('maps.open_data_on_the_3d_map')
      : t('maps.3d_acoustic_map')

  return (
    <div className={`map3d-shell map3d-shell--${mode}`}>
      <main id="main-content" className="map3d-main" tabIndex={-1}>
        <h1 className="sr-only" tabIndex={-1}>{pageTitle}</h1>
        <NoiseTwinMap
          stations={stations}
          selectedStationCode={selectedStationCode}
          highlightedStationCodes={highlightedStationCodes}
          hoveredStationCode={hoveredStationCode}
          onSelectStation={selectStation}
          onStationScreenPosition={setStationScreenPosition}
        />
        <Map3DStationPicker />
        <Map3DNav />
        <p className="sr-only" aria-live="polite">
          {selectedStation ? t('maps.selected_station_the_contextual_card_and_timeline_are_available', { p0: selectedStation.name }) : t('maps.no_station_selected_the_timeline_shows_the_overall_network')}
        </p>
        <Map3DMapStatus />

        {mode === 'station' && !analysisOpen && stationCardVisible && (
          <Map3DStationCard
            position={stationScreenPosition}
            onOpenAnalysis={openAnalysis}
            onHideCard={() => setStationCardVisible(false)}
          />
        )}

        <Map3DTemporalRail mode={mode} />

        <Map3DAnalysisPanel mode={mode} open={analysisOpen} onClose={closeAnalysis}>
          <Outlet />
        </Map3DAnalysisPanel>
      </main>
    </div>
  )
}
