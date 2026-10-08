import { config, supabaseAdmin } from './config.js'
import { crearApp } from './app.js'
import { programarSincronizacion } from './sync.js'

const sb = supabaseAdmin()
const app = crearApp(sb)

const servidor = app.listen(config.port, () => {
  console.log(`[correo] API escuchando en http://localhost:${config.port} (buzón: ${config.gmailUser})`)
})
programarSincronizacion(sb)

// Que un error suelto no deje el servicio caído en silencio
process.on('unhandledRejection', (e) => console.error('[correo] promesa rechazada sin capturar:', e))
for (const s of ['SIGTERM', 'SIGINT']) process.on(s, () => servidor.close(() => process.exit(0)))
