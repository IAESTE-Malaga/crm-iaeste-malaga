# Servicio de correo (SMTP + IMAP)

Pequeño servidor Node que conecta el CRM con **un buzón compartido de Gmail**, para que el equipo envíe y reciba correos desde la ficha de cada empresa sin tener acceso a la cuenta de Google.

```
Navegador (React) ──token de sesión──► POST /api/emails/send ──SMTP (smtp.gmail.com:465)──► Gmail
        ▲                                      │
        └─ lee emails (Supabase + RLS)         ▼
                                        Supabase (tablas contactos, emails)
                                               ▲
            Worker cada N min ── IMAP (imap.gmail.com:993): últimos días → guardar los nuevos
```

- Las credenciales de Gmail y la `service_role` key **solo viven en este servidor**. El navegador nunca las ve.
- El navegador solo **lee** `emails`/`contactos` (con las mismas reglas del CRM: admin ve todo, miembro solo lo de sus empresas). Escribir solo puede el servidor.
- **Producción (Vercel):** la API corre como función serverless (`api/index.js` en la raíz) y no hay worker: el buzón se lee a demanda con `POST /api/sync` (lo pide el CRM al abrir los correos de una empresa o al pulsar actualizar; cualquier usuario con sesión, con un enfriamiento de 45 s). En local (`npm run correo`) sigue existiendo el sondeo periódico.

## 1. Preparar la cuenta de Gmail

1. Crea (o elige) la cuenta compartida, p. ej. `crm.iaestemalaga@gmail.com`.
2. Activa la **verificación en dos pasos**: <https://myaccount.google.com/security>.
3. Crea una **contraseña de aplicación**: <https://myaccount.google.com/apppasswords> → nombre "CRM" → copia los 16 caracteres. (Si la opción no aparece: falta la verificación en dos pasos, o es una cuenta de Workspace cuyo administrador la ha desactivado.)
4. IMAP ya viene activado en cuentas nuevas. Si no: Gmail → Configuración → *Reenvío y correo POP/IMAP* → Activar IMAP.
5. Guarda la contraseña de aplicación en el gestor de contraseñas del comité. Si se filtra, se revoca en la misma página sin cambiar la contraseña real.

Límites de Gmail a tener en cuenta: ~500 correos al día en cuentas gratuitas (2.000 en Workspace). El servicio limita además a 30 envíos/hora por persona (contados en la base de datos) (`SENDS_PER_HOUR_PER_USER`).

## 2. Base de datos

Las tablas están en `supabase/migrations/20261008000000_correo.sql` (`npx supabase db push` en producción). Los adjuntos (`20261014000000_adjuntos.sql`) usan el bucket privado `adjuntos` de Supabase Storage y una columna `adjuntos` (jsonb) en `emails` y `plantillas`.

| Tabla | Para qué |
|---|---|
| `contactos` | Una fila por dirección de correo (`email` único, en minúsculas). `empresa_id` vacío = remitente sin clasificar (solo lo ven los admins). |
| `emails` | `direccion` (`entrante`/`saliente`), `remitente`, `destinatario`, `asunto`, `cuerpo_texto`, `cuerpo_html`, `enviado_en`, `message_id` **único** (evita duplicados), `in_reply_to`/`referencias` (hilos), `empresa_id`, `contacto_id`, `enviado_por`. |

## 3. Variables de entorno

Ver `.env.example`. Las imprescindibles: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `CORS_ORIGINS` (la URL del CRM en Vercel).

Para SMTP por STARTTLS en lugar de SSL: `SMTP_PORT=587` y `SMTP_SECURE=false`.

## 4. Ejecutar

**Local** (con `npm run local:setup` ya hecho, el `server/.env` se genera solo y envía a Mailpit, sin IMAP):

```bash
npm run server:install
npm run correo          # http://localhost:8787
npm run dev             # en otra terminal
```

Los correos enviados en local aparecen en Mailpit (<http://127.0.0.1:54324>).

**Probar Gmail de verdad**: copia `.env.example` a `server/.env`, pon tus credenciales (y borra las líneas `SMTP_*`), y ejecuta una vuelta suelta:

```bash
npm --prefix server run sync    # revisa los últimos días de la bandeja y guarda los correos nuevos
```

**Producción (Vercel)**: no hay que desplegar `server/` aparte. Define en Vercel `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GMAIL_USER`, `GMAIL_APP_PASSWORD` (y `MAIL_FROM_NAME`) y deja sin definir `VITE_EMAIL_API_URL`. Comprueba `GET /api/health`. Si prefieres un hosting Node propio, `npm start` en `server/` sigue funcionando (entonces sí hacen falta `CORS_ORIGINS` y `VITE_EMAIL_API_URL`).

## 5. Cómo funciona

**Envío** (`POST /api/emails/send`, cabecera `Authorization: Bearer <token de sesión>`): comprueba la sesión, que el usuario lleve esa empresa (o sea admin) y que el destinatario **pertenezca a la empresa** (email de la ficha o contacto suyo) — así la cuenta compartida no sirve de relé de spam. Envía por SMTP con `Message-ID` propio y cabeceras `In-Reply-To`/`References` si responde a un correo, y lo guarda ligado al contacto. El cuerpo se envía como texto + HTML escapado.

**Adjuntos al enviar:** el navegador sube los archivos directamente a Storage (la función serverless de Vercel solo admite ~4,5 MB por petición) y a `/api/emails/send` solo le manda sus rutas (`adjuntos: [{ path, nombre }]`). El servicio solo acepta rutas de ese mismo correo (`correos/<empresa>/…`) o de una plantilla (`plantillas/<id>/…`), con un máximo de 10 archivos y 18 MB en total; los descarga con la service_role y los adjunta. Los de plantilla se copian a `correos/<empresa>/` para que el correo enviado conserve sus archivos aunque la plantilla cambie. Los permisos de Storage (RLS) siguen las reglas del CRM: un admin o el responsable de la empresa para `correos/`, todo el equipo para `plantillas/`.

**Recepción** (a demanda con `POST /api/sync`; en un servidor propio, también cada `SYNC_INTERVAL_MINUTES`, por defecto 3): conecta por IMAP, revisa los correos de INBOX de los últimos `SYNC_LOOKBACK_DAYS` días (por defecto 7), **estén leídos o no**, y se descarga solo los que no conoce (compara por `Message-ID`). Por cada uno: interpreta el MIME (`mailparser`: multipart, quoted-printable/base64, charsets, cabeceras codificadas; los adjuntos se ignoran), busca la empresa y guarda. No cambia ningún indicador en Gmail (leído, etiquetas…).

Cómo se asocia un remitente a una empresa, por orden:
1. Ya es un contacto conocido con empresa.
2. Responde (`In-Reply-To`/`References`) a un correo que ya tenemos.
3. Su dirección aparece, de forma inequívoca, en el campo *Email* de la ficha de una empresa.
4. Si nada: se crea un contacto **sin empresa** (los admins lo ven y pueden vincularlo).

**Duplicados**: `emails.message_id` es único y la inserción usa `upsert … ignoreDuplicates`; reprocesar el mismo correo es inocuo. Si un correo no trae `Message-ID`, se inventa uno estable a partir del contenido.

**Errores**: si falla la base de datos o la red, el correo se reintenta en la siguiente vuelta mientras siga dentro de la ventana de días; un correo ilegible o gigante (>15 MB) se ignora y se registra en el log, sin atascar la cola; no hay vueltas solapadas; un corte de conexión IMAP no tumba el proceso. Si el correo salió pero no se pudo guardar, el usuario ve un aviso explícito para que no lo reenvíe.

## 6. Seguridad y límites conocidos

- Los correos entrantes se muestran **solo como texto plano**. `cuerpo_html` se guarda tal cual llegó pero no se pinta nunca; si algún día lo muestras, pásalo antes por un sanitizador (DOMPurify) dentro de un iframe `sandbox`.
- Ven los correos de una empresa: los admins y su responsable. Un remitente sin clasificar solo lo ven los admins.
- Al conectar el servicio por primera vez se importa todo lo que haya en la bandeja de los últimos `SYNC_LOOKBACK_DAYS` días (leído o no); lo anterior no se importa. Si un correo tarda más que esa ventana en sincronizarse, se pierde: no dejes el CRM sin abrir más de ese tiempo.
- No se guardan adjuntos. Rebotes (`MAILER-DAEMON`) y newsletters que lleguen al buzón se guardan como contactos sin empresa; conviene usar un buzón dedicado.
- Vincular a mano un contacto sin empresa todavía no tiene pantalla; se hace en Supabase Studio (`contactos.empresa_id` y `emails.empresa_id`).

## 7. Pruebas

```bash
npm --prefix server test   # requiere Supabase local arrancado; modifica datos: después, npm run db:reset
```

Cubren: parseo MIME (multipart, charsets, adjuntos, sin Message-ID), ingesta (asociación, duplicados, hilos, concurrencia), API de envío (sesión, permisos, destinatarios, validación, hilo) con entrega real a Mailpit, y RLS de lectura. **La conexión IMAP real con Gmail no está cubierta por tests**: pruébala una vez con `npm --prefix server run sync`.
