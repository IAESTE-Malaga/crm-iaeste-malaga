import { useState, useEffect, useCallback, useRef, useMemo, Fragment } from 'react'
import { supabase } from './supabase'
import EmailThread from './EmailThread'
import Guia from './Guia'
import EditorCorreo from './EditorCorreo'
import { VARIABLES, aplicarVariables } from './plantillas'
import { limpiarHtml, htmlATexto, htmlVacio } from './html'
import { formatoTamano, validarArchivos, subirArchivo, borrarArchivos } from './adjuntos'
import {
  CENTROS, NIVELES, MINIMO_GT_EMPRESAS, CATEGORIAS, ORDEN_CATEGORIAS, conceptoDe, conceptosDe, puntosSugeridos, rangoTexto,
  num as fmtPts, campanas, dentroDe, PRIMERA_CAMPANA_CRM, clasificar, agruparPorCategoria,
} from './puntuaciones'
import {
  Building2, Plus, Search, LogOut, Pencil, Trash2, X, ChevronRight,
  Shield, User, Save, Mail, Phone, AlertCircle, KeyRound, Download, CalendarClock, Send, FileSpreadsheet, Trophy,
  History, UserPlus, UserMinus, Inbox, MapPin, Star, AlertTriangle, Users, FileText, BookOpen, Paperclip,
} from 'lucide-react'

// ---------- Config ----------
const ESTADOS = [
  { id: 'sin_contactar', label: 'Sin contactar', color: 'bg-slate-100 text-slate-600 border-slate-200', dot: 'bg-slate-400' },
  { id: 'no_contesta', label: 'No lo cogen', color: 'bg-cyan-50 text-cyan-700 border-cyan-200', dot: 'bg-cyan-500' },
  { id: 'mail_enviado', label: 'Mail enviado', color: 'bg-yellow-50 text-yellow-700 border-yellow-200', dot: 'bg-yellow-400' },
  { id: 'mas_adelante', label: 'Para más adelante', color: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200', dot: 'bg-fuchsia-500' },
  { id: 'segundo_plazo', oculto: true, label: 'Segundo plazo', color: 'bg-amber-100 text-amber-900 border-amber-300', dot: 'bg-amber-700' },
  { id: 'otra_provincia', label: 'Otra comunidad', color: 'bg-neutral-100 text-neutral-600 border-neutral-300', dot: 'bg-neutral-400' },
  { id: 'interesados', label: 'Muy interesados', color: 'bg-orange-50 text-orange-700 border-orange-200', dot: 'bg-orange-500' },
  { id: 'beca', label: 'Práctica conseguida', color: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  { id: 'no_existe', label: 'Ya no existe', color: 'bg-stone-100 text-stone-500 border-stone-300 line-through', dot: 'bg-stone-400' },
  { id: 'rechazada', label: 'No quieren', color: 'bg-rose-50 text-rose-700 border-rose-200', dot: 'bg-rose-500' },
]
// Apartados de la lista de empresas: cada estado pertenece a uno
const GRUPOS = [
  { id: 'disponibles', label: 'Empresas disponibles', estados: ['sin_contactar'] },
  { id: 'activo', label: 'Seguimiento activo', estados: ['no_contesta', 'mail_enviado', 'mas_adelante', 'segundo_plazo', 'interesados'] },
  { id: 'cerradas', label: 'Cerradas', estados: ['beca', 'rechazada', 'no_existe', 'otra_provincia'] },
  { id: 'historicas', label: 'Prioritarias', estados: null, historicas: true, soloAdmin: true },
  { id: 'todas', label: 'Todas', estados: null },
]
// Para un miembro, todos los apartados salvo «Todas» muestran solo sus empresas
const enGrupo = (g, c, meId, admin = true) =>
  (!admin && g.id !== 'todas' && c.responsable !== meId) ? false
    : g.historicas ? !!c.historica : (!g.estados || g.estados.includes(c.estado))
// Normaliza un CIF para comparar: sin espacios, guiones ni puntos y en mayúsculas
const cifNorm = (cif) => String(cif || '').replace(/[^A-Z0-9]/gi, '').toUpperCase()
// Texto «2023 (3 prácticas) y 2024 (1 práctica)» a partir de las filas de la tabla practicas
// (año o número pueden venir vacíos en las prioritarias importadas del Excel)
const textoPracticas = (lista = []) => {
  const partes = [...lista].sort((a, b) => (a.anio || 0) - (b.anio || 0))
    .map((p) => `${p.anio || 'un año sin registrar'}${p.num_practicas ? ` (${p.num_practicas} práctica${p.num_practicas !== 1 ? 's' : ''})` : ''}`)
  return partes.length > 1 ? `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}` : (partes[0] || '')
}
const aniosPracticas = (lista = []) => [...new Set(lista.map((p) => p.anio).filter(Boolean))].sort().join(', ')
const grupoDe = (id) => GRUPOS.find((g) => g.id === id) || GRUPOS[GRUPOS.length - 1]
// Los estados «oculto» ya no se pueden elegir; solo se muestran si alguna empresa sigue en ellos
const estadoDe = (id) => ESTADOS.find((e) => e.id === id) || ESTADOS[0]

// Cuántas empresas sin contactar se asignan de golpe y a partir de cuántas se avisa
const LOTE = 5
const AVISO_POCAS = 2

// Acciones del historial
const ACCIONES = {
  alta: { label: 'Alta', color: 'bg-brand-50 text-brand-600 border-brand-200' },
  estado: { label: 'Estado', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  nota: { label: 'Nota', color: 'bg-slate-100 text-slate-600 border-slate-200' },
  agenda: { label: 'Agenda', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  responsable: { label: 'Responsable', color: 'bg-violet-50 text-violet-700 border-violet-200' },
  datos: { label: 'Datos', color: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
}
const accionDe = (id) => ACCIONES[id] || { label: id, color: 'bg-slate-100 text-slate-600 border-slate-200' }

// Baremo de puntos del club: cada empresa vale según su estado ACTUAL (máximo 3 por empresa).
// No se acumula: si una empresa cambia de estado, sus puntos pasan a ser los del estado nuevo.
// Los puntos son para la persona que tiene asignada la empresa. Las notas y las altas no puntúan.
const PUNTOS_ESTADO = {
  sin_contactar: 0,
  no_contesta: 1, mail_enviado: 1, interesados: 1, segundo_plazo: 1,   // ya contactada
  mas_adelante: 3, otra_provincia: 3, no_existe: 3, rechazada: 3, beca: 3, // cerrada (3 en total)
}
// Un seguimiento con cambio de estado deja dos filas en el historial (estado + nota) con la misma
// hora, persona y empresa: así se emparejan en la ficha de la empresa.
const claveSeg = (h) => `${h.empresa_id}|${h.usuario_id}|${h.creado}`

// ---------- Aviso «Realizar seguimiento» ----------
// Una empresa en seguimiento (no cerrada) que lleva SIN_MOVER.dias sin una nota ni un cambio de
// estado se marca con un aviso. No cuentan las que tienen un próximo contacto programado a futuro.
const SIN_MOVER = {
  dias: 7,
  estados: ['no_contesta', 'mail_enviado', 'interesados', 'segundo_plazo'],
}
const isoDia = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const diaMas = (iso, n) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return isoDia(d) }

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

// Fechas en hora LOCAL (toISOString daría el día UTC: de 00:00 a 02:00 en España saldría el día anterior)
const HOY = () => isoDia(new Date())
const sumarDias = (n) => diaMas(HOY(), n)
// 1 de septiembre del curso en marcha (si estamos en enero-agosto, el del año anterior)
const INICIO_CURSO = () => {
  const h = new Date()
  return `${h.getMonth() >= 8 ? h.getFullYear() : h.getFullYear() - 1}-09-01`
}
const fechaCorta = (iso) => iso ? new Date(iso + 'T00:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }) : ''

// ---------- UI básicos ----------
const Badge = ({ estadoId }) => {
  const e = estadoDe(estadoId)
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border whitespace-nowrap ${e.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${e.dot}`} />
      {e.label}
    </span>
  )
}

const Input = (props) => (
  <input
    {...props}
    className={`w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm bg-white text-slate-900 placeholder:text-slate-400 transition focus:outline-none focus:ring-4 focus:ring-brand-500/15 focus:border-brand-500 ${props.className || ''}`}
  />
)

const Label = ({ children }) => (
  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">{children}</label>
)

const Btn = ({ children, variant = 'primary', ...props }) => {
  const styles = {
    primary: 'bg-brand-900 hover:bg-brand-700 text-white shadow-sm shadow-brand-900/20 active:scale-[0.98]',
    ghost: 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200',
    danger: 'bg-white hover:bg-rose-50 text-rose-600 border border-rose-200',
  }
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed ${styles[variant]} ${props.className || ''}`}
    >
      {children}
    </button>
  )
}

// Botón pequeño para barras de herramientas (exportar, limpiar…)
const miniBtn = 'px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:bg-slate-50 hover:border-slate-200 transition inline-flex items-center gap-1.5'
// Chip de filtro de periodo
const chipPeriodo = (on) => `px-3 py-1.5 rounded-lg border text-xs transition ${on ? 'border-brand-500 bg-brand-50 text-brand-700 font-semibold' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`

// Avatar con la inicial; el color sale del nombre para que cada persona tenga el suyo
const AVATAR_COLORES = ['bg-sky-100 text-sky-700', 'bg-violet-100 text-violet-700', 'bg-emerald-100 text-emerald-700', 'bg-amber-100 text-amber-700', 'bg-rose-100 text-rose-700', 'bg-teal-100 text-teal-700', 'bg-indigo-100 text-indigo-700', 'bg-fuchsia-100 text-fuchsia-700']
const Avatar = ({ nombre = '?', size = 'md', className = '' }) => {
  const n = String(nombre || '?').trim()
  const color = AVATAR_COLORES[[...n].reduce((a, ch) => a + ch.charCodeAt(0), 0) % AVATAR_COLORES.length]
  const tam = size === 'sm' ? 'w-7 h-7 text-xs' : size === 'lg' ? 'w-11 h-11 text-base' : 'w-9 h-9 text-sm'
  return <span className={`${tam} ${color} ${className} rounded-full inline-flex items-center justify-center font-bold shrink-0 select-none`}>{n.charAt(0).toUpperCase()}</span>
}

// Contenedor de diálogos: centrado en móvil como hoja inferior, y en escritorio como panel lateral (panel) o diálogo (dialogo)
// columna: el cuerpo se reparte en una columna flex (cabecera, contenido con scroll propio, pie); fijo: ocupa casi toda la altura
function Modal({ children, onClose, ancho = 'max-w-lg', panel = false, columna = false, fijo = false }) {
  useEffect(() => {
    if (!onClose) return
    const alTeclear = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [onClose])
  return (
    <div className={`fixed inset-0 bg-brand-950/50 backdrop-blur-[2px] animate-fade-in flex z-50 ${panel ? 'items-end sm:items-stretch sm:justify-end' : 'items-end sm:items-center justify-center p-0 sm:p-4'}`} onClick={onClose}>
      <div
        className={`w-full ${ancho} bg-white shadow-pop ${columna
          ? `flex flex-col overflow-hidden rounded-t-3xl sm:rounded-3xl animate-rise ${fijo ? 'h-[94vh]' : 'max-h-[94vh]'}`
          : `overflow-y-auto scroll-thin ${
            panel ? 'rounded-t-3xl sm:rounded-none sm:rounded-l-3xl max-h-[92vh] sm:max-h-none animate-rise sm:animate-slide-in' : 'rounded-t-3xl sm:rounded-3xl max-h-[92vh] animate-rise'
          }`}`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}

function ModalHead({ children, onClose, sub }) {
  return (
    <div className="flex items-start justify-between gap-3 px-6 py-4 border-b border-slate-100 shrink-0 sticky top-0 bg-white/90 backdrop-blur z-10">
      <div className="min-w-0">
        <h2 className="font-bold text-slate-900 text-lg leading-snug break-words">{children}</h2>
        {sub}
      </div>
      {onClose && <button onClick={onClose} aria-label="Cerrar" className="p-1.5 -mr-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition"><X className="w-5 h-5" /></button>}
    </div>
  )
}

// Aviso de ancho completo (info / éxito / alerta / error)
const AVISO_TONOS = {
  info: 'border-brand-200 bg-brand-50 text-brand-900',
  ok: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  warn: 'border-amber-300 bg-amber-50 text-amber-900',
  error: 'border-rose-200 bg-rose-50 text-rose-800',
  neutral: 'border-slate-200 bg-white text-slate-600',
}
const Aviso = ({ tono = 'info', icono: Icono, children, className = '' }) => (
  <div className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm ${AVISO_TONOS[tono]} ${className}`}>
    {Icono && <Icono className="w-4 h-4 mt-0.5 shrink-0 opacity-80" />}
    <div className="min-w-0 flex-1">{children}</div>
  </div>
)

const Cargando = ({ texto = 'Cargando…' }) => (
  <p className="flex items-center justify-center gap-2.5 text-sm text-slate-400 py-10">
    <span className="w-4 h-4 rounded-full border-2 border-slate-200 border-t-brand-500 animate-spin" />{texto}
  </p>
)

const Vacio = ({ icono: Icono = Inbox, children }) => (
  <div className="card p-12 text-center text-sm text-slate-500 flex flex-col items-center gap-3">
    <span className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center"><Icono className="w-6 h-6" /></span>
    <p className="max-w-sm">{children}</p>
  </div>
)

// ---------- Seguridad de las cuentas ----------
// Dominios de correo temporal / desechable. Es solo una primera barrera para avisar al momento:
// el bloqueo de verdad lo hace Supabase con el hook «Before User Created»
// (supabase/migrations/*_auth_seguridad.sql, tabla dominios_desechables). Si añades un dominio aquí, añádelo también allí.
const DOMINIOS_DESECHABLES = new Set([
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.net', 'guerrillamail.org', 'guerrillamail.biz', 'guerrillamailblock.com', 'sharklasers.com', 'grr.la', 'pokemail.net', 'spam4.me',
  '10minutemail.com', '10minutemail.net', '10minutemail.co.uk', '10minemail.com', '20minutemail.com', 'temp-mail.org', 'temp-mail.io', 'tempmail.com', 'tempmail.net', 'tempmail.dev',
  'tempmailo.com', 'tempmail.plus', 'tempr.email', 'tempail.com', 'temporary-mail.net', 'tmpmail.org', 'tmpmail.net', 'tmail.ws', 'throwawaymail.com', 'trashmail.com',
  'trashmail.net', 'trashmail.de', 'trash-mail.com', 'yopmail.com', 'yopmail.net', 'yopmail.fr', 'cool.fr.nf', 'jetable.fr.nf', 'nospam.ze.tc', 'nomail.xl.cx',
  'mega.zik.dj', 'speed.1s.fr', 'courriel.fr.nf', 'moncourrier.fr.nf', 'monemail.fr.nf', 'monmail.fr.nf', 'dispostable.com', 'getnada.com', 'nada.email', 'maildrop.cc',
  'mailnesia.com', 'mailcatch.com', 'mintemail.com', 'mohmal.com', 'emailondeck.com', 'fakeinbox.com', 'fakemail.net', 'fake-mail.net', 'spamgourmet.com', 'spambox.us',
  'mytemp.email', 'mailpoof.com', 'moakt.com', 'moakt.cc', 'tempinbox.com', 'inboxkitten.com', 'burnermail.io', 'mail.tm', 'mail.gw', 'emailfake.com',
  'email-fake.com', 'crazymailing.com', 'disposablemail.com', 'discard.email', 'discardmail.com', 'discardmail.de', 'harakirimail.com', 'incognitomail.org', 'mailforspam.com', 'spamfree24.org',
  'mailtemp.net', 'luxusmail.org', 'tempmailaddress.com', 'emltmp.com', 'mailinator.net', 'mailinator2.com', 'binkmail.com', 'bobmail.info', 'chammy.info', 'devnullmail.com',
  'letthemeatspam.com', 'mailinater.com', 'notmailinator.com', 'reallymymail.com', 'safetymail.info', 'sogetthis.com', 'spamherelots.com', 'thisisnotmyrealemail.com', 'tradermail.info', 'veryrealemail.com',
  'zippymail.info', 'mailexpire.com', 'meltmail.com', 'spamex.com', 'anonbox.net', 'anonymbox.com', 'owlymail.com', 'tempmailer.com', 'temp-mail.ru', 'dropmail.me',
  'mailsac.com', 'inboxbear.com', 'linshiyouxiang.net', 'mail7.io', 'smailpro.com', 'byom.de', 'wegwerfmail.de', 'wegwerfmail.net', 'einrot.com', 'cuvox.de',
  'dayrep.com', 'fleckens.hu', 'gustr.com', 'jourrapide.com', 'rhyta.com', 'superrito.com', 'teleworm.us', 'armyspy.com', 'zetmail.com', 'vomoto.com',
])
const EMAIL_RE = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i
// Devuelve el motivo por el que un email no vale para registrarse, o '' si vale
const problemaEmail = (email) => {
  const e = String(email || '').trim().toLowerCase()
  if (!EMAIL_RE.test(e) || e.length > 254) return 'Ese email no tiene un formato válido.'
  const dominio = e.split('@')[1]
  const partes = dominio.split('.')
  for (let i = 0; i < partes.length - 1; i++) {
    if (DOMINIOS_DESECHABLES.has(partes.slice(i).join('.'))) return 'No se admiten correos temporales o desechables. Usa tu email personal o el de la universidad.'
  }
  return ''
}
// Contraseñas: mínimo 8 caracteres, con letras y números (pon el mismo mínimo en Supabase)
const PASS_MIN = 8
const problemaPass = (p) =>
  p.length < PASS_MIN ? `La contraseña necesita al menos ${PASS_MIN} caracteres.`
    : !/[a-zA-Z]/.test(p) || !/[0-9]/.test(p) ? 'La contraseña tiene que llevar letras y números.'
      : ''
// Traduce los errores de Supabase Auth a mensajes claros (sin revelar si un email tiene cuenta)
const errorAuth = (e) => {
  const m = e?.message || ''
  const code = e?.code || ''
  if (code === 'invalid_credentials' || m === 'Invalid login credentials') return 'Email o contraseña incorrectos.'
  if (code === 'email_not_confirmed' || /email not confirmed/i.test(m)) return 'NO_CONFIRMADO'
  if (e?.status === 429 || /rate limit|security purposes/i.test(m)) return 'Demasiados intentos seguidos. Espera unos minutos y vuelve a probar.'
  if (code === 'weak_password' || /password/i.test(m) && /weak|short|characters/i.test(m)) return `Contraseña demasiado débil: mínimo ${PASS_MIN} caracteres, con letras y números.`
  if (code === 'same_password') return 'La contraseña nueva tiene que ser distinta de la anterior.'
  // Mensaje del hook de Supabase que bloquea correos desechables
  if (/desechable|temporal/i.test(m)) return m
  return m || 'Ha habido un error. Inténtalo de nuevo.'
}
// Al volver de un enlace de email caducado o ya usado, Supabase añade #error=…&error_code=… a la URL
const leerErrorEnlace = () => {
  const h = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const q = new URLSearchParams(window.location.search)
  const code = h.get('error_code') || q.get('error_code')
  if (!code && !h.get('error') && !q.get('error')) return ''
  window.history.replaceState(null, '', window.location.pathname)
  return code === 'otp_expired'
    ? 'El enlace ha caducado o ya se ha usado. Pide uno nuevo.'
    : (h.get('error_description') || q.get('error_description') || 'El enlace no es válido.').replace(/\+/g, ' ')
}

// ---------- Cambiar mi contraseña (también al volver de un enlace de recuperación) ----------
function CambiarContrasena({ recuperacion, onClose }) {
  const [p1, setP1] = useState('')
  const [p2, setP2] = useState('')
  const [err, setErr] = useState('')
  const [ok, setOk] = useState(false)
  const [busy, setBusy] = useState(false)
  const guardar = async () => {
    setErr('')
    const prob = problemaPass(p1)
    if (prob) { setErr(prob); return }
    if (p1 !== p2) { setErr('Las dos contraseñas no coinciden.'); return }
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: p1 })
    setBusy(false)
    if (error) setErr(errorAuth(error))
    else setOk(true)
  }
  // Si se llega desde el enlace de recuperación y se cancela, se cierra la sesión: el enlace
  // solo sirve para poner una contraseña nueva, no para entrar sin ella.
  const cerrar = async () => {
    if (recuperacion && !ok) await supabase.auth.signOut()
    onClose()
  }
  return (
    <Modal ancho="max-w-sm" onClose={recuperacion ? undefined : cerrar}>
      <div className="p-6 space-y-3">
        <h2 className="font-bold text-slate-900 flex items-center gap-2"><span className="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center"><KeyRound className="w-4 h-4" /></span>{recuperacion ? 'Elige una contraseña nueva' : 'Cambiar mi contraseña'}</h2>
        {ok ? (
          <>
            <Aviso tono="ok">Contraseña cambiada ✓ La próxima vez entra con la nueva.</Aviso>
            <Btn onClick={onClose} className="w-full">Cerrar</Btn>
          </>
        ) : (
          <>
            <p className="text-xs text-slate-500">Mínimo {PASS_MIN} caracteres, con letras y números.</p>
            <div><Label>Contraseña nueva</Label><Input type="password" autoComplete="new-password" autoFocus value={p1} onChange={(e) => setP1(e.target.value)} /></div>
            <div><Label>Repítela</Label><Input type="password" autoComplete="new-password" value={p2} onChange={(e) => setP2(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && guardar()} /></div>
            {err && <Aviso tono="error">{err}</Aviso>}
            <div className="flex gap-2 justify-end">
              <Btn variant="ghost" onClick={cerrar}>{recuperacion ? 'Cancelar y salir' : 'Cancelar'}</Btn>
              <Btn onClick={guardar} disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</Btn>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}

// ---------- Login / Registro / He olvidado mi contraseña ----------
function Auth() {
  // Con ?registro en el enlace (https://…/?registro) se abre directamente en «Crear cuenta»
  const [modo, setModo] = useState(() =>
    new URLSearchParams(window.location.search).has('registro') ? 'registro' : 'login'
  ) // login | registro | olvido
  const [nombre, setNombre] = useState('')
  const [centro, setCentro] = useState('')
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [pass2, setPass2] = useState('')
  const [err, setErr] = useState(() => leerErrorEnlace())
  const [info, setInfo] = useState('')
  const [sinConfirmar, setSinConfirmar] = useState('') // email pendiente de confirmar (para reenviar)
  const [busy, setBusy] = useState(false)
  const volverA = window.location.origin

  const cambiarModo = (m) => { setModo(m); setErr(''); setInfo(''); setSinConfirmar(''); setPass(''); setPass2('') }

  // «He olvidado mi contraseña»: la respuesta es siempre la misma, exista o no la cuenta
  const recuperar = async () => {
    setErr(''); setInfo('')
    const e = email.trim().toLowerCase()
    if (!EMAIL_RE.test(e)) { setErr('Escribe un email válido.'); return }
    setBusy(true)
    const { error } = await supabase.auth.resetPasswordForEmail(e, { redirectTo: volverA })
    setBusy(false)
    if (error && (error.status === 429 || /rate limit|security purposes/i.test(error.message))) {
      setErr('Has pedido varios enlaces seguidos. Espera unos minutos y vuelve a probar.')
      return
    }
    setInfo('Si el correo existe, se ha enviado un enlace para elegir una contraseña nueva. Caduca en 30 minutos y solo sirve una vez. Revisa también el spam.')
  }

  const reenviarConfirmacion = async () => {
    setErr(''); setInfo(''); setBusy(true)
    const { error } = await supabase.auth.resend({ type: 'signup', email: sinConfirmar, options: { emailRedirectTo: volverA } })
    setBusy(false)
    if (error) setErr(errorAuth(error))
    else setInfo('Te hemos reenviado el email de confirmación. Revisa también el spam.')
  }

  const enviar = async () => {
    setErr(''); setInfo(''); setSinConfirmar('')
    const e = email.trim().toLowerCase()
    try {
      if (modo === 'registro') {
        if (!nombre.trim()) throw new Error('Indica tu nombre.')
        if (!CENTROS.includes(centro)) throw new Error('Elige el centro al que perteneces.')
        const probE = problemaEmail(e)
        if (probE) throw new Error(probE)
        const probP = problemaPass(pass)
        if (probP) throw new Error(probP)
        if (pass !== pass2) throw new Error('Las dos contraseñas no coinciden.')
        setBusy(true)
        const { data, error } = await supabase.auth.signUp({
          email: e,
          password: pass,
          options: { data: { nombre: nombre.trim().replace(/\s+/g, ' '), centro }, emailRedirectTo: volverA },
        })
        if (error) throw error
        // Con «Confirm email» activado en Supabase no hay sesión hasta pulsar el enlace del correo.
        // (Si el email ya tenía cuenta, Supabase responde igual: así no se revela quién está registrado.)
        if (!data.session) {
          setInfo(`Te hemos enviado un email a ${e}. Pulsa el enlace para activar tu cuenta y después entra aquí. Revisa también el spam.`)
          setPass(''); setPass2('')
        }
      } else {
        if (!e || !pass) throw new Error('Escribe tu email y tu contraseña.')
        setBusy(true)
        const { error } = await supabase.auth.signInWithPassword({ email: e, password: pass })
        if (error) throw error
      }
    } catch (x) {
      const m = errorAuth(x)
      if (m === 'NO_CONFIRMADO') {
        setSinConfirmar(e)
        setErr('Todavía no has confirmado tu email. Abre el enlace que te enviamos al registrarte.')
      } else setErr(m)
    } finally {
      setBusy(false)
    }
  }

  const alPulsarEnter = (ev) => ev.key === 'Enter' && (modo === 'olvido' ? recuperar() : enviar())

  return (
    <div className="min-h-screen bg-surface grid lg:grid-cols-[1.05fr_1fr]">
      <aside className="hidden lg:flex flex-col justify-between relative overflow-hidden bg-brand-900 text-white p-12">
        <div className="absolute -top-32 -right-32 w-[28rem] h-[28rem] rounded-full bg-brand-500/25 blur-3xl" />
        <div className="absolute -bottom-40 -left-24 w-[26rem] h-[26rem] rounded-full bg-brand-300/15 blur-3xl" />
        <div className="relative"><LogoIaeste /></div>
        <div className="relative max-w-md">
          <h2 className="text-4xl font-extrabold leading-tight tracking-tight">Cada empresa, cada contacto, cada práctica.</h2>
          <p className="mt-4 text-white/65 leading-relaxed">El CRM del equipo de empresas de IAESTE Málaga: reparte empresas, haz seguimiento y escribe a las empresas con plantillas de correo.</p>
          <ul className="mt-8 space-y-3 text-sm text-white/80">
            {[[Building2, 'Todas las empresas y su estado en un solo sitio'], [CalendarClock, 'Recordatorios de próximos contactos'], [Mail, 'Correo con las empresas y plantillas compartidas']].map(([I, t]) => (
              <li key={t} className="flex items-center gap-3"><span className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center"><I className="w-4 h-4" /></span>{t}</li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-white/40">IAESTE Málaga</p>
      </aside>
      <div className="flex items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-8 lg:hidden">
          <div className="w-11 h-11 rounded-2xl bg-brand-900 flex items-center justify-center shadow-nav">
            <Building2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-slate-900 leading-tight">CRM IAESTE</h1>
            <p className="text-xs text-slate-500">Gestión de empresas</p>
          </div>
        </div>
        <h1 className="hidden lg:block text-2xl font-extrabold tracking-tight text-slate-900 mb-1">{modo === 'registro' ? 'Crea tu cuenta' : modo === 'olvido' ? 'Recupera el acceso' : 'Bienvenido de nuevo'}</h1>
        <p className="hidden lg:block text-sm text-slate-500 mb-6">{modo === 'registro' ? 'Únete al equipo de empresas.' : modo === 'olvido' ? 'Te enviaremos un enlace por correo.' : 'Entra para ver tus empresas.'}</p>
        {modo === 'olvido' ? (
          <div className="mb-5">
            <h2 className="font-semibold text-slate-900">¿Has olvidado tu contraseña?</h2>
            <p className="text-xs text-slate-500 mt-1">Escribe el email de tu cuenta y te enviaremos un enlace para elegir una nueva.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 bg-slate-100 rounded-xl p-1 mb-5">
            {[['login', 'Entrar'], ['registro', 'Crear cuenta']].map(([id, label]) => (
              <button
                key={id}
                onClick={() => cambiarModo(id)}
                className={`py-2 rounded-lg text-sm font-semibold transition ${modo === id ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {modo === 'registro' && (
          <p className="text-xs text-slate-500 mb-3">
            Crea tu cuenta con tu nombre y un email real: te llegará un correo para activarla antes de poder entrar.
          </p>
        )}
        <div className="space-y-3">
          {modo === 'registro' && (
            <>
              <div><Label>Nombre</Label><Input value={nombre} autoComplete="name" onChange={(e) => setNombre(e.target.value)} placeholder="Mario" /></div>
              <div>
                <Label>Centro</Label>
                <select value={centro} onChange={(e) => setCentro(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm bg-white">
                  <option value="">Elige tu centro…</option>
                  {CENTROS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </>
          )}
          <div><Label>Email</Label><Input type="email" autoComplete="email" autoCapitalize="none" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={alPulsarEnter} /></div>
          {modo !== 'olvido' && (
            <div><Label>Contraseña</Label><Input type="password" autoComplete={modo === 'registro' ? 'new-password' : 'current-password'} value={pass} onChange={(e) => setPass(e.target.value)} onKeyDown={alPulsarEnter} /></div>
          )}
          {modo === 'registro' && (
            <>
              <div><Label>Repite la contraseña</Label><Input type="password" autoComplete="new-password" value={pass2} onChange={(e) => setPass2(e.target.value)} onKeyDown={alPulsarEnter} /></div>
              <p className="text-[11px] text-slate-400 -mt-1">Mínimo {PASS_MIN} caracteres, con letras y números.</p>
            </>
          )}
          {err && <Aviso tono="error" icono={AlertCircle}>{err}</Aviso>}
          {sinConfirmar && (
            <button onClick={reenviarConfirmacion} disabled={busy} className="w-full text-center text-xs font-medium text-brand-600 hover:underline">
              Reenviar el email de confirmación
            </button>
          )}
          {info && <Aviso tono="ok">{info}</Aviso>}
          {modo === 'olvido' ? (
            <>
              <Btn onClick={recuperar} disabled={busy} className="w-full">
                <Mail className="w-4 h-4" />{busy ? 'Un momento…' : 'Enviar enlace'}
              </Btn>
              <button onClick={() => cambiarModo('login')} className="w-full text-center text-xs text-slate-500 hover:text-brand-900 hover:underline">
                Volver a entrar
              </button>
            </>
          ) : (
            <>
              <Btn onClick={enviar} disabled={busy} className="w-full">
                <KeyRound className="w-4 h-4" />
                {busy ? 'Un momento…' : modo === 'login' ? 'Entrar' : 'Crear cuenta'}
              </Btn>
              {modo === 'login' && (
                <button onClick={() => cambiarModo('olvido')} disabled={busy} className="w-full text-center text-xs text-slate-500 hover:text-brand-900 hover:underline">
                  ¿Has olvidado tu contraseña?
                </button>
              )}
            </>
          )}
        </div>
      </div>
      </div>
    </div>
  )
}

// ---------- Acción rápida: llamar (el correo se lee y se envía desde el hilo de la ficha, no desde fuera) ----------
function AccionesContacto({ emp }) {
  if (!emp.telefono) return null
  const tel = String(emp.telefono).replace(/\s/g, '')
  return (
    <div className="flex flex-wrap gap-2">
      <a href={`tel:${tel}`}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50/80">
        <Phone className="w-3.5 h-3.5" />Llamar
      </a>
    </div>
  )
}

// ---------- Modal de empresa ----------
function EmpresaModal({ empresa: empresaInicial, users, isAdmin, me, todas = [], onSaved, onDeleted, onClose, onRefresh }) {
  // Copia local: un envío de correo puede cambiar el estado de la empresa con el modal abierto
  const [empresa, setEmpresa] = useState(empresaInicial)
  const [recargaHist, setRecargaHist] = useState(0)
  const nueva = !empresa
  const [fForm, setF] = useState(
    empresa || { nombre: '', cif: '', sector: '', contacto: '', email: '', telefono: '', direccion: '', responsable: null, estado: 'sin_contactar', notas: '', proximo_contacto: null }
  )
  const f = fForm
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [nuevaNota, setNuevaNota] = useState('')
  const [abrirNota, setAbrirNota] = useState(nueva)
  const [prac, setPrac] = useState({ anio: new Date().getFullYear(), num: 1 })
  const [addPrac, setAddPrac] = useState(false)
  const practicas = empresa?.practicas || []
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
  }, [nueva, empresa?.id, recargaHist])

  // Un miembro puede rellenar todos los campos al CREAR una empresa.
  // Al editar una existente puede tocar los datos de contacto (persona, teléfono,
  // email, dirección), el CIF, estado, notas y próximo contacto; nombre, sector y
  // responsable siguen siendo solo de admin.
  const camposEditables = isAdmin || nueva

  const guardar = async (cambios = {}, mensaje, notaAuto = '') => {
    const f = { ...fForm, ...cambios }
    if (camposEditables && !f.nombre.trim()) { setErr('La empresa necesita un nombre.'); return }
    if (cifDup) { setErr(`Ese CIF ya es de «${cifDup.nombre}». No se pueden repetir CIF en el CRM.`); return }
    // Cada seguimiento es una nota nueva; cambiar de estado obliga a escribirla
    const nota = (nuevaNota.trim() || notaAuto).slice(0, 500)
    // La nota es obligatoria al cambiar de estado, salvo en el primer paso desde «Sin contactar»
    if (!nueva && f.estado !== empresa.estado && empresa.estado !== 'sin_contactar' && !nota) {
      setAbrirNota(true)
      setErr('Para cambiar el estado añade una nota de seguimiento contando qué ha pasado.')
      return
    }
    const conNota = nota ? { notas: nota } : {}
    // Al pasar a «Práctica conseguida» (o si un admin lo pide) se registran año y nº de prácticas
    const registrar = isAdmin && ((f.estado === 'beca' && (nueva || empresa.estado !== 'beca')) || addPrac)
    const anio = parseInt(prac.anio, 10), num = parseInt(prac.num, 10)
    if (registrar && (!(anio >= 1990 && anio <= 2100) || !(num > 0))) {
      setErr('Indica el año y el número de prácticas conseguidas.')
      return
    }
    setBusy(true); setErr('')
    try {
      let empresaId = f.id
      if (nueva) {
        const { data: creada, error } = await supabase.from('empresas').insert({
          nombre: f.nombre.trim(), cif: f.cif, sector: f.sector, contacto: f.contacto, email: f.email,
          telefono: f.telefono, direccion: f.direccion,
          responsable: isAdmin ? (f.responsable || null) : me.id,
          estado: f.estado,
          notas: nota || null, proximo_contacto: f.proximo_contacto || null, actualizado_por: me.nombre,
        }).select('id').single()
        if (error) throw error
        empresaId = creada.id
      } else {
        const patch = isAdmin
          ? { nombre: f.nombre.trim(), cif: f.cif, sector: f.sector, contacto: f.contacto, email: f.email, telefono: f.telefono, direccion: f.direccion, responsable: f.responsable || null, estado: f.estado, ...conNota, proximo_contacto: f.proximo_contacto || null, actualizado_por: me.nombre }
          : { cif: f.cif, contacto: f.contacto, email: f.email, telefono: f.telefono, direccion: f.direccion, estado: f.estado, ...conNota, proximo_contacto: f.proximo_contacto || null, actualizado_por: me.nombre }
        const { error } = await supabase.from('empresas').update(patch).eq('id', f.id)
        if (error) throw error
      }
      if (registrar) {
        const { error } = await supabase.from('practicas').insert({
          empresa_id: empresaId, anio, num_practicas: num, creado_por_nombre: me.nombre,
        })
        if (error) {
          throw new Error(error.code === '23505'
            ? `La empresa se ha guardado, pero ya había prácticas registradas en ${anio}. Si hay que corregir el número, pídeselo a un admin.`
            : `La empresa se ha guardado, pero no se han podido registrar las prácticas: ${error.message}`)
        }
        mensaje = mensaje || `Prácticas ${anio} registradas ✓ · ya es empresa prioritaria`
      }
      onSaved(mensaje, nueva ? empresaId : undefined)
    } catch (e) {
      // La base de datos también impide CIF repetidos (por si la empresa no se ve desde esta cuenta)
      setErr(e.code === '23505' && /cif/i.test(e.message || '')
        ? 'Ya hay una empresa con ese CIF en el CRM. No se pueden repetir CIF.'
        : e.message)
    } finally {
      setBusy(false)
    }
  }

  const cifDup = cifNorm(f.cif).length > 5 && (nueva || cifNorm(f.cif) !== cifNorm(empresa.cif))
    ? todas.find((c) => c.id !== f.id && cifNorm(c.cif) === cifNorm(f.cif))
    : null
  const nombreResp = (id) => (id === me.id ? 'ti' : users.find((u) => u.id === id)?.nombre || null)

  const borrarPracticas = async (p) => {
    if (!confirm(`¿Quitar las prácticas de ${p.anio || 'año sin registrar'}? Si no le quedan otras, dejará de ser prioritaria.`)) return
    const { error } = await supabase.from('practicas').delete().eq('id', p.id)
    if (error) { setErr(error.message); return }
    onSaved('Registro de prácticas eliminado')
  }

  const eliminar = async () => {
    if (!confirm('¿Eliminar esta empresa?')) return
    const { error } = await supabase.from('empresas').delete().eq('id', f.id)
    if (error) { setErr(error.message); return }
    onDeleted()
  }

  // Línea de seguimientos: cada cambio de estado con su nota, cada nota suelta y el resto de movimientos
  const seguimientos = (() => {
    if (!hist) return null
    const notaDe = new Map(hist.filter((h) => h.accion === 'nota').map((h) => [claveSeg(h), h]))
    const usadas = new Set()
    const out = []
    for (const h of hist) {
      if (h.accion === 'estado') {
        const n = notaDe.get(claveSeg(h))
        if (n) usadas.add(n.id)
        out.push({ ...h, texto: n?.detalle || '' })
      } else if (h.accion === 'nota') {
        if (!usadas.has(h.id) && !hist.some((e) => e.accion === 'estado' && claveSeg(e) === claveSeg(h))) out.push({ ...h, texto: h.detalle })
      } else out.push(h)
    }
    return out
  })()
  const estadoCambiado = !nueva && f.estado !== empresa.estado
  const notaObligatoria = estadoCambiado && empresa.estado !== 'sin_contactar'

  const camposContacto = (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div><Label>Persona de contacto</Label><Input value={f.contacto || ''} onChange={(e) => set('contacto', e.target.value)} /></div>
        <div><Label>Teléfono</Label><Input type="tel" inputMode="tel" autoComplete="off" value={f.telefono || ''} onChange={(e) => set('telefono', e.target.value)} placeholder="+34 600 000 000" /></div>
      </div>
      <div><Label>Email</Label><Input type="email" inputMode="email" autoCapitalize="none" value={f.email || ''} onChange={(e) => set('email', e.target.value)} /></div>
      <div><Label>Dirección</Label><Input value={f.direccion || ''} onChange={(e) => set('direccion', e.target.value)} placeholder="Calle, número, ciudad" /></div>
      {f.direccion && (
        <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(f.direccion)}`} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-brand-600 hover:underline"><MapPin className="w-3.5 h-3.5" />Ver en el mapa</a>
      )}
      <AccionesContacto emp={f} />
    </>
  )

  // Un miembro puede ver todas las empresas, pero solo editar las suyas
  if (!isAdmin && !nueva && empresa.responsable !== me.id) {
    const dato = (Icono, v, href) => v && (
      <p className="flex items-start gap-2"><Icono className="w-4 h-4 mt-0.5 text-slate-400 shrink-0" />
        {href ? <a href={href} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline break-all">{v}</a> : <span className="break-words">{v}</span>}</p>
    )
    return (
      <Modal ancho="max-w-2xl" onClose={onClose}>
          <ModalHead onClose={onClose}>{f.nombre}</ModalHead>
          <div className="p-6 space-y-4 text-sm text-slate-700">
            <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
              <span className="flex items-center gap-2"><User className="w-4 h-4 text-slate-400" />
                {empresa.responsable ? <>La lleva <strong>{nombreResp(empresa.responsable) || 'otra persona'}</strong></> : 'Sin asignar'}</span>
              <Badge estadoId={f.estado} />
            </div>
            {empresa.historica && (
              <p className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900">
                <Star className="w-4 h-4 mt-0.5 shrink-0 fill-amber-500 text-amber-500" />
                <span><strong>Empresa prioritaria</strong>{practicas.length ? <>: nos firmó prácticas en {textoPracticas(practicas)}.</> : '.'}</span>
              </p>
            )}
            <div className="space-y-2">
              {f.cif && <p><span className="text-slate-400">CIF:</span> {f.cif}</p>}
              {f.sector && <p><span className="text-slate-400">Sector:</span> {f.sector}</p>}
              {dato(User, f.contacto)}
              {dato(Phone, f.telefono, f.telefono ? `tel:${String(f.telefono).replace(/\s/g, '')}` : null)}
              {dato(Mail, f.email)}
              {dato(MapPin, f.direccion, f.direccion ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(f.direccion)}` : null)}
            </div>
            <p className="text-xs text-slate-500 border-t border-slate-100 pt-3">
              Solo puede editarla {empresa.responsable ? 'su responsable' : 'quien la tenga asignada'} o un admin. Si quieres llevarla tú, pídeselo a un admin.
            </p>
          </div>
      </Modal>
    )
  }

  return (
    <Modal columna fijo={!nueva} ancho={nueva ? 'max-w-2xl' : 'max-w-7xl'} onClose={onClose}>
        <ModalHead onClose={onClose} sub={!nueva && <div className="mt-1.5"><Badge estadoId={empresa.estado} /></div>}>{nueva ? 'Nueva empresa' : empresa.nombre}</ModalHead>
        {/* Escritorio: datos y seguimiento a la izquierda, correo a la derecha, cada columna con su propio scroll */}
        <div className={`flex-1 min-h-0 overflow-y-auto ${nueva ? '' : 'lg:overflow-hidden lg:grid lg:grid-rows-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]'}`}>
        <div className={`p-6 space-y-5 ${nueva ? '' : 'lg:overflow-y-auto lg:h-full'}`}>
          {practicas.length > 0 && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <p className="flex items-start gap-2">
                <Star className="w-4 h-4 mt-0.5 shrink-0 fill-amber-500 text-amber-500" />
                <span><strong>Empresa prioritaria:</strong> nos firmó prácticas en {textoPracticas(practicas)}.</span>
              </p>
              {practicas.filter((p) => p.notas).map((p) => (
                <p key={`n${p.id}`} className="text-xs text-amber-800 mt-1 pl-6">{p.notas}</p>
              ))}
              {isAdmin && (
                <div className="flex flex-wrap gap-1.5 mt-2 pl-6">
                  {practicas.map((p) => (
                    <span key={p.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-amber-200 text-xs">
                      {p.anio || '¿año?'}{p.num_practicas ? ` · ${p.num_practicas}` : ''}
                      <button onClick={() => borrarPracticas(p)} title="Quitar este año" className="text-amber-400 hover:text-rose-600"><X className="w-3 h-3" /></button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
          {camposEditables ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><Label>Empresa</Label><Input value={f.nombre} onChange={(e) => set('nombre', e.target.value)} /></div>
                <div><Label>CIF</Label><Input value={f.cif || ''} onChange={(e) => set('cif', e.target.value.toUpperCase())} placeholder="B12345678" /></div>
              </div>
              {cifDup && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-start gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>Esta empresa ya está en el CRM: <strong>{cifDup.nombre}</strong>{cifDup.responsable ? <> (asignada a {nombreResp(cifDup.responsable) || 'otra persona'})</> : ' (sin asignar)'}. No se pueden repetir CIF.</span>
                </p>
              )}
              <div><Label>Sector</Label><Input value={f.sector} onChange={(e) => set('sector', e.target.value)} placeholder="Software, consultoría…" /></div>
              {camposContacto}
              {isAdmin ? (
                <div>
                  <Label>Responsable</Label>
                  <select
                    value={f.responsable || ''}
                    onChange={(e) => set('responsable', e.target.value || null)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/25"
                  >
                    <option value="">Sin asignar</option>
                    {users.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                  </select>
                </div>
              ) : (
                <p className="text-xs text-slate-500">
                  Se te asignará a ti como responsable. Después podrás actualizar los datos de contacto, estado, notas y próximo contacto; para cambiar nombre o sector, pídeselo a un admin.
                </p>
              )}
            </>
          ) : (
            <>
              {f.sector && (
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 text-sm text-slate-700">
                  <p><span className="text-slate-400">Sector:</span> {f.sector}</p>
                </div>
              )}
              <div><Label>CIF</Label><Input value={f.cif || ''} onChange={(e) => set('cif', e.target.value.toUpperCase())} placeholder="B12345678" /></div>
              {camposContacto}
            </>
          )}
          <div>
            <Label>Estado</Label>
            <div className="flex flex-wrap gap-2">
              {ESTADOS.filter((e) => !e.oculto || e.id === empresa?.estado).map((e) => (
                <button
                  key={e.id}
                  onClick={() => set('estado', e.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                    f.estado === e.id ? `${e.color} ring-2 ring-offset-1 ring-brand-900` : 'bg-white text-slate-500 border-slate-200 hover:border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {e.label}
                </button>
              ))}
            </div>
          </div>
          {isAdmin && ((f.estado === 'beca' && (nueva || empresa.estado !== 'beca')) || addPrac) ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-sm font-semibold text-emerald-900 mb-2">Prácticas conseguidas</p>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Año</Label><Input type="number" inputMode="numeric" min="1990" max="2100" value={prac.anio} onChange={(e) => setPrac((p) => ({ ...p, anio: e.target.value }))} /></div>
                <div><Label>Nº de prácticas</Label><Input type="number" inputMode="numeric" min="1" value={prac.num} onChange={(e) => setPrac((p) => ({ ...p, num: e.target.value }))} /></div>
              </div>
              <p className="text-xs text-emerald-800 mt-2">Al guardar, la empresa queda registrada como prioritaria con este año.</p>
              {addPrac && (
                <button onClick={() => setAddPrac(false)} className="text-xs text-slate-500 hover:underline mt-1">Cancelar</button>
              )}
            </div>
          ) : !isAdmin && f.estado === 'beca' && empresa?.estado !== 'beca' ? (
            <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              ¡Enhorabuena! Un admin registrará el año y el número de prácticas para dejarla como empresa prioritaria.
            </p>
          ) : isAdmin && (
            <button onClick={() => setAddPrac(true)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-800 hover:underline">
              <Star className="w-3.5 h-3.5" />{practicas.length ? 'Registrar prácticas de otro año' : 'Marcar como prioritaria (registrar prácticas de un año)'}
            </button>
          )}
          <div>
            <Label>Próximo contacto</Label>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={f.proximo_contacto || ''}
                onChange={(e) => set('proximo_contacto', e.target.value || null)}
                className="px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/25"
              />
              {[['+1 sem', 7], ['+2 sem', 14], ['+1 mes', 30]].map(([t, n]) => (
                <button key={t} onClick={() => set('proximo_contacto', sumarDias(n))}
                  className="px-2.5 py-1 rounded-xl border border-slate-200 text-xs text-slate-600 hover:bg-slate-50/80">{t}</button>
              ))}
              {f.proximo_contacto && (
                <button onClick={() => set('proximo_contacto', null)}
                  className="px-2.5 py-1 rounded-lg border border-slate-200 text-xs text-slate-400 hover:bg-slate-50/80">Quitar</button>
              )}
            </div>
          </div>
          <div className="pt-5 border-t border-slate-100">
            <div className="flex items-center justify-between mb-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                <History className="w-3.5 h-3.5" />Seguimiento
              </p>
              {!abrirNota && !estadoCambiado && (
                <button onClick={() => setAbrirNota(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-brand-200 bg-brand-50 text-xs font-medium text-brand-600 hover:bg-brand-100">
                  <Plus className="w-3.5 h-3.5" />Añadir seguimiento
                </button>
              )}
            </div>
            {(abrirNota || estadoCambiado) && (
              <div className="mb-3">
                {estadoCambiado && (
                  <p className="text-xs text-slate-600 mb-1.5">
                    {estadoDe(empresa.estado).label} → <strong>{estadoDe(f.estado).label}</strong>: cuenta qué ha pasado {notaObligatoria ? <span className="text-rose-600">(obligatorio)</span> : <span className="text-slate-400">(opcional)</span>}
                  </p>
                )}
                <textarea
                  autoFocus
                  value={nuevaNota}
                  onChange={(e) => setNuevaNota(e.target.value)}
                  rows={3}
                  maxLength={500}
                  placeholder="Llamada del 3/7: interesados, enviar propuesta…"
                  className={`w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/25 resize-none ${
                    notaObligatoria && !nuevaNota.trim() ? 'border-rose-300' : 'border-slate-200'
                  }`}
                />
                <p className="text-[11px] text-slate-400 text-right">{nuevaNota.length}/500</p>
              </div>
            )}
            {nueva ? null : seguimientos === null ? (
              <p className="text-xs text-slate-400">Cargando…</p>
            ) : seguimientos.length === 0 ? (
              <p className="text-xs text-slate-400">Sin seguimientos todavía.</p>
            ) : (
              <ol className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {seguimientos.map((h) => (h.accion === 'estado' || h.accion === 'nota') ? (
                  <li key={h.id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                    <div className="flex flex-wrap items-center gap-1.5 mb-1">
                      {h.accion === 'estado' && h.estado_nuevo ? (
                        <span className={`px-1.5 py-0.5 rounded border font-medium ${estadoDe(h.estado_nuevo).color}`}>
                          {h.estado_anterior ? `${estadoDe(h.estado_anterior).label} → ` : ''}{estadoDe(h.estado_nuevo).label}
                        </span>
                      ) : h.accion === 'estado' ? (
                        <span className="px-1.5 py-0.5 rounded border font-medium bg-emerald-50 text-emerald-700 border-emerald-200">{detalleLegible(h)}</span>
                      ) : null}
                      <span className="text-slate-400">{h.usuario_nombre} · {fecha(h.creado)}</span>
                    </div>
                    {h.texto ? <p className="text-slate-700 whitespace-pre-wrap break-words">{h.texto}</p>
                      : <p className="text-slate-400 italic">Sin nota</p>}
                  </li>
                ) : (
                  <li key={h.id} className="flex gap-2 text-xs px-1">
                    <span className={`shrink-0 px-1.5 py-0.5 rounded border font-medium ${accionDe(h.accion).color}`}>
                      {accionDe(h.accion).label}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="text-slate-600 break-words">{detalleLegible(h)}</span>
                      <span className="block text-slate-400">{h.usuario_nombre} · {fecha(h.creado)}</span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
          {f.actualizado && !nueva && (
            <p className="text-xs text-slate-400">Última actualización: {fecha(f.actualizado)}{f.actualizado_por ? ` · ${f.actualizado_por}` : ''}</p>
          )}
          <div className="flex justify-end pt-1">
            <Btn onClick={() => guardar()} disabled={busy || !!cifDup}><Save className="w-4 h-4" />{busy ? 'Guardando…' : 'Guardar'}</Btn>
          </div>
        </div>
        {!nueva && (
          <div className="p-6 border-t lg:border-t-0 lg:border-l border-slate-100 bg-slate-50/60 lg:overflow-y-auto lg:h-full">
            <EmailThread empresa={empresa} yo={me.nombre} onEnviado={(estado) => {
              // El servidor ya ha cambiado el estado: se refleja aquí para que «Guardar» no lo pise con el valor antiguo
              setEmpresa((e) => ({ ...e, estado, notas: 'Mail enviado' }))
              setF((p) => ({ ...p, estado, notas: 'Mail enviado' }))
              setRecargaHist((n) => n + 1)
              onRefresh?.()
            }} />
          </div>
        )}
        </div>
        <div className="shrink-0 flex items-center gap-3 px-6 py-3 border-t border-slate-100 bg-white">
          {isAdmin && !nueva && <Btn variant="danger" onClick={eliminar}><Trash2 className="w-4 h-4" />Eliminar</Btn>}
          <p className="flex-1 min-w-0 text-xs text-rose-600 flex items-start gap-1.5">
            {err && <><AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" /><span>{err}</span></>}
          </p>
        </div>
    </Modal>
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
      g.fillStyle = d.id === 'na' ? '#cbd5e1' : '#2f6bb8'
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
    <div className="card p-6">
      <div className="flex items-baseline justify-between mb-5 gap-3 flex-wrap">
        <h3 className="font-bold text-slate-900">Empresas por persona</h3>
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-500 mr-1">{companies.length} en total</span>
          <button onClick={exportarPNG} className="px-2.5 py-1 rounded-xl border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50/80 inline-flex items-center gap-1">
            <Download className="w-3.5 h-3.5" />PNG
          </button>
          <button onClick={exportarCSV} className="px-2.5 py-1 rounded-xl border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50/80 inline-flex items-center gap-1">
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
                className={`h-full rounded-md ${d.id === 'na' ? 'bg-slate-300' : 'bg-brand-500'}`}
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

// Puntos por persona en [desde, hasta]. Lo usan el panel de admin (Actividad) y Puntuación.
// Cada empresa asignada suma PUNTOS_ESTADO de su estado actual, y cuenta en el periodo en el que
// llegó a ese estado (último cambio de estado del historial). Si no hay registro de cuándo,
// solo cuenta en periodos que empiezan a inicio de curso o antes.
function calcularPuntos({ todo, companies, users, desde, hasta }) {
  const ini = new Date(desde + 'T00:00:00')
  const fin = new Date(diaMas(hasta, 1) + 'T00:00:00')
  const nombreDeUsuario = (id) => users.find((u) => u.id === id)?.nombre || '—'

  const llegada = {}
  for (const h of todo) {
    if (h.accion !== 'estado') continue
    const prev = llegada[h.empresa_id]
    if (!prev || new Date(h.creado) >= new Date(prev.creado)) llegada[h.empresa_id] = h
  }

  const resumen = {}
  const de = (id) => (resumen[id] ||= { id, nombre: nombreDeUsuario(id), contactadas: 0, cerradas: 0, becas: 0, puntos: 0, filas: [] })

  for (const c of companies) {
    const pts = PUNTOS_ESTADO[c.estado] ?? 0
    if (!c.responsable || !pts) continue
    const l = llegada[c.id]
    const cuando = l && l.estado_nuevo === c.estado ? l.creado : null
    const dentro = cuando ? new Date(cuando) >= ini && new Date(cuando) < fin : desde <= INICIO_CURSO()
    if (!dentro) continue
    const r = de(c.responsable)
    r.puntos += pts
    if (pts >= 3) r.cerradas++; else r.contactadas++
    if (c.estado === 'beca') r.becas++
    r.filas.push({ id: `e-${c.id}`, tipo: 'empresa', empresa_nombre: c.nombre, estado: c.estado, creado: cuando, puntos: pts })
  }

  users.forEach((u) => de(u.id))
  for (const r of Object.values(resumen)) r.filas.sort((a, b) => new Date(b.creado || 0) - new Date(a.creado || 0))
  const lista = Object.values(resumen).sort((a, b) => b.puntos - a.puntos || a.nombre.localeCompare(b.nombre))
  return { lista }
}

// ---------- Actividad y puntos del equipo (a partir del historial) ----------
function Actividad({ users, companies }) {
  const [desde, setDesde] = useState(INICIO_CURSO())
  const [hasta, setHasta] = useState(HOY())
  const [todo, setTodo] = useState(null) // historial completo hasta «hasta»
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
        throw new Error(`Solo se han podido quitar ${borradas} de ${ids.length} movimientos: falta la política historial_delete_admin en Supabase (ver supabase/migrations).`)
      }
      setInfo(`Hecho: quitados ${borradas} movimientos de ${nombres.length} empresa${nombres.length !== 1 ? 's' : ''} borrada${nombres.length !== 1 ? 's' : ''}.`)
    } catch (e) {
      setErr(e.message)
    } finally {
      setLimpiando(false)
      setRecarga((r) => r + 1)
    }
  }

  const { lista } = calcularPuntos({ todo: todo || [], companies, users, desde, hasta })

  const exportar = () => {
    const cab = ['Persona', 'Empresas contactadas (1 pt)', 'Empresas cerradas (3 pts)', 'Prácticas', 'Puntos']
    const csv = [cab, ...lista.map((d) => [d.nombre, d.contactadas, d.cerradas, d.becas, d.puntos])]
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
      className={chipPeriodo(desde === d && hasta === HOY())}
    >
      {label}
    </button>
  )

  return (
    <div className="card p-6">
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
                : 'border-slate-200 text-slate-600 hover:bg-slate-50/80'
            }`}
          >
            <Trash2 className="w-3.5 h-3.5" />
            {limpiando ? 'Limpiando…' : `Quitar empresas borradas${nEmpresasBorradas ? ` · ${nEmpresasBorradas}` : ''}`}
          </button>
          <button onClick={exportar} className="px-2.5 py-1 rounded-xl border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50/80 inline-flex items-center gap-1">
            <Download className="w-3.5 h-3.5" />CSV
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-5">
        <input type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)}
          className="px-2.5 py-1.5 rounded-xl border border-slate-200 text-sm bg-white" />
        <span className="text-slate-400 text-sm">a</span>
        <input type="date" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)}
          className="px-2.5 py-1.5 rounded-xl border border-slate-200 text-sm bg-white" />
        <span className="w-px h-5 bg-slate-200 mx-1" />
        {atajo('Curso', INICIO_CURSO())}
        {atajo('30 días', sumarDias(-30))}
        {atajo('7 días', sumarDias(-7))}
      </div>

      {err && <Aviso tono="error" icono={AlertCircle} className="mb-3">{err}</Aviso>}
      {info && <Aviso tono="ok" className="mb-3">{info}</Aviso>}
      {nEmpresasBorradas > 0 && !limpiando && (
        <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 mb-3 flex items-start gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-slate-400" />
          No se cuentan {huerfanasVistas.length} movimientos de {nEmpresasBorradas} empresa{nEmpresasBorradas !== 1 ? 's' : ''} eliminada{nEmpresasBorradas !== 1 ? 's' : ''}.
          Siguen guardados en el historial; pulsa «Quitar empresas borradas» para borrarlos del todo.
        </p>
      )}
      {todo === null ? (
        <Cargando />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-400 uppercase tracking-wide text-right">
                <th className="text-left font-medium pb-2">Persona</th>
                <th className="font-medium pb-2" title="Empresas contactadas (1 punto)">Contact.</th>
                <th className="font-medium pb-2" title="Empresas cerradas: más adelante, otra comunidad, ya no existe, no quieren o práctica (3 puntos)">Cerradas</th>
                <th className="font-medium pb-2">Prácticas</th>
                <th className="font-medium pb-2 pl-3">Puntos</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((d) => (
                <Fragment key={d.id}>
                  <tr
                    onClick={() => setAbierto(abierto === d.id ? '' : d.id)}
                    className="border-t border-slate-100 text-right tabular-nums cursor-pointer hover:bg-slate-50/80"
                  >
                    <td className="text-left py-2 text-slate-700 flex items-center gap-1">
                      <ChevronRight className={`w-3.5 h-3.5 text-slate-300 transition-transform ${abierto === d.id ? 'rotate-90' : ''}`} />
                      {d.nombre}
                    </td>
                    <td className="text-slate-500">{d.contactadas}</td>
                    <td className="text-slate-500">{d.cerradas}</td>
                    <td className={d.becas ? 'text-emerald-700 font-semibold' : 'text-slate-300'}>{d.becas}</td>
                    <td className="font-bold text-slate-900 pl-3">{d.puntos}</td>
                  </tr>
                  {abierto === d.id && (
                    <tr>
                      <td colSpan={5} className="bg-slate-50 px-3 py-3">
                        {d.filas.length === 0 ? (
                          <p className="text-xs text-slate-400">Sin puntos en este periodo.</p>
                        ) : (
                          <ol className="space-y-1.5 max-h-72 overflow-y-auto">
                            {d.filas.map((h) => (
                              <li key={h.id} className="flex items-center gap-2 text-xs">
                                <Badge estadoId={h.estado} />
                                <span className="flex-1 min-w-0 text-slate-600 truncate">
                                  <strong className="text-slate-800">{h.empresa_nombre}</strong>{h.detalle ? ` · ${h.detalle}` : ''}
                                </span>
                                <span className="shrink-0 text-slate-400">{h.creado ? fecha(h.creado) : 'sin fecha'}</span>
                                <span className={`shrink-0 w-8 text-right tabular-nums ${h.puntos ? 'text-slate-700 font-semibold' : 'text-slate-300'}`}>
                                  +{h.puntos}
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
        Baremo actual (por empresa, según su estado actual y para quien la tiene asignada; máximo 3 por empresa):
        sin contactar 0 · no lo cogen, mail enviado o muy interesados 1 · para más adelante, otra comunidad, ya no existe,
        no quieren o práctica conseguida 3. Si una empresa vuelve a un estado anterior, sus puntos bajan. Las notas y las altas no puntúan.
        Se cambia en <code>PUNTOS_ESTADO</code> al principio de App.jsx. Haz clic en una persona para ver el desglose.
      </p>
    </div>
  )
}
// ---------- Puntuación (clasificación de la campaña) ----------
// Una campaña es un curso (sep-ago). Suma lo que dan los admins por las acciones de la rúbrica (tabla `puntos`,
// catálogo en src/puntuaciones.js) y los puntos automáticos por empresas, que cuentan como GT Empresas.
// Cada persona ve su desglose con los motivos; de los demás, solo el total (puntuacion_resumen no trae motivos).
const aNum = (v) => Number(String(v ?? '').replace(',', '.')) || 0
const NIVEL_ESTILO = [
  'bg-slate-100 text-slate-500 border-slate-200',
  'bg-amber-50 text-amber-800 border-amber-200',
  'bg-emerald-50 text-emerald-700 border-emerald-200',
]
const NivelBadge = ({ nivel }) => (
  <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold border whitespace-nowrap ${NIVEL_ESTILO[nivel]}`}>{NIVELES[nivel]}</span>
)
const CentroBadge = ({ centro }) => centro
  ? <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[11px] font-semibold">{centro}</span>
  : <span className="px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 text-[11px] font-semibold">Sin centro</span>
const signo = (n) => `${n > 0 ? '+' : ''}${fmtPts(n)}`

// Apuntes de una persona por categoría + los puntos automáticos de empresas (si los hay)
function Desglose({ apuntes, auto, onEditar, onBorrar }) {
  const hayAuto = auto?.puntos > 0
  let grupos = agruparPorCategoria(apuntes)
  // Los puntos automáticos de empresas son parte de H (GT Empresas): van dentro de ese grupo
  if (hayAuto) {
    const h = grupos.find((g) => g.cat === 'H')
    if (h) h.subtotal += auto.puntos
    else grupos = [...grupos, { cat: 'H', subtotal: auto.puntos, filas: [] }].sort((a, b) => ORDEN_CATEGORIAS.indexOf(a.cat) - ORDEN_CATEGORIAS.indexOf(b.cat))
  }
  if (grupos.length === 0) return <p className="text-xs text-slate-400 py-1">Sin puntos en esta campaña.</p>
  return (
    <div className="space-y-4">
      {grupos.map(({ cat, subtotal, filas }) => (
        <div key={cat}>
          <p className="flex items-baseline justify-between gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
            <span>{cat === 'INI' ? CATEGORIAS[cat].label : `${cat}. ${CATEGORIAS[cat].label}`}</span>
            <span className="tabular-nums text-slate-700">{signo(subtotal)}</span>
          </p>
          {cat === 'H' && hayAuto && (
            <div className="py-1.5 border-b border-slate-100">
              <p className="flex items-baseline justify-between gap-2 text-xs">
                <span className="font-medium text-slate-800">Contacto con empresas <span className="font-normal text-slate-400">(automático)</span>
                  <span className="block font-normal text-slate-500">
                    {auto.contactadas} contactada{auto.contactadas !== 1 ? 's' : ''} · {auto.cerradas} cerrada{auto.cerradas !== 1 ? 's' : ''}
                  </span>
                </span>
                <span className="shrink-0 tabular-nums font-semibold text-slate-800">{signo(auto.puntos)}</span>
              </p>
              <details className="mt-1">
                <summary className="text-xs text-brand-600 cursor-pointer select-none">Ver el detalle</summary>
                <ol className="mt-1.5 space-y-1 max-h-60 overflow-y-auto">
                  {auto.filas.filter((h) => h.puntos).map((h) => (
                    <li key={h.id} className="flex items-center gap-2 text-xs">
                      <Badge estadoId={h.estado} />
                      <span className="flex-1 min-w-0 truncate text-slate-700">{h.empresa_nombre}</span>
                      <span className="shrink-0 w-8 text-right tabular-nums text-slate-700 font-semibold">+{h.puntos}</span>
                    </li>
                  ))}
                </ol>
              </details>
            </div>
          )}
          <ul className="divide-y divide-slate-100">
            {filas.map((a) => {
              const unidad = conceptoDe(a.concepto)?.unidad
              return (
                <li key={a.id} className="flex items-start gap-3 text-xs py-1.5">
                  <span className="shrink-0 w-14 text-slate-400">{fechaCorta(a.fecha)}</span>
                  <span className="flex-1 min-w-0 text-slate-700">
                    <span className="font-medium text-slate-800">{a.descripcion}</span>
                    {unidad && a.cantidad > 0 && Number(a.cantidad) !== 1 ? ` ×${fmtPts(a.cantidad)}` : ''}
                    {a.motivo && <span className="block text-slate-500">{a.motivo}</span>}
                  </span>
                  <span className={`shrink-0 tabular-nums font-semibold ${Number(a.puntos) ? 'text-slate-800' : 'text-slate-300'}`}>{signo(Number(a.puntos))}</span>
                  {onEditar && (
                    <span className="shrink-0 flex gap-0.5 -my-1">
                      <button onClick={() => onEditar(a)} title="Editar" className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => onBorrar(a)} title="Borrar" className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50"><Trash2 className="w-3.5 h-3.5" /></button>
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </div>
  )
}

function Puntuacion({ users, me, isAdmin }) {
  const hoy = HOY()
  const camps = campanas(hoy)
  const [campId, setCampId] = useState(camps[0].id)
  const camp = camps.find((c) => c.id === campId) || camps[0]
  const conAuto = camp.anio >= PRIMERA_CAMPANA_CRM // antes de eso, el CRM no se usaba: solo hay apuntes
  const hastaAuto = camp.hasta < hoy ? camp.hasta : hoy
  const [datos, setDatos] = useState(null)
  const [err, setErr] = useState('')
  const [info, setInfo] = useState('')
  const [recarga, setRecarga] = useState(0)
  const [centro, setCentro] = useState('')
  const [abierto, setAbierto] = useState('')
  const [modal, setModal] = useState(null) // null | { tipo: 'apunte', apunte?, persona? }

  useEffect(() => {
    let vivo = true
    setDatos(null); setErr('')
    ;(async () => {
      try {
        const [res, rk, apuntes, pend] = await Promise.all([
          supabase.rpc('puntuacion_resumen', { p_desde: camp.desde, p_hasta: camp.hasta }),
          conAuto ? supabase.rpc('ranking_datos', { p_hasta: hastaAuto }) : Promise.resolve({ data: null }),
          traerTodo(() => supabase.from('puntos').select('*')
            .gte('fecha', camp.desde).lte('fecha', camp.hasta)
            .order('fecha', { ascending: false }).order('id', { ascending: false })),
          isAdmin ? supabase.from('puntos').select('id', { count: 'exact', head: true }).is('usuario_id', null) : Promise.resolve({ count: 0 }),
        ])
        if (res.error) throw res.error
        if (rk.error) throw rk.error
        if (vivo) setDatos({ resumen: res.data || [], rk: rk.data, apuntes, pendientes: pend.count || 0 })
      } catch (e) {
        if (vivo) { setErr(`No se ha podido cargar la puntuación: ${e.message}`); setDatos({ resumen: [], rk: null, apuntes: [], pendientes: 0 }) }
      }
    })()
    return () => { vivo = false }
  }, [camp.id, recarga, isAdmin]) // eslint-disable-line react-hooks/exhaustive-deps

  const lista = useMemo(
    () => datos?.rk ? calcularPuntos({ todo: datos.rk.hist || [], companies: datos.rk.empresas || [], users, desde: camp.desde, hasta: hastaAuto }).lista : [],
    [datos, users, camp.desde, hastaAuto]
  )
  const autoDe = (id) => lista.find((d) => d.id === id)
  const filas = datos ? clasificar({ resumen: datos.resumen, auto: Object.fromEntries(lista.map((d) => [d.id, d.puntos])), users }) : []
  const yo = filas.find((f) => f.id === me.id)
  const visibles = filas.filter((f) => !centro || f.centro === centro)
  const apuntesDe = (id) => (datos?.apuntes || []).filter((a) => a.usuario_id === id)
  const medalla = ['bg-amber-400 text-amber-950 ring-4 ring-amber-100', 'bg-slate-300 text-slate-800 ring-4 ring-slate-100', 'bg-orange-300 text-orange-950 ring-4 ring-orange-100']
  const recargar = () => setRecarga((r) => r + 1)

  const borrar = async (a) => {
    if (!confirm(`¿Borrar «${a.descripcion}» (${signo(Number(a.puntos))} pts)? No se puede deshacer.`)) return
    setErr(''); setInfo('')
    const { error } = await supabase.from('puntos').delete().eq('id', a.id)
    if (error) setErr(error.message); else recargar()
  }

  const exportar = () => {
    const cab = ['Puesto', 'Persona', 'Centro', 'Nivel', 'Puntos GT Empresas', 'Puntos totales']
    const csv = [cab, ...filas.map((f) => [f.puesto, f.nombre, f.centro || '', NIVELES[f.nivel], fmtPts(f.gt), fmtPts(f.total)])]
      .map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\n')
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }))
    const a = document.createElement('a')
    a.href = url; a.download = `puntuacion-${camp.id}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="relative overflow-clip bg-gradient-to-br from-brand-900 via-brand-800 to-brand-600 rounded-2xl p-6 text-white shadow-nav"><div className="absolute -right-10 -top-10 w-44 h-44 rounded-full bg-white/10 blur-2xl" />
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-lg font-bold flex items-center gap-2"><Trophy className="w-5 h-5 text-amber-300" />Puntuación</h2>
          <div className="flex gap-1 bg-white/10 rounded-full p-1">
            {camps.map((c) => (
              <button key={c.id} onClick={() => { setCampId(c.id); setAbierto('') }}
                className={`px-3 py-1 rounded-full text-sm transition-colors ${camp.id === c.id ? 'bg-white text-brand-900 font-bold' : 'text-white/80 hover:bg-white/[0.08]'}`}>
                {c.label}
              </button>
            ))}
          </div>
        </div>
        {datos && yo && (
          <>
            <p className="mt-3 text-sm text-white/80">
              Vas <strong className="text-white">{yo.puesto}º</strong> de {filas.length} con <strong className="text-white">{fmtPts(yo.total)} punto{yo.total !== 1 ? 's' : ''}</strong>
              {' · '}nivel <strong className="text-white">{NIVELES[yo.nivel]}</strong>
            </p>
            <div className="mt-3">
              <div className="h-1.5 bg-white/15 rounded-full overflow-hidden">
                <div className="h-full bg-amber-300 rounded-full" style={{ width: `${Math.min(100, (yo.gt / MINIMO_GT_EMPRESAS) * 100)}%` }} />
              </div>
              <p className="text-xs text-white/70 mt-1.5">
                {yo.practica
                  ? 'Has conseguido una práctica de empresa en esta campaña.'
                  : yo.gt >= MINIMO_GT_EMPRESAS
                    ? `Mínimo de GT Empresas cumplido (${fmtPts(yo.gt)} de ${MINIMO_GT_EMPRESAS} puntos).`
                    : `GT Empresas: ${fmtPts(yo.gt)} de ${MINIMO_GT_EMPRESAS} puntos para optar a prácticas en primer plazo.`}
              </p>
            </div>
          </>
        )}
      </div>

      {err && <Aviso tono="error" icono={AlertCircle}>{err}</Aviso>}
      {info && <Aviso tono="ok">{info}</Aviso>}
      {isAdmin && datos?.pendientes > 0 && (
        <Aviso tono="info" icono={AlertCircle}>
          Hay {datos.pendientes} apunte{datos.pendientes !== 1 ? 's' : ''} importado{datos.pendientes !== 1 ? 's' : ''} de personas que aún no tienen cuenta
          (de todas las campañas). Se asignan solos cuando se registran con el mismo nombre.
        </Aviso>
      )}

      <div className="card p-5 sm:p-6">
        <h3 className="font-bold text-slate-900 mb-3">Mi desglose</h3>
        {datos === null ? <Cargando /> : <Desglose apuntes={apuntesDe(me.id)} auto={autoDe(me.id)} />}
      </div>

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between gap-2 flex-wrap px-5 sm:px-6 pt-5 pb-3">
          <h3 className="font-bold text-slate-900">Clasificación</h3>
          {isAdmin && (
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={() => setModal({ tipo: 'apunte' })} className={`${miniBtn} !bg-brand-900 !text-white !border-brand-900 hover:!bg-brand-700`}>
                <Plus className="w-3.5 h-3.5" />Dar puntos
              </button>
              <button onClick={exportar} className={miniBtn}><Download className="w-3.5 h-3.5" />CSV</button>
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5 px-5 sm:px-6 pb-3">
          <button onClick={() => setCentro('')} className={chipPeriodo(!centro)}>Todos</button>
          {CENTROS.map((c) => <button key={c} onClick={() => setCentro(c)} className={chipPeriodo(centro === c)}>{c}</button>)}
        </div>
        <div className="divide-y divide-slate-100 border-t border-slate-100">
          {datos === null ? <Cargando /> : visibles.length === 0 ? (
            <p className="px-6 py-8 text-sm text-slate-400 text-center">Nadie en este centro.</p>
          ) : visibles.map((f) => {
            const mio = f.id === me.id
            const abre = isAdmin && abierto === f.id
            return (
              <Fragment key={f.id}>
                <div
                  onClick={isAdmin ? () => setAbierto(abre ? '' : f.id) : undefined}
                  className={`flex items-center gap-3 px-5 sm:px-6 py-3 ${mio ? 'bg-brand-50/60' : ''} ${isAdmin ? 'cursor-pointer hover:bg-slate-50/80' : ''}`}
                >
                  <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${f.puesto <= 3 && f.total > 0 ? medalla[f.puesto - 1] : 'bg-slate-100 text-slate-500'}`}>{f.puesto}</span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm truncate ${mio ? 'font-bold text-brand-900' : 'font-medium text-slate-800'}`}>{f.nombre}{mio && ' (tú)'}</p>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      <CentroBadge centro={f.centro} />
                      <NivelBadge nivel={f.nivel} />
                    </div>
                  </div>
                  <span className="w-14 text-right text-base font-bold text-slate-900 tabular-nums shrink-0">{fmtPts(f.total)}</span>
                  {isAdmin && <ChevronRight className={`w-4 h-4 text-slate-300 shrink-0 transition-transform ${abre ? 'rotate-90' : ''}`} />}
                </div>
                {abre && (
                  <div className="bg-slate-50 px-5 sm:px-6 py-4">
                    <Desglose
                      apuntes={apuntesDe(f.id)} auto={autoDe(f.id)}
                      onEditar={(a) => setModal({ tipo: 'apunte', apunte: a })} onBorrar={borrar}
                    />
                    <button onClick={() => setModal({ tipo: 'apunte', persona: f.id })} className={`${miniBtn} mt-3`}>
                      <Plus className="w-3.5 h-3.5" />Dar puntos a {f.nombre.split(' ')[0]}
                    </button>
                  </div>
                )}
              </Fragment>
            )
          })}
        </div>
      </div>

      <p className="text-xs text-slate-500 px-1 leading-relaxed">
        La clasificación ordena primero por nivel (<strong>Práctica</strong>: ha conseguido una práctica de empresa; <strong>Mínimo</strong>: {MINIMO_GT_EMPRESAS} puntos
        de GT Empresas; <strong>Pendiente</strong>: el resto), luego por puntos totales y luego por puntos de GT Empresas.
        Los puntos de GT Empresas incluyen los que se ganan solos al llevar empresas en el CRM (contactada 1, cerrada 3).
        {isAdmin ? ' Pulsa una persona para ver su desglose y editarlo.' : ' De los demás solo se ve el total; tu desglose está arriba.'} Una campaña es un año natural, de enero a diciembre.
      </p>

      {modal?.tipo === 'apunte' && (
        <ApunteModal
          users={users} apunte={modal.apunte} personaInicial={modal.persona} camp={camp} hoy={hoy}
          onClose={() => setModal(null)}
          onSaved={(n) => { setModal(null); setInfo(n ? `Listo: se ${n === 1 ? 'ha anotado 1 apunte' : `han anotado ${n} apuntes`}.` : 'Apunte guardado.'); recargar() }}
        />
      )}
    </div>
  )
}

// Dar puntos a una o varias personas, o editar un apunte
function ApunteModal({ users, apunte, personaInicial, camp, hoy, onClose, onSaved }) {
  const editar = !!apunte
  const conceptoInicial = apunte ? (conceptoDe(apunte.concepto) ? apunte.concepto : `${apunte.categoria}_otro`) : 'h_reunion_conseguir'
  const [personas, setPersonas] = useState(() => apunte ? [apunte.usuario_id] : personaInicial ? [personaInicial] : [])
  const [buscar, setBuscar] = useState('')
  const [centroF, setCentroF] = useState('')
  const [cat, setCat] = useState(apunte?.categoria || conceptoDe(conceptoInicial).cat)
  const [conceptoId, setConceptoId] = useState(conceptoInicial)
  const conc = conceptoDe(conceptoId)
  const libre = conc.min === undefined
  const [cantidad, setCantidad] = useState(apunte ? String(apunte.cantidad ?? (conc.unidad ? 1 : '')) : conc.unidad ? '1' : '')
  const [puntos, setPuntos] = useState(apunte ? String(apunte.puntos) : String(puntosSugeridos(conc, 1)))
  const [manual, setManual] = useState(editar) // el admin ha tocado los puntos: dejar de sugerirlos
  const [descripcion, setDescripcion] = useState(apunte && libre ? apunte.descripcion : '')
  const [fecha, setFecha] = useState(apunte?.fecha || (dentroDe(camp, hoy) ? hoy : camp.hasta))
  const [motivo, setMotivo] = useState(apunte?.motivo || '')
  const [repartir, setRepartir] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const elegirConcepto = (id) => {
    const cn = conceptoDe(id)
    setConceptoId(id); setManual(false)
    setCantidad(cn.unidad ? '1' : '')
    setPuntos(String(puntosSugeridos(cn, 1)))
  }
  const elegirCat = (c) => { setCat(c); elegirConcepto(conceptosDe(c)[0].id) }
  const cambiarCantidad = (v) => { setCantidad(v); if (!manual) setPuntos(String(puntosSugeridos(conc, aNum(v) || 1))) }

  const q = buscar.trim().toLowerCase()
  const lista = users.filter((u) => (!centroF || u.centro === centroF) && (!q || u.nombre.toLowerCase().includes(q)))
  const alternar = (id) => setPersonas((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id])
  const todosVisibles = lista.length > 0 && lista.every((u) => personas.includes(u.id))
  const nombrePersona = users.find((u) => u.id === apunte?.usuario_id)?.nombre

  const guardar = async () => {
    setErr('')
    if (personas.length === 0) return setErr('Elige al menos una persona.')
    if (String(puntos).trim() === '') return setErr('Escribe los puntos.')
    if (libre && !descripcion.trim()) return setErr('Describe por qué se dan los puntos.')
    if (!fecha || fecha < camp.desde || fecha > camp.hasta) return setErr(`La fecha tiene que estar dentro de ${camp.label} (${camp.desde} a ${camp.hasta}).`)
    const cant = conc.unidad ? aNum(cantidad) : null
    if (conc.unidad && !(cant > 0)) return setErr('La cantidad tiene que ser mayor que 0.')
    const total = aNum(puntos)
    const cada = repartir && personas.length > 1 ? Math.round((total / personas.length) * 100) / 100 : total
    const base = {
      fecha, categoria: cat,
      concepto: editar && conceptoId === conceptoInicial ? apunte.concepto : conceptoId,
      descripcion: libre ? descripcion.trim() : conc.texto,
      cantidad: cant, puntos: cada, motivo: motivo.trim() || null,
    }
    setBusy(true)
    const { error } = editar
      ? await supabase.from('puntos').update(base).eq('id', apunte.id)
      : await supabase.from('puntos').insert(personas.map((id) => ({ ...base, usuario_id: id })))
    setBusy(false)
    if (error) return setErr(error.message)
    onSaved(editar ? 0 : personas.length)
  }

  const conceptos = conceptosDe(cat)
  const campoSel = 'w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm bg-white'
  return (
    <Modal ancho="max-w-xl" onClose={onClose}>
      <ModalHead onClose={onClose} sub={<p className="text-xs text-slate-500 mt-0.5">{camp.label}</p>}>
        {editar ? `Editar apunte de ${nombrePersona || 'la persona'}` : 'Dar puntos'}
      </ModalHead>
      <div className="px-6 py-5 space-y-4">
        {!editar && (
          <div>
            <Label>Personas ({personas.length})</Label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              <Input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar por nombre…" className="!w-auto flex-1 min-w-[10rem] !py-1.5" />
              <select value={centroF} onChange={(e) => setCentroF(e.target.value)} className="px-2.5 py-1.5 rounded-xl border border-slate-200 text-sm bg-white">
                <option value="">Todos los centros</option>
                {CENTROS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="max-h-44 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100">
              <label className="flex items-center gap-2.5 px-3 py-1.5 text-xs text-slate-500 bg-slate-50 cursor-pointer">
                <input type="checkbox" checked={todosVisibles}
                  onChange={() => setPersonas((p) => todosVisibles ? p.filter((id) => !lista.some((u) => u.id === id)) : [...new Set([...p, ...lista.map((u) => u.id)])])} />
                Marcar todas las que se ven ({lista.length})
              </label>
              {lista.map((u) => (
                <label key={u.id} className="flex items-center gap-2.5 px-3 py-1.5 text-sm cursor-pointer hover:bg-slate-50">
                  <input type="checkbox" checked={personas.includes(u.id)} onChange={() => alternar(u.id)} />
                  <span className="flex-1 truncate">{u.nombre}</span>
                  <CentroBadge centro={u.centro} />
                </label>
              ))}
              {lista.length === 0 && <p className="px-3 py-3 text-xs text-slate-400">Nadie coincide.</p>}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label>Categoría</Label>
            <select value={cat} onChange={(e) => elegirCat(e.target.value)} className={campoSel}>
              {ORDEN_CATEGORIAS.map((c) => <option key={c} value={c}>{c === 'INI' ? CATEGORIAS[c].label : `${c}. ${CATEGORIAS[c].label}`}</option>)}
            </select>
          </div>
          <div>
            <Label>Concepto</Label>
            <select value={conceptoId} onChange={(e) => elegirConcepto(e.target.value)} className={campoSel}>
              {conceptos.map((x) => <option key={x.id} value={x.id}>{x.texto} · {rangoTexto(x)}</option>)}
            </select>
          </div>
        </div>
        {conc.nota && <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{conc.nota}</p>}
        {libre && (
          <div><Label>Descripción</Label><Input value={descripcion} maxLength={200} onChange={(e) => setDescripcion(e.target.value)} placeholder="Qué se ha hecho" /></div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {conc.unidad && (
            <div><Label>Cantidad ({conc.unidad})</Label><Input inputMode="decimal" value={cantidad} onChange={(e) => cambiarCantidad(e.target.value)} /></div>
          )}
          <div>
            <Label>Puntos{personas.length > 1 && repartir ? ' (total)' : ''}</Label>
            <Input inputMode="decimal" value={puntos} onChange={(e) => { setPuntos(e.target.value); setManual(true) }} placeholder="0" />
          </div>
          <div><Label>Fecha</Label><Input type="date" value={fecha} min={camp.desde} max={camp.hasta} onChange={(e) => setFecha(e.target.value)} /></div>
        </div>
        {!libre && conc.min !== conc.max && !manual && (
          <p className="text-xs text-slate-500 -mt-2">Rango de la rúbrica: {rangoTexto(conc)}. Se propone el mínimo; ajústalo según el trabajo.</p>
        )}
        {!editar && personas.length > 1 && (
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={repartir} onChange={(e) => setRepartir(e.target.checked)} />
            Repartir los puntos entre las {personas.length} personas (si no, cada una recibe los puntos completos)
          </label>
        )}
        <div>
          <Label>Motivo (lo verá la persona)</Label>
          <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} maxLength={500}
            placeholder="Ej.: Feria de Empleo, 3 horas de stand"
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-4 focus:ring-brand-500/15 focus:border-brand-500" />
        </div>
        {err && <Aviso tono="error" icono={AlertCircle}>{err}</Aviso>}
        <div className="flex justify-end gap-2">
          <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
          <Btn onClick={guardar} disabled={busy}><Save className="w-4 h-4" />{busy ? 'Guardando…' : editar ? 'Guardar' : personas.length > 1 ? `Dar a ${personas.length} personas` : 'Dar puntos'}</Btn>
        </div>
      </div>
    </Modal>
  )
}

// ---------- Plantillas de correo (todo el equipo) ----------
// Se guardan en la tabla `plantillas` y se eligen en la caja de redacción del hilo de correo (EmailThread).
// Editar o borrar: su autor o un admin (RLS).
function Plantillas({ users, me, isAdmin }) {
  const [lista, setLista] = useState(null)
  const [err, setErr] = useState('')
  const [edit, setEdit] = useState(null) // null | 'nueva' | plantilla

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.from('plantillas')
      .select('id, nombre, asunto, cuerpo, adjuntos, creado_por, actualizado').order('nombre')
    if (error) {
      setErr(['PGRST205', '42P01'].includes(error.code)
        ? 'Falta la tabla de plantillas en la base de datos: aplica las migraciones pendientes (npx supabase db push).'
        : `No se han podido cargar las plantillas: ${error.message}`)
      setLista((l) => l ?? [])
      return
    }
    setErr(''); setLista(data)
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const puede = (p) => isAdmin || p.creado_por === me.id
  const autor = (p) => (p.creado_por ? users.find((u) => u.id === p.creado_por)?.nombre || 'Alguien del equipo' : 'De serie')

  const borrar = async (p) => {
    if (!confirm(`¿Eliminar la plantilla «${p.nombre}»? No se puede deshacer.`)) return
    const { error, count } = await supabase.from('plantillas').delete({ count: 'exact' }).eq('id', p.id)
    if (error || !count) { setErr(error?.message || 'No se ha podido eliminar la plantilla.'); return }
    await borrarArchivos((p.adjuntos || []).map((a) => a.path))
    await cargar()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <p className="text-sm text-slate-500 max-w-xl">
          Textos reutilizables para los correos a empresas. Se eligen en la caja de redacción de cada empresa y puedes retocarlos antes de enviar.
          Variables: {VARIABLES.map((v, i) => <Fragment key={v.id}>{i > 0 && ', '}<code className="text-xs bg-slate-100 rounded px-1 py-0.5" title={v.desc}>{`{{${v.id}}}`}</code></Fragment>)}.
        </p>
        <Btn onClick={() => setEdit('nueva')}><Plus className="w-4 h-4" />Nueva plantilla</Btn>
      </div>

      {err && <Aviso tono="error" icono={AlertCircle}>{err}</Aviso>}
      {lista === null ? <Cargando /> : lista.length === 0 ? (
        !err && <Vacio icono={FileText}>Todavía no hay plantillas. Crea la primera con «Nueva plantilla».</Vacio>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {lista.map((p) => (
            <div key={p.id} className="card p-4 flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-bold text-slate-900 truncate">{p.nombre}</h3>
                  <p className="text-xs text-slate-400">{autor(p)} · {fechaCorta(p.actualizado.slice(0, 10))}</p>
                </div>
                {puede(p) && (
                  <div className="flex gap-0.5 shrink-0">
                    <button onClick={() => setEdit(p)} title="Editar" aria-label={`Editar ${p.nombre}`} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"><Pencil className="w-4 h-4" /></button>
                    <button onClick={() => borrar(p)} title="Eliminar" aria-label={`Eliminar ${p.nombre}`} className="p-1.5 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="w-4 h-4" /></button>
                  </div>
                )}
              </div>
              {p.asunto && <p className="text-xs font-semibold text-slate-600 truncate">Asunto: {p.asunto}</p>}
              <p className="text-xs text-slate-500 whitespace-pre-line line-clamp-4 break-words">{htmlATexto(p.cuerpo)}</p>
              {p.adjuntos?.length > 0 && (
                <p className="flex items-center gap-1.5 text-xs text-slate-500 mt-auto pt-1" title={p.adjuntos.map((a) => a.nombre).join(', ')}>
                  <Paperclip className="w-3.5 h-3.5 text-slate-400 shrink-0" />{p.adjuntos.length} archivo{p.adjuntos.length !== 1 ? 's' : ''} adjunto{p.adjuntos.length !== 1 ? 's' : ''}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {edit && <PlantillaModal plantilla={edit === 'nueva' ? null : edit} me={me} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); cargar() }} />}
    </div>
  )
}

function PlantillaModal({ plantilla, me, onClose, onSaved }) {
  const [nombre, setNombre] = useState(plantilla?.nombre || '')
  const [asunto, setAsunto] = useState(plantilla?.asunto || '')
  const [cuerpo, setCuerpo] = useState(plantilla?.cuerpo || '')
  const [previa, setPrevia] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [err, setErr] = useState('')
  const [id] = useState(() => plantilla?.id || crypto.randomUUID()) // el id se fija antes de guardar: los archivos cuelgan de él
  const [adjuntos, setAdjuntos] = useState(plantilla?.adjuntos || [])
  const [subiendo, setSubiendo] = useState(false)
  const subidos = useRef([])   // archivos subidos en esta sesión: si se cancela, se borran
  const quitados = useRef([])  // archivos de la plantilla guardada que se han quitado: se borran al guardar
  const editor = useRef(null)
  const inputArchivos = useRef(null)
  const [aviso, setAviso] = useState('')
  const ejemplo = { empresa: { nombre: 'Ejemplo S.L.', contacto: 'Ana' }, yo: me.nombre }

  const cerrar = () => { borrarArchivos(subidos.current); onClose() }

  const adjuntar = async (e) => {
    const files = [...e.target.files]
    e.target.value = ''
    if (!files.length) return
    setErr('')
    const error = validarArchivos(adjuntos, files)
    if (error) { setErr(error); return }
    setSubiendo(true)
    try {
      for (const f of files) {
        const a = await subirArchivo(`plantillas/${id}`, f)
        subidos.current.push(a.path)
        setAdjuntos((l) => [...l, a])
      }
    } catch (ex) {
      setErr(ex.message)
    } finally {
      setSubiendo(false)
    }
  }

  const quitar = (a) => {
    setAdjuntos((l) => l.filter((x) => x.path !== a.path))
    if (subidos.current.includes(a.path)) { subidos.current = subidos.current.filter((x) => x !== a.path); borrarArchivos([a.path]) }
    else quitados.current.push(a.path)
  }

  const guardar = async () => {
    setErr('')
    if (!nombre.trim()) { setErr('Ponle un nombre a la plantilla.'); return }
    const html = limpiarHtml(cuerpo)
    if (htmlVacio(html)) { setErr('Escribe el mensaje.'); return }
    if (html.length > 100_000) { setErr('El mensaje es demasiado largo (máximo 100.000 caracteres de HTML).'); return }
    setGuardando(true)
    const datos = { nombre: nombre.trim(), asunto: asunto.trim(), cuerpo: html, adjuntos }
    const { error } = plantilla
      ? await supabase.from('plantillas').update({ ...datos, actualizado: new Date().toISOString() }).eq('id', plantilla.id)
      : await supabase.from('plantillas').insert({ ...datos, id, creado_por: me.id })
    setGuardando(false)
    if (error) { setErr(error.message); return }
    await borrarArchivos(quitados.current)
    onSaved()
  }

  return (
    <Modal onClose={cerrar} ancho="max-w-2xl">
      <ModalHead onClose={cerrar}>{plantilla ? 'Editar plantilla' : 'Nueva plantilla'}</ModalHead>
      <div className="p-6 space-y-4">
        <div>
          <Label>Nombre</Label>
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={80} placeholder="Ej.: Primer contacto, Seguimiento tras la llamada…" autoFocus />
        </div>
        <div>
          <Label>Asunto (opcional)</Label>
          <Input value={asunto} onChange={(e) => setAsunto(e.target.value.replace(/[\r\n]+/g, ' '))} maxLength={200} placeholder="IAESTE Málaga - Prácticas internacionales para {{empresa}}" />
        </div>
        <div>
          <div className="flex items-center justify-between gap-2 flex-wrap mb-1.5">
            <Label>Mensaje</Label>
            <button type="button" onClick={() => setPrevia((x) => !x)} className={`${chipPeriodo(previa)} -mt-1.5`}>Vista previa</button>
          </div>
          {previa ? (
            <div className="rounded-xl border border-slate-200 bg-white max-h-[60vh] overflow-y-auto">
              <p className="px-4 py-2 text-xs text-slate-400 border-b border-slate-100 bg-slate-50/70">Con datos de ejemplo (empresa «Ejemplo S.L.», contacto «Ana»).</p>
              {aplicarVariables(asunto, ejemplo).trim() && <p className="px-4 pt-3 text-sm font-semibold text-slate-800">Asunto: {aplicarVariables(asunto, ejemplo).trim()}</p>}
              <div className="correo-html px-4 py-3" dangerouslySetInnerHTML={{ __html: limpiarHtml(aplicarVariables(cuerpo, ejemplo, { html: true })) }} />
            </div>
          ) : (
            <EditorCorreo ref={editor} valor={cuerpo} onChange={setCuerpo} onAviso={setAviso} avisarImagenes alto="min-h-[18rem]"
              placeholder={'Buenos días {{contacto}},\n\nMi nombre es {{yo}} y …\n\nPuedes pegar tu firma de Gmail tal cual, o su código con el botón </>.'}
              extra={VARIABLES.map((v) => (
                <button key={v.id} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => editor.current?.insertar(`{{${v.id}}}`)}
                  title={`${v.desc}: se inserta donde esté el cursor`} className="px-2 py-1 rounded-md border border-slate-200 bg-white text-[11px] font-medium text-slate-600 hover:bg-slate-50">{`{{${v.id}}}`}</button>
              ))} />
          )}
          {aviso && <p className="mt-2 text-xs text-amber-700 flex items-start gap-1"><AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />{aviso}</p>}
          <div className="mt-3">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <Label>Archivos adjuntos</Label>
              <input ref={inputArchivos} type="file" multiple onChange={adjuntar} className="hidden" />
              <button type="button" onClick={() => inputArchivos.current?.click()} disabled={subiendo} className={`${miniBtn} -mt-1.5 disabled:opacity-60`}>
                <Paperclip className="w-3.5 h-3.5" />{subiendo ? 'Subiendo…' : 'Adjuntar archivo'}
              </button>
            </div>
            {adjuntos.length === 0 ? (
              <p className="text-xs text-slate-400">Ninguno. Los archivos de la plantilla (presentación, convenio…) se añaden solos al correo cuando alguien la elige, y puede quitarlos antes de enviar.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {adjuntos.map((a) => (
                  <span key={a.path} className="inline-flex items-center gap-1.5 max-w-full pl-2.5 pr-1 py-1 rounded-lg border border-slate-200 bg-slate-50 text-xs text-slate-700">
                    <Paperclip className="w-3 h-3 text-slate-400 shrink-0" /><span className="truncate">{a.nombre}</span>
                    <span className="text-slate-400 shrink-0">{formatoTamano(a.tamano)}</span>
                    <button type="button" onClick={() => quitar(a)} title="Quitar" aria-label={`Quitar ${a.nombre}`} className="p-0.5 rounded text-slate-400 hover:bg-slate-200 hover:text-slate-600"><X className="w-3 h-3" /></button>
                  </span>
                ))}
              </div>
            )}
          </div>
          <p className="text-[11px] text-slate-400 mt-3">El formato se conserva al enviar; las imágenes tienen que tener dirección web (como las de las firmas de Gmail). Si una variable no tiene valor (p. ej. la empresa no tiene contacto) se omite.</p>
        </div>
        {err && <Aviso tono="error" icono={AlertCircle}>{err}</Aviso>}
        <div className="flex justify-end gap-2">
          <Btn variant="ghost" onClick={cerrar}>Cancelar</Btn>
          <Btn onClick={guardar} disabled={guardando || subiendo}><Save className="w-4 h-4" />{guardando ? 'Guardando…' : 'Guardar'}</Btn>
        </div>
      </div>
    </Modal>
  )
}

// ---------- Equipo (solo admin) ----------
function Equipo({ users, companies, me, onChanged }) {
  const [err, setErr] = useState('')
  const [asignando, setAsignando] = useState('')
  const cuenta = (id) => companies.filter((c) => c.responsable === id).length
  const sinContactar = (id) => companies.filter((c) => c.responsable === id && c.estado === 'sin_contactar').length
  // Las prioritarias no entran en los lotes: solo se asignan a mano desde la ficha
  const libres = companies.filter((c) => !c.responsable && c.estado === 'sin_contactar' && !c.historica)

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

  // Quitar lote: devuelve al bote común hasta LOTE empresas que esa persona tenga
  // «Sin contactar». Las que ya tienen seguimiento y las prioritarias no se tocan.
  const quitables = (id) => companies.filter((c) => c.responsable === id && c.estado === 'sin_contactar' && !c.historica)
  const quitarLote = async (u) => {
    setErr('')
    const ids = quitables(u.id).slice(-LOTE).map((c) => c.id)
    if (ids.length === 0) {
      setErr(`${u.nombre} no tiene empresas «Sin contactar» que se le puedan quitar.`)
      return
    }
    if (!confirm(`¿Quitar ${ids.length} empresa${ids.length !== 1 ? 's' : ''} sin contactar a ${u.nombre}? Volverán al bote común.`)) return
    setAsignando(u.id)
    const { error } = await supabase
      .from('empresas')
      .update({ responsable: null, actualizado_por: me.nombre })
      .in('id', ids)
      .eq('estado', 'sin_contactar')
    setAsignando('')
    if (error) setErr(error.message)
    else onChanged()
  }

  const [passDe, setPassDe] = useState(null)   // usuario al que se le pone contraseña temporal
  const [passTmp, setPassTmp] = useState('')
  const [passOk, setPassOk] = useState('')
  const ponerTemporal = async () => {
    setErr(''); setPassOk('')
    { const prob = problemaPass(passTmp); if (prob) { setErr(prob); return } }
    const { error } = await supabase.rpc('admin_poner_contrasena', { p_usuario: passDe.id, p_contrasena: passTmp })
    if (error) { setErr(`No se ha podido cambiar: ${error.message}`); return }
    setPassOk(`Listo: ${passDe.nombre} ya puede entrar con «${passTmp}». Dile que la cambie con el icono de la llave, arriba a la derecha.`)
    setPassDe(null); setPassTmp('')
  }

  const [renombrando, setRenombrando] = useState(null) // usuario al que se le cambia el nombre
  const [nombreNuevo, setNombreNuevo] = useState('')
  const guardarNombre = async () => {
    const nombre = nombreNuevo.trim().replace(/\s+/g, ' ')
    if (!nombre) { setErr('El nombre no puede estar vacío.'); return }
    if (nombre !== renombrando.nombre) {
      const { error } = await supabase.from('profiles').update({ nombre }).eq('id', renombrando.id)
      if (error) { setErr(error.message); return }
      onChanged()
    }
    setErr(''); setRenombrando(null)
  }

  const cambiarRol = async (u, rol) => {
    setErr('')
    const { error } = await supabase.from('profiles').update({ rol }).eq('id', u.id)
    if (error) setErr(error.message)
    else onChanged()
  }

  const cambiarCentro = async (u, centro) => {
    setErr('')
    const { error } = await supabase.from('profiles').update({ centro: centro || null }).eq('id', u.id)
    if (error) setErr(error.message)
    else onChanged()
  }
  const sinCentro = users.filter((u) => !u.centro).length

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {sinCentro > 0 && (
        <Aviso tono="warn" icono={AlertTriangle}>
          {sinCentro} persona{sinCentro !== 1 ? 's' : ''} sin centro. Elígelo en el desplegable junto a su nombre:
          hace falta para la clasificación de Puntuación.
        </Aviso>
      )}
      <Aviso tono="info" icono={UserPlus}>
        Para incorporar a alguien: pídele que se <strong>registre</strong> en esta misma página. Aparecerá aquí
        como miembro y podrás asignarle empresas o hacerle admin. Si alguien olvida su contraseña,
        pulsa la llave junto a su nombre para ponerle una temporal. Para eliminar cuentas, usa el panel de Supabase (Authentication → Users).
      </Aviso>
      {err && <Aviso tono="error" icono={AlertCircle}>{err}</Aviso>}
      {passOk && <Aviso tono="ok">{passOk}</Aviso>}

      <GraficaEmpresas users={users} companies={companies} />

      <Actividad users={users} companies={companies} />

      <p className="text-xs text-slate-500 px-1">
        Bote común: <strong>{libres.length}</strong> empresas sin asignar en estado «Sin contactar» (sin contar las prioritarias, que se asignan a mano desde su ficha).
        El botón <strong>+{LOTE}</strong> reparte las {LOTE} primeras a esa persona y <strong>−{LOTE}</strong> le quita {LOTE} de las que aún tiene sin contactar (vuelven al bote).
      </p>

      <div className="card overflow-hidden">
        {users.map((u) => (
          <div key={u.id} className="flex items-center justify-between gap-3 flex-wrap px-5 sm:px-6 py-4 border-b border-slate-100 last:border-0 hover:bg-slate-50/50 transition-colors">
            <div className="flex items-center gap-3">
              <Avatar nombre={u.nombre} size="lg" />
              <div>
                <p className="text-sm font-medium text-slate-900 flex items-center gap-1.5">
                  {u.nombre}
                  <button onClick={() => { setRenombrando(u); setNombreNuevo(u.nombre); setErr('') }} title="Cambiar nombre" aria-label={`Cambiar el nombre de ${u.nombre}`}
                    className="p-0.5 rounded text-slate-300 hover:text-slate-600 hover:bg-slate-100"><Pencil className="w-3 h-3" /></button>
                  {u.rol === 'admin' && <Shield className="w-3.5 h-3.5 text-brand-500" />}
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
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50/80'
                }`}
              >
                <UserPlus className="w-3.5 h-3.5" />+{LOTE}
              </button>
              <button
                onClick={() => quitarLote(u)}
                disabled={asignando === u.id || quitables(u.id).length === 0}
                title={`Quitarle ${LOTE} empresas sin contactar y devolverlas al bote común`}
                className="px-2.5 py-1.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50/80 text-xs font-medium inline-flex items-center gap-1 disabled:opacity-40"
              >
                <UserMinus className="w-3.5 h-3.5" />−{LOTE}
              </button>
              {u.id !== me.id && (
                <button onClick={() => { setPassDe(u); setPassTmp(''); setPassOk('') }} title="Ponerle una contraseña temporal"
                  className="p-1.5 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50/80">
                  <KeyRound className="w-3.5 h-3.5" />
                </button>
              )}
            <select
              value={u.centro || ''}
              onChange={(e) => cambiarCentro(u, e.target.value)}
              title="Centro al que pertenece"
              className={`px-3 py-1.5 rounded-xl border text-sm bg-white ${u.centro ? 'border-slate-200' : 'border-amber-300 bg-amber-50 text-amber-800'}`}
            >
              <option value="">Sin centro</option>
              {CENTROS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select
              value={u.rol}
              onChange={(e) => cambiarRol(u, e.target.value)}
              disabled={u.id === me.id}
              className="px-3 py-1.5 rounded-xl border border-slate-200 text-sm bg-white disabled:opacity-50"
            >
              <option value="miembro">Miembro</option>
              <option value="admin">Admin</option>
            </select>
            </div>
          </div>
        ))}
      </div>

      {renombrando && (
        <Modal ancho="max-w-sm" onClose={() => setRenombrando(null)}>
          <div className="p-6 space-y-3">
            <h2 className="font-bold text-slate-900">Cambiar nombre</h2>
            <p className="text-xs text-slate-500">Se cambia en el CRM y en la clasificación. El historial antiguo conserva el nombre que tenía entonces.</p>
            <Input value={nombreNuevo} autoFocus maxLength={80} onChange={(e) => setNombreNuevo(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && guardarNombre()} />
            <div className="flex gap-2 justify-end">
              <Btn variant="ghost" onClick={() => setRenombrando(null)}>Cancelar</Btn>
              <Btn onClick={guardarNombre}>Guardar</Btn>
            </div>
          </div>
        </Modal>
      )}

      {passDe && (
        <Modal ancho="max-w-sm" onClose={() => setPassDe(null)}>
          <div className="p-6 space-y-3">
            <h2 className="font-bold text-slate-900">Contraseña temporal para {passDe.nombre}</h2>
            <p className="text-xs text-slate-500">Su contraseña actual dejará de valer. Pásale la temporal por privado y pídele que la cambie al entrar.</p>
            <Input value={passTmp} autoFocus onChange={(e) => setPassTmp(e.target.value)} placeholder={`Mínimo ${PASS_MIN} caracteres, con letras y números`} onKeyDown={(e) => e.key === 'Enter' && ponerTemporal()} />
            <div className="flex gap-2 justify-end">
              <Btn variant="ghost" onClick={() => setPassDe(null)}>Cancelar</Btn>
              <Btn onClick={ponerTemporal}>Cambiar contraseña</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ---------- Seguimiento (solo admin): últimos cambios del CRM ----------
// Sale del historial, así que cada entrada conserva la nota que se escribió EN ESE MOMENTO:
// aunque la empresa cambie luego de estado o tenga notas nuevas, lo ya escrito no cambia.
function Seguimiento({ users, companies, version, onAbrir }) {
  const [dias, setDias] = useState(7)
  const [persona, setPersona] = useState('')
  const [tipo, setTipo] = useState('seguimientos') // 'seguimientos' (notas y estados) | 'todo'
  const [busca, setBusca] = useState('')
  const [filas, setFilas] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    setFilas(null); setErr('')
    traerTodo(() => supabase
      .from('historial')
      .select('id, empresa_id, usuario_id, usuario_nombre, empresa_nombre, accion, detalle, estado_anterior, estado_nuevo, creado')
      .gte('creado', sumarDias(-dias) + 'T00:00:00')
      .order('creado', { ascending: false })
      .order('id', { ascending: false }))
      .then(setFilas)
      .catch((e) => { setErr(e.message); setFilas([]) })
  }, [dias, version])

  // Un cambio de estado y su nota se guardan como dos filas con la misma clave: se juntan en una
  const entradas = (() => {
    if (!filas) return []
    const notaDe = new Map(filas.filter((h) => h.accion === 'nota').map((h) => [claveSeg(h), h]))
    const conEstado = new Set(filas.filter((h) => h.accion === 'estado').map(claveSeg))
    const out = []
    for (const h of filas) {
      if (h.accion === 'estado') out.push({ ...h, texto: notaDe.get(claveSeg(h))?.detalle || '' })
      else if (h.accion === 'nota') { if (!conEstado.has(claveSeg(h))) out.push({ ...h, texto: h.detalle }) }
      else out.push(h)
    }
    const q = busca.trim().toLowerCase()
    return out
      .filter((h) => tipo === 'todo' || h.accion === 'estado' || h.accion === 'nota')
      .filter((h) => !persona || h.usuario_id === persona)
      .filter((h) => !q || (h.empresa_nombre || '').toLowerCase().includes(q) || (h.texto || '').toLowerCase().includes(q))
  })()

  // Agrupadas por día
  const porDia = []
  for (const h of entradas) {
    const d = isoDia(new Date(h.creado))
    if (!porDia.length || porDia[porDia.length - 1].dia !== d) porDia.push({ dia: d, items: [] })
    porDia[porDia.length - 1].items.push(h)
  }
  const tituloDia = (d) => d === HOY() ? 'Hoy' : d === sumarDias(-1) ? 'Ayer'
    : new Date(d + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
  const hora = (iso) => new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  const empresaDe = (id) => companies.find((c) => c.id === id)

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="card p-5">
        <h2 className="font-bold text-slate-900 flex items-center gap-1.5 mb-3">
          <History className="w-4 h-4 text-slate-400" />Últimos cambios del CRM
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {[[1, 'Hoy y ayer'], [7, '7 días'], [30, '30 días']].map(([n, label]) => (
            <button key={n} onClick={() => setDias(n)}
              className={chipPeriodo(dias === n)}>
              {label}
            </button>
          ))}
          <span className="w-px h-5 bg-slate-200 mx-1" />
          <select value={persona} onChange={(e) => setPersona(e.target.value)}
            className="px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs bg-white">
            <option value="">Todo el equipo</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
          </select>
          <select value={tipo} onChange={(e) => setTipo(e.target.value)}
            className="px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs bg-white">
            <option value="seguimientos">Notas y cambios de estado</option>
            <option value="todo">Todos los movimientos</option>
          </select>
          <div className="relative flex-1 min-w-[10rem]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar empresa o nota…"
              className="w-full pl-8 pr-2.5 py-1.5 rounded-xl border border-slate-200 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/25" />
          </div>
        </div>
      </div>

      {err && <Aviso tono="error" icono={AlertCircle}>{err}</Aviso>}
      {filas === null ? (
        <Cargando />
      ) : porDia.length === 0 ? (
        <Vacio icono={History}>No hay cambios en este periodo.</Vacio>
      ) : porDia.map(({ dia, items }) => (
        <div key={dia}>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide px-1 mb-2 first-letter:uppercase">
            {tituloDia(dia)} <span className="text-slate-400 font-normal normal-case">· {items.length}</span>
          </p>
          <ol className="card divide-y divide-slate-100 overflow-hidden">
            {items.map((h) => {
              const emp = empresaDe(h.empresa_id)
              return (
                <li key={h.id} className="px-4 py-3 text-sm">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-xs text-slate-400 tabular-nums w-10 shrink-0">{hora(h.creado)}</span>
                    {emp ? (
                      <button onClick={() => onAbrir(emp)} className="font-semibold text-slate-900 hover:underline text-left">{h.empresa_nombre || emp.nombre}</button>
                    ) : (
                      <span className="font-semibold text-slate-400 line-through" title="Empresa eliminada">{h.empresa_nombre || '(empresa eliminada)'}</span>
                    )}
                    {h.accion === 'estado' && h.estado_nuevo ? (
                      <span className={`px-1.5 py-0.5 rounded border text-xs font-medium ${estadoDe(h.estado_nuevo).color}`}>
                        {h.estado_anterior ? `${estadoDe(h.estado_anterior).label} → ` : ''}{estadoDe(h.estado_nuevo).label}
                      </span>
                    ) : (
                      <span className={`px-1.5 py-0.5 rounded border text-xs font-medium ${accionDe(h.accion).color}`}>{accionDe(h.accion).label}</span>
                    )}
                    <span className="text-xs text-slate-500 ml-auto">{h.usuario_nombre}</span>
                  </div>
                  {(h.accion === 'estado' || h.accion === 'nota') ? (
                    h.texto
                      ? <p className="mt-1 pl-12 text-slate-700 whitespace-pre-wrap break-words">{h.texto}</p>
                      : <p className="mt-1 pl-12 text-xs text-slate-400 italic">Sin nota</p>
                  ) : h.detalle ? (
                    <p className="mt-1 pl-12 text-xs text-slate-600 break-words">{detalleLegible(h)}</p>
                  ) : null}
                </li>
              )
            })}
          </ol>
        </div>
      ))}
    </div>
  )
}

// ---------- Exportar empresas a CSV (se abre en Excel) ----------
function exportarEmpresas(lista, nombreDe) {
  const cab = ['Empresa', 'CIF', 'Sector', 'Contacto', 'Telefono', 'Email', 'Direccion', 'Practicas', 'Estado', 'Responsable', 'Proximo contacto', 'Notas']
  const filas = lista.map((c) => [
    c.nombre, c.cif || '', c.sector || '', c.contacto || '', c.telefono || '', c.email || '', c.direccion || '', textoPracticas(c.practicas),
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
  a.download = `empresas-iaeste-${HOY()}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ---------- App ----------
// Logo de la cabecera: public/logo-iaeste.png (logotipo blanco de IAESTE con el texto incluido).
// Si no se encuentra el archivo, se muestra un icono y el texto «IAESTE» de reserva.
function LogoIaeste() {
  const [falla, setFalla] = useState(false)
  if (falla) {
    return (
      <>
        <div className="w-8 h-8 rounded-full border border-white/40 flex items-center justify-center shrink-0">
          <Building2 className="w-4 h-4 text-white" />
        </div>
        <span className="text-base sm:text-lg tracking-[0.12em] font-light">IAESTE</span>
      </>
    )
  }
  return <img src="/logo-iaeste.png" alt="IAESTE" onError={() => setFalla(true)} className="h-8 sm:h-9 w-auto shrink-0 select-none" draggable={false} />
}

export default function App() {
  const [session, setSession] = useState(undefined) // undefined = cargando
  const [me, setMe] = useState(null)
  const [users, setUsers] = useState([])
  const [companies, setCompanies] = useState([])
  const [tab, setTab] = useState('empresas')
  const [busca, setBusca] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')
  const [grupo, setGrupo] = useState('activo')
  const [filtroPersona, setFiltroPersona] = useState('') // '' | '__sin' | id de usuario
  const [selec, setSelec] = useState([])                   // empresas marcadas para asignar (admin)
  const [asignarA, setAsignarA] = useState('')
  const [asignando, setAsignando] = useState(false)
  const [agenda, setAgenda] = useState('') // '' | 'hoy' | 'atrasadas'
  const [modal, setModal] = useState(null) // null | 'nueva' | empresa
  const [aviso, setAviso] = useState('')
  const [cambiarPass, setCambiarPass] = useState('') // '' | 'normal' | 'recuperacion'
  const [movidas, setMovidas] = useState(null) // ids de empresas con nota o cambio de estado en los últimos SIN_MOVER.dias
  const [errorCarga, setErrorCarga] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null))
    const { data: sub } = supabase.auth.onAuthStateChange((evento, s) => {
      setSession(s)
      // Al entrar desde el enlace del correo de recuperación, se pide la contraseña nueva
      if (evento === 'PASSWORD_RECOVERY') setCambiarPass('recuperacion')
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const cargar = useCallback(async () => {
    if (!session) return
    try {
      // Empresas y prácticas paginadas: con más de 1000 filas Supabase cortaría la lista sin avisar
      const [perfiles, emps, pracs] = await Promise.all([
        traerTodo(() => supabase.from('profiles').select('*').order('nombre').order('id')),
        traerTodo(() => supabase.from('empresas').select('*').order('nombre').order('id')),
        traerTodo(() => supabase.from('practicas').select('*').order('anio').order('id')),
      ])
      const porEmpresa = {}
      for (const p of pracs) (porEmpresa[p.empresa_id] ||= []).push(p)
      setUsers(perfiles)
      setCompanies(emps.map((c) => ({ ...c, practicas: porEmpresa[c.id] || [] })))
      setMe(perfiles.find((p) => p.id === session.user.id) || null)
      setErrorCarga('')
      return emps
    } catch (e) {
      setErrorCarga(e.message || 'No se ha podido conectar con la base de datos.')
    }
  }, [session])

  useEffect(() => { cargar() }, [cargar])

  // Para el aviso «Realizar seguimiento»: qué empresas han tenido nota o cambio de estado hace poco.
  // Se vuelve a calcular cada vez que cambian las empresas (al guardar una ficha, etc.).
  const claveEmpresas = companies.map((c) => `${c.id}:${c.estado}:${c.actualizado || ''}`).join('|')
  useEffect(() => {
    if (!session) return
    let vivo = true
    const desde = new Date(Date.now() - SIN_MOVER.dias * 864e5).toISOString()
    traerTodo(() => supabase
      .from('historial')
      .select('id, empresa_id')
      .in('accion', ['nota', 'estado'])
      .gte('creado', desde)
      .order('id'))
      .then((filas) => vivo && setMovidas(new Set(filas.map((h) => h.empresa_id))))
      .catch(() => vivo && setMovidas(null))
    return () => { vivo = false }
  }, [session, claveEmpresas])

  const flash = (m, ms = 2500) => { setAviso(m); setTimeout(() => setAviso(''), ms) }

  // Asignación rápida (admin): filtra «Sin asignar», marca empresas y asígnalas de golpe
  const marcar = (id) => setSelec((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  const asignarSeleccion = async () => {
    if (!selec.length || !asignarA) return
    setAsignando(true)
    const quien = users.find((u) => u.id === asignarA)?.nombre || ''
    const { error } = await supabase.from('empresas')
      .update({ responsable: asignarA, actualizado_por: me?.nombre })
      .in('id', selec)
    setAsignando(false)
    if (error) { flash(`No se ha podido asignar: ${error.message}`, 6000); return }
    flash(`${selec.length} empresa${selec.length !== 1 ? 's' : ''} asignada${selec.length !== 1 ? 's' : ''} a ${quien} ✓`, 4000)
    setSelec([])
    cargar()
  }

  if (session === undefined) {
    return <div className="min-h-screen bg-surface flex items-center justify-center"><Cargando /></div>
  }
  if (!session) return <Auth />
  if (!me) {
    return (
      <div className="min-h-screen bg-surface flex flex-col items-center justify-center gap-3 p-4 text-sm text-center">
        {errorCarga ? (
          <>
            <Aviso tono="error" icono={AlertCircle}>No se han podido cargar los datos: {errorCarga}</Aviso>
            <Btn onClick={cargar}>Reintentar</Btn>
          </>
        ) : <Cargando texto="Preparando tu perfil…" />}
        <button onClick={() => supabase.auth.signOut()} className="text-xs text-slate-500 hover:underline">Salir</button>
      </div>
    )
  }

  const isAdmin = me.rol === 'admin'
  const nombreDe = (id) => users.find((u) => u.id === id)?.nombre || 'Sin asignar'

  const hoy = HOY()
  const misSinContactar = companies.filter((c) => c.responsable === me.id && c.estado === 'sin_contactar').length
  // Recordatorios: un miembro solo cuenta los de sus empresas
  const deAgenda = isAdmin ? companies : companies.filter((c) => c.responsable === me.id)
  const nAtrasadas = deAgenda.filter((c) => c.proximo_contacto && c.proximo_contacto < hoy).length
  const nHoy = deAgenda.filter((c) => c.proximo_contacto === hoy).length
  // Empresas en seguimiento sin nota ni cambio de estado en SIN_MOVER.dias (y sin próximo contacto a futuro)
  const sinMover = (c) => !!movidas && !!c.responsable && SIN_MOVER.estados.includes(c.estado) &&
    !(c.proximo_contacto && c.proximo_contacto > hoy) && !movidas.has(c.id) && (isAdmin || c.responsable === me.id)
  const nSinMover = deAgenda.filter(sinMover).length

  // Los miembros ven Disponibles / Seguimiento / Cerradas (solo las suyas) y Todas (todas, en solo lectura)
  const gruposVisibles = GRUPOS.filter((g) => isAdmin || !g.soloAdmin)
  const grupoEf = gruposVisibles.some((g) => g.id === grupo) ? grupo : gruposVisibles[0].id
  const modoAsignar = isAdmin && filtroPersona === '__sin'
  const visibles = companies
    .filter((c) => {
      if (agenda && !isAdmin && c.responsable !== me.id) return false
      if (agenda === 'hoy') return c.proximo_contacto && c.proximo_contacto <= hoy
      if (agenda === 'atrasadas') return c.proximo_contacto && c.proximo_contacto < hoy
      if (agenda === 'seguimiento') return sinMover(c)
      return true
    })
    // Con «Para hoy» / «Atrasadas» activo se ven todas las que tocan, sea cual sea el apartado
    .filter((c) => agenda || enGrupo(grupoDe(grupoEf), c, me.id, isAdmin))
    .filter((c) => !filtroEstado || c.estado === filtroEstado)
    .filter((c) => !filtroPersona || (filtroPersona === '__sin' ? !c.responsable : c.responsable === filtroPersona))
    .filter((c) => {
      const q = busca.toLowerCase()
      if (!q) return true
      const qCif = cifNorm(q)
      return [c.nombre, c.contacto, c.sector, c.cif, c.direccion, c.email, c.responsable ? nombreDe(c.responsable) : '']
        .some((v) => (v || '').toLowerCase().includes(q)) || (qCif.length >= 4 && cifNorm(c.cif).includes(qCif))
    })

  const NAV = [
    ['empresas', 'Empresas', Building2],
    ['plantillas', 'Plantillas', FileText],
    ['puntuacion', 'Puntos', Trophy],
    ...(isAdmin ? [['seguimiento', 'Seguimiento', History], ['equipo', 'Equipo', Users]] : []),
    ['guia', 'Guía', BookOpen],
  ]
  const TITULOS = {
    empresas: ['Empresas', isAdmin ? 'Todas las empresas del equipo' : 'Tus empresas y las del equipo'],
    plantillas: ['Plantillas', 'Textos para los correos a empresas'],
    guia: ['Guía de uso', 'Cómo trabajar con el CRM paso a paso'],
    seguimiento: ['Seguimiento', 'Últimos cambios y notas del equipo'],
    equipo: ['Equipo', 'Personas, reparto de empresas y puntos'],
    puntuacion: ['Puntuación', 'Tus puntos de la campaña y la clasificación del equipo'],
  }
  const [titulo, subtitulo] = TITULOS[tab] || TITULOS.empresas
  const mias = companies.filter((c) => c.responsable === me.id)
  const stats = [
    ['Mis empresas', mias.length, Building2, 'text-brand-600 bg-brand-50'],
    ['Sin contactar', misSinContactar, Inbox, 'text-slate-600 bg-slate-100'],
    ['En seguimiento', mias.filter((c) => grupoDe('activo').estados.includes(c.estado)).length, Send, 'text-amber-600 bg-amber-50'],
    ['Prácticas conseguidas', mias.filter((c) => c.estado === 'beca').length, Trophy, 'text-emerald-600 bg-emerald-50'],
  ]
  const botonesUsuario = (
    <>
      <button onClick={() => setCambiarPass('normal')} title="Cambiar mi contraseña" aria-label="Cambiar mi contraseña"
        className="p-2 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition">
        <KeyRound className="w-4 h-4" />
      </button>
      <button onClick={() => supabase.auth.signOut()} title="Salir" aria-label="Salir"
        className="p-2 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition">
        <LogOut className="w-4 h-4" />
      </button>
    </>
  )

  return (
    <div className="min-h-screen bg-surface">
      {/* Barra lateral (escritorio) */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-64 flex-col bg-brand-900 text-white z-40">
        <div className="px-6 pt-7 pb-6 border-b border-white/10">
          <div className="flex items-center gap-2.5"><LogoIaeste /></div>
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">Málaga · CRM</p>
        </div>
        <nav className="flex-1 px-3 py-5 space-y-1">
          {NAV.map(([id, label, Icono]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition ${tab === id ? 'bg-white text-brand-900 shadow-nav' : 'text-white/70 hover:text-white hover:bg-white/10'}`}>
              <Icono className="w-[18px] h-[18px]" />{label}
              {id === 'empresas' && (nHoy + nAtrasadas + nSinMover) > 0 && (
                <span className="ml-auto text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-rose-500 text-white">{nHoy + nAtrasadas + nSinMover}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="m-3 p-3 rounded-2xl bg-white/[0.06] flex items-center gap-3">
          <Avatar nombre={me.nombre} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold truncate">{me.nombre}</p>
            <p className="text-[11px] text-white/50 flex items-center gap-1">{isAdmin && <Shield className="w-3 h-3" />}{isAdmin ? 'Administrador' : 'Miembro'}</p>
          </div>
          {botonesUsuario}
        </div>
      </aside>

      {/* Barra superior (móvil) */}
      <header className="lg:hidden bg-brand-900 text-white sticky top-0 z-40 shadow-nav">
        <div className="px-4 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5"><LogoIaeste /></div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-white/70 mr-1 truncate max-w-[8rem]">{me.nombre}</span>
            {botonesUsuario}
          </div>
        </div>
      </header>

      {/* Navegación inferior (móvil) */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-slate-200 grid pb-[env(safe-area-inset-bottom)]"
        style={{ gridTemplateColumns: `repeat(${NAV.length}, minmax(0, 1fr))` }}>
        {NAV.map(([id, label, Icono]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`relative flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold transition ${tab === id ? 'text-brand-700' : 'text-slate-400 hover:text-slate-600'}`}>
            {tab === id && <span className="absolute top-0 h-0.5 w-8 rounded-full bg-brand-600" />}
            <Icono className="w-5 h-5" />{label}
          </button>
        ))}
      </nav>

      <main className="lg:pl-64">
        <div className="max-w-5xl mx-auto px-4 sm:px-8 pt-6 lg:pt-10 pb-28 lg:pb-12">
          <div className="mb-6 flex items-end justify-between gap-3 flex-wrap">
            <div>
              <h1 className="text-2xl sm:text-[28px] font-extrabold tracking-tight text-slate-900">{titulo}</h1>
              <p className="text-sm text-slate-500 mt-0.5">{subtitulo}</p>
            </div>
            {tab === 'empresas' && (
              <Btn onClick={() => setModal('nueva')}><Plus className="w-4 h-4" />Nueva empresa</Btn>
            )}
          </div>
          {errorCarga && (
            <Aviso tono="error" icono={AlertCircle} className="mb-4">
              <span className="flex items-center gap-3">
                <span className="flex-1">No se han podido actualizar los datos: {errorCarga}</span>
                <button onClick={cargar} className="text-xs font-semibold hover:underline">Reintentar</button>
              </span>
            </Aviso>
          )}
        {tab === 'guia' ? (
          <Guia isAdmin={isAdmin} />
        ) : tab === 'plantillas' ? (
          <Plantillas users={users} me={me} isAdmin={isAdmin} />
        ) : tab === 'puntuacion' ? (
          <Puntuacion users={users} me={me} isAdmin={isAdmin} />
        ) : tab === 'seguimiento' && isAdmin ? (
          <Seguimiento users={users} companies={companies} version={claveEmpresas} onAbrir={setModal} />
        ) : tab === 'equipo' && isAdmin ? (
          <Equipo users={users} companies={companies} me={me} onChanged={cargar} />
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
              {stats.map(([label, n, Icono, tono]) => (
                <div key={label} className="card px-4 py-3.5 flex items-center gap-3">
                  <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${tono}`}><Icono className="w-5 h-5" /></span>
                  <div className="min-w-0">
                    <p className="text-2xl font-extrabold leading-none tabular-nums text-slate-900">{n}</p>
                    <p className="text-xs text-slate-500 mt-1 leading-tight">{label}</p>
                  </div>
                </div>
              ))}
            </div>

            {misSinContactar === 0 ? (
              <Aviso tono="warn" icono={Inbox} className="mb-4">
                <strong>No te queda ninguna empresa sin contactar.</strong>{' '}
                {isAdmin
                  ? `Asígnate ${LOTE} más desde la pestaña Equipo.`
                  : `Pídele a un admin que te asigne ${LOTE} más.`}
              </Aviso>
            ) : misSinContactar <= AVISO_POCAS && (
              <Aviso tono="neutral" icono={Inbox} className="mb-4">
                Te quedan <strong>{misSinContactar}</strong> empresas sin contactar. Ve pidiendo el siguiente lote.
              </Aviso>
            )}
            {(nHoy + nAtrasadas + nSinMover) > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {nSinMover > 0 && (
                  <button
                    onClick={() => setAgenda(agenda === 'seguimiento' ? '' : 'seguimiento')}
                    title={`Empresas en seguimiento sin ninguna nota ni cambio de estado en ${SIN_MOVER.dias} días`}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border inline-flex items-center gap-1.5 transition ${
                      agenda === 'seguimiento' ? 'bg-orange-600 text-white border-orange-600' : 'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100'
                    }`}
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />Realizar seguimiento · {nSinMover}
                  </button>
                )}
                {(nHoy + nAtrasadas) > 0 && <button
                  onClick={() => setAgenda(agenda === 'hoy' ? '' : 'hoy')}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border inline-flex items-center gap-1.5 transition ${
                    agenda === 'hoy' ? 'bg-brand-600 text-white border-brand-600' : 'bg-brand-50 text-brand-700 border-brand-200 hover:bg-brand-100'
                  }`}
                >
                  <CalendarClock className="w-3.5 h-3.5" />Para hoy · {nHoy + nAtrasadas}
                </button>}
                {nAtrasadas > 0 && (
                  <button
                    onClick={() => setAgenda(agenda === 'atrasadas' ? '' : 'atrasadas')}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition ${
                      agenda === 'atrasadas' ? 'bg-rose-600 text-white border-rose-600' : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                    }`}
                  >
                    Atrasadas · {nAtrasadas}
                  </button>
                )}
                {agenda && (
                  <button onClick={() => setAgenda('')} className="px-3 py-1.5 rounded-full text-xs font-medium text-slate-500 hover:bg-slate-200/60">
                    Ver todas
                  </button>
                )}
              </div>
            )}

            <div className="card p-1.5 flex gap-1 overflow-x-auto no-scrollbar mb-4">
              {gruposVisibles.map((g) => {
                const n = companies.filter((c) => enGrupo(g, c, me.id, isAdmin)).length
                const on = grupoEf === g.id
                return (
                  <button
                    key={g.id}
                    onClick={() => { setGrupo(g.id); setFiltroEstado('') }}
                    className={`flex-1 shrink-0 whitespace-nowrap px-4 py-2 rounded-xl text-sm transition ${
                      on ? 'bg-brand-900 text-white font-semibold shadow-nav' : 'text-slate-600 font-medium hover:bg-slate-100'
                    }`}
                  >
                    {g.label} <span className={`ml-1 text-xs tabular-nums ${on ? 'text-white/60' : 'text-slate-400'}`}>{n}</span>
                  </button>
                )
              })}
            </div>

            {(() => {
              const g = grupoDe(grupoEf)
              // A los miembros no se les ponen filtros de estado en «Todas», para no saturar
              if (!isAdmin && g.id === 'todas') return <div className="mb-2" />
              const delGrupo = companies.filter((c) => enGrupo(g, c, me.id, isAdmin))
              const chips = ESTADOS.filter((e) => ((g.historicas || !isAdmin) ? delGrupo.some((c) => c.estado === e.id) : (!g.estados || g.estados.includes(e.id))))
              if (chips.length < 2) return <div className="mb-2" />
              const total = delGrupo.length
              return (
                <div className="flex gap-2 mb-5 overflow-x-auto no-scrollbar sm:flex-wrap pb-0.5">
                  <button
                    onClick={() => setFiltroEstado('')}
                    className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition ${!filtroEstado ? 'bg-brand-900 text-white border-brand-900' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                  >
                    Todas · {total}
                  </button>
                  {chips.filter((e) => !e.oculto || delGrupo.some((c) => c.estado === e.id)).map((e) => {
                    const n = delGrupo.filter((c) => c.estado === e.id).length
                    return (
                      <button
                        key={e.id}
                        onClick={() => setFiltroEstado(filtroEstado === e.id ? '' : e.id)}
                        className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                          filtroEstado === e.id ? `${e.color} ring-2 ring-brand-900 ring-offset-1` : 'bg-white text-slate-500 border-slate-200 hover:border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${e.dot}`} />
                        {e.label} · {n}
                      </button>
                    )
                  })}
                </div>
              )
            })()}

            <div className="flex flex-wrap sm:flex-nowrap gap-2 mb-4">
              <div className="relative flex-1 basis-full sm:basis-auto">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar empresa, CIF, contacto, sector o responsable…" className="pl-10" />
              </div>
              {isAdmin && (
                <>
                  <select
                    value={filtroPersona}
                    onChange={(e) => { setFiltroPersona(e.target.value); setSelec([]) }}
                    className="px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm bg-white flex-1 sm:flex-none"
                  >
                    <option value="">Todo el equipo</option>
                    <option value="__sin">Sin asignar ({companies.filter((c) => !c.responsable).length})</option>
                    {users.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                  </select>
                  <button
                    onClick={() => exportarEmpresas(visibles, nombreDe)}
                    title="Exportar a Excel"
                    className="px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-600 hover:bg-slate-50 inline-flex items-center gap-1.5 transition"
                  >
                    <FileSpreadsheet className="w-4 h-4" /><span className="hidden lg:inline">Exportar</span>
                  </button>
                </>
              )}
            </div>

            {visibles.length === 0 ? (
              <Vacio icono={companies.length === 0 ? Building2 : Search}>
                {companies.length === 0
                  ? isAdmin
                    ? 'Todavía no hay empresas. Añade la primera con el botón «Nueva empresa».'
                    : 'No tienes empresas asignadas todavía. Puedes añadir una con el botón «Nueva empresa».'
                  : 'Ninguna empresa coincide con el filtro.'}
              </Vacio>
            ) : (
              <>
              {modoAsignar && (
                <div className="sticky top-16 lg:top-4 z-30 mb-3 flex flex-wrap items-center gap-2 rounded-2xl bg-brand-900 text-white px-4 py-3 shadow-nav">
                  <span className="text-sm font-semibold">{selec.length} seleccionada{selec.length !== 1 ? 's' : ''}</span>
                  <button onClick={() => setSelec(visibles.slice(0, LOTE).map((c) => c.id))}
                    className="px-2.5 py-1 rounded-full text-xs bg-white/10 hover:bg-white/20">Marcar {LOTE} primeras</button>
                  {selec.length > 0 && (
                    <button onClick={() => setSelec([])} className="px-2.5 py-1 rounded-full text-xs bg-white/10 hover:bg-white/20">Quitar marcas</button>
                  )}
                  <span className="flex-1" />
                  <select value={asignarA} onChange={(e) => setAsignarA(e.target.value)}
                    className="px-3 py-1.5 rounded-full text-sm text-slate-900 bg-white">
                    <option value="">Asignar a…</option>
                    {users.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                  </select>
                  <button onClick={asignarSeleccion} disabled={!selec.length || !asignarA || asignando}
                    className="px-4 py-1.5 rounded-full text-sm font-bold bg-white text-brand-900 disabled:opacity-40">
                    {asignando ? 'Asignando…' : 'Asignar'}
                  </button>
                </div>
              )}
              <div className="card overflow-hidden divide-y divide-slate-100">
                {visibles.map((c) => (
                  <div key={c.id} className={`flex items-stretch ${selec.includes(c.id) ? 'bg-brand-50/70' : ''}`}>
                  {modoAsignar && (
                    <label className="flex items-center pl-4 pr-1 cursor-pointer">
                      <input type="checkbox" checked={selec.includes(c.id)} onChange={() => marcar(c.id)}
                        className="w-4 h-4 accent-brand-900" />
                    </label>
                  )}
                  <button
                    onClick={() => setModal(c)}
                    className={`group w-full flex items-center gap-3.5 px-4 sm:px-5 py-3.5 text-left transition-colors ${
                      c.historica ? 'bg-amber-50/60 hover:bg-amber-50 border-l-4 border-l-amber-400' : 'hover:bg-slate-50/80'
                    }`}
                  >
                    <span className="hidden sm:flex w-11 h-11 rounded-xl bg-slate-100 text-slate-500 group-hover:bg-brand-50 group-hover:text-brand-600 transition items-center justify-center font-bold shrink-0">
                      {(c.nombre || '?').trim().charAt(0).toUpperCase()}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-900 truncate flex items-center gap-2">
                        <span className="truncate">{c.nombre}</span>
                        {c.historica && (
                          <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300 text-[11px] font-semibold"
                            title={`Nos dio prácticas en ${textoPracticas(c.practicas)}`}>
                            <Star className="w-3 h-3 fill-amber-500 text-amber-500" />Prioritaria{c.practicas?.length ? ` · ${aniosPracticas(c.practicas)}` : ''}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-slate-500 truncate mt-0.5">
                        {[c.cif, c.sector, c.contacto].filter(Boolean).join(' · ') || '—'}
                      </p>
                      <div className="sm:hidden mt-2 flex flex-wrap items-center gap-1.5">
                        <Badge estadoId={c.estado} />
                        {c.proximo_contacto && (
                          <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border ${
                            c.proximo_contacto < hoy ? 'bg-rose-50 text-rose-700 border-rose-200' : c.proximo_contacto === hoy ? 'bg-brand-50 text-brand-700 border-brand-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                            <CalendarClock className="w-3 h-3" />{fechaCorta(c.proximo_contacto)}
                          </span>
                        )}
                        {sinMover(c) && <AlertTriangle className="w-3.5 h-3.5 text-orange-500" />}
                      </div>
                    </div>
                    <span className={`hidden md:flex items-center gap-2 text-xs shrink-0 ${c.responsable === me.id ? 'text-brand-900 font-semibold' : 'text-slate-500'}`}>
                      {c.responsable ? <Avatar nombre={nombreDe(c.responsable)} size="sm" /> : <User className="w-3.5 h-3.5" />}
                      {c.responsable === me.id ? 'Tú' : nombreDe(c.responsable)}
                    </span>
                    {sinMover(c) && (
                      <span title={`Sin notas ni cambios de estado en ${SIN_MOVER.dias} días o más`}
                        className="hidden sm:inline-flex items-center gap-1 text-xs font-semibold shrink-0 px-2 py-0.5 rounded-full border bg-orange-50 text-orange-700 border-orange-200">
                        <AlertTriangle className="w-3.5 h-3.5" /><span className="hidden lg:inline">Realizar seguimiento</span>
                      </span>
                    )}
                    {c.proximo_contacto && (
                      <span className={`hidden sm:inline-flex items-center gap-1 text-xs font-medium shrink-0 px-2 py-0.5 rounded-full border ${
                        c.proximo_contacto < hoy
                          ? 'bg-rose-50 text-rose-700 border-rose-200'
                          : c.proximo_contacto === hoy
                            ? 'bg-brand-50 text-brand-700 border-brand-200'
                            : 'bg-slate-50 text-slate-500 border-slate-200'
                      }`}>
                        <CalendarClock className="w-3 h-3" />{fechaCorta(c.proximo_contacto)}
                      </span>
                    )}
                    <span className="hidden sm:block shrink-0"><Badge estadoId={c.estado} /></span>
                    <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-brand-500 group-hover:translate-x-0.5 transition shrink-0" />
                  </button>
                  </div>
                ))}
              </div>
              </>
            )}
          </>
        )}
        </div>
      </main>

      {modal && (
        <EmpresaModal
          key={modal === 'nueva' ? 'nueva' : modal.id}
          empresa={modal === 'nueva' ? null : modal}
          users={users}
          isAdmin={isAdmin}
          me={me}
          todas={companies}
          onSaved={async (m, idNueva) => {
            if (!idNueva) { setModal(null); cargar(); flash(m || 'Guardado ✓', m ? 6000 : 2500); return }
            // Empresa recién creada: se abre su ficha completa (con el hilo de correos) para escribirles
            const lista = await cargar()
            setModal(lista?.find((c) => c.id === idNueva) || null)
            flash('Empresa creada ✓ Ya puedes enviarles un correo', 5000)
          }}
          onDeleted={() => { setModal(null); cargar(); flash('Empresa eliminada') }}
          onRefresh={cargar}
          onClose={() => setModal(null)}
        />
      )}

      {cambiarPass && <CambiarContrasena recuperacion={cambiarPass === 'recuperacion'} onClose={() => setCambiarPass('')} />}

      {aviso && (
        <div className="fixed bottom-24 lg:bottom-6 left-1/2 -translate-x-1/2 animate-toast bg-brand-900 text-white text-sm font-medium px-5 py-2.5 rounded-full shadow-pop z-[60] max-w-[calc(100vw-2rem)] text-center">
          {aviso}
        </div>
      )}
    </div>
  )
}
