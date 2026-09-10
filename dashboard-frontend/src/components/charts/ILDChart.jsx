import { useLanguage } from '../../context/LanguageContext'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Cell, ReferenceLine, ResponsiveContainer
} from 'recharts'
import { format, parseISO } from 'date-fns'
import ChartCursor from './ChartCursor'
import { getChartDataWindow, getTimeAxis } from './timeAxis'

function ILDTooltip({ active, payload, label }) {
  const { t } = useLanguage()
  if (!active || !payload?.length) return null
  const point = payload[0].payload
  let dateLabel = label
  try { dateLabel = format(parseISO(label), "d MMM HH:mm", { locale: t.dateLocale }) } catch { /* keep ISO */ }
  return (
    <div className="dashboard-chart-tooltip">
      <p>{dateLabel}</p>
      <strong>ILD: {t.fixed(point.ild, 1)} dB</strong>
      {Number.isFinite(point.ildMin) && Number.isFinite(point.ildMax) && (
        <span>{t('charts.range') + ' '}{t.fixed(point.ildMin, 1)}–{t.fixed(point.ildMax, 1)} dB</span>
      )}
      {Number.isFinite(point.sourceCount) && (
        <span>{point.sourceCount.toLocaleString(t.locale)}{' ' + t('charts.measurements_in_this_window')}</span>
      )}
    </div>
  )
}

export default function ILDChart({ data = [], axisMode = 'range' }) {
  const { t } = useLanguage()
  if (!data.length) return <p className="text-center text-sm text-text-muted py-8">{t('charts.no_data_in_this_range')}</p>

  const chartData = data.map(d => ({
    t:   d.recorded_at,
    ild: d.ild_db == null ? null : +Number(d.ild_db).toFixed(3),
    ildMin: d.ild_db_min == null ? null : +Number(d.ild_db_min).toFixed(3),
    ildMax: d.ild_db_max == null ? null : +Number(d.ild_db_max).toFixed(3),
    sourceCount: d.source_count == null ? null : Number(d.source_count),
  }))
  const visibleData = getChartDataWindow(chartData, axisMode, ['ild'])
  const timeAxis = getTimeAxis(visibleData, undefined, undefined, t)

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={visibleData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
        <XAxis dataKey="t"
          ticks={timeAxis.ticks}
          tickFormatter={timeAxis.tickFormatter}
          interval={0}
          height={28}
          tickLine={false}
          tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }}
        />
        <YAxis tickFormatter={t.number} tick={{ fontSize: 11, fontFamily: 'JetBrains Mono' }} unit=" dB" />
        <ReferenceLine y={0} stroke="#1e293b" strokeWidth={1.5} />
        <Tooltip
          cursor={<ChartCursor />}
          formatter={(v) => [`${v} dB`, 'ILD']}
          labelFormatter={l => { try { return format(parseISO(l), "d MMM HH:mm", { locale: t.dateLocale }) } catch { return l } }}
          content={<ILDTooltip />}
          contentStyle={{ fontFamily: 'Source Sans 3', fontSize: 12 }}
        />
        <Bar dataKey="ild" name="ILD" radius={[2, 2, 0, 0]}>
          {visibleData.map((entry, i) => (
            <Cell key={i} fill={entry.ild == null ? '#94a3b8' : (entry.ild >= 0 ? '#3b82f6' : '#d97706')} fillOpacity={entry.ild == null ? 0.25 : 0.8} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
