import { useMap3DContext } from '../../context/Map3DContext'

const PANEL_LABELS = {
  station: { title: 'Análisis de estación', description: 'Explora una métrica a la vez y conserva el mapa visible.' },
  data: { title: 'Datos abiertos', description: 'Consulta y descarga las mediciones disponibles.' },
}

export default function Map3DAnalysisPanel({ mode, open, onClose, children }) {
  const { selectedStation, selectedStationCode } = useMap3DContext()
  if (!open) return null

  const labels = PANEL_LABELS[mode] ?? PANEL_LABELS.station
  const title = mode === 'station' && selectedStation ? selectedStation.name : labels.title
  const context = mode === 'station'
    ? `${selectedStation?.locality ?? 'Estación'} · ${selectedStationCode ?? 'seleccionada'}`
    : labels.description

  return (
    <aside className={`map3d-analysis-panel map3d-analysis-panel--${mode}`} aria-label={labels.title} role="region">
      <header className="map3d-analysis-panel__header">
        <div>
          <span className="map3d-code">{mode === 'station' ? 'DETALLE' : mode.toUpperCase()}</span>
          <h2>{title}</h2>
          <p>{context}</p>
        </div>
        <button type="button" className="map3d-analysis-panel__close" onClick={onClose} aria-label="Cerrar panel de análisis">Cerrar</button>
      </header>
      <div className="map3d-analysis-panel__body">
        <div className="map3d-analysis-panel__scroll">{children}</div>
      </div>
    </aside>
  )
}
