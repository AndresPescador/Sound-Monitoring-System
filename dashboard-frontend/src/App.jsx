import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/layout/Layout'
import Home from './pages/Home'
import StationDetail from './pages/StationDetail'
import Compare from './pages/Compare'
import OpenData from './pages/OpenData'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/"                    element={<Home />} />
          <Route path="/stations/:code"      element={<StationDetail />} />
          <Route path="/compare"             element={<Compare />} />
          <Route path="/data"                element={<OpenData />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
