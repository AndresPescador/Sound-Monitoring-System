import { useEffect, useRef, useState } from 'react'
// Container width matters: a desktop 3D panel can be narrower than a phone.
export default function AnalysisFilters({ children }) {
  const ref = useRef(null)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    let previous
    const update = () => {
      const wide = element.getBoundingClientRect().width >= 700 && !window.matchMedia?.('(max-height: 500px) and (max-width: 1023px)').matches
      if (wide !== previous) { previous = wide; setOpen(wide) }
    }
    update()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return <details ref={ref} className="ux-filters" open={open} onToggle={e => { if (open !== e.currentTarget.open) setOpen(e.currentTarget.open) }}>{children}</details>
}
