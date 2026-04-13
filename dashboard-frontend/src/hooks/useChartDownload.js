import { useCallback, useRef, useEffect } from 'react'

/**
 * Hook que provee funciones para descargar un chart como PNG, SVG o CSV.
 *
 * PNG y SVG son idénticos: ambos se generan desde el SVG de Recharts
 * con el título incrustado en la parte superior.
 *
 * Usa refs internas para que svgTitle, fileLabel y slug reflejen siempre
 * el valor actual en el momento de la descarga, sin importar cuándo cambie
 * la métrica seleccionada.
 *
 * @param {React.RefObject} ref         - ref del div SectionCard
 * @param {string}          title       - título base de la card
 * @param {Array}           data        - datos crudos para CSV
 * @param {string}         [fileLabel]  - sufijo para el nombre de archivo (ej: clave de métrica)
 * @param {string}         [svgTitle]   - título que se incrusta en SVG/PNG (si difiere del title)
 * @param {string}         [stationCode]- código de estación para incluir en el nombre del archivo
 */
export function useChartDownload(ref, title, data = [], fileLabel = '', svgTitle = '', stationCode = '') {
  // Refs que siempre tienen el valor actual — nunca quedan stale en closures
  const svgTitleRef   = useRef(svgTitle)
  const fileLabelRef  = useRef(fileLabel)
  const slugRef       = useRef('')
  const dataRef       = useRef(data)

  // Actualiza las refs en cada render sin recrear callbacks
  useEffect(() => { svgTitleRef.current  = svgTitle  }, [svgTitle])
  useEffect(() => { fileLabelRef.current = fileLabel }, [fileLabel])
  useEffect(() => { dataRef.current      = data      }, [data])

  // Recalcula el slug cada vez que cambian sus inputs
  useEffect(() => {
    const base  = title.replace(/[^a-z0-9]/gi, '_').toLowerCase()
    const code  = stationCode ? stationCode.toLowerCase() + '_' : ''
    const extra = fileLabel ? '_' + fileLabel.replace(/[^a-z0-9]/gi, '_').toLowerCase() : ''
    slugRef.current = code + base + extra
  }, [title, fileLabel, stationCode])

  // ── Utilidad compartida: construye el SVG exportable con título ───────────
  const buildExportSvg = useCallback(() => {
    if (!ref.current) return null

    const wrapper  = ref.current.querySelector('.recharts-wrapper svg')
    const allSvgs  = Array.from(ref.current.querySelectorAll('svg'))
    const chartSvg = wrapper ?? allSvgs.reduce((biggest, svg) => {
      const a = svg.getBoundingClientRect()
      const b = biggest?.getBoundingClientRect() ?? { width: 0, height: 0 }
      return a.width * a.height > b.width * b.height ? svg : biggest
    }, null)

    if (!chartSvg) return null

    const origW = chartSvg.viewBox?.baseVal?.width  || chartSvg.getBoundingClientRect().width
    const origH = chartSvg.viewBox?.baseVal?.height || chartSvg.getBoundingClientRect().height

    const TITLE_H   = 36
    const PADDING_X = 12
    const FONT_SIZE = 13

    const ns     = 'http://www.w3.org/2000/svg'
    const newSvg = document.createElementNS(ns, 'svg')
    newSvg.setAttribute('xmlns',   'http://www.w3.org/2000/svg')
    newSvg.setAttribute('width',   String(origW))
    newSvg.setAttribute('height',  String(origH + TITLE_H))
    newSvg.setAttribute('viewBox', `0 0 ${origW} ${origH + TITLE_H}`)

    // Fondo blanco
    const bg = document.createElementNS(ns, 'rect')
    bg.setAttribute('width',  '100%')
    bg.setAttribute('height', '100%')
    bg.setAttribute('fill',   '#ffffff')
    newSvg.appendChild(bg)

    // Título — lee el ref para tener el valor actual
    const text = document.createElementNS(ns, 'text')
    text.setAttribute('x',           String(PADDING_X))
    text.setAttribute('y',           String(TITLE_H / 2 + FONT_SIZE / 2 - 2))
    text.setAttribute('font-family', 'DM Sans, system-ui, sans-serif')
    text.setAttribute('font-size',   String(FONT_SIZE))
    text.setAttribute('font-weight', '600')
    text.setAttribute('fill',        '#1e293b')
    text.textContent = svgTitleRef.current || title
    newSvg.appendChild(text)

    // Separador
    const line = document.createElementNS(ns, 'line')
    line.setAttribute('x1',           '0')
    line.setAttribute('y1',           String(TITLE_H - 1))
    line.setAttribute('x2',           String(origW))
    line.setAttribute('y2',           String(TITLE_H - 1))
    line.setAttribute('stroke',       '#e2e8f0')
    line.setAttribute('stroke-width', '1')
    newSvg.appendChild(line)

    // Gráfica desplazada hacia abajo
    const g = document.createElementNS(ns, 'g')
    g.setAttribute('transform', `translate(0, ${TITLE_H})`)
    const clone = chartSvg.cloneNode(true)
    Array.from(clone.childNodes).forEach(child => g.appendChild(child.cloneNode(true)))
    newSvg.appendChild(g)

    return { svg: newSvg, width: origW, height: origH + TITLE_H }
  }, [ref, title])

  // ── SVG ───────────────────────────────────────────────────────────────────
  const downloadSVG = useCallback(() => {
    const result = buildExportSvg()
    if (!result) { console.warn('No se encontró SVG de gráfica en este card.'); return }

    const serializer = new XMLSerializer()
    const svgStr = serializer.serializeToString(result.svg)
    const blob   = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' })
    const url    = URL.createObjectURL(blob)

    const link    = document.createElement('a')
    link.download = `${slugRef.current}.svg`
    link.href     = url
    link.click()
    URL.revokeObjectURL(url)
  }, [buildExportSvg])

  // ── PNG ───────────────────────────────────────────────────────────────────
  const downloadPNG = useCallback(() => {
    return new Promise((resolve) => {
      const result = buildExportSvg()
      if (!result) { console.warn('No se encontró SVG de gráfica en este card.'); resolve(); return }

      const SCALE = 2
      const { svg, width, height } = result

      const serializer = new XMLSerializer()
      const svgStr = serializer.serializeToString(svg)
      const blob   = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' })
      const url    = URL.createObjectURL(blob)

      const img  = new Image()
      img.onload = () => {
        const canvas  = document.createElement('canvas')
        canvas.width  = width  * SCALE
        canvas.height = height * SCALE
        const ctx = canvas.getContext('2d')
        ctx.scale(SCALE, SCALE)
        ctx.drawImage(img, 0, 0)
        URL.revokeObjectURL(url)

        const link    = document.createElement('a')
        link.download = `${slugRef.current}.png`
        link.href     = canvas.toDataURL('image/png')
        link.click()
        resolve()
      }
      img.onerror = () => { URL.revokeObjectURL(url); console.error('Error renderizando SVG.'); resolve() }
      img.src = url
    })
  }, [buildExportSvg])

  // ── CSV ───────────────────────────────────────────────────────────────────
  const downloadCSV = useCallback(() => {
    const current = dataRef.current
    if (!current.length) { console.warn('No hay datos para exportar.'); return }

    const headers = Object.keys(current[0])
    const rows    = current.map(row =>
      headers.map(h => {
        const val = row[h]
        if (typeof val === 'string' && (val.includes(',') || val.includes('\n'))) return `"${val}"`
        return val ?? ''
      }).join(',')
    )

    const csv  = '\uFEFF' + [headers.join(','), ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url  = URL.createObjectURL(blob)

    const link    = document.createElement('a')
    link.download = `${slugRef.current}.csv`
    link.href     = url
    link.click()
    URL.revokeObjectURL(url)
  }, [])

  return { downloadPNG, downloadSVG, downloadCSV }
}