import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getSystemStats } from '../api/system'
import { getStations }    from '../api/stations'
import StatCard            from '../components/cards/StatCard'
import StationCard         from '../components/cards/StationCard'
import StationMap          from '../components/map/StationMap'
import LoadingSpinner      from '../components/shared/LoadingSpinner'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { ROUTES } from '../routes'

export default function Home() {
  const [stats,    setStats]    = useState(null)
  const [stations, setStations] = useState([])
  const [stationQuery, setStationQuery] = useState('')
  const [hoveredStationCode, setHoveredStationCode] = useState(null)
  const [selectedStationCode, setSelectedStationCode] = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(null)

  useEffect(() => {
    Promise.all([getSystemStats(), getStations()])
      .then(([sr, st]) => {
        setStats(sr.data)
        setStations(st.data)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <LoadingSpinner label="Cargando mapa 2D..." />
  if (error)   return <p className="dashboard-error" role="alert">No fue posible cargar el mapa 2D: {error}</p>

  const lastSeen = stats?.last_measurement_received_at
    ? format(parseISO(stats.last_measurement_received_at), "d MMM yyyy HH:mm", { locale: es })
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
          <h1 tabIndex={-1}>Mapa acústico 2D</h1>
          <p>Explora la red binaural de Bogotá y abre cada estación para consultar su lectura actual.</p>
        </div>

        <div className="dashboard-stat-grid" aria-label="Resumen de la red acústica">
          <StatCard
            label="Red activa"
            value={`${stats?.active_stations ?? 0} de ${stats?.total_stations ?? 0}`}
            sub="estaciones operativas"
            accent
          />
          <StatCard label="Mediciones" value={stats?.total_measurements?.toLocaleString('es-CO')} sub="registros acumulados" />
          <StatCard label="Última medición" value={lastSeen ?? 'Sin registro'} sub="fecha y hora" />
        </div>

        <div className="dashboard-page-header__actions">
          <Link to={ROUTES.map2DCompare} className="dashboard-button dashboard-button--primary">Comparar datos</Link>
        </div>
      </header>

      <section className="dashboard-map-layout" aria-labelledby="map-heading">
        <div className="dashboard-map-panel">
          <div className="dashboard-map-canvas">
            <StationMap
              stations={stations}
              hoveredStationCode={hoveredStationCode}
              selectedStationCode={selectedStationCode}
              onSelect={setSelectedStationCode}
            />
          </div>
          <div className="dashboard-map-legend" aria-label="Niveles de ruido">
            <span className="dashboard-map-legend__title">Nivel de ruido</span>
            <span className="dashboard-map-legend__item"><i className="dashboard-map-legend__dot dashboard-map-legend__dot--low" aria-hidden="true" />Bajo</span>
            <span className="dashboard-map-legend__item"><i className="dashboard-map-legend__dot dashboard-map-legend__dot--medium" aria-hidden="true" />Moderado</span>
            <span className="dashboard-map-legend__item"><i className="dashboard-map-legend__dot dashboard-map-legend__dot--high" aria-hidden="true" />Alto</span>
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
                <h2 id="stations-heading">Estaciones</h2>
                <p>Red de escucha binaural</p>
              </div>
            </div>
            <span>{normalizedQuery ? `${filteredStations.length} de ${stations.length}` : `${stations.length} registradas`}</span>
          </div>
          <label className="dashboard-station-search">
            <span>Buscar una estación</span>
            <input
              type="search"
              value={stationQuery}
              onChange={event => setStationQuery(event.target.value)}
              placeholder="Nombre, localidad o código"
            />
          </label>
          <div className="dashboard-station-list">
            {filteredStations.map(s => (
              <StationCard
                key={s.station_code}
                station={s}
                selected={s.station_code === selectedStationCode}
                onHover={setHoveredStationCode}
                onSelect={setSelectedStationCode}
              />
            ))}
            {!stations.length && <p className="dashboard-empty-state">No hay estaciones registradas.</p>}
            {stations.length > 0 && !filteredStations.length && (
              <p className="dashboard-empty-state">No hay estaciones que coincidan con la búsqueda.</p>
            )}
          </div>
        </aside>
      </section>
    </div>
  )
}
