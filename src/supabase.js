import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

// Sin variables de entorno createClient lanza una excepción y la app se queda en blanco:
// mejor decirlo claro en pantalla y en la consola.
if (!url || !key) {
  const msg = 'Faltan VITE_SUPABASE_URL y/o VITE_SUPABASE_ANON_KEY. ' +
    'En local ejecuta `npm run local:setup`; en Vercel añádelas en Settings → Environment Variables.'
  console.error(msg)
  document.body.innerHTML = `<pre style="padding:2rem;white-space:pre-wrap;font:14px system-ui;color:#be123c">${msg}</pre>`
  throw new Error(msg)
}

export const supabase = createClient(url, key)
