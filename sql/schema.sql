-- =========================================================
-- Script SQL para Supabase (PostgreSQL)
-- Sistema de autenticacion y roles (profiles)
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- =========================================================

-- ---------------------------------------------------------
-- 0. Limpieza del proyecto anterior (registro de personas)
-- ---------------------------------------------------------
drop table if exists public.personas;

-- ---------------------------------------------------------
-- 1. Tabla profiles
-- ---------------------------------------------------------
-- Vinculada 1:1 con auth.users (mismo id). Guarda el rol de cada
-- usuario y datos basicos de perfil que no viven en auth.users.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  nombre_completo text,
  role text not null default 'lider_cuadrilla'
    check (role in ('administrador', 'lider_cuadrilla')),
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

-- Por si la tabla ya existia de una corrida anterior de este script
-- (create table if not exists no agrega columnas nuevas a una tabla
-- existente):
alter table public.profiles add column if not exists activo boolean not null default true;

comment on table public.profiles is 'Perfil y rol de cada usuario autenticado. 1:1 con auth.users.';
comment on column public.profiles.role is 'Rol del usuario: administrador o lider_cuadrilla.';
comment on column public.profiles.activo is 'Si es false, el usuario esta deshabilitado (no puede iniciar sesion).';

-- ---------------------------------------------------------
-- 2. Trigger: crear el profile automaticamente al crear un auth.users
-- ---------------------------------------------------------
-- El backend (FastAPI), al crear un usuario con supabase.auth.admin.create_user,
-- manda el rol en app_metadata (no editable por el propio usuario) y el
-- nombre en user_metadata. Este trigger copia esos datos (mas el email)
-- a public.profiles justo despues de que Supabase inserta la fila en
-- auth.users.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, nombre_completo, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'nombre_completo', ''),
    coalesce(new.raw_app_meta_data ->> 'role', 'lider_cuadrilla')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------
-- 3. Row Level Security (RLS)
-- ---------------------------------------------------------
-- El frontend no habla directo con esta tabla: el backend (FastAPI) usa
-- la service_role key, que por defecto salta RLS. Se habilita RLS igual
-- como capa de seguridad adicional y no se crea NINGUNA politica, por lo
-- que cualquier acceso con la clave anonima (anon) o con un JWT de
-- usuario autenticado (authenticated) queda bloqueado por completo.

alter table public.profiles enable row level security;

-- Si en el futuro el frontend necesita leer su propio perfil
-- directamente con la anon key (por ejemplo para mostrar el rol en la
-- UI sin pasar por el backend), se puede agregar una politica explicita
-- como esta:
--
-- create policy "Un usuario puede ver su propio perfil"
--   on public.profiles
--   for select
--   to authenticated
--   using (id = auth.uid());

-- ---------------------------------------------------------
-- 4. Tabla trabajos (asignacion de trabajos a lideres de cuadrilla)
-- ---------------------------------------------------------
-- Campos: id_smp (identificador de la orden/SMP), site, zona y el lider
-- de cuadrilla responsable. "site" es unico porque las actividades del
-- CSV (tabla actividades) se enlazan por nombre de site.

create table if not exists public.trabajos (
  id uuid primary key default gen_random_uuid(),
  id_smp text not null check (length(trim(id_smp)) > 0),
  site text not null unique check (length(trim(site)) > 0),
  zona text not null check (length(trim(zona)) > 0),
  lider_id uuid references public.profiles (id) on delete cascade,
  asignado_por uuid references public.profiles (id) on delete set null,
  estado text not null default 'asignado',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- La pestana "Trabajos" (antes "Asignacion") ya no asigna lider al crear
-- el trabajo; el lider se asigna despues, en otro flujo. Por eso
-- lider_id paso a ser opcional.
alter table public.trabajos alter column lider_id drop not null;

-- Por si la tabla ya existia con el esquema anterior (titulo,
-- descripcion, estado con otros valores): se agregan las columnas
-- nuevas y se quitan las viejas para dejar el esquema al dia de forma
-- idempotente.
alter table public.trabajos add column if not exists id_smp text;
alter table public.trabajos add column if not exists site text;
alter table public.trabajos add column if not exists zona text;
alter table public.trabajos drop column if exists titulo;
alter table public.trabajos drop column if exists descripcion;
-- OJO: la columna estado ya NO se dropea aqui (se dropeaba cuando tenia
-- los valores viejos pendiente/en_progreso/completado). Ahora estado
-- vuelve a existir con otro significado (asignado/finalizado/standby) y
-- si se siguiera dropeando en cada corrida del script se perderian esos
-- valores cada vez que el admin vuelva a ejecutar schema.sql.
alter table public.trabajos add column if not exists estado text not null default 'asignado';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'trabajos_site_key'
  ) then
    alter table public.trabajos add constraint trabajos_site_key unique (site);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'trabajos_estado_check'
  ) then
    alter table public.trabajos add constraint trabajos_estado_check
      check (estado in ('asignado', 'finalizado', 'standby'));
  end if;
end $$;

comment on table public.trabajos is 'Trabajos asignados por un administrador a un lider_cuadrilla.';
comment on column public.trabajos.id_smp is 'Identificador de la orden/SMP del trabajo.';
comment on column public.trabajos.site is 'Nombre del site; debe coincidir con la columna SITE del CSV de actividades.';
comment on column public.trabajos.lider_id is 'profiles.id del lider_cuadrilla responsable del trabajo; puede ser nulo hasta que se asigne.';
comment on column public.trabajos.asignado_por is 'profiles.id del administrador que creo/asigno el trabajo.';
comment on column public.trabajos.estado is 'asignado (visible para el lider), finalizado o standby (ya no aparecen en su bandeja).';

create index if not exists idx_trabajos_lider_id on public.trabajos (lider_id);

-- Misma logica de RLS que profiles: bloqueo total, solo el backend
-- (service_role) lee/escribe esta tabla.
alter table public.trabajos enable row level security;

-- Mantiene updated_at al dia en cada UPDATE, sin que el backend tenga
-- que mandarlo explicitamente.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_trabajos_updated_at on public.trabajos;

create trigger set_trabajos_updated_at
  before update on public.trabajos
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------
-- 4b. Tabla trabajos_historial_estado (cuando cambio Asignado/Finalizado/Standby)
-- ---------------------------------------------------------
-- trabajos.estado solo guarda el estado ACTUAL. Para saber que estado
-- tenia un trabajo en una fecha pasada (y asi no ocultar del Daily un
-- dia en el que si estaba Asignado, ni mostrar un dia en el que estaba
-- en Standby), el backend guarda aqui un registro cada vez que el
-- estado cambia de verdad (al crear el trabajo, y en cada PUT donde el
-- estado sea distinto al anterior).

create table if not exists public.trabajos_historial_estado (
  id uuid primary key default gen_random_uuid(),
  trabajo_id uuid not null references public.trabajos (id) on delete cascade,
  estado text not null check (estado in ('asignado', 'finalizado', 'standby')),
  created_at timestamptz not null default now()
);

comment on table public.trabajos_historial_estado is 'Historial de cambios de trabajos.estado, para saber el estado vigente en una fecha pasada.';

create index if not exists idx_historial_estado_trabajo_id on public.trabajos_historial_estado (trabajo_id);

alter table public.trabajos_historial_estado enable row level security;

-- ---------------------------------------------------------
-- 5. Tabla actividades (importadas por CSV, ligadas a un trabajo por site)
-- ---------------------------------------------------------
-- El CSV trae: SITE, ACTIVIDAD, TIPIFICACION, HW-ACTIVIDAD, QTY, AVANCE.
-- El backend resuelve SITE -> trabajos.id (coincidencia exacta, sin
-- distinguir mayusculas/minusculas ni espacios de mas) antes de insertar.

create table if not exists public.actividades (
  id uuid primary key default gen_random_uuid(),
  trabajo_id uuid not null references public.trabajos (id) on delete cascade,
  actividad text,
  tipificacion text,
  hw_actividad text,
  qty text,
  avance text,
  created_at timestamptz not null default now()
);

comment on table public.actividades is 'Actividades por site importadas desde CSV, ligadas a trabajos.id.';

create index if not exists idx_actividades_trabajo_id on public.actividades (trabajo_id);

alter table public.actividades enable row level security;

-- ---------------------------------------------------------
-- 6. Tabla avances_diarios (bitacora diaria del lider de cuadrilla)
-- ---------------------------------------------------------
-- Cada vez que el lider guarda su avance del dia se crea UNA fila en
-- avances_diarios (el comentario general) y una fila en
-- avances_diarios_detalle por cada actividad a la que le reporto avance
-- ese dia. Es un historial append-only: nunca se sobreescribe, cada
-- guardado agrega un registro nuevo.

create table if not exists public.avances_diarios (
  id uuid primary key default gen_random_uuid(),
  trabajo_id uuid not null references public.trabajos (id) on delete cascade,
  lider_id uuid not null references public.profiles (id) on delete cascade,
  comentario text,
  created_at timestamptz not null default now()
);

create table if not exists public.avances_diarios_detalle (
  id uuid primary key default gen_random_uuid(),
  avance_diario_id uuid not null references public.avances_diarios (id) on delete cascade,
  actividad_id uuid not null references public.actividades (id) on delete cascade,
  cantidad integer not null check (cantidad >= 0),
  created_at timestamptz not null default now()
);

comment on table public.avances_diarios is 'Un registro por cada guardado diario de avance de un lider_cuadrilla.';
comment on table public.avances_diarios_detalle is 'Cantidad avanzada ese dia por actividad, ligada a un avance_diario.';

create index if not exists idx_avances_diarios_trabajo_id on public.avances_diarios (trabajo_id);
create index if not exists idx_avances_detalle_avance_id on public.avances_diarios_detalle (avance_diario_id);
create index if not exists idx_avances_detalle_actividad_id on public.avances_diarios_detalle (actividad_id);

alter table public.avances_diarios enable row level security;
alter table public.avances_diarios_detalle enable row level security;

-- ---------------------------------------------------------
-- 7. Bootstrap del primer administrador (ejecutar una sola vez)
-- ---------------------------------------------------------
-- No hay registro publico, asi que el primer administrador se crea a
-- mano desde el Supabase Dashboard > Authentication > Users > Add user.
-- Ese alta dispara el trigger de arriba y crea su profile con el rol
-- por defecto 'lider_cuadrilla'. Despues, promuevelo a administrador
-- reemplazando el email y corriendo:
--
-- update public.profiles
-- set role = 'administrador'
-- where id = (select id from auth.users where email = 'admin@tudominio.com');
