import { useLanguage } from '../../context/LanguageContext'
import { useEffect } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'
import { applyNoIndexMetadata, applySeoMetadata, routeSeo, siteUrl } from '../../seo.mjs'

const SITE_URL = siteUrl(import.meta.env.VITE_SITE_URL)

function isAdminPath(pathname) {
  return pathname === '/admin' || pathname.startsWith('/admin/')
}

function findMainHeading() {
  return document.querySelector('#main-content h1')
}

export default function RouteNavigationManager() {
  const { t } = useLanguage()
  const location = useLocation()
  const navigationType = useNavigationType()

  useEffect(() => {
    if (isAdminPath(location.pathname)) {
      document.title = `${t('admin.administration_panel')} | ${t('admin.acoustic_monitoring')}`
      applyNoIndexMetadata()
      return
    }
    applySeoMetadata(routeSeo(location.pathname, { siteUrl: SITE_URL }, t))
  }, [location.pathname, t])

  useEffect(() => {
    if (isAdminPath(location.pathname)) {
      applyNoIndexMetadata()
      return undefined
    }

    if (navigationType === 'POP') return undefined

    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })

    let observer
    let timeoutId
    const focusHeading = () => {
      const heading = findMainHeading()
      if (!heading) return false
      heading.focus({ preventScroll: true })
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
