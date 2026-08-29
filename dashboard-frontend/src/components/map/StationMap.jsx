import { useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, CircleMarker, GeoJSON, Popup, Tooltip, useMap } from 'react-leaflet'
import { useNavigate } from 'react-router-dom'
import { map2DStationPath } from '../../routes'
import { useTheme } from '../../context/ThemeContext'

// Encuadre inicial: prioriza la zona urbana y la red de estaciones de Bogotá.
const BOGOTA_VIEW = { center: [4.67, -74.08], zoom: 12 }
const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY
const TILE_URLS = MAPTILER_KEY
  ? {
      light: `https://api.maptiler.com/maps/streets-v2-light/256/{z}/{x}/{y}.png?key=${MAPTILER_KEY}`,
      dark: `https://api.maptiler.com/maps/streets-v2-dark/256/{z}/{x}/{y}.png?key=${MAPTILER_KEY}`,
    }
  : {
      // Permite levantar el frontend sin .env local; producción usa MapTiler.
      light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
      dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    }
const TILE_ATTRIBUTION = MAPTILER_KEY
  ? '&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
const BOGOTA_BOUNDARY_URL = '/bogota-municipio.geojson'

const NOISE_COLOR = {
  low:    '#16a34a',
  moderate: '#d97706',
  high:   '#dc2626',
}

function BogotaBoundary({ isDark }) {
  const [boundary, setBoundary] = useState(null)

  useEffect(() => {
    const controller = new AbortController()

    fetch(BOGOTA_BOUNDARY_URL, { signal: controller.signal })
      .then(response => response.ok ? response.json() : null)
      .then(data => {
        if (data) setBoundary(data)
      })
      .catch(() => undefined)

    return () => controller.abort()
  }, [])

  if (!boundary) return null

  return (
    <GeoJSON
      data={boundary}
      interactive={false}
      style={{
        color: isDark ? '#93c5fd' : '#2563eb',
        weight: 2.5,
        opacity: 0.92,
        dashArray: '7 8',
        lineCap: 'round',
        fill: false,
      }}
    />
  )
}

function MapSelectionController({ station }) {
  const map = useMap()

  useEffect(() => {
    if (!station) return

    map.flyTo([station.latitude, station.longitude], 15, {
      animate: true,
      duration: 0.8,
    })
  }, [map, station?.station_code, station?.latitude, station?.longitude])

  return null
}

function MapZoomGuide({ onVisibilityChange }) {
  const map = useMap()

  useEffect(() => {
    const updateVisibility = () => onVisibilityChange(map.getZoom() <= BOGOTA_VIEW.zoom)

    updateVisibility()
    map.on('zoomend', updateVisibility)

    return () => map.off('zoomend', updateVisibility)
  }, [map, onVisibilityChange])

  return null
}

function StationMarker({ station, isHovered, isSelected, onSelect, navigate }) {
  const markerRef = useRef(null)
  const color = NOISE_COLOR[station.noise_level] ?? '#94a3b8'

  useEffect(() => {
    if (isSelected) markerRef.current?.openPopup()
  }, [isSelected])

  return (
    <CircleMarker
      ref={markerRef}
      center={[station.latitude, station.longitude]}
      radius={isSelected ? 12 : 10}
      pathOptions={{ color, fillColor: color, fillOpacity: 0.85, weight: isSelected ? 3 : 2 }}
      eventHandlers={{ click: () => onSelect?.(station.station_code) }}
    >
      {isHovered && !isSelected && (
        <Tooltip
          permanent
          direction="top"
          offset={[0, -10]}
          opacity={1}
          className="dashboard-map-label"
        >
          <strong>{station.name}</strong>
          <span>{station.locality}</span>
          <span>
            Leq: <strong>{station.current_leq_dbfs != null ? `${station.current_leq_dbfs.toFixed(1)} dBFS` : 'Sin dato reciente'}</strong>
          </span>
        </Tooltip>
      )}
      <Popup eventHandlers={{ remove: () => onSelect?.(null) }}>
        <div className="dashboard-map-popup">
          <p className="dashboard-map-popup__name">{station.name}</p>
          <p className="dashboard-map-popup__meta">{station.locality}</p>
          {station.current_leq_dbfs != null && (
            <p className="dashboard-map-popup__value">
              Leq: <strong>{station.current_leq_dbfs.toFixed(1)} dBFS</strong>
            </p>
          )}
          <button
            type="button"
            onClick={() => navigate(map2DStationPath(station.station_code))}
            className="dashboard-map-popup__action"
          >
            Ver detalle
          </button>
        </div>
      </Popup>
    </CircleMarker>
  )
}

export default function StationMap({ stations = [], hoveredStationCode, selectedStationCode, onSelect }) {
  const navigate = useNavigate()
  const { isDark } = useTheme()
  const mapRef = useRef(null)
  const [showZoomGuide, setShowZoomGuide] = useState(true)
  const selectedStation = stations.find(s => s.station_code === selectedStationCode)

  const resetView = () => {
    onSelect?.(null)
    mapRef.current?.flyTo(BOGOTA_VIEW.center, BOGOTA_VIEW.zoom, { animate: true, duration: 0.7 })
  }

  return (
    <>
      <MapContainer
        ref={mapRef}
        center={BOGOTA_VIEW.center}
        zoom={BOGOTA_VIEW.zoom}
        className="dashboard-leaflet-map"
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution={TILE_ATTRIBUTION}
          url={TILE_URLS.light}
          opacity={isDark ? 0 : 1}
          zIndex={1}
        />
        <TileLayer
          attribution={TILE_ATTRIBUTION}
          url={TILE_URLS.dark}
          opacity={isDark ? 1 : 0}
          zIndex={2}
        />
        <BogotaBoundary isDark={isDark} />
        <MapZoomGuide onVisibilityChange={setShowZoomGuide} />
        <MapSelectionController station={selectedStation} />

        {stations.map(s => {
          return (
            <StationMarker
              key={s.station_code}
              station={s}
              isHovered={s.station_code === hoveredStationCode}
              isSelected={s.station_code === selectedStationCode}
              onSelect={onSelect}
              navigate={navigate}
            />
          )
        })}
      </MapContainer>
      {showZoomGuide && (
        <div className="dashboard-map-guide" role="note">
          <h2 id="map-heading">Lecturas por estación</h2>
          <p>Selecciona una estación para acercarte y consultar su detalle acústico.</p>
        </div>
      )}
      <button type="button" className="dashboard-map-reset" onClick={resetView}>
        Vista Bogotá
      </button>
    </>
  )
}
