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
-- Campos minimos por ahora (titulo, descripcion, estado); se amplia mas
-- adelante cuando se definan los campos finales de cada trabajo.

create table if not exists public.trabajos (
  id uuid primary key default gen_random_uuid(),
  titulo text not null check (length(trim(titulo)) > 0),
  descripcion text,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'en_progreso', 'completado')),
  lider_id uuid not null references public.profiles (id) on delete cascade,
  asignado_por uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.trabajos is 'Trabajos asignados por un administrador a un lider_cuadrilla.';
comment on column public.trabajos.lider_id is 'profiles.id del lider_cuadrilla responsable del trabajo.';
comment on column public.trabajos.asignado_por is 'profiles.id del administrador que creo/asigno el trabajo.';

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
-- 5. Bootstrap del primer administrador (ejecutar una sola vez)
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
