import client from './client'

export const getCompare = (params) => client.get('/compare', { params })
