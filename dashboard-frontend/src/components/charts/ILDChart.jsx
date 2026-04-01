import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Cell, ReferenceLine, ResponsiveContainer
} from 'recharts'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

export default function ILDChart({ data = [] }) {
  if (!data.length) return <p className="text-center text-sm text-text-muted py-8">Sin datos en este rango.</p>

  const chartData = data.map(d => ({
    t:   d.recorded_at,
    ild: +d.ild_db.toFixed(3),
  }))

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
        <XAxis dataKey="t"
          tickFormatter={iso => { try { return format(parseISO(iso), 'HH:mm') } catch { return '' } }}
          tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }}
        />
        <YAxis tick={{ fontSize: 11, fontFamily: 'JetBrains Mono' }} unit=" dB" />
        <ReferenceLine y={0} stroke="#1e293b" strokeWidth={1.5} />
        <Tooltip
          formatter={(v) => [`${v} dB`, 'ILD']}
          labelFormatter={l => { try { return format(parseISO(l), "d MMM HH:mm", { locale: es }) } catch { return l } }}
          contentStyle={{ fontFamily: 'Source Sans 3', fontSize: 12 }}
        />
        <Bar dataKey="ild" name="ILD" radius={[2, 2, 0, 0]}>
          {chartData.map((entry, i) => (
            <Cell key={i} fill={entry.ild >= 0 ? '#3b82f6' : '#d97706'} fillOpacity={0.8} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
