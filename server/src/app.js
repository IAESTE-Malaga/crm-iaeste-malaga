import express from 'express'
import cors from 'cors'
import { timingSafeEqual } from 'node:crypto'
import { config } from './config.js'
import { enviarCorreo, ErrorUsuario } from './enviar.js'
import { sincronizar } from './sync.js'

const igual = (a, b) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))

const ENFRIAMIENTO_MS = 45_000
let ultimaVuelta = 0

export function crearApp(sb) {
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', 1) // detrás del proxy de Railway / Render / Fly
  app.use(cors({ origin: config.corsOrigins, methods: ['GET', 'POST'], allowedHeaders: ['Content-Type', 'Authorization'] }))
  app.use(express.json({ limit: '100kb' }))

  app.get('/health', (_req, res) => res.json({ ok: true }))

  // Autenticación: el navegador manda el token de sesión de Supabase del usuario del CRM.
  // Devuelve el perfil, o lanza ErrorUsuario(401/403).
  const usuarioDe = async (req) => {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
    if (!token) throw new ErrorUsuario('Inicia sesión.', 401)
    const { data, error } = await sb.auth.getUser(token)
    if (error || !data?.user) throw new ErrorUsuario('Sesión no válida. Vuelve a entrar.', 401)
    const { data: perfil } = await sb.from('profiles').select('id, nombre, rol').eq('id', data.user.id).maybeSingle()
    if (!perfil) throw new ErrorUsuario('Tu perfil todavía no existe.', 403)
    return perfil
  }
  const autenticar = (req, _res, next) => usuarioDe(req).then((u) => { req.usuario = u; next() }, next)

  // Límite por usuario contando sus envíos de la última hora en la base de datos
  // (en serverless no hay memoria compartida entre instancias, así que no sirve un contador en memoria).
  const limite = async (req, res, next) => {
    try {
      const desde = new Date(Date.now() - 60 * 60 * 1000).toISOString()
      const { count, error } = await sb.from('emails').select('id', { count: 'exact', head: true })
        .eq('enviado_por', req.usuario.id).eq('direccion', 'saliente').gte('enviado_en', desde)
      if (error) throw error
      if (count >= config.sendsPerHour) {
        return res.status(429).json({ error: 'Has enviado demasiados correos en la última hora. Espera un poco.' })
      }
      next()
    } catch (e) {
      next(e)
    }
  }

  app.post('/api/emails/send', autenticar, limite, async (req, res, next) => {
    try {
      const { empresa_id, para, asunto, cuerpo, responder_a } = req.body || {}
      if (!empresa_id) throw new ErrorUsuario('Falta la empresa.')
      const r = await enviarCorreo(sb, req.usuario, { empresaId: empresa_id, para, asunto, cuerpo, responderA: responder_a })
      res.status(201).json(r)
    } catch (e) {
      next(e)
    }
  })

  // Sincronización a demanda: cualquier usuario desde el CRM, o un cron externo con SYNC_SECRET
  app.post('/api/sync', async (req, res, next) => {
    try {
      const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
      const porSecreto = config.syncSecret && token && igual(token, config.syncSecret)
      if (!porSecreto) await usuarioDe(req) // cualquier usuario con sesión puede pedir una vuelta
      if (!config.syncEnabled) return res.json({ omitido: true })
      // Enfriamiento: en la práctica cada vez que alguien abre un hilo de correo se pide una vuelta
      if (Date.now() - ultimaVuelta < ENFRIAMIENTO_MS) return res.json({ omitido: true })
      ultimaVuelta = Date.now()
      res.json(await sincronizar(sb))
    } catch (e) {
      next(e)
    }
  })

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof ErrorUsuario) return res.status(err.status).json({ error: err.message })
    console.error('[api]', err)
    res.status(500).json({ error: 'Error interno del servidor.' })
  })
  return app
}
