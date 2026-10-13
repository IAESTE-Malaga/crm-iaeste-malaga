-- ============================================================
-- Plantilla de serie: el correo para enviar la documentación es el mismo desde el que se envía el CRM
--
-- Hasta ahora la plantilla indicaba iaestetlmd@gmail.com. Pasa a la cuenta de empresa que usa el
-- servicio de correo (GMAIL_USER), la misma que aparece como remitente en los correos enviados.
-- Es idempotente: si se vuelve a ejecutar no encuentra nada que cambiar.
-- ============================================================

update public.plantillas
set cuerpo = replace(cuerpo, 'iaestetlmd@gmail.com', 'empresasiaestemalaga@gmail.com')
where cuerpo like '%iaestetlmd@gmail.com%';
