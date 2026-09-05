# CRM IAESTE Madrid

Aplicación web para gestionar el contacto con empresas del comité: quién habla con quién, en qué punto está cada conversación y cuándo toca el siguiente seguimiento.

**Stack:** React + Vite + Tailwind CSS v4 + Supabase (autenticación y base de datos con Row Level Security) + Vercel.

---

## Índice

1. [Cómo funciona](#1-cómo-funciona)
2. [Uso diario](#2-uso-diario)
3. [Administración](#3-administración)
4. [Copias de seguridad](#4-copias-de-seguridad)
5. [Traspaso entre comités](#5-traspaso-entre-comités)
6. [Levantar el proyecto desde cero](#6-levantar-el-proyecto-desde-cero)
7. [Desarrollo en local](#7-desarrollo-en-local)
8. [Problemas frecuentes](#8-problemas-frecuentes)

---

## 1. Cómo funciona

### Roles

| Rol | Qué ve | Qué puede hacer |
|---|---|---|
| **Admin** | Todas las empresas | Crear, editar y eliminar empresas, asignar responsables, cambiar roles del equipo |
| **Miembro** | Solo las empresas asignadas a él | Cambiar estado, notas y próximo contacto |

Esta separación está impuesta en la base de datos (políticas RLS y un trigger de guardia), no solo en la interfaz. Un miembro no puede saltársela aunque manipule el navegador.

### Estados del pipeline

`Sin contactar` · `No lo cogen` · `Mail enviado` · `Para más adelante` · `Segundo plazo` · `Otra provincia` · `Muy interesados` · `Beca conseguida` · `No quieren`

No hay orden obligatorio: se pasa de cualquiera a cualquiera.

---

## 2. Uso diario

**Buscar** — la barra de búsqueda filtra por nombre de empresa, CIF, contacto o sector.

**Filtrar** — pulsa cualquier estado para ver solo esas empresas; vuelve a pulsarlo para quitar el filtro. El desplegable "Todo el equipo" filtra por responsable.

**Agenda** — los botones de "hoy" y "atrasadas" muestran las empresas cuyo *próximo contacto* toca hoy o ya venció. Es la vista con la que conviene empezar el día.

**Actualizar una empresa** — pulsa la fila para abrir la ficha. Cambia el estado, escribe en notas lo que se habló y pon la fecha del siguiente seguimiento antes de cerrar.

**Escribir un email** — desde la ficha, el botón de correo abre el gestor de email con una plantilla de presentación de IAESTE ya redactada, dirigida al contacto de la empresa. Revísala antes de enviar.

**Exportar** — el botón *Exportar* descarga un CSV con las empresas que estés viendo en ese momento (respeta los filtros activos). Separador `;` y codificación UTF-8 con BOM, así que Excel en español lo abre bien de doble clic.

**Pestaña Equipo** (solo admins) — lista de miembros, cuántas empresas lleva cada uno, gráfica de reparto y botón para ascender a alguien a admin. La gráfica se puede descargar como PNG.

---

## 3. Administración

### Dar de alta a alguien nuevo

1. La persona entra en la URL de la app y pulsa **"¿No tienes cuenta? Regístrate"**
2. Se registra con su email y una contraseña
3. Entra automáticamente como **miembro**, sin empresas asignadas
4. Un admin le asigna empresas desde la ficha de cada una (campo *Responsable*)

No hace falta verificar el correo: la confirmación por email está desactivada a propósito.

> **Ojo:** cualquiera que conozca la URL puede registrarse. No es un problema grave —entra sin ver nada, porque las políticas RLS solo muestran las empresas asignadas— pero conviene revisar la pestaña *Equipo* de vez en cuando y borrar cuentas desconocidas desde Supabase (*Authentication → Users*).

### Ascender a alguien a admin

Pestaña **Equipo** → botón junto a su nombre. Hazlo siempre con al menos dos personas, para que nunca dependa todo de una sola cuenta.

### El primer usuario

El primero que se registra en una instalación nueva se convierte en admin automáticamente. A partir del segundo, todos entran como miembros.

---

## 4. Copias de seguridad

El plan gratuito de Supabase **no garantiza backups recuperables**. Haz esto una vez al mes:

1. Entra en la app como admin
2. Quita todos los filtros (pestaña "Todas")
3. Pulsa **Exportar**
4. Guarda el CSV en el Drive del comité, en una carpeta `CRM/backups/`

Son treinta segundos y es la única red de seguridad real que tenéis. El nombre del fichero ya lleva la fecha.

> **Además:** en el plan gratuito, Supabase **pausa** los proyectos tras un periodo de inactividad. Si nadie entra durante el verano, al volver veréis un botón *Restore project* en el panel de Supabase. Los datos no se pierden, pero la app no funciona hasta pulsarlo.

---

## 5. Traspaso entre comités

Esta es la parte que se olvida y la que deja el proyecto huérfano. Al cambiar de responsable hay que traspasar **tres cuentas**, no solo el código.

### Estado actual (septiembre 2026)

- [x] **Supabase** — proyecto transferido a la organización **IAESTE Madrid**
- [x] **GitHub** — repositorio movido a la organización del comité
- [x] **Backup** — CSV completo exportado al Drive del comité
- [ ] **Supabase · Owners** — confirmar que las dos personas invitadas han **aceptado** la invitación (mientras figuren como *Pending* en *Settings → Team*, el traspaso no está hecho)
- [ ] **Credenciales** — guardar `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` en el gestor de contraseñas del comité
- [ ] **Admins** — asegurarse de que hay al menos dos admins activos en la pestaña *Equipo*

> ### ⚠️ PENDIENTE: Vercel sigue en una cuenta personal
>
> El despliegue está en la cuenta personal de **Mario Verdyguer**, no en una cuenta del comité.
> Quedó así porque en su momento no existía un correo del comité con el que registrarla.
>
> **Esto hay que resolverlo.** Mientras siga pendiente, nadie más puede redesplegar
> ni cambiar las variables de entorno desde el panel de Vercel.
>
> **La app no se pierde**, porque los datos viven en Supabase y el código en GitHub:
> con las dos claves de la sección siguiente, cualquiera puede volver a desplegarla
> en unos minutos. Instrucciones en [Desplegar en Vercel](#desplegar-en-vercel).
>
> Para cerrarlo del todo:
> 1. Crear un correo del comité (vale un Gmail tipo `crm.iaestemadrid@gmail.com`)
> 2. Registrar una cuenta de Vercel con ese correo, con **email y contraseña** — nunca con "Continue with GitHub", o volvería a depender de una persona
> 3. Guardar esas credenciales en el gestor de contraseñas
> 4. Importar el repo desde la organización de GitHub y añadir las dos variables de entorno
> 5. Verificar que la app nueva carga y muestra todas las empresas
> 6. Solo entonces, borrar el proyecto antiguo de la cuenta personal
>
> La URL cambiará al hacerlo. Avisad al equipo.
>
> **Nota sobre el plan gratuito:** el plan Hobby de Vercel es de un solo usuario y no
> admite colaboración en repositorios privados, así que la única vía gratuita es una
> **cuenta compartida** cuyas credenciales estén en el gestor de contraseñas. No existe
> la opción de "invitar" a alguien sin pasar al plan Pro (20 $/mes por asiento).

### Checklist para futuros traspasos

- [ ] **Backup** — exportar el CSV completo antes de tocar nada
- [ ] **Supabase** — *Project Settings → General → Transfer project* a la organización del comité
- [ ] **GitHub** — mover el repositorio a la organización del comité
- [ ] **Vercel** — cuenta compartida con el correo del comité (ver aviso de arriba)
- [ ] **Credenciales** — las dos claves en el gestor de contraseñas, nunca en un documento suelto ni en el repositorio
- [ ] **Accesos** — mínimo **dos** personas con rol *Owner* en cada plataforma, y confirmar que aceptan la invitación
- [ ] **Admins** — mínimo dos admins activos en la pestaña *Equipo*

### Dónde están las claves

En *Supabase → Project Settings → API*:

- **Project URL** → variable `VITE_SUPABASE_URL`
- **anon public key** → variable `VITE_SUPABASE_ANON_KEY`

La `anon key` es pública por diseño: va dentro del JavaScript que se descarga cualquier visitante. La seguridad real la imponen las políticas RLS, no el secreto de esa clave. Lo que **nunca** debe salir de Supabase es la `service_role key`, que se salta todas las políticas.

---

## 6. Levantar el proyecto desde cero

Solo necesario si se pierde el acceso al proyecto de Supabase o se quiere empezar en otra cuenta.

1. **supabase.com** → *New project* (plan gratuito)
2. *SQL Editor* → pega el contenido completo de `supabase/schema.sql` → **Run**
3. *Authentication → Sign In / Up → Email* → desactiva **Confirm email**
4. *Project Settings → API* → copia la Project URL y la anon key
5. Despliega en Vercel (ver abajo) con esas dos variables
6. Regístrate tú el primero: serás admin
7. Importa las empresas desde el último CSV de backup (*Table Editor → empresas → Import data from CSV*)

> `supabase/schema.sql` es **documentación**, no una migración. Está pensado para ejecutarse una sola vez sobre un proyecto **vacío**. Si lo ejecutas contra una base de datos que ya existe, fallará con `relation "profiles" already exists` — sin causar daño, porque Supabase lo ejecuta en una transacción y hace rollback.

### Desplegar en Vercel

1. El código tiene que estar en GitHub
2. **vercel.com** → *Add New Project* → importa el repositorio (detecta Vite solo)
3. En *Environment Variables* añade `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`
4. **Deploy** y comparte la URL con el equipo

Cada `push` a `main` redespliega automáticamente.

---

## 7. Desarrollo en local

```bash
git clone <url-del-repo>
cd CRM
cp .env.example .env      # rellena con la URL y la anon key
npm install
npm run dev
```

`.env` está en `.gitignore`. **No lo subas nunca al repositorio.**

### Estructura

```
src/App.jsx           todo el código de la aplicación (~770 líneas)
src/supabase.js       cliente de Supabase
src/main.jsx          punto de entrada
supabase/schema.sql   esquema de la base de datos (documentación)
```

Está deliberadamente concentrado en un único fichero: para un proyecto de este tamaño es más fácil de leer y de traspasar que repartido en veinte componentes.

### Si cambias la base de datos

Cada vez que añadas una columna o modifiques una política desde el SQL Editor, **actualiza también `supabase/schema.sql` y haz commit**. Si no, el fichero deja de servir para recrear el proyecto y el próximo comité se encuentra con una app que no arranca.

Los estados del pipeline viven en dos sitios que deben coincidir: la constante `ESTADOS` en `src/App.jsx` y el `check` de la columna `estado` en `schema.sql`.

---

## 8. Problemas frecuentes

| Síntoma | Causa probable | Solución |
|---|---|---|
| La app carga en blanco o no conecta | Proyecto de Supabase pausado por inactividad | Panel de Supabase → *Restore project* |
| "Email o contraseña incorrectos" | Credenciales mal escritas | *Authentication → Users* en Supabase para comprobar que la cuenta existe |
| Un miembro no ve ninguna empresa | No tiene ninguna asignada | Un admin le asigna responsable desde la ficha de la empresa |
| Error al guardar: "Solo un admin puede modificar los datos" | Un miembro intentó cambiar un campo reservado | Correcto, es la protección funcionando |
| `relation "profiles" already exists` | Se ejecutó `schema.sql` sobre una base de datos existente | Ninguna: no ha pasado nada, la transacción hizo rollback |
| El CSV se ve mal en Excel | Configuración regional | El fichero usa `;` y UTF-8 con BOM; si falla, *Datos → Desde texto* |
| Cambios en el código que no aparecen | Despliegue fallido | Panel de Vercel → pestaña *Deployments* → revisar el log del último build |