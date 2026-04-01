export default function StatCard({ label, value, sub, accent = false }) {
  return (
    <div className={`bg-bg rounded-lg border p-4 flex flex-col gap-1
      ${accent ? 'border-primary' : 'border-border'}`}>
      <span className="text-xs font-display font-medium text-text-muted uppercase tracking-wide">
        {label}
      </span>
      <span className={`text-2xl font-display font-bold ${accent ? 'text-primary' : 'text-text'}`}>
        {value ?? '—'}
      </span>
      {sub && <span className="text-xs text-text-light font-mono">{sub}</span>}
    </div>
  )
}
