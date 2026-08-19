import { useMap3DContext } from '../../context/Map3DContext'

function formatValue(value, digits = 1) {
  return Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : '—'
}

function NetworkRail({ stations, updatedAt }) {
  const activeStations = stations.filter(station => station.is_active)
  const measuredStations = stations.filter(station => Number.isFinite(station.current_leq_dbfs))
  const cityLeq = measuredStations.length
    ? measuredStations.reduce((sum, station) => sum + Number(station.current_leq_dbfs), 0) / measuredStations.length
    : null

  return (
    <div className="map3d-rail__network" aria-label="Resumen temporal de la red">
      <div className="map3d-rail__context">
        <span className="map3d-rail__label">Estado de la red</span>
        <strong>Ruido urbano en Bogotá</strong>
        <small>{updatedAt ? `Snapshot ${updatedAt.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}` : 'Esperando snapshot'}</small>
      </div>
      <div className="map3d-rail__network-stats">
        <div><span>Activas</span><strong>{activeStations.length}<small>/{stations.length}</small></strong></div>
        <div><span>Leq medio</span><strong>{formatValue(cityLeq)}<small> dBFS</small></strong></div>
        <div><span>Con lectura</span><strong>{measuredStations.length}<small> estaciones</small></strong></div>
      </div>
    </div>
  )
}

export default function Map3DTemporalRail({ mode }) {
  const { stations, selectedStationCode, updatedAt } = useMap3DContext()

  // La estación seleccionada ya tiene una tarjeta contextual en el mapa.
  // El resumen de red solo ocupa esta posición cuando no hay selección.
  if (selectedStationCode) return null

  return (
    <section className={`map3d-rail map3d-rail--${mode}`} aria-label="Rail temporal del mapa 3D">
      <NetworkRail stations={stations} updatedAt={updatedAt} />
    </section>
  )
}
