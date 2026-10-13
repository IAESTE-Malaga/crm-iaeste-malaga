-- ============================================================
-- Plantillas en HTML
--
-- El mensaje de las plantillas pasa a guardarse como HTML (editor con formato en la app), para poder pegar
-- firmas de Gmail/Outlook con su formato, enlaces e imagen. El servicio de correo lo sanea antes de enviarlo
-- (server/src/html.js), así que aquí no se valida el contenido, solo el tamaño.
-- ============================================================

-- Las plantillas que ya existen eran texto plano: se escapan y los saltos de línea pasan a <br>
update public.plantillas
set cuerpo = replace(replace(replace(replace(replace(cuerpo,
  '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), E'\r\n', E'\n'), E'\n', '<br>');

-- Una firma con estilos en línea ocupa bastante más que el texto: 100.000 caracteres
alter table public.plantillas drop constraint if exists plantillas_cuerpo_check;
alter table public.plantillas
  add constraint plantillas_cuerpo_check check (length(btrim(cuerpo)) > 0 and length(cuerpo) <= 100000);
