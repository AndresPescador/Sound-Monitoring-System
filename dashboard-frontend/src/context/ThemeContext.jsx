import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { flushSync } from 'react-dom'

const THEME_STORAGE_KEY = 'sound-monitoring-theme'
const DEFAULT_THEME = 'light'

function readStoredTheme() {
  if (typeof document !== 'undefined') {
    const initialTheme = document.documentElement.dataset.theme
    if (initialTheme === 'dark' || initialTheme === 'light') return initialTheme
  }

  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}

function persistTheme(theme) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // La preferencia sigue funcionando durante la sesión si storage está bloqueado.
  }
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme
  const themeColor = document.querySelector('meta[name="theme-color"]')
  if (themeColor) themeColor.setAttribute('content', theme === 'dark' ? '#07101f' : '#f8fbff')
  persistTheme(theme)
}

function getTransitionPoint(point) {
  const fallbackX = window.innerWidth / 2
  const fallbackY = window.innerHeight / 2
  const x = Number.isFinite(point?.x) && point.x > 0 ? point.x : fallbackX
  const y = Number.isFinite(point?.y) && point.y > 0 ? point.y : fallbackY
  return { x, y }
}

function animateThemeReveal(transition, point) {
  transition.ready.then(() => {
    const { x, y } = getTransitionPoint(point)
    const endRadius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y),
    )

    document.documentElement.animate(
      {
        clipPath: [
          `circle(0px at ${x}px ${y}px)`,
          `circle(${endRadius}px at ${x}px ${y}px)`,
        ],
      },
      {
        duration: 460,
        easing: 'cubic-bezier(0.645, 0.045, 0.355, 1)',
        fill: 'both',
        pseudoElement: '::view-transition-new(root)',
      },
    )
  }).catch(() => {
    // La transición es una mejora visual; el tema ya cambió correctamente.
  })
}

const ThemeContext = createContext(null)

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(readStoredTheme)

  const setThemeWithTransition = useCallback((nextTheme, point) => {
    if (nextTheme === theme) return

    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const updateTheme = () => {
      applyTheme(nextTheme)
      flushSync(() => setTheme(nextTheme))
    }

    if (reducedMotion || typeof document.startViewTransition !== 'function') {
      updateTheme()
      return
    }

    try {
      const transition = document.startViewTransition(updateTheme)
      animateThemeReveal(transition, point)
    } catch {
      updateTheme()
    }
  }, [theme])

  const toggleTheme = useCallback((point) => {
    setThemeWithTransition(theme === 'dark' ? 'light' : 'dark', point)
  }, [setThemeWithTransition, theme])

  const value = useMemo(() => ({
    theme,
    isDark: theme === 'dark',
    setTheme: setThemeWithTransition,
    toggleTheme,
  }), [setThemeWithTransition, theme, toggleTheme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme debe usarse dentro de ThemeProvider')
  return context
}
