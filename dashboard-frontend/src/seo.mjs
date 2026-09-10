import { defaultT } from './i18n/core.mjs'
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

export function routeSeo(pathname, options = {}, t = defaultT) {
  const configuredSiteUrl = normalizeSiteUrl(options.siteUrl)
  const canonical = absoluteUrl(pathname, configuredSiteUrl)
  const stationName = String(options.station?.name ?? '').trim()
  const locality = String(options.station?.locality ?? '').trim()

  const base = {
    canonical,
    image: absoluteUrl('/assets/station-assembly-hero.webp', configuredSiteUrl),
    siteName: t('landing.binaural_acoustic_monitoring_system'),
  }

  if (pathname === '/') {
    return {
      ...base,
      title: t('seo.binaural_acoustic_monitoring_system_bogota_d_c'),
      description: t('seo.binaural_acoustic_monitoring_system_for_exploring_bogota_s_soundscape'),
      heading: t('landing.binaural_acoustic_monitoring_system'),
    }
  }
  if (pathname === '/mapa-2d') {
    return {
      ...base,
      title: t('seo.bogota_2d_acoustic_map_acoustic_monitoring'),
      description: t('seo.explore_bogota_s_2d_acoustic_map_and_check_active'),
      heading: t('seo.bogota_2d_acoustic_map'),
    }
  }
  if (pathname === '/mapa-3d') {
    return {
      ...base,
      title: t('seo.bogota_3d_acoustic_map_acoustic_monitoring'),
      description: t('seo.view_bogota_s_binaural_acoustic_monitoring_network_on_a'),
      heading: t('seo.bogota_3d_acoustic_map'),
    }
  }
  if (pathname === '/mapa-2d/data' || pathname === '/mapa-3d/data') {
    return {
      ...base,
      title: t('seo.bogota_open_acoustic_data_acoustic_monitoring'),
      description: t('seo.browse_and_download_aggregated_acoustic_data_from_bogota_s'),
      heading: t('seo.open_acoustic_data_portal'),
    }
  }
  if (pathname.startsWith('/mapa-2d/stations/')) {
    const displayName = stationName || t('seo.acoustic_monitoring_station')
    const localityText = locality ? ' ' + t('seo.in_bogota', { p0: locality }) : ' ' + t('seo.in_bogota_2')
    return {
      ...base,
      title: t('seo.bogota_acoustic_monitoring', { p0: displayName }),
      description: t('seo.explore_acoustic_metrics_for', { p0: displayName, p1: localityText }),
      heading: displayName,
      locality,
    }
  }

  return {
    ...base,
    title: t('seo.acoustic_monitoring_bogota_d_c'),
    description: t('seo.explore_bogota_s_soundscape_through_open_data_and_binaural'),
    heading: t('seo.bogota_acoustic_monitoring_2'),
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
