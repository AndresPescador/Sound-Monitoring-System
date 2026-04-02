import { useState } from 'react'

/**
 * Ícono de información con tooltip al hacer hover.
 * Muestra una explicación no técnica de la métrica cuando se pasa el mouse.
 * 
 * @param {string} text - Texto descriptivo a mostrar en el tooltip
 */
export default function ChartInfo({ text }) {
  const [open, setOpen] = useState(false)

  return (
    <span className="relative inline-flex items-center ml-1.5">
      <button
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="w-4 h-4 rounded-full bg-surface border border-border text-text-muted
                   text-xs font-display font-bold flex items-center justify-center
                   hover:border-primary hover:text-primary transition-colors cursor-help"
        aria-label="Información sobre esta métrica"
      >
        ?
      </button>
      {open && (
        <span
          className="absolute z-50 left-6 top-0 w-72 bg-white border border-border
                     rounded-lg shadow-lg px-3 py-2.5 text-xs font-sans text-text leading-relaxed
                     pointer-events-none"
        >
          {text}
        </span>
      )}
    </span>
  )
}
