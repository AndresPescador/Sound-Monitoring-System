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
  onBlur,
  placeholder,
  required,
  type = 'text',
  disabled = false,
  readOnly = false,
  step,
  maxLength,
  list,
  hint,
  error,
}) {
  const inputId = useId()
  const hintId = useId()
  const errorId = useId()

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
        onBlur={onBlur}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        readOnly={readOnly}
        step={step}
        maxLength={maxLength}
        list={list}
        aria-describedby={[hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined}
        aria-invalid={error ? true : undefined}
      />
      {hint && <p id={hintId} className="admin-field__hint">{hint}</p>}
      {error && <p id={errorId} className="admin-field__error">{error}</p>}
    </div>
  )
}

export function SelectField({ label, name, value, onChange, onBlur, options, required, disabled = false, hint, error }) {
  const inputId = useId()
  const hintId = useId()
  const errorId = useId()

  return (
    <div className="admin-field">
      <label htmlFor={inputId}>{label}</label>
      <select
        id={inputId}
        className="admin-input"
        name={name}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        required={required}
        disabled={disabled}
        aria-describedby={[hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined}
        aria-invalid={error ? true : undefined}
      >
        <option value="">Selecciona una localidad</option>
        {options.map(option => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
      {hint && <p id={hintId} className="admin-field__hint">{hint}</p>}
      {error && <p id={errorId} className="admin-field__error">{error}</p>}
    </div>
  )
}
