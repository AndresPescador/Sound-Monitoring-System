import { useState } from 'react'
import { Modal } from './ModalComponents'

export function SecretDisplayModal({ data, onClose }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(data.newSecret)
    setCopied(true)
    setTimeout(() => setCopied(false), 3000)
  }

  return (
    <Modal title="Secret generado" onClose={null}>  {/* sin X — obliga a leer */}
      <div className="space-y-4">
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <p className="text-sm font-medium text-amber-800 mb-1">
            Este valor no se volverá a mostrar
          </p>
          <p className="text-xs text-amber-700">
            Cópialo ahora y configúralo en la Raspberry Pi antes de cerrar esta ventana.
            Si lo pierdes, deberás rotar el secret nuevamente.
          </p>
        </div>

        <div>
          <p className="text-xs text-text-muted mb-1">Estación</p>
          <p className="font-mono text-sm text-text">{data.stationCode}</p>
        </div>

        <div>
          <p className="text-xs text-text-muted mb-1">Secret</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 font-mono text-sm bg-surface border border-border
                             rounded-lg px-3 py-2 text-text break-all select-all">
              {data.newSecret}
            </code>
            <button
              onClick={handleCopy}
              className="shrink-0 px-3 py-2 text-xs border border-border rounded-lg
                         text-text-muted hover:text-text transition-colors"
            >
              {copied ? '✓ Copiado' : 'Copiar'}
            </button>
          </div>
        </div>

        <p className="text-xs text-text-light">{data.message}</p>

        <div className="flex justify-end pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm bg-primary text-white rounded-lg
                       hover:bg-primary-dark transition-colors"
          >
            Ya lo copié — cerrar
          </button>
        </div>
      </div>
    </Modal>
  )
}