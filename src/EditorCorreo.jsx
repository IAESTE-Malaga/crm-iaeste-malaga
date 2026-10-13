import { useRef, useEffect, useState, forwardRef, useImperativeHandle } from 'react'
import { Bold, Italic, Underline, Link2, List, ListOrdered, RemoveFormatting, Code2 } from 'lucide-react'
import { limpiar, textoAHtml } from './html'

// Editor de correo con formato (HTML). Se usa en la caja de redacción del hilo y en las plantillas.
//  - Pegar desde Gmail/Outlook/Word conserva el formato (negritas, colores, tablas de las firmas, enlaces,
//    imágenes con URL pública); se limpia al pegar con la misma lista que aplica el servicio al enviar.
//  - Modo «HTML» para pegar o retocar el código a mano (p. ej. una firma hecha con un generador).
// `valor` es el HTML; `onChange` recibe el nuevo HTML ('' si está vacío).
const EditorCorreo = forwardRef(function EditorCorreo({ valor, onChange, placeholder, alto = 'min-h-[12rem]', onKeyDown, onAviso, avisarImagenes = false, extra, sinBorde = false }, ref) {
  const caja = useRef(null)
  const codigo = useRef(null)
  const emitido = useRef(null) // último HTML que salió del editor: si `valor` es otro, viene de fuera (plantilla, vaciado al enviar)
  const rango = useRef(null)   // última selección dentro del editor: las variables y los enlaces se insertan ahí
  const [modo, setModo] = useState('visual')

  useEffect(() => {
    if (modo === 'visual' && caja.current && valor !== emitido.current) {
      caja.current.innerHTML = valor || ''
      emitido.current = valor
    }
  }, [valor, modo])

  // Recordar dónde estaba el cursor (al pulsar un botón de la barra el foco sale del editor)
  useEffect(() => {
    const guardar = () => {
      const sel = window.getSelection()
      if (sel?.rangeCount && caja.current?.contains(sel.anchorNode)) rango.current = sel.getRangeAt(0).cloneRange()
    }
    document.addEventListener('selectionchange', guardar)
    return () => document.removeEventListener('selectionchange', guardar)
  }, [])

  // Imagen que no carga (dirección rota, o alojada en Google Drive, que no deja verla fuera de Google)
  useEffect(() => {
    const el = caja.current
    if (!avisarImagenes) return
    const fallo = (e) => {
      if (e.target.tagName === 'IMG') onAviso?.('Alguna imagen no se puede mostrar aquí. Si está en Google Drive, Gmail sí la enseña pero otros correos puede que no: es más seguro alojarla en una web (p. ej. la de IAESTE) y usar esa dirección.')
    }
    el.addEventListener('error', fallo, true) // los errores de carga no burbujean: se escuchan en captura
    return () => el.removeEventListener('error', fallo, true)
  }, [onAviso, avisarImagenes])

  const emitir = () => {
    const el = caja.current
    const html = !el.textContent.trim() && !el.querySelector('img') ? '' : el.innerHTML
    emitido.current = html
    onChange(html)
  }

  const comando = (cmd, arg) => {
    const el = caja.current
    el.focus()
    if (rango.current && el.contains(rango.current.startContainer)) {
      const sel = window.getSelection()
      sel.removeAllRanges()
      sel.addRange(rango.current)
    }
    document.execCommand(cmd, false, arg)
    emitir()
  }

  const pegar = (e) => {
    const d = e.clipboardData
    const html = d.getData('text/html')
    const texto = d.getData('text/plain')
    e.preventDefault()
    if (html) {
      const r = limpiar(html)
      if (r.imagenesQuitadas) onAviso?.(`${r.imagenesQuitadas === 1 ? 'Se ha quitado 1 imagen' : `Se han quitado ${r.imagenesQuitadas} imágenes`} sin dirección web: no se ${r.imagenesQuitadas === 1 ? 'vería' : 'verían'} en el correo. Usa imágenes alojadas en internet (como la de tu firma de Gmail) o adjúntalas como archivo.`)
      comando('insertHTML', r.html)
    } else if (texto) {
      comando('insertHTML', textoAHtml(texto))
    } else if (d.files?.length) {
      onAviso?.('Las imágenes pegadas como archivo no se pueden enviar dentro del correo: usa una imagen con dirección web o adjúntala como archivo.')
    }
  }

  const enlace = () => {
    const url = prompt('Dirección del enlace (https://…, mailto:…)', 'https://')?.trim()
    if (!url || url === 'https://') return
    comando('createLink', /^(https?:|mailto:|tel:)/i.test(url) ? url : `https://${url}`)
  }

  const cambiarModo = () => {
    if (modo === 'codigo') {
      // Al volver al editor se limpia lo escrito a mano, para ver ya lo que se enviará de verdad
      const r = limpiar(valor)
      if (r.imagenesQuitadas) onAviso?.('Se han quitado imágenes sin dirección web (https://…): no se verían en el correo.')
      onChange(r.html)
      emitido.current = null // fuerza a repintar el editor con el HTML limpio
    }
    setModo((m) => (m === 'visual' ? 'codigo' : 'visual'))
  }

  // Insertar texto donde esté el cursor (variables de plantilla)
  useImperativeHandle(ref, () => ({
    insertar(texto) {
      if (modo === 'codigo') {
        const el = codigo.current
        const ini = el?.selectionStart ?? valor.length
        const fin = el?.selectionEnd ?? valor.length
        onChange(valor.slice(0, ini) + texto + valor.slice(fin))
        requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(ini + texto.length, ini + texto.length) })
      } else {
        comando('insertText', texto)
      }
    },
  }))

  const boton = (Icono, titulo, accion, activo = false) => (
    <button type="button" title={titulo} aria-label={titulo} onMouseDown={(e) => e.preventDefault()} onClick={accion}
      disabled={modo === 'codigo' && !activo}
      className={`p-1.5 rounded-md transition disabled:opacity-30 ${activo ? 'bg-brand-100 text-brand-700' : 'text-slate-500 hover:bg-slate-200/70 hover:text-slate-700'}`}>
      <Icono className="w-3.5 h-3.5" />
    </button>
  )

  return (
    <div className={sinBorde ? '' : 'rounded-xl border border-slate-200 overflow-hidden transition focus-within:ring-4 focus-within:ring-brand-500/15 focus-within:border-brand-500'}>
      <div className="flex items-center gap-0.5 flex-wrap px-2 py-1 border-b border-slate-100 bg-slate-50/70">
        {boton(Bold, 'Negrita (Ctrl+B)', () => comando('bold'))}
        {boton(Italic, 'Cursiva (Ctrl+I)', () => comando('italic'))}
        {boton(Underline, 'Subrayado (Ctrl+U)', () => comando('underline'))}
        {boton(Link2, 'Enlace', enlace)}
        {boton(List, 'Lista', () => comando('insertUnorderedList'))}
        {boton(ListOrdered, 'Lista numerada', () => comando('insertOrderedList'))}
        {boton(RemoveFormatting, 'Quitar formato', () => comando('removeFormat'))}
        <span className="mx-1 h-4 w-px bg-slate-200" />
        {boton(Code2, modo === 'codigo' ? 'Volver al editor' : 'Editar el código HTML (para pegar una firma en HTML)', cambiarModo, modo === 'codigo')}
        {extra && <div className="ml-auto flex items-center gap-1.5 flex-wrap">{extra}</div>}
      </div>
      <div className="relative">
        <div ref={caja} contentEditable={modo === 'visual'} suppressContentEditableWarning role="textbox" aria-multiline="true" aria-label={placeholder}
          onInput={emitir} onPaste={pegar} onKeyDown={onKeyDown} onBlur={emitir}
          className={`correo-html ${alto} max-h-[60vh] overflow-y-auto px-4 py-3 focus:outline-none ${modo === 'codigo' ? 'hidden' : ''}`} />
        {modo === 'visual' && !valor && placeholder && (
          <p className="absolute top-3 left-4 right-4 text-sm text-slate-400 pointer-events-none whitespace-pre-line">{placeholder}</p>
        )}
        {modo === 'codigo' && (
          <textarea ref={codigo} value={valor} onChange={(e) => onChange(e.target.value)} onKeyDown={onKeyDown} spellCheck={false}
            placeholder="<p>Pega aquí el código HTML…</p>"
            className={`block w-full ${alto} max-h-[60vh] px-4 py-3 font-mono text-xs leading-relaxed text-slate-800 bg-slate-50/40 focus:outline-none resize-y`} />
        )}
      </div>
    </div>
  )
})

export default EditorCorreo
