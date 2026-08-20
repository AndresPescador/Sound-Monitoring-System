import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useAdminAuth } from '../../context/AdminAuthContext'
import ThemeToggle from '../shared/ThemeToggle'

const navItems = [
  {
    to: '/admin/stations',
    label: 'Estaciones',
    description: 'Red, estado y credenciales',
  },
  {
    to: '/admin/profile',
    label: 'Mi perfil',
    description: 'Cuenta y seguridad',
  },
]

export default function AdminLayout({ children }) {
  const { user, logout } = useAdminAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/admin/login', { replace: true })
  }

  const roleLabel = user?.superAdmin ? 'Superadministrador' : 'Administrador'

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar" aria-label="Navegación administrativa">
        <Link
          to="/"
          className="admin-sidebar__brand"
          aria-label="Volver a la presentación del Sistema de Monitoreo Acústico"
        >
          <img src="/assets/logo-oido-urbano.png" alt="" aria-hidden="true" />
          <span>
            Monitoreo Acústico
            <small>Operación de la red</small>
          </span>
        </Link>

        <p className="admin-sidebar__context">Panel administrativo</p>

        <nav className="admin-nav" aria-label="Secciones del panel">
          {navItems.map(({ to, label, description }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => (
                `admin-nav__link${isActive ? ' admin-nav__link--active' : ''}`
              )}
            >
              <span className="admin-nav__label">{label}</span>
              <span className="admin-nav__description">{description}</span>
            </NavLink>
          ))}

          {user?.superAdmin && (
            <NavLink
              to="/admin/users"
              className={({ isActive }) => (
                `admin-nav__link${isActive ? ' admin-nav__link--active' : ''}`
              )}
            >
              <span className="admin-nav__label">Administradores</span>
              <span className="admin-nav__description">Accesos del equipo</span>
            </NavLink>
          )}
        </nav>

        <div className="admin-sidebar__footer">
          <div className="admin-account">
            <div className="admin-account__meta">
              <div className="admin-account__name" title={user?.username}>{user?.username}</div>
              <div className="admin-account__role">{roleLabel}</div>
            </div>
            <ThemeToggle />
          </div>
          <button type="button" onClick={handleLogout} className="admin-sidebar__logout">
            Cerrar sesión
          </button>
        </div>
      </aside>

      <main className="admin-main" id="main-content" tabIndex={-1}>
        <div className="admin-main__inner">{children}</div>
      </main>
    </div>
  )
}
