import { useEffect } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ mounted: vi.fn(), unmounted: vi.fn(), station: { station_code: 'A', name: 'Alpha', locality: 'Bogotá', is_active: true }, fail: false }))
vi.mock('../context/Map3DContext', () => ({ useMap3DContext: () => ({ stations: [state.station], selectedStation: state.station, selectedStationCode: 'A', selectedSummary: {}, setHoveredStationCode: vi.fn(), selectStation: vi.fn() }) }))
vi.mock('../components/map/NoiseTwinMap', () => ({ default: function Map({ onStationScreenPosition }) { state.project = onStationScreenPosition; useEffect(() => { state.mounted(); return state.unmounted }, []); if (state.fail) throw new Error('Synthetic WebGL failure'); return <div data-testid="preserved-map" /> } }))
vi.mock('../components/map3d/Map3DTemporalRail', () => ({ default: () => null }))
vi.mock('../components/shared/PublicPreferences', () => ({ default: () => null }))
import Map3DLayout from '../components/map3d/Map3DLayout'
function Location() { const location = useLocation(); return <output data-testid="location">{location.pathname}{location.search}</output> }
function view() {
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }))
  return render(<MemoryRouter initialEntries={['/mapa-3d/stations/A?tab=binaural&from=2026-01-01T00:00:00Z&to=2026-01-02T00:00:00Z']}><Location /><Routes><Route path="/mapa-3d" element={<Map3DLayout />}><Route path="stations/:code" element={<div>Populated analysis</div>} /></Route></Routes></MemoryRouter>)
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); state.fail = false; vi.clearAllMocks() })
it('returns to the selected map without remounting it and preserves the URL filters', async () => {
  view()
  const dialog = await screen.findByRole('dialog')
  expect(document.querySelector('.ux-map-workspace')).toHaveAttribute('inert')
  expect(dialog).toHaveAttribute('aria-modal', 'true')
  const map = screen.getByTestId('preserved-map')
  act(() => state.project({ x: 150, y: 250 }))
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar panel de análisis' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getByRole('article')).toHaveClass('is-anchored')
  expect(screen.getByTestId('location')).toHaveTextContent('tab=binaural')
  expect(screen.getByTestId('location')).toHaveTextContent('map=1')
  expect(document.querySelector('.ux-map-workspace')).not.toHaveAttribute('inert')
  fireEvent.click(screen.getByRole('button', { name: 'Abrir análisis detallado' }))
  expect(await screen.findByRole('dialog')).toBeInTheDocument()
  expect(screen.getByTestId('location')).not.toHaveTextContent('map=1')
  expect(screen.getByTestId('preserved-map')).toBe(map)
  expect(state.mounted).toHaveBeenCalledTimes(1)
  expect(state.unmounted).not.toHaveBeenCalled()
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
})
it('keeps the equivalent 2D route available after a renderer failure', async () => {
  state.fail = true
  vi.spyOn(console, 'error').mockImplementation(() => {})
  view()
  fireEvent.click(await screen.findByRole('button', { name: 'Cerrar panel de análisis' }))
  expect(screen.getByRole('link', { name: 'Abrir mapa 2D' }).getAttribute('href')).toContain('/mapa-2d/stations/A?tab=binaural')
})
