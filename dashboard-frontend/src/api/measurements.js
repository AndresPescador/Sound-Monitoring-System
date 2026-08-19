import client from './client'

export const getMeasurements = (code, params) =>
  client.get(`/stations/${code}/measurements`, { params })

export const getCompareMeasurements = (params) =>
  client.get('/compare/measurements', { params })

export const getRawMeasurements = (code, params) =>
  client.get(`/stations/${code}/measurements/raw`, { params })

export const getBinaural = (code, params) =>
  client.get(`/stations/${code}/binaural`, { params })

export const getSpectral = (code, params) =>
  client.get(`/stations/${code}/spectral`, { params })

export const getAllRawMeasurements = async (code, params, onPage) => {
  const all = []
  let cursor
  let page = 0
  let metadata = null

  do {
    const response = await getRawMeasurements(code, {
      ...params,
      limit: 1000,
      ...(cursor ? { cursor } : {}),
    })
    const body = response.data
    metadata = body
    all.push(...(body.data ?? []))
    page += 1
    onPage?.({ page, loaded: all.length, total: body.total_count ?? all.length })
    cursor = body.has_more ? body.next_cursor : null
  } while (cursor)

  return { data: all, metadata }
}
