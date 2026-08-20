import { NavLink, useNavigate } from 'react-router-dom'
import { useAdminAuth } from '../../context/AdminAuthContext'
import ThemeToggle from '../shared/ThemeToggle'

const navItems = [
  { to: '/admin/stations', label: 'Estaciones' },
  { to: '/admin/profile',  label: 'Mi perfil' },
]

export default function AdminLayout({ children }) {
  const { user, logout } = useAdminAuth()
  const navigate         = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/admin/login', { replace: true })
  }

  return (
    <div className="admin-layout min-h-screen bg-surface flex">

      {/* Sidebar */}
      <aside className="w-56 bg-bg border-r border-border flex flex-col shrink-0">
        <div className="px-5 py-5 border-b border-border">
          <div className="flex items-start justify-between gap-3 mb-4">
            <p className="text-xs text-text-light uppercase tracking-wide font-medium mb-0.5">
              Panel Admin
            </p>
            <ThemeToggle className="shrink-0" />
          </div>
          <p className="text-sm font-medium text-text truncate">{user?.username}</p>
          {user?.superAdmin && (
            <span className="inline-block mt-1 text-xs bg-primary/10 text-primary
                             rounded px-1.5 py-0.5 font-medium">
              Super Admin
            </span>
          )}
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `block px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-text-muted hover:bg-surface hover:text-text'
                }`
              }
            >
              {label}
            </NavLink>
          ))}

          {/* Gestión de admins — solo visible para super-admin */}
          {user?.superAdmin && (
            <NavLink
              to="/admin/users"
              className={({ isActive }) =>
                `block px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-text-muted hover:bg-surface hover:text-text'
                }`
              }
            >
              Administradores
            </NavLink>
          )}
        </nav>

        <div className="px-3 py-4 border-t border-border">
          <button
            onClick={handleLogout}
            className="w-full px-3 py-2 text-sm text-text-muted rounded-lg
                       hover:bg-surface hover:text-noise-high transition-colors text-left"
          >
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Contenido principal */}
      <main className="flex-1 overflow-auto">
        <div className="max-w-5xl mx-auto px-8 py-8">
          {children}
        </div>
      </main>

    </div>
  )
}
