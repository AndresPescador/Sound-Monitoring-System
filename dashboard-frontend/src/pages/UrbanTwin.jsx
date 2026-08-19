import Map3DLayout from '../components/map3d/Map3DLayout'
import { Map3DProvider } from '../context/Map3DContext'

export default function UrbanTwin() {
  return (
    <Map3DProvider>
      <Map3DLayout />
    </Map3DProvider>
  )
}
