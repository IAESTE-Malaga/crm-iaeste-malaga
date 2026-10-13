-- ============================================================
-- Puntuaciones de campaña + centro de cada socio
-- ============================================================
-- La puntuación de la rúbrica (comité local y grupos de trabajo) la anotan a mano los admins en la
-- tabla "puntos"; a eso se le suman, en la app, los puntos automáticos por contactar empresas.
-- Una campaña es un curso (1 sep - 31 ago) y se deduce de la fecha del apunte: no hay tabla de campañas.

-- ------------------------------------------------------------
-- 1. Centro de cada socio
-- ------------------------------------------------------------
-- Se elige al registrarse; los admins lo cambian en Equipo. Nulo en las cuentas anteriores a esta migración.
alter table public.profiles
  add column centro text check (centro in ('IDML', 'IFML', 'QMML', 'AQML', 'TLML'));

-- Alta automática de perfil: ahora lee también el centro (solo si es uno de los cinco válidos).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_centro text := nullif(btrim(new.raw_user_meta_data ->> 'centro'), '');
begin
  insert into public.profiles (id, nombre, rol, centro)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'nombre'), ''), split_part(new.email, '@', 1)),
    case when not exists (select 1 from public.profiles) then 'admin' else 'miembro' end,
    case when v_centro in ('IDML', 'IFML', 'QMML', 'AQML', 'TLML') then v_centro end
  );
  return new;
end;
$$;

-- ------------------------------------------------------------
-- 2. Apuntes de puntos
-- ------------------------------------------------------------
-- Un apunte = una cosa por la que se dan puntos a una persona. "descripcion" es copia del texto del
-- concepto de la rúbrica (src/puntuaciones.js) para que cambiar el catálogo no altere lo ya anotado.
-- "usuario_id" puede estar vacío en los apuntes importados de una persona que aún no tiene cuenta:
-- guardan su nombre y se vinculan solos cuando se registra (ver más abajo).
create table public.puntos (
  id bigint generated always as identity primary key,
  usuario_id uuid references public.profiles (id) on delete cascade,
  socio_nombre text,
  socio_centro text check (socio_centro in ('IDML', 'IFML', 'QMML', 'AQML', 'TLML')),
  fecha date not null default current_date,
  categoria text not null check (categoria in ('INI', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M')),
  concepto text not null check (length(btrim(concepto)) between 1 and 60),
  descripcion text not null check (length(btrim(descripcion)) between 1 and 200),
  cantidad numeric(7, 2) check (cantidad is null or cantidad >= 0),
  puntos numeric(7, 2) not null check (puntos between -1000 and 1000),
  motivo text check (motivo is null or length(motivo) <= 500),
  creado_por uuid references public.profiles (id) on delete set null default auth.uid(),
  creado timestamptz not null default now(),
  check (usuario_id is not null or socio_nombre is not null)
);

create index puntos_fecha_idx on public.puntos (fecha);
create index puntos_usuario_idx on public.puntos (usuario_id);

alter table public.puntos enable row level security;
revoke all on public.puntos from anon;

-- Cada persona ve solo sus apuntes (el desglose con los motivos); los admins ven todos y son los únicos
-- que escriben. Los totales de los demás se consultan con puntuacion_resumen().
create policy "puntos_select" on public.puntos
  for select to authenticated
  using (usuario_id = auth.uid() or public.is_admin());

create policy "puntos_insert_admin" on public.puntos
  for insert to authenticated with check (public.is_admin());

create policy "puntos_update_admin" on public.puntos
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "puntos_delete_admin" on public.puntos
  for delete to authenticated using (public.is_admin());

-- ------------------------------------------------------------
-- 3. Vincular apuntes importados cuando la persona se registra
-- ------------------------------------------------------------
-- Compara nombres sin tildes, mayúsculas ni espacios de más.
create or replace function public.norm_nombre(t text)
returns text
language sql
immutable
as $$
  select btrim(regexp_replace(
    translate(lower(coalesce(t, '')), 'áàäâãéèëêíìïîóòöôõúùüûñç', 'aaaaaeeeeiiiiooooouuuunc'),
    '\s+', ' ', 'g'));
$$;

-- Asigna a esta persona los apuntes sin dueño que llevan su nombre y, si aún no tiene centro,
-- le pone el que figuraba en la importación.
create or replace function public.vincular_puntos(p_id uuid, p_nombre text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.puntos set usuario_id = p_id
  where usuario_id is null and public.norm_nombre(socio_nombre) = public.norm_nombre(p_nombre);

  update public.profiles
  set centro = (select max(socio_centro) from public.puntos where usuario_id = p_id)
  where id = p_id and centro is null;
end;
$$;
revoke execute on function public.vincular_puntos(uuid, text) from public, anon, authenticated;

create or replace function public.profiles_vincular_puntos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.vincular_puntos(new.id, new.nombre);
  return new;
end;
$$;

create trigger profiles_after_write_puntos
  after insert or update of nombre on public.profiles
  for each row execute function public.profiles_vincular_puntos();

-- ------------------------------------------------------------
-- 4. Lectura abierta a todo el equipo: totales y datos del ranking
-- ------------------------------------------------------------
-- Total de apuntes de cada persona entre dos fechas (solo cifras, sin motivos). Es lo que ve un miembro de los demás.
-- gt = lo anotado en GT Empresas (H); practica = ha conseguido alguna práctica de empresa en el periodo.
create or replace function public.puntuacion_resumen(p_desde date, p_hasta date)
returns table (usuario_id uuid, total numeric, gt numeric, practica boolean)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  return query
    select p.usuario_id,
           sum(p.puntos),
           coalesce(sum(p.puntos) filter (where p.categoria = 'H'), 0),
           coalesce(bool_or(p.concepto in ('h_practica_nueva', 'h_practica_renovacion')), false)
    from public.puntos p
    where p.usuario_id is not null and p.fecha between p_desde and p_hasta
    group by p.usuario_id;
end;
$$;
revoke execute on function public.puntuacion_resumen(date, date) from public, anon;
grant execute on function public.puntuacion_resumen(date, date) to authenticated;

-- ranking_datos vuelve a estar abierta a todo el equipo: con ella cada persona calcula en la app los puntos
-- automáticos por empresas de todos. Solo devuelve estados y fechas del historial, nunca el texto de las notas.
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

-- Perfiles que ya existen: por si hubiera apuntes importados con su nombre
select public.vincular_puntos(id, nombre) from public.profiles;
