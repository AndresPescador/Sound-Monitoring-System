import { useState } from 'react'
import AdminLayout from '../../components/admin/AdminLayout'
import { useAdminAuth } from '../../context/AdminAuthContext'
import { changeAdminPassword } from '../../api/admin'

export default function AdminProfile() {
  const { user }  = useAdminAuth()
  const [form, setForm]       = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [error, setError]     = useState('')
  const [success, setSuccess] = useState(false)
  const [saving, setSaving]   = useState(false)

  const handleChange = (e) =>
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess(false)

    if (form.newPassword !== form.confirmPassword) {
      setError('El nuevo password y su confirmación no coinciden.')
      return
    }
    if (form.newPassword.length < 12) {
      setError('El nuevo password debe tener al menos 12 caracteres.')
      return
    }

    setSaving(true)
    try {
      await changeAdminPassword(form.currentPassword, form.newPassword)
      setSuccess(true)
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
    } catch (err) {
      setError(err.response?.data?.error || 'Error al cambiar el password.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <AdminLayout>
      <h1 className="text-xl font-display font-semibold text-text mb-6">Mi perfil</h1>

      <div className="max-w-md space-y-6">

        {/* Info del admin */}
        <div className="bg-bg border border-border rounded-xl p-5">
          <p className="text-xs text-text-muted mb-3 uppercase tracking-wide font-medium">
            Información de cuenta
          </p>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-text-muted">Usuario</span>
              <span className="text-text font-medium">{user?.username}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-text-muted">Rol</span>
              <span className="text-text">{user?.superAdmin ? 'Super Admin' : 'Admin'}</span>
            </div>
          </div>
        </div>

        {/* Cambiar password */}
        <div className="bg-bg border border-border rounded-xl p-5">
          <p className="text-xs text-text-muted mb-4 uppercase tracking-wide font-medium">
            Cambiar contraseña
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {[
              { name: 'currentPassword', label: 'Contraseña actual',    autocomplete: 'current-password' },
              { name: 'newPassword',     label: 'Nueva contraseña',     autocomplete: 'new-password' },
              { name: 'confirmPassword', label: 'Confirmar contraseña', autocomplete: 'new-password' },
            ].map(({ name, label, autocomplete }) => (
              <div key={name}>
                <label className="block text-xs font-medium text-text-muted mb-1.5">
                  {label}
                </label>
                <input
                  type="password" name={name} value={form[name]}
                  onChange={handleChange} autoComplete={autocomplete}
                  required
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm
                             text-text bg-surface focus:outline-none focus:ring-2
                             focus:ring-primary disabled:opacity-50"
                  disabled={saving}
                />
              </div>
            ))}

            {error   && <p className="text-sm text-noise-high">{error}</p>}
            {success && <p className="text-sm text-noise-low">Contraseña actualizada correctamente.</p>}

            <button
              type="submit" disabled={saving}
              className="w-full py-2 px-4 bg-primary text-white text-sm font-medium
                         rounded-lg hover:bg-primary-dark transition-colors
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Actualizando...' : 'Actualizar contraseña'}
            </button>
          </form>
        </div>

      </div>
    </AdminLayout>
  )
}
