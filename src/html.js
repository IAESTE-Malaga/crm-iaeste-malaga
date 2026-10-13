import DOMPurify from 'dompurify'

// HTML de los correos y plantillas en el navegador. Es la misma lista de etiquetas, atributos y estilos
// que usa el servicio de correo al enviar (server/src/html.js, que es el que manda): así lo que se ve en
// el editor y en la vista previa es lo que recibe la empresa.

const ETIQUETAS = [
  'a', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'sub', 'sup', 'small', 'big', 'font', 'span', 'br', 'hr',
  'p', 'div', 'center', 'blockquote', 'pre', 'code', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li',
  'img', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption', 'colgroup', 'col',
]
const ATRIBUTOS = [
  'style', 'align', 'valign', 'dir', 'width', 'height', 'bgcolor', 'title', 'href', 'target', 'src', 'alt', 'border',
  'color', 'face', 'size', 'cellpadding', 'cellspacing', 'colspan', 'rowspan', 'nowrap', 'span', 'start', 'type',
]
const PROPIEDADES = new Set([
  'color', 'background-color', 'font', 'font-family', 'font-size', 'font-weight', 'font-style', 'font-variant',
  'text-decoration', 'text-align', 'text-transform', 'text-indent', 'line-height', 'letter-spacing', 'white-space',
  'vertical-align', 'width', 'height', 'max-width', 'min-width', 'max-height', 'display',
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'border', 'border-top', 'border-right', 'border-bottom', 'border-left', 'border-color', 'border-style', 'border-width',
  'border-radius', 'border-collapse', 'border-spacing', 'list-style-type',
])
const VALOR_SEGURO = /^(?!.*(?:url|expression|javascript|image-set|var)\s*\()[-\w\s#.,%()'"!/+]*$/i
const URL_ENLACE = /^(?:https?:|mailto:|tel:)/i
const URL_IMAGEN = /^https?:\/\//i

const filtrarEstilo = (css) => css.split(';').map((d) => {
  const i = d.indexOf(':')
  if (i < 0) return ''
  const prop = d.slice(0, i).trim().toLowerCase()
  const valor = d.slice(i + 1).trim()
  return PROPIEDADES.has(prop) && valor && VALOR_SEGURO.test(valor) ? `${prop}:${valor}` : ''
}).filter(Boolean).join(';')

let quitadas = 0
DOMPurify.addHook('afterSanitizeAttributes', (n) => {
  if (n.hasAttribute('style')) {
    const css = filtrarEstilo(n.getAttribute('style'))
    if (css) n.setAttribute('style', css); else n.removeAttribute('style')
  }
  if (n.tagName === 'A') {
    if (n.hasAttribute('href') && !URL_ENLACE.test(n.getAttribute('href').trim())) n.removeAttribute('href')
    if (n.hasAttribute('href')) n.setAttribute('target', '_blank')
  }
  // Imagen sin URL pública (pegada como archivo, cid:, file://…): no se vería en el correo
  if (n.tagName === 'IMG' && !URL_IMAGEN.test(n.getAttribute('src') || '')) { n.remove(); quitadas++ }
})

const CONFIG = { ALLOWED_TAGS: ETIQUETAS, ALLOWED_ATTR: ATRIBUTOS, ALLOW_DATA_ATTR: false, KEEP_CONTENT: true }

// Devuelve { html, imagenesQuitadas }
export function limpiar(html) {
  quitadas = 0
  const limpio = DOMPurify.sanitize(String(html ?? ''), CONFIG).trim()
  return { html: limpio, imagenesQuitadas: quitadas }
}
export const limpiarHtml = (html) => limpiar(html).html

export const escaparHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
export const textoAHtml = (t) => escaparHtml(t).replace(/\r?\n/g, '<br>')

// Texto visible de un HTML (resumen de las tarjetas de plantillas, comprobar si el mensaje está vacío…)
export function htmlATexto(html) {
  const doc = new DOMParser().parseFromString(String(html ?? '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|tr|li|h\d)>/gi, '$&\n'), 'text/html')
  return (doc.body.textContent || '').replace(/ /g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

// ¿Tiene algo que enviar? (texto o al menos una imagen, p. ej. solo la firma)
export const htmlVacio = (html) => !htmlATexto(html) && !/<img\b/i.test(html || '')
