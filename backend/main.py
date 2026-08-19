"""
Backend FastAPI: autenticacion, roles y alta de usuarios.
Unico responsable de hablar con Supabase con la service_role key.
"""

import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, EmailStr, Field, field_validator
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

app = FastAPI(title="API Gestion de Usuarios")

# En desarrollo se permite el origen del frontend (Vite -> localhost:5173).
# En produccion, restringir a la URL real del frontend.
ALLOWED_ORIGINS = os.environ.get("ALLOWED_ORIGINS", "http://localhost:5173").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

bearer_scheme = HTTPBearer(auto_error=True)


# ---------------------------------------------------------------
# Autenticacion / autorizacion
# ---------------------------------------------------------------


class UsuarioActual(BaseModel):
    id: str
    email: str | None
    nombre_completo: str | None
    role: str


def get_usuario_actual(
    credenciales: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> UsuarioActual:
    """Valida el JWT (access token de Supabase Auth) enviado en el header
    Authorization: Bearer <token> y obtiene el perfil (rol, nombre) del
    usuario desde public.profiles."""
    token = credenciales.credentials

    try:
        respuesta_auth = supabase.auth.get_user(token)
        usuario = respuesta_auth.user if respuesta_auth else None
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token invalido o expirado.",
        ) from exc

    if not usuario:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token invalido o expirado.",
        )

    try:
        perfil = (
            supabase.table("profiles")
            .select("nombre_completo, role")
            .eq("id", usuario.id)
            .single()
            .execute()
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="El usuario no tiene un perfil asociado.",
        ) from exc

    return UsuarioActual(
        id=usuario.id,
        email=usuario.email,
        nombre_completo=perfil.data["nombre_completo"],
        role=perfil.data["role"],
    )


def requerir_administrador(
    usuario: UsuarioActual = Depends(get_usuario_actual),
) -> UsuarioActual:
    if usuario.role != "administrador":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo un administrador puede realizar esta accion.",
        )
    return usuario


# ---------------------------------------------------------------
# Modelos
# ---------------------------------------------------------------


class LiderCuadrillaCreate(BaseModel):
    email: EmailStr
    password: str = Field(
        ..., min_length=8, description="Contrasena temporal para el nuevo usuario"
    )
    nombre_completo: str = Field(..., min_length=1)

    @field_validator("nombre_completo")
    @classmethod
    def nombre_no_vacio(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("El nombre completo no puede estar vacio")
        return value


class UsuarioOut(BaseModel):
    id: str
    email: str
    nombre_completo: str
    role: str


class PerfilUpdate(BaseModel):
    nombre_completo: str = Field(..., min_length=1)
    role: str

    @field_validator("nombre_completo")
    @classmethod
    def nombre_no_vacio(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("El nombre completo no puede estar vacio")
        return value

    @field_validator("role")
    @classmethod
    def role_valido(cls, value: str) -> str:
        if value not in ("administrador", "lider_cuadrilla"):
            raise ValueError("El rol debe ser administrador o lider_cuadrilla")
        return value


# ---------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/me", response_model=UsuarioActual)
def obtener_usuario_actual(
    usuario: UsuarioActual = Depends(get_usuario_actual),
) -> UsuarioActual:
    """Datos del usuario logueado (id, email, nombre, rol). El frontend la
    llama justo despues del login para decidir que interfaz mostrar."""
    return usuario


@app.get("/api/admin/usuarios", response_model=list[UsuarioOut])
def listar_usuarios(
    _admin: UsuarioActual = Depends(requerir_administrador),
) -> list[dict]:
    try:
        response = (
            supabase.table("profiles")
            .select("id, email, nombre_completo, role")
            .order("created_at", desc=True)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error interno al obtener los usuarios.",
        ) from exc

    return response.data or []


@app.put("/api/admin/usuarios/{usuario_id}", response_model=UsuarioOut)
def actualizar_usuario(
    usuario_id: str,
    payload: PerfilUpdate,
    admin: UsuarioActual = Depends(requerir_administrador),
) -> dict:
    if usuario_id == admin.id and payload.role != "administrador":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No puedes quitarte tu propio rol de administrador.",
        )

    try:
        response = (
            supabase.table("profiles")
            .update({"nombre_completo": payload.nombre_completo, "role": payload.role})
            .eq("id", usuario_id)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error interno al actualizar el usuario.",
        ) from exc

    if not response.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No se encontro un usuario con ese id.",
        )

    return response.data[0]


@app.post(
    "/api/admin/lideres",
    response_model=UsuarioOut,
    status_code=status.HTTP_201_CREATED,
)
def crear_lider_cuadrilla(
    payload: LiderCuadrillaCreate,
    _admin: UsuarioActual = Depends(requerir_administrador),
) -> dict:
    """Crea un usuario con rol lider_cuadrilla en Supabase Auth.

    Usa supabase.auth.admin (service_role key) para dar de alta al usuario,
    por lo que la sesion del administrador que hace la peticion (su propio
    access token, validado arriba) no se ve afectada en ningun momento.
    """
    try:
        creado = supabase.auth.admin.create_user(
            {
                "email": payload.email,
                "password": payload.password,
                "email_confirm": True,
                "user_metadata": {"nombre_completo": payload.nombre_completo},
                "app_metadata": {"role": "lider_cuadrilla"},
            }
        )
    except Exception as exc:
        mensaje = str(exc).lower()
        if "already" in mensaje or "duplicate" in mensaje or "exists" in mensaje:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Ya existe un usuario registrado con ese correo.",
            ) from exc
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error interno al crear el usuario.",
        ) from exc

    nuevo_usuario = creado.user if creado else None
    if not nuevo_usuario:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="No se pudo confirmar la creacion del usuario.",
        )

    return {
        "id": nuevo_usuario.id,
        "email": nuevo_usuario.email,
        "nombre_completo": payload.nombre_completo,
        "role": "lider_cuadrilla",
    }
