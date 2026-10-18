// Importa un CSV de empresas (id,nombre,cif,estado,fuente,telefono,email) como «sin asignar»,
// para que el equipo las vaya reclamando desde su ficha.
//
// Uso (desde la raíz del proyecto; server/.env tiene SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY):
//   node --env-file=server/.env scripts/importar-empresas.mjs ruta/al/fichero.csv --dry-run
//   node --env-file=server/.env scripts/importar-empresas.mjs ruta/al/fichero.csv
//
// --dry-run no se conecta a la base de datos: solo valida el CSV y muestra qué se importaría.
// Es seguro repetirlo: se saltan las empresas que ya están en el CRM (mismo CIF, o mismo
// nombre si no tienen CIF).
// Reglas:
//   - CIF repetido dentro del CSV: se queda una fila (la «ok», si hay varias; si no, la primera).
//   - CIF vacío o «0» (no encontrado): se importa sin CIF.
//   - «fuente» casi siempre es el directorio de donde salen los datos (iberinform, empresia…).
//     Solo se guarda como web la URL que apunta a la empresa (p. ej. «web:https://…»).
//   - «estado» del CSV (ok, dudoso, no-encontrado…) no se guarda: todas entran como «Sin contactar».
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const CABECERA = 'id,nombre,cif,estado,fuente,telefono,email'
const TAMANO_LOTE = 100

// CSV con comillas y saltos de línea CRLF o LF (sin dependencias)
function parsearCsv(texto) {
  const filas = []
  let fila = []
  let campo = ''
  let entreComillas = false
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]
    if (entreComillas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++ }
      else if (c === '"') entreComillas = false
      else campo += c
    } else if (c === '"') {
      entreComillas = true
    } else if (c === ',') {
      fila.push(campo); campo = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++
      fila.push(campo); filas.push(fila)
      fila = []; campo = ''
    } else {
      campo += c
    }
  }
  if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila) }
  return filas.filter((f) => f.some((x) => x.trim() !== ''))
}

// Igual que cifNorm en src/App.jsx y que el índice empresas_cif_unico (más de 5 caracteres)
const normCif = (cif) => String(cif || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase()
const claveNombre = (nombre) => String(nombre || '').trim().replace(/\s+/g, ' ').toLowerCase()

// Webs de directorios (fuente de los datos), que no son la web de la empresa
const DIRECTORIOS = /iberinform|datoscif|infonif|economia3|axesor|empresia|empresite|informa\.es/i
function webDe(fuente) {
  const m = fuente.match(/^web:\s*(https?:\/\/\S+)/i) || fuente.match(/^(https?:\/\/\S+)/i)
  return m && !DIRECTORIOS.test(m[1]) ? m[1] : ''
}

function aEmpresa(fila) {
  const [id, nombre, cif, estado, fuente, telefono, email] = fila.map((x) => x.trim())
  const cifNorm = normCif(cif).length > 5 ? normCif(cif) : ''
  return {
    id: parseInt(id, 10),
    estadoCsv: estado,
    nombre,
    cif: cifNorm ? cif : '',
    cifNorm,
    web: webDe(fuente),
    telefono,
    email,
  }
}

// Todas las empresas del CRM (paginado; el servicio puede devolver de 1000 en 1000)
async function empresasExistentes(db) {
  const filas = []
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await db.from('empresas').select('nombre,cif').order('id').range(desde, desde + 999)
    if (error) throw error
    filas.push(...data)
    if (data.length < 1000) return filas
  }
}

const [, , ruta, ...opciones] = process.argv
const dryRun = opciones.includes('--dry-run')
if (!ruta) {
  console.error('Uso: node --env-file=server/.env scripts/importar-empresas.mjs <fichero.csv> [--dry-run]')
  process.exit(1)
}

const texto = readFileSync(ruta, 'utf8').replace(/^﻿/, '')
const [cabecera, ...filas] = parsearCsv(texto)
if (cabecera.join(',') !== CABECERA) {
  throw new Error(`Cabecera inesperada: «${cabecera.join(',')}». Se esperaba «${CABECERA}».`)
}
const candidatas = filas.map(aEmpresa)

// 1. CIF repetido dentro del CSV: se queda una
const grupos = new Map()
for (const e of candidatas) {
  if (!e.cifNorm) continue
  if (!grupos.has(e.cifNorm)) grupos.set(e.cifNorm, [])
  grupos.get(e.cifNorm).push(e)
}
const descartadas = []
const descartadasSet = new Set()
for (const grupo of grupos.values()) {
  const ordenadas = [...grupo].sort((a, b) =>
    (a.estadoCsv === 'ok' ? 0 : 1) - (b.estadoCsv === 'ok' ? 0 : 1) || a.id - b.id)
  const [elegida, ...resto] = ordenadas
  for (const r of resto) {
    descartadas.push({ empresa: r, motivo: `CIF repetido en el CSV (se queda «${elegida.nombre}»)` })
    descartadasSet.add(r)
  }
}
const unicas = candidatas.filter((e) => !descartadasSet.has(e))

// 2. Lo que ya está en el CRM (no se toca)
const db = dryRun ? null : (() => {
  const url = process.env.SUPABASE_URL
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !clave) {
    console.error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY. Usa --env-file=server/.env o --dry-run.')
    process.exit(1)
  }
  return createClient(url, clave, { auth: { persistSession: false } })
})()

const existentes = dryRun ? [] : await empresasExistentes(db)
const cifsExistentes = new Set(existentes.map((e) => normCif(e.cif)).filter((c) => c.length > 5))
const nombresExistentes = new Set(existentes.map((e) => claveNombre(e.nombre)))

const nuevas = []
const yaExisten = []
for (const e of unicas) {
  if (e.cifNorm && cifsExistentes.has(e.cifNorm)) {
    yaExisten.push({ empresa: e, motivo: 'ya está en el CRM (mismo CIF)' })
  } else if (!e.cifNorm && nombresExistentes.has(claveNombre(e.nombre))) {
    yaExisten.push({ empresa: e, motivo: 'ya está en el CRM (mismo nombre, sin CIF)' })
  } else {
    nuevas.push(e)
  }
}

const sinCif = nuevas.filter((e) => !e.cifNorm).length
console.log(`CSV: ${candidatas.length} filas`)
console.log(`  CIF repetido dentro del CSV (se descartan): ${descartadas.length}`)
console.log(`  ya en el CRM (se saltan): ${dryRun ? 'no comprobado (--dry-run)' : yaExisten.length}`)
console.log(`  a importar: ${nuevas.length} (de ellas sin CIF: ${sinCif})`)
console.log(`  con web: ${nuevas.filter((e) => e.web).length} · con email: ${nuevas.filter((e) => e.email).length} · con teléfono: ${nuevas.filter((e) => e.telefono).length}`)

if (descartadas.length) {
  console.log('\nCIF repetidos (descartados):')
  for (const { empresa, motivo } of descartadas) {
    console.log(`  - fila ${empresa.id} «${empresa.nombre}» [${empresa.cifNorm}]: ${motivo}`)
  }
}
if (yaExisten.length) {
  console.log('\nYa en el CRM (saltadas):')
  for (const { empresa, motivo } of yaExisten) console.log(`  - «${empresa.nombre}»: ${motivo}`)
}

if (dryRun) {
  console.log('\n--dry-run: no se ha escrito nada.')
  process.exit(0)
}

// 3. Insertar. Entran sin responsable (bote común) y en «Sin contactar».
let insertadas = 0
for (let i = 0; i < nuevas.length; i += TAMANO_LOTE) {
  const lote = nuevas.slice(i, i + TAMANO_LOTE).map((e) => ({
    nombre: e.nombre,
    cif: e.cif,
    telefono: e.telefono,
    email: e.email,
    web: e.web,
    estado: 'sin_contactar',
    responsable: null,
    actualizado_por: 'Importación CSV',
  }))
  const { error } = await db.from('empresas').insert(lote)
  if (error) {
    throw new Error(`Error en el lote que empieza en la fila ${i + 1} (${insertadas} ya insertadas): ${error.message}. Puedes repetir el comando: lo ya insertado se salta.`)
  }
  insertadas += lote.length
  console.log(`  insertadas ${insertadas}/${nuevas.length}`)
}
console.log(`\nListo: ${insertadas} empresas importadas como «sin asignar».`)
