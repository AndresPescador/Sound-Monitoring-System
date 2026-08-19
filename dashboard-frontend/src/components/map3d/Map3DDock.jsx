import { useLocation } from 'react-router-dom'
import { useMap3DContext } from '../../context/Map3DContext'

const DOCK_LABELS = {
  overview: { eyebrow: 'Red de Bogotá', title: 'Estado de la ciudad' },
  station: { eyebrow: 'Estación seleccionada', title: 'Análisis acústico' },
  compare: { eyebrow: 'Análisis comparativo', title: 'Comparar estaciones' },
  data: { eyebrow: 'Datos abiertos', title: 'Consultar y descargar' },
}

export default function Map3DDock({ mode, size, visible, onSizeChange, onClose, selectedStationCode, children }) {
  const location = useLocation()
  const { stations, selectedStation, selectedSummary, updatedAt, loadingStations } = useMap3DContext()
  const labels = DOCK_LABELS[mode] ?? DOCK_LABELS.overview

  const compactSummary = mode === 'overview'
    ? `${stations.filter(station => station.is_active).length}/${stations.length} activas`
    : selectedStation?.name ?? selectedStationCode ?? 'Sin selección'

  return (
    <section
      className={`map3d-dock map3d-dock--${size} ${visible ? 'is-visible' : 'is-hidden'}`}
      aria-label="Dock analítico de la experiencia 3D"
      role="region"
      tabIndex={-1}
    >
      <div className="map3d-dock__surface">
        <div className="map3d-dock__handle" aria-hidden="true" />
        <header className="map3d-dock__header">
          <div className="map3d-dock__heading">
            <span className="map3d-overline">{labels.eyebrow}</span>
            <h1>{labels.title}</h1>
            <p className="map3d-dock__compact-summary">
              {loadingStations ? 'Actualizando red…' : compactSummary}
              {updatedAt && mode === 'overview' ? ` · actualizado ${updatedAt.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}` : ''}
            </p>
          </div>

          <div className="map3d-dock__controls" aria-label="Tamaño del dock">
            <button type="button" className={size === 'compact' ? 'is-active' : ''} aria-pressed={size === 'compact'} onClick={() => onSizeChange('compact')}>Mínimo</button>
            <button type="button" className={size === 'medium' ? 'is-active' : ''} aria-pressed={size === 'medium'} onClick={() => onSizeChange('medium')}>Medio</button>
            <button type="button" className={size === 'expanded' ? 'is-active' : ''} aria-pressed={size === 'expanded'} onClick={() => onSizeChange('expanded')}>Expandir</button>
            <button type="button" className="map3d-dock__close" onClick={onClose}>{mode === 'overview' ? 'Ocultar' : 'Atrás'}</button>
          </div>
        </header>

        <div className="map3d-dock__body">
          <div className="map3d-dock__scroll" key={location.pathname}>
            {children}
          </div>
        </div>
      </div>
    </section>
  )
}
