// Prueba de humo contra el Supabase LOCAL: permisos RLS, triggers y RPCs. Uso: npm run db:test
// Cambia datos de la base local: ejecuta `npm run db:reset` después para dejarla limpia.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync('.env.development.local', 'utf8').split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)])
)
const nuevo = () => createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
const entrar = async (email, pass) => {
  const c = nuevo()
  const { error } = await c.auth.signInWithPassword({ email, password: pass })
  if (error) throw new Error(`${email}: ${error.message}`)
  return c
}

let fallos = 0
const ok = (cond, msg) => { console.log(`${cond ? '  ok ' : 'FALLO'}  ${msg}`); if (!cond) fallos++ }

const ID = { ana: '11111111-1111-4111-8111-111111111111', luis: '22222222-2222-4222-8222-222222222222', marta: '33333333-3333-4333-8333-333333333333', pablo: '44444444-4444-4444-8444-444444444444', irene: '55555555-5555-4555-8555-555555555555' }

const anon = nuevo()
const ana = await entrar('ana@iaeste.test', 'Admin1234')
const marta = await entrar('marta@iaeste.test', 'Miembro1234')

console.log('Acceso anónimo')
const an = await anon.from('empresas').select('id')
ok(!!an.error || an.data.length === 0, 'anon no lee empresas')
ok(!!(await anon.rpc('ranking_datos', { p_hasta: '2026-12-31' })).error, 'anon no puede llamar a ranking_datos')

console.log('Lectura')
const { data: todas } = await ana.from('empresas').select('id,nombre,responsable,estado').limit(2000)
ok(todas.length === 38, `admin ve las 38 empresas (ve ${todas.length})`)
ok((await marta.from('empresas').select('id')).data.length === 38, 'miembro ve todas (solo lectura en las ajenas)')
const delPablo = todas.find((c) => c.nombre === 'Software Meridiano S.L.')
const deMarta = todas.find((c) => c.nombre === 'Redes del Sur S.A.')
const libre = todas.find((c) => !c.responsable)
ok((await marta.from('historial').select('id').eq('empresa_id', delPablo.id)).data.length === 0, 'miembro no ve el historial de empresas ajenas')
ok((await marta.from('historial').select('id').eq('empresa_id', deMarta.id)).data.length > 0, 'miembro ve el historial de las suyas')
const rk = await marta.rpc('ranking_datos', { p_hasta: '2026-12-31' })
ok(!rk.error && rk.data.hist.length > 0 && rk.data.empresas.length === 38, `ranking_datos funciona para un miembro${rk.error ? ': ' + rk.error.message : ''}`)

console.log('Escritura de miembros')
let r = await marta.from('empresas').update({ nombre: 'Hack' }).eq('id', deMarta.id)
ok(!!r.error, 'miembro no puede cambiar el nombre')
r = await marta.from('empresas').update({ responsable: ID.marta }).eq('id', libre.id).select()
ok(!!r.error || r.data.length === 0, 'miembro no puede quedarse una empresa libre')
r = await marta.from('empresas').update({ estado: 'rechazada' }).eq('id', delPablo.id).select()
ok(!!r.error || r.data.length === 0, 'miembro no puede editar empresas ajenas')
r = await marta.from('empresas').update({ estado: 'interesados', notas: 'Nota de prueba', telefono: '+34 611 111 111' }).eq('id', deMarta.id).select()
ok(!r.error && r.data.length === 1, `miembro edita estado, notas y teléfono de la suya${r.error ? ': ' + r.error.message : ''}`)
const h = (await ana.from('historial').select('accion,estado_nuevo,creado').eq('empresa_id', deMarta.id).order('id', { ascending: false }).limit(6)).data
const estado = h.find((x) => x.accion === 'estado'), nota = h.find((x) => x.accion === 'nota')
ok(estado?.estado_nuevo === 'interesados' && nota && estado.creado === nota.creado, 'el historial registra estado + nota con la misma hora')
r = await marta.from('empresas').insert({ nombre: 'Creada por Marta', cif: 'B99999991', responsable: ID.pablo }).select()
ok(!r.error && r.data[0].responsable === ID.marta, `miembro crea empresa y queda asignada a él aunque intente asignarla a otro${r.error ? ': ' + r.error.message : ''}`)
const creada = r.data?.[0]
r = await marta.from('empresas').insert({ nombre: 'Duplicada', cif: 'b-99999991' })
ok(r.error?.code === '23505' && /cif/i.test(r.error.message), 'CIF duplicado rechazado (se compara normalizado)')
await marta.from('empresas').delete().eq('id', creada.id)
ok((await ana.from('empresas').select('id').eq('id', creada.id)).data.length === 1, 'miembro no puede borrar')
ok(!!(await marta.rpc('admin_poner_contrasena', { p_usuario: ID.pablo, p_contrasena: 'Hackeada123' })).error, 'miembro no puede cambiar contraseñas')
ok((await marta.from('profiles').update({ rol: 'admin' }).eq('id', ID.marta).select()).data?.length === 0, 'miembro no puede ascenderse a admin')

console.log('Admin')
r = await ana.from('practicas').insert({ empresa_id: creada.id, anio: 2026, num_practicas: 2 })
ok(!r.error, 'admin registra prácticas')
ok((await ana.from('empresas').select('historica').eq('id', creada.id).single()).data.historica === true, 'la empresa pasa a histórica sola')
ok(!!(await marta.from('practicas').insert({ empresa_id: creada.id, anio: 2025, num_practicas: 1 })).error, 'miembro no puede registrar prácticas')
await ana.from('practicas').delete().eq('empresa_id', creada.id)
ok((await ana.from('empresas').select('historica').eq('id', creada.id).single()).data.historica === false, 'al quitar las prácticas deja de ser histórica')
ok(!(await ana.from('empresas').update({ responsable: ID.marta }).eq('id', libre.id)).error, 'admin asigna empresas')
ok(!(await ana.from('empresas').delete().eq('id', creada.id)).error, 'admin borra empresas')
ok((await ana.from('historial').delete().eq('empresa_id', creada.id).select('id')).data.length > 0, 'admin limpia el historial de empresas borradas')
ok(!(await ana.from('profiles').update({ rol: 'miembro' }).eq('id', ID.ana)).error, 'un admin puede degradarse si hay otro admin (Luis)')
const luis = await entrar('luis@iaeste.test', 'Admin1234')
ok(!!(await luis.from('profiles').update({ rol: 'miembro' }).eq('id', ID.luis)).error, 'no se puede dejar el CRM sin admins')
await luis.from('profiles').update({ rol: 'admin' }).eq('id', ID.ana)
r = await luis.rpc('admin_poner_contrasena', { p_usuario: ID.irene, p_contrasena: 'Temporal2026' })
ok(!r.error, `admin pone contraseña temporal${r.error ? ': ' + r.error.message : ''}`)
ok(!(await nuevo().auth.signInWithPassword({ email: 'irene@iaeste.test', password: 'Temporal2026' })).error, 'la contraseña temporal funciona para entrar')
await luis.rpc('admin_poner_contrasena', { p_usuario: ID.irene, p_contrasena: 'Miembro1234' })
ok(!!(await luis.rpc('admin_poner_contrasena', { p_usuario: ID.irene, p_contrasena: 'corta' })).error, 'contraseña débil rechazada')

console.log('Registro')
const e = await nuevo().auth.signUp({ email: 'alguien@mailinator.com', password: 'Prueba1234', options: { data: { nombre: 'X' } } })
ok(!!e.error && /desechable|temporal/i.test(e.error.message), `correo desechable bloqueado por el hook${e.error ? '' : ' (NO bloqueado)'}`)
const s = await nuevo().auth.signUp({ email: `nuevo${Date.now()}@iaeste.test`, password: 'Prueba1234', options: { data: { nombre: 'Nuevo Miembro' } } })
ok(!s.error && !s.data.session, `registro normal: pendiente de confirmar por email (Mailpit)${s.error ? ': ' + s.error.message : ''}`)
ok(!!(await nuevo().auth.signUp({ email: `debil${Date.now()}@iaeste.test`, password: 'sololetras' })).error, 'contraseña sin números rechazada')

console.log(fallos ? `\n${fallos} FALLO(S)` : '\nTodo correcto')
process.exit(fallos ? 1 : 0)
