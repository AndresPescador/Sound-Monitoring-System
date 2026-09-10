import { defaultT } from '../../i18n/core.mjs'
import { useLanguage } from '../../context/LanguageContext'
const MODE_COPY = (t = defaultT) => ({
  data: t('common.the_axis_focuses_on_the_period_with_measurements_internal'),
  range: t('common.the_axis_keeps_the_entire_requested_range_gaps_indicate'),
})

function formatRangeLabel(range, t = defaultT) {
  if (!range?.from || !range?.to) return ''
  try {
    const formatter = new Intl.DateTimeFormat(t.locale, {
      timeZone: 'America/Bogota',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
    return `${formatter.format(new Date(range.from))} – ${formatter.format(new Date(range.to))}`
  } catch {
    return ''
  }
}

export default function ChartAxisModeControl({
  mode = 'range',
  automaticMode = 'range',
  isAutomatic = false,
  onChange,
  range = null,
  compactGaps = false,
}) {
  const { t } = useLanguage()
  const activeMode = isAutomatic ? automaticMode : mode
  const rangeLabel = formatRangeLabel(range, t)
  const baseDescription = isAutomatic
    ? t('common.automatic', { p0: MODE_COPY(t)[automaticMode] })
    : MODE_COPY(t)[mode]
  const description = compactGaps && activeMode === 'data'
    ? t('common.omitted_periods_are_marked_with_a_separator', { p0: baseDescription })
    : baseDescription

  return (
    <div className="dashboard-axis-mode-control">
      <div className="dashboard-axis-mode-control__heading">
        <span className="dashboard-axis-mode-control__label">{t('common.time_axis')}</span>
        {isAutomatic && <span className="dashboard-axis-mode-control__status">{t('common.automatic_2')}</span>}
      </div>
      <div className="dashboard-axis-mode-control__options" role="group" aria-label={t('common.time_axis_mode')}>
        <button
          type="button"
          className={`dashboard-axis-mode-control__option ${activeMode === 'data' ? 'is-active' : ''}`}
          aria-pressed={activeMode === 'data'}
          onClick={() => onChange('data')}
        >{t('common.fit_to_data')}</button>
        <button
          type="button"
          className={`dashboard-axis-mode-control__option ${activeMode === 'range' ? 'is-active' : ''}`}
          aria-pressed={activeMode === 'range'}
          onClick={() => onChange('range')}
        >{t('common.full_range')}</button>
      </div>
      <p className="dashboard-axis-mode-control__description">
        {description}{rangeLabel && ' ' + t('common.requested_range', { p0: rangeLabel })}
      </p>
    </div>
  )
}
