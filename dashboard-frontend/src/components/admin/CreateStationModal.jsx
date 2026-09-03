import { useId, useMemo, useState } from 'react'
import { registerStationAuth, registerStationProcessing, updateStationNameAuth } from '../../api/admin'
import { BOGOTA_LOCALITIES, localitySlug, stationCodePreview } from '../../constants/bogotaLocalities'
import { Field, Modal } from './ModalComponents'
import StationLocationPicker from './StationLocationPicker'

const EMPTY = { locality: '', name: '', description: '', address: '', latitude: '', longitude: '' }

const defaultName = locality => locality.trim() ? `Estación ${locality.trim()}` : ''

const matchingBogotaLocality = locality => {
  const slug = localitySlug(locality || '')
  return slug ? BOGOTA_LOCALITIES.find(item => localitySlug(item.value) === slug) : undefined
}

const coordinatesAreValid = (latitude, longitude) => {
  if (String(latitude).trim() === '' || String(longitude).trim() === '') return false
  const parsedLatitude = Number(latitude)
  const parsedLongitude = Number(longitude)
  return Number.isFinite(parsedLatitude) && Number.isFinite(parsedLongitude)
    && parsedLatitude >= -90 && parsedLatitude <= 90
    && parsedLongitude >= -180 && parsedLongitude <= 180
}

const initialForm = pendingRegistration => {
  if (!pendingRegistration) return EMPTY
  return {
    locality: pendingRegistration.locality,
    name: pendingRegistration.name || pendingRegistration.processingPayload.name,
    description: pendingRegistration.processingPayload.description,
    address: pendingRegistration.processingPayload.address,
    latitude: pendingRegistration.processingPayload.latitude,
    longitude: pendingRegistration.processingPayload.longitude,
  }
}

export function CreateStationModal({ onClose, onCreated, pendingRegistration, onPendingChange }) {
  const [form, setForm] = useState(() => initialForm(pendingRegistration))
  const localityListId = useId()
  const [currentStep, setCurrentStep] = useState(pendingRegistration ? 2 : 1)
  const [submissionStep, setSubmissionStep] = useState('')
  const [error, setError] = useState('')
  const [touched, setTouched] = useState({})

  const locality = form.locality
  const recognizedLocality = matchingBogotaLocality(locality)
  const codePreview = pendingRegistration?.stationCode || stationCodePreview(locality)
  const identityErrors = useMemo(() => ({
    locality: !locality.trim()
      ? 'Selecciona o escribe una localidad para continuar.'
      : !stationCodePreview(locality)
        ? 'La localidad debe generar un código de hasta 44 caracteres.'
        : '',
    name: form.name.trim() ? '' : 'Escribe el nombre público de la estación.',
  }), [locality, form.name])
  const locationErrors = useMemo(() => ({
    coordinates: coordinatesAreValid(form.latitude, form.longitude)
      ? '' : 'Selecciona un punto en el mapa o escribe coordenadas válidas.',
  }), [form.latitude, form.longitude])
  const identityValid = !identityErrors.locality && !identityErrors.name
  const locationValid = !locationErrors.coordinates
  const isSubmitting = Boolean(submissionStep)

  const updateForm = values => setForm(previous => ({ ...previous, ...values }))
  const handleFieldChange = event => updateForm({ [event.target.name]: event.target.value })
  const handleBlur = field => setTouched(previous => ({ ...previous, [field]: true }))

  const handleLocalityChange = event => {
    const typedLocality = event.target.value
    const nextLocality = matchingBogotaLocality(typedLocality)?.value || typedLocality
    setForm(previous => {
      return {
        ...previous,
        locality: nextLocality,
        name: !previous.name || previous.name === defaultName(previous.locality)
          ? defaultName(nextLocality) : previous.name,
      }
    })
  }

  const handleMapPick = (latitude, longitude) => {
    updateForm({ latitude: latitude.toFixed(6), longitude: longitude.toFixed(6) })
    setTouched(previous => ({ ...previous, coordinates: true }))
  }

  const continueToLocation = () => {
    setTouched({ locality: true, name: true })
    if (identityValid) setCurrentStep(2)
  }

  const handleSubmit = async event => {
    event.preventDefault()
    setTouched({ locality: true, name: true, coordinates: true })
    if (!identityValid || !locationValid) return

    setError('')
    let registration = pendingRegistration

    try {
      if (!registration) {
        setSubmissionStep('Asignando código y registrando credenciales…')
        const submittedName = form.name.trim()
        const authResponse = await registerStationAuth({
          name: submittedName,
          locality: locality.trim(),
          description: form.description,
        })
        registration = {
          stationCode: authResponse.data.stationCode,
          locality: authResponse.data.locality,
          secret: authResponse.data.secret,
          name: submittedName,
          authNameSynchronized: authResponse.data.name === submittedName,
          processingPayload: {
            stationCode: authResponse.data.stationCode,
            name: submittedName,
            locality: authResponse.data.locality,
            description: form.description,
            address: form.address,
            latitude: Number.parseFloat(form.latitude),
            longitude: Number.parseFloat(form.longitude),
          },
        }
        onPendingChange(registration)
        setCurrentStep(2)
      }

      if (!registration.authNameSynchronized) {
        setSubmissionStep('Guardando el nombre público…')
        await updateStationNameAuth(registration.stationCode, registration.name)
        registration = { ...registration, authNameSynchronized: true }
        onPendingChange(registration)
      }

      setSubmissionStep('Registrando ubicación y datos de la estación…')
      await registerStationProcessing(registration.processingPayload)
      onCreated(registration.secret, registration.stationCode)
    } catch (requestError) {
      const message = requestError.response?.data?.error
      setError(message || (registration
        ? 'Las credenciales ya existen, pero falta registrar la ubicación. Reintenta este paso.'
        : 'No se pudo crear la estación. Revisa los datos e inténtalo nuevamente.'))
      setSubmissionStep('')
    }
  }

  return (
    <Modal title="Nueva estación" onClose={isSubmitting ? null : onClose}>
      <form onSubmit={handleSubmit} className="admin-station-wizard" noValidate>
        <header className="admin-station-wizard__intro">
          <p className="admin-station-wizard__eyebrow">Configuración guiada</p>
          <h3>Crea una estación en dos pasos</h3>
          <p>Primero define cómo se identificará. Después marca dónde está instalada.</p>
        </header>

        <ol className="admin-station-steps" aria-label="Progreso del registro">
          <li className={currentStep === 1 ? 'is-current' : 'is-complete'} aria-current={currentStep === 1 ? 'step' : undefined}>
            <span>1</span><div><strong>Identidad</strong><small>Nombre y localidad</small></div>
          </li>
          <li className={currentStep === 2 ? 'is-current' : ''} aria-current={currentStep === 2 ? 'step' : undefined}>
            <span>2</span><div><strong>Ubicación</strong><small>Mapa y coordenadas</small></div>
          </li>
        </ol>

        {currentStep === 1 && (
          <section className="admin-station-wizard__step" aria-labelledby="station-identity-title">
            <div className="admin-station-wizard__step-heading">
              <h3 id="station-identity-title">¿Cómo reconocerás esta estación?</h3>
              <p>Estos datos se mostrarán en el mapa y en el panel de control.</p>
            </div>
            <div className="admin-form-grid">
              <Field
                label="Localidad *"
                name="locality"
                value={form.locality}
                onChange={handleLocalityChange}
                onBlur={() => handleBlur('locality')}
                list={localityListId}
                placeholder="Escribe una localidad, por ejemplo Fontibón o Sopo"
                required
                maxLength={100}
                disabled={isSubmitting || Boolean(pendingRegistration)}
                hint={recognizedLocality
                  ? `${recognizedLocality.value} es una localidad de Bogotá.`
                  : locality.trim()
                    ? 'Se registrará como otra localidad y se generará su código interno.'
                    : 'Escribe una localidad o elige una sugerencia de Bogotá.'}
                error={touched.locality ? identityErrors.locality : ''}
              />
              <datalist id={localityListId}>
                {BOGOTA_LOCALITIES.map(item => <option key={item.value} value={item.value} />)}
              </datalist>
              <div className="admin-station-code-card">
                <span className="admin-station-code-card__label">Código interno</span>
                <output>{codePreview || 'Se generará al indicar la localidad'}</output>
                <p>Se asigna automáticamente, no se puede editar y sirve para conectar el equipo.</p>
              </div>
              <Field
                label="Nombre de la estación *"
                name="name"
                value={form.name}
                onChange={handleFieldChange}
                onBlur={() => handleBlur('name')}
                placeholder="Ej. Estación Sopo"
                required
                maxLength={150}
                disabled={isSubmitting || Boolean(pendingRegistration)}
                hint="Este es el nombre público que verás en el dashboard."
                error={touched.name ? identityErrors.name : ''}
              />
            </div>
          </section>
        )}

        {currentStep === 2 && (
          <section className="admin-station-wizard__step" aria-labelledby="station-location-title">
            <div className="admin-station-wizard__step-heading">
              <h3 id="station-location-title">¿Dónde está instalada?</h3>
              <p>Marca el punto en el mapa o escribe las coordenadas manualmente.</p>
            </div>
            <div className="admin-station-summary" role="status">
              <span>Estación</span><strong>{form.name.trim() || 'Sin nombre'}</strong>
              <span>Localidad</span><strong>{locality.trim() || 'Sin localidad'}</strong>
              <span>Código interno</span><strong>{codePreview || 'Pendiente'}</strong>
            </div>
            <StationLocationPicker latitude={form.latitude} longitude={form.longitude} onPick={handleMapPick} />
            <div className="admin-form-grid admin-station-coordinates">
              <Field
                label="Latitud *"
                name="latitude"
                value={form.latitude}
                onChange={handleFieldChange}
                onBlur={() => handleBlur('coordinates')}
                placeholder="Ej. 4.6572"
                type="number"
                step="any"
                required
                disabled={isSubmitting}
                hint="Entre -90 y 90."
                error={touched.coordinates ? locationErrors.coordinates : ''}
              />
              <Field
                label="Longitud *"
                name="longitude"
                value={form.longitude}
                onChange={handleFieldChange}
                onBlur={() => handleBlur('coordinates')}
                placeholder="Ej. -74.0632"
                type="number"
                step="any"
                required
                disabled={isSubmitting}
                hint="Entre -180 y 180."
                error={touched.coordinates ? locationErrors.coordinates : ''}
              />
            </div>
            <details className="admin-station-details">
              <summary>Detalles adicionales (opcionales)</summary>
              <div className="admin-form-grid">
                <Field label="Dirección" name="address" value={form.address} onChange={handleFieldChange} placeholder="Calle 72 #10-07" disabled={isSubmitting} />
                <div aria-hidden="true" />
                <div className="admin-field admin-field--wide">
                  <label htmlFor="station-description">Descripción</label>
                  <textarea id="station-description" className="admin-textarea" name="description" value={form.description} onChange={handleFieldChange} rows={3} placeholder="Información útil sobre el sitio o su instalación" disabled={isSubmitting} />
                </div>
              </div>
            </details>
          </section>
        )}

        {error && <div className="admin-alert" role="alert">{error}</div>}
        {pendingRegistration && !isSubmitting && (
          <div className="admin-alert admin-alert--warning" role="status">
            Auth ya reservó {pendingRegistration.stationCode}. Completa únicamente la ubicación para terminar el registro.
          </div>
        )}
        {submissionStep && <div className="admin-alert admin-alert--warning" role="status">{submissionStep}</div>}

        <footer className="admin-station-wizard__actions">
          {currentStep === 2 && (
            <button type="button" onClick={() => setCurrentStep(1)} disabled={isSubmitting || Boolean(pendingRegistration)} className="admin-button admin-button--secondary">Atrás</button>
          )}
          <button type="button" onClick={onClose} disabled={isSubmitting} className="admin-button admin-button--quiet">
            {currentStep === 1 ? 'Cancelar' : 'Cerrar'}
          </button>
          {currentStep === 1 ? (
            <button type="button" onClick={continueToLocation} disabled={!identityValid || isSubmitting} className="admin-button admin-button--primary">Continuar a ubicación</button>
          ) : (
            <button type="submit" disabled={!locationValid || isSubmitting} className="admin-button admin-button--primary">
              {submissionStep || (pendingRegistration ? 'Completar registro' : 'Crear estación')}
            </button>
          )}
        </footer>
      </form>
    </Modal>
  )
}
