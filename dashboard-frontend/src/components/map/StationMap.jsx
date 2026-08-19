import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet'
import { useNavigate } from 'react-router-dom'

// Bogotá center
const BOGOTA = [4.7110, -74.0721]

const NOISE_COLOR = {
  low:    '#16a34a',
  moderate: '#d97706',
  high:   '#dc2626',
}

export default function StationMap({ stations = [] }) {
  const navigate = useNavigate()

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

      {stations.map(s => {
        const color = NOISE_COLOR[s.noise_level] ?? '#94a3b8'
        return (
          <CircleMarker
            key={s.station_code}
            center={[s.latitude, s.longitude]}
            radius={10}
            pathOptions={{ color, fillColor: color, fillOpacity: 0.85, weight: 2 }}
          >
            <Popup>
              <div className="dashboard-map-popup">
                <p className="dashboard-map-popup__name">{s.name}</p>
                <p className="dashboard-map-popup__meta">{s.locality}</p>
                {s.current_leq_dbfs != null && (
                  <p className="dashboard-map-popup__value">
                    Leq: <strong>{s.current_leq_dbfs.toFixed(1)} dBFS</strong>
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => navigate(`/stations/${s.station_code}`)}
                  className="dashboard-map-popup__action"
                >
                  Ver detalle
                </button>
              </div>
            </Popup>
          </CircleMarker>
        )
      })}
    </MapContainer>
  )
}
