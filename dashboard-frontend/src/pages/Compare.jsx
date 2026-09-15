import AnalysisFilters from '../components/shared/AnalysisFilters'
import { useEffect, useMemo, useState } from 'react'
import { useLanguage } from '../context/LanguageContext'
import { defaultT } from '../i18n/core.mjs'
import { getStations, getStationSummary } from '../api/stations'
import { getCompare } from '../api/compare'
import { getCompareMeasurements, getCompareMeasurementsRaw } from '../api/measurements'
import useRemoteData from '../hooks/useRemoteData'
import usePublicQuery, { queryRange, defaultRange, historicalAnchor } from '../hooks/usePublicQuery'
import { buildPresetRange, getLatestTimestamp, hasRecentData, validPublicRange, bogotaTime } from '../components/shared/dateRangeUtils'
import { getMetric, RAW_METRIC_IDS } from '../components/shared/metricCatalog'
import { getCoverageRatio, AUTO_FOCUS_THRESHOLD } from '../components/charts/timeAxis'
import AnalysisTabs from '../components/shared/AnalysisTabs'
import AnalysisCard, { QueryError } from '../components/analysis/AnalysisCard'
import DateRangePicker from '../components/shared/DateRangePicker'
import ChartAxisModeControl from '../components/shared/ChartAxisModeControl'
import ResolutionNotice from '../components/shared/ResolutionNotice'
import { HistoricalRangeNotice } from '../components/shared/RangeAvailabilityNotice'
import CompareChart from '../components/charts/CompareChart'
import ScatterCompareChart from '../components/charts/ScatterCompareChart'

const HOURLY = ['leq_hour', 'l10', 'l50', 'l90', 'dbfs_avg', 'dbfs_max', 'avg_spectral_centroid', 'avg_ild_db', 'avg_interaural_corr']
export default function Compare({ onStationSelectionChange } = {}) {
  const { t } = useLanguage()
  const { get, setQuery } = usePublicQuery()
  const group = get('compare') === 'locality' ? 'locality' : 'station'
  const stations = useRemoteData('compare-stations', signal => getStations({ signal }).then(r => r.data))
  return <div className="dashboard-page dashboard-compare-page">
    <header className="dashboard-page-header"><div><h1 tabIndex={-1}>{t('maps.compare_stations')}</h1><p>{t('common.compare_localities_and_individual_stations_to_identify_changes_peaks')}</p></div></header>
    {stations.error ? <QueryError error={stations.error} onRetry={stations.retry} /> : <AnalysisTabs items={[{ id: 'station', label: t('ux.byStation') }, { id: 'locality', label: t('ux.byLocality') }]} value={group} onChange={compare => setQuery({ compare })} label={t('maps.compare_stations')}>
      <ComparisonPanel key={group} group={group} stations={stations} onStationSelectionChange={onStationSelectionChange} />
    </AnalysisTabs>}
  </div>
}
function ComparisonPanel({ group, stations, onStationSelectionChange }) {
  const { t } = useLanguage()
  const { get, setQuery, params: urlParams } = usePublicQuery(`${group}_`)
  const [fallbackRange] = useState(defaultRange)
  const [search, setSearch] = useState('')
  const [exactOpen, setExactOpen] = useState(false)
  const [exactLimit, setExactLimit] = useState(3000)
  const allowed = group === 'station' ? RAW_METRIC_IDS : HOURLY
  const metric = allowed.includes(get('metric')) ? get('metric') : allowed[0]
  const sorted = useMemo(() => [...(stations.data ?? [])].sort((a, b) => (a.name ?? a.station_code).localeCompare(b.name ?? b.station_code, 'es')), [stations.data])
  const options = group === 'station' ? sorted.map(s => ({ id: s.station_code, label: s.name, detail: s.locality }))
    : [...new Set(sorted.map(s => s.locality))].sort((a, b) => a.localeCompare(b, 'es')).map(id => ({ id, label: id }))
  let savedSelection
  try { savedSelection = JSON.parse(get('selection', 'null')) } catch { savedSelection = null }
  const selected = Array.isArray(savedSelection) ? savedSelection.filter(id => options.some(o => o.id === id)) : options.slice(0, 3).map(o => o.id)
  const codes = sorted.filter(s => selected.includes(group === 'station' ? s.station_code : s.locality)).map(s => s.station_code)
  const codesKey = codes.join(',')
  const summaries = useRemoteData(`compare-latest:${codesKey}`, async signal => {
    const results = await Promise.allSettled(codes.map(code => getStationSummary(code, { signal })))
    return results.filter(r => r.status === 'fulfilled').map(r => r.value.data.latest_recorded_at)
  }, !stations.loading && codes.length > 0)
  const latest = getLatestTimestamp(summaries.data ?? [])
  const explicit = validPublicRange(get('from'), get('to'))
  const automaticHistorical = !explicit && latest && !hasRecentData(latest, 24)
  const historical = Boolean(automaticHistorical || (explicit && get('historical') && historicalAnchor(get, latest)))
  const implicit = useMemo(() => automaticHistorical ? buildPresetRange(24, latest) : fallbackRange, [automaticHistorical, latest, fallbackRange])
  const range = queryRange(get, implicit)
  const key = `${group}:${metric}:${codesKey}:${range.from}:${range.to}`
  const ready = !stations.loading && (codes.length === 0 || !summaries.loading)
  const resource = useRemoteData(key, async signal => {
    if (!codes.length) return { series: [] }
    const params = { metric, stations: codesKey, from: range.from, to: range.to }
    if (group === 'locality') return (await getCompare(params, { signal })).data
    return (await getCompareMeasurements({ ...params, max_points: 1500 }, { signal })).data
  }, ready)
  const exact = useRemoteData(`exact:${key}:${exactLimit}`, signal => getCompareMeasurementsRaw({ metric, stations: codesKey, from: range.from, to: range.to, raw_limit: exactLimit }, { signal }).then(r => r.data), group === 'station' && exactOpen && codes.length > 0 && ready)
  useEffect(() => { onStationSelectionChange?.(codes) }, [codesKey, onStationSelectionChange])
  useEffect(() => { setExactOpen(false); setExactLimit(3000) }, [key])
  const series = (resource.data?.series ?? []).map(s => ({ ...s, displayName: `${sorted.find(st => st.station_code === s.station_code)?.name ?? s.station_code} · ${s.locality ?? ''}`,
    data: (s.data ?? []).map(pt => ({ ...pt, hour_start: pt.hour_start ?? pt.recorded_at })) }))
  const exactSeries = (exact.data?.series ?? []).map(s => ({ ...s, displayName: sorted.find(st => st.station_code === s.station_code)?.name ?? s.station_code, rawData: s.raw_data ?? [] }))
  const coverage = getCoverageRatio([{ data: series.flatMap(s => s.data), timeKey: 'hour_start', valueKeys: ['value'] }], range)
  const automaticMode = coverage !== null && coverage < AUTO_FOCUS_THRESHOLD ? 'data' : 'range'
  const axis = ['data', 'range'].includes(get('axis')) ? get('axis') : automaticMode
  const spec = getMetric(metric, t)
  const rows = series.flatMap(s => s.data.map(pt => ({ timestamp: pt.hour_start, station_code: s.station_code, locality: s.locality, [metric]: pt.value })))
  const saveSelection = values => setQuery({ selection: JSON.stringify(values) })
  const hasMore = exactSeries.some(s => s.raw_has_more)
  useEffect(() => {
    if (ready && !stations.loading && (!explicit || !Array.isArray(savedSelection))) setQuery({ ...range, selection: JSON.stringify(selected), ...(explicit ? {} : { preset: '24h', historical: automaticHistorical ? latest : null }) }, true)
  }, [ready, stations.loading, explicit, codesKey, range.from, range.to])
  const applyRange = (value, metadata) => setQuery({ ...value, preset: metadata?.label ?? null, axis: null, historical: metadata?.label && historical ? historicalAnchor(get, latest) : null })
  return <>
    <AnalysisFilters>
      <summary><strong>{t('ux.filters')} · {selected.length}/{options.length}</strong><span>{t('ux.period')}: {bogotaTime(range.from, t)} – {bogotaTime(range.to, t)}</span></summary>
      <div className="ux-filter-content">
    <label className="dashboard-field">{t('maps.metric')}<select className="dashboard-select" value={metric} onChange={e => setQuery({ metric: e.target.value })}>{allowed.map(id => <option key={id} value={id}>{getMetric(id, t).label}</option>)}</select></label>

        <DateRangePicker value={range} preset={explicit ? get('preset', '') : '24h'} onChange={applyRange} isHistoricalRange={Boolean(historical)} anchorTimestamp={historical ? historicalAnchor(get, latest) : null} />
        <label className="dashboard-field">{t('ux.search')}<input type="search" className="dashboard-input" value={search} onChange={e => setSearch(e.target.value)} /></label>
        <div className="ux-selection-actions"><button type="button" onClick={() => saveSelection(options.map(o => o.id))}>{t('ux.selectAll')}</button><button type="button" onClick={() => saveSelection([])}>{t('ux.clear')}</button></div>
        <div className="dashboard-tag-list">{options.filter(o => `${o.label} ${o.detail ?? ''} ${o.id}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())).map(o => <button type="button" className="dashboard-tag" key={o.id} aria-pressed={selected.includes(o.id)} onClick={() => saveSelection(selected.includes(o.id) ? selected.filter(id => id !== o.id) : [...selected, o.id])}>{o.label}<small>{o.detail}</small></button>)}</div>
        <ChartAxisModeControl mode={axis} automaticMode={automaticMode} isAutomatic={!get('axis')} onChange={axis => setQuery({ axis })} range={range} compactGaps />
      </div>
    </AnalysisFilters>
    {selected.length > 6 && <p className="ux-note" role="status">{t('ux.dense')}</p>}
    {historical && <HistoricalRangeNotice range={range} latestTimestamp={latest} onReturnToCurrent={() => setQuery({ ...buildPresetRange(24), preset: '24h', historical: null, axis: null })} />}
    {!stations.loading && !options.length && <p role="status">{t('ux.noStations')}</p>}
    <AnalysisCard title={spec.label} info={spec.description} resource={resource} rows={rows} csvTitle={defaultT(group === 'station' ? 'common.comparison_by_station' : 'common.comparison_by_locality')} fileLabel={metric}>
      {group === 'locality' && <p className="ux-note">{t('ux.localityNote')}</p>}
      <CompareChart series={series} metric={metric} axisMode={axis} range={range} /><ResolutionNotice meta={resource.data?.resolution_seconds ? { ...resource.data, is_aggregated: true, returned_count: rows.length } : null} />
    </AnalysisCard>
    {group === 'station' && <details className="ux-exact" open={exactOpen} onToggle={e => { if (e.currentTarget.open !== exactOpen) setExactOpen(e.currentTarget.open) }}><summary>{t('ux.exact')}</summary>
      {exactOpen && <AnalysisCard title={t('common.exact_points_by_station')} resource={exact} rows={exactSeries.flatMap(s => s.rawData.map(pt => ({ timestamp: pt.recorded_at, station_code: s.station_code, [metric]: pt.value })))} fileLabel={metric}>
        <ScatterCompareChart series={exactSeries} metric={metric} metricLabel={spec.label} axisMode={axis} range={range} />
        {hasMore && <p className="ux-note">{t('common.representative_exact_view')} · {t.number(exactLimit)}</p>}
        {hasMore && exactLimit < 10000 && <button type="button" className="dashboard-load-more-button" onClick={() => setExactLimit(10000)}>{t('common.load_up_to')} 10 000</button>}
      </AnalysisCard>}
    </details>}
  </>
}
