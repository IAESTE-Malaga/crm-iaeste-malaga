import { useState, useEffect, useCallback, Fragment } from 'react'
import { supabase } from './supabase'
import {
  Building2, Plus, Search, LogOut, Pencil, Trash2, X, ChevronRight,
  Shield, User, Save, Mail, Phone, AlertCircle, KeyRound, Download, CalendarClock, Send, FileSpreadsheet, Trophy,
  History, UserPlus, Inbox,
} from 'lucide-react'

// ---------- Config ----------
const ESTADOS = [
  { id: 'sin_contactar', label: 'Sin contactar', color: 'bg-slate-100 text-slate-600 border-slate-200', dot: 'bg-slate-400' },
  { id: 'no_contesta', label: 'No lo cogen', color: 'bg-cyan-50 text-cyan-700 border-cyan-200', dot: 'bg-cyan-500' },
  { id: 'mail_enviado', label: 'Mail enviado', color: 'bg-yellow-50 text-yellow-700 border-yellow-200', dot: 'bg-yellow-400' },
  { id: 'mas_adelante', label: 'Para más adelante', color: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200', dot: 'bg-fuchsia-500' },
  { id: 'segundo_plazo', label: 'Segundo plazo', color: 'bg-amber-100 text-amber-900 border-amber-300', dot: 'bg-amber-700' },
  { id: 'otra_provincia', label: 'Otra provincia', color: 'bg-neutral-100 text-neutral-600 border-neutral-300', dot: 'bg-neutral-400' },
  { id: 'interesados', label: 'Muy interesados', color: 'bg-orange-50 text-orange-700 border-orange-200', dot: 'bg-orange-500' },
  { id: 'beca', label: 'Beca conseguida', color: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  { id: 'rechazada', label: 'No quieren', color: 'bg-rose-50 text-rose-700 border-rose-200', dot: 'bg-rose-500' },
]
const estadoDe = (id) => ESTADOS.find((e) => e.id === id) || ESTADOS[0]

// Cuántas empresas sin contactar se asignan de golpe y a partir de cuántas se avisa
const LOTE = 5
const AVISO_POCAS = 2

// Acciones del historial
const ACCIONES = {
  alta: { label: 'Alta', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  estado: { label: 'Estado', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  nota: { label: 'Nota', color: 'bg-slate-100 text-slate-600 border-slate-200' },
  agenda: { label: 'Agenda', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  responsable: { label: 'Responsable', color: 'bg-violet-50 text-violet-700 border-violet-200' },
  datos: { label: 'Datos', color: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
  quincena: { label: 'Quincena', color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
}
const accionDe = (id) => ACCIONES[id] || { label: id, color: 'bg-slate-100 text-slate-600 border-slate-200' }

// Baremo de puntos del club. Cámbialo aquí y se recalcula todo el histórico:
// los puntos no se guardan en la base de datos, se derivan del historial.
const PUNTOS = {
  alta: 2,          // dar de alta una empresa nueva
  nota: 1,          // escribir una nota de seguimiento
  agenda: 0,        // mover el recordatorio
  datos: 0,         // corregir teléfono, email…
  responsable: 0,   // reasignaciones (las hace el admin, no puntúan)
  estado: {
    _: 1,               // cualquier cambio de estado
    interesados: 5,     // pasar una empresa a «Muy interesados»
    beca: 15,           // cerrar una beca
  },
  quincena: 10,       // seguimiento quincenal cumplido (ver QUINCENA)
}
const puntosDe = (h) =>
  h.accion === 'estado'
    ? (PUNTOS.estado[h.estado_nuevo] ?? PUNTOS.estado._)
    : h.accion === 'quincena'
      ? (h.cumple ? PUNTOS.quincena : 0)
      : (PUNTOS[h.accion] ?? 0)

// ---------- Seguimiento quincenal ----------
// Cada 14 días, contados desde QUINCENA.inicio (iguales para todo el equipo), se revisa a cada
// persona: si ha vuelto a tocar TODAS las empresas que tenía en seguimiento al empezar la
// quincena, se lleva PUNTOS.quincena. No se guarda nada en la base de datos: se deduce del historial.
//  - «En seguimiento» = empresa asignada a esa persona cuyo estado, al empezar la quincena,
//    era uno de QUINCENA.activos. Las que siguen sin contactar, aparcadas o cerradas no cuentan.
//  - «La ha vuelto a tocar» = dentro de la quincena, esa persona ha escrito una nota o ha
//    cambiado el estado (incluido cerrarla como beca o «No quieren»).
//  - Quien no tenía ninguna empresa en seguimiento no cumple ni falla esa quincena.
const QUINCENA = {
  inicio: '2026-09-28',                                      // lunes en que arranca la primera
  dias: 14,
  activos: ['no_contesta', 'mail_enviado', 'interesados'],
  cuentan: ['nota', 'estado'],
}
const isoDia = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const diaMas = (iso, n) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return isoDia(d) }

// Quincenas que han empezado hasta `hastaIso` (incluido). fin es exclusivo.
function quincenasHasta(hastaIso) {
  const out = []
  for (let ini = QUINCENA.inicio; ini <= hastaIso; ini = diaMas(ini, QUINCENA.dias)) {
    out.push({ ini, fin: diaMas(ini, QUINCENA.dias) })
  }
  return out
}

// hist: filas del historial (empresa_id, usuario_id, accion, estado_nuevo, creado), en cualquier orden.
// companies: empresas actuales (id, nombre, responsable).
// Devuelve { [usuario_id]: [{ ini, fin, total, hechas, cumple, faltan: [empresa], enCurso }] }
function evaluarQuincenas(hist, companies, hastaIso) {
  const porEmpresa = {}
  for (const h of hist) (porEmpresa[h.empresa_id] ||= []).push(h)
  for (const k in porEmpresa) porEmpresa[k].sort((a, b) => new Date(a.creado) - new Date(b.creado))

  const ahora = new Date()
  const res = {}
  for (const q of quincenasHasta(hastaIso)) {
    const ini = new Date(q.ini + 'T00:00:00')
    const fin = new Date(q.fin + 'T00:00:00')
    const porPersona = {}
    for (const c of companies) {
      if (!c.responsable) continue
      const filas = porEmpresa[c.id] || []
      let estado = 'sin_contactar'
      for (const h of filas) {
        if (new Date(h.creado) >= ini) break
        if (h.accion === 'estado' && h.estado_nuevo) estado = h.estado_nuevo
      }
      if (!QUINCENA.activos.includes(estado)) continue
      const tocada = filas.some((h) => {
        const t = new Date(h.creado)
        return t >= ini && t < fin && h.usuario_id === c.responsable && QUINCENA.cuentan.includes(h.accion)
      })
      const p = (porPersona[c.responsable] ||= { total: 0, hechas: 0, faltan: [] })
      p.total++
      if (tocada) p.hechas++
      else p.faltan.push(c)
    }
    for (const [uid, p] of Object.entries(porPersona)) {
      ;(res[uid] ||= []).push({
        ...q, ...p,
        cumple: p.hechas === p.total,
        enCurso: fin > ahora,
      })
    }
  }
  return res
}

// Supabase corta cada consulta en 1000 filas aunque pidas más: esto pagina hasta traerlo todo.
async function traerTodo(consulta) {
  const PAG = 1000
  const out = []
  for (let i = 0; ; i += PAG) {
    const { data, error } = await consulta().range(i, i + PAG - 1)
    if (error) throw error
    out.push(...(data || []))
    if (!data || data.length < PAG) return out
  }
}

// El detalle de los cambios de estado viene con los ids crudos ("mail_enviado → beca")
const detalleLegible = (h) =>
  h.accion === 'estado' && h.estado_anterior && h.estado_nuevo
    ? `${estadoDe(h.estado_anterior).label} → ${estadoDe(h.estado_nuevo).label}`
    : h.detalle
const fecha = (iso) =>
  iso ? new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''

const HOY = () => new Date().toISOString().slice(0, 10)
const sumarDias = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }
// 1 de septiembre del curso en marcha (si estamos en enero-agosto, el del año anterior)
const INICIO_CURSO = () => {
  const h = new Date()
  return `${h.getMonth() >= 8 ? h.getFullYear() : h.getFullYear() - 1}-09-01`
}
const fechaCorta = (iso) => iso ? new Date(iso + 'T00:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }) : ''

// Plantilla de primer contacto por email
const plantillaEmail = (emp, yo) => {
  const asunto = `IAESTE Madrid - Estudiantes internacionales en practicas para ${emp.nombre || 'su empresa'}`
  const cuerpo = [
    `Buenos dias${emp.contacto ? ' ' + emp.contacto : ''},`, '',
    'Le escribo desde IAESTE Madrid, el comite de la Universidad Politecnica de Madrid de una asociacion internacional sin animo de lucro que gestiona practicas para estudiantes de ingenieria y ciencias.',
    '',
    'Nos encargamos de todo el proceso: seleccionamos al estudiante segun el perfil que necesiten, tramitamos la documentacion y le damos alojamiento y acompanamiento durante su estancia. Para la empresa no supone coste de intermediacion.',
    '',
    'Si les encaja, ?tendria unos minutos esta semana o la siguiente para contarselo por telefono?',
    '', 'Un saludo,', yo || '', 'IAESTE Madrid - ETSIT UPM',
  ].join('\n')
  return `mailto:${emp.email || ''}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`
}

// ---------- UI básicos ----------
const Badge = ({ estadoId }) => {
  const e = estadoDe(estadoId)
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${e.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${e.dot}`} />
      {e.label}
    </span>
  )
}

const Input = (props) => (
  <input
    {...props}
    className={`w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600 ${props.className || ''}`}
  />
)

const Label = ({ children }) => (
  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{children}</label>
)

const Btn = ({ children, variant = 'primary', ...props }) => {
  const styles = {
    primary: 'bg-blue-700 hover:bg-blue-800 text-white',
    ghost: 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-300',
    danger: 'bg-white hover:bg-rose-50 text-rose-600 border border-rose-200',
  }
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${styles[variant]} ${props.className || ''}`}
    >
      {children}
    </button>
  )
}

// ---------- Login / Registro ----------
function Auth() {
  // Con ?registro en el enlace (https://…/?registro) se abre directamente en «Crear cuenta»
  const [modo, setModo] = useState(() =>
    new URLSearchParams(window.location.search).has('registro') ? 'registro' : 'login'
  ) // login | registro
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [err, setErr] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)

  const enviar = async () => {
    setErr(''); setInfo(''); setBusy(true)
    try {
      if (modo === 'registro') {
        if (!nombre.trim()) throw new Error('Indica tu nombre.')
        if (pass.length < 6) throw new Error('La contraseña necesita al menos 6 caracteres.')
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password: pass,
          options: { data: { nombre: nombre.trim() } },
        })
        if (error) throw error
        // Si Supabase no pide confirmar el email, signUp ya devuelve sesión y se entra solo.
        if (!data.session) setInfo('Cuenta creada. Te hemos enviado un email: ábrelo para confirmarla y después entra aquí.')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pass })
        if (error) throw error
      }
    } catch (e) {
      setErr(e.message === 'Invalid login credentials' ? 'Email o contraseña incorrectos.' : e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-blue-700 flex items-center justify-center">
            <Building2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-slate-900 leading-tight">CRM IAESTE</h1>
            <p className="text-xs text-slate-500">Gestión de empresas</p>
          </div>
        </div>
        <div className="grid grid-cols-2 bg-slate-100 rounded-lg p-0.5 mb-5">
          {[['login', 'Entrar'], ['registro', 'Crear cuenta']].map(([id, label]) => (
            <button
              key={id}
              onClick={() => { setModo(id); setErr(''); setInfo('') }}
              className={`py-1.5 rounded-md text-sm font-medium ${modo === id ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}
            >
              {label}
            </button>
          ))}
        </div>
        {modo === 'registro' && (
          <p className="text-xs text-slate-500 mb-3">
            ¿Es tu primera vez? Crea tu cuenta con tu nombre y email y entrarás directamente como miembro.
          </p>
        )}
        <div className="space-y-3">
          {modo === 'registro' && (
            <div><Label>Nombre</Label><Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Mario" /></div>
          )}
          <div><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && enviar()} /></div>
          <div><Label>Contraseña</Label><Input type="password" value={pass} onChange={(e) => setPass(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && enviar()} /></div>
          {err && <p className="text-sm text-rose-600 flex items-start gap-1"><AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />{err}</p>}
          {info && <p className="text-sm text-emerald-700">{info}</p>}
          <Btn onClick={enviar} disabled={busy} className="w-full">
            <KeyRound className="w-4 h-4" />
            {busy ? 'Un momento…' : modo === 'login' ? 'Entrar' : 'Crear cuenta'}
          </Btn>
        </div>
      </div>
    </div>
  )
}

// ---------- Acciones rápidas: llamar / email / plantilla ----------
function AccionesContacto({ emp, yo }) {
  if (!emp.telefono && !emp.email) return null
  const tel = String(emp.telefono || '').replace(/\s/g, '')
  return (
    <div className="flex flex-wrap gap-2">
      {emp.telefono && (
        <a href={`tel:${tel}`}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50">
          <Phone className="w-3.5 h-3.5" />Llamar
        </a>
      )}
      {emp.email && (
        <>
          <a href={`mailto:${emp.email}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50">
            <Mail className="w-3.5 h-3.5" />Email
          </a>
          <a href={plantillaEmail(emp, yo)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-xs font-medium text-blue-700 hover:bg-blue-100">
            <Send className="w-3.5 h-3.5" />Plantilla de contacto
          </a>
        </>
      )}
    </div>
  )
}

// ---------- Modal de empresa ----------
function EmpresaModal({ empresa, users, isAdmin, me, todas = [], onSaved, onDeleted, onClose }) {
  const nueva = !empresa
  const [f, setF] = useState(
    empresa || { nombre: '', cif: '', sector: '', contacto: '', email: '', telefono: '', responsable: null, estado: 'sin_contactar', notas: '', proximo_contacto: null }
  )
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [hist, setHist] = useState(null) // null = cargando

  useEffect(() => {
    if (nueva) { setHist([]); return }
    supabase
      .from('historial')
      .select('*')
      .eq('empresa_id', empresa.id)
      .order('creado', { ascending: false })
      .limit(50)
      .then(({ data }) => setHist(data || []))
  }, [nueva, empresa?.id])

  // Un miembro puede rellenar todos los campos al CREAR una empresa,
  // pero al editar una existente solo toca estado, notas y próximo contacto.
  const camposEditables = isAdmin || nueva

  const guardar = async () => {
    if (camposEditables && !f.nombre.trim()) { setErr('La empresa necesita un nombre.'); return }
    setBusy(true); setErr('')
    try {
      if (nueva) {
        const { error } = await supabase.from('empresas').insert({
          nombre: f.nombre.trim(), cif: f.cif, sector: f.sector, contacto: f.contacto, email: f.email,
          telefono: f.telefono,
          responsable: isAdmin ? (f.responsable || null) : me.id,
          estado: f.estado,
          notas: f.notas, proximo_contacto: f.proximo_contacto || null, actualizado_por: me.nombre,
        })
        if (error) throw error
      } else {
        const patch = isAdmin
          ? { nombre: f.nombre.trim(), cif: f.cif, sector: f.sector, contacto: f.contacto, email: f.email, telefono: f.telefono, responsable: f.responsable || null, estado: f.estado, notas: f.notas, proximo_contacto: f.proximo_contacto || null, actualizado_por: me.nombre }
          : { estado: f.estado, notas: f.notas, proximo_contacto: f.proximo_contacto || null, actualizado_por: me.nombre }
        const { error } = await supabase.from('empresas').update(patch).eq('id', f.id)
        if (error) throw error
      }
      onSaved()
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  const cifDup = nueva && (f.cif || '').trim().length > 5
    ? todas.find((c) => (c.cif || '').replace(/[^A-Z0-9]/gi, '').toUpperCase() === f.cif.replace(/[^A-Z0-9]/gi, '').toUpperCase())
    : null

  const eliminar = async () => {
    if (!confirm('¿Eliminar esta empresa?')) return
    const { error } = await supabase.from('empresas').delete().eq('id', f.id)
    if (error) { setErr(error.message); return }
    onDeleted()
  }

  return (
    <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl">
          <h2 className="font-bold text-slate-900">{nueva ? 'Nueva empresa' : f.nombre}</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          {camposEditables ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Empresa</Label><Input value={f.nombre} onChange={(e) => set('nombre', e.target.value)} /></div>
                <div><Label>CIF</Label><Input value={f.cif || ''} onChange={(e) => set('cif', e.target.value.toUpperCase())} placeholder="B12345678" /></div>
              </div>
              {cifDup && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-start gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  Ese CIF ya existe en el CRM: <strong>{cifDup.nombre}</strong>. Puedes guardar igualmente, pero comprueba que no sea la misma empresa.
                </p>
              )}
              <div><Label>Sector</Label><Input value={f.sector} onChange={(e) => set('sector', e.target.value)} placeholder="Software, telecos…" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Persona de contacto</Label><Input value={f.contacto} onChange={(e) => set('contacto', e.target.value)} /></div>
                <div><Label>Teléfono</Label><Input value={f.telefono} onChange={(e) => set('telefono', e.target.value)} /></div>
              </div>
              <div><Label>Email</Label><Input value={f.email} onChange={(e) => set('email', e.target.value)} /></div>
              <AccionesContacto emp={f} yo={me.nombre} />
              {isAdmin ? (
                <div>
                  <Label>Responsable</Label>
                  <select
                    value={f.responsable || ''}
                    onChange={(e) => set('responsable', e.target.value || null)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    <option value="">Sin asignar</option>
                    {users.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                  </select>
                </div>
              ) : (
                <p className="text-xs text-slate-500">
                  Se te asignará a ti como responsable. Después solo podrás cambiar estado, notas y próximo contacto: si hay que corregir algún dato, pídeselo a un admin.
                </p>
              )}
            </>
          ) : (
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 text-sm text-slate-700 space-y-1.5">
              {f.cif && <p><span className="text-slate-400">CIF:</span> {f.cif}</p>}
              {f.sector && <p><span className="text-slate-400">Sector:</span> {f.sector}</p>}
              {f.contacto && <p className="flex items-center gap-1.5"><User className="w-3.5 h-3.5 text-slate-400" />{f.contacto}</p>}
              {f.email && <p className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5 text-slate-400" /><a href={`mailto:${f.email}`} className="text-blue-700 hover:underline">{f.email}</a></p>}
              {f.telefono && <p className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 text-slate-400" /><a href={`tel:${String(f.telefono).replace(/\s/g, '')}`} className="text-blue-700 hover:underline">{f.telefono}</a></p>}
              <div className="pt-1"><AccionesContacto emp={f} yo={me.nombre} /></div>
            </div>
          )}
          <div>
            <Label>Estado</Label>
            <div className="flex flex-wrap gap-2">
              {ESTADOS.map((e) => (
                <button
                  key={e.id}
                  onClick={() => set('estado', e.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                    f.estado === e.id ? `${e.color} ring-2 ring-offset-1 ring-blue-500` : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {e.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label>Próximo contacto</Label>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={f.proximo_contacto || ''}
                onChange={(e) => set('proximo_contacto', e.target.value || null)}
                className="px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              {[['+1 sem', 7], ['+2 sem', 14], ['+1 mes', 30]].map(([t, n]) => (
                <button key={t} onClick={() => set('proximo_contacto', sumarDias(n))}
                  className="px-2.5 py-1 rounded-lg border border-slate-300 text-xs text-slate-600 hover:bg-slate-50">{t}</button>
              ))}
              {f.proximo_contacto && (
                <button onClick={() => set('proximo_contacto', null)}
                  className="px-2.5 py-1 rounded-lg border border-slate-200 text-xs text-slate-400 hover:bg-slate-50">Quitar</button>
              )}
            </div>
          </div>
          <div>
            <Label>Notas / seguimiento</Label>
            <textarea
              value={f.notas || ''}
              onChange={(e) => set('notas', e.target.value)}
              rows={4}
              placeholder="Llamada del 3/7: interesados, enviar propuesta…"
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 resize-none"
            />
          </div>
          {!nueva && (
            <div className="pt-2 border-t border-slate-100">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                <History className="w-3.5 h-3.5" />Historial
              </p>
              {hist === null ? (
                <p className="text-xs text-slate-400">Cargando…</p>
              ) : hist.length === 0 ? (
                <p className="text-xs text-slate-400">Sin movimientos registrados todavía.</p>
              ) : (
                <ol className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {hist.map((h) => (
                    <li key={h.id} className="flex gap-2 text-xs">
                      <span className={`shrink-0 px-1.5 py-0.5 rounded border font-medium ${accionDe(h.accion).color}`}>
                        {accionDe(h.accion).label}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="text-slate-700 break-words">{detalleLegible(h)}</span>
                        <span className="block text-slate-400">{h.usuario_nombre} · {fecha(h.creado)}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
          {f.actualizado && !nueva && (
            <p className="text-xs text-slate-400">Última actualización: {fecha(f.actualizado)}{f.actualizado_por ? ` · ${f.actualizado_por}` : ''}</p>
          )}
          {err && <p className="text-sm text-rose-600">{err}</p>}
          <div className="flex items-center justify-between pt-2">
            {isAdmin && !nueva ? (
              <Btn variant="danger" onClick={eliminar}><Trash2 className="w-4 h-4" />Eliminar</Btn>
            ) : <span />}
            <Btn onClick={guardar} disabled={busy}><Save className="w-4 h-4" />{busy ? 'Guardando…' : 'Guardar'}</Btn>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------- Gráfica: nº de empresas por persona ----------
function GraficaEmpresas({ users, companies }) {
  const datos = users
    .map((u) => ({ id: u.id, nombre: u.nombre, n: companies.filter((c) => c.responsable === u.id).length }))
    .concat([{ id: 'na', nombre: 'Sin asignar', n: companies.filter((c) => !c.responsable).length }])
    .filter((d) => d.n > 0 || d.id !== 'na')
    .sort((a, b) => b.n - a.n)

  const max = Math.max(1, ...datos.map((d) => d.n))
  const hoy = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })

  const descargar = (blob, nombre) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = nombre
    a.click()
    URL.revokeObjectURL(url)
  }

  const exportarCSV = () => {
    const filas = [['Persona', 'Empresas'], ...datos.map((d) => [d.nombre, d.n])]
    const csv = filas.map((f) => f.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n')
    descargar(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }), 'empresas-por-persona.csv')
  }

  const exportarPNG = () => {
    const E = 2 // escala para que se vea nítido
    const F = 34, TOP = 96, PAD = 28, ANCHO = 900
    const alto = TOP + datos.length * F + 46
    const cv = document.createElement('canvas')
    cv.width = ANCHO * E
    cv.height = alto * E
    const g = cv.getContext('2d')
    g.scale(E, E)

    g.fillStyle = '#ffffff'
    g.fillRect(0, 0, ANCHO, alto)

    g.fillStyle = '#0f172a'
    g.font = 'bold 20px system-ui, sans-serif'
    g.fillText('Empresas por persona', PAD, 42)
    g.fillStyle = '#64748b'
    g.font = '13px system-ui, sans-serif'
    g.fillText(`CRM IAESTE · ${companies.length} empresas · ${hoy}`, PAD, 66)

    const xNom = PAD, anchoNom = 190
    const xBar = xNom + anchoNom + 12
    const anchoBar = ANCHO - xBar - PAD - 50

    datos.forEach((d, i) => {
      const y = TOP + i * F
      g.fillStyle = d.id === 'na' ? '#94a3b8' : '#334155'
      g.font = (d.id === 'na' ? 'italic ' : '') + '14px system-ui, sans-serif'
      let nom = d.nombre
      while (g.measureText(nom).width > anchoNom && nom.length > 3) nom = nom.slice(0, -1)
      if (nom !== d.nombre) nom = nom.slice(0, -1) + '…'
      g.fillText(nom, xNom, y + 16)

      g.fillStyle = '#f1f5f9'
      g.fillRect(xBar, y + 2, anchoBar, 20)
      g.fillStyle = d.id === 'na' ? '#cbd5e1' : '#2563eb'
      g.fillRect(xBar, y + 2, Math.max(2, (d.n / max) * anchoBar), 20)

      g.fillStyle = '#0f172a'
      g.font = 'bold 14px system-ui, sans-serif'
      g.textAlign = 'right'
      g.fillText(String(d.n), ANCHO - PAD, y + 17)
      g.textAlign = 'left'
    })

    cv.toBlob((b) => descargar(b, 'empresas-por-persona.png'), 'image/png')
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6">
      <div className="flex items-baseline justify-between mb-5 gap-3 flex-wrap">
        <h3 className="font-bold text-slate-900">Empresas por persona</h3>
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-500 mr-1">{companies.length} en total</span>
          <button onClick={exportarPNG} className="px-2.5 py-1 rounded-lg border border-slate-300 text-xs font-medium text-slate-600 hover:bg-slate-50 inline-flex items-center gap-1">
            <Download className="w-3.5 h-3.5" />PNG
          </button>
          <button onClick={exportarCSV} className="px-2.5 py-1 rounded-lg border border-slate-300 text-xs font-medium text-slate-600 hover:bg-slate-50 inline-flex items-center gap-1">
            <Download className="w-3.5 h-3.5" />CSV
          </button>
        </div>
      </div>
      <div className="space-y-3">
        {datos.map((d) => (
          <div key={d.id} className="flex items-center gap-3">
            <span className={`w-32 shrink-0 text-sm truncate ${d.id === 'na' ? 'text-slate-400 italic' : 'text-slate-700'}`}>
              {d.nombre}
            </span>
            <div className="flex-1 h-6 bg-slate-100 rounded-md overflow-hidden">
              <div
                className={`h-full rounded-md ${d.id === 'na' ? 'bg-slate-300' : 'bg-blue-600'}`}
                style={{ width: `${(d.n / max) * 100}%` }}
              />
            </div>
            <span className="w-10 shrink-0 text-sm font-semibold text-slate-900 text-right tabular-nums">{d.n}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------- Actividad y puntos del equipo (a partir del historial) ----------
function Actividad({ users, companies }) {
  const [desde, setDesde] = useState(INICIO_CURSO())
  const [hasta, setHasta] = useState(HOY())
  const [todo, setTodo] = useState(null) // historial completo hasta «hasta» (hace falta el anterior para las quincenas)
  const [err, setErr] = useState('')
  const [info, setInfo] = useState('')
  const [abierto, setAbierto] = useState('')
  const [recarga, setRecarga] = useState(0)
  const [limpiando, setLimpiando] = useState(false)

  useEffect(() => {
    setTodo(null); setErr('')
    traerTodo(() => supabase
      .from('historial')
      .select('id, empresa_id, usuario_id, usuario_nombre, empresa_nombre, accion, detalle, estado_anterior, estado_nuevo, creado')
      .lte('creado', hasta + 'T23:59:59')
      .order('creado', { ascending: false })
      .order('id', { ascending: false }))
      .then(setTodo)
      .catch((e) => { setErr(e.message); setTodo([]) })
  }, [hasta, recarga])

  // Movimientos del historial cuya empresa ya no existe (se borró desde el CRM).
  // Ya no suman puntos (se filtran en «filas»), pero siguen guardados hasta que se limpian con el botón.
  const idsVivos = new Set(companies.map((c) => c.id))
  const huerfanasVistas = companies.length ? (todo || []).filter((h) => !idsVivos.has(h.empresa_id)) : []
  const nEmpresasBorradas = new Set(huerfanasVistas.map((h) => h.empresa_id ?? h.empresa_nombre)).size

  const limpiarBorradas = async () => {
    setErr(''); setInfo(''); setLimpiando(true)
    try {
      // Se vuelve a pedir todo a la base de datos (no lo que hay en pantalla) para no borrar
      // por error el historial de una empresa que alguien acaba de crear en otra pestaña.
      const emps = await traerTodo(() => supabase.from('empresas').select('id').order('id'))
      if (emps.length === 0) throw new Error('No se han podido cargar las empresas. No se ha borrado nada.')
      const vivas = new Set(emps.map((e) => e.id))
      const hist = await traerTodo(() => supabase.from('historial').select('id, empresa_id, empresa_nombre').order('id'))
      const huerfanas = hist.filter((h) => !vivas.has(h.empresa_id))
      if (huerfanas.length === 0) { setInfo('No hay movimientos de empresas borradas. Las cuentas ya están limpias.'); return }

      const nombres = [...new Set(huerfanas.map((h) => h.empresa_nombre || '(sin nombre)'))]
      const ok = confirm(
        `Se van a quitar ${huerfanas.length} movimientos del historial de ${nombres.length} empresa${nombres.length !== 1 ? 's' : ''} que ya no existe${nombres.length !== 1 ? 'n' : ''}:\n\n` +
        nombres.slice(0, 15).join('\n') + (nombres.length > 15 ? `\n… y ${nombres.length - 15} más` : '') +
        '\n\nLos puntos y las cuentas se recalcularán sin ellos. No se puede deshacer. ¿Seguir?'
      )
      if (!ok) return

      const ids = huerfanas.map((h) => h.id)
      let borradas = 0
      for (let i = 0; i < ids.length; i += 100) {
        const { data, error } = await supabase.from('historial').delete().in('id', ids.slice(i, i + 100)).select('id')
        if (error) throw error
        borradas += (data || []).length
      }
      if (borradas < ids.length) {
        throw new Error(`Solo se han podido quitar ${borradas} de ${ids.length} movimientos: falta el permiso de borrado del historial en Supabase (ejecuta el SQL de la política para admins).`)
      }
      setInfo(`Hecho: quitados ${borradas} movimientos de ${nombres.length} empresa${nombres.length !== 1 ? 's' : ''} borrada${nombres.length !== 1 ? 's' : ''}.`)
    } catch (e) {
      setErr(e.message)
    } finally {
      setLimpiando(false)
      setRecarga((r) => r + 1)
    }
  }

  const iniRango = new Date(desde + 'T00:00:00')
  // Lo de empresas ya eliminadas no cuenta: al borrar una empresa chorra, sus puntos desaparecen del periodo.
  const filas = (todo || []).filter((h) => new Date(h.creado) >= iniRango && (!companies.length || idsVivos.has(h.empresa_id)))

  // Quincenas cerradas cuyo último día cae dentro del rango, como filas más del desglose
  const nombreDeUsuario = (id) => users.find((u) => u.id === id)?.nombre || '—'
  const quincenas = []
  for (const [uid, qs] of Object.entries(evaluarQuincenas(todo || [], companies, hasta))) {
    for (const q of qs) {
      const ultimo = diaMas(q.fin, -1)
      if (q.enCurso || ultimo < desde || ultimo > hasta) continue
      quincenas.push({
        id: `q-${uid}-${q.ini}`, usuario_id: uid, usuario_nombre: nombreDeUsuario(uid), accion: 'quincena',
        empresa_nombre: `Quincena ${fechaCorta(q.ini)} – ${fechaCorta(ultimo)}`,
        detalle: q.cumple
          ? `${q.hechas}/${q.total} empresas seguidas`
          : `${q.hechas}/${q.total} · faltó: ${q.faltan.map((c) => c.nombre).join(', ')}`,
        cumple: q.cumple, creado: q.fin + 'T00:00:00',
      })
    }
  }
  const movimientos = [...filas, ...quincenas].sort((a, b) => new Date(b.creado) - new Date(a.creado))

  const resumen = movimientos.reduce((acc, h) => {
    const k = h.usuario_id || h.usuario_nombre
    acc[k] = acc[k] || { id: k, nombre: h.usuario_nombre, alta: 0, estado: 0, nota: 0, becas: 0, quincenas: 0, puntos: 0, filas: [] }
    const r = acc[k]
    if (r[h.accion] !== undefined) r[h.accion]++
    if (h.accion === 'estado' && h.estado_nuevo === 'beca') r.becas++
    if (h.accion === 'quincena' && h.cumple) r.quincenas++
    r.puntos += puntosDe(h)
    r.filas.push(h)
    return acc
  }, {})

  // Gente sin ni una acción en el periodo: también interesa verla, con un 0
  users.forEach((u) => {
    if (!resumen[u.id]) resumen[u.id] = { id: u.id, nombre: u.nombre, alta: 0, estado: 0, nota: 0, becas: 0, quincenas: 0, puntos: 0, filas: [] }
  })
  const lista = Object.values(resumen).sort((a, b) => b.puntos - a.puntos || a.nombre.localeCompare(b.nombre))

  const exportar = () => {
    const cab = ['Persona', 'Altas', 'Cambios de estado', 'Notas', 'Becas', 'Quincenas cumplidas', 'Puntos']
    const csv = [cab, ...lista.map((d) => [d.nombre, d.alta, d.estado, d.nota, d.becas, d.quincenas, d.puntos])]
      .map((f) => f.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';'))
      .join('\n')
    const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `puntos-${desde}_${hasta}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const atajo = (label, d) => (
    <button
      key={label}
      onClick={() => { setDesde(d); setHasta(HOY()) }}
      className={`px-2.5 py-1 rounded-lg border text-xs ${desde === d && hasta === HOY() ? 'border-blue-600 bg-blue-50 text-blue-700 font-medium' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}
    >
      {label}
    </button>
  )

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6">
      <div className="flex items-baseline justify-between mb-4 gap-3 flex-wrap">
        <h3 className="font-bold text-slate-900 flex items-center gap-1.5">
          <Trophy className="w-4 h-4 text-slate-400" />Puntos del equipo
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={limpiarBorradas}
            disabled={limpiando}
            title="Quita del historial (y de los puntos) todo lo relacionado con empresas que se han eliminado del CRM"
            className={`px-2.5 py-1 rounded-lg border text-xs font-medium inline-flex items-center gap-1 disabled:opacity-50 ${
              nEmpresasBorradas
                ? 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100'
                : 'border-slate-300 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Trash2 className="w-3.5 h-3.5" />
            {limpiando ? 'Limpiando…' : `Quitar empresas borradas${nEmpresasBorradas ? ` · ${nEmpresasBorradas}` : ''}`}
          </button>
          <button onClick={exportar} className="px-2.5 py-1 rounded-lg border border-slate-300 text-xs font-medium text-slate-600 hover:bg-slate-50 inline-flex items-center gap-1">
            <Download className="w-3.5 h-3.5" />CSV
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-5">
        <input type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)}
          className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-sm bg-white" />
        <span className="text-slate-400 text-sm">a</span>
        <input type="date" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)}
          className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-sm bg-white" />
        <span className="w-px h-5 bg-slate-200 mx-1" />
        {atajo('Curso', INICIO_CURSO())}
        {atajo('30 días', sumarDias(-30))}
        {atajo('7 días', sumarDias(-7))}
      </div>

      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}
      {info && <p className="text-sm text-emerald-700 mb-3">{info}</p>}
      {nEmpresasBorradas > 0 && !limpiando && (
        <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 mb-3 flex items-start gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-slate-400" />
          No se cuentan {huerfanasVistas.length} movimientos de {nEmpresasBorradas} empresa{nEmpresasBorradas !== 1 ? 's' : ''} eliminada{nEmpresasBorradas !== 1 ? 's' : ''}.
          Siguen guardados en el historial; pulsa «Quitar empresas borradas» para borrarlos del todo.
        </p>
      )}
      {todo === null ? (
        <p className="text-sm text-slate-400">Cargando…</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-400 uppercase tracking-wide text-right">
                <th className="text-left font-medium pb-2">Persona</th>
                <th className="font-medium pb-2">Altas</th>
                <th className="font-medium pb-2">Estados</th>
                <th className="font-medium pb-2">Notas</th>
                <th className="font-medium pb-2">Becas</th>
                <th className="font-medium pb-2" title="Quincenas de seguimiento cumplidas">Quinc.</th>
                <th className="font-medium pb-2 pl-3">Puntos</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((d) => (
                <Fragment key={d.id}>
                  <tr
                    onClick={() => setAbierto(abierto === d.id ? '' : d.id)}
                    className="border-t border-slate-100 text-right tabular-nums cursor-pointer hover:bg-slate-50"
                  >
                    <td className="text-left py-2 text-slate-700 flex items-center gap-1">
                      <ChevronRight className={`w-3.5 h-3.5 text-slate-300 transition-transform ${abierto === d.id ? 'rotate-90' : ''}`} />
                      {d.nombre}
                    </td>
                    <td className="text-slate-500">{d.alta}</td>
                    <td className="text-slate-500">{d.estado}</td>
                    <td className="text-slate-500">{d.nota}</td>
                    <td className={d.becas ? 'text-emerald-700 font-semibold' : 'text-slate-300'}>{d.becas}</td>
                    <td className={d.quincenas ? 'text-indigo-700 font-semibold' : 'text-slate-300'}>{d.quincenas}</td>
                    <td className="font-bold text-slate-900 pl-3">{d.puntos}</td>
                  </tr>
                  {abierto === d.id && (
                    <tr>
                      <td colSpan={7} className="bg-slate-50 px-3 py-3">
                        {d.filas.length === 0 ? (
                          <p className="text-xs text-slate-400">Sin movimientos en este periodo.</p>
                        ) : (
                          <ol className="space-y-1.5 max-h-72 overflow-y-auto">
                            {d.filas.map((h) => (
                              <li key={h.id} className="flex items-baseline gap-2 text-xs">
                                <span className={`shrink-0 px-1.5 py-0.5 rounded border font-medium ${accionDe(h.accion).color}`}>
                                  {accionDe(h.accion).label}
                                </span>
                                <span className="flex-1 min-w-0 text-slate-600 truncate">
                                  <strong className="text-slate-800">{h.empresa_nombre}</strong> · {detalleLegible(h)}
                                </span>
                                <span className="shrink-0 text-slate-400">{fecha(h.creado)}</span>
                                <span className={`shrink-0 w-8 text-right tabular-nums ${puntosDe(h) ? 'text-slate-700 font-semibold' : 'text-slate-300'}`}>
                                  +{puntosDe(h)}
                                </span>
                              </li>
                            ))}
                          </ol>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-slate-400 mt-4 leading-relaxed">
        Baremo actual: alta de empresa {PUNTOS.alta} · nota de seguimiento {PUNTOS.nota} ·
        cambio de estado {PUNTOS.estado._} (muy interesados {PUNTOS.estado.interesados}, beca conseguida {PUNTOS.estado.beca}) ·
        quincena de seguimiento cumplida {PUNTOS.quincena} (cada {QUINCENA.dias} días desde el {fechaCorta(QUINCENA.inicio)}:
        haber escrito una nota o cambiado el estado de todas tus empresas en seguimiento; se suma al cerrar la quincena).
        Se cambia en la constante <code>PUNTOS</code> al principio de App.jsx. Haz clic en una persona para ver el desglose.
      </p>
    </div>
  )
}
// ---------- Equipo (solo admin) ----------
function Equipo({ users, companies, me, onChanged }) {
  const [err, setErr] = useState('')
  const [asignando, setAsignando] = useState('')
  const cuenta = (id) => companies.filter((c) => c.responsable === id).length
  const sinContactar = (id) => companies.filter((c) => c.responsable === id && c.estado === 'sin_contactar').length
  const libres = companies.filter((c) => !c.responsable && c.estado === 'sin_contactar')

  const asignarLote = async (u) => {
    setErr(''); setAsignando(u.id)
    const ids = libres.slice(0, LOTE).map((c) => c.id)
    if (ids.length === 0) {
      setErr('No quedan empresas sin asignar en estado «Sin contactar».')
      setAsignando('')
      return
    }
    const { error } = await supabase
      .from('empresas')
      .update({ responsable: u.id, actualizado_por: me.nombre })
      .in('id', ids)
    setAsignando('')
    if (error) setErr(error.message)
    else onChanged()
  }

  const cambiarRol = async (u, rol) => {
    setErr('')
    const { error } = await supabase.from('profiles').update({ rol }).eq('id', u.id)
    if (error) setErr(error.message)
    else onChanged()
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 text-sm text-blue-900">
        Para incorporar a alguien: pídele que se <strong>registre</strong> en esta misma página. Aparecerá aquí
        como miembro y podrás asignarle empresas o hacerle admin. Para eliminar cuentas o restablecer
        contraseñas, usa el panel de Supabase (Authentication → Users).
      </div>
      {err && <p className="text-sm text-rose-600">{err}</p>}

      <GraficaEmpresas users={users} companies={companies} />

      <Actividad users={users} companies={companies} />

      <p className="text-xs text-slate-500 px-1">
        Bote común: <strong>{libres.length}</strong> empresas sin asignar en estado «Sin contactar».
        El botón <strong>+{LOTE}</strong> reparte las {LOTE} primeras a esa persona.
      </p>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {users.map((u) => (
          <div key={u.id} className="flex items-center justify-between px-6 py-4 border-b border-slate-100 last:border-0">
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold ${u.rol === 'admin' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                {u.nombre[0]?.toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-medium text-slate-900 flex items-center gap-1.5">
                  {u.nombre}
                  {u.rol === 'admin' && <Shield className="w-3.5 h-3.5 text-blue-600" />}
                  {u.id === me.id && <span className="text-xs text-slate-400">(tú)</span>}
                </p>
                <p className="text-xs text-slate-500">
                  {cuenta(u.id)} asignada{cuenta(u.id) !== 1 ? 's' : ''} ·{' '}
                  <span className={sinContactar(u.id) === 0 ? 'text-amber-700 font-semibold' : ''}>
                    {sinContactar(u.id)} sin contactar
                  </span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => asignarLote(u)}
                disabled={asignando === u.id || libres.length === 0}
                title={`Asignarle ${LOTE} empresas sin contactar del bote común`}
                className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1 disabled:opacity-40 ${
                  sinContactar(u.id) === 0
                    ? 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100'
                    : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <UserPlus className="w-3.5 h-3.5" />+{LOTE}
              </button>
            <select
              value={u.rol}
              onChange={(e) => cambiarRol(u, e.target.value)}
              disabled={u.id === me.id}
              className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm bg-white disabled:opacity-50"
            >
              <option value="miembro">Miembro</option>
              <option value="admin">Admin</option>
            </select>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------- Aviso de la quincena en curso (para cada persona) ----------
function MiQuincena({ me, companies, onAbrir }) {
  const mias = companies.filter((c) => c.responsable === me.id)
  const clave = mias.map((c) => `${c.id}:${c.estado}:${c.actualizado || ''}`).join('|')
  const [q, setQ] = useState(null)

  useEffect(() => {
    let vivo = true
    const hoy = HOY()
    const ids = mias.map((c) => c.id)
    if (ids.length === 0) { setQ(null); return }
    const trozos = []
    for (let i = 0; i < ids.length; i += 100) trozos.push(ids.slice(i, i + 100))
    Promise.all(trozos.map((t) => traerTodo(() => supabase
      .from('historial')
      .select('id, empresa_id, usuario_id, accion, estado_nuevo, creado')
      .in('empresa_id', t)
      .order('creado', { ascending: true })
      .order('id', { ascending: true }))))
      .then((partes) => {
        if (!vivo) return
        const qs = evaluarQuincenas(partes.flat(), mias, hoy)[me.id] || []
        setQ(qs.find((x) => x.enCurso) || null)
      })
      .catch(() => vivo && setQ(null))
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.id, clave])

  if (!q || q.total === 0) return null
  const ultimo = diaMas(q.fin, -1)
  const dia = new Date(ultimo + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' })
  return q.cumple ? (
    <div className="flex items-start gap-2.5 mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
      <Trophy className="w-4 h-4 mt-0.5 shrink-0" />
      <p>
        <strong>Seguimiento de la quincena hecho</strong> ({q.hechas}/{q.total} empresas).
        Los +{PUNTOS.quincena} puntos se suman al cerrar la quincena, el {dia}.
      </p>
    </div>
  ) : (
    <div className="flex items-start gap-2.5 mb-4 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
      <CalendarClock className="w-4 h-4 mt-0.5 shrink-0" />
      <div>
        <p>
          <strong>Seguimiento quincenal: {q.hechas}/{q.total}.</strong>{' '}
          Vuelve a llamar (y apúntalo con una nota o un cambio de estado) a estas empresas antes del final del {dia} y te llevas +{PUNTOS.quincena}:
        </p>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {q.faltan.map((c) => (
            <button key={c.id} onClick={() => onAbrir(companies.find((x) => x.id === c.id) || c)}
              className="px-2.5 py-1 rounded-full border border-indigo-200 bg-white text-xs font-medium text-indigo-700 hover:bg-indigo-100">
              {c.nombre}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ---------- Exportar empresas a CSV (se abre en Excel) ----------
function exportarEmpresas(lista, nombreDe) {
  const cab = ['Empresa', 'CIF', 'Sector', 'Contacto', 'Telefono', 'Email', 'Estado', 'Responsable', 'Proximo contacto', 'Notas']
  const filas = lista.map((c) => [
    c.nombre, c.cif || '', c.sector || '', c.contacto || '', c.telefono || '', c.email || '',
    estadoDe(c.estado).label, nombreDe(c.responsable), c.proximo_contacto || '',
    (c.notas || '').replace(/\n/g, ' | '),
  ])
  const csv = [cab, ...filas]
    .map((f) => f.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';'))
    .join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `empresas-iaeste-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ---------- App ----------
export default function App() {
  const [session, setSession] = useState(undefined) // undefined = cargando
  const [me, setMe] = useState(null)
  const [users, setUsers] = useState([])
  const [companies, setCompanies] = useState([])
  const [tab, setTab] = useState('empresas')
  const [busca, setBusca] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')
  const [filtroPersona, setFiltroPersona] = useState('')
  const [agenda, setAgenda] = useState('') // '' | 'hoy' | 'atrasadas'
  const [modal, setModal] = useState(null) // null | 'nueva' | empresa
  const [aviso, setAviso] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  const cargar = useCallback(async () => {
    if (!session) return
    const [{ data: perfiles }, { data: emps }] = await Promise.all([
      supabase.from('profiles').select('*').order('nombre'),
      supabase.from('empresas').select('*').order('nombre'),
    ])
    setUsers(perfiles || [])
    setCompanies(emps || [])
    setMe((perfiles || []).find((p) => p.id === session.user.id) || null)
  }, [session])

  useEffect(() => { cargar() }, [cargar])

  const flash = (m) => { setAviso(m); setTimeout(() => setAviso(''), 2500) }

  if (session === undefined) {
    return <div className="min-h-screen bg-slate-100 flex items-center justify-center text-slate-400 text-sm">Cargando…</div>
  }
  if (!session) return <Auth />
  if (!me) {
    return <div className="min-h-screen bg-slate-100 flex items-center justify-center text-slate-400 text-sm">Preparando tu perfil…</div>
  }

  const isAdmin = me.rol === 'admin'
  const nombreDe = (id) => users.find((u) => u.id === id)?.nombre || 'Sin asignar'

  const hoy = HOY()
  const misSinContactar = companies.filter((c) => c.responsable === me.id && c.estado === 'sin_contactar').length
  const nAtrasadas = companies.filter((c) => c.proximo_contacto && c.proximo_contacto < hoy).length
  const nHoy = companies.filter((c) => c.proximo_contacto === hoy).length

  const visibles = companies
    .filter((c) => {
      if (agenda === 'hoy') return c.proximo_contacto && c.proximo_contacto <= hoy
      if (agenda === 'atrasadas') return c.proximo_contacto && c.proximo_contacto < hoy
      return true
    })
    .filter((c) => !filtroEstado || c.estado === filtroEstado)
    .filter((c) => !filtroPersona || c.responsable === filtroPersona)
    .filter((c) => {
      const q = busca.toLowerCase()
      return !q || c.nombre.toLowerCase().includes(q) || (c.contacto || '').toLowerCase().includes(q) || (c.sector || '').toLowerCase().includes(q) || (c.cif || '').toLowerCase().includes(q)
    })

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-700 flex items-center justify-center">
              <Building2 className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-slate-900">CRM IAESTE</span>
          </div>
          <div className="flex items-center gap-3">
            {isAdmin && (
              <nav className="flex bg-slate-100 rounded-lg p-0.5">
                {[['empresas', 'Empresas'], ['equipo', 'Equipo']].map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => setTab(id)}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium ${tab === id ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}
                  >
                    {label}
                  </button>
                ))}
              </nav>
            )}
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <span className="hidden sm:flex items-center gap-1.5">
                {isAdmin && <Shield className="w-3.5 h-3.5 text-blue-600" />}
                {me.nombre}
              </span>
              <button
                onClick={() => supabase.auth.signOut()}
                title="Salir"
                className="p-2 rounded-lg hover:bg-slate-100 text-slate-400"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {tab === 'equipo' && isAdmin ? (
          <Equipo users={users} companies={companies} me={me} onChanged={cargar} />
        ) : (
          <>
            {misSinContactar === 0 ? (
              <div className="flex items-start gap-2.5 mb-4 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <Inbox className="w-4 h-4 mt-0.5 shrink-0" />
                <p>
                  <strong>No te queda ninguna empresa sin contactar.</strong>{' '}
                  {isAdmin
                    ? `Asígnate ${LOTE} más desde la pestaña Equipo.`
                    : `Pídele a un admin que te asigne ${LOTE} más.`}
                </p>
              </div>
            ) : misSinContactar <= AVISO_POCAS && (
              <div className="flex items-start gap-2.5 mb-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
                <Inbox className="w-4 h-4 mt-0.5 shrink-0 text-slate-400" />
                <p>Te quedan <strong>{misSinContactar}</strong> empresas sin contactar. Ve pidiendo el siguiente lote.</p>
              </div>
            )}
            <MiQuincena me={me} companies={companies} onAbrir={setModal} />
            {(nHoy + nAtrasadas) > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                <button
                  onClick={() => setAgenda(agenda === 'hoy' ? '' : 'hoy')}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border inline-flex items-center gap-1.5 ${
                    agenda === 'hoy' ? 'bg-blue-700 text-white border-blue-700' : 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                  }`}
                >
                  <CalendarClock className="w-3.5 h-3.5" />Para hoy · {nHoy + nAtrasadas}
                </button>
                {nAtrasadas > 0 && (
                  <button
                    onClick={() => setAgenda(agenda === 'atrasadas' ? '' : 'atrasadas')}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
                      agenda === 'atrasadas' ? 'bg-rose-600 text-white border-rose-600' : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                    }`}
                  >
                    Atrasadas · {nAtrasadas}
                  </button>
                )}
                {agenda && (
                  <button onClick={() => setAgenda('')} className="px-3 py-1.5 rounded-full text-xs font-medium text-slate-500 hover:bg-slate-100">
                    Ver todas
                  </button>
                )}
              </div>
            )}

            <div className="flex flex-wrap gap-2 mb-5">
              <button
                onClick={() => setFiltroEstado('')}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border ${!filtroEstado ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200'}`}
              >
                Todas · {companies.length}
              </button>
              {ESTADOS.map((e) => {
                const n = companies.filter((c) => c.estado === e.id).length
                return (
                  <button
                    key={e.id}
                    onClick={() => setFiltroEstado(filtroEstado === e.id ? '' : e.id)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                      filtroEstado === e.id ? `${e.color} ring-2 ring-blue-500 ring-offset-1` : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${e.dot}`} />
                    {e.label} · {n}
                  </button>
                )
              })}
            </div>

            <div className="flex gap-2 mb-4">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar empresa, CIF, contacto o sector…" className="pl-9" />
              </div>
              {isAdmin && (
                <>
                  <select
                    value={filtroPersona}
                    onChange={(e) => setFiltroPersona(e.target.value)}
                    className="px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                  >
                    <option value="">Todo el equipo</option>
                    {users.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                  </select>
                  <button
                    onClick={() => exportarEmpresas(visibles, nombreDe)}
                    title="Exportar a Excel"
                    className="px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-600 hover:bg-slate-50 inline-flex items-center gap-1.5"
                  >
                    <FileSpreadsheet className="w-4 h-4" /><span className="hidden lg:inline">Exportar</span>
                  </button>
                </>
              )}
              <Btn onClick={() => setModal('nueva')}><Plus className="w-4 h-4" /><span className="hidden sm:inline">Empresa</span></Btn>
            </div>

            {visibles.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400 text-sm">
                {companies.length === 0
                  ? isAdmin
                    ? 'Todavía no hay empresas. Añade la primera con el botón «Empresa».'
                    : 'No tienes empresas asignadas todavía. Puedes añadir una con el botón «Empresa».'
                  : 'Ninguna empresa coincide con el filtro.'}
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden divide-y divide-slate-100">
                {visibles.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setModal(c)}
                    className="w-full flex items-center gap-4 px-5 py-4 hover:bg-slate-50 text-left transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-900 truncate">{c.nombre}</p>
                      <p className="text-xs text-slate-500 truncate">
                        {[c.cif, c.sector, c.contacto].filter(Boolean).join(' · ') || '—'}
                      </p>
                    </div>
                    {isAdmin && (
                      <span className="hidden md:flex items-center gap-1.5 text-xs text-slate-500 shrink-0">
                        <User className="w-3.5 h-3.5" />{nombreDe(c.responsable)}
                      </span>
                    )}
                    {c.proximo_contacto && (
                      <span className={`hidden sm:inline-flex items-center gap-1 text-xs font-medium shrink-0 px-2 py-0.5 rounded-full border ${
                        c.proximo_contacto < hoy
                          ? 'bg-rose-50 text-rose-700 border-rose-200'
                          : c.proximo_contacto === hoy
                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : 'bg-slate-50 text-slate-500 border-slate-200'
                      }`}>
                        <CalendarClock className="w-3 h-3" />{fechaCorta(c.proximo_contacto)}
                      </span>
                    )}
                    <Badge estadoId={c.estado} />
                    <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {modal && (
        <EmpresaModal
          empresa={modal === 'nueva' ? null : modal}
          users={users}
          isAdmin={isAdmin}
          me={me}
          todas={companies}
          onSaved={() => { setModal(null); cargar(); flash('Guardado ✓') }}
          onDeleted={() => { setModal(null); cargar(); flash('Empresa eliminada') }}
          onClose={() => setModal(null)}
        />
      )}

      {aviso && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-sm px-4 py-2 rounded-full shadow-lg z-50">
          {aviso}
        </div>
      )}
    </div>
  )
}
