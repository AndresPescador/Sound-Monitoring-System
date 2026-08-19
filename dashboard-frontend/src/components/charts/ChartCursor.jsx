export default function ChartCursor({ points, x, y, width, height, stroke = '#1d4ed8' }) {
  const lineX = points?.[0]?.x ?? (x != null && width != null ? x + width / 2 : null)
  const lineY1 = points?.[0]?.y ?? y
  const lineY2 = points?.[1]?.y ?? (y != null && height != null ? y + height : null)

  if (lineX == null || lineY1 == null || lineY2 == null) return null

  return (
    <line
      x1={lineX}
      y1={lineY1}
      x2={lineX}
      y2={lineY2}
      stroke={stroke}
      strokeDasharray="4 4"
      strokeWidth={1.5}
      vectorEffect="non-scaling-stroke"
      pointerEvents="none"
    />
  )
}
