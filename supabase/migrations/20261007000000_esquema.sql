-- ============================================================
-- CRM IAESTE — Esquema completo
--
-- Local:      `npm run db:reset` lo aplica (junto con seed.sql) sobre la base local.
-- Producción: `npx supabase link` + `npx supabase db push`, o pega las migraciones en
--             orden en Supabase > SQL Editor sobre un proyecto VACÍO.
--
-- Si cambias la base de datos, hazlo con una migración NUEVA en supabase/migrations
-- (`npx supabase migration new <nombre>`), nunca editando una ya aplicada.
-- Los estados deben coincidir con la constante ESTADOS de src/App.jsx.
-- ============================================================

create extension if not exists pgcrypto with schema extensions;

-- ------------------------------------------------------------
-- 1. Perfiles (uno por usuario registrado)
-- ------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nombre text not null,
  rol text not null default 'miembro' check (rol in ('admin', 'miembro')),
  creado timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 2. Empresas
-- ------------------------------------------------------------
create table public.empresas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(btrim(nombre)) > 0),
  cif text default '',
  sector text default '',
  contacto text default '',
  email text default '',
  telefono text default '',
  direccion text default '',
  responsable uuid references public.profiles (id) on delete set null,
  estado text not null default 'sin_contactar'
    check (estado in (
      'sin_contactar', 'no_contesta', 'mail_enviado', 'mas_adelante', 'segundo_plazo',
      'otra_provincia', 'interesados', 'beca', 'no_existe', 'rechazada'
    )),
  notas text,                                   -- última nota de seguimiento (el histórico está en historial)
  proximo_contacto date,
  historica boolean not null default false,     -- la mantiene el trigger de practicas
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now(),
  actualizado_por text default ''
);

-- CIF único, comparado sin espacios/guiones/puntos y en mayúsculas (igual que cifNorm en App.jsx).
-- El nombre del índice contiene «cif»: la app lo usa para mostrar un mensaje claro.
create unique index empresas_cif_unico on public.empresas
  (upper(regexp_replace(cif, '[^A-Za-z0-9]', '', 'g')))
  where length(regexp_replace(coalesce(cif, ''), '[^A-Za-z0-9]', '', 'g')) > 5;

create index empresas_responsable_idx on public.empresas (responsable);
create index empresas_estado_idx on public.empresas (estado);
create index empresas_proximo_idx on public.empresas (proximo_contacto);

-- ------------------------------------------------------------
-- 3. Prácticas conseguidas (una fila por empresa y año). Tener alguna = empresa histórica.
--    anio / num_practicas pueden ir vacíos en históricas importadas de Excel.
-- ------------------------------------------------------------
create table public.practicas (
  id bigint generated always as identity primary key,
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  anio int check (anio between 1990 and 2100),
  num_practicas int check (num_practicas > 0),
  notas text,
  creado timestamptz not null default now(),
  creado_por_nombre text default '',
  unique (empresa_id, anio)
);

-- ------------------------------------------------------------
-- 4. Historial de movimientos. Lo rellenan los triggers de empresas; nadie escribe a mano.
--    Sin FK a empresas: se conserva aunque la empresa se borre (el panel de admin lo limpia).
--    Un cambio de estado y su nota comparten creado (now() de la transacción): así se emparejan.
-- ------------------------------------------------------------
create table public.historial (
  id bigint generated always as identity primary key,
  empresa_id uuid,
  empresa_nombre text,
  usuario_id uuid references public.profiles (id) on delete set null,
  usuario_nombre text,
  accion text not null check (accion in ('alta', 'estado', 'nota', 'agenda', 'responsable', 'datos')),
  detalle text,
  estado_anterior text,
  estado_nuevo text,
  creado timestamptz not null default now()
);

create index historial_empresa_idx on public.historial (empresa_id, creado);
create index historial_creado_idx on public.historial (creado);
create index historial_usuario_idx on public.historial (usuario_id);

-- ------------------------------------------------------------
-- 5. Funciones auxiliares
-- ------------------------------------------------------------
-- ¿El usuario actual es admin? (security definer para evitar recursión en las políticas RLS)
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and rol = 'admin'
  );
$$;

-- Alta automática de perfil al registrarse. El PRIMER usuario es admin; el resto, miembros.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, nombre, rol)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'nombre'), ''), split_part(new.email, '@', 1)),
    case when not exists (select 1 from public.profiles) then 'admin' else 'miembro' end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Nunca puede quedarse el CRM sin ningún admin
create or replace function public.profiles_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.rol = 'admin' and new.rol <> 'admin'
     and not exists (select 1 from public.profiles where rol = 'admin' and id <> old.id) then
    raise exception 'Tiene que quedar al menos un admin';
  end if;
  return new;
end;
$$;

create trigger profiles_before_update
  before update on public.profiles
  for each row execute function public.profiles_guard();

-- ------------------------------------------------------------
-- 6. Guardia de columnas de empresas.
--    Un miembro puede crear empresas (quedan asignadas a él) y, en las suyas, cambiar
--    CIF, datos de contacto, estado, notas y próximo contacto. Nombre, sector,
--    responsable e histórica son solo de admin.
--    Sin usuario (auth.uid() nulo: SQL Editor, service_role, seed) no se restringe nada.
-- ------------------------------------------------------------
create or replace function public.empresas_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if tg_op = 'INSERT' then
      new.responsable := auth.uid();
      new.historica := false;
    elsif new.nombre      is distinct from old.nombre
       or new.sector      is distinct from old.sector
       or new.responsable is distinct from old.responsable
       or new.historica   is distinct from old.historica then
      raise exception 'Solo un admin puede modificar el nombre, el sector o el responsable de la empresa';
    end if;
  end if;
  if tg_op = 'UPDATE' then
    new.actualizado := now();
  end if;
  return new;
end;
$$;

create trigger empresas_before_write
  before insert or update on public.empresas
  for each row execute function public.empresas_guard();

-- ------------------------------------------------------------
-- 7. Historial automático
-- ------------------------------------------------------------
create or replace function public.empresas_historial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_nombre text;
  v_datos text[] := '{}';
  v_resp text;
begin
  v_nombre := coalesce(
    (select nombre from public.profiles where id = v_uid),
    nullif(new.actualizado_por, ''),
    'Sistema'
  );

  if tg_op = 'INSERT' then
    insert into public.historial (empresa_id, empresa_nombre, usuario_id, usuario_nombre, accion, detalle)
    values (new.id, new.nombre, v_uid, v_nombre, 'alta', 'Alta en el CRM');
    if new.estado <> 'sin_contactar' then
      insert into public.historial (empresa_id, empresa_nombre, usuario_id, usuario_nombre, accion, detalle, estado_nuevo)
      values (new.id, new.nombre, v_uid, v_nombre, 'estado', new.estado, new.estado);
    end if;
    if nullif(btrim(new.notas), '') is not null then
      insert into public.historial (empresa_id, empresa_nombre, usuario_id, usuario_nombre, accion, detalle)
      values (new.id, new.nombre, v_uid, v_nombre, 'nota', new.notas);
    end if;
    if new.proximo_contacto is not null then
      insert into public.historial (empresa_id, empresa_nombre, usuario_id, usuario_nombre, accion, detalle)
      values (new.id, new.nombre, v_uid, v_nombre, 'agenda', 'Próximo contacto: ' || to_char(new.proximo_contacto, 'DD/MM/YYYY'));
    end if;
    return new;
  end if;

  if new.estado is distinct from old.estado then
    insert into public.historial (empresa_id, empresa_nombre, usuario_id, usuario_nombre, accion, detalle, estado_anterior, estado_nuevo)
    values (new.id, new.nombre, v_uid, v_nombre, 'estado', old.estado || ' → ' || new.estado, old.estado, new.estado);
  end if;

  if new.notas is distinct from old.notas and nullif(btrim(new.notas), '') is not null then
    insert into public.historial (empresa_id, empresa_nombre, usuario_id, usuario_nombre, accion, detalle)
    values (new.id, new.nombre, v_uid, v_nombre, 'nota', new.notas);
  end if;

  if new.proximo_contacto is distinct from old.proximo_contacto then
    insert into public.historial (empresa_id, empresa_nombre, usuario_id, usuario_nombre, accion, detalle)
    values (new.id, new.nombre, v_uid, v_nombre, 'agenda',
      case when new.proximo_contacto is null then 'Próximo contacto quitado'
           else 'Próximo contacto: ' || to_char(new.proximo_contacto, 'DD/MM/YYYY') end);
  end if;

  if new.responsable is distinct from old.responsable then
    select nombre into v_resp from public.profiles where id = new.responsable;
    insert into public.historial (empresa_id, empresa_nombre, usuario_id, usuario_nombre, accion, detalle)
    values (new.id, new.nombre, v_uid, v_nombre, 'responsable',
      case when new.responsable is null then 'Sin asignar' else 'Asignada a ' || coalesce(v_resp, '—') end);
  end if;

  if new.nombre    is distinct from old.nombre    then v_datos := v_datos || 'nombre'::text; end if;
  if new.cif       is distinct from old.cif       then v_datos := v_datos || 'CIF'::text; end if;
  if new.sector    is distinct from old.sector    then v_datos := v_datos || 'sector'::text; end if;
  if new.contacto  is distinct from old.contacto  then v_datos := v_datos || 'contacto'::text; end if;
  if new.email     is distinct from old.email     then v_datos := v_datos || 'email'::text; end if;
  if new.telefono  is distinct from old.telefono  then v_datos := v_datos || 'teléfono'::text; end if;
  if new.direccion is distinct from old.direccion then v_datos := v_datos || 'dirección'::text; end if;
  if array_length(v_datos, 1) > 0 then
    insert into public.historial (empresa_id, empresa_nombre, usuario_id, usuario_nombre, accion, detalle)
    values (new.id, new.nombre, v_uid, v_nombre, 'datos', 'Cambiado: ' || array_to_string(v_datos, ', '));
  end if;

  return new;
end;
$$;

create trigger empresas_after_write
  after insert or update on public.empresas
  for each row execute function public.empresas_historial();

-- empresas.historica = tiene alguna fila en practicas
create or replace function public.practicas_sync_historica()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := coalesce(new.empresa_id, old.empresa_id);
begin
  update public.empresas e
     set historica = exists (select 1 from public.practicas p where p.empresa_id = v_id)
   where e.id = v_id
     and e.historica is distinct from exists (select 1 from public.practicas p where p.empresa_id = v_id);
  return null;
end;
$$;

create trigger practicas_after_write
  after insert or update or delete on public.practicas
  for each row execute function public.practicas_sync_historica();

-- ------------------------------------------------------------
-- 8. RPCs
-- ------------------------------------------------------------
-- Datos para el Ranking (visible para todo el equipo): lo mínimo del historial y de las
-- empresas para calcular los puntos en el navegador, sin dar acceso a notas ni contactos.
create or replace function public.ranking_datos(p_hasta date)
returns json
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  return json_build_object(
    'hist', coalesce((
      select json_agg(json_build_object(
        'id', h.id, 'empresa_id', h.empresa_id, 'usuario_id', h.usuario_id,
        'accion', h.accion, 'estado_nuevo', h.estado_nuevo, 'creado', h.creado
      ) order by h.creado, h.id)
      from public.historial h
      where h.accion in ('estado', 'nota') and h.creado < (p_hasta + 1)
    ), '[]'::json),
    'empresas', coalesce((
      select json_agg(json_build_object('id', e.id, 'nombre', e.nombre, 'responsable', e.responsable, 'estado', e.estado))
      from public.empresas e
    ), '[]'::json)
  );
end;
$$;

-- Un admin pone una contraseña temporal a otra persona (pestaña Equipo)
create or replace function public.admin_poner_contrasena(p_usuario uuid, p_contrasena text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo un admin puede cambiar contraseñas';
  end if;
  if length(p_contrasena) < 8 or p_contrasena !~ '[A-Za-z]' or p_contrasena !~ '[0-9]' then
    raise exception 'La contraseña necesita al menos 8 caracteres, con letras y números';
  end if;
  update auth.users
     set encrypted_password = extensions.crypt(p_contrasena, extensions.gen_salt('bf')),
         updated_at = now()
   where id = p_usuario;
  if not found then
    raise exception 'Ese usuario no existe';
  end if;
end;
$$;

revoke execute on function public.ranking_datos(date) from public, anon;
revoke execute on function public.admin_poner_contrasena(uuid, text) from public, anon;
grant execute on function public.ranking_datos(date) to authenticated;
grant execute on function public.admin_poner_contrasena(uuid, text) to authenticated;

-- ------------------------------------------------------------
-- 9. Row Level Security
-- ------------------------------------------------------------
alter table public.profiles  enable row level security;
alter table public.empresas  enable row level security;
alter table public.practicas enable row level security;
alter table public.historial enable row level security;

-- Nada es accesible sin iniciar sesión
revoke all on public.profiles, public.empresas, public.practicas, public.historial from anon;

-- Perfiles: todos ven la lista (nombres y asignaciones); solo los admins cambian roles.
create policy "profiles_select" on public.profiles
  for select to authenticated using (true);

create policy "profiles_update_admin" on public.profiles
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Empresas: todo el equipo las ve (los miembros, las ajenas en solo lectura; así además se
-- detectan CIF repetidos). Los miembros solo crean empresas para sí y editan las suyas.
create policy "empresas_select" on public.empresas
  for select to authenticated using (true);

create policy "empresas_insert" on public.empresas
  for insert to authenticated
  with check (public.is_admin() or responsable = auth.uid());

create policy "empresas_update" on public.empresas
  for update to authenticated
  using (public.is_admin() or responsable = auth.uid())
  with check (public.is_admin() or responsable = auth.uid());

create policy "empresas_delete_admin" on public.empresas
  for delete to authenticated
  using (public.is_admin());

-- Prácticas: todos las ven (marca de histórica); solo admins las gestionan.
create policy "practicas_select" on public.practicas
  for select to authenticated using (true);

create policy "practicas_write_admin" on public.practicas
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Historial: los admins lo ven todo; cada miembro, lo de sus empresas y lo que ha hecho él.
-- Solo los admins pueden borrar (limpieza de empresas eliminadas). Nadie inserta a mano.
create policy "historial_select" on public.historial
  for select to authenticated
  using (
    public.is_admin()
    or usuario_id = auth.uid()
    or exists (select 1 from public.empresas e where e.id = empresa_id and e.responsable = auth.uid())
  );

create policy "historial_delete_admin" on public.historial
  for delete to authenticated
  using (public.is_admin());
