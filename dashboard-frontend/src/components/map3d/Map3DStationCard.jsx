import { useLanguage } from '../../context/LanguageContext'
import { useMemo } from 'react'
import { useMap3DContext } from '../../context/Map3DContext'

function formatValue(value, digits = 1, t) {
  return Number.isFinite(Number(value)) ? t.fixed(Number(value), digits) : '—'
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
  const { t } = useLanguage()
  const { selectedStation, selectedStationCode, selectedSummary, summaryError } = useMap3DContext()
  const station = selectedStation ?? selectedSummary
  const isActive = selectedSummary?.is_active ?? selectedStation?.is_active
  const placement = useMemo(() => getCardPlacement(position), [position])

  if (!station && !selectedStationCode) return null

  const name = station?.name ?? selectedStationCode ?? t('maps.selected_station')
  const locality = station?.locality ?? t('maps.loading_locality')
  const latest = selectedSummary?.latest_leq_dbfs ?? station?.current_leq_dbfs

  return (
    <article
      className={`map3d-station-card ${position ? `is-anchored is-${placement.side}` : 'is-positioning'}`}
      style={placement.style}
      aria-label={t('maps.summary_of', { p0: name })}
    >
      <span className="map3d-station-card__pointer" aria-hidden="true" />
      <header className="map3d-station-card__header">
        <div className="map3d-station-card__identity">
          <span className="map3d-code">{selectedStationCode}</span>
          <h2>{name}</h2>
          <p>{locality}</p>
        </div>
        <div className={`map3d-status ${isActive ? 'is-active' : 'is-inactive'}`}>
          {isActive == null ? t('maps.no_status') : isActive ? t('maps.active_2') : t('common.inactive')}
        </div>
      </header>

      <div className="map3d-station-card__metrics">
        <div>
          <span>{t('maps.current_leq')}</span>
          <strong>{formatValue(latest, undefined, t)} <small>dBFS</small></strong>
        </div>
        <div>
          <span>{t('maps.last_hour')}</span>
          <strong>{formatValue(selectedSummary?.last_hour_leq, undefined, t)} <small>dBFS</small></strong>
        </div>
        <div>
          <span>{t('maps.measurements')}</span>
          <strong>{selectedSummary?.total_measurements?.toLocaleString(t.locale) ?? '—'}</strong>
        </div>
      </div>

      {summaryError && <p className="map3d-station-card__error">{summaryError}</p>}

      <footer className="map3d-station-card__actions">
        <button type="button" className="map3d-primary-button" onClick={onOpenAnalysis}>{t('maps.open_detailed_analysis_in_2d')}</button>
        <button type="button" className="map3d-card-link" onClick={onHideCard}>{t('maps.hide_card')}</button>
      </footer>
    </article>
  )
}
