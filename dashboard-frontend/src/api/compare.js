import client from './client'

export const getCompare = (params, config = {}) => client.get('/compare', { params, ...config })
