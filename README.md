# Registro de Persona (cedula + nombre completo)

Formulario web sencillo: cedula (llave primaria), nombre completo, boton
Guardar, y pop-up de exito o duplicado. Arquitectura desacoplada:

```
Frontend (React + Vite + Tailwind)  --HTTP-->  Backend (FastAPI)  --SDK-->  Supabase (Postgres)
```

El frontend nunca habla directo con Supabase; todo pasa por el backend.

## Estructura

```
formulario-cedula/
├── sql/schema.sql        Script para el SQL Editor de Supabase
├── backend/               API en FastAPI
│   ├── main.py
│   ├── requirements.txt
│   └── .env.example
└── frontend/               Formulario en React + TypeScript + Tailwind
    ├── src/App.tsx
    └── .env.example
```

## 1. Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. Ve a **SQL Editor** y ejecuta el contenido de `sql/schema.sql`.
3. Ve a **Settings > API** y copia `Project URL` y la `service_role` key
   (no la `anon` key: el backend necesita permisos completos y RLS
   bloquea a `anon`).

## 2. Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate       # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env           # completa SUPABASE_URL y SUPABASE_KEY
uvicorn main:app --reload --port 8000
```

Prueba: `http://localhost:8000/api/health` debe responder `{"status":"ok"}`.

## 3. Frontend

```bash
cd frontend
npm install
cp .env.example .env           # VITE_API_URL=http://localhost:8000
npm run dev
```

Abre `http://localhost:5173`. Llena cedula y nombre, presiona **Guardar**:
- Registro nuevo → pop-up verde "Guardado con exito".
- Cedula ya existente → pop-up amarillo "Registro duplicado".
- Falla de conexion/servidor → pop-up rojo con el detalle del error.

## Validaciones

- **Cedula**: solo digitos, obligatoria (validado en frontend y en el
  backend con Pydantic; la base de datos tambien lo exige con un
  `check constraint`).
- **Nombre completo**: obligatorio, no vacio.
- **Duplicados**: al ser `cedula` la llave primaria, un segundo insert
  con la misma cedula falla en Postgres (codigo `23505`); el backend lo
  traduce a `409 Conflict` y el frontend muestra el pop-up de duplicado.

## Buenas practicas de commits (Conventional Commits)

Sugerido para esta funcionalidad, en commits separados:

```
feat(db): agregar tabla personas con RLS en Supabase
feat(api): endpoint POST /api/personas con validacion y manejo de duplicados
feat(web): formulario de registro con pop-up de exito/duplicado
docs: instrucciones de configuracion y despliegue
```
