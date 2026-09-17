import { describe, expect, it } from 'vitest'
import { absoluteUrl, routeSeo, routeStructuredData, siteUrl } from '../seo.mjs'

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

  it('describes the research project, author and research groups on the landing page', () => {
    const metadata = routeSeo('/', { siteUrl: 'https://soundmonitoring.systems' })
    const structured = routeStructuredData('/', metadata, 'https://soundmonitoring.systems')
    const byType = (type) => structured['@graph'].filter(item => item['@type'] === type)
    const project = byType('ResearchProject')[0]
    const author = byType('Person')[0]
    const groups = byType('ResearchOrganization')
    const page = byType('WebPage')[0]

    expect(project.creator).toEqual({ '@id': 'https://soundmonitoring.systems/#author' })
    expect(project.parentOrganization).toEqual([
      { '@id': 'https://soundmonitoring.systems/#multiad' },
      { '@id': 'https://soundmonitoring.systems/#giira' },
    ])
    expect(author.name).toBe('Carlos Andres Pescador Castro')
    expect(author.sameAs).toContain('https://github.com/AndresPescador')
    expect(author).not.toHaveProperty('email')
    expect(groups).toHaveLength(2)
    expect(groups.map(group => group.alternateName)).toEqual(['MULTIAD', 'GIIRA'])
    expect(groups.map(group => group.logo)).toEqual([
      'https://soundmonitoring.systems/assets/logo-multiad.png',
      'https://soundmonitoring.systems/assets/logo-giira.png',
    ])
    expect(page.mainEntity).toEqual({ '@id': 'https://soundmonitoring.systems/#research-project' })
  })
})
