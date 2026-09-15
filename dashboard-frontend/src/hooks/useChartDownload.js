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
 * @param {string}         [csvTitle] - Stable Spanish filename label for CSV compatibility.
 */
export function useChartDownload(ref, title, data = [], fileLabel = '', svgTitle = '', stationCode = '', csvTitle = title) {
  // Refs que siempre tienen el valor actual — nunca quedan stale en closures
  const svgTitleRef   = useRef(svgTitle)
  const fileLabelRef  = useRef(fileLabel)
  const slugRef       = useRef('')
  const csvSlugRef    = useRef('')
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
    csvSlugRef.current = code + csvTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase() + extra
  }, [title, csvTitle, fileLabel, stationCode])

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

    const origW = chartSvg.viewBox?.baseVal?.width || Number(chartSvg.getAttribute('viewBox')?.split(/\s+/)[2]) || chartSvg.getBoundingClientRect().width || Number(chartSvg.getAttribute('width'))
    const origH = chartSvg.viewBox?.baseVal?.height || Number(chartSvg.getAttribute('viewBox')?.split(/\s+/)[3]) || chartSvg.getBoundingClientRect().height || Number(chartSvg.getAttribute('height'))

    const heading = svgTitleRef.current || title
    const maxChars = Math.max(18, Math.floor((origW - 24) / 7.5))
    const headingLines = heading.split(/\s+/).reduce((lines, word) => {
      if (!lines.length || (lines.at(-1) + ' ' + word).length > maxChars) lines.push(word)
      else lines[lines.length - 1] += ' ' + word
      return lines
    }, [])
    const TITLE_H = 18 + Math.max(1, headingLines.length) * 18
    const PADDING_X = 12
    const FONT_SIZE = 13

    const computedTheme = getComputedStyle(document.documentElement)
    const themeColor = (name, fallback) => {
      const value = computedTheme.getPropertyValue(name).trim()
      return value ? `rgb(${value})` : fallback
    }
    const themePaper = themeColor('--theme-paper-rgb', '#ffffff')
    const themeInk = themeColor('--theme-ink-rgb', '#1e293b')
    const themeLine = themeColor('--theme-line-rgb', '#e2e8f0')
    const themeMuted = themeColor('--theme-muted-rgb', '#64748b')

    const ns     = 'http://www.w3.org/2000/svg'
    const newSvg = document.createElementNS(ns, 'svg')
    newSvg.setAttribute('width',   String(origW))
    newSvg.setAttribute('height',  String(origH + TITLE_H))
    newSvg.setAttribute('viewBox', `0 0 ${origW} ${origH + TITLE_H}`)

    // Fondo alineado con el tema activo.
    const bg = document.createElementNS(ns, 'rect')
    bg.setAttribute('width',  '100%')
    bg.setAttribute('height', '100%')
    bg.setAttribute('fill',   themePaper)
    newSvg.appendChild(bg)

    // Título — lee el ref para tener el valor actual
    const text = document.createElementNS(ns, 'text')
    text.setAttribute('x',           String(PADDING_X))
    text.setAttribute('y',           String(TITLE_H / 2 + FONT_SIZE / 2 - 2))
    text.setAttribute('font-family', 'DM Sans, system-ui, sans-serif')
    text.setAttribute('font-size',   String(FONT_SIZE))
    text.setAttribute('font-weight', '600')
    text.setAttribute('fill',        themeInk)
    headingLines.forEach((line, index) => { const span = document.createElementNS(ns, 'tspan'); span.setAttribute('x', String(PADDING_X)); span.setAttribute('y', String(22 + index * 18)); span.textContent = line; text.appendChild(span) })
    newSvg.appendChild(text)

    // Separador
    const line = document.createElementNS(ns, 'line')
    line.setAttribute('x1',           '0')
    line.setAttribute('y1',           String(TITLE_H - 1))
    line.setAttribute('x2',           String(origW))
    line.setAttribute('y2',           String(TITLE_H - 1))
    line.setAttribute('stroke',       themeLine)
    line.setAttribute('stroke-width', '1')
    newSvg.appendChild(line)

    // ── Leyenda HTML de Recharts → elementos SVG nativos ───────────────────
    // Recharts renderiza la leyenda como un div flotante fuera del <svg>.
    // La leemos del DOM y la redibujamos como <rect>+<text> en el SVG.
    const legendItems = []
    const rechartsWrapper = ref.current.querySelector('.recharts-wrapper')
    if (rechartsWrapper) {
      const legendEl = rechartsWrapper.querySelector('.recharts-legend-wrapper')
      if (legendEl) {
        const items = legendEl.querySelectorAll('.recharts-legend-item')
        items.forEach(item => {
          const colorEl = item.querySelector('.recharts-surface') ?? item.querySelector('svg')
          const labelEl = item.querySelector('.recharts-legend-item-text')
          if (!labelEl) return
          // Color: intentamos leer stroke o fill del path/line/rect dentro del ícono SVG
          let color = '#94a3b8'
          if (colorEl) {
            const shape = colorEl.querySelector('path, line, rect')
            if (shape) {
              color = shape.getAttribute('stroke') || shape.getAttribute('fill') || color
            }
          }
          legendItems.push({ label: labelEl.textContent ?? '', color })
        })
      }
    }

    if (!legendItems.length) {
      ref.current.querySelectorAll('.ux-series button[aria-pressed="true"]').forEach(item => {
        const shape = item.querySelector('line')
        legendItems.push({ label: item.textContent, color: shape ? getComputedStyle(shape).stroke : themeInk })
      })
    }
    const legendLines = legendItems.map(item => ({ ...item, lines: item.label.split(/\s+/).reduce((lines, word) => {
      if (!lines.length || (lines.at(-1) + ' ' + word).length > maxChars) lines.push(word)
      else lines[lines.length - 1] += ' ' + word
      return lines
    }, []) }))
    const LEGEND_H = legendLines.reduce((height, item) => height + item.lines.length * 18 + 8, 0)

    // Ajustar altura total del SVG contenedor
    const totalH = origH + TITLE_H + LEGEND_H
    newSvg.setAttribute('height',  String(totalH))
    newSvg.setAttribute('viewBox', `0 0 ${origW} ${totalH}`)

    // Gráfica desplazada hacia abajo (debajo del título)
    const g = document.createElementNS(ns, 'g')
    g.setAttribute('transform', `translate(0, ${TITLE_H})`)
    const clone = chartSvg.cloneNode(true)
    const originalNodes = [chartSvg, ...chartSvg.querySelectorAll('*')]
    const copiedNodes = [clone, ...clone.querySelectorAll('*')]
    copiedNodes.forEach((element, index) => {
      const style = getComputedStyle(originalNodes[index])
      for (const attribute of ['fill', 'stroke', 'font-family', 'font-size', 'font-weight']) {
        const value = style.getPropertyValue(attribute)
        if (value) element.setAttribute(attribute, value)
      }
    })
    Array.from(clone.childNodes).forEach(child => g.appendChild(child.cloneNode(true)))
    newSvg.appendChild(g)

    let legendY = TITLE_H + origH + 18
    legendLines.forEach(item => {
      const swatch = document.createElementNS(ns, 'rect')
      swatch.setAttribute('x', '12'); swatch.setAttribute('y', String(legendY - 9))
      swatch.setAttribute('width', '10'); swatch.setAttribute('height', '3'); swatch.setAttribute('fill', item.color)
      newSvg.appendChild(swatch)
      item.lines.forEach((line, index) => {
        const label = document.createElementNS(ns, 'text')
        label.setAttribute('x', '30'); label.setAttribute('y', String(legendY + index * 18))
        label.setAttribute('font-family', 'system-ui, sans-serif'); label.setAttribute('font-size', '12'); label.setAttribute('fill', themeMuted)
        label.textContent = line; newSvg.appendChild(label)
      })
      legendY += item.lines.length * 18 + 8
    })

    return { svg: newSvg, width: origW, height: totalH }
  }, [ref, title])

  // ── SVG ───────────────────────────────────────────────────────────────────
  const downloadSVG = useCallback(() => {
    const result = buildExportSvg()
    if (!result) throw new Error('Chart unavailable')

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
    return new Promise((resolve, reject) => {
      const result = buildExportSvg()
      if (!result) { reject(new Error('Chart unavailable')); return }

      const SCALE = 2
      const { svg, width, height } = result

      const serializer = new XMLSerializer()
      const svgStr = serializer.serializeToString(svg)
      const blob   = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' })
      const url    = URL.createObjectURL(blob)

      const img  = new Image()
      img.onload = () => {
        try {
        const canvas  = document.createElement('canvas')
        canvas.width  = width  * SCALE
        canvas.height = height * SCALE
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('Canvas unavailable')
        ctx.scale(SCALE, SCALE)
        ctx.drawImage(img, 0, 0)
        URL.revokeObjectURL(url)

        const link    = document.createElement('a')
        link.download = `${slugRef.current}.png`
        link.href     = canvas.toDataURL('image/png')
        link.click()
        resolve()
        } catch (error) { URL.revokeObjectURL(url); reject(error) }
      }
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Chart image unavailable')) }
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
        if (typeof val === 'string' && /[",\r\n]/.test(val)) return `"${val.replaceAll('"', '""')}"`
        return val ?? ''
      }).join(',')
    )

    const csv  = '\uFEFF' + [headers.join(','), ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url  = URL.createObjectURL(blob)

    const link    = document.createElement('a')
    link.download = `${csvSlugRef.current}.csv`
    link.href     = url
    link.click()
    URL.revokeObjectURL(url)
  }, [])

  return { downloadPNG, downloadSVG, downloadCSV }
}
