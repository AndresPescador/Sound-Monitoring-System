import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine
} from 'recharts'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

const fmt = (iso) => {
  try { return format(parseISO(iso), 'HH:mm', { locale: es }) }
  catch { return iso }
}

export default function TimeSeriesChart({
  data = [],
  metricLabel = 'Valor',
  unit = '',
  compact = false,
  height = 220,
  series = null,
}) {
  if (!data.length) return <p className="text-center text-sm text-text-muted py-8">Sin datos en este rango.</p>

  const chartData = series?.length
    ? data.map(d => ({
      t: d.recorded_at,
      ...Object.fromEntries(series.map(item => [item.dataKey, Number(d[item.dataKey])])),
    }))
    : data.map(d => ({ t: d.recorded_at, v: +Number(d.value).toFixed(4) }))

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={chartData} margin={{ top: compact ? 3 : 8, right: compact ? 4 : 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={!compact} />
        <XAxis
          dataKey="t"
          tickFormatter={fmt}
          hide={compact}
          interval="preserveStartEnd"
          minTickGap={60}
          angle={-45}
          textAnchor="end"
          height={50}        // más espacio abajo para las etiquetas rotadas
          tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }}
        />
        <YAxis hide={compact} tick={{ fontSize: 11, fontFamily: 'JetBrains Mono' }} unit={unit ? ` ${unit}` : ''} />
        <Tooltip
          formatter={(v, name) => [`${Number(v).toFixed(1)}${unit ? ' ' + unit : ''}`, name ?? metricLabel]}
          labelFormatter={(l) => { try { return format(parseISO(l), "d MMM HH:mm:ss", { locale: es }) } catch { return l } }}
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
            name={item.label}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}
