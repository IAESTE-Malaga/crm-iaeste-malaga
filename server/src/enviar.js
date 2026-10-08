import nodemailer from 'nodemailer'
import { randomUUID } from 'node:crypto'
import { config } from './config.js'
import { direccionesDe, asegurarContacto } from './ingest.js'

export class ErrorUsuario extends Error {
  constructor(mensaje, status = 400) { super(mensaje); this.status = status }
}

let transporte
const smtp = () => (transporte ||= nodemailer.createTransport({
  host: config.smtpHost,
  port: config.smtpPort,
  secure: config.smtpSecure,           // 465 = SSL directo; con 587 pon SMTP_SECURE=false (STARTTLS)
  requireTLS: !config.smtpSecure && config.smtpAuth,
  auth: config.smtpAuth ? { user: config.gmailUser, pass: config.gmailPass } : undefined,
  pool: true,
  maxConnections: 2,
  connectionTimeout: 15_000,
  greetingTimeout: 15_000,
  socketTimeout: 30_000,
}))

const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const aHtml = (t) => `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222">${esc(t).replace(/\r?\n/g, '<br>')}</div>`

export function validarEnvio({ para, asunto, cuerpo }) {
  const to = String(para || '').trim().toLowerCase()
  if (!/^[^@\s,;<>]+@[^@\s,;<>]+\.[^@\s,;<>]+$/.test(to) || to.length > 254) throw new ErrorUsuario('El destinatario no es un email válido.')
  const subject = String(asunto || '').trim()
  if (!subject) throw new ErrorUsuario('Escribe un asunto.')
  if (subject.length > 200 || /[\r\n]/.test(subject)) throw new ErrorUsuario('El asunto es demasiado largo o contiene saltos de línea.')
  const text = String(cuerpo || '').replace(/\r\n/g, '\n').trim()
  if (!text) throw new ErrorUsuario('Escribe el mensaje.')
  if (text.length > 20_000) throw new ErrorUsuario('El mensaje es demasiado largo (máximo 20.000 caracteres).')
  return { to, subject, text }
}

// Envía un correo en nombre de `usuario` a una empresa y lo guarda en la base de datos.
// Seguridad:
//  - Solo se puede escribir a direcciones que ya pertenecen a esa empresa (su ficha o contactos suyos):
//    así el CRM no sirve de relé de spam con la cuenta compartida.
//  - Los miembros solo pueden escribir desde empresas que llevan; los admins, desde cualquiera.
export async function enviarCorreo(sb, usuario, { empresaId, para, asunto, cuerpo, responderA }) {
  const { to, subject, text } = validarEnvio({ para, asunto, cuerpo })

  const { data: empresa, error: eEmp } = await sb.from('empresas').select('id, nombre, email, responsable').eq('id', empresaId).maybeSingle()
  if (eEmp) throw eEmp
  if (!empresa) throw new ErrorUsuario('La empresa no existe.', 404)
  if (usuario.rol !== 'admin' && empresa.responsable !== usuario.id) {
    throw new ErrorUsuario('Solo puedes enviar correos desde las empresas que llevas.', 403)
  }

  const { data: contactos, error: eCon } = await sb.from('contactos').select('id, email, empresa_id').eq('empresa_id', empresaId)
  if (eCon) throw eCon
  const permitidos = new Set([...direccionesDe(empresa.email), ...contactos.map((c) => c.email)])
  if (!permitidos.has(to)) {
    throw new ErrorUsuario('Ese destinatario no pertenece a la empresa. Añade su email en la ficha de la empresa primero.', 403)
  }

  // Hilo: si responde a un correo concreto, se enlaza con In-Reply-To / References
  let inReplyTo, referencias
  if (responderA) {
    const { data: previo } = await sb.from('emails').select('message_id, referencias, empresa_id').eq('id', responderA).maybeSingle()
    if (previo && previo.empresa_id === empresaId) {
      inReplyTo = previo.message_id
      referencias = [previo.referencias, previo.message_id].filter(Boolean).join(' ')
    }
  }

  const messageId = `<${randomUUID()}@${config.gmailUser.split('@')[1]}>`
  const fecha = new Date()
  try {
    await smtp().sendMail({
      from: { name: config.fromName, address: config.gmailUser },
      to,
      subject,
      text,
      html: aHtml(text),
      messageId,
      date: fecha,
      inReplyTo,
      references: referencias,
    })
  } catch (e) {
    console.error('[smtp] fallo al enviar:', e.message)
    // 535 = credenciales rechazadas; el resto, problema de red o de Gmail
    throw new ErrorUsuario(
      e.responseCode === 535 || e.code === 'EAUTH'
        ? 'Gmail ha rechazado las credenciales del buzón compartido. Avisa a un admin.'
        : 'No se ha podido enviar el correo. Inténtalo de nuevo en unos minutos.',
      502
    )
  }

  // El correo ya ha salido. Si ahora falla el guardado, hay que decirlo claro (no reenviar a ciegas).
  try {
    const contacto = contactos.find((c) => c.email === to)
    const contactoId = await asegurarContacto(sb, { email: to, empresaId, contacto: contacto || null })
    const { data, error } = await sb.from('emails').insert({
      direccion: 'saliente',
      contacto_id: contactoId,
      empresa_id: empresaId,
      message_id: messageId,
      in_reply_to: inReplyTo || null,
      referencias: referencias || null,
      remitente: config.gmailUser,
      destinatario: to,
      asunto: subject,
      cuerpo_texto: text,
      cuerpo_html: aHtml(text),
      enviado_en: fecha.toISOString(),
      enviado_por: usuario.id,
    }).select('id').single()
    if (error) throw error
    return { id: data.id, messageId }
  } catch (e) {
    console.error('[smtp] enviado pero NO guardado:', messageId, e.message)
    throw new ErrorUsuario('El correo se ha enviado, pero no se ha podido guardar en el CRM. No lo vuelvas a enviar; avisa a un admin.', 500)
  }
}
