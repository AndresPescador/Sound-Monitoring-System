import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine
} from 'recharts'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import ChartCursor from './ChartCursor'
import { ACTIVE_DOT, getChartDataWindow, getTimeAxis } from './timeAxis'

function AggregatedTooltip({ active, payload, label, unit, metricLabel }) {
  if (!active || !payload?.length) return null
  const point = payload[0]?.payload
  const suffix = unit ? ` ${unit}` : ''
  let dateLabel = label
  try { dateLabel = format(parseISO(label), "d MMM HH:mm:ss", { locale: es }) } catch { /* keep ISO */ }

  return (
    <div className="dashboard-chart-tooltip">
      <p>{dateLabel}</p>
      <strong>{metricLabel}: {Number(point.v).toFixed(1)}{suffix}</strong>
      {Number.isFinite(point.vMin) && Number.isFinite(point.vMax) && (
        <span>Rango: {point.vMin.toFixed(1)}–{point.vMax.toFixed(1)}{suffix}</span>
      )}
      {Number.isFinite(point.sourceCount) && (
        <span>{point.sourceCount.toLocaleString('es-CO')} mediciones en esta ventana</span>
      )}
    </div>
  )
}

export default function TimeSeriesChart({
  data = [],
  metricLabel = 'Valor',
  unit = '',
  compact = false,
  height = 220,
  series = null,
  axisMode = 'range',
}) {
  if (!data.length) return <p className="text-center text-sm text-text-muted py-8">Sin datos en este rango.</p>

  const chartData = series?.length
    ? data.map(d => ({
      t: d.recorded_at,
      ...Object.fromEntries(series.map(item => [
        item.dataKey,
        d[item.dataKey] == null ? null : Number(d[item.dataKey]),
      ])),
    }))
    : data.map(d => ({
      t: d.recorded_at,
      v: d.value == null ? null : +Number(d.value).toFixed(4),
      vMin: d.value_min == null ? null : +Number(d.value_min).toFixed(4),
      vMax: d.value_max == null ? null : +Number(d.value_max).toFixed(4),
      sourceCount: d.source_count == null ? null : Number(d.source_count),
    }))
  const visibleData = getChartDataWindow(
    chartData,
    axisMode,
    series?.length ? series.map(item => item.dataKey) : ['v'],
  )
  const timeAxis = getTimeAxis(visibleData)
  const hasAggregatedRange = !series?.length && visibleData.some(d => Number.isFinite(d.vMin) && Number.isFinite(d.vMax))

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={visibleData} margin={{ top: compact ? 3 : 8, right: compact ? 4 : 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={!compact} />
        <XAxis
          dataKey="t"
          ticks={timeAxis.ticks}
          tickFormatter={timeAxis.tickFormatter}
          hide={compact}
          interval={0}
          height={28}
          tickLine={false}
          tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }}
        />
        <YAxis hide={compact} tick={{ fontSize: 11, fontFamily: 'JetBrains Mono' }} unit={unit ? ` ${unit}` : ''} />
        <Tooltip
          cursor={<ChartCursor />}
          formatter={(v, name) => [`${Number(v).toFixed(1)}${unit ? ' ' + unit : ''}`, name ?? metricLabel]}
          labelFormatter={(l) => { try { return format(parseISO(l), "d MMM HH:mm:ss", { locale: es }) } catch { return l } }}
          content={hasAggregatedRange ? <AggregatedTooltip unit={unit} metricLabel={metricLabel} /> : undefined}
          contentStyle={{ fontFamily: 'Source Sans 3', fontSize: 12 }}
        />
        <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="4 2" />
        {(series?.length ? series : [{ dataKey: 'v', label: metricLabel, color: '#1d4ed8' }]).map(item => (
          <Line
            key={item.dataKey}
            type="monotone"
            dataKey={item.dataKey}
            stroke={item.color ?? '#1d4ed8'}
            strokeWidth={compact ? 2 : 1.5}
            dot={false}
            activeDot={ACTIVE_DOT}
            name={item.label}
            connectNulls={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}
