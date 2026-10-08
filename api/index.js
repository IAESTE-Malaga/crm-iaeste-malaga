// Función serverless de Vercel: expone la API de correo (server/src/app.js) en /api/*.
// El envío es una petición normal; la recepción (IMAP) se lanza a demanda con POST /api/sync.
import { supabaseAdmin } from '../server/src/config.js'
import { crearApp } from '../server/src/app.js'

export default crearApp(supabaseAdmin())
