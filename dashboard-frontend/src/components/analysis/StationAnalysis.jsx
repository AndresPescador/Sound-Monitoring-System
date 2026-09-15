import AnalysisFilters from '../shared/AnalysisFilters'
import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useLanguage } from '../../context/LanguageContext'
import { defaultT } from '../../i18n/core.mjs'
import { getStationSummary, getStations } from '../../api/stations'
import { getMeasurements, getBinaural, getSpectral } from '../../api/measurements'
import { getHourly, getDailyProfile } from '../../api/aggregations'
import useRemoteData from '../../hooks/useRemoteData'
import usePublicQuery, { queryRange, defaultRange, historicalAnchor } from '../../hooks/usePublicQuery'
import { bogotaDay, bogotaTime, buildPresetRange, hasRecentData, validPublicRange } from '../shared/dateRangeUtils'
import { getMetric, formatMetric, joinChannels } from '../shared/metricCatalog'
import { getCoverageRatio, AUTO_FOCUS_THRESHOLD } from '../charts/timeAxis'
import { applySeoMetadata, routeSeo, siteUrl } from '../../seo.mjs'
import AnalysisTabs from '../shared/AnalysisTabs'
import DateRangePicker from '../shared/DateRangePicker'
import MetricSelector from '../shared/MetricSelector'
import ChartAxisModeControl from '../shared/ChartAxisModeControl'
import ResolutionNotice, { formatSeriesMeta } from '../shared/ResolutionNotice'
import { HistoricalRangeNotice } from '../shared/RangeAvailabilityNotice'
import AnalysisCard, { QueryError } from './AnalysisCard'
import LevelBandChart from '../charts/LevelBandChart'
import DailyBarChart from '../charts/DailyBarChart'
import TimeSeriesChart from '../charts/TimeSeriesChart'
import ILDChart from '../charts/ILDChart'

const GROUPS = ['summary', 'levels', 'binaural', 'spectral']
export default function StationAnalysis({ embedded = false }) {
  const { code } = useParams()
  const { t } = useLanguage()
  const navigate = useNavigate()
  const location = useLocation()
  const { get, setQuery } = usePublicQuery()
  const [fallbackRange] = useState(defaultRange)
  const summary = useRemoteData(`summary:${code}`, signal => getStationSummary(code, { signal }).then(r => r.data))
  const stations = useRemoteData('stations', signal => getStations({ signal }).then(r => r.data))
  const explicitRange = validPublicRange(get('from'), get('to'))
  const latest = summary.data?.latest_recorded_at
  const automaticHistorical = !explicitRange && latest && !hasRecentData(latest, 24)
  const historical = Boolean(automaticHistorical || (explicitRange && get('historical') && historicalAnchor(get, latest)))
  const implicitRange = useMemo(() => automaticHistorical ? buildPresetRange(24, latest) : fallbackRange, [automaticHistorical, latest, fallbackRange])
  const range = queryRange(get, implicitRange)
  const group = GROUPS.includes(get('tab')) ? get('tab') : 'summary'
  const metric = ['leq_dbfs', 'dbfs_level', 'rms_energy'].includes(get('metric')) ? get('metric') : 'leq_dbfs'
  const rangeKey = `${code}:${range.from}:${range.to}`
  const fromDay = bogotaDay(range.from), toDay = bogotaDay(range.to)
  const profileDate = /^\d{4}-\d{2}-\d{2}$/.test(get('day')) && get('day') >= fromDay && get('day') <= toDay ? get('day') : toDay
  const ready = !summary.loading && !summary.error
  const params = { from: range.from, to: range.to }
  const hourly = useRemoteData(`hourly:${rangeKey}`, signal => getHourly(code, params, { signal }).then(r => r.data), ready && ['summary', 'levels'].includes(group))
  const daily = useRemoteData(`daily:${code}:${profileDate}`, signal => getDailyProfile(code, { date: profileDate }, { signal }).then(r => r.data), ready && group === 'levels')
  const series = useRemoteData(`metric:${rangeKey}:${metric}`, signal => getMeasurements(code, { ...params, metric }, { signal }).then(r => r.data), ready && group === 'levels')
  const binaural = useRemoteData(`binaural:${rangeKey}`, signal => getBinaural(code, params, { signal }).then(r => r.data), ready && group === 'binaural')
  const channels = useRemoteData(`channels:${rangeKey}`, async signal => {
    const [left, right] = await Promise.all(['ch_left_dbfs', 'ch_right_dbfs'].map(key => getMeasurements(code, { ...params, metric: key }, { signal })))
    return { data: joinChannels(left.data.data, right.data.data), metas: [left.data, right.data] }
  }, ready && group === 'binaural')
  const spectral = useRemoteData(`spectral:${rangeKey}`, signal => getSpectral(code, params, { signal }).then(r => r.data), ready && group === 'spectral')
  const relevant = group === 'binaural' ? [{ data: binaural.data?.data, valueKeys: ['ild_db', 'interaural_correlation'] }]
    : group === 'spectral' ? [{ data: spectral.data?.data, valueKeys: ['spectral_centroid', 'dominant_frequency'] }]
      : [{ data: hourly.data?.data, timeKey: 'hour_start', valueKeys: ['leq_hour'] }]
  const coverage = getCoverageRatio(relevant, range)
  const automaticMode = coverage !== null && coverage < AUTO_FOCUS_THRESHOLD ? 'data' : 'range'
  const chosenAxis = ['data', 'range'].includes(get('axis')) ? get('axis') : 'auto'
  const axisMode = chosenAxis === 'auto' ? automaticMode : chosenAxis
  const name = summary.data?.name ?? stations.data?.find(s => s.station_code === code)?.name ?? code
  const base = embedded ? '/mapa-3d' : '/mapa-2d'
  useEffect(() => {
    if (!summary.data?.name || embedded) return
    applySeoMetadata(routeSeo(location.pathname, { siteUrl: siteUrl(import.meta.env.VITE_SITE_URL), station: summary.data }, t))
  }, [summary.data, embedded, location.pathname, t])
  useEffect(() => {
    if (ready && !explicitRange) setQuery({ ...range, preset: '24h', historical: automaticHistorical ? latest : null }, true)
  }, [ready, explicitRange, range.from, range.to, automaticHistorical, latest])
  const applyRange = (value, metadata) => setQuery({ ...value, preset: metadata?.label ?? null, axis: null, day: null, historical: metadata?.label && historical ? historicalAnchor(get, latest) : null })
  const metricRows = (resource, key) => (resource.data?.data ?? []).map(row => ({ ...row, value: row[key], value_min: row[`${key}_min`], value_max: row[`${key}_max`] }))
  const metricCard = (key, resource) => {
    const spec = getMetric(key, t)
    return <AnalysisCard key={key} title={spec.label} csvTitle={getMetric(key, defaultT).label} info={spec.description} resource={resource} stationCode={code} fileLabel={key}
      rows={(resource.data?.data ?? []).map(row => ({ timestamp: row.recorded_at, [spec.csvKey]: row[key] }))}>
      <TimeSeriesChart data={metricRows(resource, key)} metric={key} axisMode={axisMode} range={range} /><ResolutionNotice meta={resource.data} />
    </AnalysisCard>
  }
  return <div className={`dashboard-page ux-station-analysis ${embedded ? 'ux-station-analysis--embedded' : ''}`}>
    <header className="ux-station-heading">
      <div>{!embedded && <Link className="dashboard-breadcrumb" to={base}>{t('ux.map')}</Link>}<h1 tabIndex={-1}>{name}</h1>
        <p>{summary.data?.locality} · {summary.data?.is_active == null ? t('ux.unavailable') : t(summary.data.is_active ? 'ux.active' : 'ux.inactive')} · {formatMetric(summary.data?.latest_leq_dbfs, 'leq_dbfs', t)}</p>
      </div>

    </header>
    {stations.error && !summary.error && <QueryError error={stations.error} onRetry={stations.retry} />}
    <AnalysisFilters>
      <summary><strong>{t('ux.filters')}</strong><span>{t('ux.period')}: {bogotaTime(range.from, t)} – {bogotaTime(range.to, t)}</span></summary>
      <div className="ux-filter-content">      <label className="ux-station-select"><span>{t('common.change_station')}</span><select className="dashboard-select" value={code} disabled={!stations.data?.length}
        onChange={e => navigate(`${base}/stations/${encodeURIComponent(e.target.value)}${location.search}`)}>
        {!stations.data?.length && <option value={code}>{code}</option>}
        {stations.data?.map(s => <option key={s.station_code} value={s.station_code}>{s.name}</option>)}
      </select></label><DateRangePicker value={range} preset={explicitRange ? get('preset', '') : '24h'} onChange={applyRange} anchorTimestamp={historical ? historicalAnchor(get, latest) : null} isHistoricalRange={Boolean(historical)} />
        <ChartAxisModeControl mode={axisMode} automaticMode={automaticMode} isAutomatic={chosenAxis === 'auto'} onChange={axis => setQuery({ axis })} range={range} />
      </div>
    </AnalysisFilters>
    {historical && <HistoricalRangeNotice range={range} latestTimestamp={latest} onReturnToCurrent={() => setQuery({ ...buildPresetRange(24), preset: '24h', historical: null, axis: null, day: null })} />}
    {summary.error ? <QueryError error={summary.error} onRetry={summary.retry} /> : <AnalysisTabs items={GROUPS.map(id => ({ id, label: t(`ux.${id}`) }))} value={group} onChange={tab => setQuery({ tab })} label={t('maps.station_analysis')}>
      {group === 'summary' && <>
        {summary.data?.total_measurements === 0 && <p role="status">{t('ux.noRecords')}</p>}
        <AnalysisCard title={t('ux.trend')} resource={hourly} stationCode={code} rows={hourly.data?.data}><LevelBandChart data={hourly.data?.data} axisMode={axisMode} range={range} /></AnalysisCard>
                <div className="ux-summary-grid"><div><span>{t('ux.latest')}</span><strong>{formatMetric(summary.data?.latest_leq_dbfs, 'leq_dbfs', t)}</strong><small>{bogotaTime(latest, t)}</small></div>
          <div><span>{t('ux.available')}</span><strong>{summary.loading ? '…' : summary.data?.total_measurements == null ? '—' : t.number(summary.data.total_measurements)}</strong><small>{t('maps.measurements')}</small></div></div>
<p className="ux-note">{t('ux.digital')}</p>
      </>}
      {group === 'levels' && <>
        <AnalysisCard title={t('maps.hourly_levels_leq_l10_l90').replace('L10 / L90', 'L10 / L50 / L90')} csvTitle={defaultT('maps.hourly_levels_leq_l10_l90')} resource={hourly} stationCode={code}><LevelBandChart data={hourly.data?.data} axisMode={axisMode} range={range} /></AnalysisCard>
        <div className="ux-chart-grid"><AnalysisCard title={t('maps.daily_profile', { p0: profileDate })} csvTitle={defaultT('maps.daily_profile', { p0: profileDate })} resource={daily} stationCode={code}>
          <label className="dashboard-field">{t('maps.profile_day_bogota_time')}<input className="dashboard-input" type="date" value={profileDate} min={fromDay} max={toDay} onChange={e => setQuery({ day: e.target.value })} /></label><DailyBarChart data={daily.data?.data} />
        </AnalysisCard>
        <AnalysisCard title={getMetric(metric, t).label} info={getMetric(metric, t).description} csvTitle={defaultT('common.time_series_by_metric')} resource={series} stationCode={code} fileLabel={metric} rows={(series.data?.data ?? []).map(row => ({ timestamp: row.recorded_at, [metric]: row.value }))}>
          <label className="dashboard-field" htmlFor="station-metric-selector">{t('common.series_metric')}</label><MetricSelector id="station-metric-selector" value={metric} group="levels" onChange={metric => setQuery({ metric })} />
          <TimeSeriesChart data={series.data?.data} metric={metric} axisMode={axisMode} range={range} /><ResolutionNotice meta={series.data} />
        </AnalysisCard></div>
      </>}
      {group === 'binaural' && <div className="ux-chart-grid">
        <AnalysisCard title={getMetric('ild_db', t).label} info={t('ux.ildHelp')} resource={binaural} stationCode={code} rows={(binaural.data?.data ?? []).map(row => ({ timestamp: row.recorded_at, ild_db: row.ild_db }))}><ILDChart data={binaural.data?.data} axisMode={axisMode} range={range} /><ResolutionNotice meta={binaural.data} /></AnalysisCard>
        {metricCard('interaural_correlation', binaural)}
        <AnalysisCard title={t('ux.channels')} resource={channels} stationCode={code}><TimeSeriesChart data={channels.data?.data} metric="ch_left_dbfs" axisMode={axisMode} range={range} series={[{ dataKey: 'ch_left_dbfs', label: t('ux.left') }, { dataKey: 'ch_right_dbfs', label: t('ux.right') }]} />{channels.data?.metas?.filter((meta, i, all) => all.findIndex(other => formatSeriesMeta(other, t) === formatSeriesMeta(meta, t)) === i).map((meta, i) => <ResolutionNotice key={i} meta={meta} />)}</AnalysisCard>
      </div>}
      {group === 'spectral' && <div className="ux-chart-grid">{['dominant_frequency', 'spectral_centroid', 'spectral_rolloff', 'zero_crossing_rate'].map(key => metricCard(key, spectral))}</div>}
    </AnalysisTabs>}
  </div>
}
