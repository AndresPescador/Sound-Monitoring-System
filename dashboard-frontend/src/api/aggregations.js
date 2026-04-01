import client from './client'

export const getHourly       = (code, params) => client.get(`/stations/${code}/hourly`,        { params })
export const getDailyProfile = (code, params) => client.get(`/stations/${code}/daily-profile`, { params })
