import client from './client'

export const getStations       = (config = {}) => client.get('/stations', config)
export const getStationSummary = (code, config = {}) => client.get(`/stations/${code}/summary`, config)
