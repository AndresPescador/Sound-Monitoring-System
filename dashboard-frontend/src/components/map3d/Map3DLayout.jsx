import { useEffect, useMemo, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import NoiseTwinMap from '../map/NoiseTwinMap'
import { useMap3DContext } from '../../context/Map3DContext'
import { map2DStationPath, ROUTES, stationPageTitle } from '../../routes'
import Map3DStationCard from './Map3DStationCard'
import Map3DTemporalRail from './Map3DTemporalRail'
import Map3DAnalysisPanel from './Map3DAnalysisPanel'
import ThemeToggle from '../shared/ThemeToggle'

function getMode(pathname) {
  if (pathname.includes('/data')) return 'data'
  if (pathname.includes('/stations/')) return 'station'
  return 'overview'
}

function Map3DNav() {
  const location = useLocation()
  const links = [
    { to: ROUTES.map3D, label: 'Mapa 3D', end: true },
    { to: ROUTES.map3DData, label: 'Datos abiertos' },
  ]

  return (
    <header className="map3d-topbar">
      <Link to={ROUTES.landing} className="map3d-topbar__brand" aria-label="Volver al inicio del Sistema de Monitoreo Acústico">
        <img
          className="map3d-topbar__mark"
          src="/assets/logo-oido-urbano.png"
          alt=""
          aria-hidden="true"
        />
        <span>Monitoreo Acústico<small>Mapa 3D</small></span>
      </Link>

      <nav className="map3d-topbar__nav" aria-label="Herramientas de la experiencia 3D">
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
        <ThemeToggle />
        <Link to={ROUTES.map2D} className="map3d-topbar__switch">Cambiar a mapa 2D</Link>
      </div>
    </header>
  )
}

function Map3DStationPicker() {
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
    <aside className={`map3d-station-picker map3d-station-picker--floating ${open ? 'is-open' : ''}`} aria-label="Selector de estaciones 3D">
      <button
        type="button"
        className="map3d-station-picker__toggle"
        onClick={() => setOpen(current => !current)}
        aria-expanded={open}
        aria-controls="map3d-station-picker-content"
      >
        <span>
          <span className="map3d-overline">Estaciones</span>
          <strong>{selectedStationCode ? 'Estación enfocada' : 'Buscar una estación'}</strong>
        </span>
        <span className="map3d-station-picker__count">{stations.length}</span>
      </button>

      {open && (
        <div id="map3d-station-picker-content" className="map3d-station-picker__content">
          <div className="map3d-station-picker__intro">
            <strong>Explora por estación</strong>
            <span>Selecciona una fila para centrar el mapa y ver su lectura actual.</span>
          </div>
          <label className="map3d-search-field">
            <span>Filtrar por nombre, localidad o código</span>
            <input
              type="search"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Ej. Usaquén"
              autoFocus
            />
          </label>
          <p className="map3d-station-picker__hint">
            {loadingStations ? 'Actualizando estaciones…' : `${filteredStations.length} de ${stations.length} estaciones`}
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
                  {Number.isFinite(station.current_leq_dbfs) ? `${station.current_leq_dbfs.toFixed(1)} dBFS` : 'Sin dato'}
                </span>
              </button>
            ))}
            {!filteredStations.length && !loadingStations && (
              <p className="map3d-empty-state">No hay estaciones que coincidan con la búsqueda.</p>
            )}
          </div>
        </div>
      )}
      {hoveredStationCode && !open && <span className="sr-only">Estación enfocada en el mapa: {hoveredStationCode}</span>}
    </aside>
  )
}

function Map3DMapStatus() {
  const { stationsError, summaryError, refreshStations, refreshingStations } = useMap3DContext()
  const message = stationsError ?? summaryError
  if (!message) return null
  return (
    <div className="map3d-map-status" role="alert">
      <span>{message}</span>
      <button type="button" onClick={() => refreshStations()} disabled={refreshingStations}>
        {refreshingStations ? 'Actualizando…' : 'Reintentar'}
      </button>
    </div>
  )
}

export default function Map3DLayout() {
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
    ? `${stationPageTitle(selectedStation?.name ?? selectedStationCode ?? 'seleccionada')} en el mapa 3D`
    : mode === 'data'
      ? 'Datos abiertos en el mapa 3D'
      : 'Mapa acústico 3D'

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
          {selectedStation ? `Estación seleccionada: ${selectedStation.name}. La tarjeta contextual y el rail temporal están disponibles.` : 'Sin estación seleccionada. El rail muestra el estado general de la red.'}
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
