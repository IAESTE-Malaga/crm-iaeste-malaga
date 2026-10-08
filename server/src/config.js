import { createClient } from '@supabase/supabase-js'

const falta = (n) => { throw new Error(`Falta la variable de entorno ${n} (ver server/.env.example)`) }
const req = (n) => process.env[n] || falta(n)
const num = (n, d) => (process.env[n] ? Number(process.env[n]) : d)
const bool = (n, d) => (process.env[n] === undefined ? d : process.env[n] === 'true')

export const config = {
  port: num('PORT', 8787),
  // Orígenes del frontend autorizados (separados por comas)
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173').split(',').map((s) => s.trim()),

  supabaseUrl: req('SUPABASE_URL'),
  supabaseServiceKey: req('SUPABASE_SERVICE_ROLE_KEY'),

  gmailUser: req('GMAIL_USER').toLowerCase(),
  gmailPass: req('GMAIL_APP_PASSWORD').replace(/\s+/g, ''), // Google la muestra con espacios
  fromName: process.env.MAIL_FROM_NAME || 'IAESTE Madrid',

  // SMTP (por defecto Gmail; sobreescribible para pruebas locales con Mailpit)
  smtpHost: process.env.SMTP_HOST || 'smtp.gmail.com',
  smtpPort: num('SMTP_PORT', 465),
  smtpSecure: bool('SMTP_SECURE', true), // true = SSL (465); false = STARTTLS (587)
  smtpAuth: bool('SMTP_AUTH', true),

  // IMAP
  imapHost: process.env.IMAP_HOST || 'imap.gmail.com',
  imapPort: num('IMAP_PORT', 993),
  syncEnabled: bool('SYNC_ENABLED', true),
  syncMinutes: num('SYNC_INTERVAL_MINUTES', 3),
  syncMaxPerRun: num('SYNC_MAX_PER_RUN', 100),
  maxMessageBytes: num('MAX_MESSAGE_MB', 15) * 1024 * 1024,
  // Para disparar la sincronización desde un cron externo: POST /api/sync con "Authorization: Bearer <SYNC_SECRET>"
  syncSecret: process.env.SYNC_SECRET || '',

  sendsPerHour: num('SENDS_PER_HOUR_PER_USER', 30),
}

export const supabaseAdmin = () =>
  createClient(config.supabaseUrl, config.supabaseServiceKey, { auth: { persistSession: false, autoRefreshToken: false } })
