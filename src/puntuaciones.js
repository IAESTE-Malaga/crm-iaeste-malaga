// Puntuaciones de campaña: catálogo de la rúbrica y cálculo de la clasificación.
// Lógica pura, sin React ni Supabase. Los apuntes viven en la tabla `puntos` (ver la migración
// 20261016000000_puntuaciones.sql) y los puntos automáticos por empresas salen de calcularPuntos() en App.jsx.
// Cuando cambie la rúbrica, se edita CATALOGO (y, si cambia, MINIMO_GT_EMPRESAS): el resto no se toca.

export const CENTROS = ['IDML', 'IFML', 'QMML', 'AQML', 'TLML']

// Con 30 puntos de GT Empresas se opta a prácticas en primer plazo (nota de la tabla H de la rúbrica).
export const MINIMO_GT_EMPRESAS = 30

// Conceptos que cuentan como «ha conseguido una práctica» para el nivel Práctica (la migración usa los mismos ids).
export const CONCEPTOS_PRACTICA = ['h_practica_nueva', 'h_practica_renovacion']

export const NIVELES = ['Pendiente', 'Mínimo', 'Práctica'] // índice = nivel

export const CATEGORIAS = {
  INI: { label: 'Inicio de campaña', grupo: 'Campaña' },
  A: { label: 'Junta directiva y coordinación', grupo: 'Comité Local' },
  B: { label: 'Actualización de documentación', grupo: 'Comité Local' },
  C: { label: 'Asistencia a reuniones', grupo: 'Comité Local' },
  D: { label: 'Documentación oficial', grupo: 'Comité Local' },
  E: { label: 'Trabajo de despacho', grupo: 'Comité Local' },
  F: { label: 'Captación de socios', grupo: 'Comité Local' },
  G: { label: 'Trabajo extra', grupo: 'Comité Local' },
  H: { label: 'GT Empresas', grupo: 'Grupos de trabajo' },
  I: { label: 'GT Marketing', grupo: 'Grupos de trabajo' },
  J: { label: 'GT Eventos / Incoming', grupo: 'Grupos de trabajo' },
  K: { label: 'GT Outgoing', grupo: 'Grupos de trabajo' },
  L: { label: 'GT IT', grupo: 'Grupos de trabajo' },
  M: { label: 'Presencia', grupo: 'Presencia' },
}
export const ORDEN_CATEGORIAS = Object.keys(CATEGORIAS)

// Concepto: { id, cat, texto, min, max?, unidad?, nota?, penalizacion? }
//  - min/max: puntos (o rango de puntos) por unidad. Sin min = puntos libres.
//  - unidad: «por qué» se multiplica (hora, reunión…). Sin unidad, la cantidad es 1.
//  - nota: regla que el admin debe tener en cuenta (reparto, topes…). No se aplica sola.
const c = (id, cat, texto, min, max, extra = {}) => ({ id, cat, texto, min, max: max ?? min, ...extra })
const TRAMO = 'Se anota una vez por tramo: ene-ago y sep-dic (dos apuntes al año).'
const REPARTO2 = 'Hasta 2 personas; si son más, los puntos se reparten entre todas.'

export const CATALOGO = [
  // Inicio de campaña
  c('antiguedad', 'INI', 'Antigüedad (campañas completadas)', 5, 5, { unidad: 'campaña' }),
  c('arrastre', 'INI', 'Arrastre de la campaña anterior', undefined, undefined, { nota: 'La mitad de los puntos de la campaña anterior (nada si eran menos de 10 o si disfrutó una práctica).' }),

  // A. Pertenencia a la junta directiva o cargo de coordinador
  c('a_presidencia', 'A', 'Presidencia', 10, 10, { unidad: 'tramo', nota: TRAMO }),
  c('a_vice_sec_tes', 'A', 'Vicepresidencia, Secretaría y Tesorería', 7.5, 7.5, { unidad: 'tramo', nota: TRAMO }),
  c('a_vocalia', 'A', 'Vocalía', 5, 5, { unidad: 'tramo', nota: TRAMO }),
  c('a_and_presidencia', 'A', 'IAESTE Andalucía: Presidencia', 12.5, 12.5, { unidad: 'tramo', nota: TRAMO }),
  c('a_and_secretaria', 'A', 'IAESTE Andalucía: Secretaría', 10, 10, { unidad: 'tramo', nota: TRAMO }),
  c('a_and_vocalia', 'A', 'IAESTE Andalucía: Vocalía de Málaga', 7.5, 7.5, { unidad: 'tramo', nota: TRAMO }),
  c('a_coord_gt', 'A', 'Coordinador de GT', 10, 10, { unidad: 'tramo', nota: `${TRAMO} Si hay co-coordinadores, los puntos se reparten entre ellos.` }),

  // B. Actualización de documentación de las juntas directivas
  c('b_cambio_junta', 'B', 'Cambios de Junta Directiva', 5, 5, { unidad: 'persona', nota: REPARTO2 }),
  c('b_certificado', 'B', 'Certificado electrónico', 3),
  c('b_cuenta', 'B', 'Cambio de titulares de la cuenta bancaria', 10, 10, { unidad: 'persona', nota: REPARTO2 }),

  // C. Asistencia a reuniones
  c('c_centro', 'C', 'Reunión de centro', 1, 1, { unidad: 'reunión' }),
  c('c_comite', 'C', 'Reunión de comité local', 2, 2, { unidad: 'reunión' }),
  c('c_delegacion', 'C', 'Reunión de la delegación de Andalucía / IAESTE España', 3, 3, { unidad: 'reunión' }),

  // D. Elaboración de documentación oficial
  c('d_actas', 'D', 'Actas de reuniones', 2, 2, { unidad: 'documento' }),
  c('d_movilidad', 'D', 'Informe de movilidad', 1, 1, { unidad: 'documento' }),
  c('d_subvenciones', 'D', 'Subvenciones', 7.5, 7.5, { unidad: 'persona', nota: REPARTO2 }),
  c('d_liquidaciones', 'D', 'Liquidaciones', 1, 1, { unidad: 'documento' }),

  // E. Trabajo de despacho
  c('e_horas', 'E', 'Horas de despacho', 1, 1, { unidad: 'hora', nota: 'Máximo 20 horas.' }),
  c('e_correo_drive', 'E', 'Gestión del correo y el Drive', 1, 5),

  // F. Campañas de captación de socios
  c('f_charla', 'F', 'Charla informativa', 2.5, 2.5, { unidad: 'charla', nota: 'A partir de la quinta charla, 1 punto.' }),
  c('f_stand_org', 'F', 'Stand o evento presencial: organización', 2, 2),
  c('f_stand_hora', 'F', 'Stand o evento presencial: horas', 2, 2, { unidad: 'hora' }),

  // G. Trabajo extra
  c('g_extra', 'G', 'Tarea extra (según su importancia y el trabajo requerido)', 1, 10, { unidad: 'tarea' }),

  // H. GT Empresas (las llamadas y el seguimiento de empresas puntúan solos desde el CRM)
  c('h_jornada_llamadas', 'H', 'Asistir a una jornada de llamadas', 0.5),
  c('h_visita', 'H', 'Día de visitar empresas presencialmente', 20),
  c('h_reunion_conseguir', 'H', 'Conseguir una reunión con una empresa', 5),
  c('h_reunion_online', 'H', 'Reunirse con una empresa online', 10),
  c('h_reunion_presencial', 'H', 'Reunirse con una empresa presencialmente', 15),
  c('h_renovar', 'H', 'Renovar Excel, formulario, plantillas…', 1, 10),
  c('h_coordinador', 'H', 'Ocupar el puesto de coordinador/a', 15),
  c('h_reemplazo', 'H', 'Reemplazar al coordinador en una reunión', 3),
  c('h_patrocinador', 'H', 'Conseguir patrocinador', 20),
  c('h_practica_renovacion', 'H', 'Conseguir práctica de empresa de renovación', 25),
  c('h_practica_nueva', 'H', 'Conseguir práctica de empresa nueva', 50),
  c('h_incoming', 'H', 'Seguimiento del estudiante en prácticas en Málaga', 5),

  // I. GT Marketing
  c('i_instagram', 'I', 'Redes sociales: Instagram', 20, 20, { nota: 'Mínimo 3 publicaciones (en Instagram, más).' }),
  c('i_tiktok', 'I', 'Redes sociales: TikTok', 15, 15, { nota: 'Mínimo 3 publicaciones.' }),
  c('i_linkedin', 'I', 'Redes sociales: LinkedIn', 15, 15, { nota: 'Mínimo 3 publicaciones.' }),
  c('i_facebook', 'I', 'Redes sociales: Facebook', 15, 15, { nota: 'Mínimo 3 publicaciones.' }),
  c('i_x', 'I', 'Redes sociales: X', 15, 15, { nota: 'Mínimo 3 publicaciones.' }),
  c('i_cartel', 'I', 'Cartel', 3, 5),
  c('i_video', 'I', 'Vídeo', 4, 6),
  c('i_plantilla', 'I', 'Plantilla', 2),
  c('i_publicacion', 'I', 'Publicación', 4, 6),
  c('i_idea', 'I', 'Idea', 1),
  c('i_diseno', 'I', 'Diseño de folletos, merchandising…', 5, 10),
  c('i_medios', 'I', 'Medios de comunicación: reportajes, entrevistas…', 8),
  c('i_fotos', 'I', 'Tomar y enviar fotos', 1, 2),

  // J. GT Eventos / Incoming
  c('j_merienda_comprar', 'J', 'Merienda: comprar alimentación y bebida', 3, 5),
  c('j_merienda_decorar', 'J', 'Merienda: decoración del espacio', 3),
  c('j_merienda_preparar', 'J', 'Merienda: preparar actividades', 3, 5),
  c('j_merienda_otros', 'J', 'Merienda: otros (organizar amigo invisible, reservar espacio…)', 3),
  c('j_taller_presentar', 'J', 'Taller: preparar y presentar', 3, 5),
  c('j_taller_material', 'J', 'Taller: comprar material', 3, 5),
  c('j_taller_asistir', 'J', 'Taller: asistir', 3, 5),
  c('j_voley_entreno', 'J', 'Voleibol: asistir al entreno', 0.2),
  c('j_voley_capitan', 'J', 'Voleibol: capitán', 2),
  c('j_feria_comprar', 'J', 'Feria de Empresas: comprar alimentación y bebida', 3, 5),
  c('j_feria_decorar', 'J', 'Feria de Empresas: decorar el sitio', 3),
  c('j_mercadillo', 'J', 'Mercadillo de libros', 2.5, 5, { unidad: 'hora' }),
  c('j_reuniones_oficiales', 'J', 'Reuniones oficiales (AGO, AGA…)', 5, 10),
  c('j_internacionales', 'J', 'Eventos internacionales (Twinning, Jump, Weekend…)', 5, 10),
  c('j_recoger', 'J', 'Incoming: recoger al estudiante', 10),
  c('j_alojamiento', 'J', 'Incoming: buscar alojamiento', 15, 20),
  c('j_actividad_trainee', 'J', 'Incoming: organizar actividades con el trainee', 1, 3),

  // K. GT Outgoing (el +1 «por seguimiento» se suma a mano al rango)
  c('k_resp_interes', 'K', 'Responder: interés de un estudiante o consulta de IAESTE España', 1, 2, { nota: '+1 punto extra por seguimiento.' }),
  c('k_resp_info', 'K', 'Responder: solicitud de información sobre la asociación o prácticas', 1, 2, { nota: '+1 punto extra por seguimiento.' }),
  c('k_resp_dudas', 'K', 'Responder: dudas sobre documentación para solicitar o nominar', 1, 3, { nota: '+1 punto extra por seguimiento.' }),
  c('k_env_perfil', 'K', 'Enviar: pedir a IAESTE Andalucía que apruebe el perfil en la Exchange Platform', 1, 1, { nota: '+1 punto extra por seguimiento.' }),
  c('k_env_preguntar', 'K', 'Enviar: preguntar a IAESTE España, informar sobre becas o supervisar una nominación', 2, 2, { nota: '+1 punto extra por seguimiento.' }),
  c('k_env_info', 'K', 'Enviar: información, plantillas y guía de nominación a un solicitante', 3, 3, { nota: '+1 punto extra por seguimiento.' }),
  c('k_env_subastas', 'K', 'Enviar: reenviar correos sobre subastas', 1, 1, { nota: '+3 puntos extra por comprobar que se rellenan los formularios.' }),
  c('k_difusion', 'K', 'Difusión de prácticas sobrantes, información, plantillas y guía', 3, 3, { nota: '+1 punto extra por seguimiento.' }),
  c('k_rev_cv', 'K', 'Revisión: CV y Cover Letter', 10, 10, { unidad: 'documento' }),
  c('k_rev_student', 'K', 'Revisión: Student Nominated, Academic Record y certificado de matrícula', 5, 5, { unidad: 'documento' }),
  c('k_rev_oferta', 'K', 'Revisión: solicitud de una oferta extranjera', 3, 3, { unidad: 'documento' }),
  c('k_rev_concordancia', 'K', 'Revisión: concordancia entre los documentos', 3, 3, { unidad: 'nominación' }),
  c('k_rev_calidad', 'K', 'Revisión: presentación y calidad de los documentos', 2, 2, { unidad: 'nominación' }),
  c('k_taller_impartir', 'K', 'Taller de Outgoing: impartirlo', 5, 10),
  c('k_taller_material', 'K', 'Taller de Outgoing: material y/o coffee break', 3, 5),
  c('k_taller_organizacion', 'K', 'Taller de Outgoing: organización', 3, 5),
  c('k_taller_presentacion', 'K', 'Taller de Outgoing: preparación de la presentación', 2, 5),
  c('k_taller_asistencia', 'K', 'Taller de Outgoing: asistencia', 1),
  c('k_reg_nominaciones', 'K', 'Actualización del registro de nominaciones', 1),
  c('k_reg_prohibidos', 'K', 'Actualización del registro de personas que tienen prohibido nominar', 1),
  c('k_guia', 'K', 'Mejorar o actualizar la guía de Outgoing', 2, 5),
  c('k_idioma', 'K', 'Evaluación y certificación de nivel de idioma', 10, 10, { nota: 'El socio debe tener nivel C1 o C2 en ese idioma.' }),

  // L. GT IT (la rúbrica aún no tiene tabla)
  // M. Presencia (subastas, CP…)
  c('m_presencia', 'M', 'Presencia en evento (Subasta, CP…)', 10),
]

// Cada categoría admite además un concepto libre y una penalización (puntos libres que se guardan en negativo;
// si es de H, también baja los puntos de GT Empresas)
for (const cat of ORDEN_CATEGORIAS) {
  CATALOGO.push(c(`${cat}_otro`, cat, 'Otro (puntos libres)', undefined, undefined, {
    nota: cat === 'L' ? 'La tabla de puntos del GT IT aún no está publicada.' : undefined,
  }))
  CATALOGO.push(c(`${cat}_penalizacion`, cat, 'Penalización (resta puntos)', undefined, undefined, { penalizacion: true }))
}

const POR_ID = Object.fromEntries(CATALOGO.map((x) => [x.id, x]))
export const conceptoDe = (id) => POR_ID[id] || null
export const conceptosDe = (cat) => CATALOGO.filter((x) => x.cat === cat)

// Puntos que propone la app para un concepto y una cantidad (el admin puede cambiarlos).
// En un rango propone el mínimo; sin baremo, nada.
export function puntosSugeridos(concepto, cantidad = 1) {
  if (!concepto || concepto.min === undefined) return ''
  return Math.round(concepto.min * (Number(cantidad) || 1) * 100) / 100
}
export const rangoTexto = (c) => {
  if (!c || c.min === undefined) return 'libre'
  const u = c.unidad ? ` / ${c.unidad}` : ''
  return c.max !== c.min ? `${num(c.min)}–${num(c.max)}${u}` : `${num(c.min)}${u}`
}

// 12,5 en lugar de 12.5 y sin ceros de más
export const num = (x) => {
  const n = Math.round((Number(x) || 0) * 100) / 100
  return String(n).replace('.', ',')
}

// ---------- Campañas (años naturales, de enero a diciembre) ----------
export const PRIMERA_CAMPANA = 2026 // la campaña 2026 es la primera con datos (importada del Excel)
export const PRIMERA_CAMPANA_CRM = 2026 // desde ahí hay además puntos automáticos por empresas del CRM

export function campana(anio) {
  return { anio, id: String(anio), label: `Campaña ${anio}`, desde: `${anio}-01-01`, hasta: `${anio}-12-31` }
}
export const campanaDe = (iso) => campana(Number(iso.slice(0, 4)))
// De la actual hacia atrás
export function campanas(hoyIso) {
  const out = []
  for (let a = campanaDe(hoyIso).anio; a >= PRIMERA_CAMPANA; a--) out.push(campana(a))
  return out
}
export const dentroDe = (camp, iso) => iso >= camp.desde && iso <= camp.hasta

// ---------- Clasificación ----------
// resumen: filas de puntuacion_resumen() { usuario_id, total, gt, practica }
// auto: { [usuario_id]: puntos automáticos por empresas } (cuentan como GT Empresas)
// users: perfiles { id, nombre, centro }
// Orden (como la hoja CLASIFICACION del Excel): nivel (Práctica > Mínimo > Pendiente), total, GT Empresas, nombre.
export function clasificar({ resumen, auto, users }) {
  const porId = Object.fromEntries((resumen || []).map((r) => [r.usuario_id, r]))
  const filas = users.map((u) => {
    const r = porId[u.id] || {}
    const manual = Number(r.total) || 0
    const aut = Number(auto?.[u.id]) || 0
    const gt = (Number(r.gt) || 0) + aut
    const practica = !!r.practica
    const nivel = practica ? 2 : gt >= MINIMO_GT_EMPRESAS ? 1 : 0
    return { id: u.id, nombre: u.nombre, centro: u.centro || null, manual, auto: aut, total: manual + aut, gt, practica, nivel }
  })
  filas.sort((a, b) => b.nivel - a.nivel || b.total - a.total || b.gt - a.gt || a.nombre.localeCompare(b.nombre))
  // Mismo nivel, total y GT = mismo puesto
  filas.forEach((f, i) => {
    const p = filas[i - 1]
    f.puesto = p && p.nivel === f.nivel && p.total === f.total && p.gt === f.gt ? p.puesto : i + 1
  })
  return filas
}

// Apuntes de una persona agrupados por categoría, en el orden de la rúbrica: [{ cat, subtotal, filas }]
export function agruparPorCategoria(apuntes) {
  const out = []
  for (const cat of ORDEN_CATEGORIAS) {
    const filas = apuntes.filter((a) => a.categoria === cat).sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id - a.id)
    if (filas.length) out.push({ cat, subtotal: filas.reduce((s, a) => s + Number(a.puntos), 0), filas })
  }
  return out
}
