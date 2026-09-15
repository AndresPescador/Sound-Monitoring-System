import { defaultT } from '../../i18n/core.mjs'
import { getMetricDescription } from './metricDescriptions'

const definitions = {
  leq_dbfs: ['maps.leq_a_weighted', 'levels', 'dBFS', 1],
  dbfs_level: ['maps.dbfs_level', 'levels', 'dBFS', 1],
  rms_energy: ['maps.rms_energy', 'levels', '', 'significant'],
  ch_left_dbfs: ['common.left_channel_dbfs', 'binaural', 'dBFS', 1],
  ch_right_dbfs: ['common.right_channel_dbfs', 'binaural', 'dBFS', 1],
  ild_db: ['maps.ild_interaural_difference', 'binaural', 'dB', 1],
  interaural_correlation: ['maps.interaural_correlation', 'binaural', '', 3],
  dominant_frequency: ['maps.dominant_frequency', 'spectral', 'Hz', 0],
  spectral_centroid: ['maps.spectral_centroid', 'spectral', 'Hz', 0],
  spectral_rolloff: ['maps.spectral_rolloff', 'spectral', 'Hz', 0],
  zero_crossing_rate: ['maps.zero_crossing_rate', 'spectral', '', 'significant'],
  leq_hour: ['common.hourly_leq', 'hourly', 'dBFS', 1],
  l10: ['common.noise_peaks', 'hourly', 'dBFS', 1],
  l50: ['common.l50_typical', 'hourly', 'dBFS', 1],
  l90: ['common.noise_background', 'hourly', 'dBFS', 1],
  dbfs_min: ['common.min_dbfs', 'hourly', 'dBFS', 1],
  dbfs_max: ['common.max_dbfs', 'hourly', 'dBFS', 1],
  dbfs_avg: ['common.average_dbfs', 'hourly', 'dBFS', 1],
  measurement_count: ['maps.measurements', 'hourly', '', 0],
  avg_spectral_centroid: ['maps.spectral_centroid', 'hourly', 'Hz', 0],
  avg_spectral_rolloff: ['maps.spectral_rolloff', 'hourly', 'Hz', 0],
  avg_zero_crossing_rate: ['maps.zero_crossing_rate', 'hourly', '', 'significant'],
  avg_ild_db: ['common.average_ild', 'hourly', 'dB', 1],
  avg_interaural_corr: ['maps.interaural_correlation', 'hourly', '', 3],
}
export const RAW_METRIC_IDS = Object.keys(definitions).slice(0, 11)
export const hasMetric = id => Object.hasOwn(definitions, id)
export const observedNumber = value => value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value)
export function getMetric(id, t = defaultT) {
  const [label, group, unit, precision] = definitions[id] ?? ['charts.value', 'levels', '', 'significant']
  const domain = ['ild_db', 'avg_ild_db'].includes(id) ? 'symmetric'
    : ['interaural_correlation', 'avg_interaural_corr'].includes(id) ? [-1, 1] : ['auto', 'auto']
  return { id, csvKey: ['spectral_centroid', 'dominant_frequency'].includes(id) ? `${id}_hz` : id, label: t(label).replace(/\s*\(dBFS\)$/, ''), group, unit, precision, domain,
    description: ['ild_db', 'avg_ild_db'].includes(id) ? t('ux.ildHelp')
      : ['interaural_correlation', 'avg_interaural_corr'].includes(id) ? t('ux.corrHelp') : getMetricDescription(id, t) }
}
export function formatMetric(value, id, t = defaultT, withUnit = true) {
  const number = observedNumber(value)
  if (number === null) return '—'
  const { unit, precision } = getMetric(id, t)
  const options = precision === 'significant'
    ? { maximumSignificantDigits: 4 }
    : { minimumFractionDigits: precision, maximumFractionDigits: precision }
  return `${t.number(number, options)}${withUnit && unit ? ` ${unit}` : ''}`
}
export function metricAxis(id, t = defaultT) {
  const { unit, domain } = getMetric(id, t)
  return {
    domain: domain === 'symmetric' ? ([min, max]) => { const bound = Math.max(Math.abs(min), Math.abs(max), 1); return [-bound, bound] } : domain,
    tickFormatter: value => unit === 'Hz' && Math.abs(value) >= 1000
      ? `${t.number(value / 1000, { maximumFractionDigits: 3 })}k` : formatMetric(value, id, t, false),
  }
}
export function joinChannels(left = [], right = []) {
  const rows = new Map()
  for (const [data, key] of [[left, 'ch_left_dbfs'], [right, 'ch_right_dbfs']]) {
    for (const point of data) {
      const timestamp = Date.parse(point.recorded_at)
      if (!Number.isFinite(timestamp)) continue
      const row = rows.get(timestamp) ?? { recorded_at: new Date(timestamp).toISOString(), ch_left_dbfs: null, ch_right_dbfs: null }
      row[key] = observedNumber(point.value)
      rows.set(timestamp, row)
    }
  }
  return [...rows.entries()].sort(([a], [b]) => a - b).map(([, row]) => row)
}
