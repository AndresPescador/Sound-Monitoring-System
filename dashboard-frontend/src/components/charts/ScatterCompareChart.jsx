import {
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import useChartAxisTransition from '../../hooks/useChartAxisTransition'
import { getCompareSeriesStyles } from './compareSeriesColors'

function formatTimestamp(value) {
  try {
    return format(new Date(value), 'dd/MM/yyyy HH:mm:ss', { locale: es })
  } catch {
    return String(value)
  }
}

function createTimeTicks(domain, count = 7) {
  const [start, end] = domain
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return []
  return Array.from({ length: count }, (_, index) => (
    start + ((end - start) * index) / (count - 1)
  ))
}

function buildCompactLayout(points, range) {
  const timestamps = [...new Set(points.map(point => point.originalX))].sort((a, b) => a - b)
  const selectedFrom = Date.parse(range?.from)
  const selectedTo = Date.parse(range?.to)
  const selectedDuration = Number.isFinite(selectedFrom) && Number.isFinite(selectedTo)
    ? selectedTo - selectedFrom
    : Math.max(timestamps.at(-1) - timestamps[0], 60 * 60 * 1000)
  const gapThreshold = Math.max(6 * 60 * 60 * 1000, selectedDuration * 0.02)
  const positionByTimestamp = new Map()
  const timestampByPosition = new Map()
  const gapPositions = new Set()
  let position = 0

  timestamps.forEach((timestamp, index) => {
    if (index > 0 && timestamp - timestamps[index - 1] > gapThreshold) {
      gapPositions.add(position)
      position += 1
    }
    positionByTimestamp.set(timestamp, position)
    timestampByPosition.set(position, timestamp)
    position += 1
  })

  const actualTickPositions = timestamps.length <= 7
    ? timestamps.map(timestamp => positionByTimestamp.get(timestamp))
    : Array.from({ length: 7 }, (_, index) => {
      const timestampIndex = Math.round((index * (timestamps.length - 1)) / 6)
      return positionByTimestamp.get(timestamps[timestampIndex])
    })
  const ticks = [...new Set([...actualTickPositions, ...gapPositions])].sort((a, b) => a - b)

  return {
    data: points.map(point => ({
      ...point,
      x: positionByTimestamp.get(point.originalX),
    })),
    domain: [0, Math.max(position - 1, 1)],
    ticks,
    tickFormatter: value => {
      const rounded = Math.round(Number(value))
      return gapPositions.has(rounded) ? '…' : formatTimestamp(timestampByPosition.get(rounded))
    },
  }
}

function ScatterTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const point = payload[0]?.payload
  if (!point) return null

  return (
    <div className="dashboard-chart-tooltip">
      <p>{formatTimestamp(point.originalX)}</p>
      <strong>{point.stationName}</strong>
      <span>{point.valueLabel}: {Number(point.y).toFixed(2)}</span>
    </div>
  )
}

export default function ScatterCompareChart({
  series = [],
  metricLabel = 'Valor',
  axisMode = 'range',
  range = null,
}) {
  const { renderedAxisMode, phase } = useChartAxisTransition(axisMode)
  const seriesStyles = getCompareSeriesStyles(series.map(station => station.station_code ?? station.locality))
  const pointSeries = series
    .map(station => ({
      ...station,
      data: (station.rawData ?? [])
        .filter(point => point.recorded_at && point.value != null && Number.isFinite(Number(point.value)))
        .map(point => ({
          x: Date.parse(point.recorded_at),
          originalX: Date.parse(point.recorded_at),
          y: Number(point.value),
          station_code: station.station_code,
          stationName: station.displayName ?? station.locality ?? station.station_code,
          valueLabel: metricLabel,
        }))
        .filter(point => Number.isFinite(point.x)),
      style: seriesStyles.get(String(station.station_code ?? station.locality ?? '')),
    }))
    .filter(station => station.data.length > 0)

  const points = pointSeries.flatMap(station => station.data)
  if (!points.length) return <p className="text-center text-sm text-text-muted py-8">No hay puntos exactos para este rango.</p>

  const observedMin = Math.min(...points.map(point => point.x))
  const observedMax = Math.max(...points.map(point => point.x))
  const observedSpan = Math.max(observedMax - observedMin, 60 * 1000)
  const padding = Math.max(observedSpan * 0.04, 30 * 1000)
  const selectedFrom = Date.parse(range?.from)
  const selectedTo = Date.parse(range?.to)
  const hasSelectedRange = Number.isFinite(selectedFrom) && Number.isFinite(selectedTo) && selectedTo > selectedFrom
  const compactLayout = renderedAxisMode === 'data' ? buildCompactLayout(points, range) : null
  const chartPoints = compactLayout?.data ?? points.map(point => ({ ...point, x: point.originalX }))
  const domain = renderedAxisMode === 'range' && hasSelectedRange
    ? [selectedFrom, selectedTo]
    : compactLayout?.domain ?? [observedMin - padding, observedMax + padding]
  const ticks = compactLayout?.ticks ?? createTimeTicks(domain)
  const tickFormatter = compactLayout?.tickFormatter ?? formatTimestamp

  return (
    <div className={`dashboard-chart-transition dashboard-chart-transition--${phase}`}>
      <ResponsiveContainer width="100%" height={300}>
        <ScatterChart key={`${renderedAxisMode}-${chartPoints.length}`} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis
          type="number"
          dataKey="x"
          domain={domain}
          ticks={ticks}
          tickFormatter={tickFormatter}
          tickLine={false}
          tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }}
          height={42}
        />
        <YAxis
          type="number"
          dataKey="y"
          domain={['auto', 'auto']}
          tick={{ fontSize: 11, fontFamily: 'JetBrains Mono' }}
        />
        <Tooltip
          cursor={{ strokeDasharray: '3 3' }}
          content={<ScatterTooltip />}
        />
        <Legend wrapperStyle={{ fontFamily: 'DM Sans', fontSize: 12 }} />
        {pointSeries.map(station => (
          <Scatter
            key={station.station_code}
            name={station.displayName ?? station.locality ?? station.station_code}
            data={chartPoints.filter(point => point.station_code === station.station_code)}
            fill={station.style.color}
            fillOpacity={0.68}
            shape={station.style.markerShape}
            line={false}
            isAnimationActive={false}
          />
        ))}
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  )
}
