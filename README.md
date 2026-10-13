# CRM IAESTE Málaga

Aplicación web para gestionar el contacto con empresas del comité: quién habla con quién, en qué punto está cada conversación, cuándo toca el siguiente seguimiento y plantillas de correo compartidas y una puntuación de campaña con clasificación del equipo.

**Stack:** React 18 + Vite + Tailwind CSS v4 + Supabase (Auth + Postgres con Row Level Security). Despliegue íntegro en Vercel (web + API de correo) y Supabase.

## Roles

| Rol | Qué puede hacer |
|---|---|
| **Admin** | Ver y editar todo, crear/borrar empresas, asignarlas, registrar prácticas (empresas prioritarias), cambiar roles y centros, poner contraseñas temporales, dar y editar puntos de la rúbrica |
| **Miembro** | Ver todas las empresas (las ajenas en solo lectura). Crear empresas (quedan asignadas a él) y, en las suyas, editar contacto, CIF, estado, notas y próximo contacto. Ver su desglose de puntos y el total de los demás |

Las reglas están impuestas en la base de datos (políticas RLS y triggers), no solo en la interfaz. El primer usuario que se registra en una base vacía es admin. Siempre tiene que quedar al menos un admin.

---

## Entorno local (con base de datos propia)

Todo corre en tu máquina con el CLI de Supabase sobre Docker: Postgres, Auth, API y un buzón de correo falso. No toca ningún proyecto real.

**Requisitos:** Node 20+ y Docker Desktop abierto. La primera vez se descargan unas imágenes (unos minutos).

```bash
npm install
npm run local:setup     # arranca Supabase, aplica migraciones + datos de prueba y crea .env.development.local
npm run dev             # http://localhost:5173
```

**Todo de una vez:** `npm run local` instala lo que falte, arranca Supabase, genera los `.env`, y lanza el servicio de correo y la app. `Ctrl+C` lo apaga todo (con `--keep-db` deja Supabase encendido; `npm run local:stop` lo apaga a mano).

| Servicio | URL |
|---|---|
| App | http://localhost:5173 |
| Supabase Studio (ver/editar tablas) | http://127.0.0.1:54323 |
| Mailpit (correos de confirmación y recuperación) | http://127.0.0.1:54324 |

**Usuarios de prueba** (definidos en `supabase/seed.sql`):

| Email | Contraseña | Rol |
|---|---|---|
| ana@iaeste.test | Admin1234 | admin |
| luis@iaeste.test | Admin1234 | admin |
| marta@iaeste.test | Miembro1234 | miembro |
| pablo@iaeste.test | Miembro1234 | miembro |
| irene@iaeste.test | Miembro1234 | miembro |

Los datos de prueba (38 empresas ficticias con historial, prioritarias y bote común sin asignar) se generan con fechas relativas a hoy, así que la agenda, los avisos de seguimiento y la quincena siempre tienen algo que mostrar.

Si te registras con un email nuevo, el correo de confirmación llega a **Mailpit**, no a una bandeja real.

### Comandos útiles

| Comando | Qué hace |
|---|---|
| `npm run db:reset` | Borra la base local y la recrea desde las migraciones + seed |
| `npm run db:test` | Prueba de humo de permisos, triggers y RPCs contra la base local (modifica datos: haz `db:reset` después) |
| `npm run db:stop` / `db:start` | Apaga / enciende los contenedores (los datos se conservan) |
| `npm run db:status` | URLs y claves locales |
| `npm run db:new-migration nombre` | Crea una migración nueva en `supabase/migrations/` |
| `npm run build` | Build de producción en `dist/` |

---

## Puntuaciones y centros

Cada persona elige su **centro** (IDML, IFML, QMML, AQML o TLML) al registrarse; un admin puede cambiarlo en Equipo. La pestaña **Puntos** suma, por campaña (año natural, de enero a diciembre), los puntos automáticos por empresas del CRM (cuentan como GT Empresas) y los apuntes que dan los admins según la rúbrica. El catálogo de conceptos vive en `src/puntuaciones.js`: ahí se edita cuando cambie la rúbrica.

- Cada persona ve su desglose con motivos; de los demás, solo el total (RLS en la tabla `puntos` y RPC `puntuacion_resumen`).
- Clasificación: nivel (Práctica > Mínimo de 30 pts de GT Empresas > Pendiente), total y GT Empresas.
- Al empezar campaña, el admin anota con **Dar puntos** la antigüedad (5 por campaña) y el arrastre (la mitad de los puntos, nada si eran menos de 10 o hubo práctica), categoría «Inicio de campaña».
- Los apuntes pueden importarse sin cuenta (`usuario_id` nulo, con `socio_nombre`): se vinculan solos cuando alguien se registra con el mismo nombre. Importar datos reales (nombres) **no se hace desde el repo**, que es público: se aplica el SQL a mano con el CLI de Supabase.

## Correo (enviar y recibir desde la ficha de cada empresa)

Cada empresa tiene un hilo de correos y una caja para responder, usando un buzón compartido de Gmail por SMTP/IMAP (el equipo no necesita acceso a la cuenta de Google). Lo hace un pequeño servicio Node en `server/`: guía completa, variables y cómo crear la contraseña de aplicación en [`server/README.md`](server/README.md).

```bash
npm run server:install   # una vez
npm run correo           # http://localhost:8787 — en local envía a Mailpit
```

## Desplegar desde cero (Supabase + Vercel)

1. **Supabase:** crea un proyecto en [supabase.com](https://supabase.com). En una terminal del repo: `npx supabase login`, `npx supabase link --project-ref <ref>` y `npx supabase db push` (aplica las migraciones; **no** carga el seed).
2. **Authentication → Hooks → Before User Created:** actívalo con la función Postgres `public.hook_antes_de_crear_usuario` (bloquea correos desechables).
3. **Authentication → Sign In / Providers → Email:** deja **Confirm email** activado, longitud mínima 8 y "letters and digits". **URL Configuration:** pon la URL de Vercel como *Site URL* y en *Redirect URLs* (necesario para recuperación de contraseña y confirmación).
4. **Authentication → SMTP:** el correo por defecto de Supabase está muy limitado (pocos mensajes por hora); configura un SMTP propio para que el equipo pueda registrarse y recuperar contraseñas.
5. **Vercel:** importa el repo (detecta Vite). La API de correo corre en el mismo proyecto como función serverless (`api/index.js`), así que no hace falta ningún otro hosting. Variables de entorno:
   - `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` (Project Settings → API → *anon/publishable key*).
   - `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` (**secreta**, sin prefijo `VITE_`).
   - `GMAIL_USER`, `GMAIL_APP_PASSWORD` y, opcional, `MAIL_FROM_NAME` (ver [`server/README.md`](server/README.md) para crear la contraseña de aplicación).
   No definas `VITE_EMAIL_API_URL`: sin ella el navegador usa `/api/...` del mismo dominio.
   Los correos entrantes **no se leen en segundo plano**: se buscan en Gmail cuando alguien abre los correos de una empresa o pulsa el botón de actualizar.
6. Regístrate tú primero: serás admin. Después los demás se registran y desde la pestaña **Equipo** les asignas empresas o los haces admin.

La anon key es pública por diseño; la seguridad la imponen las políticas RLS. Nunca pongas la `service_role`/secret key en el frontend ni en el repo.

## Estructura

```
src/App.jsx                  toda la aplicación (un solo fichero a propósito)
src/supabase.js              cliente de Supabase
src/puntuaciones.js          rúbrica de puntos (catálogo) y cálculo de la clasificación
public/                      logos
supabase/migrations/         esquema de la base de datos (fuente de verdad)
server/                      servicio de correo SMTP/IMAP (Node)
supabase/seed.sql            datos de prueba SOLO para local
supabase/config.toml         configuración del Supabase local
scripts/env-local.mjs        genera .env.development.local
scripts/smoke-test.mjs       prueba de humo de la base de datos
```

### Cambiar la base de datos

Siempre con una **migración nueva** (`npm run db:new-migration nombre`), nunca editando una ya aplicada ni desde el SQL Editor sin dejar rastro. Pruébala con `npm run db:reset` y `npm run db:test`. Los estados del pipeline viven en dos sitios que deben coincidir: `ESTADOS` en `src/App.jsx` y el `check` de `empresas.estado` en la migración.

## Problemas frecuentes

| Síntoma | Causa | Solución |
|---|---|---|
| Página en blanco con error de variables | Falta `.env.development.local` | `npm run db:env` (con Supabase arrancado) |
| `local:setup` falla al conectar con Docker | Docker Desktop apagado | Ábrelo y espera a que diga *Engine running* |
| "No se han podido cargar los datos" | Supabase local parado o proyecto remoto pausado | `npm run db:start`, o *Restore project* en Supabase |
| Registro: "demasiados intentos" | Límite de correos de Supabase | Configura SMTP propio (ver arriba) |
| Un miembro no puede cambiar nombre/sector/responsable | Es la protección funcionando | Lo hace un admin |
