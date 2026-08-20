import { Link } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { map2DStationPath } from '../../routes'

const NOISE_STYLES = {
  low:      { tone: 'low',    label: 'Bajo'     },
  moderate: { tone: 'medium', label: 'Moderado' },
  high:     { tone: 'high',   label: 'Alto'     },
}

export default function StationCard({ station, selected = false, onHover, onSelect }) {
  const style = NOISE_STYLES[station.noise_level] ?? {
    tone:  'unknown',
    label: 'Sin datos',
  }

  return (
    <Link
      to={map2DStationPath(station.station_code)}
      className={`dashboard-station-row ${selected ? 'is-selected' : ''}`}
      aria-current={selected ? 'true' : undefined}
      onClick={event => {
        event.preventDefault()
        onSelect?.(station.station_code)
      }}
      onMouseEnter={() => onHover?.(station.station_code)}
      onMouseLeave={() => onHover?.(null)}
      onFocus={() => onHover?.(station.station_code)}
      onBlur={() => onHover?.(null)}
    >
      <div>
        <span className="dashboard-station-row__name">{station.name}</span>
        <span className="dashboard-station-row__meta">{station.locality}</span>
        <span className="dashboard-station-row__status">
          <i className={`dashboard-status-dot dashboard-status-dot--${style.tone}`} aria-hidden="true" />
          {style.label}
        </span>
      </div>

      <span className="dashboard-station-row__value">
        {station.current_leq_dbfs != null ? station.current_leq_dbfs.toFixed(1) : 'Sin dato'}
        {station.current_leq_dbfs != null && <small>dBFS Leq</small>}
        {station.last_seen_at && <small>Actualizada {format(parseISO(station.last_seen_at), "d MMM HH:mm", { locale: es })}</small>}
        {!station.is_active && <small>Inactiva</small>}
      </span>
    </Link>
  )
}
