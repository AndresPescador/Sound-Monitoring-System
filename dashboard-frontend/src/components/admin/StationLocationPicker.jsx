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
  const { isDark } = useTheme()
  const parsedLatitude = Number.parseFloat(latitude)
  const parsedLongitude = Number.parseFloat(longitude)
  const hasLocation = validCoordinates(parsedLatitude, parsedLongitude)

  return (
    <div className="admin-location-picker">
      <div className="admin-location-picker__heading">
        <div>
          <h3>Ubica la estación en el mapa</h3>
          <p>Haz clic en el punto de instalación. También puedes escribir las coordenadas debajo.</p>
        </div>
        <output className="admin-location-picker__status" aria-live="polite">
          {hasLocation ? 'Ubicación seleccionada' : 'Pendiente de ubicación'}
        </output>
      </div>
      <MapContainer
        center={INITIAL_VIEW.center}
        zoom={INITIAL_VIEW.zoom}
        className="admin-location-picker__map"
        scrollWheelZoom
        aria-label="Mapa para seleccionar la ubicación de la estación"
      >
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
