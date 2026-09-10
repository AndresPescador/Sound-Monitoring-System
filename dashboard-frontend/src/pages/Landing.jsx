import { defaultT } from '../i18n/core.mjs'
import { useLanguage } from '../context/LanguageContext'
import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import BogotaMapGateway from '../components/landing/BogotaMapGateway'
import ThemeToggle from '../components/shared/ThemeToggle'
import LanguageSwitcher from '../components/shared/LanguageSwitcher'
import { ROUTES } from '../routes'
import './landing.css'

const waveform = [18, 34, 24, 58, 44, 72, 36, 82, 54, 28, 64, 40, 76, 48, 30, 56, 68, 38, 78, 46, 26, 62, 42, 70]
const metricLabels = (t = defaultT) => (['Leq', 'ILD', t('landing.correlation'), 'L10', 'L50', 'L90', t('maps.spectrum')])

const landingSectionGaps = {
  mapas: 0,
  proyecto: 144,
  'estacion-real': 48,
  sistema: 188,
  binaural: 160,
  datos: 48,
}

function SoundWave({ channel, values, reverse = false }) {
  const { t } = useLanguage()
  const sequence = reverse ? [...values].reverse() : values
  return (
    <div className="landing-wave-row" aria-label={t('landing.illustrative_signal_for_the_channel', { p0: channel })}>
      <span className="landing-wave-label">{channel}</span>
      <div className="landing-wave-bars" aria-hidden="true">
        {sequence.map((height, index) => (
          <span
            key={`${channel}-${index}`}
            style={{ '--wave-height': `${height}%`, '--wave-delay': `${index * -85}ms` }}
          />
        ))}
      </div>
    </div>
  )
}

function getLandingDocumentTop(element) {
  let documentTop = 0
  let current = element

  while (current) {
    documentTop += current.offsetTop
    current = current.offsetParent
  }

  return documentTop
}

function scrollToLandingSection(sectionId, behavior = 'smooth', updateHash = true) {
  const target = document.getElementById(sectionId)
  if (!target) return

  const header = document.querySelector('.landing-nav')
  const headerHeight = header?.getBoundingClientRect().height ?? 0
  const documentTop = getLandingDocumentTop(target)
  const sectionGap = sectionId === 'binaural' && window.innerWidth <= 1050
    ? 72
    : (landingSectionGaps[sectionId] ?? 28)
  let targetTop = documentTop - headerHeight - sectionGap

  if (sectionId === 'proyecto') {
    const projectMosaic = document.querySelector('.landing-project-mosaic')

    if (projectMosaic) {
      const projectMosaicRect = projectMosaic.getBoundingClientRect()
      const projectFrameGap = window.innerWidth > 1050 ? 120 : 0
      targetTop = projectMosaicRect.top + window.scrollY - headerHeight - projectFrameGap
    }
  }

  if (sectionId === 'inicio') {
    const metricRail = document.querySelector('.landing-metric-rail')
    const metricRailRect = metricRail?.getBoundingClientRect()

    if (metricRailRect) {
      const metricRailTop = metricRailRect.top + window.scrollY
      const desiredRailTop = window.innerHeight - metricRailRect.height - 16
      targetTop = metricRailTop - desiredRailTop
    }
  }

  if (sectionId === 'estacion-real' && window.innerWidth > 1050) {
    const stationMedia = document.querySelector('.landing-field-media')

    if (stationMedia) {
      targetTop = getLandingDocumentTop(stationMedia) - headerHeight
    }
  }

  if (sectionId === 'audiencias') {
    const centeredGap = window.innerWidth > 1050
      ? 56
      : Math.min(96, Math.max(56, window.innerHeight * 0.1))
    targetTop = documentTop - headerHeight - centeredGap
  }

  const maxScrollTop = Math.max(0, document.documentElement.scrollHeight - window.innerHeight)

  window.scrollTo({ top: Math.min(maxScrollTop, Math.max(0, targetTop)), behavior })
  if (updateHash) window.history.replaceState(null, '', `#${sectionId}`)
}

export default function Landing() {
  const { t } = useLanguage()
  useEffect(() => {
    const initialSectionId = window.location.hash.slice(1)
    const initialFrame = window.requestAnimationFrame(() => {
      scrollToLandingSection(initialSectionId || 'inicio', 'auto', Boolean(initialSectionId))
    })

    return () => window.cancelAnimationFrame(initialFrame)
  }, [])

  useEffect(() => {
    const root = document.querySelector('.landing-page')
    if (!root || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined

    const targets = root.querySelectorAll('[data-reveal]')
    const loopTargets = root.querySelectorAll('[data-loop]')
    root.classList.add('motion-ready')

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return
        entry.target.classList.add('is-visible')
        observer.unobserve(entry.target)
      })
    }, { threshold: 0.14, rootMargin: '0px 0px -8% 0px' })

    targets.forEach((target) => observer.observe(target))

    const loopObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => entry.target.classList.toggle('is-looping', entry.isIntersecting))
    }, { threshold: 0.08 })

    loopTargets.forEach((target) => loopObserver.observe(target))

    const handleVisibility = () => root.classList.toggle('page-hidden', document.hidden)
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      observer.disconnect()
      loopObserver.disconnect()
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [])

  const handleSectionNavigation = (event, sectionId) => {
    event.preventDefault()
    scrollToLandingSection(sectionId)
  }

  return (
    <div className="landing-page" data-design-seed="sms-landing-established-20260818">
      <header className="landing-nav">
        <Link
          to="/"
          className="landing-brand"
          aria-label={t('landing.binaural_acoustic_monitoring_system_home')}
          onClick={(event) => handleSectionNavigation(event, 'inicio')}
        >
          <img className="landing-brand-mark" src="/assets/logo-oido-urbano.png" alt="" aria-hidden="true" />
          <span className="landing-brand-copy">
            <span className="landing-brand-name">
              <span>{t('landing.binaural_acoustic')}</span>
              <span>{t('landing.monitoring_system')}</span>
            </span>
            <small>Bogotá D.C.</small>
          </span>
        </Link>

        <nav aria-label={t('landing.introduction_navigation')}>
          <a href="#inicio" onClick={(event) => handleSectionNavigation(event, 'inicio')}>{t('landing.home')}</a>
          <a href="#mapas" onClick={(event) => handleSectionNavigation(event, 'mapas')}>{t('landing.maps')}</a>
          <a href="#proyecto" onClick={(event) => handleSectionNavigation(event, 'proyecto')}>{t('landing.project')}</a>
          <a href="#estacion-real" onClick={(event) => handleSectionNavigation(event, 'estacion-real')}>{t('admin.station_2')}</a>
          <a href="#sistema" onClick={(event) => handleSectionNavigation(event, 'sistema')}>{t('landing.system')}</a>
          <a href="#binaural" onClick={(event) => handleSectionNavigation(event, 'binaural')}>Binaural</a>
          <a href="#audiencias" onClick={(event) => handleSectionNavigation(event, 'audiencias')}>{t('landing.uses')}</a>
          <a href="#datos" onClick={(event) => handleSectionNavigation(event, 'datos')}>{t('maps.open_data')}</a>
        </nav>

        <div className="landing-nav-actions">
          <LanguageSwitcher />
          <ThemeToggle />
          <a href="#mapas" className="landing-nav-cta" onClick={(event) => handleSectionNavigation(event, 'mapas')}>{t('landing.explore_maps')}</a>
        </div>
      </header>

      <main id="main-content" tabIndex={-1}>
        <section className="landing-hero" id="inicio" data-loop aria-labelledby="landing-title">
          <div className="landing-hero-signal" aria-hidden="true" />
          <div className="landing-hero-copy">
            <p className="landing-hero-kicker">{t('landing.bogota_binaural_network')}</p>
            <h1 id="landing-title" tabIndex={-1}>{t('landing.binaural_acoustic_monitoring_system')}</h1>
            <p className="landing-hero-tagline">{t('landing.bogota_makes_sound_we_measure_it')}</p>
            <p className="landing-hero-lead">{t('landing.a_network_of_stations_turns_the_city_s_soundscape')}</p>
            <div className="landing-hero-actions">
              <a href="#mapas" className="landing-button landing-button--primary" onClick={(event) => handleSectionNavigation(event, 'mapas')}>{t('landing.explore_maps')}</a>
              <a href="#sistema" className="landing-button landing-button--secondary" onClick={(event) => handleSectionNavigation(event, 'sistema')}>{t('landing.discover_the_system')}</a>
            </div>
          </div>

          <figure className="landing-hero-media">
            <div className="landing-hero-image-wrap" data-loop>
              <img
                src="/assets/station-assembly-hero.webp"
                alt={t('landing.actual_station_assembly_with_binaural_head_battery_audio_interface')}
                width="1672"
                height="941"
                loading="eager"
                fetchpriority="high"
              />
              <div className="landing-hero-scan" aria-hidden="true" />
              <div className="landing-hero-scope" aria-hidden="true">
                <div><span>{t('maps.l_channel')}</span><span>{t('maps.r_channel')}</span></div>
                <div className="landing-hero-scope-bars">
                  {waveform.slice(0, 16).map((height, index) => (
                    <i key={`hero-${index}`} style={{ '--scope-height': `${Math.max(18, height - 8)}%`, '--scope-delay': `${index * -105}ms` }} />
                  ))}
                </div>
              </div>
            </div>
            <figcaption>{t('landing.actual_project_assembly_two_microphones_capture_spatial_differences_that')}</figcaption>
          </figure>
        </section>

        <div className="landing-metric-rail" data-reveal="rail" data-loop role="img" aria-label={t('landing.published_acoustic_metrics_leq_ild_correlation_l10_l50_l90')}>
          <div className="landing-metric-track" aria-hidden="true">
            {[...metricLabels(t), ...metricLabels(t)].map((label, index) => <span key={`${label}-${index}`}>{t(label)}</span>)}
          </div>
        </div>

        <section className="landing-map-section" aria-labelledby="map-title">
          <div className="landing-section-heading" id="mapas" data-reveal="copy">
            <div className="landing-map-heading-copy">
              <h2 id="map-title">{t('landing.two_ways_to_read_the_same_city')}</h2>
              <p>{t('landing.check_the_current_status_on_the_2d_map_or')}</p>
            </div>
          </div>
          <div className="landing-map-stage" data-reveal="visual"><BogotaMapGateway /></div>
        </section>

        <section className="landing-project" aria-labelledby="project-title">
          <div className="landing-project-intro" id="proyecto" data-reveal="copy">
            <h2 id="project-title">{t('landing.urban_sound_is_information_too')}</h2>
            <p>{t('landing.the_system_turns_audio_segments_into_accessible_evidence_to')}</p>
          </div>

          <div className="landing-project-mosaic" data-reveal="sequence">
            <article className="landing-project-feature">
              <img
                className="landing-project-feature-art"
                src="/assets/landing-mapa-sonoro.webp"
                alt=""
                aria-hidden="true"
                loading="lazy"
              />
              <span className="landing-feature-word">{t('landing.stereo')}</span>
              <h3>{t('landing.listen_through_two_channels')}</h3>
              <p>{t('landing.the_difference_between_left_and_right_reveals_lateralization_and')}</p>
            </article>
            <article>
              <h3>{t('landing.process_near_the_source')}</h3>
              <p>{t('landing.each_raspberry_pi_calculates_metrics_locally_keeps_a_backlog')}</p>
            </article>
            <article>
              <h3>{t('landing.publish_for_exploration')}</h3>
              <p>{t('landing.measurements_are_aggregated_hourly_and_delivered_to_maps_comparison')}</p>
            </article>
          </div>
        </section>

        <section className="landing-field" aria-labelledby="field-title">
          <div className="landing-field-copy" id="estacion-real" data-reveal="copy">
            <h2 id="field-title">{t('landing.this_is_what_a_real_station_looks_like')}</h2>
            <p>{t('landing.this_photograph_shows_the_project_deployment_an_elevated_binaural')}</p>
            <dl>
              <div><dt>{t('landing.capture')}</dt><dd>{t('landing.two_channel_binaural_head')}</dd></div>
              <div><dt>{t('landing.power')}</dt><dd>{t('landing.solar_panel_and_battery')}</dd></div>
              <div><dt>{t('landing.environment')}</dt><dd>{t('landing.rooftop_deployment_in_bogota')}</dd></div>
            </dl>
          </div>

          <div className="landing-field-media" data-reveal="visual" data-loop>
            <div className="landing-field-rings" aria-hidden="true" />
            <figure className="landing-field-deployment">
              <img
                src="/assets/station-field-bogota.webp"
                alt={t('landing.real_binaural_station_deployed_on_a_bogota_rooftop_beside')}
                width="980"
                height="1604"
                loading="lazy"
              />
              <figcaption>{t('landing.field_deployment_bogota_d_c')}</figcaption>
            </figure>
          </div>
        </section>

        <section className="landing-system" aria-labelledby="system-title">
          <div className="landing-system-header">
            <div className="landing-section-heading landing-section-heading--light" id="sistema" data-reveal="copy">
              <h2 id="system-title">{t('landing.from_the_street_to_open_data')}</h2>
              <p>{t('landing.a_verifiable_pipeline_authenticates_every_station_protects_ingestion_and')}</p>
            </div>
            <figure className="landing-system-evidence" data-reveal="visual">
              <img
                src="/assets/station-assembly-overview.webp"
                alt={t('landing.overhead_view_of_the_actual_assembly_with_solar_panel')}
                width="1959"
                height="803"
                loading="lazy"
              />
              <img
                className="landing-system-technical-art"
                src="/assets/landing-sistema-estacion.webp"
                alt=""
                aria-hidden="true"
                loading="lazy"
              />
              <figcaption>{t('landing.full_system_integration_before_deployment')}</figcaption>
            </figure>
          </div>

          <div className="landing-pipeline" data-reveal="sequence" role="list" aria-label={t('landing.system_flow')}>
            <article role="listitem">
              <span>{t('landing.capture')}</span>
              <h3>{t('landing.field_station')}</h3>
              <p>{t('landing.stereo_microphone_and_raspberry_pi')}</p>
            </article>
            <article role="listitem">
              <span>{t('landing.authenticate')}</span>
              <h3>{t('landing.secure_intake')}</h3>
              <p>{t('landing.station_jwt_and_validation')}</p>
            </article>
            <article role="listitem">
              <span>{t('landing.process')}</span>
              <h3>{t('landing.acoustic_analytics')}</h3>
              <p>{t('landing.storage_and_hourly_aggregation')}</p>
            </article>
            <article role="listitem">
              <span>{t('landing.publish')}</span>
              <h3>{t('landing.public_dashboard')}</h3>
              <p>{t('landing.maps_charts_and_open_data')}</p>
            </article>
          </div>
        </section>

        <section className="landing-binaural" aria-labelledby="binaural-title">
          <div className="landing-binaural-copy" id="binaural" data-reveal="copy">
            <h2 id="binaural-title">{t('landing.not_just_how_much_noise_also_where_it_comes')}</h2>
            <p>{t('landing.the_equivalent_level_describes_energy_interaural_difference_and_correlation')}</p>
            <dl>
              <div><dt>ILD</dt><dd>{t('landing.compares_the_level_received_by_each_channel')}</dd></div>
              <div><dt>{t('landing.correlation')}</dt><dd>{t('landing.describes_how_similar_the_two_signals_are')}</dd></div>
              <div><dt>{t('maps.spectrum')}</dt><dd>{t('landing.identifies_dominant_frequency_centroid_and_rolloff')}</dd></div>
            </dl>
          </div>

          <div className="landing-waveform" data-reveal="visual" data-loop>
            <div className="landing-waveform-header">
              <span>{t('landing.binaural_capture')}</span>
              <span>{t('landing.illustrative_signal')}</span>
            </div>
            <SoundWave channel="L" values={waveform} />
            <SoundWave channel="R" values={waveform.map((value, index) => Math.max(16, value - (index % 5) * 5))} reverse />
            <div className="landing-wave-axis" aria-hidden="true"><span>{t('landing.left_channel')}</span><span>{t('landing.right_channel')}</span></div>
          </div>
        </section>

        <section className="landing-audiences" aria-labelledby="audiencias">
          <h2 id="audiencias" data-reveal="copy">{t('landing.one_network_three_ways_to_use_it')}</h2>
          <div className="landing-audiences-layout">
            <div className="landing-audience-grid" data-reveal="sequence">
              <article className="landing-audience-primary">
                <h3>{t('landing.public')}</h3>
                <p>{t('landing.check_an_area_s_recent_level_and_understand_what')}</p>
                <Link to={ROUTES.map2D}>{t('landing.explore_the_city')}</Link>
              </article>
              <article>
                <h3>{t('landing.environmental_analysis')}</h3>
                <p>{t('landing.compare_stations_review_trends_and_download_reproducible_information')}</p>
                <Link to={ROUTES.map2DCompare}>{t('maps.compare_stations')}</Link>
              </article>
              <article>
                <h3>{t('landing.technical_operations')}</h3>
                <p>{t('landing.manage_the_network_and_check_the_status_of_authorized')}</p>
                <Link to="/admin/login">{t('landing.open_the_admin_panel')}</Link>
              </article>
            </div>
            <figure className="landing-audiences-visual" data-reveal="visual">
              <img
                src="/assets/landing-tres-formas-v2.webp"
                alt={t('landing.illustration_of_the_public_environmental_analysis_and_technical_operations')}
                loading="lazy"
              />
              <figcaption>{t('landing.a_network_to_explore_analyze_and_operate')}</figcaption>
            </figure>
          </div>
        </section>

        <section className="landing-open-data" aria-labelledby="open-data-title">
          <div className="landing-open-data-copy" id="datos" data-reveal="copy">
            <h2 id="open-data-title">{t('landing.data_should_circulate_too')}</h2>
            <p>{t('landing.select_bounded_time_ranges_filter_by_station_and_download')}</p>
          </div>
          <div className="landing-open-data-visual">
            <div className="landing-open-data-art" data-reveal="visual" aria-hidden="true">
              <img className="landing-open-data-illustration" src="/assets/landing-datos-binaural-wide-v2.webp" alt="" loading="lazy" />
            </div>
            <Link to={ROUTES.map2DData} className="landing-button landing-button--light" data-reveal="visual">{t('landing.open_public_data')}</Link>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-brand landing-brand--footer">
          <img className="landing-brand-mark" src="/assets/logo-oido-urbano.png" alt="" aria-hidden="true" />
          <span className="landing-brand-copy">
            <span className="landing-brand-name">
              <span>{t('landing.binaural_acoustic')}</span>
              <span>{t('landing.monitoring_system')}</span>
            </span>
            <small>Bogotá D.C.</small>
          </span>
        </div>
        <p>{t('landing.environmental_monitoring_project_with_binaural_capture_and_open_data')}</p>
        <nav aria-label={t('landing.footer_links')}>
          <Link to={ROUTES.map2D}>{t('landing.2d_map')}</Link>
          <Link to={ROUTES.map3D}>{t('landing.3d_map')}</Link>
          <Link to={ROUTES.map2DData}>{t('landing.open_data')}</Link>
        </nav>
      </footer>
    </div>
  )
}
