-- ============================================================
-- Plantillas: sin «Telecomunicación» y «becario» pasa a «estudiante»
--
-- La plantilla de serie guarda el texto en la base de datos, así que el cambio de código no la toca.
-- Esta migración quita las menciones a Telecomunicación (la firma y la sigla TLMA) y cambia «becario»
-- por «estudiante» en el texto legal. Es idempotente: si se vuelve a ejecutar no encuentra nada que cambiar.
-- ============================================================

update public.plantillas
set cuerpo = replace(replace(replace(replace(replace(cuerpo,
  'E.T.S.I. Telecomunicación Málaga<br>', ''),
  'IAESTE Telecomunicación Málaga', 'IAESTE Málaga'),
  'IAESTE TLMA', 'IAESTE Málaga'),
  'becarios', 'estudiantes'),
  'becario', 'estudiante')
where cuerpo ~* 'telecomunicaci|tlma|becari';
