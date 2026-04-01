export default function LoadingSpinner({ label = 'Cargando...' }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-text-muted">
      <div className="w-8 h-8 border-2 border-border border-t-primary rounded-full animate-spin" />
      <span className="text-sm font-sans">{label}</span>
    </div>
  )
}
