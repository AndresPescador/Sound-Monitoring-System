import { useEffect, useId } from 'react'

export function Modal({ title, onClose, children }) {
  const titleId = useId()

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && onClose) onClose()
    }
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  return (
    <div className="admin-modal-backdrop">
      <section className="admin-modal" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="admin-modal__header">
          <h2 id={titleId}>{title}</h2>
          {onClose && (
            <button type="button" onClick={onClose} className="admin-modal__close" aria-label={`Cerrar ${title}`}>
              Cerrar
            </button>
          )}
        </header>
        <div className="admin-modal__body">{children}</div>
      </section>
    </div>
  )
}

export function Field({
  label,
  name,
  value,
  onChange,
  placeholder,
  required,
  type = 'text',
  disabled = false,
  readOnly = false,
  step,
  hint,
}) {
  const inputId = useId()
  const hintId = useId()

  return (
    <div className="admin-field">
      <label htmlFor={inputId}>{label}</label>
      <input
        id={inputId}
        className="admin-input"
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        readOnly={readOnly}
        step={step}
        aria-describedby={hint ? hintId : undefined}
      />
      {hint && <p id={hintId} className="admin-field__hint">{hint}</p>}
    </div>
  )
}
