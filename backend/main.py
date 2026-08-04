"""
Backend FastAPI para el formulario de registro de personas.
Unico responsable de hablar con Supabase (el frontend no lo hace directo).
"""

import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator
from supabase import Client, create_client

load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")  # service_role key (solo backend)

if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError(
        "Faltan las variables de entorno SUPABASE_URL y/o SUPABASE_KEY. "
        "Copia .env.example a .env y completa los valores."
    )

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

app = FastAPI(title="API Registro de Personas")

# En desarrollo se permite el origen del frontend (Vite -> localhost:5173).
# En produccion, restringir a la URL real del frontend.
ALLOWED_ORIGINS = os.environ.get("ALLOWED_ORIGINS", "http://localhost:5173").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class PersonaCreate(BaseModel):
    cedula: str = Field(..., description="Numero de cedula, solo digitos")
    nombre_completo: str = Field(..., min_length=1, description="Nombre completo de la persona")

    @field_validator("cedula")
    @classmethod
    def cedula_solo_numeros(cls, value: str) -> str:
        value = value.strip()
        if not value.isdigit():
            raise ValueError("La cedula debe contener solo numeros")
        return value

    @field_validator("nombre_completo")
    @classmethod
    def nombre_no_vacio(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("El nombre completo no puede estar vacio")
        return value


class PersonaOut(BaseModel):
    cedula: str
    nombre_completo: str


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/api/personas", response_model=PersonaOut, status_code=status.HTTP_201_CREATED)
def crear_persona(persona: PersonaCreate) -> PersonaOut:
    try:
        response = (
            supabase.table("personas")
            .insert({"cedula": persona.cedula, "nombre_completo": persona.nombre_completo})
            .execute()
        )
    except Exception as exc:  # supabase-py lanza excepciones de postgrest
        mensaje = str(exc)
        # Codigo 23505 = violacion de llave unica/primaria en PostgreSQL
        if "23505" in mensaje or "duplicate key" in mensaje.lower():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Ya existe un registro con esa cedula.",
            ) from exc
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error interno al guardar el registro.",
        ) from exc

    if not response.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="No se pudo confirmar el guardado del registro.",
        )

    return response.data[0]
