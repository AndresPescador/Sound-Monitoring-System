import { message as localizedMessage } from '../../i18n/core.mjs'
import { useLanguage } from '../../context/LanguageContext'
import { formatDateTime, formatRangeLabel } from './dateRangeUtils'

export function HistoricalRangeNotice({ range, latestTimestamp, onReturnToCurrent }) {
  const { t } = useLanguage()
  return (
    <div className="dashboard-range-notice dashboard-range-notice--historical" role="status" aria-live="polite">
      <div>
        <strong>{t('common.no_recent_measurements')}</strong>
        <p>{t('common.showing_the_latest_available_period') + ' '}{formatRangeLabel(range, t)}.
          {latestTimestamp && ' ' + t('common.latest_measurement', { p0: formatDateTime(latestTimestamp, t) })}
        </p>
      </div>
      <button type="button" className="dashboard-text-button" onClick={onReturnToCurrent}>{t('common.back_to_current_period')}</button>
    </div>
  )
}

export function NoMeasurementsNotice({ children = localizedMessage('common.no_measurements_available_for_this_period') }) {
  const { t } = useLanguage()
  return (
    <div className="dashboard-range-notice dashboard-range-notice--empty" role="status">
      <strong>{t('common.no_data_to_display')}</strong>
      <p>{t(children)}</p>
    </div>
  )
}
