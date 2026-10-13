import { Building2, CalendarClock, Mail, FileText, Star, Users, Trophy, History, Rocket, ListChecks, Lightbulb, Shield, HelpCircle } from 'lucide-react'

// Guía de uso del CRM. Solo texto: si cambia algún comportamiento de la app (estados, avisos, correo…), actualízala aquí.
// Las secciones de admin solo se muestran a los admins.

const ESTADOS_GUIA = [
  ['Sin contactar', 'bg-slate-100 text-slate-600 border-slate-200', 'Empresa que te han asignado y a la que todavía no has escrito ni llamado.'],
  ['No lo cogen', 'bg-cyan-50 text-cyan-700 border-cyan-200', 'Has llamado y no contestan. Apunta cuándo volver a intentarlo.'],
  ['Mail enviado', 'bg-yellow-50 text-yellow-700 border-yellow-200', 'Les has mandado el correo con la información. Se marca solo al enviar el primer correo desde el CRM.'],
  ['Muy interesados', 'bg-orange-50 text-orange-700 border-orange-200', 'Han respondido con interés: piden información, convenio o una reunión.'],
  ['Para más adelante', 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200', 'Ahora no pueden, pero hay que volver a escribirles más adelante (anota cuándo en «Próximo contacto»).'],
  ['Otra comunidad', 'bg-neutral-100 text-neutral-600 border-neutral-300', 'La empresa pertenece a otra comunidad o comité: no la llevamos nosotros.'],
  ['Práctica conseguida', 'bg-emerald-50 text-emerald-700 border-emerald-200', 'Han firmado una práctica con IAESTE.'],
  ['No quieren', 'bg-rose-50 text-rose-700 border-rose-200', 'Han dicho que no están interesados.'],
  ['Ya no existe', 'bg-stone-100 text-stone-500 border-stone-300', 'La empresa ha cerrado o no se localiza.'],
]

const Seccion = ({ id, icono: Icono, titulo, children }) => (
  <section id={`guia-${id}`} className="card p-5 sm:p-6 scroll-mt-20">
    <h2 className="flex items-center gap-2.5 text-lg font-bold text-slate-900 mb-3">
      <span className="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center shrink-0"><Icono className="w-4 h-4" /></span>
      {titulo}
    </h2>
    <div className="space-y-3 text-sm text-slate-600 leading-relaxed">{children}</div>
  </section>
)

const Lista = ({ children }) => <ul className="list-disc pl-5 space-y-1.5 marker:text-slate-300">{children}</ul>
const Pasos = ({ children }) => <ol className="list-decimal pl-5 space-y-1.5 marker:text-brand-500 marker:font-semibold">{children}</ol>
const B = ({ children }) => <strong className="font-semibold text-slate-800">{children}</strong>

export default function Guia({ isAdmin }) {
  const secciones = [
    ['empezar', 'Cómo funciona', Rocket],
    ['empresas', 'Empresas', Building2],
    ['estados', 'Estados', ListChecks],
    ['agenda', 'Avisos y seguimiento', CalendarClock],
    ['correo', 'Correos', Mail],
    ['plantillas', 'Plantillas', FileText],
    ['puntuacion', 'Puntuación', Trophy],
    ...(isAdmin ? [['admin', 'Para admins', Shield]] : []),
    ['dudas', 'Dudas frecuentes', HelpCircle],
  ]
  const ir = (id) => document.getElementById(`guia-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex flex-wrap gap-2">
        {secciones.map(([id, label, Icono]) => (
          <button key={id} onClick={() => ir(id)}
            className="px-3 py-1.5 rounded-full border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:bg-slate-50 inline-flex items-center gap-1.5">
            <Icono className="w-3.5 h-3.5 text-slate-400" />{label}
          </button>
        ))}
      </div>

      <Seccion id="empezar" icono={Rocket} titulo="Cómo funciona">
        <p>
          Este CRM sirve para que el equipo de empresas de IAESTE Málaga sepa <B>quién habla con qué empresa</B>, en qué punto está cada conversación y
          <B> cuándo toca volver a contactar</B>. El ciclo de trabajo es siempre el mismo:
        </p>
        <Pasos>
          <li>Al registrarte eliges tu <B>centro</B> (IDML, IFML, QMML, AQML o TLML). Un admin te asigna un lote de empresas. Aparecen en <B>Empresas → Empresas disponibles</B> (estado «Sin contactar»).</li>
          <li>Contacta con ellas por teléfono y por correo (ver <button onClick={() => ir('correo')} className="text-brand-600 hover:underline">Correos</button>).</li>
          <li>Abre la ficha de la empresa, actualiza el <B>estado</B>, escribe una <B>nota</B> con lo que se ha hablado y, si hace falta, fija el <B>próximo contacto</B>. Pulsa <B>Guardar</B>.</li>
          <li>Vuelve a ellas cuando te lo indiquen los avisos («Para hoy», «Atrasadas», «Realizar seguimiento»).</li>
          <li>Cuando se queden sin empresas por contactar, pide otro lote a un admin.</li>
        </Pasos>
        <p>El número rojo junto a <B>Empresas</B> en el menú son los avisos que tienes pendientes.</p>
      </Seccion>

      <Seccion id="empresas" icono={Building2} titulo="Empresas">
        <p>La lista está dividida en apartados según el estado de cada empresa:</p>
        <Lista>
          <li><B>Empresas disponibles:</B> las que aún no has contactado.</li>
          <li><B>Seguimiento activo:</B> conversaciones abiertas (no lo cogen, mail enviado, para más adelante, muy interesados).</li>
          <li><B>Cerradas:</B> práctica conseguida, no quieren, ya no existe u otra comunidad.</li>
          <li><B>Todas:</B> todas las empresas del CRM, también las de tus compañeros, en solo lectura.</li>
        </Lista>
        <p>
          En los demás apartados solo ves <B>tus</B> empresas. Usa el buscador (nombre, CIF, contacto, sector…) y los filtros por estado para encontrar una.
          Haz clic en una empresa para abrir su ficha.
        </p>
        <p><B>Qué puedes cambiar en una ficha:</B> en las empresas que llevas puedes editar persona de contacto, teléfono, email, dirección, CIF, estado, notas y próximo contacto.
          El nombre, el sector y el responsable solo los cambia un admin. Las empresas de otros compañeros las puedes ver, pero no editar.</p>
        <p>
          <B>Nueva empresa:</B> con el botón «Nueva empresa» arriba a la derecha. Queda asignada a ti. Si el CIF ya existe, el CRM la rechaza para evitar duplicados:
          búscala y trabaja con la que ya está.
        </p>
        <p><B>Notas:</B> en la ficha, «Añadir seguimiento» guarda una nota con tu nombre y la fecha. El historial de abajo muestra todo lo ocurrido con esa empresa. Apunta siempre qué se ha hablado y con quién.</p>
      </Seccion>

      <Seccion id="estados" icono={ListChecks} titulo="Estados">
        <p>Cambia el estado en cuanto cambie la situación; es lo que permite saber en qué punto está cada empresa.</p>
        <div className="divide-y divide-slate-100 rounded-xl border border-slate-100">
          {ESTADOS_GUIA.map(([nombre, color, texto]) => (
            <div key={nombre} className="flex flex-col sm:flex-row sm:items-start gap-1.5 sm:gap-3 px-3.5 py-2.5">
              <span className={`self-start shrink-0 sm:w-36 text-center px-2.5 py-0.5 rounded-full border text-xs font-medium ${color}`}>{nombre}</span>
              <span>{texto}</span>
            </div>
          ))}
        </div>
        <p>
          Al pasar una empresa a <B>Práctica conseguida</B> verás un aviso: un admin registrará el año y el número de prácticas y la dejará como empresa <B>prioritaria</B>.
        </p>
      </Seccion>

      <Seccion id="agenda" icono={CalendarClock} titulo="Avisos y seguimiento">
        <Lista>
          <li><B>Próximo contacto:</B> en la ficha elige una fecha (o los atajos +1 sem, +2 sem, +1 mes). Ese día la empresa aparece en <B>Para hoy</B>; si pasa la fecha sin tocarla, pasa a <B>Atrasadas</B>.</li>
          <li><B>Realizar seguimiento:</B> empresas en seguimiento a las que llevas 7 días sin escribir una nota ni cambiar el estado, y sin un próximo contacto programado a futuro.</li>
          <li><B>Seguimiento quincenal:</B> cada 14 días el equipo repasa todas las empresas en seguimiento (no lo cogen, mail enviado, muy interesados). Para darla por revisada hay que
            volver a tocar cada una (<B>nota o cambio de estado</B>) dentro de la quincena. El aviso azul de la pantalla de Empresas te dice cuáles te faltan y hasta cuándo.</li>
        </Lista>
        <p>Pulsa cualquiera de los avisos para filtrar la lista y volver a verla entera con «Ver todas».</p>
      </Seccion>

      <Seccion id="correo" icono={Mail} titulo="Correos">
        <p>
          Cada ficha tiene el <B>hilo de correos</B> con esa empresa y una caja para escribir. Todo sale y entra por el <B>buzón compartido de IAESTE</B>:
          no necesitas acceso a la cuenta de Google y el resto del equipo ve lo que se ha hablado.
        </p>
        <Lista>
          <li><B>Enviar:</B> elige el destinatario, escribe asunto y mensaje y pulsa «Enviar» (o <kbd className="px-1.5 py-0.5 rounded bg-slate-100 text-xs">Ctrl</kbd>+<kbd className="px-1.5 py-0.5 rounded bg-slate-100 text-xs">Enter</kbd>).</li>
          <li><B>Solo a direcciones de la empresa:</B> el destinatario tiene que estar en el campo Email de la ficha o haber escrito antes. Si falta, añádelo en la ficha y guarda.</li>
          <li><B>Estado automático:</B> el primer correo que envías a una empresa «Sin contactar» o «No lo cogen» la pasa a <B>Mail enviado</B>.</li>
          <li><B>Respuestas:</B> los correos nuevos se buscan al abrir la ficha y con el botón de actualizar (flechas circulares) de la sección Correos. No llegan en segundo plano, así que pulsa actualizar si esperas una respuesta.</li>
          <li><B>Responder:</B> por defecto escribes al último remitente con «Re: asunto», y el mensaje se enlaza con el hilo.</li>
          <li><B>Archivos adjuntos:</B> pulsa <B>Adjuntar</B> junto al botón Enviar y elige uno o varios archivos (hasta 10, 15 MB cada uno y 18 MB en total). Se suben al momento y puedes quitarlos con la X antes de enviar. Los correos enviados muestran sus archivos en el hilo: haz clic en uno para descargarlo.</li>
          <li><B>Formato:</B> la barra del mensaje tiene negrita, cursiva, subrayado, enlaces y listas, y al pegar texto de Gmail, Word, etc. se conserva su formato. Las imágenes solo se envían si tienen dirección web (como el logo de una firma de Gmail); para enviar la presentación o el convenio, adjúntalos.</li>
        </Lista>
      </Seccion>

      <Seccion id="plantillas" icono={FileText} titulo="Plantillas de correo">
        <p>Para no escribir siempre lo mismo, el equipo comparte plantillas.</p>
        <Lista>
          <li><B>Usarlas:</B> en la caja de redacción de una empresa, abre el desplegable <B>«Usar plantilla…»</B> y elige una. Se rellenan asunto y mensaje con los datos de la empresa; revísalos y retócalos antes de enviar. Si ya habías escrito algo, te pregunta antes de sustituirlo.</li>
          <li><B>Crearlas:</B> en el menú <B>Plantillas</B> → «Nueva plantilla». Ponle nombre, asunto (opcional) y mensaje. Puedes ver cómo quedará con «Vista previa».</li>
          <li><B>Variables:</B> escribe <code className="text-xs bg-slate-100 rounded px-1 py-0.5">{'{{empresa}}'}</code>, <code className="text-xs bg-slate-100 rounded px-1 py-0.5">{'{{contacto}}'}</code> o <code className="text-xs bg-slate-100 rounded px-1 py-0.5">{'{{yo}}'}</code> (tu nombre)
            y se sustituyen al elegir la plantilla. Si la empresa no tiene persona de contacto, simplemente se omite.</li>
          <li><B>Firma:</B> para poner tu firma en una plantilla, cópiala desde un correo tuyo de Gmail (o desde Ajustes → Firma) y pégala al final del mensaje: se mantienen colores, tablas, enlaces y el logo.
            Si tienes la firma como código HTML, pulsa el botón <code className="text-xs bg-slate-100 rounded px-1 py-0.5">{'</>'}</code> de la barra del mensaje y pégala ahí.</li>
          <li><B>Archivos en plantillas:</B> al crear o editar una plantilla puedes adjuntarle archivos (la presentación, el modelo de convenio…). Cuando alguien elige la plantilla, esos archivos se añaden solos al correo y se pueden quitar antes de enviar.</li>
          <li><B>Permisos:</B> todos ven y usan todas las plantillas. Solo quien creó una plantilla (o un admin) puede editarla o borrarla.</li>
        </Lista>
      </Seccion>

      <Seccion id="puntuacion" icono={Trophy} titulo="Puntuación">
        <p>
          La pestaña <B>Puntos</B> muestra tu puntuación de la <B>campaña</B> (de septiembre a agosto) y la clasificación del equipo.
          Tu puntuación se compone de dos partes:
        </p>
        <Lista>
          <li><B>Puntos automáticos por tus empresas</B> (cuentan como GT Empresas): cada empresa puntúa según su estado actual (contactada 1, cerrada 3, máximo 3 por empresa) y cada quincena de seguimiento cumplida da 10 puntos.</li>
          <li><B>Puntos que anota un admin</B> por lo que haces en el comité local y en los grupos de trabajo (reuniones, stands, despacho, redes sociales, outgoing…), con la rúbrica de la campaña. Los ves en <B>Mi desglose</B> con la fecha y el motivo de cada uno.</li>
        </Lista>
        <p>
          De los demás solo ves el total. La clasificación ordena primero por nivel: <B>Práctica</B> (has conseguido una práctica de empresa), <B>Mínimo</B> (30 puntos de GT Empresas,
          que es lo que hace falta para optar a prácticas en primer plazo) y <B>Pendiente</B>; después por puntos totales y por puntos de GT Empresas.
          Al empezar una campaña un admin anota tu <B>antigüedad</B> (5 por campaña) y el <B>arrastre</B> de la mitad de los puntos de la anterior (nada si tenías menos de 10 o disfrutaste una práctica).
        </p>
        <p>Si ves algún punto que no te cuadra, pregunta a un admin: puede editar el apunte.</p>
      </Seccion>

      {isAdmin && (
        <Seccion id="admin" icono={Shield} titulo="Para admins">
          <Lista>
            <li><B><Users className="inline w-3.5 h-3.5 -mt-0.5" /> Equipo:</B> reparte empresas (botones <B>+5</B> / <B>−5</B> por persona, que asignan o devuelven al bote común empresas sin contactar), cambia roles (miembro/admin), asigna el <B>centro</B> (IDML, IFML, QMML, AQML o TLML) a quien no lo tenga y pon una contraseña temporal a quien la haya olvidado.</li>
            <li><B><History className="inline w-3.5 h-3.5 -mt-0.5" /> Seguimiento:</B> últimos cambios y notas de todo el equipo, filtrables por persona.</li>
            <li><B><Trophy className="inline w-3.5 h-3.5 -mt-0.5" /> Puntuación:</B> con <B>Dar puntos</B> eliges una o varias personas, la categoría y el concepto de la rúbrica (los puntos se rellenan solos y los puedes ajustar), la fecha y un motivo que verá la persona. Pulsa una persona de la clasificación para ver, editar o borrar sus apuntes.
              Antigüedad y arrastre se anotan al empezar la campaña con <B>Dar puntos</B> (categoría «Inicio de campaña»). Los apuntes importados de gente que aún no tiene cuenta se les asignan solos al registrarse con el mismo nombre.
              Los puntos por empresas del CRM (contactada 1, cerrada 3, quincena cumplida) se suman solos como GT Empresas; en <B>Equipo</B> sigue la tabla detallada.</li>
            <li><B><Star className="inline w-3.5 h-3.5 -mt-0.5" /> Prioritarias:</B> al conseguir una práctica, registra año y nº de prácticas desde la ficha; la empresa pasa sola al apartado «Prioritarias».</li>
            <li><B>Asignación rápida:</B> filtra por «Sin asignar» en Empresas, marca las que quieras y asígnalas de golpe. También puedes exportar la lista a Excel.</li>
            <li><B>Plantillas:</B> puedes editar y borrar las de cualquiera, incluida la de serie.</li>
          </Lista>
        </Seccion>
      )}

      <Seccion id="dudas" icono={HelpCircle} titulo="Dudas frecuentes">
        <div className="space-y-3">
          <div><p className="font-semibold text-slate-800">No puedo editar una empresa.</p><p>Solo se editan las empresas que tienes asignadas. Si es tuya y aun así no puedes, recarga la página; si no, pídele a un admin que te la asigne.</p></div>
          <div><p className="font-semibold text-slate-800">Me he quedado sin empresas por contactar.</p><p>Pídele a un admin otro lote desde la pestaña Equipo.</p></div>
          <div><p className="font-semibold text-slate-800">«Ese destinatario no pertenece a la empresa».</p><p>Añade el email en la ficha de la empresa, guarda y vuelve a enviar. Es una protección para que el buzón compartido no se use para escribir a cualquiera.</p></div>
          <div><p className="font-semibold text-slate-800">«No se puede conectar con el servicio de correo».</p><p>Es un fallo temporal del envío. Espera un poco y vuelve a intentarlo; si sigue, avisa a un admin.</p></div>
          <div><p className="font-semibold text-slate-800">Se ha enviado pero dice que no se ha guardado.</p><p>El correo ha salido: no lo reenvíes, avisa a un admin.</p></div>
          <div><p className="font-semibold text-slate-800">He olvidado mi contraseña.</p><p>En la pantalla de entrada pulsa «¿Has olvidado tu contraseña?». Si no te llega el correo, un admin puede ponerte una temporal.</p></div>
        </div>
        <p className="flex items-start gap-2 pt-1 text-slate-500"><Lightbulb className="w-4 h-4 mt-0.5 shrink-0 text-amber-500" />Consejo: anota siempre algo en cada contacto, aunque sea «no lo cogen, llamar el jueves». Es lo que permite a cualquiera del equipo retomar la conversación.</p>
      </Seccion>
    </div>
  )
}
