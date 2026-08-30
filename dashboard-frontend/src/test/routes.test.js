import { describe, expect, it } from 'vitest'
import { map2DStationPath, map3DStationPath, ROUTES, stationPageTitle } from '../routes'

describe('route helpers', () => {
  it('keeps the public route contract and encodes station codes', () => {
    expect(ROUTES.map2D).toBe('/mapa-2d')
    expect(map2DStationPath('ST-CHAPINERO/01')).toBe('/mapa-2d/stations/ST-CHAPINERO%2F01')
    expect(map3DStationPath('ST USAQUEN 01')).toBe('/mapa-3d/stations/ST%20USAQUEN%2001')
  })

  it('normalizes station titles without duplicating the Estación prefix', () => {
    expect(stationPageTitle('Estación Chapinero')).toBe('Estación Chapinero')
    expect(stationPageTitle('Usaquén')).toBe('Estación Usaquén')
    expect(stationPageTitle(null)).toBe('Estación seleccionada')
  })
})
