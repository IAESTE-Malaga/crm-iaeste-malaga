-- ============================================================
-- Seguridad de las cuentas: bloquea el registro con correos temporales / desechables.
-- Se engancha como Auth Hook «Before User Created»:
--   Local:      ya activado en supabase/config.toml ([auth.hook.before_user_created]).
--   Producción: Authentication > Hooks > Before User Created > Postgres >
--               public.hook_antes_de_crear_usuario
-- La lista de src/App.jsx (DOMINIOS_DESECHABLES) es solo un aviso rápido en el navegador;
-- el bloqueo real es este. Para añadir un dominio basta con insertarlo en la tabla.
-- ============================================================

create table public.dominios_desechables (
  dominio text primary key check (dominio = lower(dominio))
);
-- Sin políticas: no se puede leer ni tocar desde la API
alter table public.dominios_desechables enable row level security;
revoke all on public.dominios_desechables from anon, authenticated;

insert into public.dominios_desechables (dominio) values
  ('mailinator.com'),
  ('guerrillamail.com'),
  ('guerrillamail.net'),
  ('guerrillamail.org'),
  ('guerrillamail.biz'),
  ('guerrillamailblock.com'),
  ('sharklasers.com'),
  ('grr.la'),
  ('pokemail.net'),
  ('spam4.me'),
  ('10minutemail.com'),
  ('10minutemail.net'),
  ('10minutemail.co.uk'),
  ('10minemail.com'),
  ('20minutemail.com'),
  ('temp-mail.org'),
  ('temp-mail.io'),
  ('tempmail.com'),
  ('tempmail.net'),
  ('tempmail.dev'),
  ('tempmailo.com'),
  ('tempmail.plus'),
  ('tempr.email'),
  ('tempail.com'),
  ('temporary-mail.net'),
  ('tmpmail.org'),
  ('tmpmail.net'),
  ('tmail.ws'),
  ('throwawaymail.com'),
  ('trashmail.com'),
  ('trashmail.net'),
  ('trashmail.de'),
  ('trash-mail.com'),
  ('yopmail.com'),
  ('yopmail.net'),
  ('yopmail.fr'),
  ('cool.fr.nf'),
  ('jetable.fr.nf'),
  ('nospam.ze.tc'),
  ('nomail.xl.cx'),
  ('mega.zik.dj'),
  ('speed.1s.fr'),
  ('courriel.fr.nf'),
  ('moncourrier.fr.nf'),
  ('monemail.fr.nf'),
  ('monmail.fr.nf'),
  ('dispostable.com'),
  ('getnada.com'),
  ('nada.email'),
  ('maildrop.cc'),
  ('mailnesia.com'),
  ('mailcatch.com'),
  ('mintemail.com'),
  ('mohmal.com'),
  ('emailondeck.com'),
  ('fakeinbox.com'),
  ('fakemail.net'),
  ('fake-mail.net'),
  ('spamgourmet.com'),
  ('spambox.us'),
  ('mytemp.email'),
  ('mailpoof.com'),
  ('moakt.com'),
  ('moakt.cc'),
  ('tempinbox.com'),
  ('inboxkitten.com'),
  ('burnermail.io'),
  ('mail.tm'),
  ('mail.gw'),
  ('emailfake.com'),
  ('email-fake.com'),
  ('crazymailing.com'),
  ('disposablemail.com'),
  ('discard.email'),
  ('discardmail.com'),
  ('discardmail.de'),
  ('harakirimail.com'),
  ('incognitomail.org'),
  ('mailforspam.com'),
  ('spamfree24.org'),
  ('mailtemp.net'),
  ('luxusmail.org'),
  ('tempmailaddress.com'),
  ('emltmp.com'),
  ('mailinator.net'),
  ('mailinator2.com'),
  ('binkmail.com'),
  ('bobmail.info'),
  ('chammy.info'),
  ('devnullmail.com'),
  ('letthemeatspam.com'),
  ('mailinater.com'),
  ('notmailinator.com'),
  ('reallymymail.com'),
  ('safetymail.info'),
  ('sogetthis.com'),
  ('spamherelots.com'),
  ('thisisnotmyrealemail.com'),
  ('tradermail.info'),
  ('veryrealemail.com'),
  ('zippymail.info'),
  ('mailexpire.com'),
  ('meltmail.com'),
  ('spamex.com'),
  ('anonbox.net'),
  ('anonymbox.com'),
  ('owlymail.com'),
  ('tempmailer.com'),
  ('temp-mail.ru'),
  ('dropmail.me'),
  ('mailsac.com'),
  ('inboxbear.com'),
  ('linshiyouxiang.net'),
  ('mail7.io'),
  ('smailpro.com'),
  ('byom.de'),
  ('wegwerfmail.de'),
  ('wegwerfmail.net'),
  ('einrot.com'),
  ('cuvox.de'),
  ('dayrep.com'),
  ('fleckens.hu'),
  ('gustr.com'),
  ('jourrapide.com'),
  ('rhyta.com'),
  ('superrito.com'),
  ('teleworm.us'),
  ('armyspy.com'),
  ('zetmail.com'),
  ('vomoto.com')
on conflict do nothing;

create or replace function public.hook_antes_de_crear_usuario(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dominio text := lower(split_part(coalesce(event -> 'user' ->> 'email', ''), '@', 2));
begin
  if v_dominio <> '' and exists (
    select 1 from public.dominios_desechables d
    where v_dominio = d.dominio or v_dominio like '%.' || d.dominio
  ) then
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 400,
      'message', 'No se admiten correos temporales o desechables. Usa tu email personal o el de la universidad.'
    ));
  end if;
  return '{}'::jsonb;
end;
$$;

revoke execute on function public.hook_antes_de_crear_usuario(jsonb) from public, anon, authenticated;
grant execute on function public.hook_antes_de_crear_usuario(jsonb) to supabase_auth_admin;
