# CRM IAESTE

CRM para gestionar el contacto con empresas del comité. React + Vite + Tailwind CSS v4 + Supabase (auth y base de datos compartida con Row Level Security).

- **Admins**: ven todas las empresas, las crean/editan/eliminan, asignan responsables y gestionan roles del equipo.
- **Miembros**: solo ven sus empresas asignadas y únicamente pueden actualizar el estado y las notas (impuesto en base de datos, no solo en la interfaz).
- **Estados**: Sin contactar → Contactado → En conversación → Oferta conseguida / Rechazada.

## 1. Crear el proyecto en Supabase

1. Entra en [supabase.com](https://supabase.com) → **New project** (plan gratuito).
2. Ve a **SQL Editor**, pega el contenido completo de `supabase/schema.sql` y pulsa **Run**.
3. En **Authentication → Sign In / Up → Email**, desactiva **Confirm email** (para que el equipo pueda registrarse sin verificación de correo).
4. En **Project Settings → API**, copia la **Project URL** y la **anon public key**.

## 2. Configurar y ejecutar en local

```bash
cp .env.example .env      # y rellena con tu URL y anon key
npm install
npm run dev
```

**El primer usuario que se registre será admin automáticamente** (regístrate tú primero). El resto entra como miembro; desde la pestaña **Equipo** puedes ascender a la segunda persona a admin.

## 3. Desplegar en Vercel

1. Sube el repo a GitHub.
2. En [vercel.com](https://vercel.com) → **Add New Project** → importa el repo (detecta Vite solo).
3. En **Environment Variables** añade `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
4. **Deploy**. Comparte la URL con el equipo.

## Notas de seguridad

- La `anon key` es pública por diseño; la seguridad real la imponen las políticas RLS del esquema.
- El fichero `.env` está en `.gitignore` — no lo subas nunca al repo.
