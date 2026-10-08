-- ============================================================
-- Correo bidireccional (buzón compartido de Gmail vía SMTP/IMAP)
--
-- Solo el servicio de correo (server/, con la service_role key) escribe en estas tablas.
-- Desde el navegador únicamente se pueden LEER, y con las mismas reglas que el resto del CRM:
-- un admin ve todo; un miembro, los correos de las empresas que lleva.
-- ============================================================

-- Contactos: una fila por dirección de correo que ha escrito o a la que hemos escrito.
-- empresa_id queda vacío cuando el remitente no se ha podido asociar a ninguna empresa
-- (solo lo ven los admins, que pueden vincularlo a mano).
create table public.contactos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references public.empresas (id) on delete set null,
  nombre text,
  email text not null unique check (email = lower(email)),
  creado timestamptz not null default now()
);
create index contactos_empresa_idx on public.contactos (empresa_id);

-- Comunicaciones
create table public.emails (
  id uuid primary key default gen_random_uuid(),
  direccion text not null check (direccion in ('entrante', 'saliente')),
  contacto_id uuid references public.contactos (id) on delete set null,
  empresa_id uuid references public.empresas (id) on delete set null,
  message_id text not null unique,        -- cabecera Message-ID: evita ingerir dos veces el mismo correo
  in_reply_to text,
  referencias text,
  remitente text not null,
  destinatario text not null,
  asunto text not null default '',
  cuerpo_texto text not null default '',
  cuerpo_html text,                       -- tal cual llegó: NUNCA se pinta sin sanear
  enviado_en timestamptz not null,        -- fecha del correo (cabecera Date / momento del envío)
  recibido_en timestamptz not null default now(),
  enviado_por uuid references public.profiles (id) on delete set null  -- quién lo mandó desde el CRM
);
create index emails_empresa_idx on public.emails (empresa_id, enviado_en);
create index emails_contacto_idx on public.emails (contacto_id);
create index emails_in_reply_to_idx on public.emails (in_reply_to);

alter table public.contactos enable row level security;
alter table public.emails    enable row level security;

revoke all on public.contactos, public.emails from anon;
revoke insert, update, delete, truncate on public.contactos, public.emails from authenticated;

create policy "contactos_select" on public.contactos
  for select to authenticated
  using (
    public.is_admin()
    or exists (select 1 from public.empresas e where e.id = empresa_id and e.responsable = auth.uid())
  );

create policy "emails_select" on public.emails
  for select to authenticated
  using (
    public.is_admin()
    or exists (select 1 from public.empresas e where e.id = empresa_id and e.responsable = auth.uid())
  );
