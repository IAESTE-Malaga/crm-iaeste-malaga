import { useState, useEffect, useRef, useCallback } from 'react'
import { Mail, Send, ArrowDownLeft, ArrowUpRight, RefreshCw, AlertCircle } from 'lucide-react'
import { supabase } from './supabase'

// URL del servicio de correo (server/). En desarrollo, el puerto por defecto; en producción hay que definirla.
const API = (import.meta.env.VITE_EMAIL_API_URL || (import.meta.env.DEV ? 'http://localhost:8787' : '')).replace(/\/$/, '')
const REFRESCO_MS = 60_000

const cuando = (iso) =>
  new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

// El campo email de la ficha es texto libre: puede traer varias direcciones
const direcciones = (t) => String(t || '').toLowerCase().split(/[\s;,<>]+/).filter((x) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x))
const conRe = (a) => (/^re:/i.test(a) ? a : `Re: ${a}`)

// Hilo de correos de una empresa + caja para redactar y enviar.
// Los mensajes entrantes se pintan SIEMPRE como texto plano (nunca como HTML): son de terceros.
export default function EmailThread({ empresa }) {
  const [correos, setCorreos] = useState(null)   // null = cargando
  const [err, setErr] = useState('')
  const [para, setPara] = useState('')
  const [asunto, setAsunto] = useState('')
  const [cuerpo, setCuerpo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [aviso, setAviso] = useState('')
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

  useEffect(() => {
    cargar()
    const t = setInterval(cargar, REFRESCO_MS)
    return () => clearInterval(t)
  }, [cargar])

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
    setAsunto(ultimo ? conRe(ultimo.asunto) : `IAESTE Madrid - Prácticas internacionales para ${empresa.nombre}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [correos, tocado])

  // Al abrir o llegar mensajes nuevos, bajar al último
  useEffect(() => { fin.current?.scrollIntoView({ block: 'nearest' }) }, [correos?.length])

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
      setAviso('Enviado ✓')
      await cargar()
    } catch (e) {
      setErr(e instanceof TypeError ? 'No se puede conectar con el servicio de correo.' : e.message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="pt-2 border-t border-slate-100">
      <div className="flex items-center justify-between mb-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">
          <Mail className="w-3.5 h-3.5" />Correos{correos?.length ? ` · ${correos.length}` : ''}
        </p>
        <button onClick={cargar} title="Actualizar" className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {correos === null ? (
        <p className="text-xs text-slate-400">Cargando…</p>
      ) : correos.length === 0 ? (
        <p className="text-xs text-slate-400">Todavía no hay correos con esta empresa.</p>
      ) : (
        <ol className="space-y-2 max-h-80 overflow-y-auto pr-1 mb-3">
          {correos.map((c) => {
            const salida = c.direccion === 'saliente'
            return (
              <li key={c.id} className={`flex ${salida ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[88%] rounded-xl border px-3 py-2 text-xs ${salida ? 'bg-blue-50 border-blue-200' : 'bg-white border-slate-200'}`}>
                  <div className="flex items-center gap-1.5 text-slate-500 mb-1">
                    {salida ? <ArrowUpRight className="w-3 h-3 text-blue-600" /> : <ArrowDownLeft className="w-3 h-3 text-emerald-600" />}
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

      {!API ? (
        <p className="text-xs text-slate-500">El envío de correos no está configurado (falta VITE_EMAIL_API_URL).</p>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {opciones.length > 1 || (opciones.length === 1 && opciones[0] !== para) ? (
              <select value={para} onChange={(e) => { setPara(e.target.value); setTocado(true) }}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white">
                {opciones.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <p className="px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-600 truncate">{para || 'Sin email en la ficha'}</p>
            )}
            <input value={asunto} onChange={(e) => { setAsunto(e.target.value); setTocado(true) }} maxLength={200} placeholder="Asunto"
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#0e2d4d]/30" />
          </div>
          <textarea value={cuerpo} onChange={(e) => setCuerpo(e.target.value)} rows={4} maxLength={20000} placeholder="Escribe tu respuesta…"
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); if (!enviando) enviar() } }}
            className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#0e2d4d]/30 resize-y" />
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-slate-400">Se envía desde el buzón compartido de IAESTE · Ctrl+Enter para enviar</p>
            <button onClick={enviar} disabled={enviando || !para || !cuerpo.trim()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#0e2d4d] hover:bg-[#163d63] text-white text-xs font-semibold disabled:opacity-50">
              <Send className="w-3.5 h-3.5" />{enviando ? 'Enviando…' : 'Enviar'}
            </button>
          </div>
        </div>
      )}
      {err && <p className="mt-2 text-xs text-rose-600 flex items-start gap-1"><AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />{err}</p>}
      {aviso && <p className="mt-2 text-xs text-emerald-700">{aviso}</p>}
    </div>
  )
}
