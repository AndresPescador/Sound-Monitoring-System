import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAdminAuth } from '../../context/AdminAuthContext'
import ThemeToggle from '../../components/shared/ThemeToggle'

export default function AdminLogin() {
  const { login } = useAdminAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ username: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleChange = (event) => {
    setForm(previous => ({ ...previous, [event.target.name]: event.target.value }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(form.username, form.password)
      navigate('/admin/stations', { replace: true })
    } catch (err) {
      const message = err.response?.data?.error
      setError(message || 'No fue posible iniciar sesión. Verifica el usuario y la contraseña.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="admin-login">
      <section className="admin-login__brand-panel" aria-labelledby="admin-access-title">
        <div className="admin-login__rings" aria-hidden="true"><span /><span /><span /></div>
        <div className="admin-login__brand-copy">
          <Link to="/" className="admin-login__brand" aria-label="Volver a la presentación del sistema">
            <img src="/assets/logo-oido-urbano.png" alt="" aria-hidden="true" />
            <span>
              Monitoreo Acústico
              <small>Bogotá D.C.</small>
            </span>
          </Link>
          <h1 id="admin-access-title">Operación de la red acústica.</h1>
          <p>
            Administra estaciones, credenciales y accesos desde la misma identidad
            cívica del portal de monitoreo.
          </p>
        </div>
      </section>

      <main className="admin-login__form-panel" id="main-content" tabIndex={-1}>
        <div className="admin-login__toolbar"><ThemeToggle /></div>

        <div className="admin-login__form-wrap">
          <h2>Iniciar sesión</h2>
          <p>Ingresa con una cuenta autorizada para acceder al panel administrativo.</p>

          <form onSubmit={handleSubmit} className="admin-login__form">
            <div className="admin-field">
              <label htmlFor="admin-username">Usuario</label>
              <input
                id="admin-username"
                className="admin-input"
                type="text"
                name="username"
                value={form.username}
                onChange={handleChange}
                autoComplete="username"
                required
                disabled={loading}
              />
            </div>

            <div className="admin-field">
              <label htmlFor="admin-password">Contraseña</label>
              <input
                id="admin-password"
                className="admin-input"
                type="password"
                name="password"
                value={form.password}
                onChange={handleChange}
                autoComplete="current-password"
                required
                disabled={loading}
              />
            </div>

            {error && <div className="admin-alert" role="alert">{error}</div>}

            <button
              type="submit"
              disabled={loading}
              className="admin-button admin-button--primary admin-login__submit"
            >
              {loading ? 'Verificando acceso…' : 'Iniciar sesión'}
            </button>
          </form>
        </div>

        <footer className="admin-login__footer">
          <span>Acceso restringido al personal autorizado</span>
          <Link to="/mapa-2d">Volver al mapa público</Link>
        </footer>
      </main>
    </div>
  )
}
