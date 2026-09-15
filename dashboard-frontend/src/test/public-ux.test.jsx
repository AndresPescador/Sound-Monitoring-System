import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { createTranslator } from '../i18n/core.mjs'
import { getMetric, formatMetric, joinChannels, metricAxis, RAW_METRIC_IDS } from '../components/shared/metricCatalog'
import { bogotaDay, bogotaTime, toDatetimeLocalValue, validPublicRange } from '../components/shared/dateRangeUtils'
import { tickBudget, PointReading } from '../components/charts/MetricPlot'
import ChartInfo from '../components/shared/ChartInfo'
import AnalysisTabs from '../components/shared/AnalysisTabs'
import DateRangePicker from '../components/shared/DateRangePicker'
import useRemoteData from '../hooks/useRemoteData'
import { useState } from 'react'
const en = createTranslator('en')
const api = vi.hoisted(() => ({ stations: vi.fn(), summary: vi.fn(), hourly: vi.fn(), daily: vi.fn(), measurement: vi.fn(), binaural: vi.fn(), spectral: vi.fn(), compare: vi.fn(), compareRaw: vi.fn(), locality: vi.fn() }))
vi.mock('../api/stations', () => ({ getStations: api.stations, getStationSummary: api.summary }))
vi.mock('../api/aggregations', () => ({ getHourly: api.hourly, getDailyProfile: api.daily }))
vi.mock('../api/measurements', () => ({ getMeasurements: api.measurement, getBinaural: api.binaural, getSpectral: api.spectral, getCompareMeasurements: api.compare, getCompareMeasurementsRaw: api.compareRaw }))
vi.mock('../api/compare', () => ({ getCompare: api.locality }))
import StationAnalysis from '../components/analysis/StationAnalysis'
import Compare from '../pages/Compare'
const now = '2026-09-14T12:00:00Z'
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  api.stations.mockResolvedValue({ data: [{ station_code: 'A', name: 'Alpha', locality: 'Bogotá' }] })
  api.summary.mockResolvedValue({ data: { name: 'Alpha', total_measurements: 1, latest_leq_dbfs: -30, latest_recorded_at: now, is_active: true } })
  api.hourly.mockResolvedValue({ data: { data: [] } })
  api.daily.mockResolvedValue({ data: { data: [] } })
  api.measurement.mockResolvedValue({ data: { data: [] } })
  api.binaural.mockResolvedValue({ data: { data: [] } })
  api.spectral.mockResolvedValue({ data: { data: [] } })
  api.compare.mockResolvedValue({ data: { series: [] } })
  api.compareRaw.mockResolvedValue({ data: { series: [] } })
  api.locality.mockResolvedValue({ data: { series: [] } })
})
afterEach(() => vi.unstubAllGlobals())

describe('metric presentation contracts', () => {
  it('covers every raw and hourly unit without converting missing values to zero', () => {
    expect(RAW_METRIC_IDS).toHaveLength(11)
    for (const id of RAW_METRIC_IDS) {
      expect(getMetric(id, en).label).not.toContain('_')
      for (const missing of [null, undefined, '', NaN]) expect(formatMetric(missing, id, en)).toBe('—')
    }
    expect(formatMetric(-30.25, 'leq_dbfs', en)).toBe('-30.3 dBFS')
    expect(formatMetric(0, 'ild_db', en)).toBe('0.0 dB')
    expect(formatMetric(.98765, 'interaural_correlation', en)).toBe('0.988')
    expect(formatMetric(.0000234567, 'rms_energy', en)).toBe('0.00002346')
    expect(formatMetric(.123456, 'zero_crossing_rate', en)).toBe('0.1235')
    for (const id of ['dominant_frequency', 'spectral_centroid', 'spectral_rolloff', 'avg_spectral_centroid', 'avg_spectral_rolloff']) expect(getMetric(id).unit).toBe('Hz')
    for (const id of ['l10', 'l50', 'l90', 'dbfs_avg', 'dbfs_max', 'dbfs_min']) expect(getMetric(id).unit).toBe('dBFS')
    expect(getMetric('dominant_frequency').csvKey).toBe('dominant_frequency_hz')
    expect(getMetric('spectral_centroid').csvKey).toBe('spectral_centroid_hz')
    expect(metricAxis('spectral_rolloff', en).tickFormatter(8050)).toBe('8.05k')
    expect(formatMetric(.98765, 'avg_interaural_corr', en)).toBe('0.988')
    expect(formatMetric(1.234, 'avg_ild_db', en)).toBe('1.2 dB')
    expect(formatMetric(.01234567, 'avg_zero_crossing_rate', en)).toBe('0.01235')
    expect(getMetric('avg_interaural_corr').domain).toEqual([-1, 1])
    expect(metricAxis('ild_db').domain([-2, 7])).toEqual([-7, 7])
    expect(formatMetric(3, 'measurement_count', en)).toBe('3')
  })
  it('joins channel timestamps chronologically, keeps zero and preserves missing channels', () => {
    const result = joinChannels([{ recorded_at: '2026-09-14T10:00:00Z', value: 0 }, { recorded_at: '2026-09-14T10:02:00Z', value: -30 }], [{ recorded_at: '2026-09-14T05:00:00-05:00', value: -20 }, { recorded_at: '2026-09-14T10:01:00Z', value: -25 }])
    expect(result.map(r => [r.ch_left_dbfs, r.ch_right_dbfs])).toEqual([[0, -20], [null, -25], [-30, null]])
  })
  it('uses Bogotá dates independently of the browser zone and bounds query ranges', () => {
    expect(bogotaDay('2026-09-14T03:00:00Z')).toBe('2026-09-13')
    expect(toDatetimeLocalValue('2026-09-14T03:00:00Z')).toBe('2026-09-13T22:00')
    expect(bogotaTime('2026-09-14T03:00:00Z', en, { date: false })).toBe('22:00')
    expect(validPublicRange(now, '2026-10-15T12:00:00Z')).toBe(true)
    expect(validPublicRange(now, '2026-10-16T12:00:00Z')).toBe(false)
    expect(validPublicRange('oops', now)).toBe(false)
    expect(tickBudget(320, true)).toBe(2)
    expect(tickBudget(1000, false)).toBe(10)
  })
})
it('opens and closes metric help with click and Escape while retaining focus', () => {
  render(<ChartInfo text="Metric explanation" />)
  const button = screen.getByRole('button')
  fireEvent.click(button)
  expect(screen.getByRole('note')).toHaveTextContent('Metric explanation')
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(screen.queryByRole('note')).not.toBeInTheDocument()
  expect(button).toHaveFocus()
})
it('supports keyboard tabs and point navigation with a table alternative', () => {
  function Probe() {
    const [tab, setTab] = useState('a'), [index, setIndex] = useState(0)
    return <AnalysisTabs items={[{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }]} value={tab} onChange={setTab} label="Groups"><PointReading data={[{ t: now, v: -30 }, { t: '2026-09-14T13:00:00Z', v: 0 }]} columns={[{ key: 'v', label: 'Leq', metric: 'leq_dbfs' }]} index={index} onIndex={setIndex} /></AnalysisTabs>
  }
  render(<Probe />)
  fireEvent.keyDown(screen.getByRole('tab', { name: 'A' }), { key: 'ArrowRight' })
  expect(screen.getByRole('tab', { name: 'B' })).toHaveFocus()
  fireEvent.click(screen.getByRole('button', { name: 'Punto siguiente' }))
  expect(screen.getByRole('status')).toHaveTextContent('0,0 dBFS')
  fireEvent.click(screen.getByText('Ver tabla de puntos representados'))
  const detail = screen.getByText('Ver tabla de puntos representados').parentElement
  detail.open = true
  fireEvent(detail, new Event('toggle'))
  expect(screen.getByRole('table')).toBeInTheDocument()
})
it('interprets custom range input as Bogotá and emits UTC', () => {
  const onChange = vi.fn()
  render(<DateRangePicker onChange={onChange} value={{ from: now, to: now }} />)
  fireEvent.click(screen.getByRole('button', { name: 'Personalizado' }))
  fireEvent.change(screen.getByLabelText('Fecha y hora inicial'), { target: { value: '2026-09-14T07:00' } })
  fireEvent.change(screen.getByLabelText('Fecha y hora final'), { target: { value: '2026-09-14T08:00' } })
  fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))
  expect(onChange).toHaveBeenCalledWith({ from: '2026-09-14T12:00:00.000Z', to: '2026-09-14T13:00:00.000Z' }, { type: 'custom' })
})
it('ignores out-of-order responses and exposes retry independently', async () => {
  let firstResolve
  const first = new Promise(resolve => { firstResolve = resolve })
  const fetcher = vi.fn(key => key === 'a' ? first : Promise.resolve('new'))
  function Probe({ id }) { const state = useRemoteData(id, () => fetcher(id)); return <div>{state.loading ? 'loading' : state.data}</div> }
  const view = render(<Probe id="a" />)
  await waitFor(() => expect(fetcher).toHaveBeenCalledWith('a'))
  view.rerender(<Probe id="b" />)
  await screen.findByText('new')
  await act(async () => firstResolve('old'))
  expect(screen.queryByText('old')).not.toBeInTheDocument()
})
function LocationProbe() { const location = useLocation(), navigate = useNavigate(); return <><output data-testid="url">{location.search}</output><button onClick={() => navigate(-1)}>Back</button></> }
function stationView(entry = '/mapa-2d/stations/A?from=2026-09-13T12:00:00Z&to=2026-09-14T12:00:00Z') {
  return render(<MemoryRouter initialEntries={[entry]}><LocationProbe /><Routes><Route path="/mapa-2d/stations/:code" element={<StationAnalysis />} /></Routes></MemoryRouter>)
}
it('loads only the active station group, preserves range in the URL and handles Back', async () => {
  stationView()
  await waitFor(() => expect(api.hourly).toHaveBeenCalled())
  expect(api.spectral).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('tab', { name: 'Espectro' }))
  await waitFor(() => expect(api.spectral).toHaveBeenCalledTimes(1))
  expect(screen.getByTestId('url')).toHaveTextContent('tab=spectral')
  expect(screen.getByTestId('url')).toHaveTextContent('2026-09-13')
  fireEvent.click(screen.getByRole('button', { name: 'Back' }))
  await waitFor(() => expect(screen.getByRole('tab', { name: 'Resumen' })).toHaveAttribute('aria-selected', 'true'))
})
it('shows a query error and unknown status rather than inactive, and retries', async () => {
  api.summary.mockRejectedValueOnce({ response: { status: 503 } })
  stationView()
  expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos consultar')
  expect(screen.getByText(/Estado no disponible/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
  await waitFor(() => expect(api.hourly).toHaveBeenCalled())
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})
it('disables exports when measurements are absent', async () => {
  stationView()
  await waitFor(() => expect(api.hourly).toHaveBeenCalled())
  expect(screen.getByRole('button', { name: 'Exportar gráfica' })).toBeDisabled()
})
it('comparison defaults to three named stations and only loads exact points on demand', async () => {
  api.stations.mockResolvedValue({ data: ['D', 'B', 'A', 'C'].map(id => ({ station_code: id, name: id, locality: id })) })
  render(<MemoryRouter><Compare /></MemoryRouter>)
  await waitFor(() => expect(api.compare).toHaveBeenCalled())
  expect(api.compare.mock.calls.at(-1)[0].stations).toBe('A,B,C')
  expect(api.locality).not.toHaveBeenCalled()
  expect(api.compareRaw).not.toHaveBeenCalled()
  const detail = screen.getByText('Ver detalle de mediciones').parentElement
  detail.open = true
  fireEvent(detail, new Event('toggle'))
  await waitFor(() => expect(api.compareRaw).toHaveBeenCalled())
  expect(api.compareRaw.mock.calls.at(-1)[0].raw_limit).toBe(3000)
  fireEvent.click(screen.getByRole('tab', { name: 'Por localidad' }))
  await waitFor(() => expect(api.locality).toHaveBeenCalled())
})

it('keeps historical presets anchored across the shared station groups', async () => {
  api.summary.mockResolvedValue({ data: { name: 'Alpha', latest_recorded_at: '2026-01-01T12:00:00Z', total_measurements: 20 } })
  stationView('/mapa-2d/stations/A')
  await waitFor(() => expect(api.hourly).toHaveBeenCalled())
  expect(api.hourly.mock.calls.at(-1)[1].to).toBe('2026-01-01T12:00:00.000Z')
  fireEvent.click(screen.getByRole('tab', { name: 'Espectro' }))
  await waitFor(() => expect(api.spectral).toHaveBeenCalled())
  expect(api.spectral.mock.calls.at(-1)[1].to).toBe('2026-01-01T12:00:00.000Z')
  const details = document.querySelector('.ux-filters'); details.open = true
  fireEvent(details, new Event('toggle'))
  fireEvent.click(screen.getByRole('button', { name: '7d' }))
  await waitFor(() => expect(api.spectral.mock.calls.at(-1)[1].from).toBe('2025-12-25T12:00:00.000Z'))
})

it('resynchronizes custom date drafts and preset buttons when URL values change', () => {
  const first = { from: '2026-09-14T12:00:00Z', to: '2026-09-15T12:00:00Z' }
  const props = { onChange: vi.fn() }
  const view = render(<DateRangePicker {...props} value={first} preset="24h" />)
  fireEvent.click(screen.getByRole('button', { name: 'Personalizado' }))
  fireEvent.change(screen.getByLabelText('Fecha y hora inicial'), { target: { value: '2026-01-01T00:00' } })
  view.rerender(<DateRangePicker {...props} value={{ from: '2026-09-15T06:00:00Z', to: first.to }} preset="6h" />)
  expect(screen.getByRole('button', { name: '6h' })).toHaveAttribute('aria-pressed', 'true')
  fireEvent.click(screen.getByRole('button', { name: 'Personalizado' }))
  expect(screen.getByLabelText('Fecha y hora inicial')).toHaveValue('2026-09-15T01:00')
})

it('allows a station list link to navigate and never calls an unknown status inactive', async () => {
  const { default: StationCard } = await import('../components/cards/StationCard')
  render(<MemoryRouter><Routes><Route path="/" element={<StationCard station={{ station_code: 'A', name: 'Alpha' }} />} /><Route path="/mapa-2d/stations/A" element={<h1>Station reached</h1>} /></Routes></MemoryRouter>)
  expect(screen.getByRole('link')).toHaveTextContent('Estado no disponible')
  expect(screen.getByRole('link')).not.toHaveTextContent('Inactiva')
  fireEvent.click(screen.getByRole('link'))
  expect(await screen.findByText('Station reached')).toBeInTheDocument()
})

it('closes help with Escape without closing the containing analysis panel', () => {
  const closeParent = vi.fn()
  render(<div onKeyDown={closeParent}><ChartInfo text="Help in panel" /></div>)
  fireEvent.click(screen.getByRole('button'))
  fireEvent.keyDown(screen.getByRole('button'), { key: 'Escape' })
  expect(screen.queryByRole('note')).not.toBeInTheDocument()
  expect(closeParent).not.toHaveBeenCalled()
})

it('applies an axis change immediately when reduced motion is enabled', async () => {
  const { default: useChartAxisTransition } = await import('../hooks/useChartAxisTransition')
  vi.stubGlobal('matchMedia', () => ({ matches: true }))
  function Probe({ mode }) { const { renderedAxisMode, phase } = useChartAxisTransition(mode); return <output>{renderedAxisMode}:{phase}</output> }
  const view = render(<Probe mode="range" />)
  view.rerender(<Probe mode="data" />)
  expect(screen.getByRole('status')).toHaveTextContent('data:idle')
})
