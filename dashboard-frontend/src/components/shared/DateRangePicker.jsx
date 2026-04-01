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

  const applyPreset = (preset) => {
    setActive(preset.label)
    setCustom(false)
    const to   = new Date()
    const from = subHours(to, preset.hours)
    onChange({ from: from.toISOString(), to: to.toISOString() })
  }

  const applyCustom = () => {
    if (!fromVal || !toVal) return
    onChange({ from: new Date(fromVal).toISOString(), to: new Date(toVal).toISOString() })
  }

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {PRESETS.map(p => (
        <button
          key={p.label}
          onClick={() => applyPreset(p)}
          className={`px-3 py-1 rounded text-sm font-display font-medium transition-colors border ${
            active === p.label && !custom
              ? 'bg-primary text-white border-primary'
              : 'bg-bg text-text-muted border-border hover:border-primary hover:text-primary'
          }`}
        >
          {p.label}
        </button>
      ))}

      <button
        onClick={() => { setCustom(true); setActive('') }}
        className={`px-3 py-1 rounded text-sm font-display font-medium transition-colors border ${
          custom
            ? 'bg-primary text-white border-primary'
            : 'bg-bg text-text-muted border-border hover:border-primary hover:text-primary'
        }`}
      >
        Personalizado
      </button>

      {custom && (
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="datetime-local"
            value={fromVal}
            onChange={e => setFromVal(e.target.value)}
            className="border border-border rounded px-2 py-1 text-sm font-mono text-text bg-bg"
          />
          <span className="text-text-muted text-sm">—</span>
          <input
            type="datetime-local"
            value={toVal}
            onChange={e => setToVal(e.target.value)}
            className="border border-border rounded px-2 py-1 text-sm font-mono text-text bg-bg"
          />
          <button
            onClick={applyCustom}
            className="px-3 py-1 rounded text-sm font-display bg-primary text-white hover:bg-primary-dark transition-colors"
          >
            Aplicar
          </button>
        </div>
      )}
    </div>
  )
}
