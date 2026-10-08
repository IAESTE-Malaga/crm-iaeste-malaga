import { simpleParser } from 'mailparser'
import { createHash } from 'node:crypto'

const MAX_TEXTO = 200_000

const limpiaId = (s) => (s ? String(s).trim() : null)

// Convierte un correo en crudo (RFC 822) en un objeto plano. mailparser se encarga de lo difícil:
// multipart/alternative y mixed, quoted-printable / base64, charsets (ISO-8859-1, etc.) y cabeceras
// codificadas. Los adjuntos se ignoran (no se guardan).
export async function parsearCorreo(source) {
  const m = await simpleParser(source, { skipImageLinks: true })

  const de = m.from?.value?.[0]
  const remitente = de?.address?.trim().toLowerCase()
  if (!remitente) throw new Error('Correo sin remitente válido')

  const para = (m.to?.value || []).map((a) => a.address).filter(Boolean)
  const texto = (m.text || '').trim()
  const html = typeof m.html === 'string' ? m.html : null

  const fecha = m.date instanceof Date && !Number.isNaN(m.date.getTime()) ? m.date : new Date()

  return {
    // Sin Message-ID (raro) se inventa uno estable a partir del contenido, para que no se duplique
    messageId: limpiaId(m.messageId) || `<${createHash('sha1').update(source).digest('hex')}@sin-message-id.local>`,
    inReplyTo: limpiaId(m.inReplyTo),
    referencias: Array.isArray(m.references) ? m.references.join(' ') : limpiaId(m.references),
    remitente,
    nombreRemitente: de?.name?.trim() || null,
    destinatario: para.join(', '),
    asunto: (m.subject || '(sin asunto)').slice(0, 500),
    texto: texto.slice(0, MAX_TEXTO),
    html: html ? html.slice(0, MAX_TEXTO * 2) : null,
    fecha,
  }
}
