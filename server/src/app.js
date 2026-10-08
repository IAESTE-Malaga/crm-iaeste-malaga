import express from 'express'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import { timingSafeEqual } from 'node:crypto'
import { config } from './config.js'
import { enviarCorreo, ErrorUsuario } from './enviar.js'
import { sincronizar } from './sync.js'

const igual = (a, b) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))

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

  const limite = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: config.sendsPerHour,
    keyGenerator: (req) => req.usuario.id,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Has enviado demasiados correos en la última hora. Espera un poco.' },
  })

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

  // Sincronización a demanda: un admin desde el CRM, o un cron externo con SYNC_SECRET
  app.post('/api/sync', async (req, res, next) => {
    try {
      const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
      const porSecreto = config.syncSecret && token && igual(token, config.syncSecret)
      if (!porSecreto) {
        const u = await usuarioDe(req)
        if (u.rol !== 'admin') throw new ErrorUsuario('Solo un admin puede sincronizar.', 403)
      }
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
