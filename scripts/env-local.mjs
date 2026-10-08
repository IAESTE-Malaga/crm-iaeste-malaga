// Escribe .env.development.local con la URL y la clave pública del Supabase LOCAL
// (las saca de `supabase status`). Vite lo carga solo en `npm run dev`, nunca en el build.
import { execSync } from 'node:child_process'
import { writeFileSync, existsSync } from 'node:fs'

let salida
try {
  salida = execSync('npx supabase status -o env', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] })
} catch {
  console.error('\nNo se ha podido leer el estado de Supabase. ¿Está Docker abierto y has hecho `npm run db:start`?')
  process.exit(1)
}

const vars = Object.fromEntries(
  salida.split(/\r?\n/)
    .map((l) => l.match(/^([A-Z_]+)="?(.*?)"?$/))
    .filter(Boolean)
    .map(([, k, v]) => [k, v])
)
const url = vars.API_URL
const key = vars.ANON_KEY || vars.PUBLISHABLE_KEY
if (!url || !key) {
  console.error('`supabase status` no ha devuelto API_URL / ANON_KEY:\n' + salida)
  process.exit(1)
}

writeFileSync('.env.development.local', [
  '# Generado por `npm run db:env` — Supabase local. No lo subas al repo.',
  `VITE_SUPABASE_URL=${url}`,
  `VITE_SUPABASE_ANON_KEY=${key}`,
  '',
].join('\n'))

// Servicio de correo (server/): en local envía a Mailpit y NO sincroniza IMAP (no hay Gmail de verdad).
// No se pisa si ya existe, por si ahí has puesto tus credenciales reales de pruebas.
if (!existsSync('server/.env') && vars.SERVICE_ROLE_KEY) {
  writeFileSync('server/.env', [
    '# Generado por `npm run db:env` — SOLO entorno local (envía a Mailpit, sin IMAP). No lo subas al repo.',
    `SUPABASE_URL=${url}`,
    `SUPABASE_SERVICE_ROLE_KEY=${vars.SERVICE_ROLE_KEY}`,
    `SUPABASE_ANON_KEY=${key}`, // solo lo usan los tests de server/
    'GMAIL_USER=crm.local@iaeste.test',
    'GMAIL_APP_PASSWORD=sin-usar-en-local',
    'SMTP_HOST=127.0.0.1',
    'SMTP_PORT=54325',
    'SMTP_SECURE=false',
    'SMTP_AUTH=false',
    'SYNC_ENABLED=false',
    'CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173',
    '',
  ].join('\n'))
  console.log('server/.env creado (correo local → Mailpit)')
}

console.log(`
.env.development.local listo (${url})

  App:              npm run dev  →  http://localhost:5173
  Supabase Studio:  ${vars.STUDIO_URL || 'http://127.0.0.1:54323'}
  Correos (Mailpit): ${vars.INBUCKET_URL || vars.MAILPIT_URL || 'http://127.0.0.1:54324'}
  Servicio de correo: npm --prefix server start  →  http://localhost:8787
  Usuarios de prueba: ver supabase/seed.sql
`)
