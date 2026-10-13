// Archivos adjuntos de correos y plantillas (bucket privado «adjuntos» de Supabase Storage; ver migración *_adjuntos.sql).
// Se suben directamente desde el navegador; el servicio de correo solo recibe las rutas y las adjunta al enviar.
import { supabase } from './supabase'

const BUCKET = 'adjuntos'
// Gmail admite 25 MB por correo (en base64 pesa ~⅓ más): el servicio de correo aplica el mismo tope total
export const MAX_ARCHIVO = 15 * 1024 * 1024
export const MAX_TOTAL = 18 * 1024 * 1024
export const MAX_ARCHIVOS = 10

export const formatoTamano = (n) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)
export const tamanoTotal = (lista) => lista.reduce((a, x) => a + (x.tamano || 0), 0)

// Nombre válido para una ruta de Storage (sin tildes ni caracteres raros); el nombre original se guarda aparte
const nombreSeguro = (n) => n.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_').replace(/^\.+/, '').slice(-100) || 'archivo'

// Comprueba que `nuevos` (File[]) cabe junto a `actuales` ([{ tamano }]). Devuelve el texto del error o ''.
export const validarArchivos = (actuales, nuevos) => {
  if (actuales.length + nuevos.length > MAX_ARCHIVOS) return `Máximo ${MAX_ARCHIVOS} archivos.`
  const grande = nuevos.find((f) => f.size > MAX_ARCHIVO)
  if (grande) return `«${grande.name}» pesa más de ${formatoTamano(MAX_ARCHIVO)}.`
  if (tamanoTotal(actuales) + nuevos.reduce((a, f) => a + f.size, 0) > MAX_TOTAL) return `Los archivos no pueden sumar más de ${formatoTamano(MAX_TOTAL)}.`
  return ''
}

// Sube un archivo bajo `carpeta` (p. ej. «correos/<empresa>» o «plantillas/<plantilla>») y devuelve sus metadatos
export async function subirArchivo(carpeta, file) {
  const path = `${carpeta}/${crypto.randomUUID()}-${nombreSeguro(file.name)}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || 'application/octet-stream' })
  if (error) throw new Error(`No se ha podido subir «${file.name}»: ${error.message}`)
  return { path, nombre: file.name, tamano: file.size }
}

// Borra archivos de Storage. Es limpieza: si falla (permisos, red) no se avisa, solo quedan huérfanos.
export async function borrarArchivos(paths) {
  if (!paths.length) return
  try { await supabase.storage.from(BUCKET).remove(paths) } catch { /* sin conexión */ }
}

// Descarga un archivo con su nombre original (enlace firmado de un minuto)
export async function descargarArchivo(a) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(a.path, 60, { download: a.nombre })
  if (error) throw new Error(`No se ha podido descargar «${a.nombre}»: ${error.message}`)
  const l = document.createElement('a')
  l.href = data.signedUrl
  l.click()
}
