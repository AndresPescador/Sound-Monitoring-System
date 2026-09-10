import { defaultT } from '../../i18n/core.mjs'
import { useLanguage } from '../../context/LanguageContext'
function formatResolution(seconds, t = defaultT) {
  if (!seconds) return t('common.adaptive_resolution')
  if (seconds < 3600) return t('common.min_windows', { p0: Math.max(1, Math.round(seconds / 60)) })
  const hours = seconds / 3600
  if (hours < 24) return t('common.h_windows', { p0: Math.round(hours) })
  return t('common.day_windows', { p0: Math.round(hours / 24) })
}

function formatCount(value, kind, t = defaultT) {
  const count = Number(value ?? 0)
  return t(`common.${kind}_count`, { count, value: t.number(count) })
}

export function formatSeriesMeta(meta, t = defaultT) {
  if (!meta) return ''
  if (meta.is_aggregated) {
    return t('common.summary_view_in_represent_from_the_full_range', { p0: formatResolution(meta.resolution_seconds, t), p1: formatCount(meta.returned_count ?? meta.count, 'window', t), p2: formatCount(meta.total_count ?? meta.returned_count, 'measurement', t) })
  }
  return t('common.full_range_2', { p0: formatCount(meta.returned_count ?? meta.count, 'measurement', t) })
}

export default function ResolutionNotice({ meta, className = '' }) {
  const { t } = useLanguage()
  if (!meta || (!meta.is_aggregated && !meta.total_count)) return null

  return (
    <p className={`dashboard-resolution-note ${meta.is_aggregated ? 'dashboard-resolution-note--aggregated' : ''} ${className}`}>
      {formatSeriesMeta(meta, t)}
    </p>
  )
}
