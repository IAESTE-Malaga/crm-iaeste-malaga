// Guarda un correo entrante en la base de datos: asocia remitente → contacto → empresa.
// Es idempotente: Message-ID es único, así que ingerir el mismo correo dos veces no duplica nada.

// Escapa los comodines de LIKE (_ y %) — «_» es muy habitual en direcciones de correo
const likeEscapado = (s) => s.replace(/[\\%_]/g, '\\$&')

// Lista de direcciones separadas por ; , o espacios (el campo email de empresas es texto libre)
export const direccionesDe = (texto) =>
  String(texto || '').toLowerCase().split(/[\s;,<>]+/).filter((x) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x))

async function unico(consulta) {
  const { data, error } = await consulta
  if (error) throw error
  return data
}

export async function buscarEmpresa(sb, { email, enRespuestaA = [] }) {
  // 1) Contacto ya conocido
  const contacto = (await unico(sb.from('contactos').select('id, empresa_id').eq('email', email).maybeSingle()))
  if (contacto?.empresa_id) return { contacto, empresaId: contacto.empresa_id }

  // 2) Es una respuesta a un correo que ya tenemos (aunque conteste desde otra dirección)
  const ids = enRespuestaA.filter(Boolean)
  if (ids.length) {
    const previos = await unico(sb.from('emails').select('empresa_id').in('message_id', ids).not('empresa_id', 'is', null).limit(1))
    if (previos?.[0]) return { contacto, empresaId: previos[0].empresa_id }
  }

  // 3) La dirección figura en la ficha de una empresa. Solo vale si es inequívoca.
  const candidatas = await unico(sb.from('empresas').select('id').ilike('email', `%${likeEscapado(email)}%`).limit(2))
  if (candidatas?.length === 1) return { contacto, empresaId: candidatas[0].id }

  return { contacto, empresaId: null }
}

export async function asegurarContacto(sb, { email, nombre, empresaId, contacto }) {
  if (contacto) {
    // Si lo conocíamos sin empresa y ahora la tenemos, se vincula
    if (empresaId && !contacto.empresa_id) {
      await unico(sb.from('contactos').update({ empresa_id: empresaId }).eq('id', contacto.id))
    }
    return contacto.id
  }
  // upsert + ignoreDuplicates: si dos correos del mismo remitente llegan a la vez, no falla
  await unico(sb.from('contactos').upsert({ email, nombre: nombre || null, empresa_id: empresaId }, { onConflict: 'email', ignoreDuplicates: true }))
  const fila = await unico(sb.from('contactos').select('id').eq('email', email).single())
  return fila.id
}

// Devuelve 'guardado' | 'duplicado' | 'propio'
export async function ingestarEntrante(sb, p, { cuentaPropia }) {
  if (p.remitente === cuentaPropia) return 'propio' // copias de lo que enviamos nosotros

  const refs = [p.inReplyTo, ...(p.referencias ? p.referencias.split(/\s+/) : [])]
  const { contacto, empresaId } = await buscarEmpresa(sb, { email: p.remitente, enRespuestaA: refs })
  const contactoId = await asegurarContacto(sb, { email: p.remitente, nombre: p.nombreRemitente, empresaId, contacto })

  const insertados = await unico(
    sb.from('emails')
      .upsert({
        direccion: 'entrante',
        contacto_id: contactoId,
        empresa_id: empresaId,
        message_id: p.messageId,
        in_reply_to: p.inReplyTo,
        referencias: p.referencias,
        remitente: p.remitente,
        destinatario: p.destinatario,
        asunto: p.asunto,
        cuerpo_texto: p.texto,
        cuerpo_html: p.html,
        enviado_en: p.fecha.toISOString(),
      }, { onConflict: 'message_id', ignoreDuplicates: true })
      .select('id')
  )
  return insertados.length ? 'guardado' : 'duplicado'
}
