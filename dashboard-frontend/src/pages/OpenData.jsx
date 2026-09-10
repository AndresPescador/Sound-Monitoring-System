import { defaultT } from '../i18n/core.mjs'
import { useLanguage } from '../context/LanguageContext'
import { useState, useEffect, useRef } from 'react'
import { format, parseISO } from 'date-fns'
import { getStationSummary, getStations }    from '../api/stations'
import { getRawMeasurements, getAllRawMeasurements } from '../api/measurements'
import { getHourly }       from '../api/aggregations'
import DateRangePicker     from '../components/shared/DateRangePicker'
import LoadingSpinner      from '../components/shared/LoadingSpinner'
import { buildPresetRange, DEFAULT_RANGE_HOURS, formatDateTime, hasRecentData } from '../components/shared/dateRangeUtils'
import { HistoricalRangeNotice, NoMeasurementsNotice } from '../components/shared/RangeAvailabilityNotice'

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmtDate = (iso, t = defaultT) => {
  try { return format(parseISO(iso), "d MMM yyyy HH:mm", { locale: t.dateLocale }) }
  catch { return iso }
}

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
    <div ref={regionRef} className="dashboard-data-table-region">
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
                  {c.label}
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
                        ? t.fixed(row[c.key], 4)
                        : row[c.key] ?? t('common.no_reading')}
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

// ── Página principal ──────────────────────────────────────────────────────────
export default function OpenData({ onStationChange, embedded3D = false } = {}) {
  const { t } = useLanguage()
  const RAW_PAGE_SIZE = 1000
  const [stations,   setStations]   = useState([])
  const [station,    setStation]    = useState('')
  const [summary,    setSummary]    = useState(null)
  const [tab,        setTab]        = useState('raw')   // 'raw' | 'hourly'
  const [rawData,    setRawData]    = useState([])
  const [rawMeta,    setRawMeta]    = useState(null)
  const [hourlyData, setHourlyData] = useState([])
  const [loading,    setLoading]    = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [range,      setRange]      = useState(() => buildPresetRange(DEFAULT_RANGE_HOURS))
  const [rangePreset, setRangePreset] = useState('24h')
  const [rangeState, setRangeState] = useState({ initialized: false, historical: false, anchorTimestamp: null })

  useEffect(() => {
    getStations().then(r => {
      setStations(r.data)
      if (r.data.length) {
        setStation(r.data[0].station_code)
        onStationChange?.(r.data[0].station_code)
      }
      if (!r.data.length) setRangeState({ initialized: true, historical: false, anchorTimestamp: null })
    })
  }, [onStationChange])

  useEffect(() => {
    if (!station) return undefined
    let active = true
    setSummary(null)
    setRangeState({ initialized: false, historical: false, anchorTimestamp: null })
    setRangePreset('24h')
    setRange(buildPresetRange(DEFAULT_RANGE_HOURS))

    getStationSummary(station)
      .then(response => {
        if (!active) return
        const nextSummary = response.data
        const latestTimestamp = nextSummary.latest_recorded_at
        const historical = latestTimestamp && !hasRecentData(latestTimestamp, DEFAULT_RANGE_HOURS)
        setSummary(nextSummary)
        setRange(historical ? buildPresetRange(DEFAULT_RANGE_HOURS, latestTimestamp) : buildPresetRange(DEFAULT_RANGE_HOURS))
        setRangeState({
          initialized: true,
          historical: Boolean(historical),
          anchorTimestamp: historical ? latestTimestamp : null,
        })
      })
      .catch(() => {
        if (!active) return
        setRangeState({ initialized: true, historical: false, anchorTimestamp: null })
      })

    return () => { active = false }
  }, [station])

  useEffect(() => {
    if (station) onStationChange?.(station)
  }, [onStationChange, station])

  useEffect(() => {
    if (!station || !rangeState.initialized) return
    setLoading(true)
    setRawData([])
    setRawMeta(null)
    const params = { from: range.from, to: range.to, limit: RAW_PAGE_SIZE }
    Promise.all([
      getRawMeasurements(station, params),
      getHourly(station, { from: range.from, to: range.to }),
    ])
      .then(([m, h]) => {
        setRawData(m.data.data)
        setRawMeta(m.data)
        setHourlyData(h.data.data)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [station, range, rangeState.initialized])

  const handleLoadMore = async () => {
    if (!rawMeta?.has_more || loadingMore) return
    setLoadingMore(true)
    try {
      const response = await getRawMeasurements(station, {
        from: range.from,
        to: range.to,
        limit: RAW_PAGE_SIZE,
        cursor: rawMeta.next_cursor,
      })
      setRawData(current => [...current, ...response.data.data])
      setRawMeta(response.data)
    } catch {
      // La tabla conserva la página ya cargada si falla la siguiente.
    } finally {
      setLoadingMore(false)
    }
  }

  const handleDownload = async () => {
    if (!station) return
    const isRaw     = tab === 'raw'
    const fromLabel = range.from.slice(0, 10)
    const toLabel   = range.to.slice(0, 10)
    const filename  = `${station}_${isRaw ? 'mediciones' : 'agregaciones'}_${fromLabel}_${toLabel}.csv`
    setExporting(true)
    try {
      const rows = isRaw
        ? (await getAllRawMeasurements(station, { from: range.from, to: range.to })).data
        : hourlyData
      downloadCSV(toCSV(rows, isRaw ? RAW_COLS(defaultT) : AGG_COLS(defaultT)), filename)
    } catch {
      // No se borra la tabla si una descarga completa falla.
    } finally {
      setExporting(false)
    }
  }

  const activeRows = tab === 'raw' ? rawData : hourlyData
  const activeCols = tab === 'raw' ? RAW_COLS(t) : AGG_COLS(t)
  const activeTotal = tab === 'raw' ? (rawMeta?.total_count ?? rawData.length) : hourlyData.length
  const loadMoreControl = tab === 'raw' && rawMeta?.has_more ? (
    <button
      type="button"
      onClick={handleLoadMore}
      disabled={loadingMore}
      className="dashboard-load-more-button"
    >
      {loadingMore ? t('common.loading_more_records') : t('common.load_more_of', { p0: rawData.length.toLocaleString(t.locale), p1: rawMeta.total_count.toLocaleString(t.locale) })}
    </button>
  ) : null

  const handleRangeChange = (nextRange, metadata) => {
    setRange(nextRange)
    setRangePreset(metadata?.type === 'preset' ? metadata.label : '')
    setRangeState(current => ({
      ...current,
      initialized: true,
      historical: metadata?.type === 'preset' && current.historical,
      anchorTimestamp: metadata?.type === 'preset' && current.historical ? current.anchorTimestamp : null,
    }))
  }

  return (
    <div className="dashboard-page dashboard-open-data-page">
      <header className="dashboard-open-data-intro">
        <div>
            {embedded3D ? <h2>{t('common.open_data_portal')}</h2> : <h1 tabIndex={-1}>{t('common.open_data_portal')}</h1>}
          <p>{t('common.acoustic_data_from_the_bogota_d_c_binaural_monitoring')}</p>
        </div>
        <span className="dashboard-open-data-badge">{t('common.open_data_free_to_use')}</span>
      </header>

      {/* Controles */}
      <div className="dashboard-controls">

        {/* Selector de estación */}
        <div className="dashboard-field">
          <label htmlFor="open-data-station">{t('admin.station_2')}</label>
          <select
            id="open-data-station"
            value={station}
            onChange={e => setStation(e.target.value)}
            className="dashboard-select"
          >
            {stations.map(s => (
              <option key={s.station_code} value={s.station_code}>
                {s.name} ({s.locality})
              </option>
            ))}
          </select>
        </div>

        <div className="dashboard-field">
          <label>{t('common.time_range')}</label>
          <DateRangePicker
            value={range}
            preset={rangePreset}
            anchorTimestamp={rangeState.anchorTimestamp}
            isHistoricalRange={rangeState.historical}
            onChange={handleRangeChange}
          />
        </div>
      </div>

      {rangeState.historical && (
        <HistoricalRangeNotice
          range={range}
          latestTimestamp={summary?.latest_recorded_at}
          onReturnToCurrent={() => {
            setRange(buildPresetRange(DEFAULT_RANGE_HOURS))
            setRangePreset('24h')
            setRangeState({ initialized: true, historical: false, anchorTimestamp: null })
          }}
        />
      )}

      {summary?.latest_recorded_at && (
        <p className="dashboard-open-data-last-update">{t('common.latest_available_measurement') + ' '}{formatDateTime(summary.latest_recorded_at, t)}
        </p>
      )}

      {rangeState.initialized && summary?.total_measurements === 0 && (
        <NoMeasurementsNotice>{t('common.this_station_has_no_recorded_measurements_to_download_yet')}</NoMeasurementsNotice>
      )}

      {/* Tabs + botón descarga */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="dashboard-tabs" role="tablist" aria-label={t('common.data_type')}>
          {[
            { key: 'raw',    label: t('common.raw_measurements', { p0: activeTotal.toLocaleString(t.locale) }) },
            { key: 'hourly', label: t('common.hourly_aggregations', { p0: hourlyData.length }) },
          ].map(t => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`dashboard-tab ${tab === t.key ? 'dashboard-tab--active' : ''}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={handleDownload}
          disabled={!activeRows.length || exporting}
          className="dashboard-download-button"
        >
          <svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          {exporting ? t('common.preparing_full_download') : t('common.download_full_csv_rows', { p0: activeTotal.toLocaleString(t.locale) })}
        </button>
      </div>

      <div className="dashboard-open-data-note">
        <strong>{t('common.about_these_data')}</strong>{' ' + t('common.the_selected_range_is_queried_in_utc_and_acoustic')}</div>

      {stations.length > 0
        ? <DataTable
            columns={activeCols}
            rows={activeRows}
            loading={loading}
            totalCount={activeTotal}
            footer={loadMoreControl}
          />
        : <NoMeasurementsNotice>{t('common.no_stations_available_to_query')}</NoMeasurementsNotice>}

    </div>
  )
}
