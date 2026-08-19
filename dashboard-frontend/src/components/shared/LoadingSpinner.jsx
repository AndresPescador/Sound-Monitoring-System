export default function LoadingSpinner({ label = 'Cargando...' }) {
  return (
    <div className="dashboard-loading" role="status" aria-live="polite">
      <span className="dashboard-loading__mark" aria-hidden="true"><i /><i /><i /></span>
      <span className="dashboard-loading__label">{label}</span>
    </div>
  )
}
