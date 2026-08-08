import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAdminAuth } from '../../context/AdminAuthContext'

export default function AdminLogin() {
  const { login }          = useAdminAuth()
  const navigate           = useNavigate()
  const [form, setForm]    = useState({ username: '', password: '' })
  const [error, setError]  = useState('')
  const [loading, setLoading] = useState(false)

  const handleChange = (e) =>
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(form.username, form.password)
      navigate('/admin/stations', { replace: true })
    } catch (err) {
      const msg = err.response?.data?.error
      setError(msg || 'Error al iniciar sesión. Verifica tus credenciales.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        <div className="text-center mb-8">
          <h1 className="text-2xl font-display font-semibold text-text">
            Panel de Administración
          </h1>
          <p className="text-text-muted text-sm mt-1">
            Monitoreo Acústico Binaural · Bogotá D.C.
          </p>
        </div>

        <div className="bg-bg border border-border rounded-xl p-8 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-5">

            <div>
              <label className="block text-sm font-medium text-text mb-1.5">
                Usuario
              </label>
              <input
                type="text"
                name="username"
                value={form.username}
                onChange={handleChange}
                autoComplete="username"
                required
                disabled={loading}
                className="w-full px-3 py-2 border border-border rounded-lg text-text
                           bg-surface text-sm focus:outline-none focus:ring-2
                           focus:ring-primary focus:border-transparent
                           disabled:opacity-50"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text mb-1.5">
                Contraseña
              </label>
              <input
                type="password"
                name="password"
                value={form.password}
                onChange={handleChange}
                autoComplete="current-password"
                required
                disabled={loading}
                className="w-full px-3 py-2 border border-border rounded-lg text-text
                           bg-surface text-sm focus:outline-none focus:ring-2
                           focus:ring-primary focus:border-transparent
                           disabled:opacity-50"
              />
            </div>

            {error && (
              <p className="text-sm text-noise-high bg-red-50 border border-red-200
                            rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-primary text-white rounded-lg
                         text-sm font-medium hover:bg-primary-dark transition-colors
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Iniciando sesión...' : 'Iniciar sesión'}
            </button>

          </form>
        </div>

        <p className="text-center text-xs text-text-light mt-6">
          Acceso restringido al personal autorizado
        </p>
      </div>
    </div>
  )
}
