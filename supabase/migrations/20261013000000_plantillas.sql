-- ============================================================
-- Plantillas de correo + Ranking solo para admins
-- ============================================================

-- Plantillas de correo compartidas por todo el equipo. Se eligen en la caja de redacción del hilo de correo
-- y se editan en la sección «Plantillas». Variables admitidas en asunto y mensaje: {{empresa}}, {{contacto}}, {{yo}}.
-- Todos las leen y cualquiera puede crear las suyas; editar o borrar, solo su autor o un admin
-- (las que no tienen autor, como la de serie, solo las toca un admin).
create table public.plantillas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(btrim(nombre)) between 1 and 80),
  asunto text not null default '' check (length(asunto) <= 200 and asunto !~ '[\r\n]'),
  cuerpo text not null check (length(btrim(cuerpo)) > 0 and length(cuerpo) <= 20000),
  creado_por uuid references public.profiles (id) on delete set null default auth.uid(),
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now()
);

alter table public.plantillas enable row level security;
revoke all on public.plantillas from anon;

create policy "plantillas_select" on public.plantillas
  for select to authenticated using (true);

create policy "plantillas_insert" on public.plantillas
  for insert to authenticated
  with check (creado_por = auth.uid());

create policy "plantillas_update" on public.plantillas
  for update to authenticated
  using (creado_por = auth.uid() or public.is_admin())
  with check (creado_por = auth.uid() or public.is_admin());

create policy "plantillas_delete" on public.plantillas
  for delete to authenticated
  using (creado_por = auth.uid() or public.is_admin());

-- Plantilla de serie: el correo de primer contacto que antes estaba escrito en el código
insert into public.plantillas (nombre, asunto, cuerpo, creado_por) values (
  'Primer contacto (programa de prácticas)',
  'IAESTE Málaga - Programa de prácticas internacionales para {{empresa}}',
  $plantilla$Buenos días {{contacto}},

Mi nombre es {{yo}} y trabajo como parte de la Asociación internacional IAESTE. Como comenté por teléfono, este correo contiene información básica acerca de nuestro programa de prácticas internacionales, así como una presentación visual adjunta. Si hiciese falta más información al respecto, estamos abiertos a tener una reunión para profundizar más:

IAESTE (International Association for the Exchange of Students for Technical Experience) es una organización internacional cuyo objetivo es promover la realización de prácticas remuneradas en empresas y entidades de diversos países para estudiantes de especialidades científico-técnicas, fomentando así la excelencia profesional y el desarrollo de las aptitudes personales en entornos multiculturales y pluridisciplinares.

Adjunto para su información:

- Presentación programa IAESTE
- Modelo convenio

Si están interesados en formalizar una oferta de prácticas a través del programa de movilidad IAESTE, el proceso sería el siguiente:

Cumplimentar y enviar a iaestetlmd@gmail.com la siguiente documentación:

- Formulario oferta prácticas (1 por plaza ofertada). En este documento se detalla el perfil buscado.
- Compromiso empresa
- Acuerdo corresponsabilidad tratamiento datos

Características generales de la oferta de prácticas:

- La empresa determina la duración y el periodo de la práctica, con duración mínima de 6 semanas y máximo 1 año.
- El becario trabajará un máximo de 40 horas semanales de lunes a viernes.
- El becario recibirá una remuneración mínima de 800 euros netos mensuales por parte de la empresa, de forma que pueda mantenerse durante la práctica en nuestro país (con la posibilidad de ofrecer alojamiento, manutención y transporte, en lugar de la remuneración).
- La empresa recibirá el perfil de un estudiante que cumpla los requisitos solicitados (un perfil por oferta). Se dispondrá del plazo de dos semanas para evaluar y/o entrevistar al estudiante de forma online si se considera necesario.
- Tras la evaluación del perfil proporcionado, la empresa aceptará o rechazará al estudiante. Si este es aceptado, se procederá a la firma de un convenio entre IAESTE España, becario y la empresa que permita la incorporación del estudiante. En ningún caso será necesario un contrato laboral.

------------------------------------------------------------

Indicarles que en el caso de becarios o recién graduados extracomunitarios que vengan a España a realizar una práctica mediante convenio por un periodo superior a 90 días y en aplicación del Real Decreto Ley 11/2018 de 31 de agosto- Disposición adicional decimoctava deberán estar provistos de la Autorización de residencia para prácticas no laborales mediante convenio.

Para ello, la entidad que acoge al becario en prácticas (la empresa) debe solicitar de manera telemática a través de la plataforma MERCURIO https://sede.administracionespublicas.gob.es/mercurio/inicioMercurio.html esta Autorización de residencia para prácticas no laborales mediante convenio, en los términos que se indica en esta disposición.

A la recepción del convenio les remitiremos copia firmada por IAESTE y Estudiante junto con resto de documentación requerida por la Administración, para que procedan a la solicitud de autorización para estancia por prácticas no laborales.

La resolución de esta autorización se resolverá en el plazo máximo de 30 días. Si no se resuelve en dicho plazo, la autorización se entenderá estimada por silencio administrativo. Al día siguiente de que expire ese plazo la empresa deberá solicitar a la Administración el correspondiente Certificado de silencio.

------------------------------------------------------------

Por último, informarles que deberán en su momento solicitar el nº de seguridad social y posterior alta en la TGSS como becario en prácticas externas.

A estos efectos, la Administración ha abierto la posibilidad de que los autorizados al sistema RED (las empresas) realicen dicha solicitud a través de CASIA en relación con los trabajadores respecto de los cuales van a comunicar con posterioridad su alta. Para ello, se ha creado un nuevo trámite, “Solicitud de número de Seguridad Social”, que se encuentra ya disponible dentro de las subcategorías correspondientes a los trámites de Afiliación, altas y bajas < Altas de trabajadores cuenta ajena.

La documentación que deberá acompañar a dicha solicitud será la siguiente:

TA.1 firmado por el becario, pasaporte o ID, NIE y convenio

• ALTA

Una vez la empresa disponga del CCC específico y del número de Seguridad Social del estudiante extranjero, el alta en el Régimen General de la Seguridad Social de los estudiantes se deberá realizar mediante el mismo procedimiento que el de un trabajador por cuenta ajena, realizando el trámite ante la Seguridad Social presencialmente o a través del Sistema Red.

Código de alta: 1
Exclusión cotización: 986 (programas de formación)
Y la Relación Laboral de Carácter Especial (RLCE) dependiendo de si las prácticas son curriculares o extracurriculares:
· Curriculares: 9928
· Extracurriculares: 9927

Quedamos a su disposición para cualquier consulta que tengan o para fijar una reunión. Gracias de antemano y un saludo,

{{yo}}
Equipo de Empresas IAESTE TLMA

IAESTE Telecomunicación Málaga
E.T.S.I. Telecomunicación Málaga
Bulevar Louis Pasteur, 35, 29071, Málaga
www.iaeste.es

------------------------------------------------------------
Legal notice:

Data protection. IAESTE ESPAÑA informs you that your email address, as well as the rest of your personal data, will be used for contacting you and providing you with our services. This data is necessary to communicate with you, which allows us to use your information within legal limits. Additionally, entities which require access to your information so that we can provide our services may have access to it. We will keep your data during our relationship and for the period required by applicable law. You may contact us at any time to find out the information we have on you, correct it if it is incorrect and delete it once our relationship has ended. You also have the right to request the transfer of your information to another entity (portability). To request any of these rights, you must make a written request to our address, along with a photocopy of your DNI identity document: IAESTE ESPAÑA, UNIVERSIDAD POLITÉCNICA DE VALENCIA, EDIFICIO 8K, PLANTA BAJA, ALA OESTE, DESPACHOS 11-13,CP 46022 VALENCIA. In case of considering your rights to have been neglected, you can lodge a claim before the Spanish Data Protection Agency (www.agpd.es).

Confidentiality. - The content of this communication, as well as all documentation attached, is confidential and intended for its recipient. In the case of you not being the intended recipient, we request that you notify us and do not communicate its content to third parties, proceeding to delete it.

Exemption from liability. - The sending of this communication does not entail the sender’s obligation to monitor the absence of viruses, worms, trojan horses and/or any other harmful computer program, the recipient having to have the necessary hardware and software tools to guarantee both the security of their information system and the detection and elimination of harmful computer programs. IAESTE ESPAÑA is not liable for liquidated damages that such computer programs may cause to the recipient.$plantilla$,
  null
);

-- El Ranking pasa a ser solo para admins (los miembros ya no lo ven en la app). Los admins ya leen todo
-- el historial por RLS, así que esta función no da acceso nuevo; solo deja de estar abierta al resto.
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
  if not public.is_admin() then
    raise exception 'Solo un admin puede ver el ranking';
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
