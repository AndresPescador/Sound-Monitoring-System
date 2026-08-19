import { useEffect, useRef } from 'react'
import { MapContainer, TileLayer, CircleMarker, Popup, Tooltip, useMap } from 'react-leaflet'
import { useNavigate } from 'react-router-dom'
import { map2DStationPath } from '../../routes'

// Bogotá center
const BOGOTA = [4.7110, -74.0721]

const NOISE_COLOR = {
  low:    '#16a34a',
  moderate: '#d97706',
  high:   '#dc2626',
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
  const selectedStation = stations.find(s => s.station_code === selectedStationCode)

  return (
    <MapContainer
      center={BOGOTA}
      zoom={11}
      className="dashboard-leaflet-map"
      scrollWheelZoom={true}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
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
  )
}
