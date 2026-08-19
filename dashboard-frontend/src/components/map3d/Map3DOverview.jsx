import { Link } from 'react-router-dom'
import { useMap3DContext } from '../../context/Map3DContext'
import { ROUTES } from '../../routes'

function toEnergy(leq) {
  return Math.pow(10, leq / 10)
}

function toDbfs(energy) {
  return energy > 0 ? 10 * Math.log10(energy) : null
}

function relativeTime(value) {
  if (!value) return 'sin comunicación registrada'
  try {
    return new Intl.RelativeTimeFormat('es', { numeric: 'auto' }).format(
      Math.round((new Date(value).getTime() - Date.now()) / 60000),
      'minute',
    )
  } catch {
    return 'fecha no disponible'
  }
}

export default function Map3DOverview() {
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
          <h2>Explora la red acústica sin salir del mapa.</h2>
          <p>Selecciona una columna o una estación para abrir su análisis. El mapa permanece activo mientras cambias de vista.</p>
        </div>
        <button type="button" className="map3d-primary-button" onClick={() => refreshStations()} disabled={refreshingStations}>
          {refreshingStations ? 'Actualizando…' : 'Actualizar snapshot'}
        </button>
      </div>

      <div className="map3d-summary-grid" aria-label="Resumen de la red acústica">
        <div className="map3d-summary-stat"><span>Estaciones activas</span><strong>{loadingStations ? '—' : `${activeStations.length}/${stations.length}`}</strong><small>red operativa</small></div>
        <div className="map3d-summary-stat"><span>Leq ciudad</span><strong>{cityLeq == null ? '—' : cityLeq.toFixed(1)}</strong><small>dBFS · promedio energético</small></div>
        <div className="map3d-summary-stat"><span>Con medición reciente</span><strong>{observedStations.length}</strong><small>estaciones observadas</small></div>
        <div className="map3d-summary-stat"><span>Última comunicación</span><strong>{recentStation ? relativeTime(recentStation.last_seen_at) : '—'}</strong><small>{updatedAt ? `snapshot ${updatedAt.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}` : 'sin snapshot'}</small></div>
      </div>

      <div className="map3d-overview__footer">
        <p><strong>Lectura del mapa:</strong> la altura de cada columna representa intensidad relativa de Leq, no metros acústicos reales.</p>
        <div className="map3d-overview__links">
          <Link to={ROUTES.map3DCompare}>Comparar localidades y estaciones</Link>
          <Link to={ROUTES.map3DData}>Abrir datos abiertos</Link>
          {stations[0] && <button type="button" onClick={() => selectStation(stations[0].station_code)}>Abrir una estación</button>}
        </div>
      </div>
    </div>
  )
}
