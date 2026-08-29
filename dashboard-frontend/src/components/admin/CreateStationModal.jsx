import { useState } from 'react'
import { registerStationAuth, registerStationProcessing } from '../../api/admin'
import { BOGOTA_LOCALITIES, stationCodePreview } from '../../constants/bogotaLocalities'
import { Field, Modal, SelectField } from './ModalComponents'

const EMPTY = {
  locality: '',
  description: '',
  address: '',
  latitude: '',
  longitude: '',
}

export function CreateStationModal({ onClose, onCreated, pendingRegistration, onPendingChange }) {
  const [form, setForm] = useState(() => pendingRegistration
    ? {
        locality: pendingRegistration.locality,
        description: pendingRegistration.processingPayload.description,
        address: pendingRegistration.processingPayload.address,
        latitude: pendingRegistration.processingPayload.latitude,
        longitude: pendingRegistration.processingPayload.longitude,
      }
    : EMPTY)
  const [error, setError] = useState('')
  const [step, setStep] = useState('')
  const codePreview = pendingRegistration?.stationCode || stationCodePreview(form.locality)

  const handleChange = (event) => {
    setForm(previous => ({ ...previous, [event.target.name]: event.target.value }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    let registration = pendingRegistration

    try {
      if (!registration) {
        setStep('Asignando código y registrando credenciales…')
        const authResponse = await registerStationAuth({
          locality: form.locality,
          description: form.description,
        })
        registration = {
          stationCode: authResponse.data.stationCode,
          locality: authResponse.data.locality,
          secret: authResponse.data.secret,
          processingPayload: {
            stationCode: authResponse.data.stationCode,
            locality: authResponse.data.locality,
            description: form.description,
            address: form.address,
            latitude: parseFloat(form.latitude),
            longitude: parseFloat(form.longitude),
          },
        }
        onPendingChange(registration)
      }

      setStep('Registrando datos geográficos…')
      await registerStationProcessing(registration.processingPayload)
      onCreated(registration.secret, registration.stationCode)
    } catch (err) {
      const message = err.response?.data?.error
      setError(message || (registration
        ? 'Las credenciales ya existen, pero faltó registrar los datos geográficos. Reintenta este paso.'
        : 'No se pudo completar el registro de la estación.'))
      setStep('')
    }
  }

  return (
    <Modal title="Nueva estación" onClose={step ? null : onClose}>
      <form onSubmit={handleSubmit} className="admin-form">
        <div className="admin-form-grid">
          <SelectField
            label="Localidad"
            name="locality"
            value={form.locality}
            onChange={handleChange}
            options={BOGOTA_LOCALITIES}
            required
            disabled={Boolean(step || pendingRegistration)}
          />
          <Field
            label="Código generado"
            name="generatedCode"
            value={codePreview}
            placeholder="Selecciona una localidad"
            readOnly
            disabled={Boolean(step || pendingRegistration)}
            hint="El consecutivo exacto se asignará al crear. El nombre será “Estación” seguido de este código."
          />
          <Field
            label="Dirección"
            name="address"
            value={form.address}
            onChange={handleChange}
            placeholder="Calle 72 #10-07"
            disabled={Boolean(step || pendingRegistration)}
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
            disabled={Boolean(step || pendingRegistration)}
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
            disabled={Boolean(step || pendingRegistration)}
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
              disabled={Boolean(step || pendingRegistration)}
            />
          </div>
        </div>

        {error && <div className="admin-alert" role="alert">{error}</div>}
        {pendingRegistration && !step && (
          <div className="admin-alert admin-alert--warning" role="status">
            Auth ya reservó {pendingRegistration.stationCode}. El reintento continuará únicamente en Processing.
          </div>
        )}
        {step && <div className="admin-alert admin-alert--warning" role="status">{step}</div>}

        <div className="admin-form__actions">
          <button
            type="button"
            onClick={onClose}
            disabled={Boolean(step)}
            className="admin-button admin-button--secondary"
          >
            {pendingRegistration ? 'Cerrar por ahora' : 'Cancelar'}
          </button>
          <button type="submit" disabled={Boolean(step)} className="admin-button admin-button--primary">
            {step || (pendingRegistration ? 'Reintentar datos geográficos' : 'Crear estación')}
          </button>
        </div>
      </form>
    </Modal>
  )
}
