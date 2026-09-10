import LocalizedMapControls from '../map/LocalizedMapControls'
import { useLanguage } from '../../context/LanguageContext'
import { useEffect } from 'react'
import { CircleMarker, MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import { useTheme } from '../../context/ThemeContext'

const INITIAL_VIEW = { center: [4.67, -74.08], zoom: 11 }
const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY
const TILE_URLS = MAPTILER_KEY
  ? {
      light: `https://api.maptiler.com/maps/streets-v2-light/256/{z}/{x}/{y}.png?key=${MAPTILER_KEY}`,
      dark: `https://api.maptiler.com/maps/streets-v2-dark/256/{z}/{x}/{y}.png?key=${MAPTILER_KEY}`,
    }
  : {
      light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
      dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    }

const validCoordinates = (latitude, longitude) => (
  Number.isFinite(latitude) && Number.isFinite(longitude)
  && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180
)

function MapClickHandler({ onPick }) {
  useMapEvents({ click: event => onPick(event.latlng.lat, event.latlng.lng) })
  return null
}

function MapViewport({ latitude, longitude }) {
  const map = useMap()

  useEffect(() => {
    if (validCoordinates(latitude, longitude)) {
      map.flyTo([latitude, longitude], Math.max(map.getZoom(), 14), { animate: true, duration: 0.45 })
    }
  }, [latitude, longitude, map])

  return null
}

export default function StationLocationPicker({ latitude, longitude, onPick }) {
  const { t } = useLanguage()
  const { isDark } = useTheme()
  const parsedLatitude = Number.parseFloat(latitude)
  const parsedLongitude = Number.parseFloat(longitude)
  const hasLocation = validCoordinates(parsedLatitude, parsedLongitude)

  return (
    <div className="admin-location-picker">
      <div className="admin-location-picker__heading">
        <div>
          <h3>{t('admin.locate_the_station_on_the_map')}</h3>
          <p>{t('admin.click_the_installation_point_you_can_also_enter_the')}</p>
        </div>
        <output className="admin-location-picker__status" aria-live="polite">
          {hasLocation ? t('admin.selected_location') : t('admin.location_pending')}
        </output>
      </div>
      <MapContainer
        center={INITIAL_VIEW.center}
        zoom={INITIAL_VIEW.zoom}
        className="admin-location-picker__map"
        scrollWheelZoom
        aria-label={t('admin.map_for_selecting_the_station_location')}
      >
        <LocalizedMapControls />
        <TileLayer url={TILE_URLS.light} opacity={isDark ? 0 : 1} zIndex={1} />
        <TileLayer url={TILE_URLS.dark} opacity={isDark ? 1 : 0} zIndex={2} />
        <MapClickHandler onPick={onPick} />
        <MapViewport latitude={parsedLatitude} longitude={parsedLongitude} />
        {hasLocation && (
          <CircleMarker
            center={[parsedLatitude, parsedLongitude]}
            radius={11}
            pathOptions={{ color: '#1d4ed8', fillColor: '#2563eb', fillOpacity: 0.92, weight: 3 }}
          />
        )}
      </MapContainer>
    </div>
  )
}
