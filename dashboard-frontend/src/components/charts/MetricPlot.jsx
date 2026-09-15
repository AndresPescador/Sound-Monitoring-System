import { useEffect, useRef, useState, useId } from 'react'
import { ComposedChart, Line, Area, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { useLanguage } from '../../context/LanguageContext'
import { bogotaTime, bogotaDay, validPublicRange } from '../shared/dateRangeUtils'
import { formatMetric, getMetric, metricAxis, observedNumber } from '../shared/metricCatalog'
import { getChartDataWindow, getTimeAxis, getEvenlySpacedTicks } from './timeAxis'

export function tickBudget(width, multipleDays = false) {
  return Math.max(2, Math.min(10, Math.floor(Math.max(0, width - 86) / (multipleDays ? 110 : 72))))
}
export function usePlotWidth() {
  const ref = useRef(null)
  const [width, setWidth] = useState(320)
  useEffect(() => {
    if (!ref.current) return
    const update = () => setWidth(ref.current?.getBoundingClientRect().width || 320)
    update()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(update)
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])
  return [ref, width]
}

export function PointReading({ data, columns, index, onIndex, timeKey = 't', categorical = false }) {
  const { t } = useLanguage()
  const [page, setPage] = useState(0)
  const [tableOpen, setTableOpen] = useState(false)
  const current = Math.max(0, Math.min(index, data.length - 1))
  const tablePage = Math.min(page, Math.max(0, Math.ceil(data.length / 50) - 1))
  const timestamp = row => categorical ? row[timeKey] : bogotaTime(row[timeKey], t, { seconds: true })
  if (!data.length) return null
  return <div className="ux-reading">
    <div className="ux-point-controls" role="group" aria-label={t('ux.pointRead')}>
      <button type="button" disabled={!current} onClick={() => onIndex(current - 1)} aria-label={t('ux.previous')}>←</button>
      <output aria-live="polite">{t('ux.point', { index: current + 1, count: data.length })} · {timestamp(data[current])}
        {columns.map(col => <span key={col.key}>{col.label}: <strong>{col.text ? data[current][col.key] ?? '—' : formatMetric(data[current][col.key], col.metric, t)}</strong></span>)}
      </output>
      <button type="button" disabled={current >= data.length - 1} onClick={() => onIndex(current + 1)} aria-label={t('ux.next')}>→</button>
    </div>
    <details open={tableOpen} onToggle={event => setTableOpen(event.currentTarget.open)}>
      <summary>{t('ux.table')}</summary>
      {tableOpen && <><p>{t('ux.shown')}</p><div className="ux-table-scroll" tabIndex={0} role="region" aria-label={t('ux.table')}>
        <table className="dashboard-data-table"><thead><tr><th scope="col">{t('ux.time')}</th>{columns.map(col => <th scope="col" key={col.key}>{col.label}</th>)}</tr></thead>
          <tbody>{data.slice(tablePage * 50, (tablePage + 1) * 50).map((row, i) => <tr key={i}><td>{timestamp(row)}</td>{columns.map(col => <td key={col.key}>{col.text ? row[col.key] ?? '—' : formatMetric(row[col.key], col.metric, t)}</td>)}</tr>)}</tbody></table>
      </div>{data.length > 50 && <div className="ux-point-controls"><button type="button" aria-label={t('ux.previousPage')} disabled={tablePage === 0} onClick={() => setPage(tablePage - 1)}>←</button><span>{tablePage + 1} / {Math.ceil(data.length / 50)}</span><button type="button" aria-label={t('ux.nextPage')} disabled={(tablePage + 1) * 50 >= data.length} onClick={() => setPage(tablePage + 1)}>→</button></div>}</>}
    </details>
  </div>
}
function PlotTooltip({ active, payload, label, columns, categorical, t }) {
  if (!active || !payload?.length) return null
  const point = payload[0].payload
  return <div className="dashboard-chart-tooltip"><p>{categorical ? label : bogotaTime(label, t, { seconds: true })}</p>
    {columns.filter(col => observedNumber(point[col.key]) !== null).map(col => <div key={col.key}><strong>{col.label}: {formatMetric(point[col.key], col.metric, t)}</strong>
      {observedNumber(point[`${col.key}_min`]) !== null && observedNumber(point[`${col.key}_max`]) !== null && <span>{t('charts.range')}: {formatMetric(point[`${col.key}_min`], col.metric, t)} – {formatMetric(point[`${col.key}_max`], col.metric, t)}</span>}
    </div>)}
    {observedNumber(point.source_count) !== null && <span>{t.number(point.source_count)} {t('charts.measurements_in_this_window')}</span>}
  </div>
}
export default function MetricPlot({ data = [], columns, metric, axisMode = 'range', height = 260, compact = false, categorical = false, kind = 'line', colorByValue, interactiveLegend = false, compressed = false, range = null }) {
  const { t } = useLanguage()
  const [ref, width] = usePlotWidth()
  const [index, setIndex] = useState(0)
  const [hidden, setHidden] = useState(new Set())
  const plotId = useId().replaceAll(':', '')
  const visibleColumns = columns.filter(col => !hidden.has(col.key))
  const windowedData = getChartDataWindow(data, axisMode, columns.map(col => col.key))
  const numericTime = !categorical && !(compressed && axisMode === 'data')
  const visibleData = numericTime ? windowedData.map(row => ({ ...row, __x: Date.parse(row.t) })) : windowedData
  const readingData = visibleData.filter(row => !row.axisGap)
  const current = Math.min(index, Math.max(0, readingData.length - 1))
  const multipleDays = !categorical && new Set([...visibleData.filter(row => !row.axisGap).map(row => bogotaDay(row.t)), ...(range && axisMode === 'range' ? [bogotaDay(range.from), bogotaDay(range.to)] : [])]).size > 1
  const count = tickBudget(width, multipleDays)
  const observedTimes = visibleData.map(row => row.__x).filter(Number.isFinite)
  const min = observedTimes.length ? Math.min(...observedTimes) : 0
  const max = observedTimes.length ? Math.max(...observedTimes) : 1
  const timeDomain = axisMode === 'range' && validPublicRange(range?.from, range?.to) ? [Date.parse(range.from), Date.parse(range.to)] : [min, max === min ? max + 60000 : max]
  const timeAxis = numericTime ? { ticks: Array.from({ length: count }, (_, i) => timeDomain[0] + (timeDomain[1] - timeDomain[0]) * i / (count - 1)), tickFormatter: value => bogotaTime(value, t, { date: multipleDays }) } : categorical ? { ticks: getEvenlySpacedTicks(visibleData.map(row => row.t), count), tickFormatter: v => v }
    : getTimeAxis(visibleData, 't', { maxTicks: count }, t)
  const spec = getMetric(metric, t)
  const selectPoint = state => {
    if (state?.activeTooltipIndex == null) return
    const row = visibleData[state.activeTooltipIndex]
    const next = readingData.indexOf(row)
    if (next >= 0) setIndex(next)
  }
  const numericData = data.some(row => columns.some(col => observedNumber(row[col.key]) !== null))
  return <div ref={ref} className={`ux-plot ${compact ? 'ux-plot--compact' : ''}`}>
    {!numericData ? <div className="ux-chart-empty" role="status">{t('ux.empty')}</div> : <>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={visibleData} margin={{ top: 12, right: 12, left: 0, bottom: 0 }} onClick={selectPoint} accessibilityLayer>
          <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--theme-chart-grid-rgb))" vertical={!compact && kind !== 'bar'} />
          <XAxis stroke="rgb(var(--theme-muted-rgb))" dataKey={numericTime ? '__x' : 't'} type={numericTime ? 'number' : 'category'} domain={numericTime ? timeDomain : undefined} hide={compact} ticks={timeAxis.ticks} tickFormatter={timeAxis.tickFormatter} interval={0} minTickGap={12} height={multipleDays ? 48 : 32} tickLine={false}
            tick={({ x, y, payload, index: tickIndex }) => {
              const label = String(timeAxis.tickFormatter(payload.value))
              const parts = multipleDays ? label.split(', ') : [label]
              return <text x={x} y={y + 14} fontSize={12} fill="rgb(var(--theme-muted-rgb))" textAnchor={tickIndex === 0 ? 'start' : tickIndex === timeAxis.ticks.length - 1 ? 'end' : 'middle'}>{parts.map((part, i) => <tspan key={i} x={x} dy={i ? 14 : 0}>{part}</tspan>)}</text>
            }} />
          <YAxis stroke="rgb(var(--theme-muted-rgb))" hide={compact} width={66} {...metricAxis(metric, t)} tick={{ fontSize: 12 }} tickCount={5} />
          {!compact && <Tooltip content={<PlotTooltip columns={visibleColumns} categorical={categorical} t={t} />} wrapperStyle={{ maxWidth: 'min(320px, 80vw)', zIndex: 10 }} />}
          {spec.domain === 'symmetric' && <ReferenceLine y={0} stroke="rgb(var(--theme-muted-rgb))" />}
          {visibleColumns.map((col, i) => {
            const color = col.color ?? `var(--dashboard-chart-series-${i + 1})`
            const shared = { dataKey: col.key, name: col.label, stroke: color, strokeWidth: 2, isAnimationActive: false, connectNulls: false }
            return kind === 'bar' ? <Bar key={col.key} {...shared} fill={color} radius={[2, 2, 0, 0]}>{colorByValue && visibleData.map((row, j) => <Cell key={j} fill={colorByValue(row[col.key])} />)}</Bar>
              : kind === 'area' ? <Area key={col.key} {...shared} type="linear" fill={color} fillOpacity={0.06} dot={visibleData.length === 1} activeDot={{ r: 4 }} strokeDasharray={col.dash} />
                : <Line key={col.key} {...shared} type="linear" dot={visibleData.length === 1} activeDot={{ r: 4 }} strokeDasharray={col.dash} />
          })}
          {!compact && readingData[current] && <ReferenceLine x={numericTime ? readingData[current].__x : readingData[current].t} stroke="rgb(var(--theme-muted-rgb))" strokeDasharray="2 4" />}
        </ComposedChart>
      </ResponsiveContainer>
      {!compact && <>
        <div className="ux-series" role="group" aria-label={t('ux.series')}>{columns.map((col, i) => <button key={col.key} type="button" aria-pressed={!hidden.has(col.key)} disabled={!interactiveLegend}
          onClick={() => setHidden(prev => { const next = new Set(prev); next.has(col.key) ? next.delete(col.key) : next.add(col.key); return next })}>
          <svg width="24" height="12" aria-hidden="true"><line x1="0" x2="24" y1="6" y2="6" stroke={col.color ?? `var(--dashboard-chart-series-${i + 1})`} strokeWidth="3" strokeDasharray={col.dash} /></svg>{col.label}{getMetric(col.metric, t).unit ? ` (${getMetric(col.metric, t).unit})` : ''}
        </button>)}</div>
        {compressed && axisMode === 'data' && <p className="ux-note">{t('ux.compressed')}</p>}
        <PointReading key={plotId} data={readingData} columns={visibleColumns} index={current} onIndex={setIndex} categorical={categorical} />
      </>}
    </>}
  </div>
}
