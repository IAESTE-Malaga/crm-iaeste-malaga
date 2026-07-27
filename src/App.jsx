import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'
import {
  Building2, Plus, Search, LogOut, Pencil, Trash2, X, ChevronRight,
  Shield, User, Save, Mail, Phone, AlertCircle, KeyRound, Download,
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
const fecha = (iso) =>
  iso ? new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''

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
  const [modo, setModo] = useState('login') // login | registro
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
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password: pass,
          options: { data: { nombre: nombre.trim() } },
        })
        if (error) throw error
        setInfo('Cuenta creada. Si tu proyecto exige confirmación por email, revisa tu bandeja de entrada.')
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
          <button
            onClick={() => { setModo(modo === 'login' ? 'registro' : 'login'); setErr(''); setInfo('') }}
            className="w-full text-center text-sm text-blue-700 hover:underline pt-1"
          >
            {modo === 'login' ? '¿No tienes cuenta? Regístrate' : '¿Ya tienes cuenta? Entra'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------- Modal de empresa ----------
function EmpresaModal({ empresa, users, isAdmin, me, onSaved, onDeleted, onClose }) {
  const nueva = !empresa
  const [f, setF] = useState(
    empresa || { nombre: '', cif: '', sector: '', contacto: '', email: '', telefono: '', responsable: null, estado: 'sin_contactar', notas: '' }
  )
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const guardar = async () => {
    if (isAdmin && !f.nombre.trim()) { setErr('La empresa necesita un nombre.'); return }
    setBusy(true); setErr('')
    try {
      if (nueva) {
        const { error } = await supabase.from('empresas').insert({
          nombre: f.nombre.trim(), cif: f.cif, sector: f.sector, contacto: f.contacto, email: f.email,
          telefono: f.telefono, responsable: f.responsable || null, estado: f.estado,
          notas: f.notas, actualizado_por: me.nombre,
        })
        if (error) throw error
      } else {
        const patch = isAdmin
          ? { nombre: f.nombre.trim(), cif: f.cif, sector: f.sector, contacto: f.contacto, email: f.email, telefono: f.telefono, responsable: f.responsable || null, estado: f.estado, notas: f.notas, actualizado_por: me.nombre }
          : { estado: f.estado, notas: f.notas, actualizado_por: me.nombre }
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
          {isAdmin ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Empresa</Label><Input value={f.nombre} onChange={(e) => set('nombre', e.target.value)} /></div>
                <div><Label>CIF</Label><Input value={f.cif || ''} onChange={(e) => set('cif', e.target.value.toUpperCase())} placeholder="B12345678" /></div>
              </div>
              <div><Label>Sector</Label><Input value={f.sector} onChange={(e) => set('sector', e.target.value)} placeholder="Software, telecos…" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Persona de contacto</Label><Input value={f.contacto} onChange={(e) => set('contacto', e.target.value)} /></div>
                <div><Label>Teléfono</Label><Input value={f.telefono} onChange={(e) => set('telefono', e.target.value)} /></div>
              </div>
              <div><Label>Email</Label><Input value={f.email} onChange={(e) => set('email', e.target.value)} /></div>
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
            </>
          ) : (
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 text-sm text-slate-700 space-y-1.5">
              {f.cif && <p><span className="text-slate-400">CIF:</span> {f.cif}</p>}
              {f.sector && <p><span className="text-slate-400">Sector:</span> {f.sector}</p>}
              {f.contacto && <p className="flex items-center gap-1.5"><User className="w-3.5 h-3.5 text-slate-400" />{f.contacto}</p>}
              {f.email && <p className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5 text-slate-400" />{f.email}</p>}
              {f.telefono && <p className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 text-slate-400" />{f.telefono}</p>}
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
            <Label>Notas / seguimiento</Label>
            <textarea
              value={f.notas || ''}
              onChange={(e) => set('notas', e.target.value)}
              rows={4}
              placeholder="Llamada del 3/7: interesados, enviar propuesta…"
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 resize-none"
            />
          </div>
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

// ---------- Equipo (solo admin) ----------
function Equipo({ users, companies, me, onChanged }) {
  const [err, setErr] = useState('')
  const cuenta = (id) => companies.filter((c) => c.responsable === id).length

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
                <p className="text-xs text-slate-500">{cuenta(u.id)} empresa{cuenta(u.id) !== 1 ? 's' : ''} asignada{cuenta(u.id) !== 1 ? 's' : ''}</p>
              </div>
            </div>
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
        ))}
      </div>
    </div>
  )
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

  const visibles = companies
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
                  <Btn onClick={() => setModal('nueva')}><Plus className="w-4 h-4" /><span className="hidden sm:inline">Empresa</span></Btn>
                </>
              )}
            </div>

            {visibles.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400 text-sm">
                {companies.length === 0
                  ? isAdmin
                    ? 'Todavía no hay empresas. Añade la primera con el botón «Empresa».'
                    : 'No tienes empresas asignadas todavía.'
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
