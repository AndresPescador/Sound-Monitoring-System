import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getStations } from '../../api/stations'

const VIEWBOX_WIDTH = 720
const VIEWBOX_HEIGHT = 520
const MAP_PADDING = 44
const MAX_BOUNDARY_POINTS = 900
const CITY_BUILDINGS = Array.from({ length: 42 }, (_, index) => ({
  x: 116 + (index % 7) * 76 + (Math.floor(index / 7) % 2) * 22,
  y: 128 + Math.floor(index / 7) * 60,
  height: 18 + ((index * 17) % 58),
}))

const NOISE_COLOR = {
  low: '#16a34a',
  moderate: '#d97706',
  high: '#dc2626',
}

function createMapModel(coordinates, stations) {
  if (!coordinates.length) return null

  const longitudes = coordinates.map(([longitude]) => longitude)
  const latitudes = coordinates.map(([, latitude]) => latitude)
  const bounds = {
    minLongitude: Math.min(...longitudes),
    maxLongitude: Math.max(...longitudes),
    minLatitude: Math.min(...latitudes),
    maxLatitude: Math.max(...latitudes),
  }

  const project = ([longitude, latitude]) => ({
    x: MAP_PADDING + ((longitude - bounds.minLongitude) / (bounds.maxLongitude - bounds.minLongitude)) * (VIEWBOX_WIDTH - MAP_PADDING * 2),
    y: MAP_PADDING + (1 - (latitude - bounds.minLatitude) / (bounds.maxLatitude - bounds.minLatitude)) * (VIEWBOX_HEIGHT - MAP_PADDING * 2),
  })

  const samplingStep = Math.max(1, Math.ceil(coordinates.length / MAX_BOUNDARY_POINTS))
  const sampledCoordinates = coordinates.filter((_, index) => index % samplingStep === 0)
  const path = sampledCoordinates
    .map((coordinate, index) => {
      const point = project(coordinate)
      return `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`
    })
    .join(' ')

  const stationPoints = stations
    .filter(station => Number.isFinite(station.longitude) && Number.isFinite(station.latitude))
    .map(station => ({
      ...project([station.longitude, station.latitude]),
      color: NOISE_COLOR[station.noise_level] ?? '#64748b',
      code: station.station_code,
    }))

  return { path: `${path} Z`, stationPoints }
}

function CityShape({ model, dimensional = false }) {
  if (!model) {
    return <div className="landing-map-loading" aria-hidden="true" />
  }

  return (
    <svg
      viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
      className={dimensional ? 'landing-city-shape landing-city-shape--3d' : 'landing-city-shape'}
      role="img"
      aria-label={dimensional ? 'Representación tridimensional del mapa de Bogotá' : 'Representación bidimensional del mapa de Bogotá'}
    >
      <defs>
        <linearGradient id={`city-fill-${dimensional ? '3d' : '2d'}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={dimensional ? '#e0f2fe' : '#eff6ff'} />
          <stop offset="100%" stopColor={dimensional ? '#60a5fa' : '#bfdbfe'} />
        </linearGradient>
        {dimensional && (
          <clipPath id="city-3d-clip">
            <path d={model.path} />
          </clipPath>
        )}
      </defs>

      {dimensional && [28, 21, 14, 7].map(offset => (
        <path
          key={offset}
          d={model.path}
          transform={`translate(0 ${offset})`}
          fill="#1e3a8a"
          opacity={0.12 + offset / 140}
        />
      ))}

      <path
        d={model.path}
        fill={`url(#city-fill-${dimensional ? '3d' : '2d'})`}
        stroke={dimensional ? '#1d4ed8' : '#2563eb'}
        strokeWidth={dimensional ? 3 : 2}
        vectorEffect="non-scaling-stroke"
      />

      {dimensional && (
        <g clipPath="url(#city-3d-clip)" className="landing-city-buildings" aria-hidden="true">
          {CITY_BUILDINGS.map((building, index) => (
            <line
              key={`${building.x}-${building.y}`}
              x1={building.x}
              y1={building.y}
              x2={building.x}
              y2={building.y - building.height}
              style={{ '--building-delay': `${index * -45}ms` }}
            />
          ))}
        </g>
      )}

      {!dimensional && (
        <>
          <path d={model.path} transform="translate(29 21) scale(.92)" fill="none" stroke="#ffffff" strokeWidth="1.2" opacity=".64" />
          <path d={model.path} transform="translate(56 41) scale(.84)" fill="none" stroke="#ffffff" strokeWidth="1" opacity=".42" />
        </>
      )}

      {model.stationPoints.map((station, index) => dimensional ? (
        <g key={station.code} className="landing-map-column" style={{ '--column-delay': `${index * 70}ms` }}>
          <line x1={station.x} y1={station.y} x2={station.x} y2={station.y - 34 - (index % 4) * 9} stroke={station.color} strokeWidth="7" strokeLinecap="round" />
          <circle cx={station.x} cy={station.y - 34 - (index % 4) * 9} r="6" fill={station.color} stroke="#fff" strokeWidth="2" />
        </g>
      ) : (
        <g key={station.code} className="landing-map-node" style={{ '--node-delay': `${index * 90}ms` }}>
          <circle cx={station.x} cy={station.y} r="10" fill={station.color} opacity=".16" />
          <circle cx={station.x} cy={station.y} r="4.5" fill={station.color} stroke="#fff" strokeWidth="2" />
        </g>
      ))}
    </svg>
  )
}

export default function BogotaMapGateway() {
  const [boundary, setBoundary] = useState([])
  const [stations, setStations] = useState([])

  useEffect(() => {
    let active = true

    Promise.allSettled([
      fetch('/bogota-municipio.geojson').then(response => {
        if (!response.ok) throw new Error('No fue posible cargar el límite de Bogotá')
        return response.json()
      }),
      getStations(),
    ]).then(([boundaryResult, stationsResult]) => {
      if (!active) return

      if (boundaryResult.status === 'fulfilled') {
        const geometry = boundaryResult.value.features?.[0]?.geometry
        const coordinates = geometry?.type === 'Polygon'
          ? geometry.coordinates?.[0]
          : geometry?.coordinates?.[0]?.[0]
        setBoundary(coordinates ?? [])
      }

      if (stationsResult.status === 'fulfilled') {
        setStations(stationsResult.value.data ?? [])
      }
    })

    return () => { active = false }
  }, [])

  const model = useMemo(() => createMapModel(boundary, stations), [boundary, stations])

  return (
    <div className="landing-map-gateway">
      <Link className="landing-map-choice landing-map-choice--2d" to="/mapa-2d" aria-label="Abrir mapa de monitoreo 2D">
        <div className="landing-map-copy">
          <span className="landing-map-mode">2D</span>
          <div>
            <h3>Mapa de monitoreo</h3>
            <p>Estaciones, niveles actuales y acceso al detalle acústico.</p>
          </div>
          <span className="landing-map-action">Abrir mapa 2D</span>
        </div>
        <div className="landing-map-visual landing-map-visual--2d">
          <CityShape model={model} />
        </div>
      </Link>

      <Link className="landing-map-choice landing-map-choice--3d" to="/urban-3d" aria-label="Abrir gemelo urbano 3D">
        <div className="landing-map-copy">
          <span className="landing-map-mode">3D</span>
          <div>
            <h3>Gemelo urbano</h3>
            <p>Relieve, edificios y columnas de intensidad por estación.</p>
          </div>
          <span className="landing-map-action">Abrir visor 3D</span>
        </div>
        <div className="landing-map-visual landing-map-visual--3d">
          <CityShape model={model} dimensional />
        </div>
      </Link>
    </div>
  )
}
