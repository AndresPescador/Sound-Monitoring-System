import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Cell, ResponsiveContainer
} from 'recharts'
import ChartCursor from './ChartCursor'
import { getEvenlySpacedTicks } from './timeAxis'

const levelColor = (leq) => {
  if (leq == null) return '#e2e8f0'
  if (leq < -30)   return '#16a34a'
  if (leq < -20)   return '#d97706'
  return '#dc2626'
}

export default function DailyBarChart({ data = [] }) {
  if (!data.length) return <p className="text-center text-sm text-text-muted py-8">Sin datos para este día.</p>

  const chartData = Array.from({ length: 24 }, (_, h) => {
    const row = data.find(d => d.hour === h)
    return { hour: `${String(h).padStart(2, '0')}h`, leq: row ? +row.leq_hour.toFixed(2) : null }
  })
  const hourTicks = getEvenlySpacedTicks(chartData.map(item => item.hour), 12)

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
        <XAxis
          dataKey="hour"
          ticks={hourTicks}
          interval={0}
          height={28}
          tickLine={false}
          tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }}
        />
        <YAxis tick={{ fontSize: 11, fontFamily: 'JetBrains Mono' }} unit=" dB" />
        <Tooltip
          cursor={<ChartCursor />}
          formatter={(v) => v != null ? [`${v} dBFS`, 'Leq hora'] : ['Sin datos', '']}
          contentStyle={{ fontFamily: 'Source Sans 3', fontSize: 12 }}
        />
        <Bar dataKey="leq" name="Leq/hora" radius={[3, 3, 0, 0]}>
          {chartData.map((entry, i) => (
            <Cell key={i} fill={levelColor(entry.leq)} fillOpacity={entry.leq != null ? 0.85 : 0.2} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
