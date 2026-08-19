import { useState } from 'react'
import { subHours, subDays, format } from 'date-fns'

const PRESETS = [
  { label: '6h',   hours: 6 },
  { label: '24h',  hours: 24 },
  { label: '7d',   hours: 168 },
  { label: '30d',  hours: 720 },
]

/**
 * DateRangePicker
 * Devuelve { from, to } como strings ISO al callback onChange.
 * El preset activo se resalta; "Personalizado" habilita inputs nativos.
 */
export default function DateRangePicker({ onChange, className = '' }) {
  const [active, setActive]   = useState('24h')
  const [custom, setCustom]   = useState(false)
  const [fromVal, setFromVal] = useState('')
  const [toVal, setToVal]     = useState('')
  const [error, setError]     = useState('')

  const applyPreset = (preset) => {
    setActive(preset.label)
    setCustom(false)
    setError('')
    const to   = new Date()
    const from = subHours(to, preset.hours)
    onChange({ from: from.toISOString(), to: to.toISOString() })
  }

  const applyCustom = () => {
    if (!fromVal || !toVal) {
      setError('Seleccione el inicio y el final del rango.')
      return
    }
    const from = new Date(fromVal)
    const to = new Date(toVal)
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      setError('El rango contiene una fecha no válida.')
      return
    }
    if (from > to) {
      setError('El inicio no puede ser posterior al final.')
      return
    }
    setError('')
    onChange({ from: from.toISOString(), to: to.toISOString() })
  }

  return (
    <div className={`dashboard-range-picker ${className}`}>
      {PRESETS.map(p => (
        <button
          key={p.label}
          type="button"
          onClick={() => applyPreset(p)}
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
        onClick={() => { setCustom(true); setActive(''); setError('') }}
        className={`dashboard-range-picker__button ${
          custom
            ? 'dashboard-range-picker__button--active'
            : ''
        }`}
      >
        Personalizado
      </button>

      {custom && (
        <div className="dashboard-range-picker__custom">
          <input
            type="datetime-local"
            value={fromVal}
            onChange={e => setFromVal(e.target.value)}
            className="dashboard-input"
            aria-label="Fecha y hora inicial"
            aria-invalid={Boolean(error)}
          />
          <span className="text-text-muted text-sm">a</span>
          <input
            type="datetime-local"
            value={toVal}
            onChange={e => setToVal(e.target.value)}
            className="dashboard-input"
            aria-label="Fecha y hora final"
            min={fromVal || undefined}
            aria-invalid={Boolean(error)}
          />
          <button
            type="button"
            onClick={applyCustom}
            className="dashboard-button dashboard-button--primary"
          >
            Aplicar
          </button>
          {error && <p className="dashboard-range-picker__error" role="alert">{error}</p>}
        </div>
      )}
    </div>
  )
}
