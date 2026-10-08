// Escribe .env.development.local con la URL y la clave pública del Supabase LOCAL
// (las saca de `supabase status`). Vite lo carga solo en `npm run dev`, nunca en el build.
import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

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

console.log(`
.env.development.local listo (${url})

  App:              npm run dev  →  http://localhost:5173
  Supabase Studio:  ${vars.STUDIO_URL || 'http://127.0.0.1:54323'}
  Correos (Mailpit): ${vars.INBUCKET_URL || vars.MAILPIT_URL || 'http://127.0.0.1:54324'}
  Usuarios de prueba: ver supabase/seed.sql
`)
