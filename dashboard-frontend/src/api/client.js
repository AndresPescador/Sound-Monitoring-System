import axios from 'axios'

const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost/dashboard',
  timeout: 15000,
})

export default client
