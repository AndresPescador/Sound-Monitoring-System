import { defaultT } from '../../i18n/core.mjs'
import { useLanguage } from '../../context/LanguageContext'
import { Link } from 'react-router-dom'
import { ROUTES } from '../../routes'

const MAP_VIEWS = (t = defaultT) => ([
  {
    key: '2d',
    title: t('landing.2d_map'),
    mode: '2D',
    description: t('landing.stations_current_levels_and_access_to_acoustic_details'),
    action: t('landing.open_2d_map'),
    href: ROUTES.map2D,
    image: '/assets/landing-map-2d.webp',
    alt: t('landing.map_of_bogota_with_a_network_of_acoustic_stations'),
  },
  {
    key: '3d',
    title: t('landing.3d_map'),
    mode: '3D',
    description: t('landing.terrain_buildings_and_intensity_columns_for_each_station'),
    action: t('landing.open_3d_map'),
    href: ROUTES.map3D,
    image: '/assets/landing-map-3d.webp',
    alt: t('landing.three_dimensional_urban_twin_with_wireframe_buildings_and_a'),
  },
])

export default function BogotaMapGateway() {
  const { t } = useLanguage()
  return (
    <div className="landing-map-gateway">
      {MAP_VIEWS(t).map(({ key, title, mode, description, action, href, image, alt }) => (
        <Link
          key={key}
          className={`landing-map-choice landing-map-choice--${key}`}
          to={href}
          aria-label={action}
        >
          <div className="landing-map-copy">
            <span className="landing-map-mode">{mode}</span>
            <div>
              <h3>{title}</h3>
              <p>{description}</p>
            </div>
            <span className="landing-map-action">{action}</span>
          </div>
          <div className="landing-map-visual" aria-hidden="true">
            <img src={image} alt={alt} loading="lazy" />
          </div>
        </Link>
      ))}
    </div>
  )
}
