// Una sola vuelta de sincronización IMAP (para probar las credenciales o lanzarla desde un cron)
import { supabaseAdmin } from './config.js'
import { sincronizar } from './sync.js'

const r = await sincronizar(supabaseAdmin())
process.exit(r.errores ? 1 : 0)
