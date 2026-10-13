-- ============================================================
-- Archivos adjuntos en correos y plantillas
--
-- Los archivos viven en el bucket privado «adjuntos» de Supabase Storage; el navegador los sube directamente
-- (así no pasan por la función serverless, que tiene un límite de ~4,5 MB por petición) y el servicio de correo
-- solo recibe sus rutas, las descarga y las adjunta al enviar.
--   plantillas/<id de la plantilla>/<uuid>-<nombre>   adjuntos de una plantilla (los ve todo el equipo)
--   correos/<id de la empresa>/<uuid>-<nombre>        archivos de un correo enviado a esa empresa
-- Los metadatos (ruta, nombre original, tamaño) se guardan en la columna adjuntos de plantillas y emails.
-- ============================================================

alter table public.plantillas
  add column adjuntos jsonb not null default '[]'::jsonb
  check (jsonb_typeof(adjuntos) = 'array' and jsonb_array_length(adjuntos) <= 10);

alter table public.emails
  add column adjuntos jsonb not null default '[]'::jsonb
  check (jsonb_typeof(adjuntos) = 'array' and jsonb_array_length(adjuntos) <= 10);

-- 15 MB por archivo (Gmail admite 25 MB por correo en total; el servicio limita la suma)
insert into storage.buckets (id, name, public, file_size_limit)
values ('adjuntos', 'adjuntos', false, 15728640)
on conflict (id) do update set public = false, file_size_limit = 15728640;

-- ¿Puede el usuario actual tocar los archivos de esta carpeta de empresa? (un admin, o quien la lleva)
create or replace function public.puede_adjuntos_empresa(p_empresa text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.empresas e
    where e.id::text = p_empresa and (public.is_admin() or e.responsable = auth.uid())
  );
$$;
revoke execute on function public.puede_adjuntos_empresa(text) from public, anon;
grant execute on function public.puede_adjuntos_empresa(text) to authenticated;

create policy "adjuntos_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'adjuntos' and (
      (storage.foldername(name))[1] = 'plantillas'
      or ((storage.foldername(name))[1] = 'correos' and public.puede_adjuntos_empresa((storage.foldername(name))[2]))
    )
  );

create policy "adjuntos_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'adjuntos' and (
      (storage.foldername(name))[1] = 'plantillas'
      or ((storage.foldername(name))[1] = 'correos' and public.puede_adjuntos_empresa((storage.foldername(name))[2]))
    )
  );

-- Borrar: quien subió el archivo o un admin (los archivos copiados por el servicio de correo no tienen dueño: solo admins)
create policy "adjuntos_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'adjuntos' and (owner_id = auth.uid()::text or public.is_admin()));
