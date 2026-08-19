import client from './client'

export const getHourly       = (code, params, config = {}) => client.get(`/stations/${code}/hourly`,        { params, ...config })
export const getDailyProfile = (code, params, config = {}) => client.get(`/stations/${code}/daily-profile`, { params, ...config })
