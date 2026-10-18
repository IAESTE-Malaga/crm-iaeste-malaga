-- ============================================================
-- Web de la empresa + reclamar empresas sin asignar
-- ============================================================
-- Las empresas sin responsable son el «bote común»: un admin las reparte en lotes.
-- Ahora cualquier miembro puede reclamar una de esas empresas desde su ficha.

-- 1. Web de la empresa (dato de contacto, como el teléfono o el email)
alter table public.empresas add column if not exists web text default '';

-- 2. Guardia: un miembro ya no puede cambiar el responsable, salvo para reclamar
--    una empresa sin asignar y ponerse a sí mismo.
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
       or new.historica   is distinct from old.historica
       or (new.responsable is distinct from old.responsable
           and not (old.responsable is null and new.responsable = auth.uid())) then
      raise exception 'Solo un admin puede modificar el nombre, el sector o el responsable de la empresa';
    end if;
  end if;
  if tg_op = 'UPDATE' then
    new.actualizado := now();
  end if;
  return new;
end;
$$;

-- 3. Reclamar: pasa a ser responsable de quien llama si la empresa está sin asignar.
--    Es atómica (si dos personas la reclaman a la vez, gana una y la otra recibe el error).
create or replace function public.reclamar_empresa(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Hay que iniciar sesión para reclamar una empresa';
  end if;
  update public.empresas
     set responsable = auth.uid(),
         actualizado_por = coalesce((select nombre from public.profiles where id = auth.uid()), '')
   where id = p_id and responsable is null;
  if not found then
    raise exception 'La empresa ya tiene responsable o no existe';
  end if;
end;
$$;

revoke all on function public.reclamar_empresa(uuid) from public, anon;
grant execute on function public.reclamar_empresa(uuid) to authenticated;
