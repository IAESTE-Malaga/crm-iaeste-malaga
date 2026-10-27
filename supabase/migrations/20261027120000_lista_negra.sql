-- ============================================================
-- Estado «Lista negra»
-- ============================================================
-- Empresas que no hay que volver a contactar. En la app solo aparecen en el apartado
-- «Lista negra» (ni en «Todas» ni en los recordatorios). Debe coincidir con ESTADOS de src/App.jsx.

alter table public.empresas drop constraint if exists empresas_estado_check;
alter table public.empresas add constraint empresas_estado_check
  check (estado in (
    'sin_contactar', 'no_contesta', 'mail_enviado', 'mas_adelante', 'segundo_plazo',
    'otra_provincia', 'interesados', 'beca', 'no_existe', 'rechazada', 'lista_negra'
  ));
