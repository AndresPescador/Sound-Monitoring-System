import { NavLink, Link } from 'react-router-dom'

const links = [
  { to: '/mapa-2d', label: 'Mapa 2D' },
  { to: '/urban-3d', label: 'Mapa 3D' },
  { to: '/compare', label: 'Comparar estaciones' },
  { to: '/data',    label: 'Datos abiertos' },
]

export default function Navbar() {
  return (
    <header className="dashboard-nav">
      <div className="dashboard-nav__inner">
        <Link to="/" className="dashboard-nav__brand" aria-label="Volver a la presentación del Sistema de Monitoreo Acústico">
          <img
            className="dashboard-nav__mark"
            src="/assets/logo-oido-urbano.png"
            alt=""
            aria-hidden="true"
          />
          <span>Monitoreo Acústico<small>Bogotá D.C.</small></span>
        </Link>

        <nav className="dashboard-nav__links" aria-label="Navegación del mapa 2D">
          {links.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `dashboard-nav__link ${
                  isActive
                    ? 'dashboard-nav__link--active'
                    : ''
                }`
              }
              end={to === '/mapa-2d'}
            >
              {label}
            </NavLink>
          ))}
        </nav>

        <Link to="/" className="dashboard-nav__home">Presentación</Link>
      </div>
    </header>
  )
}
