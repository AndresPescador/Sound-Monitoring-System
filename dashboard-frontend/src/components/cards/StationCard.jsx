import { defaultT } from '../../i18n/core.mjs'
import { useLanguage } from '../../context/LanguageContext'
import { Link } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { map2DStationPath } from '../../routes'

const NOISE_STYLES = (t = defaultT) => ({
  low:      { tone: 'low',    label: t('common.low')     },
  moderate: { tone: 'medium', label: t('common.moderate') },
  high:     { tone: 'high',   label: t('common.high')     },
})

export default function StationCard({ station, selected = false, onHover, onSelect }) {
  const { t } = useLanguage()
  const style = NOISE_STYLES(t)[station.noise_level] ?? {
    tone:  'unknown',
    label: t('common.no_data'),
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
        {station.current_leq_dbfs != null ? t.fixed(station.current_leq_dbfs, 1) : t('common.no_reading')}
        {station.current_leq_dbfs != null && <small>dBFS Leq</small>}
        {station.last_seen_at && <small>{t('common.updated') + ' '}{format(parseISO(station.last_seen_at), "d MMM HH:mm", { locale: t.dateLocale })}</small>}
        {!station.is_active && <small>{t('common.inactive')}</small>}
      </span>
    </Link>
  )
}
