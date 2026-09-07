export const DEFAULT_SITE_URL = 'https://soundmonitoring.systems'

function normalizeSiteUrl(value = DEFAULT_SITE_URL) {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:') return DEFAULT_SITE_URL
    return url.origin
  } catch {
    return DEFAULT_SITE_URL
  }
}

export function siteUrl(value) {
  return normalizeSiteUrl(value)
}

export function absoluteUrl(pathname, configuredSiteUrl) {
  return new URL(pathname, `${normalizeSiteUrl(configuredSiteUrl)}/`).toString()
}

export function routeSeo(pathname, options = {}) {
  const configuredSiteUrl = normalizeSiteUrl(options.siteUrl)
  const canonical = absoluteUrl(pathname, configuredSiteUrl)
  const stationName = String(options.station?.name ?? '').trim()
  const locality = String(options.station?.locality ?? '').trim()

  const base = {
    canonical,
    image: absoluteUrl('/assets/station-assembly-hero.webp', configuredSiteUrl),
    siteName: 'Sistema de Monitoreo Acústico Binaural',
  }

  if (pathname === '/') {
    return {
      ...base,
      title: 'Sistema de Monitoreo Acústico Binaural | Bogotá D.C.',
      description: 'Sistema de monitoreo acústico binaural para explorar el paisaje sonoro de Bogotá mediante mapas, métricas espaciales y datos abiertos.',
      heading: 'Sistema de Monitoreo Acústico Binaural',
    }
  }
  if (pathname === '/mapa-2d') {
    return {
      ...base,
      title: 'Mapa acústico 2D de Bogotá | Monitoreo Acústico',
      description: 'Explora el mapa acústico 2D de Bogotá y consulta las estaciones activas de la red binaural.',
      heading: 'Mapa acústico 2D de Bogotá',
    }
  }
  if (pathname === '/mapa-3d') {
    return {
      ...base,
      title: 'Mapa acústico 3D de Bogotá | Monitoreo Acústico',
      description: 'Visualiza la red de monitoreo acústico binaural de Bogotá en un mapa urbano tridimensional.',
      heading: 'Mapa acústico 3D de Bogotá',
    }
  }
  if (pathname === '/mapa-2d/data' || pathname === '/mapa-3d/data') {
    return {
      ...base,
      title: 'Datos acústicos abiertos de Bogotá | Monitoreo Acústico',
      description: 'Consulta y descarga datos acústicos agregados de la red binaural de Bogotá.',
      heading: 'Portal de datos acústicos abiertos',
    }
  }
  if (pathname.startsWith('/mapa-2d/stations/')) {
    const displayName = stationName || 'Estación de monitoreo acústico'
    const localityText = locality ? ` en ${locality}, Bogotá` : ' en Bogotá'
    return {
      ...base,
      title: `${displayName} | Monitoreo Acústico de Bogotá`,
      description: `Consulta las métricas acústicas de ${displayName}${localityText}.`,
      heading: displayName,
      locality,
    }
  }

  return {
    ...base,
    title: 'Monitoreo Acústico | Bogotá D.C.',
    description: 'Explora el paisaje sonoro de Bogotá mediante datos abiertos y monitoreo acústico binaural.',
    heading: 'Monitoreo acústico de Bogotá',
  }
}

function setMeta(selector, attributes, content) {
  let element = document.head.querySelector(selector)
  if (!element) {
    element = document.createElement('meta')
    Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value))
    document.head.append(element)
  }
  element.setAttribute('content', content)
}

function setCanonical(url) {
  let element = document.head.querySelector('link[rel="canonical"]')
  if (!element) {
    element = document.createElement('link')
    element.setAttribute('rel', 'canonical')
    document.head.append(element)
  }
  element.setAttribute('href', url)
}

export function applySeoMetadata(metadata) {
  document.title = metadata.title
  setMeta('meta[name="description"]', { name: 'description' }, metadata.description)
  setMeta('meta[property="og:title"]', { property: 'og:title' }, metadata.title)
  setMeta('meta[property="og:description"]', { property: 'og:description' }, metadata.description)
  setMeta('meta[property="og:type"]', { property: 'og:type' }, 'website')
  setMeta('meta[property="og:url"]', { property: 'og:url' }, metadata.canonical)
  setMeta('meta[property="og:image"]', { property: 'og:image' }, metadata.image)
  setMeta('meta[name="twitter:card"]', { name: 'twitter:card' }, 'summary_large_image')
  setCanonical(metadata.canonical)

  const existingRobots = document.head.querySelector('meta[name="robots"]')
  if (existingRobots?.dataset.seoManaged === 'true') existingRobots.remove()
}

export function applyNoIndexMetadata() {
  let robots = document.head.querySelector('meta[name="robots"]')
  if (!robots) {
    robots = document.createElement('meta')
    robots.setAttribute('name', 'robots')
    document.head.append(robots)
  }
  robots.dataset.seoManaged = 'true'
  robots.setAttribute('content', 'noindex, nofollow, noarchive')
}
