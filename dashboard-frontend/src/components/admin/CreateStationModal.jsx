import { useState } from 'react'
import { registerStationAuth, registerStationProcessing } from '../../api/admin'
import { Field, Modal } from './ModalComponents'

const EMPTY = {
  stationCode: '',
  locality: '',
  description: '',
  address: '',
  latitude: '',
  longitude: '',
}

export function CreateStationModal({ onClose, onCreated }) {
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState('')
  const [step, setStep] = useState('')
  const generatedName = form.stationCode ? `Estación ${form.stationCode}` : ''

  const handleChange = (event) => {
    setForm(previous => ({ ...previous, [event.target.name]: event.target.value }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')

    const payload = {
      ...form,
      latitude: parseFloat(form.latitude),
      longitude: parseFloat(form.longitude),
    }

    try {
      setStep('Registrando credenciales…')
      const authResponse = await registerStationAuth({
        stationCode: payload.stationCode,
        locality: payload.locality,
        description: payload.description,
      })
      const secret = authResponse.data.secret

      setStep('Registrando datos geográficos…')
      await registerStationProcessing(payload)
      onCreated(secret, payload.stationCode)
    } catch (err) {
      const message = err.response?.data?.error
      setError(message || 'No se pudo completar el registro de la estación.')
      setStep('')
    }
  }

  return (
    <Modal title="Nueva estación" onClose={step ? null : onClose}>
      <form onSubmit={handleSubmit} className="admin-form">
        <div className="admin-form-grid">
          <Field
            label="Código"
            name="stationCode"
            value={form.stationCode}
            onChange={handleChange}
            placeholder="ST-CHAPINERO-02"
            required
            disabled={Boolean(step)}
          />
          <Field
            label="Nombre generado"
            name="generatedName"
            value={generatedName}
            placeholder="Se generará a partir del código"
            readOnly
            disabled={Boolean(step)}
            hint="El nombre se asigna automáticamente y no podrá modificarse después."
          />
          <Field
            label="Localidad"
            name="locality"
            value={form.locality}
            onChange={handleChange}
            placeholder="Chapinero"
            required
            disabled={Boolean(step)}
          />
          <Field
            label="Dirección"
            name="address"
            value={form.address}
            onChange={handleChange}
            placeholder="Calle 72 #10-07"
            disabled={Boolean(step)}
          />
          <Field
            label="Latitud"
            name="latitude"
            value={form.latitude}
            onChange={handleChange}
            placeholder="4.6572"
            type="number"
            step="any"
            required
            disabled={Boolean(step)}
          />
          <Field
            label="Longitud"
            name="longitude"
            value={form.longitude}
            onChange={handleChange}
            placeholder="-74.0632"
            type="number"
            step="any"
            required
            disabled={Boolean(step)}
          />
          <div className="admin-field admin-field--wide">
            <label htmlFor="station-description">Descripción</label>
            <textarea
              id="station-description"
              className="admin-textarea"
              name="description"
              value={form.description}
              onChange={handleChange}
              rows={3}
              placeholder="Descripción opcional de la estación"
              disabled={Boolean(step)}
            />
          </div>
        </div>

        {error && <div className="admin-alert" role="alert">{error}</div>}
        {step && <div className="admin-alert admin-alert--warning" role="status">{step}</div>}

        <div className="admin-form__actions">
          <button
            type="button"
            onClick={onClose}
            disabled={Boolean(step)}
            className="admin-button admin-button--secondary"
          >
            Cancelar
          </button>
          <button type="submit" disabled={Boolean(step)} className="admin-button admin-button--primary">
            {step || 'Crear estación'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
