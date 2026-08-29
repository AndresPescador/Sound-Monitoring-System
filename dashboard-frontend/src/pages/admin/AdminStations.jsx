import { useCallback, useEffect, useMemo, useState } from 'react'
import AdminLayout from '../../components/admin/AdminLayout'
import { CreateStationModal } from '../../components/admin/CreateStationModal'
import { SecretDisplayModal } from '../../components/admin/SecretDisplayModal'
import { EditStationModal } from '../../components/admin/EditStationModal'
import {
  listStationsAdmin,
  changeStationStatusAuth,
  changeStationStatusProcessing,
  deleteStationProcessing,
  rotateStationSecret,
} from '../../api/admin'

const formatDateTime = (value) => {
  if (!value) return null
  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function StationSkeleton() {
  return (
    <div className="admin-skeleton-list" role="status" aria-label="Cargando estaciones">
      {[0, 1, 2].map(item => (
        <div className="admin-skeleton-row" key={item} aria-hidden="true"><span /><span /></div>
      ))}
    </div>
  )
}

export default function AdminStations() {
  const [stations, setStations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [pendingStationRegistration, setPendingStationRegistration] = useState(null)
  const [secretData, setSecretData] = useState(null)
  const [editStation, setEditStation] = useState(null)
  const [deletingCode, setDeletingCode] = useState('')
  const [actionLoading, setActionLoading] = useState('')

  const fetchStations = useCallback(async () => {
    setError('')
    try {
      const response = await listStationsAdmin()
      setStations(response.data)
    } catch {
      setError('No se pudieron cargar las estaciones. Revisa la conexión e inténtalo de nuevo.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchStations() }, [fetchStations])

  const totals = useMemo(() => {
    const active = stations.filter(station => station.active).length
    return { total: stations.length, active, inactive: stations.length - active }
  }, [stations])

  const handleToggleStatus = async (station) => {
    const nextActive = !station.active
    setError('')
    setActionLoading(station.stationCode)
    try {
      await Promise.all([
        changeStationStatusAuth(station.stationCode, nextActive),
        changeStationStatusProcessing(station.stationCode, nextActive),
      ])
      setStations(previous => previous.map(item => (
        item.stationCode === station.stationCode ? { ...item, active: nextActive } : item
      )))
    } catch {
      setError('No se pudo cambiar el estado en ambos servicios. Verifica la sincronización de la estación.')
    } finally {
      setActionLoading('')
    }
  }

  const handleRotateSecret = async (stationCode) => {
    setError('')
    setActionLoading(stationCode)
    try {
      const response = await rotateStationSecret(stationCode)
      setSecretData(response.data)
    } catch {
      setError('No se pudo rotar el secret. Inténtalo nuevamente.')
    } finally {
      setActionLoading('')
    }
  }

  const handleDelete = async (stationCode) => {
    setError('')
    setActionLoading(stationCode)
    try {
      await deleteStationProcessing(stationCode)
      setStations(previous => previous.filter(station => station.stationCode !== stationCode))
      setDeletingCode('')
    } catch {
      setError('No se pudo eliminar la estación del servicio de procesamiento.')
    } finally {
      setActionLoading('')
    }
  }

  const handleCreated = (secret, stationCode) => {
    setPendingStationRegistration(null)
    setShowCreate(false)
    setSecretData({
      stationCode,
      newSecret: secret,
      message: 'Estación creada. Configura este secret en la Raspberry Pi. No se volverá a mostrar.',
    })
    setLoading(true)
    fetchStations()
  }

  return (
    <AdminLayout>
      <div className="admin-page">
        <header className="admin-page-header">
          <div>
            <h1 tabIndex={-1}>Estaciones</h1>
            <p>Coordina el registro, estado operativo y credenciales de la red binaural.</p>
          </div>
          <div className="admin-page-header__actions">
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="admin-button admin-button--primary"
            >
              {pendingStationRegistration
                ? `Reanudar ${pendingStationRegistration.stationCode}`
                : 'Nueva estación'}
            </button>
          </div>
        </header>

        <dl className="admin-summary" aria-label="Resumen de estaciones">
          <div className="admin-summary__item admin-summary__item--accent">
            <dt>Estaciones activas</dt>
            <dd>{loading ? '—' : totals.active}</dd>
          </div>
          <div className="admin-summary__item">
            <dt>Total registradas</dt>
            <dd>{loading ? '—' : totals.total}</dd>
          </div>
          <div className="admin-summary__item">
            <dt>Fuera de operación</dt>
            <dd>{loading ? '—' : totals.inactive}</dd>
          </div>
        </dl>

        {error && (
          <div className="admin-alert" role="alert">
            <span>{error}</span>
            <button type="button" onClick={() => setError('')} className="admin-alert__dismiss">
              Cerrar
            </button>
          </div>
        )}

        <section className="admin-panel" aria-labelledby="station-list-title">
          <div className="admin-panel__header">
            <div>
              <h2 id="station-list-title">Red registrada</h2>
              <p>Los cambios de estado se coordinan entre Auth y Processing.</p>
            </div>
            <span className="admin-panel__count">{loading ? '…' : `${stations.length} estaciones`}</span>
          </div>

          {loading ? (
            <StationSkeleton />
          ) : stations.length === 0 ? (
            <div className="admin-empty">
              <h2>La red aún no tiene estaciones</h2>
              <p>Registra primero las credenciales y luego los datos geográficos desde un único flujo.</p>
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="admin-button admin-button--secondary"
              >
                {pendingStationRegistration
                  ? `Reanudar ${pendingStationRegistration.stationCode}`
                  : 'Registrar la primera estación'}
              </button>
            </div>
          ) : (
            <div className="admin-station-list">
              {stations.map(station => {
                const isBusy = actionLoading === station.stationCode
                const lastSeen = formatDateTime(station.lastSeenAt)
                const latitude = Number.isFinite(station.latitude) ? station.latitude.toFixed(4) : '—'
                const longitude = Number.isFinite(station.longitude) ? station.longitude.toFixed(4) : '—'

                return (
                  <article className="admin-station-row" key={station.stationCode}>
                    <div className="admin-station-row__identity">
                      <div className="admin-station-row__topline">
                        <h3 className="admin-station-row__name">{station.name}</h3>
                        <span className={`admin-status admin-status--${station.active ? 'active' : 'inactive'}`}>
                          {station.active ? 'Activa' : 'Inactiva'}
                        </span>
                        <span className="admin-station-row__code">{station.stationCode}</span>
                      </div>
                      <p className="admin-station-row__meta">
                        <span>{station.locality || 'Localidad sin registrar'}</span>
                        <span className="admin-station-row__coords">{latitude}, {longitude}</span>
                        <span>{lastSeen ? `Última señal: ${lastSeen}` : 'Sin señal registrada'}</span>
                      </p>
                    </div>

                    <div className="admin-station-row__actions" aria-label={`Acciones para ${station.name}`}>
                      <button
                        type="button"
                        onClick={() => setEditStation(station)}
                        disabled={isBusy}
                        className="admin-button admin-button--quiet"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(station)}
                        disabled={isBusy}
                        className="admin-button admin-button--quiet"
                      >
                        {isBusy ? 'Actualizando…' : station.active ? 'Desactivar' : 'Activar'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRotateSecret(station.stationCode)}
                        disabled={isBusy}
                        className="admin-button admin-button--warning"
                      >
                        Rotar secret
                      </button>
                      {deletingCode !== station.stationCode && (
                        <button
                          type="button"
                          onClick={() => setDeletingCode(station.stationCode)}
                          disabled={isBusy}
                          className="admin-button admin-button--danger"
                        >
                          Eliminar
                        </button>
                      )}
                    </div>

                    {deletingCode === station.stationCode && (
                      <div className="admin-confirmation" role="alert">
                        <p>
                          Eliminar <strong>{station.stationCode}</strong> de Processing también elimina sus
                          mediciones y agregaciones. Esta acción no elimina su registro en Auth.
                        </p>
                        <div className="admin-confirmation__actions">
                          <button
                            type="button"
                            onClick={() => setDeletingCode('')}
                            className="admin-button admin-button--secondary"
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(station.stationCode)}
                            disabled={isBusy}
                            className="admin-button admin-button--danger-solid"
                          >
                            {isBusy ? 'Eliminando…' : 'Sí, eliminar datos'}
                          </button>
                        </div>
                      </div>
                    )}
                  </article>
                )
              })}
            </div>
          )}
        </section>
      </div>

      {showCreate && (
        <CreateStationModal
          onClose={() => setShowCreate(false)}
          onCreated={handleCreated}
          pendingRegistration={pendingStationRegistration}
          onPendingChange={setPendingStationRegistration}
        />
      )}

      {secretData && (
        <SecretDisplayModal data={secretData} onClose={() => setSecretData(null)} />
      )}

      {editStation && (
        <EditStationModal
          station={editStation}
          onClose={() => setEditStation(null)}
          onSaved={() => {
            setEditStation(null)
            setLoading(true)
            fetchStations()
          }}
        />
      )}
    </AdminLayout>
  )
}
