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

export default function TimeSeriesChart({ data = [], metricLabel = 'Valor', unit = '' }) {
  if (!data.length) return <p className="text-center text-sm text-text-muted py-8">Sin datos en este rango.</p>

  const chartData = data.map(d => ({ t: d.recorded_at, v: +d.value.toFixed(4) }))

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="t" tickFormatter={fmt} tick={{ fontSize: 11, fontFamily: 'JetBrains Mono' }} />
        <YAxis tick={{ fontSize: 11, fontFamily: 'JetBrains Mono' }} unit={unit ? ` ${unit}` : ''} />
        <Tooltip
          formatter={(v) => [`${v}${unit ? ' ' + unit : ''}`, metricLabel]}
          labelFormatter={(l) => { try { return format(parseISO(l), "d MMM HH:mm:ss", { locale: es }) } catch { return l } }}
          contentStyle={{ fontFamily: 'Source Sans 3', fontSize: 12 }}
        />
        <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="4 2" />
        <Line type="monotone" dataKey="v" stroke="#1d4ed8" strokeWidth={1.5} dot={false} name={metricLabel} />
      </LineChart>
    </ResponsiveContainer>
  )
}
