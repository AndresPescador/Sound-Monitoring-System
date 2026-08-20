const numberFormatter = new Intl.NumberFormat('es-CO')

function formatResolution(seconds) {
  if (!seconds) return 'resolución adaptativa'
  if (seconds < 3600) return `ventanas de ${Math.max(1, Math.round(seconds / 60))} min`
  const hours = seconds / 3600
  if (hours < 24) return `ventanas de ${Math.round(hours)} h`
  return `ventanas de ${Math.round(hours / 24)} días`
}

function formatCount(value, singular, plural) {
  const count = Number(value ?? 0)
  return `${numberFormatter.format(count)} ${count === 1 ? singular : plural}`
}

export function formatSeriesMeta(meta) {
  if (!meta) return ''
  if (meta.is_aggregated) {
    return `Vista resumida en ${formatResolution(meta.resolution_seconds)}: ${formatCount(meta.returned_count ?? meta.count, 'ventana', 'ventanas')} representan ${formatCount(meta.total_count ?? meta.returned_count, 'medición', 'mediciones')} del rango completo.`
  }
  return `Rango completo: ${formatCount(meta.returned_count ?? meta.count, 'medición', 'mediciones')}.`
}

export default function ResolutionNotice({ meta, className = '' }) {
  if (!meta || (!meta.is_aggregated && !meta.total_count)) return null

  return (
    <p className={`dashboard-resolution-note ${meta.is_aggregated ? 'dashboard-resolution-note--aggregated' : ''} ${className}`}>
      {formatSeriesMeta(meta)}
    </p>
  )
}
