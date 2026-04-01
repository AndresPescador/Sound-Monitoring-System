import client from './client'

export const getSystemStats = () => client.get('/system/stats')
