import { useState, useRef, useEffect } from 'react'

/**
 * Menú desplegable con opciones PNG / SVG / CSV.
 * Se coloca en el header de SectionCard junto al ChartInfo.
 *
 * @param {() => void} onPNG - handler descarga PNG
 * @param {() => void} onSVG - handler descarga SVG
 * @param {() => void} onCSV - handler descarga CSV (si no se pasa, la opción se deshabilita)
 * @param {boolean}    downloading - muestra spinner mientras descarga PNG
 */
export default function ChartDownloadMenu({ onPNG, onSVG, onCSV, downloading = false }) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef(null)

  // Cierra el menú al hacer click fuera
  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handle = (fn) => {
    setOpen(false)
    fn?.()
  }

  return (
    <div ref={menuRef} className="dashboard-export relative inline-flex items-center">
      {/* Botón trigger */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        disabled={downloading}
        title="Exportar gráfica"
        className="dashboard-export__trigger"
      >
        {downloading ? (
          // Mini spinner mientras genera PNG
          <span className="w-3 h-3 border border-border border-t-primary rounded-full animate-spin block" />
        ) : (
          // Ícono de descarga
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none"
               stroke="currentColor" strokeWidth="1.6"
               strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 2v8M5 7l3 3 3-3" />
            <path d="M2 12h12" />
          </svg>
        )}
      </button>

      {/* Menú desplegable */}
      {open && (
        <div className="
          absolute right-0 top-7 z-50
          bg-surface text-text border border-border rounded-lg shadow-md
          min-w-[140px] py-1 overflow-hidden
        ">
          {/* PNG */}
          <button
            type="button"
            onClick={() => handle(onPNG)}
            className="dashboard-export__item"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none"
                 stroke="currentColor" strokeWidth="1.5"
                 strokeLinecap="round" strokeLinejoin="round">
              <rect x="1" y="1" width="14" height="14" rx="2"/>
              <path d="M4 6h2a1.5 1.5 0 010 3H4V6z"/>
              <path d="M10 6v7M10 6l3 3M10 6l-3 3"/>
            </svg>
            Imagen PNG
          </button>

          {/* SVG */}
          <button
            type="button"
            onClick={() => handle(onSVG)}
            className="dashboard-export__item"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none"
                 stroke="currentColor" strokeWidth="1.5"
                 strokeLinecap="round" strokeLinejoin="round">
              <rect x="1" y="1" width="14" height="14" rx="2"/>
              <path d="M4 9.5C4 10.9 5 11.5 6 11.5s2-.5 2-1.5-1-1.5-2-1.5-2-.6-2-1.5S5 5.5 6 5.5s2 .6 2 1.5"/>
              <path d="M10 5.5l1.5 6 1.5-6"/>
            </svg>
            Gráfica SVG
          </button>

          {/* Separador */}
          <div className="my-1 border-t border-border" />

          {/* CSV */}
          <button
            type="button"
            onClick={() => handle(onCSV)}
            disabled={!onCSV}
            className="dashboard-export__item"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none"
                 stroke="currentColor" strokeWidth="1.5"
                 strokeLinecap="round" strokeLinejoin="round">
              <rect x="1" y="1" width="14" height="14" rx="2"/>
              <path d="M4 5h8M4 8h8M4 11h5"/>
            </svg>
            Datos CSV
          </button>
        </div>
      )}
    </div>
  )
}
