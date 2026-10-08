import { ImapFlow } from 'imapflow'
import { config } from './config.js'
import { parsearCorreo } from './parse.js'
import { ingestarEntrante } from './ingest.js'

let corriendo = false

// Lee los correos NO LEÍDOS del buzón, los guarda y los marca como leídos.
// Un correo solo se marca como leído en Gmail después de guardarlo en la base de datos:
// si algo falla, se vuelve a intentar en la siguiente vuelta (y Message-ID evita duplicados).
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
      const uids = (await client.search({ seen: false }, { uid: true })) || []
      for (const uid of uids.slice(0, config.syncMaxPerRun)) {
        try {
          const msg = await client.fetchOne(uid, { source: true, size: true }, { uid: true })
          if (!msg?.source) throw new Error('mensaje vacío')

          if ((msg.size || msg.source.length) > config.maxMessageBytes) {
            log.warn(`[imap] uid ${uid}: demasiado grande, se marca como leído sin guardar`)
            res.descartados++
            await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true })
            continue
          }

          let parsed
          try {
            parsed = await parsearCorreo(msg.source)
          } catch (e) {
            // Un correo ilegible nunca se va a poder guardar: se marca como leído para no reintentarlo eternamente
            log.warn(`[imap] uid ${uid}: no se pudo interpretar (${e.message}), se marca como leído`)
            res.descartados++
            await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true })
            continue
          }

          const r = await ingestarEntrante(sb, parsed, { cuentaPropia: config.gmailUser })
          res[r === 'guardado' ? 'guardados' : r === 'duplicado' ? 'duplicados' : 'propios']++
          await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true })
        } catch (e) {
          // Error de base de datos / red: NO se marca como leído, se reintenta en la siguiente vuelta
          res.errores++
          log.error(`[imap] uid ${uid}: ${e.message}`)
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
