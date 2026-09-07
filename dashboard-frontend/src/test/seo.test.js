import { describe, expect, it } from 'vitest'
import { absoluteUrl, routeSeo, siteUrl } from '../seo.mjs'

describe('SEO metadata', () => {
  it('uses the production HTTPS origin and canonical public URLs', () => {
    expect(siteUrl('http://localhost:3000')).toBe('https://soundmonitoring.systems')
    expect(absoluteUrl('/mapa-2d', 'https://soundmonitoring.systems')).toBe('https://soundmonitoring.systems/mapa-2d')
  })

  it('keeps station metadata limited to name and locality', () => {
    const metadata = routeSeo('/mapa-2d/stations/ST-CHAPINERO-01', {
      siteUrl: 'https://soundmonitoring.systems',
      station: {
        name: 'Estación Chapinero',
        locality: 'Chapinero',
        address: 'No debe aparecer',
        latitude: 4.6,
      },
    })

    expect(metadata.title).toContain('Estación Chapinero')
    expect(metadata.description).toContain('Chapinero')
    expect(metadata.description).not.toContain('No debe aparecer')
    expect(metadata.description).not.toContain('4.6')
  })
})
