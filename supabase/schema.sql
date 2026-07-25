-- ============================================================
-- CRM IAESTE — Esquema de Supabase
-- Pega este archivo completo en: Supabase > SQL Editor > Run
-- ============================================================

-- 1. Perfiles (uno por usuario registrado)
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nombre text not null,
  rol text not null default 'miembro' check (rol in ('admin', 'miembro')),
  creado timestamptz not null default now()
);

-- 2. Empresas
create table public.empresas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  sector text default '',
  contacto text default '',
  email text default '',
  telefono text default '',
  responsable uuid references public.profiles (id) on delete set null,
  estado text not null default 'sin_contactar'
    check (estado in ('sin_contactar','contactado','en_conversacion','oferta','rechazada')),
  notas text default '',
  actualizado timestamptz not null default now(),
  actualizado_por text default ''
);

-- 3. Función auxiliar: ¿el usuario actual es admin?
--    (security definer para evitar recursión en las políticas RLS)
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

-- 4. Alta automática de perfil al registrarse.
--    El PRIMER usuario que se registra es admin; el resto, miembros.
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
    coalesce(new.raw_user_meta_data ->> 'nombre', split_part(new.email, '@', 1)),
    case when not exists (select 1 from public.profiles) then 'admin' else 'miembro' end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 5. Guardia de columnas: los miembros solo pueden cambiar estado y notas
create or replace function public.empresas_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    if new.nombre      is distinct from old.nombre
    or new.sector      is distinct from old.sector
    or new.contacto    is distinct from old.contacto
    or new.email       is distinct from old.email
    or new.telefono    is distinct from old.telefono
    or new.responsable is distinct from old.responsable then
      raise exception 'Solo un admin puede modificar los datos de la empresa';
    end if;
  end if;
  new.actualizado := now();
  return new;
end;
$$;

create trigger empresas_before_update
  before update on public.empresas
  for each row execute function public.empresas_guard();

-- 6. Row Level Security
alter table public.profiles enable row level security;
alter table public.empresas enable row level security;

-- Perfiles: todos los autenticados ven la lista (necesario para nombres
-- y asignaciones); solo los admins pueden modificar roles.
create policy "profiles_select" on public.profiles
  for select to authenticated using (true);

create policy "profiles_update_admin" on public.profiles
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Empresas: los admins ven todo; los miembros, solo las suyas.
create policy "empresas_select" on public.empresas
  for select to authenticated
  using (public.is_admin() or responsable = auth.uid());

create policy "empresas_insert_admin" on public.empresas
  for insert to authenticated
  with check (public.is_admin());

create policy "empresas_update" on public.empresas
  for update to authenticated
  using (public.is_admin() or responsable = auth.uid());

create policy "empresas_delete_admin" on public.empresas
  for delete to authenticated
  using (public.is_admin());
