import { useNavigate } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

const NOISE_STYLES = {
  low:    { dot: 'bg-noise-low',    badge: 'bg-green-50  text-noise-low',    label: 'Bajo'    },
  medium: { dot: 'bg-noise-medium', badge: 'bg-yellow-50 text-noise-medium', label: 'Moderado' },
  high:   { dot: 'bg-noise-high',   badge: 'bg-red-50    text-noise-high',   label: 'Alto'    },
}

export default function StationCard({ station }) {
  const navigate = useNavigate()
  const style    = NOISE_STYLES[station.noise_level] ?? { dot: 'bg-text-light', badge: 'bg-surface text-text-muted', label: 'Sin datos' }

  return (
    <div
      onClick={() => navigate(`/stations/${station.station_code}`)}
      className="bg-bg border border-border rounded-lg p-4 cursor-pointer
                 hover:border-primary hover:shadow-sm transition-all"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <p className="font-display font-semibold text-sm text-text">{station.name}</p>
          <p className="text-xs text-text-muted">{station.locality}</p>
        </div>
        <span className={`px-2 py-0.5 rounded-full text-xs font-display font-medium flex items-center gap-1 ${style.badge}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
          {style.label}
        </span>
      </div>

      {station.current_leq_dbfs != null && (
        <p className="text-xl font-display font-bold text-text">
          {station.current_leq_dbfs.toFixed(1)}
          <span className="text-xs font-normal text-text-muted ml-1">dBFS (Leq)</span>
        </p>
      )}

      {station.last_seen_at && (
        <p className="text-xs text-text-light font-mono mt-1">
          Última medición:{' '}
          {format(parseISO(station.last_seen_at), "d MMM HH:mm", { locale: es })}
        </p>
      )}

      {!station.is_active && (
        <span className="mt-2 inline-block text-xs bg-red-50 text-noise-high px-2 py-0.5 rounded font-display">
          Inactiva
        </span>
      )}
    </div>
  )
}
