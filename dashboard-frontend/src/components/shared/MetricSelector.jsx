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

export default function MetricSelector({ value, onChange, className = '', id }) {
  return (
    <select
      id={id}
      value={value}
      onChange={e => onChange(e.target.value)}
      className={className || 'dashboard-select'}
    >
      {METRICS.map(m => (
        <option key={m.value} value={m.value}>{m.label}</option>
      ))}
    </select>
  )
}
