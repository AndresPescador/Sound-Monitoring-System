import client from './client'

export const getStations       = ()     => client.get('/stations')
export const getStationSummary = (code) => client.get(`/stations/${code}/summary`)
