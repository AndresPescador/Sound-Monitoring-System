import { useEffect } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'
import { stationPageTitle } from '../../routes'

const PUBLIC_TITLE = 'Monitoreo Acústico'
const LANDING_TITLE = 'Sistema de Monitoreo Acústico Binaural | Bogotá D.C.'

function isAdminPath(pathname) {
  return pathname === '/admin' || pathname.startsWith('/admin/')
}

function routeTitle(pathname, heading = '') {
  if (pathname === '/') return LANDING_TITLE
  if (pathname === '/mapa-2d') return 'Mapa 2D | Monitoreo Acústico'
  if (pathname.startsWith('/mapa-2d/stations/')) {
    return `${heading ? stationPageTitle(heading) : 'Detalle de estación'} | ${PUBLIC_TITLE}`
  }
  if (pathname === '/mapa-2d/compare') return 'Comparar estaciones | Monitoreo Acústico'
  if (pathname === '/mapa-2d/data') return 'Datos abiertos | Monitoreo Acústico'
  if (pathname === '/mapa-3d/data') return 'Datos abiertos en el mapa 3D | Monitoreo Acústico'
  if (pathname.startsWith('/mapa-3d/stations/')) {
    return `${heading ? stationPageTitle(heading) : 'Estación en el mapa 3D'} | ${PUBLIC_TITLE}`
  }
  if (pathname.startsWith('/mapa-3d')) return 'Mapa acústico 3D | Monitoreo Acústico'
  return 'Monitoreo Acústico | Bogotá D.C.'
}

function findMainHeading() {
  return document.querySelector('#main-content h1')
}

export default function RouteNavigationManager() {
  const location = useLocation()
  const navigationType = useNavigationType()

  useEffect(() => {
    if (isAdminPath(location.pathname)) return undefined

    document.title = routeTitle(location.pathname)
    if (navigationType === 'POP') return undefined

    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })

    let observer
    let timeoutId
    const focusHeading = () => {
      const heading = findMainHeading()
      if (!heading) return false
      heading.focus({ preventScroll: true })
      document.title = routeTitle(location.pathname, heading.textContent.trim())
      return true
    }

    const frameId = window.requestAnimationFrame(() => {
      if (focusHeading()) return
      const main = document.getElementById('main-content')
      if (!main || typeof MutationObserver === 'undefined') return
      observer = new MutationObserver(() => {
        if (focusHeading()) observer.disconnect()
      })
      observer.observe(main, { childList: true, subtree: true, characterData: true })
      timeoutId = window.setTimeout(() => observer?.disconnect(), 3000)
    })

    return () => {
      window.cancelAnimationFrame(frameId)
      observer?.disconnect()
      window.clearTimeout(timeoutId)
    }
  }, [location.key, location.pathname, navigationType])

  return null
}
