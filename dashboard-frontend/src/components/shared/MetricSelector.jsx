const METRICS = [
  { value: 'leq_dbfs',              label: 'Leq (ponderación A)' },
  { value: 'dbfs_level',            label: 'Nivel dBFS' },
  { value: 'rms_energy',            label: 'Energía RMS' },
  { value: 'ild_db',                label: 'ILD (diferencia interaural)' },
  { value: 'interaural_correlation',label: 'Correlación interaural' },
  { value: 'dominant_frequency',    label: 'Frecuencia dominante (Hz)' },
  { value: 'spectral_centroid',     label: 'Centroide espectral (Hz)' },
  { value: 'spectral_rolloff',      label: 'Rolloff espectral (Hz)' },
  { value: 'zero_crossing_rate',    label: 'Tasa de cruces por cero' },
  { value: 'ch_left_dbfs',          label: 'Canal izquierdo (dBFS)' },
  { value: 'ch_right_dbfs',         label: 'Canal derecho (dBFS)' },
]

export default function MetricSelector({ value, onChange, className = '' }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className={`border border-border rounded px-3 py-1.5 text-sm font-sans text-text bg-bg
                  focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent ${className}`}
    >
      {METRICS.map(m => (
        <option key={m.value} value={m.value}>{m.label}</option>
      ))}
    </select>
  )
}
