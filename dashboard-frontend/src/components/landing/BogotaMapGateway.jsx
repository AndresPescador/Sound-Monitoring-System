import { Link } from 'react-router-dom'

const MAP_VIEWS = [
  {
    key: '2d',
    title: 'Mapa 2D',
    mode: '2D',
    description: 'Estaciones, niveles actuales y acceso al detalle acústico.',
    action: 'Abrir mapa 2D',
    href: '/mapa-2d',
    image: '/assets/landing-map-2d.webp',
    alt: 'Vista cartográfica de Bogotá con red de estaciones acústicas y pulsos de medición',
  },
  {
    key: '3d',
    title: 'Mapa 3D',
    mode: '3D',
    description: 'Relieve, edificios y columnas de intensidad por estación.',
    action: 'Abrir mapa 3D',
    href: '/urban-3d',
    image: '/assets/landing-map-3d.webp',
    alt: 'Gemelo urbano tridimensional con edificios wireframe y una onda acústica luminosa',
  },
]

export default function BogotaMapGateway() {
  return (
    <div className="landing-map-gateway">
      {MAP_VIEWS.map(({ key, title, mode, description, action, href, image, alt }) => (
        <Link
          key={key}
          className={`landing-map-choice landing-map-choice--${key}`}
          to={href}
          aria-label={action}
        >
          <div className="landing-map-copy">
            <span className="landing-map-mode">{mode}</span>
            <div>
              <h3>{title}</h3>
              <p>{description}</p>
            </div>
            <span className="landing-map-action">{action}</span>
          </div>
          <div className="landing-map-visual" aria-hidden="true">
            <img src={image} alt={alt} loading="lazy" />
          </div>
        </Link>
      ))}
    </div>
  )
}
