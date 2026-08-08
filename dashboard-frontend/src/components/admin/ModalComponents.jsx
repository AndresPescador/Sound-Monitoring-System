export function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4
                    bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-bg border border-border rounded-2xl
                      shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-text">{title}</h2>
          {onClose && (
            <button onClick={onClose}
                    className="text-text-light hover:text-text transition-colors text-lg leading-none">
              ✕
            </button>
          )}
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  )
}

export function Field({ label, name, value, onChange, placeholder, required }) {
  return (
    <div>
      <label className="block text-xs font-medium text-text-muted mb-1">{label}</label>
      <input
        type="text" name={name} value={value} onChange={onChange}
        placeholder={placeholder} required={required}
        className="w-full px-3 py-2 border border-border rounded-lg text-sm
                   text-text bg-surface focus:outline-none focus:ring-2 focus:ring-primary"
      />
    </div>
  )
}