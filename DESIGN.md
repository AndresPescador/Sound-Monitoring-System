---
name: Sistema de Monitoreo Acústico Binaural
description: Atlas acústico cívico para explorar el paisaje sonoro de Bogotá.
colors:
  primary: "#1d4ed8"
  primary-light: "#3b82f6"
  primary-dark: "#1e3a8a"
  civic-ink: "#10223f"
  text-muted: "#52637c"
  cool-paper: "#f8fbff"
  cool-field: "#edf4ff"
  cool-border: "#cbd9ed"
  noise-low: "#16a34a"
  noise-medium: "#d97706"
  noise-high: "#dc2626"
typography:
  display:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "clamp(2.5rem, 5vw, 5rem)"
    fontWeight: 650
    lineHeight: 0.98
    letterSpacing: "-0.04em"
  body:
    fontFamily: "Source Sans 3, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
  data:
    fontFamily: "JetBrains Mono, monospace"
    fontSize: "0.8rem"
    fontWeight: 500
    lineHeight: 1.4
rounded:
  control: "12px"
  surface: "16px"
spacing:
  control-x: "18px"
  section-y: "clamp(5.5rem, 10vw, 10rem)"
  page-x: "clamp(1.25rem, 4vw, 4.5rem)"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.cool-paper}"
    rounded: "{rounded.control}"
    padding: "12px 18px"
    height: "48px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.civic-ink}"
    rounded: "{rounded.control}"
    padding: "12px 18px"
    height: "48px"
---

# Design System: Sistema de Monitoreo Acústico Binaural

## Overview

**Creative North Star: "Atlas acústico cívico"**

El sistema presenta la medición acústica como infraestructura pública: preciso para analistas, comprensible para ciudadanía y confiable para operadores. Su mundo visual combina la claridad de un atlas urbano con el movimiento de una señal binaural. La interfaz es luminosa, amplia y editorial; los datos conservan prioridad sobre la decoración.

La identidad evita el futurismo oscuro, los brillos de neón y la apariencia de plantilla SaaS. La cartografía, las ondas, las columnas de intensidad y la fotografía de estaciones son materiales funcionales porque explican cómo opera el proyecto.

**Key Characteristics:**

- Campos fríos y luminosos con una única voz cobalto.
- Tipografía geométrica para jerarquía y una sans legible para explicación.
- Monoespaciada limitada a métricas, canales y estados técnicos.
- Movimiento que comunica flujo, espacialidad o respuesta.
- Verde, ámbar y rojo reservados para niveles acústicos reales.

## Colors

La paleta combina papel frío, tinta azul noche y cobalto cívico. Los fondos alternan por tono, no por cambio de tema.

### Primary

- **Cobalto cívico:** acción principal, navegación activa, campos de énfasis y visualización cartográfica.
- **Cobalto claro:** estados secundarios, ondas y detalles de profundidad.
- **Cobalto profundo:** hover, contraste y volumen del mapa 3D.

### Neutral

- **Tinta cívica:** titulares y texto de máxima prioridad.
- **Papel frío:** fondo principal y texto sobre cobalto.
- **Campo cartográfico:** secciones de contexto, pipeline y transición.
- **Línea fría:** límites, divisores y controles secundarios.

### Named Rules

**The One Accent Rule.** El cobalto es el único color de marca. Verde, ámbar y rojo solo representan niveles de ruido o estados semánticos reales.

**The Light Civic Rule.** La experiencia pública se mantiene luminosa; los paneles azul noche se reservan para visualizaciones que necesitan contraste técnico.

## Typography

**Display Font:** DM Sans (sans-serif)  
**Body Font:** Source Sans 3 (sans-serif)  
**Label/Mono Font:** JetBrains Mono (monospace)

**Character:** DM Sans aporta una voz contemporánea e institucional sin rigidez. Source Sans 3 sostiene lectura prolongada y JetBrains Mono identifica datos, nunca ambientación tecnológica.

### Hierarchy

- **Display** (650, escala fluida, 0.98): titulares de landing y aperturas de sección.
- **Headline** (650, escala fluida moderada, 1): títulos de vistas y componentes principales.
- **Title** (600-700, 1.25-1.65rem): nombres de estaciones y bloques funcionales.
- **Body** (400, 1rem, 1.6): explicación con medida máxima cercana a 65 caracteres.
- **Label** (500, 0.7-0.8rem): métricas, canales y nombres de etapa; mayúsculas solo cuando el dato lo exige.

### Named Rules

**The Data Mono Rule.** La tipografía monoespaciada solo aparece cuando el contenido es medible, técnico o tabular.

## Layout

Las superficies públicas usan contenedores amplios y composición asimétrica. Las secciones respiran con separación vertical generosa y cambian de familia de layout para construir ritmo: split hero, portal cartográfico, mosaico, pipeline y bloques de lectura.

En escritorio se favorecen grids de dos columnas con pesos distintos. Por debajo de 768px toda asimetría colapsa a una columna, las áreas interactivas conservan al menos 44px y el mapa 2D/3D se apila manteniendo su orden. El viewport completo usa unidades dinámicas (`dvh`) para estabilidad móvil.

## Elevation & Depth

La profundidad es ambiental, no ornamental. Sombras amplias y teñidas separan fotografía, portales cartográficos y visualizaciones oscuras. Los bloques informativos se agrupan primero con tono, espacio y divisores de un píxel.

### Shadow Vocabulary

- **Ambient image:** sombra azul grisácea amplia para fotografía y visualizaciones protagonistas.
- **Portal depth:** sombra más extensa bajo el selector de mapas para comunicar entrada a otra superficie.
- **Control lift:** sombra corta y suave solo en la acción principal.

**The Flat By Default Rule.** Una superficie informativa permanece plana; la sombra aparece únicamente cuando expresa jerarquía, interacción o profundidad espacial.

## Shapes

La escala de forma es pequeña y consistente: 12px para controles, 16px para imágenes y superficies grandes. Los pills se evitan salvo en indicadores compactos. Los contornos geográficos permanecen orgánicos y no se sustituyen por máscaras geométricas genéricas.

## Components

### Buttons

- **Shape:** control suavemente curvado (12px) y altura mínima de 48px.
- **Primary:** cobalto con texto de papel frío y sombra ambiental moderada.
- **Secondary:** transparente, borde frío de un píxel y texto de tinta cívica.
- **Hover / Focus:** cambio tonal breve; focus visible de 3px y active con desplazamiento táctil de 1px.

### Cards / Containers

- **Corner Style:** superficies grandes de 16px.
- **Background:** papel frío, campo cartográfico o cobalto según jerarquía.
- **Shadow Strategy:** solo fotografía, portales y visualizaciones protagonistas.
- **Border:** divisores fríos de un píxel; no combinar borde completo con sombra amplia sin necesidad.

### Navigation

La navegación pública es compacta, sticky y translúcida sobre la misma familia de papel frío. Los enlaces usan DM Sans semibold, hover cobalto y subrayado con separación visible. En móvil conserva marca y una sola acción principal.

### Map Gateway

El portal 2D/3D es la firma interactiva del proyecto. Usa el límite oficial de Bogotá, contraste papel/cobalto y expansión física al hover o foco. En móvil se apila sin convertir las mitades en tarjetas independientes.

### Acoustic Visualization

Las ondas, canales y columnas deben etiquetar si la señal es ilustrativa. Las animaciones mantienen contenido visible, respetan reducción de movimiento y solo transforman opacidad, escala o posición.

## Do's and Don'ts

### Do:

- **Do** usar cartografía, ondas y espectros cuando expliquen una función real.
- **Do** conservar alto contraste y targets de al menos 44px.
- **Do** usar datos reales o marcar explícitamente cualquier señal ilustrativa.
- **Do** mantener una única familia de azules y neutrales fríos.
- **Do** ofrecer fallback estático para movimiento reducido.

### Don't:

- **Don't** usar gradientes morados, neón o brillo exterior como lenguaje tecnológico.
- **Don't** convertir la landing en un dashboard denso ni el dashboard en una pieza promocional.
- **Don't** usar verde, ámbar o rojo como decoración.
- **Don't** repetir filas de tarjetas iguales como estructura de página.
- **Don't** ocultar contenido esencial durante animaciones de entrada.
