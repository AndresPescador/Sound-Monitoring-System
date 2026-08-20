import { Link, useLocation } from 'react-router-dom'
import { ROUTES } from '../../routes'
import ThemeToggle from '../shared/ThemeToggle'

const links = [
  { to: ROUTES.map2D, label: 'Mapa', end: true },
  { to: ROUTES.map2DCompare, label: 'Comparar estaciones' },
  { to: ROUTES.map2DData, label: 'Datos abiertos' },
]

export default function Map2DNavbar() {
  const { pathname } = useLocation()
  const isActive = to => to === ROUTES.map2D
    ? pathname === ROUTES.map2D || pathname.startsWith(`${ROUTES.map2D}/stations/`)
    : pathname === to

  return (
    <header className="dashboard-nav">
      <div className="dashboard-nav__inner">
        <Link to={ROUTES.landing} className="dashboard-nav__brand" aria-label="Volver a la presentación del Sistema de Monitoreo Acústico">
          <img
            className="dashboard-nav__mark"
            src="/assets/logo-oido-urbano.png"
            alt=""
            aria-hidden="true"
          />
          <span>Monitoreo Acústico<small>Experiencia 2D</small></span>
        </Link>

        <nav className="dashboard-nav__links" aria-label="Herramientas del mapa 2D">
          {links.map(({ to, label }) => (
            <Link
              key={to}
              to={to}
              className={`dashboard-nav__link ${isActive(to) ? 'dashboard-nav__link--active' : ''}`}
              aria-current={isActive(to) ? 'page' : undefined}
            >
              {label}
            </Link>
          ))}
        </nav>

        <div className="dashboard-nav__actions">
          <ThemeToggle />
          <Link to={ROUTES.map3D} className="dashboard-nav__mode-switch">Cambiar a mapa 3D</Link>
        </div>
      </div>
    </header>
  )
}
