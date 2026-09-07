import { readFile } from 'node:fs/promises'

const dockerfile = await readFile('Dockerfile', 'utf8')
const dockerignore = await readFile('.dockerignore', 'utf8')
const allowedPublicVariables = new Set(['VITE_API_URL', 'VITE_MAPTILER_KEY', 'VITE_SITE_URL'])

if (!dockerignore.split(/\r?\n/).includes('.env')) {
  throw new Error('The frontend Docker context must exclude .env files.')
}

for (const line of dockerfile.split(/\r?\n/)) {
  const match = line.match(/^\s*(?:ARG|ENV)\s+(VITE_[A-Z0-9_]+)/)
  if (match && !allowedPublicVariables.has(match[1])) {
    throw new Error(`Unexpected public frontend variable: ${match[1]}`)
  }
  if (/^\s*(?:ARG|ENV)\s+.*(?:SECRET|PASSWORD|JWT|DATABASE_URL)/i.test(line)) {
    throw new Error('Frontend Dockerfile must not receive secret-bearing build variables.')
  }
}
