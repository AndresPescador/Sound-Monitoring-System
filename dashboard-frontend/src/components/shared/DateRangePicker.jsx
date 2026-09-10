import { message as localizedMessage } from '../../i18n/core.mjs'
import { useLanguage } from '../../context/LanguageContext'
import { useEffect, useState } from 'react'
import { buildPresetRange, toDatetimeLocalValue } from './dateRangeUtils'

const PRESETS = [
  { label: '6h',   hours: 6 },
  { label: '24h',  hours: 24 },
  { label: '7d',   hours: 168 },
  { label: '30d',  hours: 720 },
]
const MAX_PUBLIC_RANGE_MS = 31 * 24 * 60 * 60 * 1000

/**
 * DateRangePicker
 * Devuelve { from, to } como strings ISO al callback onChange.
 * El preset activo se resalta; "Personalizado" habilita inputs nativos.
 */
export default function DateRangePicker({
  onChange,
  value,
  preset = '24h',
  anchorTimestamp = null,
  isHistoricalRange = false,
  className = '',
}) {
  const { t } = useLanguage()
  const [active, setActive]   = useState(preset)
  const [custom, setCustom]   = useState(false)
  const [fromVal, setFromVal] = useState('')
  const [toVal, setToVal]     = useState('')
  const [error, setError]     = useState('')

  useEffect(() => {
    if (!custom) setActive(preset)
  }, [custom, preset])

  useEffect(() => {
    if (!custom && value) {
      setFromVal(toDatetimeLocalValue(value.from))
      setToVal(toDatetimeLocalValue(value.to))
    }
  }, [custom, value])

  const applyPreset = (preset) => {
    setActive(preset.label)
    setCustom(false)
    setError('')
    const range = buildPresetRange(preset.hours, isHistoricalRange ? anchorTimestamp : new Date())
    onChange(range, { type: 'preset', label: preset.label, hours: preset.hours })
  }

  const applyCustom = () => {
    if (!fromVal || !toVal) {
      setError(localizedMessage('common.select_the_start_and_end_of_the_range'))
      return
    }
    const from = new Date(fromVal)
    const to = new Date(toVal)
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      setError(localizedMessage('common.the_range_contains_an_invalid_date'))
      return
    }
    if (from > to) {
      setError(localizedMessage('common.the_start_cannot_be_after_the_end'))
      return
    }
    if (to.getTime() - from.getTime() > MAX_PUBLIC_RANGE_MS) {
      setError(localizedMessage('common.the_maximum_public_query_range_is_31_days'))
      return
    }
    setError('')
    onChange({ from: from.toISOString(), to: to.toISOString() }, { type: 'custom' })
  }

  return (
    <div className={`dashboard-range-picker ${className}`} role="group" aria-label={t('common.time_range')}>
      {PRESETS.map(p => (
        <button
          key={p.label}
          type="button"
          onClick={() => applyPreset(p)}
          aria-pressed={active === p.label && !custom}
          className={`dashboard-range-picker__button ${
            active === p.label && !custom
              ? 'dashboard-range-picker__button--active'
              : ''
          }`}
        >
          {p.label}
        </button>
      ))}

      <button
        type="button"
        onClick={() => {
          setCustom(true)
          setActive('')
          setError('')
          setFromVal(toDatetimeLocalValue(value?.from))
          setToVal(toDatetimeLocalValue(value?.to))
        }}
        aria-pressed={custom}
        className={`dashboard-range-picker__button ${
          custom
            ? 'dashboard-range-picker__button--active'
            : ''
        }`}
      >{t('common.custom')}</button>

      {custom && (
        <div className="dashboard-range-picker__custom">
          <input
            type="datetime-local"
            value={fromVal}
            onChange={e => setFromVal(e.target.value)}
            className="dashboard-input"
            aria-label={t('common.start_date_and_time')}
            aria-invalid={Boolean(error)}
          />
          <span className="text-text-muted text-sm">{t('common.to')}</span>
          <input
            type="datetime-local"
            value={toVal}
            onChange={e => setToVal(e.target.value)}
            className="dashboard-input"
            aria-label={t('common.end_date_and_time')}
            min={fromVal || undefined}
            aria-invalid={Boolean(error)}
          />
          <button
            type="button"
            onClick={applyCustom}
            className="dashboard-button dashboard-button--primary"
          >{t('common.apply')}</button>
          {error && <p className="dashboard-range-picker__error" role="alert">{t(error)}</p>}
        </div>
      )}
    </div>
  )
}
