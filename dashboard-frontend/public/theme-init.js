(() => {
  try {
    const storedTheme = window.localStorage.getItem('sound-monitoring-theme')
    const theme = storedTheme === 'dark' ? 'dark' : 'light'
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
    document
      .querySelector('meta[name="theme-color"]')
      .setAttribute('content', theme === 'dark' ? '#07101f' : '#f8fbff')
  } catch {
    document.documentElement.dataset.theme = 'light'
    document.documentElement.style.colorScheme = 'light'
  }
})()
