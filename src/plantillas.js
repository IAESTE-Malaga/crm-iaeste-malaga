import { escaparHtml } from './html'

// Plantillas de correo: mensajes en HTML guardados en la tabla `plantillas` (ver supabase/migrations/*_plantillas*.sql).
// Pueden llevar variables entre llaves dobles; se sustituyen al elegir la plantilla en el hilo de correo.
export const VARIABLES = [
  { id: 'empresa', desc: 'Nombre de la empresa' },
  { id: 'contacto', desc: 'Persona de contacto de la ficha' },
  { id: 'yo', desc: 'Tu nombre' },
]

// Una sola pasada: lo que se inserta nunca se vuelve a interpretar como variable.
// Si una variable no tiene valor se quita junto con el espacio que la precede («Buenos días {{contacto}},» → «Buenos días,»).
// El mensaje es HTML: con { html: true } los valores se escapan (una empresa «A&B <S.L.>» no rompe el formato).
export const aplicarVariables = (texto, { empresa, yo } = {}, { html = false } = {}) => {
  const valores = { empresa: empresa?.nombre || 'su empresa', contacto: empresa?.contacto || '', yo: yo || '' }
  const poner = html ? escaparHtml : (v) => v
  return String(texto ?? '').replace(/( |&nbsp;| )?\{\{\s*(empresa|contacto|yo)\s*\}\}/g, (_, sp = '', k) => (valores[k] ? sp + poner(valores[k]) : ''))
}
