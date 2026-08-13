# Gestion de Usuarios (autenticacion y roles)

Sistema con dos roles: `administrador` y `lider_cuadrilla`. No hay registro
publico: un administrador da de alta a cada lider_cuadrilla desde el
frontend, que llama al backend, que crea el usuario en Supabase Auth con
la `service_role` key. Arquitectura:

```
Frontend (React + Vite + Tailwind)  --HTTP-->  Backend (FastAPI)  --SDK-->  Supabase (Auth + Postgres)
```

## Estructura

```
formulario-cedula/
├── sql/schema.sql        Script para el SQL Editor de Supabase (tabla profiles, trigger, RLS)
├── backend/               API en FastAPI
│   ├── main.py
│   ├── requirements.txt
│   └── .env.example
└── frontend/               React + TypeScript + Tailwind
    ├── src/App.tsx
    └── .env.example
```

## 1. Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. Ve a **SQL Editor** y ejecuta el contenido de `sql/schema.sql`. Esto crea
   `public.profiles`, el trigger que la sincroniza con `auth.users`, y las
   politicas RLS (bloqueo total salvo el backend).
3. Ve a **Authentication > Users > Add user** y crea manualmente el primer
   administrador (no hay registro publico).
4. Promuevelo a administrador corriendo en el SQL Editor:
   ```sql
   update public.profiles
   set role = 'administrador'
   where id = (select id from auth.users where email = 'admin@tudominio.com');
   ```
5. Ve a **Settings > API** y copia `Project URL` y la `service_role` key
   (no la `anon` key: el backend necesita permisos de administrador).

## 2. Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate       # Windows: venv\Scripts\activate
pip install -r ../requirements.txt
cp .env.example .env           # completa SUPABASE_URL y SUPABASE_KEY
uvicorn main:app --reload --port 8000
```

Prueba: `http://localhost:8000/api/health` debe responder `{"status":"ok"}`.

### Endpoint: alta de lider_cuadrilla

`POST /api/admin/lideres`

Requiere header `Authorization: Bearer <access_token>` de un usuario cuyo
`profile.role` sea `administrador` (se valida contra Supabase Auth y contra
`public.profiles` en cada peticion).

```json
{
  "email": "lider1@ejemplo.com",
  "password": "unaContrasenaTemporal123",
  "nombre_completo": "Juan Perez"
}
```

Respuestas: `201` con el usuario creado, `401` sin token o token invalido,
`403` si quien llama no es administrador, `409` si el correo ya existe.

## 3. Frontend

```bash
cd frontend
npm install
cp .env.example .env           # VITE_API_URL=http://localhost:8000
npm run dev
```

Abre `http://localhost:5173`. Por ahora muestra una pantalla de
"en construccion": el login y el panel de administracion (que consume
`POST /api/admin/lideres`) se implementan en el siguiente paso, una vez
validada la base de datos y el backend.

## Notas de seguridad

- La tabla `profiles` tiene RLS habilitado sin ninguna politica: el acceso
  publico (`anon`) y de cualquier usuario autenticado queda bloqueado por
  completo. Solo el backend, con la `service_role` key, puede leerla/
  escribirla.
- El rol de cada usuario se guarda en `app_metadata` (no editable por el
  propio usuario) y se copia a `profiles.role` via trigger; nunca se confia
  en un rol que venga del propio payload del frontend sin validar contra
  `profiles`.
- Crear un usuario via `supabase.auth.admin.create_user` no toca la sesion
  de quien hace la peticion (el administrador), porque usa la service_role
  key en el backend en vez de `signUp` desde el navegador.
