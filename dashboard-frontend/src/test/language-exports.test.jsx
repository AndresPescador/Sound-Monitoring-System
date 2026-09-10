import { useRef } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { LanguageProvider, useLanguage } from '../context/LanguageContext'
import LanguageSwitcher from '../components/shared/LanguageSwitcher'
import { defaultT } from '../i18n/core.mjs'
import { useChartDownload } from '../hooks/useChartDownload'
const api = vi.hoisted(() => ({ stations: vi.fn(), summary: vi.fn(), raw: vi.fn(), allRaw: vi.fn(), hourly: vi.fn() }))
vi.mock('../api/stations', () => ({ getStations: api.stations, getStationSummary: api.summary }))
vi.mock('../api/measurements', () => ({ getRawMeasurements: api.raw, getAllRawMeasurements: api.allRaw }))
vi.mock('../api/aggregations', () => ({ getHourly: api.hourly }))
import OpenData from '../pages/OpenData'

let blobs, downloads
const readBlob = blob => new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsText(blob) })
beforeEach(() => {
  localStorage.clear(); vi.clearAllMocks(); blobs = []; downloads = []
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  vi.stubGlobal('matchMedia', () => ({ matches: true }))
  URL.createObjectURL = vi.fn(blob => { blobs.push(blob); return 'blob:fixture' })
  URL.revokeObjectURL = vi.fn()
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () { downloads.push(this.download) })
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear() })

const rows = [{ recorded_at: '2026-09-09T12:00:00Z', dbfs_level: -30.25, leq_dbfs: -31.5 }]
function ChartExportFixture() {
  const ref = useRef(null), { t } = useLanguage()
  const title = t('common.time_series_by_metric')
  const { downloadSVG, downloadCSV } = useChartDownload(ref, title, rows, 'leq_dbfs', title, 'ST-TEST-01', defaultT('common.time_series_by_metric'))
  return <><LanguageSwitcher /><div ref={ref}><div className="recharts-wrapper"><svg width="400" height="200" viewBox="0 0 400 200"><text>{t('maps.interaural_correlation')}</text></svg></div></div><button onClick={downloadSVG}>SVG</button><button onClick={downloadCSV}>CSV</button></>
}
it('exports the current chart language and retains CSV data and filenames', async () => {
  render(<LanguageProvider><ChartExportFixture /></LanguageProvider>)
  fireEvent.click(screen.getByRole('button', { name: 'CSV', exact: true }))
  const spanishCsv = await readBlob(blobs.at(-1)), spanishFilename = downloads.at(-1)
  fireEvent.click(screen.getByRole('button', { name: 'English' }))
  fireEvent.click(screen.getByRole('button', { name: 'SVG', exact: true }))
  const svg = await readBlob(blobs.at(-1))
  expect(svg).toContain('Time series by metric')
  expect(svg).toContain('Interaural correlation')
  expect(svg).not.toContain('Serie temporal')
  fireEvent.click(screen.getByRole('button', { name: 'CSV', exact: true }))
  expect(await readBlob(blobs.at(-1))).toBe(spanishCsv)
  expect(downloads.at(-1)).toBe(spanishFilename)
  expect(spanishCsv).toContain('2026-09-09T12:00:00Z,-30.25,-31.5')
})
it('translates open-data column headings without refetching or changing downloaded CSV', async () => {
  api.stations.mockResolvedValue({ data: [{ station_code: 'ST-TEST-01', name: 'Estación Sopo' }] })
  api.summary.mockResolvedValue({ data: { latest_recorded_at: rows[0].recorded_at } })
  api.raw.mockResolvedValue({ data: { data: rows, count: 1, total_count: 1, has_more: false } })
  api.allRaw.mockResolvedValue({ data: rows })
  api.hourly.mockResolvedValue({ data: { data: [] } })
  render(<LanguageProvider><LanguageSwitcher /><OpenData /></LanguageProvider>)
  await screen.findByRole('columnheader', { name: 'Fecha y hora (UTC)' })
  await waitFor(() => expect(screen.getByRole('button', { name: /Descargar CSV completo/ })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: /Descargar CSV completo/ }))
  await waitFor(() => expect(blobs).toHaveLength(1))
  const csv = await readBlob(blobs[0]), filename = downloads[0]
  const request = api.raw.mock.calls[0][1]
  fireEvent.click(screen.getByRole('button', { name: 'English' }))
  expect(screen.getByRole('columnheader', { name: 'Date and time (UTC)' })).toBeInTheDocument()
  expect(api.raw).toHaveBeenCalledTimes(1)
  expect(api.summary).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: /Download full CSV/ }))
  await waitFor(() => expect(blobs).toHaveLength(2))
  expect(await readBlob(blobs[1])).toBe(csv)
  expect(downloads[1]).toBe(filename)
  expect(csv).toContain('Fecha y hora (UTC),dBFS nivel (dBFS),Leq ponderado A (dBFS)')
  expect(api.allRaw.mock.calls[1][1]).toEqual({ from: request.from, to: request.to })
})
