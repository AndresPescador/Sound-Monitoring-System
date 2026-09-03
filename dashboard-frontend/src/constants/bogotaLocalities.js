export const BOGOTA_LOCALITIES = [
  ['Antonio Nariño', 'ANTONIO-NARINO'],
  ['Barrios Unidos', 'BARRIOS-UNIDOS'],
  ['Bosa', 'BOSA'],
  ['Chapinero', 'CHAPINERO'],
  ['Ciudad Bolívar', 'CIUDAD-BOLIVAR'],
  ['Engativá', 'ENGATIVA'],
  ['Fontibón', 'FONTIBON'],
  ['Kennedy', 'KENNEDY'],
  ['La Candelaria', 'LA-CANDELARIA'],
  ['Los Mártires', 'LOS-MARTIRES'],
  ['Puente Aranda', 'PUENTE-ARANDA'],
  ['Rafael Uribe Uribe', 'RAFAEL-URIBE-URIBE'],
  ['San Cristóbal', 'SAN-CRISTOBAL'],
  ['Santa Fe', 'SANTA-FE'],
  ['Suba', 'SUBA'],
  ['Sumapaz', 'SUMAPAZ'],
  ['Teusaquillo', 'TEUSAQUILLO'],
  ['Tunjuelito', 'TUNJUELITO'],
  ['Usaquén', 'USAQUEN'],
  ['Usme', 'USME'],
].map(([label, slug]) => ({ label, value: label, slug }))

export const CUSTOM_LOCALITY_VALUE = '__custom__'

export const localitySlug = (localityName) => (
  localityName
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toUpperCase()
)

export const stationCodePreview = (localityName) => {
  const slug = localitySlug(localityName || '')
  return slug && slug.length <= 44 ? `ST-${slug}-##` : ''
}
