import { Component } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useLanguage } from '../../context/LanguageContext'
class Boundary extends Component {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? this.props.fallback : this.props.children }
}
export default function MapRenderBoundary({ children }) {
  const { t } = useLanguage()
  const location = useLocation()
  return <Boundary fallback={<div className="ux-map-fallback" role="alert"><p>{t('ux.error')}</p><Link className="dashboard-button" to={`${location.pathname.replace('/mapa-3d', '/mapa-2d')}${location.search}`}>{t('ux.fallback')}</Link></div>}>{children}</Boundary>
}
