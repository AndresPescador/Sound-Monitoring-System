import { useEffect, useRef, useState } from 'react'
import { defaultT } from '../../i18n/core.mjs'
import { useLanguage } from '../../context/LanguageContext'
import { useMap3DContext } from '../../context/Map3DContext'

const PANEL_LABELS = (t = defaultT) => ({
  station: { title: t('maps.station_analysis'), description: t('maps.explore_one_metric_at_a_time_while_keeping_the') },
  compare: { title: t('maps.compare_stations'), description: t('ux.byStation') },
  data: { title: t('maps.open_data'), description: t('maps.browse_and_download_available_measurements') },
})

export default function Map3DAnalysisPanel({ mode, open, onClose, children, mobile = false }) {
  const { t } = useLanguage()
  const { selectedStation, selectedStationCode } = useMap3DContext()
  const [expanded, setExpanded] = useState(false)
  const panel = useRef(null)
  useEffect(() => { if (open) panel.current?.focus({ preventScroll: true }) }, [open])
  if (!open) return null

  const labels = PANEL_LABELS(t)[mode] ?? PANEL_LABELS(t).station
  const title = mode === 'station' && selectedStation ? selectedStation.name : labels.title
  const context = mode === 'station'
    ? `${selectedStation?.locality ?? t('admin.station_2')} · ${selectedStationCode ?? t('common.selected')}`
    : labels.description

  return (
    <aside ref={panel} tabIndex={-1} className={`map3d-analysis-panel map3d-analysis-panel--${mode} ${expanded ? 'is-expanded' : ''}`} aria-label={labels.title} role={mobile ? 'dialog' : 'region'} aria-modal={mobile || undefined} onKeyDown={event => {
      if (event.key === 'Escape') { event.stopPropagation(); onClose() }
      if (event.key === 'Tab' && mobile) {
        const elements = [...panel.current.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), summary, [tabindex="0"]')].filter(el => el.getClientRects().length)
        const first = elements[0], last = elements.at(-1)
        if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }
    }}>
      <header className="map3d-analysis-panel__header">
        <div>
          <span className="map3d-code">{labels.title}</span>
          <h2>{title}</h2>
          <p>{context}</p>
        </div>
        <button type="button" className="ux-expand-analysis" aria-pressed={expanded} onClick={() => setExpanded(value => !value)}>{t(expanded ? 'ux.collapse' : 'ux.expand')}</button>
        <button type="button" className="map3d-analysis-panel__close" onClick={onClose} aria-label={t('maps.close_analysis_panel')}>{t('ux.backMap')}</button>
      </header>
      <div className="map3d-analysis-panel__body">
        <div className="map3d-analysis-panel__scroll">{children}</div>
      </div>
    </aside>
  )
}
