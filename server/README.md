# Servicio de correo (SMTP + IMAP)

Pequeño servidor Node que conecta el CRM con **un buzón compartido de Gmail**, para que el equipo envíe y reciba correos desde la ficha de cada empresa sin tener acceso a la cuenta de Google.

```
Navegador (React) ──token de sesión──► POST /api/emails/send ──SMTP (smtp.gmail.com:465)──► Gmail
        ▲                                      │
        └─ lee emails (Supabase + RLS)         ▼
                                        Supabase (tablas contactos, emails)
                                               ▲
            Worker cada N min ── IMAP (imap.gmail.com:993): no leídos → guardar → marcar como leído
```

- Las credenciales de Gmail y la `service_role` key **solo viven en este servidor**. El navegador nunca las ve.
- El navegador solo **lee** `emails`/`contactos` (con las mismas reglas del CRM: admin ve todo, miembro solo lo de sus empresas). Escribir solo puede el servidor.
- No puede ir en Vercel: el worker IMAP es un proceso que se queda corriendo. Sirve cualquier hosting Node (Railway, Render, Fly.io, un VPS…).

## 1. Preparar la cuenta de Gmail

1. Crea (o elige) la cuenta compartida, p. ej. `crm.iaestemadrid@gmail.com`.
2. Activa la **verificación en dos pasos**: <https://myaccount.google.com/security>.
3. Crea una **contraseña de aplicación**: <https://myaccount.google.com/apppasswords> → nombre "CRM" → copia los 16 caracteres. (Si la opción no aparece: falta la verificación en dos pasos, o es una cuenta de Workspace cuyo administrador la ha desactivado.)
4. IMAP ya viene activado en cuentas nuevas. Si no: Gmail → Configuración → *Reenvío y correo POP/IMAP* → Activar IMAP.
5. Guarda la contraseña de aplicación en el gestor de contraseñas del comité. Si se filtra, se revoca en la misma página sin cambiar la contraseña real.

Límites de Gmail a tener en cuenta: ~500 correos al día en cuentas gratuitas (2.000 en Workspace). El servicio limita además a 30 envíos/hora por persona (`SENDS_PER_HOUR_PER_USER`).

## 2. Base de datos

Las tablas están en `supabase/migrations/20261008000000_correo.sql` (`npx supabase db push` en producción).

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
npm --prefix server run sync    # lee los no leídos, los guarda y los marca como leídos
```

**Producción**: despliega la carpeta `server/` (comando `npm install`, arranque `npm start`), define las variables en el panel del hosting, y en Vercel añade `VITE_EMAIL_API_URL=https://tu-servicio.example`. Comprueba `GET /health`. Mantén **una sola instancia** del servicio (si hubiera dos, no se duplicaría nada gracias a `message_id`, pero se haría trabajo doble).

## 5. Cómo funciona

**Envío** (`POST /api/emails/send`, cabecera `Authorization: Bearer <token de sesión>`): comprueba la sesión, que el usuario lleve esa empresa (o sea admin) y que el destinatario **pertenezca a la empresa** (email de la ficha o contacto suyo) — así la cuenta compartida no sirve de relé de spam. Envía por SMTP con `Message-ID` propio y cabeceras `In-Reply-To`/`References` si responde a un correo, y lo guarda ligado al contacto. El cuerpo se envía como texto + HTML escapado.

**Recepción** (cada `SYNC_INTERVAL_MINUTES`, por defecto 3): conecta por IMAP, busca los **no leídos** de INBOX y por cada uno: interpreta el MIME (`mailparser`: multipart, quoted-printable/base64, charsets, cabeceras codificadas; los adjuntos se ignoran), busca la empresa y guarda. Solo **después de guardar** lo marca como leído.

Cómo se asocia un remitente a una empresa, por orden:
1. Ya es un contacto conocido con empresa.
2. Responde (`In-Reply-To`/`References`) a un correo que ya tenemos.
3. Su dirección aparece, de forma inequívoca, en el campo *Email* de la ficha de una empresa.
4. Si nada: se crea un contacto **sin empresa** (los admins lo ven y pueden vincularlo).

**Duplicados**: `emails.message_id` es único y la inserción usa `upsert … ignoreDuplicates`; reprocesar el mismo correo es inocuo. Si un correo no trae `Message-ID`, se inventa uno estable a partir del contenido.

**Errores**: si falla la base de datos o la red, el correo **no** se marca como leído y se reintenta en la siguiente vuelta; un correo ilegible o gigante (>15 MB) se marca como leído y se registra en el log para no atascar la cola; no hay vueltas solapadas; un corte de conexión IMAP no tumba el proceso. Si el correo salió pero no se pudo guardar, el usuario ve un aviso explícito para que no lo reenvíe.

## 6. Seguridad y límites conocidos

- Los correos entrantes se muestran **solo como texto plano**. `cuerpo_html` se guarda tal cual llegó pero no se pinta nunca; si algún día lo muestras, pásalo antes por un sanitizador (DOMPurify) dentro de un iframe `sandbox`.
- Ven los correos de una empresa: los admins y su responsable. Un remitente sin clasificar solo lo ven los admins.
- Los correos que **ya estuvieran leídos** en el buzón antes de conectar el servicio no se importan (solo los no leídos).
- No se guardan adjuntos. Rebotes (`MAILER-DAEMON`) y newsletters que lleguen al buzón se guardan como contactos sin empresa; conviene usar un buzón dedicado.
- Vincular a mano un contacto sin empresa todavía no tiene pantalla; se hace en Supabase Studio (`contactos.empresa_id` y `emails.empresa_id`).

## 7. Pruebas

```bash
npm --prefix server test   # requiere Supabase local arrancado; modifica datos: después, npm run db:reset
```

Cubren: parseo MIME (multipart, charsets, adjuntos, sin Message-ID), ingesta (asociación, duplicados, hilos, concurrencia), API de envío (sesión, permisos, destinatarios, validación, hilo) con entrega real a Mailpit, y RLS de lectura. **La conexión IMAP real con Gmail no está cubierta por tests**: pruébala una vez con `npm --prefix server run sync`.
