import { Link, NavLink } from 'react-router-dom'
import { ROUTES } from '../../routes'

const links = [
  { to: ROUTES.map2D, label: 'Mapa', end: true },
  { to: ROUTES.map2DCompare, label: 'Comparar estaciones' },
  { to: ROUTES.map2DData, label: 'Datos abiertos' },
]

export default function Map2DNavbar() {
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
          {links.map(({ to, label, end }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => (
                `dashboard-nav__link ${isActive ? 'dashboard-nav__link--active' : ''}`
              )}
              end={end}
            >
              {label}
            </NavLink>
          ))}
        </nav>

        <Link to={ROUTES.map3D} className="dashboard-nav__mode-switch">Cambiar a mapa 3D</Link>
      </div>
    </header>
  )
}
