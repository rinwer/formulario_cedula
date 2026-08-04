-- =========================================================
-- Script SQL para Supabase (PostgreSQL)
-- Tabla: personas
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- =========================================================

create table if not exists public.personas (
  cedula text primary key check (cedula ~ '^[0-9]+$'),
  nombre_completo text not null check (length(trim(nombre_completo)) > 0),
  created_at timestamptz not null default now()
);

comment on table public.personas is 'Registro de personas identificadas por cedula (llave primaria).';
comment on column public.personas.cedula is 'Numero de cedula, solo digitos. Llave primaria (evita duplicados).';

-- -------------------------------------------------------
-- Row Level Security (RLS)
-- -------------------------------------------------------
-- El frontend NUNCA habla directo con Supabase (arquitectura API-first).
-- Solo el backend (FastAPI) accede, usando la service_role key,
-- que por defecto salta RLS. Se habilita RLS igual como buena practica
-- y para bloquear cualquier acceso con la clave anonima (anon key).

alter table public.personas enable row level security;

-- Ninguna politica para 'anon' => acceso publico directo queda bloqueado.
-- Si en el futuro se necesita leer con la anon key desde el navegador,
-- se puede agregar una politica explicita de SELECT como esta:
--
-- create policy "Lectura publica de personas"
--   on public.personas
--   for select
--   to anon
--   using (true);

-- Indice adicional por si se buscara por nombre en el futuro (opcional).
create index if not exists idx_personas_nombre on public.personas (nombre_completo);
