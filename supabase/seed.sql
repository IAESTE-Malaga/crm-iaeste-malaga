-- ============================================================
-- Datos de prueba para el entorno LOCAL (se cargan con `npm run db:reset`).
-- Todo es ficticio. No ejecutar nunca en producción.
--
-- Usuarios (email / contraseña):
--   ana@iaeste.test    / Admin1234     admin
--   luis@iaeste.test   / Admin1234     admin
--   marta@iaeste.test  / Miembro1234   miembro
--   pablo@iaeste.test  / Miembro1234   miembro
--   irene@iaeste.test  / Miembro1234   miembro
-- ============================================================

-- ---------- Usuarios ----------
create function pg_temp.crear_usuario(p_id uuid, p_email text, p_pass text, p_nombre text)
returns void language sql as $$
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current,
    phone_change, phone_change_token, reauthentication_token
  ) values (
    '00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated', p_email,
    extensions.crypt(p_pass, extensions.gen_salt('bf')), now() - interval '90 days',
    '{"provider":"email","providers":["email"]}', jsonb_build_object('nombre', p_nombre),
    now() - interval '90 days', now() - interval '90 days',
    '', '', '', '', '', '', '', ''
  );
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (
    gen_random_uuid(), p_id, p_id::text,
    jsonb_build_object('sub', p_id::text, 'email', p_email, 'email_verified', true),
    'email', now(), now(), now()
  );
$$;

-- El trigger handle_new_user crea los perfiles (el primero, admin)
select pg_temp.crear_usuario('11111111-1111-4111-8111-111111111111', 'ana@iaeste.test',   'Admin1234',   'Ana García');
select pg_temp.crear_usuario('22222222-2222-4222-8222-222222222222', 'luis@iaeste.test',  'Admin1234',   'Luis Romero');
select pg_temp.crear_usuario('33333333-3333-4333-8333-333333333333', 'marta@iaeste.test', 'Miembro1234', 'Marta Sanz');
select pg_temp.crear_usuario('44444444-4444-4444-8444-444444444444', 'pablo@iaeste.test', 'Miembro1234', 'Pablo Ortiz');
select pg_temp.crear_usuario('55555555-5555-4555-8555-555555555555', 'irene@iaeste.test', 'Miembro1234', 'Irene Vidal');

update public.profiles set rol = 'admin' where id = '22222222-2222-4222-8222-222222222222';

-- ---------- Empresas ----------
-- El historial se genera aquí abajo a mano (con fechas en el pasado), así que se apaga el
-- trigger que lo rellena solo mientras se cargan los datos.
alter table public.empresas disable trigger empresas_after_write;

create temp table semilla (
  nombre text, cif text, sector text, contacto text, email text, telefono text, direccion text,
  resp text,          -- ana | luis | marta | pablo | irene | null
  estado text,
  notas text,
  hace int,           -- días desde que llegó a su estado actual
  prox int,           -- próximo contacto: días desde hoy (negativo = atrasado)
  seg int             -- días desde la última nota de seguimiento (además de la del cambio de estado)
);

insert into semilla values
  -- Seguimiento activo
  ('Telemática Avanzada S.L.',      'B10000001', 'Telecomunicaciones', 'Carmen Ruiz',     'rrhh@telematica-avanzada.example',   '+34 600 000 001', 'Calle Alcalá 120, Madrid',            'marta', 'interesados',   'Reunión con RRHH: quieren 2 plazas para verano.', 20, 3,    4),
  ('Redes del Sur S.A.',            'A10000002', 'Telecomunicaciones', 'Jorge Molina',    'jmolina@redesdelsur.example',        '+34 600 000 002', 'Av. de la Constitución 5, Sevilla',    'marta', 'mail_enviado',  'Enviada la presentación por correo.',            12, null, null),
  ('Ingeniería Cobalto S.L.',       'B10000003', 'Ingeniería civil',   'Lucía Herrero',   'contacto@cobalto.example',           '+34 600 000 003', 'Calle Princesa 31, Madrid',           'marta', 'no_contesta',   'Llamé dos veces, no lo cogen.',                  15, -2,   null),
  ('Software Meridiano S.L.',       'B10000004', 'Software',           'Raúl Delgado',    'talento@meridiano.example',          '+34 600 000 005', 'Paseo de la Castellana 200, Madrid',  'pablo', 'interesados',   'Piden el perfil de un estudiante de Informática.', 25, 0,  2),
  ('Datos y Nubes S.A.',            'A10000005', 'Cloud',              'Elena Prieto',    'eprieto@datosynubes.example',        '+34 600 000 006', 'Calle Serrano 50, Madrid',            'pablo', 'mail_enviado',  'Mail enviado con la plantilla de contacto',      18, null, null),
  ('Robótica Ibérica S.L.',         'B10000006', 'Robótica',           'Sergio Pastor',   'spastor@roboticaiberica.example',    '+34 600 000 007', 'Polígono Industrial Norte 4, Getafe', 'pablo', 'no_contesta',   'No contestan al teléfono de centralita.',         5,  null, null),
  ('Energía Solar Levante S.A.',    'A10000007', 'Energía',            'Nuria Campos',    'ncampos@solarlevante.example',       '+34 600 000 008', 'Av. del Puerto 80, Valencia',         'irene', 'interesados',   'Interesados para 2027, volver a llamar en enero.', 30, 10, 8),
  ('Biotec Castilla S.L.',          'B10000008', 'Biotecnología',      'Andrés Lozano',   'alozano@biotec-castilla.example',    '+34 600 000 009', 'Parque Tecnológico 12, Valladolid',   'irene', 'mail_enviado',  'Mail enviado',                                   10, -5,   null),
  ('Aeroespacial Tajo S.A.',        'A10000009', 'Aeroespacial',       'Pilar Navarro',   'pnavarro@aerotajo.example',          '+34 600 000 010', 'Calle Arturo Soria 300, Madrid',      'ana',   'interesados',   'Esperando respuesta de dirección.',              14, 1,    null),
  ('Microchips Henares S.L.',       'B10000010', 'Electrónica',        'Óscar Gil',       'ogil@microchips-henares.example',    '+34 600 000 011', 'Av. de Madrid 7, Alcalá de Henares',  'luis',  'segundo_plazo', 'Quedamos en hablar en el segundo plazo.',        40, null, null),
  ('Automatismos Ebro S.L.',        'B10000011', 'Automatización',     'Rosa Martín',     'rmartin@automatismosebro.example',   '+34 600 000 012', 'Calle Coso 15, Zaragoza',             'irene', 'no_contesta',   'Sin respuesta.',                                  3,  null, null),
  -- Cerradas
  ('Consultora Atlas S.L.',         'B10000012', 'Consultoría',        'Diego Fuentes',   'dfuentes@atlas.example',             '+34 600 000 013', 'Calle Velázquez 10, Madrid',          'marta', 'beca',          '¡Firmada una práctica de 3 meses!',              35, null, null),
  ('Construcciones Duero S.A.',     'A10000013', 'Construcción',       'Teresa Moreno',   'tmoreno@duero.example',              '+34 600 000 014', 'Calle Mayor 3, Zamora',               'pablo', 'rechazada',     'No aceptan becarios extranjeros este año.',      22, null, null),
  ('Óptica Fotónica Galicia S.L.',  'B10000014', 'Fotónica',           'Iván Castro',     'icastro@fotonica-galicia.example',   '+34 600 000 015', 'Rúa do Vilar 20, Santiago',           'irene', 'otra_provincia','Les corresponde el comité de Galicia.',          16, null, null),
  ('Electrónica Retro S.A.',        'A10000015', 'Electrónica',        '',                '',                                   '+34 600 000 016', '',                                    'marta', 'no_existe',     'La empresa cerró en 2025.',                      28, null, null),
  ('Logística Centro S.L.',         'B10000016', 'Logística',          'Beatriz Ramos',   'bramos@logcentro.example',           '+34 600 000 017', 'Calle Toledo 90, Madrid',             'pablo', 'mas_adelante',  'Que volvamos a escribir en primavera.',          11, 150,  null),
  ('Smart City Labs S.L.',          'B10000017', 'Software',           'Héctor Vega',     'hvega@smartcitylabs.example',        '+34 600 000 018', 'Calle Gran Vía 1, Madrid',            'ana',   'beca',          'Dos prácticas confirmadas.',                     45, null, null),
  -- Asignadas sin contactar
  ('Hidráulica Segura S.L.',        'B10000018', 'Ingeniería civil',   'Alba Soto',       'asoto@hidraulica-segura.example',    '+34 600 000 019', 'Calle Murcia 2, Murcia',              'marta', 'sin_contactar', null, null, null, null),
  ('Ciberseguridad Norte S.L.',     'B10000019', 'Ciberseguridad',     'Marcos León',     'mleon@cibernorte.example',           '+34 600 000 020', 'Calle Gran Vía 40, Bilbao',           'pablo', 'sin_contactar', null, null, null, null),
  ('Materiales Avanzados S.A.',     'A10000020', 'Materiales',         'Silvia Cano',     'scano@matavanzados.example',         '+34 600 000 021', 'Av. Diagonal 400, Barcelona',         'irene', 'sin_contactar', null, null, null, null),
  ('Química Verde S.L.',            'B10000021', 'Química',            'Fernando Rey',    'frey@quimicaverde.example',          '+34 600 000 022', 'Calle Huertas 8, Madrid',             'irene', 'sin_contactar', null, null, null, null),
  -- Bote común (sin asignar, sin contactar): para probar los lotes de +5 / −5
  ('Acústica Moderna S.L.',         'B10000022', 'Acústica',           'Laura Blanco',    'lblanco@acustica.example',           '+34 600 000 023', 'Calle Atocha 50, Madrid',             null,    'sin_contactar', null, null, null, null),
  ('Agritech Mancha S.L.',          'B10000023', 'Agrotecnología',     'Pedro Ortega',    'portega@agritech.example',           '+34 600 000 024', 'Calle Real 9, Ciudad Real',           null,    'sin_contactar', null, null, null, null),
  ('Baterías Peninsulares S.A.',    'A10000024', 'Energía',            'Clara Medina',    'cmedina@baterias.example',           '+34 600 000 025', 'Polígono Sur 3, Toledo',              null,    'sin_contactar', null, null, null, null),
  ('Cartografía Digital S.L.',      'B10000025', 'Geomática',          'Rubén Iglesias',  'riglesias@cartodigital.example',     '+34 600 000 026', 'Calle Bravo Murillo 70, Madrid',      null,    'sin_contactar', null, null, null, null),
  ('Drones Mediterráneo S.L.',      'B10000026', 'Aeroespacial',       'Eva Santos',      'esantos@dronesmed.example',          '+34 600 000 027', 'Av. Blasco Ibáñez 30, Valencia',      null,    'sin_contactar', null, null, null, null),
  ('Electromedicina Plus S.A.',     'A10000027', 'Biomédica',          'Javier Núñez',    'jnunez@electromed.example',          '+34 600 000 028', 'Calle Doctor Esquerdo 100, Madrid',   null,    'sin_contactar', null, null, null, null),
  ('Fibra Óptica Cantábrica S.L.',  'B10000028', 'Telecomunicaciones', 'Marina Calvo',    'mcalvo@fibracant.example',           '+34 600 000 029', 'Calle Burgos 6, Santander',           null,    'sin_contactar', null, null, null, null),
  ('Geotermia Canarias S.L.',       'B10000029', 'Energía',            'Tomás Herrera',   'therrera@geocanarias.example',       '+34 600 000 030', 'Calle Triana 15, Las Palmas',         null,    'sin_contactar', null, null, null, null),
  ('Hologramas 3D S.L.',            'B10000030', 'Software',           'Sara Gallego',    'sgallego@holo3d.example',            '+34 600 000 031', 'Calle Fuencarral 60, Madrid',         null,    'sin_contactar', null, null, null, null),
  ('Infraestructuras Ágora S.A.',   'A10000031', 'Ingeniería civil',   'Víctor Pardo',    'vpardo@agora.example',               '+34 600 000 032', 'Paseo de Recoletos 5, Madrid',        null,    'sin_contactar', null, null, null, null),
  ('Joyería Láser S.L.',            'B10000032', 'Fabricación',        'Natalia Cruz',    'ncruz@joyerialaser.example',         '+34 600 000 033', 'Calle Mayor 70, Córdoba',             null,    'sin_contactar', null, null, null, null),
  ('Klima Ingenieros S.L.',         'B10000033', 'Climatización',      'Alberto Rubio',   'arubio@klima.example',               '+34 600 000 034', 'Calle Bailén 4, Madrid',              null,    'sin_contactar', null, null, null, null),
  ('Láseres Industriales S.A.',     'A10000034', 'Fotónica',           'Cristina Peña',   'cpena@laseres.example',              '+34 600 000 035', 'Calle Ferraz 22, Madrid',             null,    'sin_contactar', null, null, null, null),
  ('Motores Eléctricos Vega S.L.',  'B10000035', 'Automoción',         'Gonzalo Marín',   'gmarin@motoresvega.example',         '+34 600 000 036', 'Polígono Este 8, Valladolid',         null,    'sin_contactar', null, null, null, null),
  ('Nanotecnia Madrid S.L.',        'B10000036', 'Nanotecnología',     'Patricia Gómez',  'pgomez@nanotecnia.example',          '+34 600 000 037', 'Calle Ríos Rosas 18, Madrid',         null,    'sin_contactar', null, null, null, null),
  -- Históricas sin asignar (nos dieron prácticas en años anteriores)
  ('Ondas y Señales S.A.',          'A10000037', 'Telecomunicaciones', 'Manuel Ibáñez',   'mibanez@ondas.example',              '+34 600 000 038', 'Calle Orense 25, Madrid',             null,    'sin_contactar', null, null, null, null),
  ('Puentes Atlántico S.L.',        'B10000038', 'Ingeniería civil',   'Inés Domínguez',  'idominguez@puentesatl.example',      '+34 600 000 039', 'Rúa Real 40, A Coruña',               null,    'sin_contactar', null, null, null, null);

insert into public.empresas (nombre, cif, sector, contacto, email, telefono, direccion, responsable, estado, notas, proximo_contacto, creado, actualizado, actualizado_por)
select s.nombre, s.cif, s.sector, s.contacto, s.email, s.telefono, s.direccion,
       p.id, s.estado, s.notas,
       case when s.prox is null then null else current_date + s.prox end,
       now() - interval '60 days',
       now() - make_interval(days => coalesce(least(s.hace, s.seg), s.hace, 60)),
       coalesce(p.nombre, 'Ana García')
from semilla s
left join public.profiles p on p.nombre like initcap(s.resp) || ' %';

-- ---------- Prácticas (empresas históricas) ----------
insert into public.practicas (empresa_id, anio, num_practicas, notas, creado_por_nombre)
select e.id, v.anio, v.num, v.notas, 'Ana García'
from (values
  ('Consultora Atlas S.L.',   2026, 1, null),
  ('Smart City Labs S.L.',    2026, 2, null),
  ('Smart City Labs S.L.',    2024, 1, null),
  ('Ondas y Señales S.A.',    2023, 3, 'Contacto antiguo: departamento de I+D.'),
  ('Ondas y Señales S.A.',    2025, 1, null),
  ('Puentes Atlántico S.L.',  null, null, 'Importada del Excel antiguo, sin año registrado.')
) v(nombre, anio, num, notas)
join public.empresas e on e.nombre = v.nombre;
-- (el trigger de practicas marca historica = true)

-- ---------- Historial ----------
-- Alta de todas las empresas (hace 60 días, por Ana)
insert into public.historial (empresa_id, empresa_nombre, usuario_id, usuario_nombre, accion, detalle, creado)
select e.id, e.nombre, '11111111-1111-4111-8111-111111111111', 'Ana García', 'alta', 'Alta en el CRM', now() - interval '60 days'
from public.empresas e;

-- Asignación (hace 55 días, por Ana)
insert into public.historial (empresa_id, empresa_nombre, usuario_id, usuario_nombre, accion, detalle, creado)
select e.id, e.nombre, '11111111-1111-4111-8111-111111111111', 'Ana García', 'responsable', 'Asignada a ' || p.nombre, now() - interval '55 days'
from public.empresas e join public.profiles p on p.id = e.responsable;

-- Cambio de estado + su nota (misma hora: la app los empareja)
insert into public.historial (empresa_id, empresa_nombre, usuario_id, usuario_nombre, accion, detalle, estado_anterior, estado_nuevo, creado)
select e.id, e.nombre, e.responsable, p.nombre, 'estado', 'sin_contactar → ' || e.estado, 'sin_contactar', e.estado,
       date_trunc('minute', now() - make_interval(days => s.hace))
from public.empresas e
join semilla s on s.nombre = e.nombre
join public.profiles p on p.id = e.responsable
where e.estado <> 'sin_contactar';

insert into public.historial (empresa_id, empresa_nombre, usuario_id, usuario_nombre, accion, detalle, creado)
select h.empresa_id, h.empresa_nombre, h.usuario_id, h.usuario_nombre, 'nota', e.notas, h.creado
from public.historial h join public.empresas e on e.id = h.empresa_id
where h.accion = 'estado' and e.notas is not null;

-- Notas de seguimiento posteriores (sin cambio de estado)
insert into public.historial (empresa_id, empresa_nombre, usuario_id, usuario_nombre, accion, detalle, creado)
select e.id, e.nombre, e.responsable, p.nombre, 'nota', 'Seguimiento: ' || e.notas,
       date_trunc('minute', now() - make_interval(days => s.seg)) + interval '3 hours'
from public.empresas e
join semilla s on s.nombre = e.nombre
join public.profiles p on p.id = e.responsable
where s.seg is not null;

alter table public.empresas enable trigger empresas_after_write;
drop table semilla;
