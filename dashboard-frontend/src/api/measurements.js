import client from './client'

export const getMeasurements = (code, params) =>
  client.get(`/stations/${code}/measurements`, { params })

export const getBinaural = (code, params) =>
  client.get(`/stations/${code}/binaural`, { params })

export const getSpectral = (code, params) =>
  client.get(`/stations/${code}/spectral`, { params })
