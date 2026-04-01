import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer
} from 'recharts'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

const fmt = (iso) => format(parseISO(iso), 'HH:mm', { locale: es })

export default function LevelBandChart({ data = [] }) {
  if (!data.length) return <p className="text-center text-sm text-text-muted py-8">Sin datos en este rango.</p>

  const chartData = data.map(d => ({
    t:   d.hour_start,
    leq: +d.leq_hour.toFixed(2),
    l10: +d.l10.toFixed(2),
    l50: +d.l50.toFixed(2),
    l90: +d.l90.toFixed(2),
  }))

  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="gradL10" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#dc2626" stopOpacity={0.15} />
            <stop offset="95%" stopColor="#dc2626" stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="gradL50" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#1d4ed8" stopOpacity={0.2} />
            <stop offset="95%" stopColor="#1d4ed8" stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="gradL90" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#16a34a" stopOpacity={0.15} />
            <stop offset="95%" stopColor="#16a34a" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="t" tickFormatter={fmt} tick={{ fontSize: 11, fontFamily: 'JetBrains Mono' }} />
        <YAxis tick={{ fontSize: 11, fontFamily: 'JetBrains Mono' }} unit=" dB" />
        <Tooltip
          formatter={(v, name) => [`${v} dBFS`, name.toUpperCase()]}
          labelFormatter={(l) => format(parseISO(l), "d MMM HH:mm", { locale: es })}
          contentStyle={{ fontFamily: 'Source Sans 3', fontSize: 12 }}
        />
        <Legend wrapperStyle={{ fontFamily: 'DM Sans', fontSize: 12 }} />
        <Area type="monotone" dataKey="l10" name="L10 (picos)"   stroke="#dc2626" fill="url(#gradL10)" strokeWidth={1.5} dot={false} />
        <Area type="monotone" dataKey="leq" name="Leq"           stroke="#1d4ed8" fill="url(#gradL50)" strokeWidth={2}   dot={false} />
        <Area type="monotone" dataKey="l90" name="L90 (fondo)"   stroke="#16a34a" fill="url(#gradL90)" strokeWidth={1.5} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  )
}
