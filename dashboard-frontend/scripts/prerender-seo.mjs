import { mkdir, readFile, writeFile, access } from 'node:fs/promises'
import { constants } from 'node:fs'
import path from 'node:path'
import { absoluteUrl, routeSeo, siteUrl } from '../src/seo.mjs'

const DIST_DIR = path.resolve('dist')
const SNAPSHOT_PATH = path.resolve(process.env.SEO_SNAPSHOT_FILE || '.seo-snapshot/stations.json')
const REQUIRE_SNAPSHOT = process.env.SEO_REQUIRE_SNAPSHOT === '1'
const SITE_URL = siteUrl(process.env.SEO_SITE_URL)
const MAX_STATIONS = 500
const STATION_CODE_PATTERN = /^[A-Za-z0-9_-]{1,64}$/

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function escapeJsonForHtml(value) {
  return JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029')
}

async function loadStations() {
  try {
    await access(SNAPSHOT_PATH, constants.R_OK)
  } catch {
    if (REQUIRE_SNAPSHOT) throw new Error('SEO snapshot is required but was not generated.')
    return []
  }

  const parsed = JSON.parse(await readFile(SNAPSHOT_PATH, 'utf8'))
  if (!parsed || !Array.isArray(parsed.stations) || parsed.stations.length > MAX_STATIONS) {
    throw new Error('SEO snapshot has an invalid station catalog.')
  }

  const codes = new Set()
  return parsed.stations.map((station) => {
    if (!station || typeof station !== 'object' || Object.keys(station).length !== 3) {
      throw new Error('SEO snapshot contains an unexpected station field.')
    }
    const stationCode = String(station.station_code ?? '')
    const name = String(station.name ?? '').trim()
    const locality = String(station.locality ?? '').trim()
    if (!STATION_CODE_PATTERN.test(stationCode) || !name || !locality || name.length > 160 || locality.length > 100 || codes.has(stationCode)) {
      throw new Error('SEO snapshot contains invalid station data.')
    }
    codes.add(stationCode)
    return { station_code: stationCode, name, locality }
  })
}

function jsonLd(metadata, pathname) {
  const page = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: metadata.title,
    description: metadata.description,
    url: metadata.canonical,
    isPartOf: { '@type': 'WebSite', name: metadata.siteName, url: absoluteUrl('/', SITE_URL) },
  }
  if (pathname === '/') {
    return {
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'WebSite', name: metadata.siteName, url: metadata.canonical, inLanguage: 'es-CO' },
        page,
      ],
    }
  }
  return page
}

function fallbackMarkup(metadata, station) {
  const locality = station?.locality ? `<p>Ubicada en ${escapeHtml(station.locality)}, Bogotá D.C.</p>` : ''
  return `<main id="main-content"><h1>${escapeHtml(metadata.heading)}</h1>${locality}<p>${escapeHtml(metadata.description)}</p><p><a href="/">Sistema de Monitoreo Acústico Binaural de Bogotá</a></p></main>`
}

function renderPage(template, pathname, station) {
  const metadata = routeSeo(pathname, { siteUrl: SITE_URL, station })
  const head = [
    `<meta name="description" content="${escapeHtml(metadata.description)}">`,
    `<link rel="canonical" href="${escapeHtml(metadata.canonical)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:title" content="${escapeHtml(metadata.title)}">`,
    `<meta property="og:description" content="${escapeHtml(metadata.description)}">`,
    `<meta property="og:url" content="${escapeHtml(metadata.canonical)}">`,
    `<meta property="og:image" content="${escapeHtml(metadata.image)}">`,
    '<meta name="twitter:card" content="summary_large_image">',
    `<script type="application/ld+json">${escapeJsonForHtml(jsonLd(metadata, pathname))}</script>`,
  ].join('\n    ')

  return template
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(metadata.title)}</title>`)
    .replace(/\s*<meta name="description"[^>]*>/i, '')
    .replace('</head>', `    ${head}\n  </head>`)
    .replace('<div id="root"></div>', `<div id="root">${fallbackMarkup(metadata, station)}</div>`)
}

async function writePage(relativePath, contents) {
  const target = path.join(DIST_DIR, relativePath)
  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, contents, 'utf8')
}

function sitemap(urls) {
  const entries = urls.map((url) => `  <url><loc>${escapeHtml(url)}</loc></url>`).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`
}

async function main() {
  const template = await readFile(path.join(DIST_DIR, 'index.html'), 'utf8')
  const stations = await loadStations()
  const fixedPages = [
    ['index.html', '/'],
    ['mapa-2d/index.html', '/mapa-2d'],
    ['mapa-3d/index.html', '/mapa-3d'],
    ['mapa-2d/data/index.html', '/mapa-2d/data'],
  ]
  const urls = []

  for (const [file, pathname] of fixedPages) {
    await writePage(file, renderPage(template, pathname))
    urls.push(absoluteUrl(pathname, SITE_URL))
  }
  for (const station of stations) {
    const pathname = `/mapa-2d/stations/${encodeURIComponent(station.station_code)}`
    await writePage(`mapa-2d/stations/${station.station_code}/index.html`, renderPage(template, pathname, station))
    urls.push(absoluteUrl(pathname, SITE_URL))
  }

  await writePage('sitemap.xml', sitemap(urls))
  await writePage('robots.txt', `User-agent: *\nDisallow: /admin/\nDisallow: /auth/\nDisallow: /ingest/\nDisallow: /processing/\nDisallow: /dashboard/\nSitemap: ${absoluteUrl('/sitemap.xml', SITE_URL)}\n`)
  process.stdout.write(`Generated ${urls.length} public SEO pages.\n`)
}

main().catch((error) => {
  process.stderr.write(`SEO prerender failed: ${error.message}\n`)
  process.exitCode = 1
})
