import { serverMessage, operationStatus } from '../../i18n/serverMessages'
import { defaultT, message as localizedMessage } from '../../i18n/core.mjs'
import { useLanguage } from '../../context/LanguageContext'
import { useCallback, useEffect, useMemo, useState } from 'react'
import AdminLayout from '../../components/admin/AdminLayout'
import { CreateStationModal } from '../../components/admin/CreateStationModal'
import { SecretDisplayModal } from '../../components/admin/SecretDisplayModal'
import { EditStationModal } from '../../components/admin/EditStationModal'
import {
  listStationsAdmin,
  changeStationStatusAuth,
  changeStationStatusProcessing,
  deleteStationAuth,
  rotateStationSecret,
  getStationSyncStatuses,
  retryStationSync,
  getStationLifecycleOperations,
  retryStationLifecycleOperation,
} from '../../api/admin'

const formatDateTime = (value, t = defaultT) => {
  if (!value) return null
  return new Intl.DateTimeFormat(t.locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function StationSkeleton() {
  const { t } = useLanguage()
  return (
    <div className="admin-skeleton-list" role="status" aria-label={t('admin.loading_stations')}>
      {[0, 1, 2].map(item => (
        <div className="admin-skeleton-row" key={item} aria-hidden="true"><span /><span /></div>
      ))}
    </div>
  )
}

export default function AdminStations() {
  const { t } = useLanguage()
  const [stations, setStations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [secretData, setSecretData] = useState(null)
  const [editStation, setEditStation] = useState(null)
  const [deletingCode, setDeletingCode] = useState('')
  const [actionLoading, setActionLoading] = useState('')
  const [syncNotice, setSyncNotice] = useState('')

  const fetchStations = useCallback(async () => {
    setError('')
    try {
      const [response, syncResponse, lifecycleResponse] = await Promise.all([
        listStationsAdmin(),
        getStationSyncStatuses(),
        getStationLifecycleOperations(),
      ])
      const statuses = new Map()
      // La API ordena primero la operación más reciente; conserva esa versión.
      syncResponse.data.forEach(item => {
        if (!statuses.has(item.stationCode)) statuses.set(item.stationCode, item)
      })
      const byCode = new Map(response.data.map(station => [station.stationCode, {
        ...station,
        lifecycleStatus: 'READY',
        sync: statuses.get(station.stationCode),
      }]))
      lifecycleResponse.data.forEach(operation => {
        const existing = byCode.get(operation.stationCode)
        byCode.set(operation.stationCode, {
          ...(existing || {
            stationCode: operation.stationCode,
            name: operation.name,
            locality: operation.locality,
            latitude: operation.latitude,
            longitude: operation.longitude,
            active: false,
            lastSeenAt: null,
          }),
          active: false,
          lifecycleStatus: operation.lifecycleStatus,
          lifecycleOperation: operation,
        })
      })
      setStations(Array.from(byCode.values()))
    } catch {
      setError(localizedMessage('admin.could_not_load_stations_check_your_connection_and_try'))
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
      setError(localizedMessage('admin.could_not_change_the_status_in_both_services_check'))
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
      setError(localizedMessage('admin.could_not_rotate_the_secret_try_again'))
    } finally {
      setActionLoading('')
    }
  }

  const handleRetrySync = async (stationCode) => {
    setActionLoading(stationCode)
    try {
      const response = await retryStationSync(stationCode)
      setSyncNotice(serverMessage(response.data.message))
      fetchStations()
    } catch {
      setError(localizedMessage('admin.could_not_retry_synchronization_try_again'))
    } finally {
      setActionLoading('')
    }
  }

  const handleRetryLifecycle = async (operationId, stationCode) => {
    setActionLoading(stationCode)
    try {
      const response = await retryStationLifecycleOperation(operationId)
      setSyncNotice(serverMessage(response.data.message))
      setLoading(true)
      fetchStations()
    } catch {
      setError(localizedMessage('admin.could_not_retry_the_lifecycle_operation'))
    } finally {
      setActionLoading('')
    }
  }

  const handleDelete = async (stationCode) => {
    setError('')
    setActionLoading(stationCode)
    try {
      const response = await deleteStationAuth(stationCode)
      setSyncNotice(serverMessage(response.data.message))
      setDeletingCode('')
      setLoading(true)
      fetchStations()
    } catch {
      setError(localizedMessage('admin.could_not_start_the_coordinated_station_deletion'))
    } finally {
      setActionLoading('')
    }
  }

  const handleCreated = (registration) => {
    setShowCreate(false)
    setSecretData({
      ...registration,
      newSecret: registration.secret,
    })
    setLoading(true)
    fetchStations()
  }

  return (
    <AdminLayout>
      <div className="admin-page">
        <header className="admin-page-header">
          <div>
            <h1 tabIndex={-1}>{t('admin.stations')}</h1>
            <p>{t('admin.coordinate_registration_operational_status_and_credentials_for_the_binaural')}</p>
          </div>
          <div className="admin-page-header__actions">
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="admin-button admin-button--primary"
            >{t('admin.new_station')}</button>
          </div>
        </header>

        <dl className="admin-summary" aria-label={t('admin.station_summary')}>
          <div className="admin-summary__item admin-summary__item--accent">
            <dt>{t('maps.active_stations')}</dt>
            <dd>{loading ? '—' : totals.active}</dd>
          </div>
          <div className="admin-summary__item">
            <dt>{t('admin.total_registered')}</dt>
            <dd>{loading ? '—' : totals.total}</dd>
          </div>
          <div className="admin-summary__item">
            <dt>{t('admin.out_of_operation')}</dt>
            <dd>{loading ? '—' : totals.inactive}</dd>
          </div>
        </dl>

        {error && (
          <div className="admin-alert" role="alert">
            <span>{t(error)}</span>
            <button type="button" onClick={() => setError('')} className="admin-alert__dismiss">{t('admin.close')}</button>
          </div>
        )}
        {syncNotice && (
          <div className="admin-alert" role="status">
            <span>{t(syncNotice)}</span>
            <button type="button" onClick={() => setSyncNotice('')} className="admin-alert__dismiss">{t('admin.close')}</button>
          </div>
        )}

        <section className="admin-panel" aria-labelledby="station-list-title">
          <div className="admin-panel__header">
            <div>
              <h2 id="station-list-title">{t('admin.registered_network')}</h2>
              <p>{t('admin.status_changes_are_coordinated_between_auth_and_processing')}</p>
            </div>
            <span className="admin-panel__count">{loading ? '…' : t('common.station_count', { count: stations.length, value: t.number(stations.length) })}</span>
          </div>

          {loading ? (
            <StationSkeleton />
          ) : stations.length === 0 ? (
            <div className="admin-empty">
              <h2>{t('admin.the_network_has_no_stations_yet')}</h2>
              <p>{t('admin.register_credentials_first_then_geographic_details_through_a_single')}</p>
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="admin-button admin-button--secondary"
              >{t('admin.register_the_first_station')}</button>
            </div>
          ) : (
            <div className="admin-station-list">
              {stations.map(station => {
                const isBusy = actionLoading === station.stationCode
                const lifecyclePending = Boolean(station.lifecycleOperation)
                const lastSeen = formatDateTime(station.lastSeenAt, t)
                const latitude = Number.isFinite(station.latitude) ? t.fixed(station.latitude, 4) : '—'
                const longitude = Number.isFinite(station.longitude) ? t.fixed(station.longitude, 4) : '—'

                return (
                  <article className="admin-station-row" key={station.stationCode}>
                    <div className="admin-station-row__identity">
                      <div className="admin-station-row__topline">
                        <h3 className="admin-station-row__name">{station.name}</h3>
                        <span className={`admin-status admin-status--${lifecyclePending ? 'pending' : station.active ? 'active' : 'inactive'}`}>
                          {lifecyclePending
                            ? station.lifecycleStatus === 'DELETING' ? t('admin.deleting') : t('admin.provisioning')
                            : station.active ? t('maps.active_2') : t('common.inactive')}
                        </span>
                        <span className="admin-station-row__code">{station.stationCode}</span>
                      </div>
                      <p className="admin-station-row__meta">
                        <span>{station.locality || t('admin.locality_not_registered')}</span>
                        <span className="admin-station-row__coords">{latitude}, {longitude}</span>
                        <span>{lastSeen ? t('admin.last_signal', { p0: lastSeen }) : t('admin.no_signal_recorded')}</span>
                      </p>
                      {station.sync && (
                        <p className="admin-station-row__meta" role="status">{t('admin.synchronization_pending')}{station.sync.attempts}{' ' + t('admin.attempt')}{station.sync.attempts === 1 ? '' : 's'}).
                        </p>
                      )}
                      {station.lifecycleOperation && (
                        <p className="admin-station-row__meta" role="status">{t('admin.operation') + ' '}{t(operationStatus(station.lifecycleOperation.status))} ({station.lifecycleOperation.attempts}{' ' + t('admin.attempt')}{station.lifecycleOperation.attempts === 1 ? '' : 's'}).
                          {station.lifecycleOperation.lastError ? ' ' + t(serverMessage(station.lifecycleOperation.lastError)) : ''}
                        </p>
                      )}
                    </div>

                    <div className="admin-station-row__actions" aria-label={t('admin.actions_for', { p0: station.name })}>
                      {lifecyclePending ? (
                        <>
                          <button
                            type="button"
                            onClick={() => handleRetryLifecycle(station.lifecycleOperation.operationId, station.stationCode)}
                            disabled={isBusy}
                            className="admin-button admin-button--quiet"
                          >
                            {isBusy ? t('admin.retrying') : t('admin.retry_operation')}
                          </button>
                          {station.lifecycleStatus === 'PROVISIONING' && (
                            <button
                              type="button"
                              onClick={() => handleRotateSecret(station.stationCode)}
                              disabled={isBusy}
                              className="admin-button admin-button--warning"
                            >{t('admin.rotate_secret')}</button>
                          )}
                        </>
                      ) : <>
                      <button
                        type="button"
                        onClick={() => setEditStation(station)}
                        disabled={isBusy}
                        className="admin-button admin-button--quiet"
                      >{t('admin.edit_2')}</button>
                      {station.sync && (
                        <button
                          type="button"
                          onClick={() => handleRetrySync(station.stationCode)}
                          disabled={isBusy}
                          className="admin-button admin-button--quiet"
                        >
                          {isBusy ? t('maps.updating') : t('admin.retry_synchronization')}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(station)}
                        disabled={isBusy}
                        className="admin-button admin-button--quiet"
                      >
                        {isBusy ? t('maps.updating') : station.active ? t('admin.deactivate') : t('admin.activate')}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRotateSecret(station.stationCode)}
                        disabled={isBusy}
                        className="admin-button admin-button--warning"
                      >{t('admin.rotate_secret')}</button>
                      {deletingCode !== station.stationCode && (
                        <button
                          type="button"
                          onClick={() => setDeletingCode(station.stationCode)}
                          disabled={isBusy}
                          className="admin-button admin-button--danger"
                        >{t('admin.delete') + ' '}</button>
                      )}
                      </>}
                    </div>

                    {deletingCode === station.stationCode && (
                      <div className="admin-confirmation" role="alert">
                        <p>{t('admin.delete') + ' '}<strong>{station.stationCode}</strong>{' ' + t('admin.will_immediately_block_its_credentials_delete_its_measurements_and')}</p>
                        <div className="admin-confirmation__actions">
                          <button
                            type="button"
                            onClick={() => setDeletingCode('')}
                            className="admin-button admin-button--secondary"
                          >{t('admin.cancel')}</button>
                          <button
                            type="button"
                            onClick={() => handleDelete(station.stationCode)}
                            disabled={isBusy}
                            className="admin-button admin-button--danger-solid"
                          >
                            {isBusy ? t('admin.deleting_2') : t('admin.yes_remove_and_purge')}
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
        />
      )}

      {secretData && (
        <SecretDisplayModal data={secretData} onClose={() => setSecretData(null)} />
      )}

      {editStation && (
        <EditStationModal
          station={editStation}
          onClose={() => setEditStation(null)}
          onSaved={(result) => {
            setEditStation(null)
            if (result?.syncStatus === 'PENDING') setSyncNotice(serverMessage(result.message, 'admin.changes_pending'))
            setLoading(true)
            fetchStations()
          }}
        />
      )}
    </AdminLayout>
  )
}
