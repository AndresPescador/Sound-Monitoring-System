import { Navigate } from 'react-router-dom'
import { useAdminAuth } from '../../context/AdminAuthContext'

/**
 * Protege rutas del panel admin.
 * - Si loading: muestra nada (evita flash de redirect)
 * - Si no autenticado: redirige a /admin/login
 * - Si autenticado: renderiza children
 */
export default function PrivateAdminRoute({ children }) {
  const { user, loading } = useAdminAuth()

  if (loading) return null

  if (!user) return <Navigate to="/admin/login" replace />

  return children
}
