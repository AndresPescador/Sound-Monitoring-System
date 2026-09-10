import { useEffect, forwardRef } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { LanguageProvider, useLanguage } from '../context/LanguageContext'
import LanguageSwitcher from '../components/shared/LanguageSwitcher'

const state = vi.hoisted(() => ({ deckProps: null, mapProps: null, deckMounts: 0, mapMounts: 0, stations: vi.fn(), summary: vi.fn() }))
vi.mock('../context/ThemeContext', () => ({ useTheme: () => ({ isDark: false }) }))
vi.mock('@deck.gl/react', () => ({ default: props => {
  state.deckProps = props
  useEffect(() => { state.deckMounts++ }, [])
  return <div data-testid="deck">{props.children}</div>
} }))
vi.mock('react-map-gl/maplibre', () => ({ default: forwardRef((props, ref) => {
  state.mapProps = props
  useEffect(() => { state.mapMounts++ }, [])
  return <div data-testid="base-map" ref={ref} />
}) }))
vi.mock('maplibre-gl', () => ({ default: {} }))
vi.mock('../api/stations', () => ({ getStations: state.stations, getStationSummary: state.summary }))
import NoiseTwinMap from '../components/map/NoiseTwinMap'
import { Map3DProvider, useMap3DContext } from '../context/Map3DContext'

const fixture = [{ station_code: 'ST-TEST-01', name: 'Estación Sopo', locality: 'Sopo', latitude: 4.7, longitude: -74.1, current_leq_dbfs: -32.5 }]
const select = vi.fn()
beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); state.deckMounts = 0; state.mapMounts = 0 })
afterEach(() => localStorage.clear())

it('keeps the 3D camera target, GPU layers and map style while translating controls', async () => {
  render(<LanguageProvider><LanguageSwitcher /><NoiseTwinMap stations={fixture} selectedStationCode="ST-TEST-01" onSelectStation={select} /></LanguageProvider>)
  await waitFor(() => expect(state.deckProps.initialViewState.zoom).toBe(15.8))
  const layers = state.deckProps.layers, camera = state.deckProps.initialViewState, style = state.mapProps.mapStyle
  const map = screen.getByTestId('base-map')
  fireEvent.click(screen.getByRole('button', { name: 'English' }))
  expect(screen.getByRole('button', { name: 'Reset angle' })).toBeInTheDocument()
  expect(state.deckProps.layers).toBe(layers)
  expect(state.deckProps.initialViewState).toBe(camera)
  expect(state.mapProps.mapStyle).toBe(style)
  expect(screen.getByTestId('base-map')).toBe(map)
  expect(state.deckMounts).toBe(1)
  expect(state.mapMounts).toBe(1)
  expect(select).not.toHaveBeenCalled()
  const tooltip = state.deckProps.getTooltip({ object: { ...fixture[0], current_leq_dbfs: null }, layer: { id: 'stations-points' } })
  expect(tooltip.text).toContain('No recent reading')
  expect(tooltip.text).toContain('Estación Sopo')
})

function Snapshot() {
  const { selectedStationCode, selectedSummary, stationsError } = useMap3DContext()
  const { t } = useLanguage()
  return <><LanguageSwitcher /><span>{selectedStationCode}</span><span>{selectedSummary?.name}</span>{stationsError && <p role="alert">{t(stationsError)}</p>}</>
}
it('preserves selection and cached data without new requests on language change', async () => {
  state.stations.mockResolvedValue({ data: fixture })
  state.summary.mockResolvedValue({ data: fixture[0] })
  render(<LanguageProvider><MemoryRouter initialEntries={['/mapa-3d/stations/ST-TEST-01']}><Map3DProvider><Snapshot /></Map3DProvider></MemoryRouter></LanguageProvider>)
  await screen.findByText('Estación Sopo')
  expect(state.stations).toHaveBeenCalledTimes(1)
  expect(state.summary).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: 'English' }))
  expect(screen.getByText('ST-TEST-01')).toBeInTheDocument()
  expect(state.stations).toHaveBeenCalledTimes(1)
  expect(state.summary).toHaveBeenCalledTimes(1)
})
