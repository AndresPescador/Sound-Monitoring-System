import { useEffect } from 'react'
import { useMap } from 'react-leaflet'
import { useLanguage } from '../../context/LanguageContext'

// Update Leaflet's existing controls in place, retaining the map and open popup.
export default function LocalizedMapControls() {
  const map = useMap()
  const { t } = useLanguage()
  useEffect(() => {
    const update = () => {
      for (const [selector, key] of [
        ['.leaflet-control-zoom-in', 'maps.zoom_in'],
        ['.leaflet-control-zoom-out', 'maps.zoom_out'],
        ['.leaflet-popup-close-button', 'maps.close_popup'],
      ]) {
        map.getContainer().querySelectorAll(selector).forEach(button => {
          button.setAttribute('title', t(key))
          button.setAttribute('aria-label', t(key))
        })
      }
    }
    update()
    map.on('popupopen', update)
    return () => map.off('popupopen', update)
  }, [map, t])
  return null
}
