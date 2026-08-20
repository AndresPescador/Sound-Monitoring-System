import { useState } from 'react'
import { updateStation } from '../../api/admin'
import { Field, Modal } from './ModalComponents'

export function EditStationModal({ station, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: station.name || '',
    locality: station.locality || '',
    description: station.description || '',
    address: station.address || '',
    latitude: station.latitude || '',
    longitude: station.longitude || '',
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const handleChange = (event) => {
    setForm(previous => ({ ...previous, [event.target.name]: event.target.value }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setSaving(true)
    try {
      await updateStation(station.stationCode, {
        ...form,
        latitude: parseFloat(form.latitude),
        longitude: parseFloat(form.longitude),
      })
      onSaved()
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudieron guardar los cambios.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={`Editar ${station.stationCode}`} onClose={saving ? null : onClose}>
      <form onSubmit={handleSubmit} className="admin-form">
        <div className="admin-form-grid">
          <Field label="Nombre" name="name" value={form.name} onChange={handleChange} required disabled={saving} />
          <Field label="Localidad" name="locality" value={form.locality} onChange={handleChange} required disabled={saving} />
          <Field label="Dirección" name="address" value={form.address} onChange={handleChange} disabled={saving} />
          <div aria-hidden="true" />
          <Field
            label="Latitud"
            name="latitude"
            value={form.latitude}
            onChange={handleChange}
            type="number"
            step="any"
            required
            disabled={saving}
          />
          <Field
            label="Longitud"
            name="longitude"
            value={form.longitude}
            onChange={handleChange}
            type="number"
            step="any"
            required
            disabled={saving}
          />
          <div className="admin-field admin-field--wide">
            <label htmlFor="edit-station-description">Descripción</label>
            <textarea
              id="edit-station-description"
              className="admin-textarea"
              name="description"
              value={form.description}
              onChange={handleChange}
              rows={3}
              disabled={saving}
            />
          </div>
        </div>

        {error && <div className="admin-alert" role="alert">{error}</div>}

        <div className="admin-form__actions">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="admin-button admin-button--secondary"
          >
            Cancelar
          </button>
          <button type="submit" disabled={saving} className="admin-button admin-button--primary">
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
