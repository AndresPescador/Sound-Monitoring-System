import AnalysisFilters from '../components/shared/AnalysisFilters'
import { defaultT } from '../i18n/core.mjs'
import { useLanguage } from '../context/LanguageContext'
import { useState, useEffect, useRef } from 'react'
import usePublicQuery, { queryRange, defaultRange, historicalAnchor } from '../hooks/usePublicQuery'
import useRemoteData from '../hooks/useRemoteData'
import { QueryError } from '../components/analysis/AnalysisCard'
import { bogotaTime, validPublicRange } from '../components/shared/dateRangeUtils'
import { formatMetric } from '../components/shared/metricCatalog'
import AnalysisTabs from '../components/shared/AnalysisTabs'
import { getStationSummary, getStations }    from '../api/stations'
import { getRawMeasurements, getAllRawMeasurements } from '../api/measurements'
import { getHourly }       from '../api/aggregations'
import DateRangePicker     from '../components/shared/DateRangePicker'
import LoadingSpinner      from '../components/shared/LoadingSpinner'
import { buildPresetRange, hasRecentData } from '../components/shared/dateRangeUtils'
import { HistoricalRangeNotice } from '../components/shared/RangeAvailabilityNotice'

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmtDate = (iso, t = defaultT) => bogotaTime(iso, t, { seconds: true })

const toCSV = (rows, columns) => {
  const header = columns.map(c => c.label).join(',')
  const body   = rows.map(row =>
    columns.map(c => {
      const v = row[c.key]
      if (v == null) return ''
      const value = String(v)
      return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value
    }).join(',')
  )
  return [header, ...body].join('\n')
}

const downloadCSV = (content, filename) => {
  const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ── Columnas de cada tabla ────────────────────────────────────────────────────
const RAW_COLS = (t = defaultT) => ([
  { key: 'recorded_at',           label: t('common.date_and_time_utc') },
  { key: 'dbfs_level',            label: t('common.dbfs_level_dbfs') },
  { key: 'leq_dbfs',              label: t('common.a_weighted_leq_dbfs') },
  { key: 'rms_energy',            label: t('maps.rms_energy') },
  { key: 'ch_left_dbfs',          label: t('common.left_channel_dbfs') },
  { key: 'ch_right_dbfs',         label: t('common.right_channel_dbfs') },
  { key: 'ild_db',                label: 'ILD (dB)' },
  { key: 'interaural_correlation',label: t('maps.interaural_correlation') },
  { key: 'dominant_frequency',    label: t('common.dominant_freq_hz') },
  { key: 'spectral_centroid',     label: t('common.spectral_centroid_hz') },
  { key: 'spectral_rolloff',      label: t('common.spectral_rolloff_hz') },
  { key: 'zero_crossing_rate',    label: t('common.zero_crossing_rate') },
])

const AGG_COLS = (t = defaultT) => ([
  { key: 'hour_start',        label: t('common.start_hour_utc') },
  { key: 'leq_hour',          label: t('common.hourly_leq_dbfs') },
  { key: 'l10',               label: 'L10 (dBFS)' },
  { key: 'l50',               label: 'L50 (dBFS)' },
  { key: 'l90',               label: 'L90 (dBFS)' },
  { key: 'dbfs_min',          label: t('common.min_dbfs') },
  { key: 'dbfs_max',          label: t('common.max_dbfs') },
  { key: 'dbfs_avg',          label: t('common.avg_dbfs') },
  { key: 'measurement_count', label: t('maps.measurements') },
])

// ── Componente de tabla ───────────────────────────────────────────────────────
function DataTable({ columns, rows, loading, totalCount, footer = null }) {
  const { t } = useLanguage()
  const [view, setView] = useState('cards')
  const [cardPage, setCardPage] = useState(0)
  const page = Math.min(cardPage, Math.max(0, Math.ceil(rows.length / 50) - 1))
  const regionRef = useRef(null)
  const tableWrapRef = useRef(null)
  const horizontalScrollRef = useRef(null)
  const horizontalScrollContentRef = useRef(null)

  useEffect(() => {
    const tableWrap = tableWrapRef.current
    const horizontalScrollContent = horizontalScrollContentRef.current
    if (!tableWrap || !horizontalScrollContent) return undefined

    const syncScrollbarWidth = () => {
      horizontalScrollContent.style.width = `${tableWrap.scrollWidth}px`
      if (horizontalScrollRef.current) {
        horizontalScrollRef.current.scrollLeft = tableWrap.scrollLeft
      }
    }

    syncScrollbarWidth()
    const observer = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(syncScrollbarWidth)
      : null
    observer?.observe(tableWrap)
    window.addEventListener('resize', syncScrollbarWidth)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', syncScrollbarWidth)
    }
  }, [columns.length, rows.length])

  const findScrollContainer = (element) => {
    let current = element?.parentElement
    while (current && current !== document.body) {
      const styles = window.getComputedStyle(current)
      if (/(auto|scroll)/.test(styles.overflowY) && current.scrollHeight > current.clientHeight) {
        return current
      }
      current = current.parentElement
    }
    return document.scrollingElement || document.documentElement
  }

  const scrollToDataPosition = (position) => {
    const region = regionRef.current
    if (!region || typeof window === 'undefined') return
    const container = findScrollContainer(region)
    const toolbar = region.querySelector('.dashboard-data-table__toolbar')
    const toolbarOffset = toolbar
      ? Number.parseFloat(window.getComputedStyle(toolbar).top) || 0
      : 0
    const isDocumentScroll = container === document.documentElement || container === document.body
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const containerRect = container.getBoundingClientRect()
    const regionRect = region.getBoundingClientRect()
    const currentScrollTop = isDocumentScroll ? window.scrollY : container.scrollTop
    const viewportTop = isDocumentScroll
      ? toolbarOffset + 8
      : containerRect.top + toolbarOffset + 8
    const viewportBottom = isDocumentScroll
      ? window.innerHeight - 8
      : containerRect.bottom - 8
    const targetTop = position === 'start'
      ? currentScrollTop + regionRect.top - viewportTop
      : currentScrollTop + regionRect.bottom - viewportBottom
    const scrollHeight = isDocumentScroll
      ? Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight ?? 0)
      : container.scrollHeight
    const viewportHeight = isDocumentScroll ? window.innerHeight : container.clientHeight
    const maxScrollTop = Math.max(0, scrollHeight - viewportHeight)
    const clampedTop = Math.min(maxScrollTop, Math.max(0, targetTop))
    const scrollOptions = { top: clampedTop, behavior: reducedMotion ? 'auto' : 'smooth' }

    if (isDocumentScroll) {
      window.scrollTo(scrollOptions)
    } else {
      container.scrollTo(scrollOptions)
    }
  }

  const syncTableHorizontalScroll = (source) => {
    const tableWrap = tableWrapRef.current
    const horizontalScroll = horizontalScrollRef.current
    if (!tableWrap || !horizontalScroll) return
    if (source === 'table') horizontalScroll.scrollLeft = tableWrap.scrollLeft
    if (source === 'mirror') tableWrap.scrollLeft = horizontalScroll.scrollLeft
  }

  if (loading) return <LoadingSpinner />
  if (!rows.length) return (
    <p className="dashboard-empty-state">{t('common.no_data_in_the_selected_range')}</p>
  )

  return (
    <div ref={regionRef} className={`dashboard-data-table-region ux-data-view--${view}`}>
      <div className="ux-data-view-control"><button type="button" className="dashboard-button dashboard-button--secondary" onClick={() => setView(view === 'cards' ? 'table' : 'cards')}>{t(view === 'cards' ? 'ux.viewTable' : 'ux.viewCards')}</button></div>
      <div className="ux-data-cards">{rows.slice(page * 50, (page + 1) * 50).map((row, index) => <details key={index}>
        <summary><strong>{fmtDate(row.recorded_at ?? row.hour_start, t)}</strong><span>Leq: {formatMetric(row.leq_dbfs ?? row.leq_hour, 'leq_dbfs', t)} · {t('maps.dbfs_level')}: {formatMetric(row.dbfs_level ?? row.dbfs_avg, 'dbfs_level', t)}</span></summary>
        <dl>{columns.filter(c => !['recorded_at', 'hour_start'].includes(c.key)).map(c => <div key={c.key}><dt>{c.label}</dt><dd>{formatMetric(row[c.key], c.key, t)}</dd></div>)}</dl>
      </details>)}{rows.length > 50 && <div className="ux-point-controls"><button type="button" aria-label={t('ux.previousPage')} disabled={page === 0} onClick={() => setCardPage(page - 1)}>←</button><span>{page + 1} / {Math.ceil(rows.length / 50)}</span><button type="button" aria-label={t('ux.nextPage')} disabled={(page + 1) * 50 >= rows.length} onClick={() => setCardPage(page + 1)}>→</button></div>}</div>
      <div className="dashboard-data-table__toolbar" role="group" aria-label={t('common.quick_record_navigation')}>
        <span>{t('common.visible_records')}</span>
        <div className="dashboard-data-table__quick-nav">
          <button type="button" className="dashboard-data-jump-button" onClick={() => scrollToDataPosition('start')}>{t('common.go_to_start')}</button>
          <button type="button" className="dashboard-data-jump-button" onClick={() => scrollToDataPosition('end')}>{t('common.go_to_end')}</button>
        </div>
      </div>
      <div ref={tableWrapRef} className="dashboard-data-table-wrap" onScroll={() => syncTableHorizontalScroll('table')}>
        <table className="dashboard-data-table">
          <thead>
            <tr className="bg-surface border-b border-border">
              {columns.map(c => (
                <th key={c.key}>
                  {['recorded_at', 'hour_start'].includes(c.key) ? t('ux.time') : c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                {columns.map(c => (
                  <td key={c.key}>
                    {c.key.endsWith('_at') || c.key === 'hour_start'
                      ? fmtDate(row[c.key], t)
                      : typeof row[c.key] === 'number'
                        ? formatMetric(row[c.key], c.key, t, false)
                        : row[c.key] ?? '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="dashboard-data-table__count">
          {rows.length.toLocaleString(t.locale)}{' ' + t('common.loaded_records')}{totalCount > rows.length ? ` de ${totalCount.toLocaleString(t.locale)}` : ''}
        </p>
      </div>
      {footer}
      <div
        ref={horizontalScrollRef}
        className="dashboard-data-horizontal-scrollbar"
        role="region"
        aria-label={t('common.horizontal_table_scrolling')}
        tabIndex={0}
        onScroll={() => syncTableHorizontalScroll('mirror')}
      >
        <div ref={horizontalScrollContentRef} aria-hidden="true" />
      </div>
    </div>
  )
}

// The presentation can change without changing the full CSV contract.
export default function OpenData({ onStationChange, embedded3D = false } = {}) {
  const { t } = useLanguage()
  const { get, setQuery } = usePublicQuery('data_')
  const [fallbackRange] = useState(defaultRange)
  const stations = useRemoteData('data-stations', signal => getStations({ signal }).then(r => r.data))
  const station = (stations.data ?? []).some(s => s.station_code === get('station')) ? get('station') : stations.data?.[0]?.station_code ?? ''
  const summary = useRemoteData(`data-summary:${station}`, signal => getStationSummary(station, { signal }).then(r => r.data), Boolean(station))
  const latest = summary.data?.latest_recorded_at
  const explicit = validPublicRange(get('from'), get('to'))
  const automaticHistorical = !explicit && latest && !hasRecentData(latest, 24)
  const historical = Boolean(automaticHistorical || (explicit && get('historical') && historicalAnchor(get, latest)))
  const implicit = automaticHistorical ? buildPresetRange(24, latest) : fallbackRange
  const range = queryRange(get, implicit)
  const tab = get('tab') === 'hourly' ? 'hourly' : 'raw'
  const key = `${station}:${range.from}:${range.to}:${tab}`
  const [pages, setPages] = useState({ key: '', rows: [], meta: null })
  const [loadingMore, setLoadingMore] = useState(false)
  const [moreError, setMoreError] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState(false)
  const [progress, setProgress] = useState(null)
  const currentKey = useRef(key)
  currentKey.current = key
  const exportController = useRef(null)
  const resource = useRemoteData(`data:${key}`, signal => (tab === 'raw' ? getRawMeasurements(station, { ...range, limit: 1000 }, { signal }) : getHourly(station, range, { signal })).then(r => r.data), Boolean(station) && !summary.loading)
  const rows = [...(resource.data?.data ?? []), ...(pages.key === key ? pages.rows : [])]
  const meta = pages.key === key && pages.meta ? pages.meta : resource.data
  const total = meta?.total_count ?? rows.length
  const columns = tab === 'raw' ? RAW_COLS(t) : AGG_COLS(t)
  useEffect(() => { if (station) onStationChange?.(station) }, [station, onStationChange])
  useEffect(() => {
    setPages({ key, rows: [], meta: null }); setMoreError(false); setExportError(false); setProgress(null); setLoadingMore(false); setExporting(false)
    return () => exportController.current?.abort()
  }, [key])
  const loadMore = async () => {
    if (!meta?.has_more || loadingMore) return
    const requestedKey = key
    setLoadingMore(true); setMoreError(false)
    try {
      const response = await getRawMeasurements(station, { ...range, limit: 1000, cursor: meta.next_cursor })
      if (currentKey.current !== requestedKey) return
      setPages(current => ({ key, rows: [...(current.key === key ? current.rows : []), ...response.data.data], meta: response.data }))
    } catch { if (currentKey.current === requestedKey) setMoreError(true) }
    finally { if (currentKey.current === requestedKey) setLoadingMore(false) }
  }
  const handleDownload = async () => {
    if (!station || !rows.length || exporting) return
    const requestedKey = key
    const controller = new AbortController()
    exportController.current = controller
    setExporting(true); setExportError(false); setProgress(null)
    try {
      const allRows = tab === 'raw' ? (await getAllRawMeasurements(station, range, value => { if (currentKey.current === requestedKey) setProgress(value) }, { signal: controller.signal })).data : rows
      if (controller.signal.aborted || currentKey.current !== requestedKey) return
      downloadCSV(toCSV(allRows, tab === 'raw' ? RAW_COLS(defaultT) : AGG_COLS(defaultT)), `${station}_${tab === 'raw' ? 'mediciones' : 'agregaciones'}_${range.from.slice(0, 10)}_${range.to.slice(0, 10)}.csv`)
    } catch { if (!controller.signal.aborted && currentKey.current === requestedKey) setExportError(true) }
    finally { if (currentKey.current === requestedKey) setExporting(false) }
  }
  useEffect(() => {
    if (station && !summary.loading && (!explicit || get('station') !== station)) setQuery({ ...range, station, ...(explicit ? {} : { preset: '24h', historical: automaticHistorical ? latest : null }) }, true)
  }, [station, summary.loading, explicit, range.from, range.to])
  const applyRange = (value, metadata) => setQuery({ ...value, preset: metadata?.label ?? null, historical: metadata?.label && historical ? historicalAnchor(get, latest) : null })
  const footer = meta?.has_more ? <button type="button" className="dashboard-load-more-button" disabled={loadingMore} onClick={loadMore}>{loadingMore ? t('common.loading_more_records') : t('common.load_more_of', { p0: t.number(rows.length), p1: t.number(total) })}</button> : null
  return <div className="dashboard-page dashboard-open-data-page">
    <header className="dashboard-open-data-intro"><div>{embedded3D ? <h2>{t('common.open_data_portal')}</h2> : <h1 tabIndex={-1}>{t('common.open_data_portal')}</h1>}<p>{t('common.acoustic_data_from_the_bogota_d_c_binaural_monitoring')}</p></div></header>
    {stations.error ? <QueryError error={stations.error} onRetry={stations.retry} /> : stations.loading ? <LoadingSpinner /> : !stations.data?.length ? <p role="status">{t('ux.noStations')}</p> : <>
      <label className="dashboard-field" htmlFor="open-data-station">{t('admin.station_2')}<select id="open-data-station" className="dashboard-select" value={station} onChange={e => setQuery({ station: e.target.value })}>{stations.data.map(s => <option key={s.station_code} value={s.station_code}>{s.name} ({s.locality})</option>)}</select></label>
      <AnalysisFilters><summary><strong>{t('ux.filters')}</strong><span>{t('ux.period')}: {bogotaTime(range.from, t)} – {bogotaTime(range.to, t)}</span></summary><div className="ux-filter-content"><DateRangePicker value={range} preset={explicit ? get('preset', '') : '24h'} onChange={applyRange} isHistoricalRange={Boolean(historical)} anchorTimestamp={historical ? historicalAnchor(get, latest) : null} /></div></AnalysisFilters>
      {summary.error && <QueryError error={summary.error} onRetry={summary.retry} />}
      {historical && <HistoricalRangeNotice range={range} latestTimestamp={latest} onReturnToCurrent={() => setQuery({ ...buildPresetRange(24), preset: '24h', historical: null })} />}
      <AnalysisTabs items={[{ id: 'raw', label: t('common.raw_measurements', { p0: tab === 'raw' ? t.number(total) : '—' }) }, { id: 'hourly', label: t('common.hourly_aggregations', { p0: tab === 'hourly' ? t.number(total) : '—' }) }]} value={tab} onChange={tab => setQuery({ tab })} label={t('common.data_type')}>
        <button type="button" onClick={handleDownload} disabled={!rows.length || exporting || resource.loading} className="dashboard-download-button">{exporting ? t('common.preparing_full_download') : t('common.download_full_csv_rows', { p0: t.number(total) })}</button>
        {progress && <p role="status">{t('ux.downloadProgress', progress)}</p>}{exportError && <p role="alert">{t('ux.downloadError')}</p>}
        <p className="ux-note">{t('ux.csvUtc')}</p>
        {resource.error ? <QueryError error={resource.error} onRetry={resource.retry} /> : <DataTable key={key} columns={columns} rows={rows} loading={resource.loading} totalCount={total} footer={footer} />}
        {moreError && <p role="alert">{t('ux.moreError')}</p>}
      </AnalysisTabs>
    </>}
  </div>
}
