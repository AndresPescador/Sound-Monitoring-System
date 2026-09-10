import { defaultT } from '../../i18n/core.mjs'
import { useLanguage } from '../../context/LanguageContext'
import { useMap3DContext } from '../../context/Map3DContext'

const PANEL_LABELS = (t = defaultT) => ({
  station: { title: t('maps.station_analysis'), description: t('maps.explore_one_metric_at_a_time_while_keeping_the') },
  data: { title: t('maps.open_data'), description: t('maps.browse_and_download_available_measurements') },
})

export default function Map3DAnalysisPanel({ mode, open, onClose, children }) {
  const { t } = useLanguage()
  const { selectedStation, selectedStationCode } = useMap3DContext()
  if (!open) return null

  const labels = PANEL_LABELS(t)[mode] ?? PANEL_LABELS(t).station
  const title = mode === 'station' && selectedStation ? selectedStation.name : labels.title
  const context = mode === 'station'
    ? `${selectedStation?.locality ?? t('admin.station_2')} · ${selectedStationCode ?? t('common.selected')}`
    : labels.description

  return (
    <aside className={`map3d-analysis-panel map3d-analysis-panel--${mode}`} aria-label={labels.title} role="region">
      <header className="map3d-analysis-panel__header">
        <div>
          <span className="map3d-code">{mode === 'station' ? 'DETALLE' : mode.toUpperCase()}</span>
          <h2>{title}</h2>
          <p>{context}</p>
        </div>
        <button type="button" className="map3d-analysis-panel__close" onClick={onClose} aria-label={t('maps.close_analysis_panel')}>{t('admin.close')}</button>
      </header>
      <div className="map3d-analysis-panel__body">
        <div className="map3d-analysis-panel__scroll">{children}</div>
      </div>
    </aside>
  )
}
