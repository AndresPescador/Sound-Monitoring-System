import { useEffect, useRef, useState } from 'react'

const TRANSITION_MS = 180

// Structural axis changes replace the number and position of categories.
// A short exit/enter crossfade is more reliable than making Recharts interpolate
// two incompatible point arrays.
export default function useChartAxisTransition(axisMode) {
  const renderedModeRef = useRef(axisMode)
  const timerRef = useRef(null)
  const frameRef = useRef(null)
  const [renderedAxisMode, setRenderedAxisMode] = useState(axisMode)
  const [phase, setPhase] = useState('idle')

  useEffect(() => {
    if (axisMode === renderedModeRef.current) return undefined

    setPhase('exit')
    timerRef.current = setTimeout(() => {
      renderedModeRef.current = axisMode
      setRenderedAxisMode(axisMode)
      setPhase('enter')

      const reveal = () => setPhase('idle')
      frameRef.current = typeof window !== 'undefined' && window.requestAnimationFrame
        ? window.requestAnimationFrame(reveal)
        : setTimeout(reveal, 16)
    }, TRANSITION_MS)

    return () => {
      clearTimeout(timerRef.current)
      if (typeof window !== 'undefined' && window.cancelAnimationFrame && frameRef.current) {
        window.cancelAnimationFrame(frameRef.current)
      } else {
        clearTimeout(frameRef.current)
      }
    }
  }, [axisMode])

  return { renderedAxisMode, phase }
}
