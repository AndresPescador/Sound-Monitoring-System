import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import BogotaMapGateway from '../components/landing/BogotaMapGateway'
import './landing.css'

const waveform = [18, 34, 24, 58, 44, 72, 36, 82, 54, 28, 64, 40, 76, 48, 30, 56, 68, 38, 78, 46, 26, 62, 42, 70]
const metricLabels = ['Leq', 'ILD', 'Correlación', 'L10', 'L50', 'L90', 'Espectro']

function SoundWave({ channel, values, reverse = false }) {
  const sequence = reverse ? [...values].reverse() : values
  return (
    <div className="landing-wave-row" aria-label={`Señal ilustrativa del canal ${channel}`}>
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

export default function Landing() {
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

  return (
    <div className="landing-page" data-design-seed="sms-landing-established-20260818">
      <header className="landing-nav">
        <Link to="/" className="landing-brand" aria-label="Inicio del Sistema de Monitoreo Acústico Binaural">
          <span className="landing-brand-mark" aria-hidden="true"><i /><i /></span>
          <span>Monitoreo Acústico <small>Bogotá D.C.</small></span>
        </Link>

        <nav aria-label="Navegación de la presentación">
          <a href="#proyecto">Proyecto</a>
          <a href="#sistema">Sistema</a>
          <Link to="/data">Datos abiertos</Link>
        </nav>

        <a href="#explorar" className="landing-nav-cta">Explorar mapas</a>
      </header>

      <main>
        <section className="landing-hero" aria-labelledby="landing-title">
          <div className="landing-hero-signal" aria-hidden="true" />
          <div className="landing-hero-copy">
            <h1 id="landing-title">Bogotá suena.<br />La medimos.</h1>
            <p className="landing-hero-lead">Una red de estaciones convierte el paisaje sonoro de la ciudad en datos abiertos, espaciales y comparables.</p>
            <div className="landing-hero-actions">
              <a href="#explorar" className="landing-button landing-button--primary">Explorar mapas</a>
              <a href="#sistema" className="landing-button landing-button--secondary">Conocer el sistema</a>
            </div>
          </div>

          <figure className="landing-hero-media">
            <div className="landing-hero-image-wrap" data-loop>
              <img
                src="/assets/station-assembly-hero.webp"
                alt="Montaje real de la estación con cabeza binaural, batería, interfaz de audio y electrónica"
                width="1672"
                height="941"
                loading="eager"
                fetchPriority="high"
              />
              <div className="landing-hero-scope" aria-hidden="true">
                <div><span>Canal L</span><span>Canal R</span></div>
                <div className="landing-hero-scope-bars">
                  {waveform.slice(0, 16).map((height, index) => (
                    <i key={`hero-${index}`} style={{ '--scope-height': `${Math.max(18, height - 8)}%`, '--scope-delay': `${index * -105}ms` }} />
                  ))}
                </div>
              </div>
            </div>
            <figcaption>Montaje real del proyecto. Dos micrófonos capturan diferencias espaciales que una medición convencional no puede revelar.</figcaption>
          </figure>
        </section>

        <div className="landing-metric-rail" data-reveal="rail" data-loop role="img" aria-label="Métricas acústicas publicadas: Leq, ILD, correlación, L10, L50, L90 y espectro">
          <div className="landing-metric-track" aria-hidden="true">
            {[...metricLabels, ...metricLabels].map((label, index) => <span key={`${label}-${index}`}>{label}</span>)}
          </div>
        </div>

        <section className="landing-map-section" id="explorar" aria-labelledby="map-title">
          <div className="landing-section-heading" data-reveal="copy">
            <h2 id="map-title">Dos formas de leer la misma ciudad</h2>
            <p>Consulta el estado actual en el mapa 2D o explora la intensidad acústica sobre el tejido urbano en 3D.</p>
          </div>
          <div className="landing-map-stage" data-reveal="visual"><BogotaMapGateway /></div>
        </section>

        <section className="landing-project" id="proyecto" aria-labelledby="project-title">
          <div className="landing-project-intro" data-reveal="copy">
            <h2 id="project-title">El sonido urbano también es información.</h2>
            <p>El sistema convierte fragmentos de audio en evidencia consultable para comprender patrones, contrastar zonas y abrir nuevas preguntas sobre Bogotá.</p>
          </div>

          <div className="landing-project-mosaic" data-reveal="sequence">
            <article className="landing-project-feature">
              <span className="landing-feature-word">Estéreo</span>
              <h3>Escucha en dos canales</h3>
              <p>La diferencia entre izquierda y derecha permite observar lateralización y carácter espacial de las fuentes sonoras.</p>
            </article>
            <article>
              <h3>Procesa cerca de la fuente</h3>
              <p>Cada Raspberry Pi calcula métricas localmente, conserva un backlog y reintenta envíos cuando la red vuelve a estar disponible.</p>
            </article>
            <article>
              <h3>Publica para explorar</h3>
              <p>Las mediciones se agregan por hora y llegan a mapas, gráficas comparativas y descargas abiertas.</p>
            </article>
          </div>
        </section>

        <section className="landing-field" id="estacion-real" aria-labelledby="field-title">
          <div className="landing-field-copy" data-reveal="copy">
            <h2 id="field-title">Así se ve una estación real.</h2>
            <p>Esta fotografía corresponde al despliegue del proyecto: una cabeza binaural elevada, alimentación solar y electrónica preparada para capturar y procesar el entorno acústico.</p>
            <dl>
              <div><dt>Captura</dt><dd>Cabeza binaural de dos canales</dd></div>
              <div><dt>Energía</dt><dd>Panel solar y batería</dd></div>
              <div><dt>Entorno</dt><dd>Despliegue sobre una cubierta en Bogotá</dd></div>
            </dl>
          </div>

          <div className="landing-field-media" data-reveal="visual" data-loop>
            <div className="landing-field-rings" aria-hidden="true" />
            <figure className="landing-field-deployment">
              <img
                src="/assets/station-field-bogota.webp"
                alt="Estación binaural real desplegada en una cubierta de Bogotá junto a su panel solar"
                width="980"
                height="1604"
                loading="lazy"
              />
              <figcaption>Despliegue de campo · Bogotá D.C.</figcaption>
            </figure>
          </div>
        </section>

        <section className="landing-system" id="sistema" data-loop aria-labelledby="system-title">
          <div className="landing-system-header">
            <div className="landing-section-heading landing-section-heading--light" data-reveal="copy">
              <h2 id="system-title">De la calle al dato abierto</h2>
              <p>Una cadena verificable autentica cada estación, protege la ingesta y separa la operación del acceso público.</p>
            </div>
            <figure className="landing-system-evidence" data-reveal="visual">
              <img
                src="/assets/station-assembly-overview.webp"
                alt="Vista cenital del montaje real con panel solar, batería, interfaz de audio y cabeza binaural"
                width="1959"
                height="803"
                loading="lazy"
              />
              <figcaption>Integración del sistema completo antes del despliegue.</figcaption>
            </figure>
          </div>

          <div className="landing-pipeline" data-reveal="sequence" role="list" aria-label="Flujo del sistema">
            <article role="listitem">
              <span>Captura</span>
              <h3>Estación de campo</h3>
              <p>Micrófono estéreo y Raspberry Pi</p>
            </article>
            <article role="listitem">
              <span>Autentica</span>
              <h3>Ingreso seguro</h3>
              <p>JWT de estación y validación</p>
            </article>
            <article role="listitem">
              <span>Procesa</span>
              <h3>Analítica acústica</h3>
              <p>Persistencia y agregación horaria</p>
            </article>
            <article role="listitem">
              <span>Publica</span>
              <h3>Dashboard ciudadano</h3>
              <p>Mapas, gráficas y datos abiertos</p>
            </article>
          </div>
        </section>

        <section className="landing-binaural" aria-labelledby="binaural-title">
          <div className="landing-binaural-copy" data-reveal="copy">
            <h2 id="binaural-title">No solo cuánto ruido. También desde dónde.</h2>
            <p>El nivel equivalente describe la energía. La diferencia interaural y la correlación añaden una lectura espacial del entorno.</p>
            <dl>
              <div><dt>ILD</dt><dd>Compara el nivel recibido por cada canal.</dd></div>
              <div><dt>Correlación</dt><dd>Describe cuánto se parecen ambas señales.</dd></div>
              <div><dt>Espectro</dt><dd>Ubica frecuencia dominante, centroide y rolloff.</dd></div>
            </dl>
          </div>

          <div className="landing-waveform" data-reveal="visual" data-loop>
            <div className="landing-waveform-header">
              <span>Captura binaural</span>
              <span>Señal ilustrativa</span>
            </div>
            <SoundWave channel="L" values={waveform} />
            <SoundWave channel="R" values={waveform.map((value, index) => Math.max(16, value - (index % 5) * 5))} reverse />
            <div className="landing-wave-axis" aria-hidden="true"><span>Canal izquierdo</span><span>Canal derecho</span></div>
          </div>
        </section>

        <section className="landing-audiences" aria-labelledby="audiences-title">
          <h2 id="audiences-title" data-reveal="copy">Una red, tres maneras de usarla</h2>
          <div className="landing-audience-grid" data-reveal="sequence">
            <article className="landing-audience-primary">
              <h3>Ciudadanía</h3>
              <p>Consultar el nivel reciente de una zona y entender qué significan las métricas publicadas.</p>
              <Link to="/mapa-2d">Consultar la ciudad</Link>
            </article>
            <article>
              <h3>Análisis ambiental</h3>
              <p>Comparar estaciones, revisar tendencias y descargar información replicable.</p>
              <Link to="/compare">Comparar estaciones</Link>
            </article>
            <article>
              <h3>Operación técnica</h3>
              <p>Gestionar la red y verificar el estado de las estaciones autorizadas.</p>
              <Link to="/admin/login">Ingresar al panel</Link>
            </article>
          </div>
        </section>

        <section className="landing-open-data" aria-labelledby="open-data-title">
          <div data-reveal="copy">
            <h2 id="open-data-title">Los datos también deben circular.</h2>
            <p>Consulta intervalos acotados, filtra por estación y descarga mediciones en CSV desde el portal público.</p>
          </div>
          <Link to="/data" className="landing-button landing-button--light" data-reveal="visual">Abrir datos públicos</Link>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-brand landing-brand--footer">
          <span className="landing-brand-mark" aria-hidden="true"><i /><i /></span>
          <span>Monitoreo Acústico <small>Bogotá D.C.</small></span>
        </div>
        <p>Proyecto de monitoreo ambiental con captura binaural y datos abiertos.</p>
        <nav aria-label="Enlaces finales">
          <Link to="/mapa-2d">Mapa 2D</Link>
          <Link to="/urban-3d">Visor 3D</Link>
          <Link to="/data">Datos</Link>
        </nav>
      </footer>
    </div>
  )
}
