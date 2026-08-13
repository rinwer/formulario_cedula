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
  nombre_completo text,
  role text not null default 'lider_cuadrilla'
    check (role in ('administrador', 'lider_cuadrilla')),
  created_at timestamptz not null default now()
);

comment on table public.profiles is 'Perfil y rol de cada usuario autenticado. 1:1 con auth.users.';
comment on column public.profiles.role is 'Rol del usuario: administrador o lider_cuadrilla.';

-- ---------------------------------------------------------
-- 2. Trigger: crear el profile automaticamente al crear un auth.users
-- ---------------------------------------------------------
-- El backend (FastAPI), al crear un usuario con supabase.auth.admin.create_user,
-- manda el rol en app_metadata (no editable por el propio usuario) y el
-- nombre en user_metadata. Este trigger copia esos datos a public.profiles
-- justo despues de que Supabase inserta la fila en auth.users.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, nombre_completo, role)
  values (
    new.id,
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
-- 4. Bootstrap del primer administrador (ejecutar una sola vez)
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
