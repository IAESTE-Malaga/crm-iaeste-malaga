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

// Archivos adjuntos: viven en el bucket «adjuntos» y el navegador solo manda sus rutas (ver supabase/migrations/*_adjuntos.sql).
// Solo se admiten las del propio correo de esa empresa (correos/<empresa>/…) o las de una plantilla (plantillas/<id>/…).
const BUCKET = 'adjuntos'
const MAX_ADJUNTOS = 10
const MAX_BYTES = 18 * 1024 * 1024 // Gmail: 25 MB por correo, y en base64 el archivo pesa ~⅓ más
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const nombreLimpio = (n) => String(n || '').replace(/[\u0000-\u001f\\/]+/g, '_').trim().slice(0, 150)

export function validarAdjuntos(lista, empresaId) {
  if (lista == null) return []
  if (!Array.isArray(lista) || lista.length > MAX_ADJUNTOS) throw new ErrorUsuario(`Máximo ${MAX_ADJUNTOS} archivos adjuntos.`)
  if (!new RegExp(`^${UUID}$`, 'i').test(String(empresaId))) throw new ErrorUsuario('La empresa no es válida.')
  const permitida = new RegExp(`^(correos/${empresaId}|plantillas/${UUID})/${UUID}-[\\w.-]+$`, 'i')
  return lista.map((a) => {
    const path = String(a?.path || '')
    if (!permitida.test(path)) throw new ErrorUsuario('Alguno de los archivos adjuntos no es válido. Quítalo y vuelve a adjuntarlo.')
    return { path, nombre: nombreLimpio(a.nombre) || path.split('/').pop().slice(37) || 'archivo' }
  })
}

async function descargarAdjuntos(sb, lista) {
  let total = 0
  const archivos = []
  for (const a of lista) {
    const { data, error } = await sb.storage.from(BUCKET).download(a.path)
    if (error || !data) throw new ErrorUsuario(`No se encuentra el archivo «${a.nombre}». Quítalo y vuelve a adjuntarlo.`)
    const content = Buffer.from(await data.arrayBuffer())
    total += content.length
    if (total > MAX_BYTES) throw new ErrorUsuario('Los archivos adjuntos pesan demasiado (máximo 18 MB en total).')
    archivos.push({ filename: a.nombre, content, contentType: data.type || undefined, ruta: a.path })
  }
  return archivos
}

// Los archivos de plantilla se copian a la carpeta del correo para que el correo enviado conserve los suyos aunque la plantilla cambie
async function guardarAdjuntos(sb, empresaId, archivos) {
  return Promise.all(archivos.map(async (a) => {
    let path = a.ruta
    if (path.startsWith('plantillas/')) {
      const copia = `correos/${empresaId}/${randomUUID()}-${path.split('/').pop().slice(37)}`
      const { error } = await sb.storage.from(BUCKET).copy(path, copia)
      if (error) console.error('[adjuntos] no se pudo copiar a la carpeta del correo:', error.message)
      else path = copia
    }
    return { path, nombre: a.filename, tamano: a.content.length }
  }))
}

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

// Primer contacto por correo: una empresa «sin contactar» o «no contesta» pasa a «mail enviado»
// (el historial lo anota el trigger; el nombre sale de actualizado_por porque aquí no hay sesión de base de datos).
// Un fallo aquí no debe hacer fallar el envío, que ya ha salido: se devuelve undefined y se registra.
async function marcarMailEnviado(sb, usuario, empresa) {
  if (!['sin_contactar', 'no_contesta'].includes(empresa.estado)) return undefined
  const { error } = await sb.from('empresas')
    .update({ estado: 'mail_enviado', notas: 'Mail enviado', actualizado_por: usuario.nombre })
    .eq('id', empresa.id)
  if (error) { console.error('[smtp] enviado, pero no se pudo cambiar el estado:', error.message); return undefined }
  return 'mail_enviado'
}

// Envía un correo en nombre de `usuario` a una empresa y lo guarda en la base de datos.
// Seguridad:
//  - Solo se puede escribir a direcciones que ya pertenecen a esa empresa (su ficha o contactos suyos):
//    así el CRM no sirve de relé de spam con la cuenta compartida.
//  - Los miembros solo pueden escribir desde empresas que llevan; los admins, desde cualquiera.
export async function enviarCorreo(sb, usuario, { empresaId, para, asunto, cuerpo, responderA, adjuntos }) {
  const { to, subject, text } = validarEnvio({ para, asunto, cuerpo })

  const { data: empresa, error: eEmp } = await sb.from('empresas').select('id, nombre, email, responsable, estado').eq('id', empresaId).maybeSingle()
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

  const archivos = await descargarAdjuntos(sb, validarAdjuntos(adjuntos, empresa.id))

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
      attachments: archivos.map(({ filename, content, contentType }) => ({ filename, content, contentType })),
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
      adjuntos: await guardarAdjuntos(sb, empresaId, archivos),
      enviado_en: fecha.toISOString(),
      enviado_por: usuario.id,
    }).select('id').single()
    if (error) throw error
    return { id: data.id, messageId, estado: await marcarMailEnviado(sb, usuario, empresa) }
  } catch (e) {
    console.error('[smtp] enviado pero NO guardado:', messageId, e.message)
    throw new ErrorUsuario('El correo se ha enviado, pero no se ha podido guardar en el CRM. No lo vuelvas a enviar; avisa a un admin.', 500)
  }
}
