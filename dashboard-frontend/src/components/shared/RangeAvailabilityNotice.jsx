import { formatDateTime, formatRangeLabel } from './dateRangeUtils'

export function HistoricalRangeNotice({ range, latestTimestamp, onReturnToCurrent }) {
  return (
    <div className="dashboard-range-notice dashboard-range-notice--historical" role="status" aria-live="polite">
      <div>
        <strong>No hay mediciones recientes.</strong>
        <p>
          Mostrando el último período disponible: {formatRangeLabel(range)}.
          {latestTimestamp && ` Última medición: ${formatDateTime(latestTimestamp)}.`}
        </p>
      </div>
      <button type="button" className="dashboard-text-button" onClick={onReturnToCurrent}>
        Volver al período actual
      </button>
    </div>
  )
}

export function NoMeasurementsNotice({ children = 'No hay mediciones disponibles para este período.' }) {
  return (
    <div className="dashboard-range-notice dashboard-range-notice--empty" role="status">
      <strong>No hay datos para mostrar.</strong>
      <p>{children}</p>
    </div>
  )
}
