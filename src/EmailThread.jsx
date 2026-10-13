import { useState, useEffect, useRef, useCallback } from 'react'
import { Mail, Send, ArrowDownLeft, ArrowUpRight, RefreshCw, AlertCircle, FileText } from 'lucide-react'
import { supabase } from './supabase'
import { aplicarVariables } from './plantillas'

// URL del servicio de correo (server/). En desarrollo, el puerto por defecto; en producción hay que definirla.
const API = (import.meta.env.VITE_EMAIL_API_URL || (import.meta.env.DEV ? 'http://localhost:8787' : '')).replace(/\/$/, '')
const REFRESCO_MS = 60_000
const SYNC_MIN_MS = 60_000
let ultimaSync = 0 // compartido entre fichas: no se pide a Gmail más de una vez por minuto desde este navegador

// Pide al servicio que lea el buzón (IMAP) ahora. Si falla, se sigue mostrando lo que ya hay en la base de datos.
async function sincronizar(forzar = false) {
  if (!forzar && Date.now() - ultimaSync < SYNC_MIN_MS) return
  ultimaSync = Date.now()
  try {
    const { data: { session } } = await supabase.auth.getSession()
    await fetch(`${API}/api/sync`, { method: 'POST', headers: { Authorization: `Bearer ${session?.access_token}` } })
  } catch { /* sin conexión con el servicio: no pasa nada */ }
}

const cuando = (iso) =>
  new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

// El campo email de la ficha es texto libre: puede traer varias direcciones
const direcciones = (t) => String(t || '').toLowerCase().split(/[\s;,<>]+/).filter((x) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x))
const conRe = (a) => (/^re:/i.test(a) ? a : `Re: ${a}`)

// Hilo de correos de una empresa + caja para redactar y enviar.
// Los mensajes entrantes se pintan SIEMPRE como texto plano (nunca como HTML): son de terceros.
export default function EmailThread({ empresa, yo, onEnviado }) {
  const [correos, setCorreos] = useState(null)   // null = cargando
  const [err, setErr] = useState('')
  const [para, setPara] = useState('')
  const [asunto, setAsunto] = useState('')
  const [cuerpo, setCuerpo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [aviso, setAviso] = useState('')
  const [sincronizando, setSincronizando] = useState(false)
  const [plantillas, setPlantillas] = useState([])
  const [tocado, setTocado] = useState(false)    // si el usuario ya ha escrito el asunto/destinatario, no se pisa
  const fin = useRef(null)

  const cargar = useCallback(async () => {
    const { data, error } = await supabase
      .from('emails')
      .select('id, direccion, remitente, destinatario, asunto, cuerpo_texto, enviado_en, enviado_por, contacto_id')
      .eq('empresa_id', empresa.id)
      .order('enviado_en', { ascending: true })
      .limit(300)
    if (error) { setErr(error.message); setCorreos((c) => c ?? []); return }
    setErr('')
    setCorreos(data)
  }, [empresa.id])

  const actualizar = useCallback(async (forzar = false) => {
    setSincronizando(true)
    await sincronizar(forzar)
    await cargar()
    setSincronizando(false)
  }, [cargar])

  // Plantillas compartidas (sección «Plantillas»). Si no cargan, el selector simplemente queda vacío.
  useEffect(() => {
    supabase.from('plantillas').select('id, nombre, asunto, cuerpo').order('nombre')
      .then(({ data }) => setPlantillas(data || []))
  }, [])

  useEffect(() => {
    actualizar()
    const t = setInterval(cargar, REFRESCO_MS)
    return () => clearInterval(t)
  }, [cargar, actualizar])

  const ultimo = correos?.[correos.length - 1]
  const opciones = [...new Set([
    ...direcciones(empresa.email),
    ...(correos || []).filter((c) => c.direccion === 'entrante').map((c) => c.remitente),
  ])]

  // Valores por defecto: responder al último remitente con «Re: asunto», o escribir de cero a la ficha
  useEffect(() => {
    if (tocado || correos === null) return
    const ultimoEntrante = [...correos].reverse().find((c) => c.direccion === 'entrante')
    setPara(ultimoEntrante?.remitente || opciones[0] || '')
    setAsunto(ultimo ? conRe(ultimo.asunto) : `IAESTE Málaga - Prácticas internacionales para ${empresa.nombre}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [correos, tocado])

  // Al abrir o llegar mensajes nuevos, bajar al último
  useEffect(() => { fin.current?.scrollIntoView({ block: 'nearest' }) }, [correos?.length])

  // Rellena asunto y mensaje con la plantilla elegida (se puede editar antes de enviar).
  // Una plantilla sin asunto deja el que ya hay (p. ej. «Re: …» al responder).
  const usarPlantilla = (id) => {
    const p = plantillas.find((x) => x.id === id)
    if (!p) return
    if (cuerpo.trim() && !confirm('Se sustituirá lo que has escrito por la plantilla. ¿Continuar?')) return
    const datos = { empresa, yo }
    const asuntoNuevo = aplicarVariables(p.asunto, datos).trim()
    if (asuntoNuevo) setAsunto(asuntoNuevo)
    setCuerpo(aplicarVariables(p.cuerpo, datos))
    setTocado(true)
  }

  const enviar = async () => {
    setErr(''); setAviso('')
    if (!para) { setErr('No hay ningún email al que escribir. Añádelo en la ficha de la empresa.'); return }
    if (!asunto.trim() || !cuerpo.trim()) { setErr('Escribe el asunto y el mensaje.'); return }
    setEnviando(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const r = await fetch(`${API}/api/emails/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ empresa_id: empresa.id, para, asunto: asunto.trim(), cuerpo, responder_a: ultimo?.id }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || `Error ${r.status}`)
      setCuerpo(''); setTocado(false)
      setAviso(j.estado ? 'Enviado ✓ · empresa marcada como «Mail enviado»' : 'Enviado ✓')
      if (j.estado) onEnviado?.(j.estado)
      await cargar()
    } catch (e) {
      setErr(e instanceof TypeError ? 'No se puede conectar con el servicio de correo.' : e.message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="flex flex-col lg:h-full">
      <div className="flex items-center justify-between mb-3 shrink-0">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">
          <Mail className="w-3.5 h-3.5" />Correos{correos?.length ? ` · ${correos.length}` : ''}
        </p>
        <button onClick={() => actualizar(true)} disabled={sincronizando} title="Buscar correos nuevos" className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-60">
          <RefreshCw className={`w-3.5 h-3.5 ${sincronizando ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {correos === null ? (
        <p className="text-xs text-slate-400 mb-5 lg:flex-1">Cargando…</p>
      ) : correos.length === 0 ? (
        <p className="text-xs text-slate-400 mb-5 lg:flex-1">Todavía no hay correos con esta empresa.</p>
      ) : (
        <ol className="space-y-2.5 max-h-[40vh] lg:max-h-none lg:flex-1 lg:min-h-[8rem] overflow-y-auto pr-1 mb-5">
          {correos.map((c) => {
            const salida = c.direccion === 'saliente'
            return (
              <li key={c.id} className={`flex ${salida ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[88%] rounded-2xl border px-3.5 py-2.5 text-[13px] leading-relaxed ${salida ? 'bg-brand-50 border-brand-200' : 'bg-white border-slate-200'}`}>
                  <div className="flex items-center gap-1.5 text-slate-500 mb-1">
                    {salida ? <ArrowUpRight className="w-3 h-3 text-brand-500" /> : <ArrowDownLeft className="w-3 h-3 text-emerald-600" />}
                    <span className="truncate">{salida ? `Enviado a ${c.destinatario}` : c.remitente}</span>
                    <span className="text-slate-400 shrink-0">· {cuando(c.enviado_en)}</span>
                  </div>
                  <p className="font-semibold text-slate-800 mb-0.5 break-words">{c.asunto}</p>
                  <p className="text-slate-700 whitespace-pre-wrap break-words">{c.cuerpo_texto || '(sin texto)'}</p>
                </div>
              </li>
            )
          })}
          <div ref={fin} />
        </ol>
      )}

      {/* Redactar: tarjeta con destinatario y asunto en filas propias y un cuadro de mensaje grande */}
      <div className="shrink-0 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-500/10 transition">
        <div className="flex items-center gap-3 px-4 py-2 border-b border-slate-100">
          <span className="w-14 shrink-0 text-xs font-semibold text-slate-400 uppercase tracking-wide">Para</span>
          {opciones.length > 1 || (opciones.length === 1 && opciones[0] !== para) ? (
            <select value={para} onChange={(e) => { setPara(e.target.value); setTocado(true) }}
              className="flex-1 min-w-0 py-1.5 text-sm bg-transparent focus:outline-none">
              {opciones.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : (
            <p className="flex-1 min-w-0 py-1.5 text-sm text-slate-600 truncate">{para || 'Sin email en la ficha'}</p>
          )}
        </div>
        <div className="flex items-center gap-3 px-4 py-2 border-b border-slate-100">
          <span className="w-14 shrink-0 text-xs font-semibold text-slate-400 uppercase tracking-wide">Asunto</span>
          <input value={asunto} onChange={(e) => { setAsunto(e.target.value); setTocado(true) }} maxLength={200} placeholder="Asunto del correo"
            className="flex-1 min-w-0 py-1.5 text-sm font-medium text-slate-800 placeholder:font-normal placeholder:text-slate-400 bg-transparent focus:outline-none" />
        </div>
        <div className="flex items-center gap-3 px-4 py-2 border-b border-slate-100 bg-slate-50/70">
          <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <select value="" onChange={(e) => usarPlantilla(e.target.value)} disabled={plantillas.length === 0} aria-label="Usar plantilla"
            className="flex-1 min-w-0 py-1 text-xs bg-transparent text-slate-600 focus:outline-none disabled:opacity-60">
            <option value="">{plantillas.length ? 'Usar plantilla…' : 'No hay plantillas (créalas en la sección Plantillas)'}</option>
            {plantillas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </div>
        <textarea value={cuerpo} onChange={(e) => setCuerpo(e.target.value)} rows={8} maxLength={20000} placeholder="Escribe tu mensaje…"
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); if (!enviando) enviar() } }}
          className="block w-full min-h-[12rem] px-4 py-3 text-[15px] leading-relaxed text-slate-800 placeholder:text-slate-400 focus:outline-none resize-y" />
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-t border-slate-100 bg-slate-50/70">
          <p className="text-[11px] text-slate-400">Desde el buzón compartido de IAESTE · Ctrl+Enter para enviar{cuerpo ? ` · ${cuerpo.length.toLocaleString('es-ES')}/20.000` : ''}</p>
          <button onClick={enviar} disabled={enviando || !para || !cuerpo.trim()}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-brand-900 hover:bg-brand-700 text-white text-sm font-semibold disabled:opacity-50 transition">
            <Send className="w-4 h-4" />{enviando ? 'Enviando…' : 'Enviar'}
          </button>
        </div>
      </div>
      {err && <p className="mt-2 text-xs text-rose-600 flex items-start gap-1"><AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />{err}</p>}
      {aviso && <p className="mt-2 text-xs text-emerald-700">{aviso}</p>}
    </div>
  )
}
