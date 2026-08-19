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
    ├── src/App.tsx                     Login + shell con pestanas segun rol
    ├── src/lib/supabaseClient.ts       Cliente Supabase (anon key, solo Auth)
    ├── src/components/LoginPage.tsx
    ├── src/components/PerfilesPanel.tsx    Pestana "Perfiles" (crear/listar/editar lideres)
    ├── src/components/AsignacionPanel.tsx  Pestana "Asignacion" (trabajos por lider)
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

### Endpoints adicionales

- `GET /api/me` (requiere `Authorization: Bearer <access_token>` de
  cualquier usuario logueado): devuelve `id`, `email`, `nombre_completo` y
  `role`. El frontend lo llama justo despues del login para decidir que
  interfaz mostrar.
- `GET /api/admin/usuarios` (solo administrador): lista todos los perfiles
  (`administrador` y `lider_cuadrilla`) para la tabla de la pestana
  "Perfiles".
- `PUT /api/admin/usuarios/{id}` (solo administrador): actualiza
  `nombre_completo`, `email`, `role`, `activo` y opcionalmente `password`
  de un usuario existente. El email/password se actualizan en Supabase
  Auth via `supabase.auth.admin.update_user_by_id`; `activo` se traduce a
  `ban_duration` (`"none"` si esta habilitado, una duracion larga si no)
  para bloquear o permitir el login. Un administrador no puede quitarse a
  si mismo el rol de administrador ni deshabilitar su propia cuenta
  (evita quedar bloqueado sin ningun admin activo).

### Endpoints de trabajos (pestana "Asignacion")

Todos requieren `Authorization: Bearer <access_token>` de un administrador.

- `GET /api/admin/trabajos`: lista todos los trabajos con el nombre/correo
  del lider asignado (via embedding de PostgREST sobre la FK
  `trabajos.lider_id -> profiles.id`).
- `POST /api/admin/trabajos`: crea un trabajo (`titulo`, `descripcion`
  opcional, `lider_id`, `estado` inicial `pendiente`). Valida que
  `lider_id` exista y tenga rol `lider_cuadrilla` (400 si no).
- `PUT /api/admin/trabajos/{id}`: actualiza titulo, descripcion, lider
  asignado y estado (`pendiente` | `en_progreso` | `completado`).

Los campos de `trabajos` son minimos por ahora (titulo, descripcion,
estado); se amplian cuando se definan los campos finales de cada trabajo.

## 3. Frontend

```bash
cd frontend
npm install
cp .env.example .env
```

Completa `frontend/.env` con:

```
VITE_API_URL=http://localhost:8000
VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co
VITE_SUPABASE_ANON_KEY=TU_ANON_KEY
```

`VITE_SUPABASE_ANON_KEY` es la clave publica (`anon`) del paso 1 — no la
`service_role`. El frontend la usa unicamente para iniciar sesion contra
Supabase Auth (`supabase.auth.signInWithPassword`); toda la lectura/
escritura de datos sigue pasando por el backend.

```bash
npm run dev
```

Abre `http://localhost:5173`:

1. Pantalla de **login** (correo + contrasena).
2. Si el usuario logueado es `administrador`, aparece en la barra superior:
   - Pestana **Perfiles**: formulario para crear un `lider_cuadrilla`
     (nombre, correo, contrasena temporal) y tabla con todos los usuarios
     existentes. Cada uno tiene boton **Editar** para cambiar nombre,
     correo, contrasena (opcional, se deja en blanco para no cambiarla),
     rol, y un check **Habilitado** para permitir o bloquear su login.
   - Pestana **Asignacion**: formulario para crear un trabajo (titulo,
     descripcion, lider de cuadrilla) y tabla con todos los trabajos
     asignados, cada uno editable (titulo, descripcion, lider, estado).
3. Si es `lider_cuadrilla`, ve una pantalla de bienvenida simple (su panel
   propio, con sus trabajos asignados, se construye en un paso siguiente).

El access token de la sesion de Supabase se manda como
`Authorization: Bearer` en cada llamada a `/api/me`, `/api/admin/usuarios`,
`/api/admin/lideres` y `/api/admin/trabajos`.

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
