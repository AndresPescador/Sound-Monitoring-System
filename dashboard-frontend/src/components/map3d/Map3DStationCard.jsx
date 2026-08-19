import { useMemo } from 'react'
import { useMap3DContext } from '../../context/Map3DContext'

function formatValue(value, digits = 1) {
  return Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : '—'
}

function getCardPlacement(position) {
  if (!position) return { side: 'right', style: undefined }

  const viewportWidth = typeof window === 'undefined' ? 1440 : window.innerWidth
  const viewportHeight = typeof window === 'undefined' ? 900 : window.innerHeight
  const cardWidth = Math.min(336, Math.max(280, viewportWidth - 32))
  const gap = 24
  const railHeight = viewportWidth <= 767 ? 166 : 136
  const stationRailWidth = viewportWidth > 1023 ? 376 : 0
  const canPlaceRight = position.x + gap + cardWidth <= viewportWidth - stationRailWidth - 16
  const side = canPlaceRight ? 'right' : 'left'
  const left = side === 'right'
    ? Math.min(position.x + gap, viewportWidth - cardWidth - 16)
    : Math.max(position.x - gap, cardWidth + 16)
  const top = Math.min(
    Math.max(position.y, 142),
    Math.max(142, viewportHeight - railHeight - 128),
  )

  return { side, style: { left: `${left}px`, top: `${top}px` } }
}

export default function Map3DStationCard({ position, onOpenAnalysis, onHideCard }) {
  const { selectedStation, selectedStationCode, selectedSummary, summaryError } = useMap3DContext()
  const station = selectedStation ?? selectedSummary
  const isActive = selectedSummary?.is_active ?? selectedStation?.is_active
  const placement = useMemo(() => getCardPlacement(position), [position])

  if (!station && !selectedStationCode) return null

  const name = station?.name ?? selectedStationCode ?? 'Estación seleccionada'
  const locality = station?.locality ?? 'Cargando localidad'
  const latest = selectedSummary?.latest_leq_dbfs ?? station?.current_leq_dbfs

  return (
    <article
      className={`map3d-station-card ${position ? `is-anchored is-${placement.side}` : 'is-positioning'}`}
      style={placement.style}
      aria-label={`Resumen de ${name}`}
    >
      <span className="map3d-station-card__pointer" aria-hidden="true" />
      <header className="map3d-station-card__header">
        <div className="map3d-station-card__identity">
          <span className="map3d-code">{selectedStationCode}</span>
          <h2>{name}</h2>
          <p>{locality}</p>
        </div>
        <div className={`map3d-status ${isActive ? 'is-active' : 'is-inactive'}`}>
          {isActive == null ? 'Sin estado' : isActive ? 'Activa' : 'Inactiva'}
        </div>
      </header>

      <div className="map3d-station-card__metrics">
        <div>
          <span>Leq actual</span>
          <strong>{formatValue(latest)} <small>dBFS</small></strong>
        </div>
        <div>
          <span>Última hora</span>
          <strong>{formatValue(selectedSummary?.last_hour_leq)} <small>dBFS</small></strong>
        </div>
        <div>
          <span>Mediciones</span>
          <strong>{selectedSummary?.total_measurements?.toLocaleString('es-CO') ?? '—'}</strong>
        </div>
      </div>

      {summaryError && <p className="map3d-station-card__error">{summaryError}</p>}

      <footer className="map3d-station-card__actions">
        <button type="button" className="map3d-primary-button" onClick={onOpenAnalysis}>
          Ver análisis completo
        </button>
        <button type="button" className="map3d-card-link" onClick={onHideCard}>
          Ocultar tarjeta
        </button>
      </footer>
    </article>
  )
}
