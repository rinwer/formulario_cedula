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
    ├── src/components/PerfilesPanel.tsx     Pestana "Perfiles" (crear/listar/editar lideres)
    ├── src/components/AsignacionPanel.tsx   Pestana "Asignacion" (trabajos + carga CSV)
    ├── src/components/MisTrabajosPanel.tsx  Vista del lider_cuadrilla (sus trabajos + actividades)
    ├── src/components/DailyPanel.tsx        Pestana "Daily" (calendario + avance del dia por site)
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

Todos requieren `Authorization: Bearer <access_token>` de un administrador,
salvo `GET /api/mis-trabajos` y los endpoints de `/api/mis-trabajos/{id}/avances`
(cualquier usuario logueado, pero solo sobre trabajos asignados a el mismo).

- `GET /api/admin/trabajos`: lista todos los trabajos (`id_smp`, `site`,
  `zona`, lider asignado) via embedding de PostgREST sobre la FK
  `trabajos.lider_id -> profiles.id`.
- `POST /api/admin/trabajos` / `PUT /api/admin/trabajos/{id}`: crea o
  actualiza un trabajo (`id_smp`, `site`, `zona`, `lider_id`, `estado` —
  `asignado` por defecto, `finalizado` o `standby`). Valida que
  `lider_id` exista, tenga rol `lider_cuadrilla` y este habilitado (400 si
  no). `site` es unico: crear/editar con un site repetido devuelve `409`.
- `POST /api/admin/actividades/importar` (`multipart/form-data`, campo
  `archivo`): importa un CSV con columnas `SITE, ACTIVIDAD, TIPIFICACION,
  HW-ACTIVIDAD, QTY, AVANCE`. El delimitador se detecta solo probando
  coma, punto y coma o punto contra el encabezado (asi soporta CSV
  exportados desde Excel en espanol, que suelen venir con `;`). Cada fila
  se liga al trabajo cuyo `site` coincida (sin distinguir mayusculas/
  espacios). Por cada trabajo afectado se reemplazan sus actividades
  anteriores por las del CSV nuevo. Responde
  `{ actividades_cargadas, sitios_no_encontrados }`.
- `GET /api/mis-trabajos`: trabajos asignados al usuario logueado (por
  `lider_id`), cada uno con sus actividades importadas. Es lo que
  consume el panel del `lider_cuadrilla`.
- `POST /api/mis-trabajos/{trabajo_id}/avances`: guarda el avance diario
  del lider (`comentario` y/o `detalles: [{actividad_id, cantidad}]`).
  Valida que el trabajo sea suyo y que cada `actividad_id` pertenezca a
  ese trabajo. Cada guardado crea un registro nuevo (tablas
  `avances_diarios` + `avances_diarios_detalle`); nunca sobreescribe el
  anterior, para llevar una bitacora dia a dia.
- `GET /api/mis-trabajos/{trabajo_id}/avances`: historial de avances
  guardados para ese trabajo (mas recientes primero).
- `GET /api/admin/avances-diarios?fecha=YYYY-MM-DD` (solo administrador,
  `fecha` opcional, por defecto hoy): por cada trabajo devuelve el site,
  el lider, si ya actualizo el avance ese dia (`actualizado`), el
  `porcentaje_avance` general del trabajo (acumulado de todo el
  historial hasta el final de esa fecha, sobre el `qty` de sus
  actividades), el detalle de lo avanzado (`detalle`, sumado por
  actividad) y los comentarios que dejo ese dia. No incluye trabajos en
  estado **Finalizado** o **Standby** (el lider ya no deberia estar
  reportando ahi), cuyo lider este deshabilitado, ni trabajos (o
  trabajos de un lider) creados despues de la fecha consultada — un
  site asignado hoy no aparece en el Daily de dias anteriores. Es
  lo que consume la pestana "Daily".

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
   - Pestana **Asignacion**: formulario para crear un trabajo (ID/SMP,
     site, zona, lider de cuadrilla — el selector solo muestra lideres
     habilitados), un boton para cargar el CSV de actividades, y la
     tabla de trabajos asignados (editable: ID/SMP, site, lider, zona,
     **estado**). El estado es **Asignado** (default), **Finalizado** o
     **Standby**; un trabajo en Finalizado o Standby deja de aparecer en
     la bandeja del lider de cuadrilla (`GET /api/mis-trabajos` solo
     devuelve los que estan en Asignado).
   - Pestana **Daily**: un calendario a la izquierda (resalta el dia de
     hoy y el dia seleccionado; "Ir a hoy" para volver rapido) y a la
     derecha, por cada trabajo, el site, el lider, si ya actualizo el
     avance de ese dia o no, el **% de avance** general del trabajo (a
     esa fecha), lo que reporto (por actividad) y su comentario. Cambiar
     el dia en el calendario recarga la tabla con los avances de ese
     dia. El "dia" se calcula en hora de Colombia (`America/Bogota`,
     offset fijo -05:00, sin horario de verano) tanto en el backend como
     en el frontend, para que un avance guardado de noche no aparezca
     clasificado en el dia siguiente por estar en UTC. Un trabajo no
     aparece en el Daily si su lider esta **deshabilitado**, ni en un
     dia anterior a la fecha en que se creo el perfil del lider (por
     ejemplo, si el perfil se creo hoy, no sale en el Daily de ayer).
3. Si es `lider_cuadrilla`, ve sus trabajos asignados (solo los que
   estan en estado Asignado) como tarjetas **colapsadas** por defecto
   (ID/SMP, site, zona y el % de avance general) que se despliegan al
   hacer clic, para no ver todas las asignaciones abiertas a la vez si
   tiene varias. Al desplegar una tarjeta se ve la tabla de actividades
   cargadas por CSV con una columna extra **Avance de hoy** para
   escribir cuanto avanzo en cada actividad, un cuadro de **comentario**
   y un boton **Guardar avance de hoy**. Cada guardado queda en un
   historial (fecha, comentario y detalle) que se muestra debajo de
   cada trabajo.
   Una columna **Estado** compara el acumulado de todos los avances
   guardados contra el `qty` de esa actividad: mientras falte, muestra en
   rojo **"Faltan N"** (N = `qty` menos lo ya acumulado, no un confuso
   "x/y"); al llegar a 0 se bloquea el input (ya no se le puede seguir
   reportando avance) y se muestra en verde **"Completado"**. El input
   "Avance de hoy" no deja escribir menos de 0 ni mas de "Faltan N" (se
   acota automaticamente al tope mientras escribe), y el backend valida
   lo mismo del lado del servidor (no se puede superar el `qty` aunque
   se llame a la API directamente). A la
   izquierda de la tabla hay un recuadro **"Avance por actividad"** que
   agrupa las filas por el nombre de la columna Actividad (ej. "1. PRE",
   "2. Instalacion") y muestra el % de avance de cada grupo (suma de
   acumulado / suma de qty). El detalle del historial identifica cada
   fila por su **HW-Actividad** (mas especifico que el nombre de
   Actividad, que se repite entre filas).

El access token de la sesion de Supabase se manda como
`Authorization: Bearer` en cada llamada al backend.

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
