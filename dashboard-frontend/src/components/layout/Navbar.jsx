import { NavLink, Link } from 'react-router-dom'

const links = [
  { to: '/mapa-2d', label: 'Mapa 2D' },
  { to: '/urban-3d', label: 'Visor 3D' },
  { to: '/compare', label: 'Comparar estaciones' },
  { to: '/data',    label: 'Datos abiertos' },
]

export default function Navbar() {
  return (
    <header className="bg-bg border-b border-border sticky top-0 z-50">
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-14">

        {/* Logo / nombre - Clickeable */}
        <Link to="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
          <span className="w-7 h-7 rounded-md bg-primary flex items-center justify-center text-white text-xs font-display font-bold">M</span>
          <span className="font-display font-semibold text-text text-sm leading-tight hidden sm:block">
            Monitoreo Acústico<br />
            <span className="text-text-muted font-normal text-xs">Bogotá D.C.</span>
          </span>
        </Link>

        {/* Navegación */}
        <nav className="flex items-center gap-1">
          {links.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-md text-sm font-display transition-colors ${
                  isActive
                    ? 'bg-primary text-white'
                    : 'text-text-muted hover:text-text hover:bg-surface'
                }`
              }
              end={to === '/mapa-2d'}
            >
              {label}
            </NavLink>
          ))}
        </nav>
      </div>
    </header>
  )
}
