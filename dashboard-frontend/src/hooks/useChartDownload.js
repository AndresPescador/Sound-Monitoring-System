import { useCallback } from 'react'

/**
 * Hook que provee funciones para descargar un chart como PNG, SVG o CSV.
 *
 * @param {React.RefObject} ref   - ref apuntando al div del SectionCard
 * @param {string}          title - nombre base del archivo descargado
 * @param {Array}           data  - datos crudos de la gráfica (para CSV)
 */
export function useChartDownload(ref, title, data = []) {
  const slug = title.replace(/[^a-z0-9]/gi, '_').toLowerCase()

  // ── PNG via html2canvas ────────────────────────────────────────────────────
  const downloadPNG = useCallback(async () => {
    if (!ref.current) return
    try {
      // html2canvas debe estar disponible globalmente (instalado en el proyecto)
      const html2canvas = (await import('html2canvas')).default
      const canvas = await html2canvas(ref.current, {
        backgroundColor: '#ffffff',
        scale: 2,               // retina quality
        useCORS: true,
        logging: false,
      })
      const link = document.createElement('a')
      link.download = `${slug}.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
    } catch (err) {
      console.error('Error generando PNG:', err)
    }
  }, [ref, slug])

  // ── SVG — serializa el primer <svg> encontrado en el card ──────────────────
  const downloadSVG = useCallback(() => {
    if (!ref.current) return
    const svgEl = ref.current.querySelector('svg')
    if (!svgEl) {
      console.warn('No se encontró un elemento <svg> en este card.')
      return
    }

    // Clona para no mutar el DOM real
    const clone = svgEl.cloneNode(true)

    // Inline los estilos computados de los textos para que el SVG sea portable
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')

    const serializer = new XMLSerializer()
    const svgStr = serializer.serializeToString(clone)
    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)

    const link = document.createElement('a')
    link.download = `${slug}.svg`
    link.href = url
    link.click()
    URL.revokeObjectURL(url)
  }, [ref, slug])

  // ── CSV — serializa data[] a texto plano con BOM UTF-8 ────────────────────
  const downloadCSV = useCallback(() => {
    if (!data.length) {
      console.warn('No hay datos para exportar como CSV.')
      return
    }

    const headers = Object.keys(data[0])
    const rows = data.map(row =>
      headers.map(h => {
        const val = row[h]
        // Envuelve en comillas si contiene comas o saltos
        if (typeof val === 'string' && (val.includes(',') || val.includes('\n'))) {
          return `"${val}"`
        }
        return val ?? ''
      }).join(',')
    )

    const csv = '\uFEFF' + [headers.join(','), ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)

    const link = document.createElement('a')
    link.download = `${slug}.csv`
    link.href = url
    link.click()
    URL.revokeObjectURL(url)
  }, [data, slug])

  return { downloadPNG, downloadSVG, downloadCSV }
}
