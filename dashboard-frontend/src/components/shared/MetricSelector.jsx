import { defaultT } from '../../i18n/core.mjs'
import { useLanguage } from '../../context/LanguageContext'
const METRICS = (t = defaultT) => ([
  { value: 'leq_dbfs',              label: t('maps.leq_a_weighted') },
  { value: 'dbfs_level',            label: t('maps.dbfs_level') },
  { value: 'rms_energy',            label: t('maps.rms_energy') },
  { value: 'ild_db',                label: t('maps.ild_interaural_difference') },
  { value: 'interaural_correlation',label: t('maps.interaural_correlation') },
  { value: 'dominant_frequency',    label: t('common.dominant_frequency_hz') },
  { value: 'spectral_centroid',     label: t('common.spectral_centroid_hz') },
  { value: 'spectral_rolloff',      label: t('common.spectral_rolloff_hz') },
  { value: 'zero_crossing_rate',    label: t('maps.zero_crossing_rate') },
  { value: 'ch_left_dbfs',          label: t('common.left_channel_dbfs') },
  { value: 'ch_right_dbfs',         label: t('common.right_channel_dbfs') },
])

export default function MetricSelector({ value, onChange, className = '', id }) {
  const { t } = useLanguage()
  return (
    <select
      id={id}
      value={value}
      onChange={e => onChange(e.target.value)}
      className={className || 'dashboard-select'}
    >
      {METRICS(t).map(m => (
        <option key={m.value} value={m.value}>{m.label}</option>
      ))}
    </select>
  )
}
