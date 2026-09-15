import { useState } from 'react'
import { usePlotWidth, tickBudget, PointReading } from './MetricPlot'
import { bogotaTime } from '../shared/dateRangeUtils'
import { getMetric, metricAxis, formatMetric } from '../shared/metricCatalog'
import { defaultT, message as localizedMessage } from '../../i18n/core.mjs'
import { useLanguage } from '../../context/LanguageContext'
import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import useChartAxisTransition from '../../hooks/useChartAxisTransition'
import { getCompareSeriesStyles } from './compareSeriesColors'

function formatTimestamp(value, t = defaultT) {
  try {
    return bogotaTime(value, t, { seconds: true })
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

function buildCompactLayout(points, range, t = defaultT) {
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
      return gapPositions.has(rounded) ? '…' : formatTimestamp(timestampByPosition.get(rounded), t)
    },
  }
}

function ScatterTooltip({ active, payload, metric }) {
  const { t } = useLanguage()
  if (!active || !payload?.length) return null
  const point = payload[0]?.payload
  if (!point) return null

  return (
    <div className="dashboard-chart-tooltip">
      <p>{formatTimestamp(point.originalX, t)}</p>
      <strong>{point.stationName}</strong>
      <span>{point.valueLabel}: {formatMetric(point.y, metric, t)}</span>
    </div>
  )
}

export default function ScatterCompareChart({
  series = [],
  metric = 'leq_dbfs',
  metricLabel: metricLabelMessage = localizedMessage('charts.value'),
  axisMode = 'range',
  range = null,
}) {
  const { t } = useLanguage()
  const metricLabel = typeof metricLabelMessage === 'string' ? metricLabelMessage : t(metricLabelMessage)
  const [ref, width] = usePlotWidth()
  const [hidden, setHidden] = useState(new Set())
  const [pointIndex, setPointIndex] = useState(0)
  const { renderedAxisMode, phase } = useChartAxisTransition(axisMode)
  const seriesStyles = getCompareSeriesStyles(series.map(station => station.station_code ?? station.locality))
  const pointSeries = series.filter(s => !hidden.has(s.station_code))
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


  const observedMin = Math.min(...points.map(point => point.x))
  const observedMax = Math.max(...points.map(point => point.x))
  const observedSpan = Math.max(observedMax - observedMin, 60 * 1000)
  const padding = Math.max(observedSpan * 0.04, 30 * 1000)
  const selectedFrom = Date.parse(range?.from)
  const selectedTo = Date.parse(range?.to)
  const hasSelectedRange = Number.isFinite(selectedFrom) && Number.isFinite(selectedTo) && selectedTo > selectedFrom
  const compactLayout = renderedAxisMode === 'data' ? buildCompactLayout(points, range, t) : null
  const chartPoints = compactLayout?.data ?? points.map(point => ({ ...point, x: point.originalX }))
  const domain = renderedAxisMode === 'range' && hasSelectedRange
    ? [selectedFrom, selectedTo]
    : compactLayout?.domain ?? [observedMin - padding, observedMax + padding]
  const allTicks = compactLayout?.ticks ?? createTimeTicks(domain, tickBudget(width, true))
  const budget = tickBudget(width, true)
  const ticks = allTicks.length <= budget ? allTicks : Array.from({ length: budget }, (_, i) => allTicks[Math.round(i * (allTicks.length - 1) / (budget - 1))])
  const tickFormatter = compactLayout?.tickFormatter ?? (value => formatTimestamp(value, t))

  return (
    <div ref={ref} className={`dashboard-chart-transition dashboard-chart-transition--${phase}`}>
      {!points.length ? <p className="ux-chart-empty">{t('ux.empty')}</p> : <>
      <ResponsiveContainer width="100%" height={300}>
        <ScatterChart onClick={state => { const point = state?.activePayload?.[0]?.payload; const index = points.findIndex(p => p.station_code === point?.station_code && p.originalX === point?.originalX); if (index >= 0) setPointIndex(index) }} key={`${renderedAxisMode}-${chartPoints.length}`} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--theme-chart-grid-rgb))" />
        <XAxis
          type="number"
          dataKey="x"
          domain={domain}
          ticks={ticks}
          tickFormatter={value => { const label = tickFormatter(value); return String(label).replace(/:\d\d$/, '') }}
          tickLine={false}
          stroke="rgb(var(--theme-muted-rgb))"
          interval={0}
          tick={({ x, y, payload, index }) => {
            const parts = String(tickFormatter(payload.value)).replace(/:\d\d$/, '').split(', ')
            return <text x={x} y={y + 14} fill="rgb(var(--theme-muted-rgb))" fontSize={12} textAnchor={index === 0 ? 'start' : index === ticks.length - 1 ? 'end' : 'middle'}>{parts.map((part, i) => <tspan key={i} x={x} dy={i ? 14 : 0}>{part}</tspan>)}</text>
          }}
          height={48}
        />
        <YAxis width={66} stroke="rgb(var(--theme-muted-rgb))" {...metricAxis(metric, t)}
          type="number"
          dataKey="y"
          tick={{ fontSize: 12, fontFamily: 'JetBrains Mono' }}
        />
        <Tooltip
          cursor={{ strokeDasharray: '3 3' }}
          content={<ScatterTooltip metric={metric} />}
        />

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
      <PointReading data={points} columns={[{ key: 'stationName', label: t('admin.station_2'), text: true }, { key: 'y', label: getMetric(metric, t).label, metric }]} timeKey="originalX" index={pointIndex} onIndex={setPointIndex} />
      </>}
      <div className="ux-series" role="group" aria-label={t('ux.series')}>{series.map(s => <button type="button" key={s.station_code} aria-pressed={!hidden.has(s.station_code)} onClick={() => setHidden(prev => { const next = new Set(prev); next.has(s.station_code) ? next.delete(s.station_code) : next.add(s.station_code); return next })}><svg width="24" height="12" aria-hidden="true"><line x1="0" x2="24" y1="6" y2="6" stroke={seriesStyles.get(s.station_code)?.color} strokeWidth="3" /></svg>{s.displayName ?? s.station_code}</button>)}</div>
      {axisMode === 'data' && <p className="ux-note">{t('ux.compressed')}</p>}
    </div>
  )
}
