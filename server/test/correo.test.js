// Pruebas contra el Supabase LOCAL (npm run db:start) y Mailpit. Uso: npm --prefix server test
// Crean datos de prueba en la base local: haz `npm run db:reset` después.
import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'
import { supabaseAdmin } from '../src/config.js'
import { crearApp } from '../src/app.js'
import { parsearCorreo } from '../src/parse.js'
import { ingestarEntrante } from '../src/ingest.js'

const sb = supabaseAdmin()
const URL_SB = process.env.SUPABASE_URL
const MAILPIT = 'http://127.0.0.1:54324'
const PROPIA = process.env.GMAIL_USER.toLowerCase()
const ANON = process.env.SUPABASE_ANON_KEY

const EMPRESA_MARTA = 'Redes del Sur S.A.'   // la lleva Marta; email jmolina@redesdelsur.example
const EMPRESA_PABLO = 'Software Meridiano S.L.'
let servidor, base, empresaMarta, empresaPablo

const login = async (email, pass) => {
  const c = createClient(URL_SB, ANON, { auth: { persistSession: false } })
  const { data, error } = await c.auth.signInWithPassword({ email, password: pass })
  assert.ifError(error)
  return { cliente: c, token: data.session.access_token }
}
const post = (ruta, token, body) => fetch(`${base}${ruta}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body),
})

before(async () => {
  const { data } = await sb.from('empresas').select('id, nombre').in('nombre', [EMPRESA_MARTA, EMPRESA_PABLO])
  empresaMarta = data.find((e) => e.nombre === EMPRESA_MARTA).id
  empresaPablo = data.find((e) => e.nombre === EMPRESA_PABLO).id
  servidor = crearApp(sb).listen(0)
  base = `http://127.0.0.1:${servidor.address().port}`
})
after(() => servidor?.close())

// ---------- Parseo MIME ----------
const MULTIPART = [
  'From: =?UTF-8?Q?Jorge_Mol=C3=ADna?= <JMolina@RedesDelSur.example>',
  'To: crm.local@iaeste.test',
  'Subject: =?ISO-8859-1?Q?Re:_Pr=E1cticas_2027?=',
  'Date: Tue, 06 Oct 2026 10:15:00 +0200',
  'Message-ID: <abc-123@redesdelsur.example>',
  'In-Reply-To: <previo@iaeste.test>',
  'MIME-Version: 1.0',
  'Content-Type: multipart/mixed; boundary="EXT"',
  '',
  '--EXT',
  'Content-Type: multipart/alternative; boundary="ALT"',
  '',
  '--ALT',
  'Content-Type: text/plain; charset=ISO-8859-1',
  'Content-Transfer-Encoding: quoted-printable',
  '',
  'Hola, nos interesar=EDa recibir m=E1s informaci=F3n.',
  '--ALT',
  'Content-Type: text/html; charset=UTF-8',
  'Content-Transfer-Encoding: base64',
  '',
  Buffer.from('<p>Hola, nos <b>interesaría</b> recibir más información.</p>').toString('base64'),
  '--ALT--',
  '--EXT',
  'Content-Type: application/pdf; name="x.pdf"',
  'Content-Disposition: attachment; filename="x.pdf"',
  'Content-Transfer-Encoding: base64',
  '',
  Buffer.from('%PDF-fake').toString('base64'),
  '--EXT--',
  '',
].join('\r\n')

test('parsea multipart (texto + html + adjunto), charsets y cabeceras codificadas', async () => {
  const p = await parsearCorreo(MULTIPART)
  assert.equal(p.remitente, 'jmolina@redesdelsur.example')
  assert.equal(p.nombreRemitente, 'Jorge Molína')
  assert.equal(p.asunto, 'Re: Prácticas 2027')
  assert.equal(p.texto, 'Hola, nos interesaría recibir más información.')
  assert.match(p.html, /<b>interesaría<\/b>/)
  assert.equal(p.messageId, '<abc-123@redesdelsur.example>')
  assert.equal(p.inReplyTo, '<previo@iaeste.test>')
  assert.equal(p.fecha.toISOString(), '2026-10-06T08:15:00.000Z')
})

test('correo solo HTML: se genera texto plano; sin Message-ID se inventa uno estable', async () => {
  const raw = 'From: a@b.example\r\nSubject: x\r\nContent-Type: text/html\r\n\r\n<p>Solo <i>html</i></p>'
  const p1 = await parsearCorreo(raw), p2 = await parsearCorreo(raw)
  assert.match(p1.texto, /Solo\s+html/)
  assert.equal(p1.messageId, p2.messageId)
  assert.match(p1.messageId, /sin-message-id/)
})

test('correo sin remitente válido se rechaza', async () => {
  await assert.rejects(parsearCorreo('Subject: x\r\n\r\ncuerpo'), /remitente/)
})

// ---------- Ingesta ----------
const crudo = (de, id, extra = '') => `From: ${de}\r\nTo: ${PROPIA}\r\nSubject: Prueba\r\nMessage-ID: ${id}\r\nDate: Tue, 06 Oct 2026 10:00:00 +0000\r\n${extra}\r\n\r\nHola`

test('ingesta: asocia por el email de la ficha de la empresa y no duplica', async () => {
  const id = `<ing-${Date.now()}@x.example>`
  const p = await parsearCorreo(MULTIPART.replace('<abc-123@redesdelsur.example>', id))
  assert.equal(await ingestarEntrante(sb, p, { cuentaPropia: PROPIA }), 'guardado')
  assert.equal(await ingestarEntrante(sb, p, { cuentaPropia: PROPIA }), 'duplicado')
  const { data } = await sb.from('emails').select('empresa_id, direccion, contacto_id').eq('message_id', id)
  assert.equal(data.length, 1)
  assert.equal(data[0].empresa_id, empresaMarta)
  assert.equal(data[0].direccion, 'entrante')
  const { data: c } = await sb.from('contactos').select('empresa_id').eq('id', data[0].contacto_id).single()
  assert.equal(c.empresa_id, empresaMarta)
})

test('ingesta: remitente desconocido → contacto nuevo sin empresa; ignora la cuenta propia', async () => {
  const email = `desconocido${Date.now()}@raro.example`
  const p = await parsearCorreo(crudo(email, `<des-${Date.now()}@x.example>`))
  assert.equal(await ingestarEntrante(sb, p, { cuentaPropia: PROPIA }), 'guardado')
  const { data } = await sb.from('contactos').select('empresa_id').eq('email', email).single()
  assert.equal(data.empresa_id, null)
  const propio = await parsearCorreo(crudo(PROPIA, `<propio-${Date.now()}@x.example>`))
  assert.equal(await ingestarEntrante(sb, propio, { cuentaPropia: PROPIA }), 'propio')
})

test('ingesta: una respuesta desde otra dirección se engancha al hilo', async () => {
  const base1 = `<hilo-orig-${Date.now()}@iaeste.test>`
  await sb.from('emails').insert({ direccion: 'saliente', empresa_id: empresaPablo, message_id: base1, remitente: PROPIA, destinatario: 'x@y.example', asunto: 'a', enviado_en: new Date().toISOString() })
  const p = await parsearCorreo(crudo(`otra${Date.now()}@personal.example`, `<hilo-resp-${Date.now()}@x.example>`, `In-Reply-To: ${base1}\r\n`))
  await ingestarEntrante(sb, p, { cuentaPropia: PROPIA })
  const { data } = await sb.from('emails').select('empresa_id').eq('message_id', p.messageId).single()
  assert.equal(data.empresa_id, empresaPablo)
})

test('ingesta: dos correos simultáneos del mismo remitente nuevo no fallan', async () => {
  const email = `carrera${Date.now()}@raro.example`
  const ps = await Promise.all([1, 2, 3].map((n) => parsearCorreo(crudo(email, `<carr-${n}-${Date.now()}@x.example>`))))
  const r = await Promise.all(ps.map((p) => ingestarEntrante(sb, p, { cuentaPropia: PROPIA })))
  assert.deepEqual(r, ['guardado', 'guardado', 'guardado'])
})

// ---------- Envío (SMTP → Mailpit) ----------
test('API: exige sesión', async () => {
  assert.equal((await post('/api/emails/send', null, {})).status, 401)
  assert.equal((await post('/api/emails/send', 'token-falso', {})).status, 401)
})

test('API: un miembro envía desde su empresa, se guarda y llega a Mailpit con cabeceras de hilo', async () => {
  const { token } = await login('marta@iaeste.test', 'Miembro1234')
  const asunto = `Prueba de envío ${Date.now()}`
  const r = await post('/api/emails/send', token, { empresa_id: empresaMarta, para: 'jmolina@redesdelsur.example', asunto, cuerpo: 'Hola Jorge,\n\n<b>gracias</b> & saludos' })
  assert.equal(r.status, 201, await r.clone().text())
  const { id, messageId } = await r.json()

  const { data } = await sb.from('emails').select('*').eq('id', id).single()
  assert.equal(data.direccion, 'saliente')
  assert.equal(data.empresa_id, empresaMarta)
  assert.equal(data.message_id, messageId)
  assert.equal(data.enviado_por, '33333333-3333-4333-8333-333333333333')
  assert.match(data.cuerpo_html, /&lt;b&gt;gracias&lt;\/b&gt; &amp; saludos/) // HTML escapado

  const lista = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent('subject:"' + asunto + '"')}`)).json()
  assert.equal(lista.messages.length, 1, 'el correo llegó a Mailpit')
  const msg = await (await fetch(`${MAILPIT}/api/v1/message/${lista.messages[0].ID}`)).json()
  assert.equal(msg.To[0].Address, 'jmolina@redesdelsur.example')
  assert.equal(msg.From.Address, PROPIA)

  // Responder: enlaza In-Reply-To
  const r2 = await post('/api/emails/send', token, { empresa_id: empresaMarta, para: 'jmolina@redesdelsur.example', asunto: 'Re: ' + asunto, cuerpo: 'Segundo', responder_a: id })
  assert.equal(r2.status, 201)
  const { data: d2 } = await sb.from('emails').select('in_reply_to').eq('id', (await r2.json()).id).single()
  assert.equal(d2.in_reply_to, messageId)
})

test('API: un miembro no puede enviar desde empresas ajenas ni a destinatarios que no son de la empresa', async () => {
  const { token } = await login('marta@iaeste.test', 'Miembro1234')
  let r = await post('/api/emails/send', token, { empresa_id: empresaPablo, para: 'rhernandez@x.example', asunto: 'a', cuerpo: 'b' })
  assert.equal(r.status, 403)
  r = await post('/api/emails/send', token, { empresa_id: empresaMarta, para: 'victima@cualquiera.example', asunto: 'a', cuerpo: 'b' })
  assert.equal(r.status, 403)
  assert.match((await r.json()).error, /no pertenece/)
})

test('API: validación de entrada (asunto con saltos de línea, vacíos, email inválido)', async () => {
  const { token } = await login('ana@iaeste.test', 'Admin1234')
  const ok = { empresa_id: empresaMarta, para: 'jmolina@redesdelsur.example', asunto: 'a', cuerpo: 'b' }
  for (const malo of [{ asunto: 'a\r\nBcc: x@y.z' }, { asunto: '' }, { cuerpo: '  ' }, { para: 'no-es-email' }, { cuerpo: 'x'.repeat(20_001) }]) {
    assert.equal((await post('/api/emails/send', token, { ...ok, ...malo })).status, 400, JSON.stringify(malo).slice(0, 60))
  }
  assert.equal((await post('/api/emails/send', token, { ...ok, empresa_id: '00000000-0000-4000-8000-000000000000' })).status, 404)
})

test('API: un admin envía desde cualquier empresa; /api/sync solo para admins', async () => {
  const ana = await login('ana@iaeste.test', 'Admin1234')
  const r = await post('/api/emails/send', ana.token, { empresa_id: empresaPablo, para: 'rdelgado@meridiano.example', asunto: `Admin ${Date.now()}`, cuerpo: 'hola' })
  // rdelgado no está en la ficha de Meridiano (es talento@meridiano.example): comprobamos la regla, no el éxito
  assert.equal(r.status, 403)
  const r2 = await post('/api/emails/send', ana.token, { empresa_id: empresaPablo, para: 'talento@meridiano.example', asunto: `Admin ${Date.now()}`, cuerpo: 'hola' })
  assert.equal(r2.status, 201)
  const marta = await login('marta@iaeste.test', 'Miembro1234')
  assert.equal((await post('/api/sync', marta.token, {})).status, 403)
  assert.equal((await post('/api/sync', null, {})).status, 401)
})

// ---------- Lectura (RLS) ----------
test('RLS: el miembro solo lee los correos de sus empresas; los sin clasificar solo los ve un admin', async () => {
  const marta = await login('marta@iaeste.test', 'Miembro1234')
  const { data } = await marta.cliente.from('emails').select('empresa_id')
  assert.ok(data.length > 0)
  assert.ok(data.every((e) => e.empresa_id === empresaMarta || e.empresa_id !== null))
  assert.equal((await marta.cliente.from('emails').select('id').eq('empresa_id', empresaPablo)).data.length, 0)
  assert.equal((await marta.cliente.from('emails').select('id').is('empresa_id', null)).data.length, 0)
  const ana = await login('ana@iaeste.test', 'Admin1234')
  assert.ok((await ana.cliente.from('emails').select('id').is('empresa_id', null)).data.length > 0)
  // Nadie escribe desde el navegador
  const w = await marta.cliente.from('emails').insert({ direccion: 'saliente', message_id: '<hack>', remitente: 'a', destinatario: 'b', enviado_en: new Date().toISOString(), empresa_id: empresaMarta })
  assert.ok(w.error)
  const anon = createClient(URL_SB, ANON, { auth: { persistSession: false } })
  assert.equal((await anon.from('emails').select('id')).data?.length ?? 0, 0)
})
