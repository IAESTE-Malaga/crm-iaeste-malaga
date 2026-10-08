// Levanta TODO el entorno local de una vez: dependencias, Supabase (Docker), .env, servicio de correo y la app.
// Uso: `npm run local` — Ctrl+C lo apaga todo (añade `--keep-db` para dejar Supabase encendido).
import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'

const keepDb = process.argv.includes('--keep-db')
const run = (cmd, args = []) => spawnSync(cmd, args, { stdio: 'inherit', shell: true })
const paso = (t) => console.log(`\n\x1b[36m▶ ${t}\x1b[0m`)
const fallo = (t) => { console.error(`\n\x1b[31m✖ ${t}\x1b[0m`); process.exit(1) }

paso('Comprobando Docker')
if (run('docker', ['info', '--format', '{{.ServerVersion}}']).status !== 0) fallo('Docker no está en marcha. Ábrelo (Docker Desktop) y vuelve a probar.')

if (!existsSync('node_modules')) { paso('Instalando dependencias de la app'); if (run('npm', ['install']).status !== 0) fallo('npm install ha fallado.') }
if (!existsSync('server/node_modules')) { paso('Instalando dependencias del servicio de correo'); if (run('npm', ['run', 'server:install']).status !== 0) fallo('server:install ha fallado.') }

paso('Arrancando Supabase local (la primera vez descarga imágenes: unos minutos)')
if (run('npx', ['supabase', 'start']).status !== 0) fallo('supabase start ha fallado.')

paso('Generando .env.development.local y server/.env')
if (run('npm', ['run', 'db:env']).status !== 0) fallo('db:env ha fallado.')

paso('Arrancando servicio de correo y app')
const hijos = [
  spawn('npm', ['run', 'correo'], { stdio: 'inherit', shell: true }),
  spawn('npm', ['run', 'dev'], { stdio: 'inherit', shell: true }),
]
console.log(`
  App:               http://localhost:5173
  Supabase Studio:   http://127.0.0.1:54323
  Mailpit (correos): http://127.0.0.1:54324
  Servicio de correo: http://localhost:8787
  Usuarios de prueba: ana@iaeste.test / Admin1234 (admin) · marta@iaeste.test / Miembro1234
  Ctrl+C para apagarlo todo.
`)

let saliendo = false
const apagar = () => {
  if (saliendo) return
  saliendo = true
  console.log('\nApagando…')
  for (const h of hijos) {
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(h.pid), '/T', '/F'], { stdio: 'ignore' })
    else h.kill('SIGTERM')
  }
  if (!keepDb) run('npx', ['supabase', 'stop'])
  process.exit(0)
}
process.on('SIGINT', apagar)
process.on('SIGTERM', apagar)
hijos.forEach((h) => h.on('exit', () => apagar()))
