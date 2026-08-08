import { useState, useEffect, useCallback } from 'react'
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

export default function AdminStations() {
  const [stations, setStations]           = useState([])
  const [loading, setLoading]             = useState(true)
  const [error, setError]                 = useState('')

  // Modales
  const [showCreate, setShowCreate]       = useState(false)
  const [secretData, setSecretData]       = useState(null)   // { stationCode, secret, message }
  const [editStation, setEditStation]     = useState(null)   // station object
  const [deletingCode, setDeletingCode]   = useState('')
  const [actionLoading, setActionLoading] = useState('')     // stationCode en proceso

  const fetchStations = useCallback(async () => {
    try {
      const res = await listStationsAdmin()
      setStations(res.data)
    } catch {
      setError('No se pudieron cargar las estaciones.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchStations() }, [fetchStations])

  // ── Cambiar estado activo/inactivo ─────────────────────────────────────────
  const handleToggleStatus = async (station) => {
    const newActive = !station.active
    setActionLoading(station.stationCode)
    try {
      // Actualizar en ambos servicios en paralelo
      await Promise.all([
        changeStationStatusAuth(station.stationCode, newActive),
        changeStationStatusProcessing(station.stationCode, newActive),
      ])
      setStations(prev =>
        prev.map(s =>
          s.stationCode === station.stationCode ? { ...s, active: newActive } : s
        )
      )
    } catch {
      setError('Error al cambiar el estado de la estación.')
    } finally {
      setActionLoading('')
    }
  }

  // ── Rotar secret ───────────────────────────────────────────────────────────
  const handleRotateSecret = async (stationCode) => {
    setActionLoading(stationCode)
    try {
      const res = await rotateStationSecret(stationCode)
      setSecretData(res.data)
    } catch {
      setError('Error al rotar el secret.')
    } finally {
      setActionLoading('')
    }
  }

  // ── Eliminar estación ──────────────────────────────────────────────────────
  const handleDelete = async (stationCode) => {
    setActionLoading(stationCode)
    try {
      await deleteStationProcessing(stationCode)
      setStations(prev => prev.filter(s => s.stationCode !== stationCode))
      setDeletingCode('')
    } catch {
      setError('Error al eliminar la estación. Verifica que no tenga datos activos.')
    } finally {
      setActionLoading('')
    }
  }

  // ── Después de crear exitosamente ──────────────────────────────────────────
  const handleCreated = (secret, stationCode) => {
    setShowCreate(false)
    setSecretData({ stationCode, newSecret: secret,
      message: 'Estación creada. Configura este secret en la Raspberry Pi. No se volverá a mostrar.' })
    fetchStations()
  }

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-display font-semibold text-text">Estaciones</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-primary text-white text-sm font-medium
                     rounded-lg hover:bg-primary-dark transition-colors"
        >
          + Nueva estación
        </button>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg
                        text-sm text-noise-high flex justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="ml-4 font-medium">✕</button>
        </div>
      )}

      {loading ? (
        <p className="text-text-muted text-sm">Cargando estaciones...</p>
      ) : stations.length === 0 ? (
        <p className="text-text-muted text-sm">No hay estaciones registradas.</p>
      ) : (
        <div className="space-y-3">
          {stations.map(station => (
            <div
              key={station.stationCode}
              className="bg-bg border border-border rounded-xl p-5
                         flex flex-col sm:flex-row sm:items-center gap-4"
            >
              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-sm font-medium text-text">
                    {station.stationCode}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    station.active
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-100 text-gray-500'
                  }`}>
                    {station.active ? 'Activa' : 'Inactiva'}
                  </span>
                </div>
                <p className="text-sm text-text mt-0.5 truncate">{station.name}</p>
                <p className="text-xs text-text-light mt-0.5">
                  {station.locality} · {station.latitude?.toFixed(4)}, {station.longitude?.toFixed(4)}
                </p>
                {station.lastSeenAt && (
                  <p className="text-xs text-text-light mt-0.5">
                    Última señal: {new Date(station.lastSeenAt).toLocaleString('es-CO')}
                  </p>
                )}
              </div>

              {/* Acciones */}
              <div className="flex flex-wrap gap-2 shrink-0">
                <button
                  onClick={() => setEditStation(station)}
                  disabled={actionLoading === station.stationCode}
                  className="px-3 py-1.5 text-xs border border-border rounded-lg
                             text-text-muted hover:text-text hover:border-text-muted
                             transition-colors disabled:opacity-40"
                >
                  Editar
                </button>

                <button
                  onClick={() => handleToggleStatus(station)}
                  disabled={actionLoading === station.stationCode}
                  className="px-3 py-1.5 text-xs border border-border rounded-lg
                             text-text-muted hover:text-text hover:border-text-muted
                             transition-colors disabled:opacity-40"
                >
                  {actionLoading === station.stationCode
                    ? '...'
                    : station.active ? 'Desactivar' : 'Activar'}
                </button>

                <button
                  onClick={() => handleRotateSecret(station.stationCode)}
                  disabled={actionLoading === station.stationCode}
                  className="px-3 py-1.5 text-xs border border-amber-200 rounded-lg
                             text-amber-700 hover:bg-amber-50
                             transition-colors disabled:opacity-40"
                >
                  Rotar secret
                </button>

                {deletingCode === station.stationCode ? (
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleDelete(station.stationCode)}
                      disabled={actionLoading === station.stationCode}
                      className="px-3 py-1.5 text-xs bg-noise-high text-white
                                 rounded-lg hover:bg-red-700 transition-colors
                                 disabled:opacity-40"
                    >
                      Confirmar
                    </button>
                    <button
                      onClick={() => setDeletingCode('')}
                      className="px-3 py-1.5 text-xs border border-border rounded-lg
                                 text-text-muted hover:text-text transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setDeletingCode(station.stationCode)}
                    disabled={actionLoading === station.stationCode}
                    className="px-3 py-1.5 text-xs border border-red-200 rounded-lg
                               text-noise-high hover:bg-red-50
                               transition-colors disabled:opacity-40"
                  >
                    Eliminar
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modales */}
      {showCreate && (
        <CreateStationModal
          onClose={() => setShowCreate(false)}
          onCreated={handleCreated}
        />
      )}

      {secretData && (
        <SecretDisplayModal
          data={secretData}
          onClose={() => setSecretData(null)}
        />
      )}

      {editStation && (
        <EditStationModal
          station={editStation}
          onClose={() => setEditStation(null)}
          onSaved={() => { setEditStation(null); fetchStations() }}
        />
      )}
    </AdminLayout>
  )
}
