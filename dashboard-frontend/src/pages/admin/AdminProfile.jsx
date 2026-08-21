import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AdminLayout from '../../components/admin/AdminLayout'
import { useAdminAuth } from '../../context/AdminAuthContext'
import { changeAdminPassword } from '../../api/admin'

export default function AdminProfile() {
  const { user, logout } = useAdminAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const handleChange = (event) => {
    setForm(previous => ({ ...previous, [event.target.name]: event.target.value }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')

    if (form.newPassword !== form.confirmPassword) {
      setError('La nueva contraseña y su confirmación no coinciden.')
      return
    }
    if (form.newPassword.length < 12) {
      setError('La nueva contraseña debe tener al menos 12 caracteres.')
      return
    }

    setSaving(true)
    try {
      await changeAdminPassword(form.currentPassword, form.newPassword)
      logout()
      navigate('/admin/login', {
        replace: true,
        state: { passwordChanged: true },
      })
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo actualizar la contraseña.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <AdminLayout>
      <div className="admin-page">
        <header className="admin-page-header">
          <div>
            <h1 tabIndex={-1}>Mi perfil</h1>
            <p>Consulta tu nivel de acceso y protege las credenciales de la cuenta.</p>
          </div>
        </header>

        <div className="admin-profile-grid">
          <section className="admin-account-card" aria-labelledby="account-title">
            <div className="admin-account-card__header">
              <p id="account-title">Cuenta autenticada</p>
              <strong>{user?.username}</strong>
            </div>
            <dl>
              <div>
                <dt>Rol</dt>
                <dd>{user?.superAdmin ? 'Superadministrador' : 'Administrador'}</dd>
              </div>
              <div>
                <dt>Sesión</dt>
                <dd>Activa en este navegador</dd>
              </div>
            </dl>
          </section>

          <section className="admin-form-panel" aria-labelledby="password-title">
            <div className="admin-form-panel__heading">
              <h2 id="password-title">Cambiar contraseña</h2>
              <p>Usa al menos 12 caracteres y evita reutilizar credenciales de otros servicios.</p>
            </div>

            <form onSubmit={handleSubmit} className="admin-form">
              <div className="admin-field">
                <label htmlFor="current-password">Contraseña actual</label>
                <input
                  id="current-password"
                  className="admin-input"
                  type="password"
                  name="currentPassword"
                  value={form.currentPassword}
                  onChange={handleChange}
                  autoComplete="current-password"
                  required
                  disabled={saving}
                />
              </div>

              <div className="admin-form-grid">
                <div className="admin-field">
                  <label htmlFor="new-password">Nueva contraseña</label>
                  <input
                    id="new-password"
                    className="admin-input"
                    type="password"
                    name="newPassword"
                    value={form.newPassword}
                    onChange={handleChange}
                    autoComplete="new-password"
                    required
                    minLength={12}
                    disabled={saving}
                  />
                </div>
                <div className="admin-field">
                  <label htmlFor="confirm-password">Confirmar contraseña</label>
                  <input
                    id="confirm-password"
                    className="admin-input"
                    type="password"
                    name="confirmPassword"
                    value={form.confirmPassword}
                    onChange={handleChange}
                    autoComplete="new-password"
                    required
                    minLength={12}
                    disabled={saving}
                  />
                </div>
              </div>

              {error && <div className="admin-alert" role="alert">{error}</div>}
              <div className="admin-form__actions">
                <button type="submit" disabled={saving} className="admin-button admin-button--primary">
                  {saving ? 'Actualizando…' : 'Actualizar contraseña'}
                </button>
              </div>
            </form>
          </section>
        </div>
      </div>
    </AdminLayout>
  )
}
