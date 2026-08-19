import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import ChartCursor from './ChartCursor'
import { ACTIVE_DOT, compactEmptyTimeBuckets, getChartDataWindow, getTimeAxis } from './timeAxis'
import useChartAxisTransition from '../../hooks/useChartAxisTransition'

const COLORS = ['#1d4ed8', '#153781', '#4774bd', '#6f94cf', '#8aa8d4', '#365b96', '#10223f']

function CompareTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null

  let dateLabel = label
  try { dateLabel = format(parseISO(label), 'd MMM HH:mm', { locale: es }) } catch { /* keep label */ }

  const visiblePoints = payload.filter(item => item.value != null)
  if (!visiblePoints.length) return null

  return (
    <div className="dashboard-chart-tooltip">
      <p>{dateLabel}</p>
      {visiblePoints.map(item => {
        const point = item.payload
        const min = point[`${item.dataKey}__min`]
        const max = point[`${item.dataKey}__max`]
        const sourceCount = point[`${item.dataKey}__sourceCount`]
        return (
          <div key={item.dataKey}>
            <strong>{item.name}: {Number(item.value).toFixed(2)} dBFS</strong>
            {Number.isFinite(Number(min)) && Number.isFinite(Number(max)) && (
              <span>Rango: {Number(min).toFixed(2)}–{Number(max).toFixed(2)} dBFS</span>
            )}
            {Number.isFinite(Number(sourceCount)) && (
              <span>{Number(sourceCount).toLocaleString('es-CO')} mediciones en esta ventana</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function CompareChart({ series = [], metricLabel = 'Leq hora', axisMode = 'range' }) {
  const { renderedAxisMode, phase } = useChartAxisTransition(axisMode)
  if (!series.length) return <p className="text-center text-sm text-text-muted py-8">Sin datos.</p>

  // Pivot: merge all series by hour_start timestamp
  const timeMap = {}
  series.forEach(s => {
    s.data.forEach(pt => {
      const key = pt.hour_start
      if (!timeMap[key]) timeMap[key] = { t: key }
      timeMap[key][s.station_code] = pt.value == null ? null : +Number(pt.value).toFixed(2)
      timeMap[key][`${s.station_code}__min`] = pt.value_min
      timeMap[key][`${s.station_code}__max`] = pt.value_max
      timeMap[key][`${s.station_code}__sourceCount`] = pt.source_count
    })
  })
  const chartData = Object.values(timeMap).sort((a, b) => a.t.localeCompare(b.t))
  const valueKeys = series.map(s => s.station_code)
  const focusedData = getChartDataWindow(chartData, renderedAxisMode, valueKeys)
  const visibleData = renderedAxisMode === 'data'
    ? compactEmptyTimeBuckets(focusedData, valueKeys)
    : focusedData
  const timeAxis = getTimeAxis(visibleData)

  return (
    <div className={`dashboard-chart-transition dashboard-chart-transition--${phase}`}>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart key={`${renderedAxisMode}-${visibleData.length}`} data={visibleData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis
          dataKey="t"
          ticks={timeAxis.ticks}
          tickFormatter={timeAxis.tickFormatter}
          interval={0}
          height={28}
          tickLine={false}
          tick={{ fontSize: 11, fontFamily: 'JetBrains Mono' }}
        />
        <YAxis tick={{ fontSize: 11, fontFamily: 'JetBrains Mono' }} unit=" dB" />
        <Tooltip
          cursor={<ChartCursor />}
          content={<CompareTooltip />}
          contentStyle={{ fontFamily: 'Source Sans 3', fontSize: 12 }}
        />
        <Legend wrapperStyle={{ fontFamily: 'DM Sans', fontSize: 12 }} />
        {series.map((s, i) => (
          <Line
            key={s.station_code}
            type="monotone"
            dataKey={s.station_code}
            // displayName existe en sección 2 (estaciones individuales).
            // En sección 1 (localidades) no existe y se usa locality como antes.
            name={s.displayName ?? s.locality ?? s.station_code}
            stroke={COLORS[i % COLORS.length]}
            strokeWidth={2}
            dot={false}
            activeDot={ACTIVE_DOT}
            connectNulls={false}
            isAnimationActive={false}
          />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
