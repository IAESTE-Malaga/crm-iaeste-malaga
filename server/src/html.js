import sanitizeHtml from 'sanitize-html'
import { convert } from 'html-to-text'

// HTML de los correos que se envían (mensaje escrito en el editor o plantilla con firma pegada de Gmail/Outlook).
// Lo que manda el navegador nunca se envía tal cual: se queda solo con el formato (negrita, colores, tablas
// de las firmas, enlaces, imágenes con URL pública) y se quitan scripts, formularios, CSS externo, etc.
// La versión del navegador (src/html.js) usa la misma lista para que lo que se ve al editar sea lo que sale.

const ETIQUETAS = [
  'a', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'sub', 'sup', 'small', 'big', 'font', 'span', 'br', 'hr',
  'p', 'div', 'center', 'blockquote', 'pre', 'code', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li',
  'img', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption', 'colgroup', 'col',
]
const ATRIBUTOS_COMUNES = ['style', 'align', 'valign', 'dir', 'width', 'height', 'bgcolor', 'title']

// Propiedades CSS de formato que se conservan en style="…". Nada de url(), expression(), posicionamiento…
const PROPIEDADES = [
  'color', 'background-color', 'font', 'font-family', 'font-size', 'font-weight', 'font-style', 'font-variant',
  'text-decoration', 'text-align', 'text-transform', 'text-indent', 'line-height', 'letter-spacing', 'white-space',
  'vertical-align', 'width', 'height', 'max-width', 'min-width', 'max-height', 'display',
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'border', 'border-top', 'border-right', 'border-bottom', 'border-left', 'border-color', 'border-style', 'border-width',
  'border-radius', 'border-collapse', 'border-spacing', 'list-style-type',
]
const VALOR_SEGURO = /^(?!.*(?:url|expression|javascript|image-set|var)\s*\()[-\w\s#.,%()'"!/+]*$/i
const ESTILOS = Object.fromEntries(PROPIEDADES.map((p) => [p, [VALOR_SEGURO]]))

export const MAX_HTML = 100_000

export const OPCIONES = {
  allowedTags: ETIQUETAS,
  allowedAttributes: {
    '*': ATRIBUTOS_COMUNES,
    a: ['href', 'target', 'title', 'style'],
    img: ['src', 'alt', 'width', 'height', 'style', 'border'],
    font: ['color', 'face', 'size', 'style'],
    table: [...ATRIBUTOS_COMUNES, 'border', 'cellpadding', 'cellspacing'],
    td: [...ATRIBUTOS_COMUNES, 'colspan', 'rowspan', 'nowrap'],
    th: [...ATRIBUTOS_COMUNES, 'colspan', 'rowspan', 'nowrap'],
    col: [...ATRIBUTOS_COMUNES, 'span'],
    ol: [...ATRIBUTOS_COMUNES, 'start', 'type'],
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesByTag: { img: ['https', 'http'] }, // ni data: ni cid: (Gmail no muestra las incrustadas)
  allowProtocolRelative: false,
  allowedStyles: { '*': ESTILOS },
  // Una imagen sin URL pública (pegada como archivo, cid:, file://…) no se vería: fuera
  exclusiveFilter: (frame) => frame.tag === 'img' && !/^https?:\/\//i.test(frame.attribs.src || ''),
  transformTags: {
    a: (tag, attribs) => ({ tagName: 'a', attribs: attribs.href ? { ...attribs, target: '_blank' } : attribs }),
  },
}

export const limpiarHtml = (html) => sanitizeHtml(String(html ?? ''), OPCIONES).trim()

const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
export const textoAHtml = (t) => esc(String(t ?? '')).replace(/\r?\n/g, '<br>')

// Envoltorio con la tipografía por defecto del correo (lo que no tenga estilo propio sale en Arial 14px)
export const envolver = (html) => `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222">${html}</div>`

// Versión en texto plano del correo (parte text/plain del MIME y lo que se ve en el hilo del CRM)
export const htmlATexto = (html) => convert(String(html ?? ''), {
  wordwrap: false,
  selectors: [
    { selector: 'a', options: { hideLinkIfSameAsText: true, ignoreHref: false, linkBrackets: ['<', '>'] } },
    { selector: 'img', format: 'skip' },
    { selector: 'table', format: 'block' },
    { selector: 'tr', format: 'block' },
    { selector: 'td', format: 'block' },
    { selector: 'th', format: 'block' },
    ...['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].map((h) => ({ selector: h, options: { uppercase: false } })),
  ],
}).replace(/[ \t ]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim()
