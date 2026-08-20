import { Navigate } from 'react-router-dom'
import { useAdminAuth } from '../../context/AdminAuthContext'

/**
 * Protege rutas del panel admin.
 * - Si loading: muestra un estado neutro (evita flash de redirect)
 * - Si no autenticado: redirige a /admin/login
 * - Si autenticado: renderiza children
 */
export default function PrivateAdminRoute({ children }) {
  const { user, loading } = useAdminAuth()

  if (loading) {
    return (
      <div className="admin-auth-loading" role="status" aria-live="polite">
        <div className="admin-auth-loading__content">
          <span className="admin-auth-loading__bars" aria-hidden="true"><i /><i /><i /></span>
          <span>Verificando sesión…</span>
        </div>
      </div>
    )
  }

  if (!user) return <Navigate to="/admin/login" replace />

  return children
}
