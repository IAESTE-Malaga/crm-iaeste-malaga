import { ImapFlow } from 'imapflow'
import { config } from './config.js'
import { parsearCorreo } from './parse.js'
import { ingestarEntrante } from './ingest.js'

let corriendo = false

// Repasa los correos de los últimos SYNC_LOOKBACK_DAYS días de la bandeja de entrada (estén leídos o no:
// abrir un correo en Gmail no debe hacer que el CRM lo pierda) y guarda los que todavía no conoce.
// Primero se piden solo los metadatos (Message-ID, remitente, tamaño); el contenido completo se descarga
// únicamente de los correos nuevos. Message-ID es único en la base de datos, así que reprocesar es inocuo.
// No se cambia ningún indicador en Gmail. Si algo falla (base de datos, red), ese correo se reintenta en la
// siguiente vuelta mientras siga dentro de la ventana de días.
export async function sincronizar(sb, log = console) {
  if (corriendo) return { omitido: true } // no solapar vueltas
  corriendo = true
  const res = { guardados: 0, duplicados: 0, propios: 0, descartados: 0, errores: 0 }

  const client = new ImapFlow({
    host: config.imapHost,
    port: config.imapPort,
    secure: true,
    auth: { user: config.gmailUser, pass: config.gmailPass },
    logger: false,
  })
  // Sin este manejador, un corte de red tumbaría todo el proceso
  client.on('error', (e) => log.error('[imap] error de conexión:', e.message))

  try {
    await client.connect()
    const lock = await client.getMailboxLock('INBOX')
    try {
      const desde = new Date(Date.now() - config.syncLookbackDays * 24 * 60 * 60 * 1000)
      const uids = (await client.search({ since: desde }, { uid: true })) || []

      // 1) Solo metadatos (hay que consumir todo el listado antes de pedir nada más por IMAP)
      const metas = []
      if (uids.length) {
        for await (const m of client.fetch(uids.join(','), { uid: true, envelope: true, size: true }, { uid: true })) {
          metas.push({ uid: m.uid, messageId: m.envelope?.messageId || null, de: m.envelope?.from?.[0]?.address?.toLowerCase() || null, size: m.size || 0 })
        }
      }

      // 2) Cuáles ya están guardados
      const conocidos = new Set()
      const ids = metas.map((m) => m.messageId).filter(Boolean)
      for (let i = 0; i < ids.length; i += 100) {
        const { data, error } = await sb.from('emails').select('message_id').in('message_id', ids.slice(i, i + 100))
        if (error) throw error
        for (const f of data) conocidos.add(f.message_id)
      }

      // 3) Descargar y guardar solo los nuevos
      let procesados = 0
      for (const m of metas) {
        if (m.messageId && conocidos.has(m.messageId)) { res.duplicados++; continue }
        if (m.de === config.gmailUser) { res.propios++; continue } // copias de lo que enviamos nosotros
        if (m.size > config.maxMessageBytes) {
          log.warn(`[imap] uid ${m.uid}: demasiado grande (${m.size} bytes), se ignora`)
          res.descartados++
          continue
        }
        if (procesados >= config.syncMaxPerRun) break // el resto, en la siguiente vuelta
        procesados++
        try {
          const msg = await client.fetchOne(m.uid, { source: true }, { uid: true })
          if (!msg?.source) throw new Error('mensaje vacío')

          let parsed
          try {
            parsed = await parsearCorreo(msg.source)
          } catch (e) {
            // Un correo ilegible nunca se va a poder guardar: se ignora (y se vuelve a ver, sin efecto, hasta que salga de la ventana)
            log.warn(`[imap] uid ${m.uid}: no se pudo interpretar (${e.message}), se ignora`)
            res.descartados++
            continue
          }

          const r = await ingestarEntrante(sb, parsed, { cuentaPropia: config.gmailUser })
          res[r === 'guardado' ? 'guardados' : r === 'duplicado' ? 'duplicados' : 'propios']++
        } catch (e) {
          // Error de base de datos / red: se reintenta en la siguiente vuelta
          res.errores++
          log.error(`[imap] uid ${m.uid}: ${e.message}`)
        }
      }
    } finally {
      lock.release()
    }
    await client.logout()
  } catch (e) {
    res.errores++
    log.error('[imap] la sincronización ha fallado:', e.message)
    try { client.close() } catch { /* ya cerrado */ }
  } finally {
    corriendo = false
  }
  log.log('[imap] vuelta terminada', JSON.stringify(res))
  return res
}

export function programarSincronizacion(sb, log = console) {
  if (!config.syncEnabled) { log.log('[imap] sincronización desactivada (SYNC_ENABLED=false)'); return }
  const ms = Math.max(1, config.syncMinutes) * 60_000
  const vuelta = () => sincronizar(sb, log).catch((e) => log.error('[imap]', e.message))
  setTimeout(vuelta, 3000) // primera vuelta nada más arrancar
  setInterval(vuelta, ms)
  log.log(`[imap] sincronizando cada ${config.syncMinutes} min`)
}
