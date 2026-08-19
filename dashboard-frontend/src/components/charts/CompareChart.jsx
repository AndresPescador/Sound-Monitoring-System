import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

const COLORS = ['#1d4ed8', '#153781', '#4774bd', '#6f94cf', '#8aa8d4', '#365b96', '#10223f']

export default function CompareChart({ series = [], metricLabel = 'Leq hora' }) {
  if (!series.length) return <p className="text-center text-sm text-text-muted py-8">Sin datos.</p>

  // Pivot: merge all series by hour_start timestamp
  const timeMap = {}
  series.forEach(s => {
    s.data.forEach(pt => {
      const key = pt.hour_start
      if (!timeMap[key]) timeMap[key] = { t: key }
      timeMap[key][s.station_code] = +pt.value.toFixed(2)
    })
  })
  const chartData = Object.values(timeMap).sort((a, b) => a.t.localeCompare(b.t))

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis
          dataKey="t"
          tickFormatter={iso => { try { return format(parseISO(iso), 'HH:mm', { locale: es }) } catch { return '' } }}
          tick={{ fontSize: 11, fontFamily: 'JetBrains Mono' }}
        />
        <YAxis tick={{ fontSize: 11, fontFamily: 'JetBrains Mono' }} unit=" dB" />
        <Tooltip
          formatter={(v, name) => [`${v} dBFS`, name]}
          labelFormatter={l => { try { return format(parseISO(l), "d MMM HH:mm", { locale: es }) } catch { return l } }}
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
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}
