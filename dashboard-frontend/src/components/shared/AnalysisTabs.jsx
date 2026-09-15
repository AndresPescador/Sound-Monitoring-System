import { useId } from 'react'
export default function AnalysisTabs({ items, value, onChange, label, children }) {
  const id = useId()
  const select = (index) => {
    onChange(items[index].id)
    document.getElementById(`${id}-${items[index].id}`)?.focus()
  }
  return <>
    <div className="ux-tabs" role="tablist" aria-label={label}>
      {items.map((item, index) => <button type="button" key={item.id} id={`${id}-${item.id}`} role="tab" aria-selected={value === item.id}
        aria-controls={`${id}-panel`} tabIndex={value === item.id ? 0 : -1} onClick={() => onChange(item.id)}
        onKeyDown={event => {
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
            : event.key === 'ArrowRight' ? (index + 1) % items.length : event.key === 'ArrowLeft' ? (index + items.length - 1) % items.length : null
          if (next !== null) { event.preventDefault(); select(next) }
        }}>{item.label}</button>)}
    </div>
    <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${value}`} className="ux-tab-content">{children}</div>
  </>
}
