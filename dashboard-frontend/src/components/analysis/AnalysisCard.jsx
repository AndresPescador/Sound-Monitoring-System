import { useRef, useState, useLayoutEffect } from 'react'
import { useLanguage } from '../../context/LanguageContext'
import { useChartDownload } from '../../hooks/useChartDownload'
import ChartInfo from '../shared/ChartInfo'
import ChartDownloadMenu from '../shared/ChartDownloadMenu'
import ChartSkeleton from '../shared/ChartSkeleton'

export function QueryError({ error, onRetry }) {
  const { t } = useLanguage()
  return <div className="dashboard-error" role="alert"><p>{t(error?.response?.status === 404 ? 'ux.notFound' : 'ux.error')}</p><button type="button" className="dashboard-button dashboard-button--secondary" onClick={onRetry}>{t('ux.retry')}</button></div>
}
export default function AnalysisCard({ title, info, resource, rows, stationCode, csvTitle, fileLabel = '', children }) {
  const { t } = useLanguage()
  const ref = useRef(null)
  const previousHeight = useRef(480)
  useLayoutEffect(() => {
    if (resource?.loading || !ref.current) return
    const measure = () => { previousHeight.current = ref.current?.getBoundingClientRect().height || 480 }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [resource?.loading, children])
  const [downloading, setDownloading] = useState(false)
  const [exportError, setExportError] = useState(false)
  const data = rows ?? resource?.data?.data ?? []
  const download = useChartDownload(ref, title, data, fileLabel, title, stationCode, csvTitle ?? title)
  const run = async action => { setDownloading(true); setExportError(false); try { await action() } catch { setExportError(true) } finally { setDownloading(false) } }
  const hasValues = data.some(row => Object.entries(row).some(([key, value]) => !['source_count', 'hour', 'measurement_count'].includes(key) && typeof value === 'number' && Number.isFinite(value)))
  return <section className="dashboard-section-card ux-analysis-card" ref={ref} style={resource?.loading ? { minHeight: previousHeight.current } : undefined}>
    <div className="dashboard-section-card__heading"><h2>{title}{info && <ChartInfo text={info} />}</h2>
      <ChartDownloadMenu disabled={resource?.loading || Boolean(resource?.error) || !hasValues} downloading={downloading} onPNG={() => run(download.downloadPNG)} onSVG={() => run(download.downloadSVG)} onCSV={data.length ? () => run(download.downloadCSV) : undefined} />
    </div>
    {exportError && <p role="alert">{t('ux.downloadError')}</p>}
    {resource?.loading ? <ChartSkeleton height={260} /> : resource?.error ? <QueryError error={resource.error} onRetry={resource.retry} /> : children}
  </section>
}
