import { useEffect, useRef, useState } from 'react'
import { Modal } from './ModalComponents'

export function SecretDisplayModal({ data, onClose }) {
  const [copyState, setCopyState] = useState('idle')
  const resetTimer = useRef(null)
  const secret = data.newSecret || data.secret || ''

  useEffect(() => () => clearTimeout(resetTimer.current), [])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(secret)
      setCopyState('copied')
      resetTimer.current = setTimeout(() => setCopyState('idle'), 3000)
    } catch {
      setCopyState('error')
    }
  }

  return (
    <Modal title="Secret generado" onClose={null}>
      <div className="admin-secret">
        <div className="admin-alert admin-alert--warning" role="alert">
          <span>
            <strong>Este valor no se volverá a mostrar.</strong><br />
            Cópialo y configúralo en la Raspberry Pi antes de cerrar esta ventana.
            Si lo pierdes, deberás rotar el secret nuevamente.
          </span>
        </div>

        <div>
          <p className="admin-secret__label">Estación</p>
          <p className="admin-secret__station">{data.stationCode}</p>
        </div>

        <div>
          <p className="admin-secret__label">Secret</p>
          <div className="admin-secret__value">
            <code>{secret}</code>
            <button type="button" onClick={handleCopy} className="admin-button admin-button--secondary">
              {copyState === 'copied' ? 'Copiado' : 'Copiar'}
            </button>
          </div>
        </div>

        {copyState === 'error' && (
          <div className="admin-alert" role="alert">
            No se pudo copiar automáticamente. Selecciona el valor y cópialo de forma manual.
          </div>
        )}

        {data.message && <p className="admin-secret__message">{data.message}</p>}

        <div className="admin-form__actions">
          <button type="button" onClick={onClose} className="admin-button admin-button--primary">
            Ya lo guardé, cerrar
          </button>
        </div>
      </div>
    </Modal>
  )
}
