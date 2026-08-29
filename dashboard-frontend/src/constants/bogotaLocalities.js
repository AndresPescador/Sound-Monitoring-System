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

export const stationCodePreview = (localityName) => {
  const locality = BOGOTA_LOCALITIES.find(item => item.value === localityName)
  return locality ? `ST-${locality.slug}-##` : ''
}
