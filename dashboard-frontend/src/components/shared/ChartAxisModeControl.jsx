const MODE_COPY = {
  data: 'El eje se concentra en el periodo con mediciones. Los huecos internos se conservan.',
  range: 'El eje conserva todo el rango consultado. Los espacios representan ausencia de mediciones.',
}

function formatRangeLabel(range) {
  if (!range?.from || !range?.to) return ''
  try {
    const formatter = new Intl.DateTimeFormat('es-CO', {
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
  const activeMode = isAutomatic ? automaticMode : mode
  const rangeLabel = formatRangeLabel(range)
  const baseDescription = isAutomatic
    ? `Automático. ${MODE_COPY[automaticMode]}`
    : MODE_COPY[mode]
  const description = compactGaps && activeMode === 'data'
    ? `${baseDescription} Los periodos omitidos se marcan con un separador.`
    : baseDescription

  return (
    <div className="dashboard-axis-mode-control">
      <div className="dashboard-axis-mode-control__heading">
        <span className="dashboard-axis-mode-control__label">Eje temporal</span>
        {isAutomatic && <span className="dashboard-axis-mode-control__status">Automático</span>}
      </div>
      <div className="dashboard-axis-mode-control__options" role="group" aria-label="Modo del eje temporal">
        <button
          type="button"
          className={`dashboard-axis-mode-control__option ${activeMode === 'data' ? 'is-active' : ''}`}
          aria-pressed={activeMode === 'data'}
          onClick={() => onChange('data')}
        >
          Ajustar a datos
        </button>
        <button
          type="button"
          className={`dashboard-axis-mode-control__option ${activeMode === 'range' ? 'is-active' : ''}`}
          aria-pressed={activeMode === 'range'}
          onClick={() => onChange('range')}
        >
          Rango completo
        </button>
      </div>
      <p className="dashboard-axis-mode-control__description">
        {description}{rangeLabel && ` Rango consultado: ${rangeLabel}.`}
      </p>
    </div>
  )
}
