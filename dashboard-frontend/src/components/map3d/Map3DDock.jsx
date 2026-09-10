import { defaultT } from '../../i18n/core.mjs'
import { useLanguage } from '../../context/LanguageContext'
import { useLocation } from 'react-router-dom'
import { useMap3DContext } from '../../context/Map3DContext'

const DOCK_LABELS = (t = defaultT) => ({
  overview: { eyebrow: t('maps.bogota_network'), title: t('maps.city_status') },
  station: { eyebrow: t('maps.selected_station'), title: t('maps.acoustic_analysis') },
  compare: { eyebrow: t('maps.comparative_analysis'), title: t('maps.compare_stations') },
  data: { eyebrow: t('maps.open_data'), title: t('maps.browse_and_download') },
})

export default function Map3DDock({ mode, size, visible, onSizeChange, onClose, selectedStationCode, children }) {
  const { t } = useLanguage()
  const location = useLocation()
  const { stations, selectedStation, selectedSummary, updatedAt, loadingStations } = useMap3DContext()
  const labels = DOCK_LABELS(t)[mode] ?? DOCK_LABELS(t).overview

  const compactSummary = mode === 'overview'
    ? t('maps.active', { p0: stations.filter(station => station.is_active).length, p1: stations.length })
    : selectedStation?.name ?? selectedStationCode ?? t('maps.no_selection')

  return (
    <section
      className={`map3d-dock map3d-dock--${size} ${visible ? 'is-visible' : 'is-hidden'}`}
      aria-label={t('maps.3d_experience_analysis_dock')}
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
              {loadingStations ? t('maps.updating_network') : compactSummary}
              {updatedAt && mode === 'overview' ? ' ' + t('maps.updated', { p0: updatedAt.toLocaleTimeString(t.locale, { hour: '2-digit', minute: '2-digit' }) }) : ''}
            </p>
          </div>

          <div className="map3d-dock__controls" aria-label={t('maps.dock_size')}>
            <button type="button" className={size === 'compact' ? 'is-active' : ''} aria-pressed={size === 'compact'} onClick={() => onSizeChange('compact')}>{t('maps.minimum')}</button>
            <button type="button" className={size === 'medium' ? 'is-active' : ''} aria-pressed={size === 'medium'} onClick={() => onSizeChange('medium')}>{t('maps.medium')}</button>
            <button type="button" className={size === 'expanded' ? 'is-active' : ''} aria-pressed={size === 'expanded'} onClick={() => onSizeChange('expanded')}>{t('maps.expand')}</button>
            <button type="button" className="map3d-dock__close" onClick={onClose}>{mode === 'overview' ? t('maps.hide') : t('admin.back')}</button>
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
