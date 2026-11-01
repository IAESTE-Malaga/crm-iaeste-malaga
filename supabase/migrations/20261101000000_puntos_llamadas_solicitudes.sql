-- ============================================================
-- Puntos por llamada, ajustes de los puntos automáticos y solicitudes de puntos
-- ============================================================
-- Las penalizaciones no necesitan nada aquí: son apuntes de "puntos" con puntos negativos.

-- ------------------------------------------------------------
-- 1. Llamadas en el historial
-- ------------------------------------------------------------
-- Una llamada = fila accion 'llamada' con estado_nuevo 'no_contesta' (no lo cogen) o 'seguimiento'
-- (llamada de seguimiento). Puntúa a quien la hace (usuario_id), cada una por separado.
alter table public.historial drop constraint if exists historial_accion_check;
alter table public.historial add constraint historial_accion_check
  check (accion in ('alta', 'estado', 'nota', 'agenda', 'responsable', 'datos', 'llamada'));

-- Nadie inserta en historial a mano (RLS): las llamadas entran por aquí. Solo el responsable de la empresa o un admin.
create or replace function public.registrar_llamada(p_empresa uuid, p_tipo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_emp public.empresas;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;
  if p_tipo not in ('no_contesta', 'seguimiento') then
    raise exception 'Tipo de llamada no válido';
  end if;
  select * into v_emp from public.empresas where id = p_empresa;
  if not found then
    raise exception 'La empresa no existe';
  end if;
  if not public.is_admin() and v_emp.responsable is distinct from v_uid then
    raise exception 'Solo quien lleva la empresa puede registrar llamadas';
  end if;
  insert into public.historial (empresa_id, empresa_nombre, usuario_id, usuario_nombre, accion, detalle, estado_nuevo)
  values (
    v_emp.id, v_emp.nombre, v_uid, (select nombre from public.profiles where id = v_uid), 'llamada',
    case p_tipo when 'no_contesta' then 'No lo cogen' else 'Llamada de seguimiento' end,
    p_tipo
  );
end;
$$;
revoke execute on function public.registrar_llamada(uuid, text) from public, anon;
grant execute on function public.registrar_llamada(uuid, text) to authenticated;

-- ------------------------------------------------------------
-- 2. Ajustes de los puntos automáticos
-- ------------------------------------------------------------
-- Los puntos automáticos se calculan en la app; un admin puede cambiar los de una fila concreta.
-- clave: 'e:<empresa>:<usuario>:<estado>' (puntos por el estado de una empresa: si cambia el estado o
-- el responsable deja de aplicar) o 'h:<id del historial>' (una llamada). puntos = 0 equivale a quitarlos.
create table public.puntos_auto_ajustes (
  id bigint generated always as identity primary key,
  clave text not null unique check (length(clave) between 3 and 200),
  usuario_id uuid references public.profiles (id) on delete cascade,
  puntos numeric(7, 2) not null check (puntos between -1000 and 1000),
  motivo text check (motivo is null or length(motivo) <= 500),
  creado_por uuid references public.profiles (id) on delete set null default auth.uid(),
  creado timestamptz not null default now()
);

alter table public.puntos_auto_ajustes enable row level security;
revoke all on public.puntos_auto_ajustes from anon;

create policy "ajustes_select" on public.puntos_auto_ajustes
  for select to authenticated using (usuario_id = auth.uid() or public.is_admin());
create policy "ajustes_write_admin" on public.puntos_auto_ajustes
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ranking_datos: ahora trae también las llamadas y los ajustes (sin motivos) para que todos calculen igual.
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
      where h.accion in ('estado', 'nota', 'llamada') and h.creado < (p_hasta + 1)
    ), '[]'::json),
    'empresas', coalesce((
      select json_agg(json_build_object('id', e.id, 'nombre', e.nombre, 'responsable', e.responsable, 'estado', e.estado))
      from public.empresas e
    ), '[]'::json),
    'ajustes', coalesce((
      select json_agg(json_build_object('clave', a.clave, 'usuario_id', a.usuario_id, 'puntos', a.puntos))
      from public.puntos_auto_ajustes a
    ), '[]'::json)
  );
end;
$$;

-- ------------------------------------------------------------
-- 3. Solicitudes de puntos
-- ------------------------------------------------------------
-- Cualquiera pide puntos por algo que ha hecho; un admin la acepta (ajustándola si hace falta) o la rechaza.
create table public.solicitudes_puntos (
  id bigint generated always as identity primary key,
  usuario_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  fecha date not null default current_date,
  categoria text not null check (categoria in ('INI', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M')),
  concepto text not null check (length(btrim(concepto)) between 1 and 60),
  descripcion text not null check (length(btrim(descripcion)) between 1 and 200),
  cantidad numeric(7, 2) check (cantidad is null or cantidad >= 0),
  puntos numeric(7, 2) not null check (puntos between 0 and 1000),
  motivo text not null check (length(btrim(motivo)) between 1 and 500),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aceptada', 'rechazada')),
  respuesta text check (respuesta is null or length(respuesta) <= 500),
  revisado_por uuid references public.profiles (id) on delete set null,
  revisado timestamptz,
  punto_id bigint references public.puntos (id) on delete set null,
  creado timestamptz not null default now()
);

create index solicitudes_estado_idx on public.solicitudes_puntos (estado);

alter table public.solicitudes_puntos enable row level security;
revoke all on public.solicitudes_puntos from anon;

create policy "solicitudes_select" on public.solicitudes_puntos
  for select to authenticated using (usuario_id = auth.uid() or public.is_admin());
create policy "solicitudes_insert_propia" on public.solicitudes_puntos
  for insert to authenticated
  with check (usuario_id = auth.uid() and estado = 'pendiente' and revisado_por is null and punto_id is null);
-- Cancelar: la propia mientras siga pendiente (los admins, cualquiera)
create policy "solicitudes_delete" on public.solicitudes_puntos
  for delete to authenticated using ((usuario_id = auth.uid() and estado = 'pendiente') or public.is_admin());
create policy "solicitudes_update_admin" on public.solicitudes_puntos
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Aceptar (anotando el apunte con los datos que decida el admin) o rechazar, de una vez.
create or replace function public.resolver_solicitud(
  p_id bigint, p_aceptar boolean, p_respuesta text default null,
  p_categoria text default null, p_concepto text default null, p_descripcion text default null,
  p_cantidad numeric default null, p_puntos numeric default null, p_fecha date default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sol public.solicitudes_puntos;
  v_punto bigint;
begin
  if not public.is_admin() then
    raise exception 'Solo un admin puede resolver solicitudes';
  end if;
  select * into v_sol from public.solicitudes_puntos where id = p_id for update;
  if not found then
    raise exception 'La solicitud no existe';
  end if;
  if v_sol.estado <> 'pendiente' then
    raise exception 'Esta solicitud ya está resuelta';
  end if;

  if p_aceptar then
    insert into public.puntos (usuario_id, fecha, categoria, concepto, descripcion, cantidad, puntos, motivo)
    values (
      v_sol.usuario_id, coalesce(p_fecha, v_sol.fecha), coalesce(p_categoria, v_sol.categoria),
      coalesce(p_concepto, v_sol.concepto), coalesce(p_descripcion, v_sol.descripcion),
      coalesce(p_cantidad, v_sol.cantidad), coalesce(p_puntos, v_sol.puntos),
      coalesce(nullif(btrim(p_respuesta), ''), v_sol.motivo)
    )
    returning id into v_punto;
  end if;

  update public.solicitudes_puntos
  set estado = case when p_aceptar then 'aceptada' else 'rechazada' end,
      respuesta = nullif(btrim(p_respuesta), ''),
      revisado_por = auth.uid(), revisado = now(), punto_id = v_punto
  where id = p_id;
end;
$$;
revoke execute on function public.resolver_solicitud(bigint, boolean, text, text, text, text, numeric, numeric, date) from public, anon;
grant execute on function public.resolver_solicitud(bigint, boolean, text, text, text, text, numeric, numeric, date) to authenticated;
