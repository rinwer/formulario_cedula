"""
Backend FastAPI: autenticacion, roles y alta de usuarios.
Unico responsable de hablar con Supabase con la service_role key.
"""

import csv
import io
import os
from datetime import date, datetime, timedelta, timezone

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, HTTPException, Query, UploadFile, status
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

# Colombia no tiene horario de verano: el offset es siempre -05:00. Se usa
# para calcular "hoy" y los limites de cada dia en la pestana Daily, en
# vez de la fecha UTC del servidor (que puede diferir varias horas).
ZONA_COLOMBIA = timezone(timedelta(hours=-5))

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


ROLES_VALIDOS = ("administrador", "coordinador", "visualizador", "lider_cuadrilla")


def requerir_administrador(
    usuario: UsuarioActual = Depends(get_usuario_actual),
) -> UsuarioActual:
    """Solo el administrador (superusuario) puede gestionar usuarios: crear,
    editar rol/estado, resetear contrasena. Un coordinador no llega aqui."""
    if usuario.role != "administrador":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo un administrador puede realizar esta accion.",
        )
    return usuario


def requerir_staff(
    usuario: UsuarioActual = Depends(get_usuario_actual),
) -> UsuarioActual:
    """Administrador y coordinador comparten las pestanas operativas
    (Trabajos, Programacion, Daily); solo el administrador administra
    usuarios (ver requerir_administrador)."""
    if usuario.role not in ("administrador", "coordinador"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permiso para realizar esta accion.",
        )
    return usuario


def requerir_acceso_daily(
    usuario: UsuarioActual = Depends(get_usuario_actual),
) -> UsuarioActual:
    """El visualizador es un rol de solo lectura: unicamente puede ver el
    Daily (ni Trabajos/Programacion ni, mucho menos, Perfiles)."""
    if usuario.role not in ("administrador", "coordinador", "visualizador"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permiso para ver esta informacion.",
        )
    return usuario


# ---------------------------------------------------------------
# Modelos
# ---------------------------------------------------------------


class UsuarioCreate(BaseModel):
    email: EmailStr
    password: str = Field(
        ..., min_length=8, description="Contrasena temporal para el nuevo usuario"
    )
    nombre_completo: str = Field(..., min_length=1)
    role: str = "lider_cuadrilla"

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
        if value not in ROLES_VALIDOS:
            raise ValueError("El rol debe ser administrador, coordinador o lider_cuadrilla")
        return value


class UsuarioOut(BaseModel):
    id: str
    email: str
    nombre_completo: str
    role: str
    activo: bool = True


class PerfilUpdate(BaseModel):
    nombre_completo: str = Field(..., min_length=1)
    email: EmailStr
    role: str
    activo: bool = True
    password: str | None = Field(
        default=None, description="Dejar vacio para no cambiar la contrasena"
    )

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
        if value not in ROLES_VALIDOS:
            raise ValueError("El rol debe ser administrador, coordinador o lider_cuadrilla")
        return value

    @field_validator("password")
    @classmethod
    def password_valida(cls, value: str | None) -> str | None:
        if not value:
            return None
        if len(value) < 8:
            raise ValueError("La contrasena debe tener al menos 8 caracteres")
        return value


def _campo_no_vacio(value: str, nombre_campo: str) -> str:
    value = value.strip()
    if not value:
        raise ValueError(f"{nombre_campo} no puede estar vacio")
    return value


ESTADOS_TRABAJO = ("asignado", "finalizado", "standby")


class TrabajoCreate(BaseModel):
    id_smp: str = Field(..., min_length=1)
    site: str = Field(..., min_length=1)
    zona: str = Field(..., min_length=1)
    estado: str = "asignado"

    @field_validator("id_smp")
    @classmethod
    def id_smp_no_vacio(cls, value: str) -> str:
        return _campo_no_vacio(value, "El ID / SMP")

    @field_validator("site")
    @classmethod
    def site_no_vacio(cls, value: str) -> str:
        return _campo_no_vacio(value, "El site")

    @field_validator("zona")
    @classmethod
    def zona_no_vacia(cls, value: str) -> str:
        return _campo_no_vacio(value, "La zona")

    @field_validator("estado")
    @classmethod
    def estado_valido(cls, value: str) -> str:
        if value not in ESTADOS_TRABAJO:
            raise ValueError(f"El estado debe ser uno de: {', '.join(ESTADOS_TRABAJO)}")
        return value


class TrabajoUpdate(TrabajoCreate):
    pass


class TrabajoOut(BaseModel):
    id: str
    id_smp: str
    site: str
    zona: str
    lider_id: str | None = None
    estado: str = "asignado"
    lider_nombre: str | None = None
    lider_email: str | None = None


class ActividadOut(BaseModel):
    id: str
    actividad: str | None
    tipificacion: str | None
    hw_actividad: str | None
    qty: str | None
    avance: str | None


class TrabajoConActividadesOut(TrabajoOut):
    actividades: list[ActividadOut] = []


class ActividadCreate(BaseModel):
    actividad: str = Field(..., min_length=1)
    tipificacion: str | None = None
    hw_actividad: str | None = None
    qty: str | None = None
    avance: str | None = None

    @field_validator("actividad")
    @classmethod
    def actividad_no_vacia(cls, value: str) -> str:
        return _campo_no_vacio(value, "La actividad")


class ActividadUpdate(ActividadCreate):
    pass


class ActividadAdminOut(ActividadOut):
    tiene_avance: bool = False


class ImportarActividadesResultado(BaseModel):
    actividades_cargadas: int
    sitios_no_encontrados: list[str]


class AvanceDetalleIn(BaseModel):
    actividad_id: str
    cantidad: int = Field(..., ge=0)


class AvanceDiarioCreate(BaseModel):
    comentario: str | None = None
    detalles: list[AvanceDetalleIn] = []

    @field_validator("comentario")
    @classmethod
    def comentario_limpio(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        return value or None


class AvanceDetalleOut(BaseModel):
    actividad_id: str
    cantidad: int


class AvanceDiarioOut(BaseModel):
    id: str
    trabajo_id: str
    comentario: str | None
    created_at: str
    detalles: list[AvanceDetalleOut] = []


class AvanceResumenDetalle(BaseModel):
    actividad: str | None
    hw_actividad: str | None
    cantidad: int


class AvanceDiarioAdminOut(BaseModel):
    trabajo_id: str
    id_smp: str
    site: str
    zona: str
    lider_id: str | None = None
    lider_nombre: str | None = None
    lider_email: str | None = None
    actualizado: bool
    comentarios: list[str] = []
    detalle: list[AvanceResumenDetalle] = []
    porcentaje_avance: int | None = None
    dias_en_sitio: int | None = None


class ProgramacionAsignar(BaseModel):
    trabajo_id: str
    lider_id: str
    fecha: str

    @field_validator("fecha")
    @classmethod
    def fecha_valida(cls, value: str) -> str:
        try:
            date.fromisoformat(value)
        except ValueError as exc:
            raise ValueError("La fecha debe tener el formato YYYY-MM-DD") from exc
        return value


def _parsear_timestamptz(valor: str) -> datetime:
    return datetime.fromisoformat(valor.replace("Z", "+00:00"))


def obtener_trabajo_del_lider(trabajo_id: str, lider_id: str) -> dict:
    """Valida que trabajo_id exista y que, segun la tabla programacion,
    el lider este programado para trabajarlo HOY (hora Colombia)."""
    try:
        trabajo = (
            supabase.table("trabajos").select("id").eq("id", trabajo_id).single().execute()
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No se encontro el trabajo.",
        ) from exc

    hoy = datetime.now(ZONA_COLOMBIA).date()
    try:
        programado = (
            supabase.table("programacion")
            .select("id")
            .eq("trabajo_id", trabajo_id)
            .eq("lider_id", lider_id)
            .eq("fecha", hoy.isoformat())
            .execute()
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error interno al validar la programacion.",
        ) from exc

    if not programado.data:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Ese trabajo no esta programado para ti hoy.",
        )

    return trabajo.data


def obtener_perfil_lider(lider_id: str) -> dict:
    """Valida que lider_id exista, tenga rol lider_cuadrilla y este
    habilitado; devuelve su nombre/email para no volver a consultarlos."""
    try:
        perfil = (
            supabase.table("profiles")
            .select("nombre_completo, email, role, activo")
            .eq("id", lider_id)
            .single()
            .execute()
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No se encontro un lider de cuadrilla con ese id.",
        ) from exc

    if perfil.data["role"] != "lider_cuadrilla":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El trabajo solo se puede asignar a un usuario con rol lider_cuadrilla.",
        )

    if not perfil.data["activo"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El lider de cuadrilla esta deshabilitado.",
        )

    return perfil.data


def obtener_info_lider_opcional(lider_id: str | None) -> dict:
    """Nombre/email del lider para mostrar en la respuesta de un trabajo,
    o vacio si el trabajo todavia no tiene lider asignado."""
    if not lider_id:
        return {}
    try:
        perfil = (
            supabase.table("profiles")
            .select("nombre_completo, email")
            .eq("id", lider_id)
            .single()
            .execute()
        )
    except Exception:
        return {}
    return perfil.data or {}


def fila_trabajo_a_salida(fila: dict) -> dict:
    lider = fila.pop("lider", None) or {}
    fila["lider_nombre"] = lider.get("nombre_completo")
    fila["lider_email"] = lider.get("email")
    return fila


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
            .select("id, email, nombre_completo, role, activo")
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
    if usuario_id == admin.id:
        if payload.role != "administrador":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No puedes quitarte tu propio rol de administrador.",
            )
        if not payload.activo:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No puedes deshabilitar tu propia cuenta.",
            )

    # Credenciales (email/password) y habilitado/deshabilitado viven en
    # Supabase Auth, no en public.profiles: se actualizan con la Admin API.
    atributos_auth: dict = {
        "email": payload.email,
        "email_confirm": True,
        "ban_duration": "none" if payload.activo else "876000h",
    }
    if payload.password:
        atributos_auth["password"] = payload.password

    try:
        supabase.auth.admin.update_user_by_id(usuario_id, atributos_auth)
    except Exception as exc:
        mensaje = str(exc).lower()
        if "already" in mensaje or "duplicate" in mensaje or "exists" in mensaje:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Ya existe un usuario registrado con ese correo.",
            ) from exc
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error interno al actualizar las credenciales del usuario.",
        ) from exc

    try:
        response = (
            supabase.table("profiles")
            .update(
                {
                    "nombre_completo": payload.nombre_completo,
                    "email": payload.email,
                    "role": payload.role,
                    "activo": payload.activo,
                }
            )
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
    "/api/admin/usuarios",
    response_model=UsuarioOut,
    status_code=status.HTTP_201_CREATED,
)
def crear_usuario(
    payload: UsuarioCreate,
    _admin: UsuarioActual = Depends(requerir_administrador),
) -> dict:
    """Crea un usuario (lider_cuadrilla, coordinador o administrador) en Supabase Auth.

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
                "app_metadata": {"role": payload.role},
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
        "role": payload.role,
        "activo": True,
    }


@app.get("/api/admin/trabajos", response_model=list[TrabajoOut])
def listar_trabajos(
    _admin: UsuarioActual = Depends(requerir_staff),
) -> list[dict]:
    try:
        response = (
            supabase.table("trabajos")
            .select(
                "id, id_smp, site, zona, lider_id, estado, "
                "lider:profiles!lider_id(nombre_completo, email)"
            )
            .order("created_at", desc=True)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error interno al obtener los trabajos.",
        ) from exc

    return [fila_trabajo_a_salida(fila) for fila in response.data or []]


@app.post(
    "/api/admin/trabajos",
    response_model=TrabajoOut,
    status_code=status.HTTP_201_CREATED,
)
def crear_trabajo(
    payload: TrabajoCreate,
    admin: UsuarioActual = Depends(requerir_staff),
) -> dict:
    try:
        response = (
            supabase.table("trabajos")
            .insert(
                {
                    "id_smp": payload.id_smp,
                    "site": payload.site,
                    "zona": payload.zona,
                    "estado": payload.estado,
                    "asignado_por": admin.id,
                }
            )
            .execute()
        )
    except Exception as exc:
        mensaje = str(exc).lower()
        if "duplicate" in mensaje or "trabajos_site_key" in mensaje:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Ya existe un trabajo asignado a ese site.",
            ) from exc
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error interno al crear el trabajo.",
        ) from exc

    if not response.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="No se pudo confirmar la creacion del trabajo.",
        )

    fila = response.data[0]

    try:
        supabase.table("trabajos_historial_estado").insert(
            {"trabajo_id": fila["id"], "estado": payload.estado}
        ).execute()
    except Exception:
        pass  # el historial es para el Daily; no debe tumbar la creacion del trabajo

    lider = obtener_info_lider_opcional(fila.get("lider_id"))
    fila["lider_nombre"] = lider.get("nombre_completo")
    fila["lider_email"] = lider.get("email")
    return fila


@app.put("/api/admin/trabajos/{trabajo_id}", response_model=TrabajoOut)
def actualizar_trabajo(
    trabajo_id: str,
    payload: TrabajoUpdate,
    _admin: UsuarioActual = Depends(requerir_staff),
) -> dict:
    estado_anterior = None
    try:
        actual_resp = (
            supabase.table("trabajos").select("estado").eq("id", trabajo_id).single().execute()
        )
        estado_anterior = actual_resp.data["estado"] if actual_resp.data else None
    except Exception:
        pass

    try:
        response = (
            supabase.table("trabajos")
            .update(
                {
                    "id_smp": payload.id_smp,
                    "site": payload.site,
                    "zona": payload.zona,
                    "estado": payload.estado,
                }
            )
            .eq("id", trabajo_id)
            .execute()
        )
    except Exception as exc:
        mensaje = str(exc).lower()
        if "duplicate" in mensaje or "trabajos_site_key" in mensaje:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Ya existe un trabajo asignado a ese site.",
            ) from exc
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error interno al actualizar el trabajo.",
        ) from exc

    if not response.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No se encontro un trabajo con ese id.",
        )

    # Solo se guarda un registro nuevo en el historial cuando el estado
    # realmente cambia (no en cada edicion de site/zona/lider), para que
    # el Daily sepa exactamente desde que dia rigio cada estado.
    if estado_anterior is not None and estado_anterior != payload.estado:
        try:
            supabase.table("trabajos_historial_estado").insert(
                {"trabajo_id": trabajo_id, "estado": payload.estado}
            ).execute()
        except Exception:
            pass

    fila = response.data[0]
    lider = obtener_info_lider_opcional(fila.get("lider_id"))
    fila["lider_nombre"] = lider.get("nombre_completo")
    fila["lider_email"] = lider.get("email")
    return fila


COLUMNAS_CSV_ACTIVIDADES = ("SITE", "ACTIVIDAD", "TIPIFICACION", "HW-ACTIVIDAD", "QTY", "AVANCE")
DELIMITADORES_CSV_SOPORTADOS = (",", ";", ".")


def _detectar_delimitador_csv(texto: str) -> str | None:
    """Prueba cada delimitador soportado partiendo solo la primera linea
    (el encabezado); se queda con el primero que produzca exactamente las
    columnas esperadas. Evita falsos positivos de un Sniffer generico
    (por ejemplo, un "." dentro de un nombre de site no debe confundirse
    con el separador de columnas)."""
    primera_linea = texto.splitlines()[0] if texto.strip() else ""
    for delimitador in DELIMITADORES_CSV_SOPORTADOS:
        columnas = {c.strip().upper() for c in primera_linea.split(delimitador)}
        if set(COLUMNAS_CSV_ACTIVIDADES).issubset(columnas):
            return delimitador
    return None


def _clave_actividad(actividad: str | None, tipificacion: str | None, hw_actividad: str | None) -> tuple:
    """Clave natural para emparejar una fila del CSV con una actividad ya
    existente en la base de datos, sin depender del orden de las filas."""
    return (
        (actividad or "").strip().lower(),
        (tipificacion or "").strip().lower(),
        (hw_actividad or "").strip().lower(),
    )


@app.post("/api/admin/actividades/importar", response_model=ImportarActividadesResultado)
def importar_actividades(
    archivo: UploadFile = File(...),
    _admin: UsuarioActual = Depends(requerir_staff),
) -> dict:
    """Importa un CSV con columnas SITE, ACTIVIDAD, TIPIFICACION,
    HW-ACTIVIDAD, QTY, AVANCE. Cada fila se liga al trabajo cuyo site
    coincida (sin distinguir mayusculas ni espacios de mas). Las filas que
    coincidan (por actividad+tipificacion+hw-actividad) con una actividad
    ya existente en ese trabajo se actualizan en su lugar; las demas se
    insertan como nuevas. Nunca se borra una actividad existente aqui, para
    no perder el historial de avance ya reportado sobre ella (cascade
    delete de avances_diarios_detalle)."""
    try:
        texto = archivo.file.read().decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El archivo debe ser un CSV en UTF-8.",
        ) from exc

    # Excel en espanol suele exportar CSV delimitado por ";" (o incluso ".")
    # en vez de ",". Se detecta el delimitador real comparando el
    # encabezado contra las columnas esperadas, en vez de asumir coma.
    delimitador = _detectar_delimitador_csv(texto)
    if delimitador is None:
        primera_linea = texto.splitlines()[0] if texto.strip() else ""
        encabezados_sin_separar = {c.strip().upper() for c in primera_linea.split(",")}
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"El CSV debe tener las columnas: {', '.join(COLUMNAS_CSV_ACTIVIDADES)} "
                f"(separadas por coma, punto y coma o punto). "
                f"Columnas encontradas: {', '.join(sorted(encabezados_sin_separar)) or 'ninguna'}."
            ),
        )

    lector = csv.DictReader(io.StringIO(texto), delimiter=delimitador)

    try:
        trabajos_resp = supabase.table("trabajos").select("id, site").execute()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error interno al obtener los trabajos existentes.",
        ) from exc

    mapa_sites = {
        (t["site"] or "").strip().lower(): t["id"] for t in trabajos_resp.data or [] if t.get("site")
    }

    filas_por_trabajo: dict[str, list[dict]] = {}
    sitios_no_encontrados: list[str] = []

    for fila in lector:
        normalizada = {(k or "").strip().upper(): (v or "").strip() for k, v in fila.items()}
        site = normalizada.get("SITE", "")
        if not site:
            continue

        trabajo_id = mapa_sites.get(site.lower())
        if not trabajo_id:
            if site not in sitios_no_encontrados:
                sitios_no_encontrados.append(site)
            continue

        filas_por_trabajo.setdefault(trabajo_id, []).append(
            {
                "trabajo_id": trabajo_id,
                "actividad": normalizada.get("ACTIVIDAD") or None,
                "tipificacion": normalizada.get("TIPIFICACION") or None,
                "hw_actividad": normalizada.get("HW-ACTIVIDAD") or None,
                "qty": normalizada.get("QTY") or None,
                "avance": normalizada.get("AVANCE") or None,
            }
        )

    trabajo_ids_afectados = list(filas_por_trabajo.keys())
    actividades_cargadas = 0

    if trabajo_ids_afectados:
        try:
            existentes_resp = (
                supabase.table("actividades")
                .select("id, trabajo_id, actividad, tipificacion, hw_actividad")
                .in_("trabajo_id", trabajo_ids_afectados)
                .execute()
            )
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Error interno al comparar con las actividades existentes.",
            ) from exc

        id_existente_por_clave = {
            (e["trabajo_id"], *_clave_actividad(e["actividad"], e["tipificacion"], e["hw_actividad"])): e["id"]
            for e in existentes_resp.data or []
        }

        filas_a_guardar: list[dict] = []
        for trabajo_id, filas in filas_por_trabajo.items():
            for fila in filas:
                clave = (
                    trabajo_id,
                    *_clave_actividad(fila["actividad"], fila["tipificacion"], fila["hw_actividad"]),
                )
                id_existente = id_existente_por_clave.get(clave)
                if id_existente:
                    fila = {**fila, "id": id_existente}
                filas_a_guardar.append(fila)

        try:
            # upsert (no delete+insert): las filas que traen "id" actualizan
            # esa fila existente sin tocar avances_diarios_detalle; las que
            # no traen "id" se insertan como actividades nuevas.
            supabase.table("actividades").upsert(filas_a_guardar).execute()
            actividades_cargadas = len(filas_a_guardar)
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Error interno al guardar las actividades.",
            ) from exc

    return {
        "actividades_cargadas": actividades_cargadas,
        "sitios_no_encontrados": sitios_no_encontrados,
    }


def _obtener_trabajo_o_404(trabajo_id: str) -> None:
    try:
        supabase.table("trabajos").select("id").eq("id", trabajo_id).single().execute()
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No se encontro el trabajo.") from exc


def _obtener_actividad_del_trabajo_o_404(trabajo_id: str, actividad_id: str) -> None:
    try:
        supabase.table("actividades").select("id").eq("id", actividad_id).eq(
            "trabajo_id", trabajo_id
        ).single().execute()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No se encontro la actividad en ese trabajo.",
        ) from exc


def _cantidad_acumulada(actividad_id: str) -> float:
    try:
        detalle_resp = (
            supabase.table("avances_diarios_detalle")
            .select("cantidad")
            .eq("actividad_id", actividad_id)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error interno al validar el avance reportado.",
        ) from exc
    return sum(d["cantidad"] for d in detalle_resp.data or [])


@app.get(
    "/api/admin/trabajos/{trabajo_id}/actividades",
    response_model=list[ActividadAdminOut],
)
def listar_actividades_de_trabajo(
    trabajo_id: str,
    _admin: UsuarioActual = Depends(requerir_staff),
) -> list[dict]:
    """Lista las actividades de un trabajo para el popup de edicion,
    marcando cuales ya tienen avance reportado (esas no se pueden borrar)."""
    _obtener_trabajo_o_404(trabajo_id)

    try:
        actividades_resp = (
            supabase.table("actividades")
            .select("id, actividad, tipificacion, hw_actividad, qty, avance")
            .eq("trabajo_id", trabajo_id)
            .order("created_at")
            .execute()
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error interno al obtener las actividades.",
        ) from exc

    actividades = actividades_resp.data or []
    if not actividades:
        return []

    actividad_ids = [a["id"] for a in actividades]
    try:
        detalle_resp = (
            supabase.table("avances_diarios_detalle")
            .select("actividad_id")
            .in_("actividad_id", actividad_ids)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error interno al validar el avance reportado.",
        ) from exc

    ids_con_avance = {d["actividad_id"] for d in detalle_resp.data or []}
    for actividad in actividades:
        actividad["tiene_avance"] = actividad["id"] in ids_con_avance

    return actividades


@app.post(
    "/api/admin/trabajos/{trabajo_id}/actividades",
    response_model=ActividadAdminOut,
    status_code=status.HTTP_201_CREATED,
)
def crear_actividad_de_trabajo(
    trabajo_id: str,
    payload: ActividadCreate,
    _admin: UsuarioActual = Depends(requerir_staff),
) -> dict:
    _obtener_trabajo_o_404(trabajo_id)

    try:
        creado = (
            supabase.table("actividades")
            .insert(
                {
                    "trabajo_id": trabajo_id,
                    "actividad": payload.actividad,
                    "tipificacion": payload.tipificacion,
                    "hw_actividad": payload.hw_actividad,
                    "qty": payload.qty,
                    "avance": payload.avance,
                }
            )
            .execute()
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error interno al crear la actividad.",
        ) from exc

    if not creado.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="No se pudo confirmar la creacion de la actividad.",
        )

    fila = creado.data[0]
    fila["tiene_avance"] = False
    return fila


@app.put(
    "/api/admin/trabajos/{trabajo_id}/actividades/{actividad_id}",
    response_model=ActividadAdminOut,
)
def actualizar_actividad_de_trabajo(
    trabajo_id: str,
    actividad_id: str,
    payload: ActividadUpdate,
    _admin: UsuarioActual = Depends(requerir_staff),
) -> dict:
    _obtener_actividad_del_trabajo_o_404(trabajo_id, actividad_id)
    acumulado = _cantidad_acumulada(actividad_id)

    if acumulado > 0 and payload.qty is not None:
        try:
            nuevo_qty = float(payload.qty)
        except ValueError:
            nuevo_qty = None
        if nuevo_qty is not None and nuevo_qty < acumulado:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Ya se reportaron {acumulado:g} unidades; el qty no puede "
                    "quedar por debajo de eso."
                ),
            )

    try:
        response = (
            supabase.table("actividades")
            .update(
                {
                    "actividad": payload.actividad,
                    "tipificacion": payload.tipificacion,
                    "hw_actividad": payload.hw_actividad,
                    "qty": payload.qty,
                    "avance": payload.avance,
                }
            )
            .eq("id", actividad_id)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error interno al actualizar la actividad.",
        ) from exc

    if not response.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No se encontro la actividad.")

    fila = response.data[0]
    fila["tiene_avance"] = acumulado > 0
    return fila


@app.delete(
    "/api/admin/trabajos/{trabajo_id}/actividades/{actividad_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def eliminar_actividad_de_trabajo(
    trabajo_id: str,
    actividad_id: str,
    _admin: UsuarioActual = Depends(requerir_staff),
) -> None:
    _obtener_actividad_del_trabajo_o_404(trabajo_id, actividad_id)

    if _cantidad_acumulada(actividad_id) > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No se puede eliminar: esta actividad ya tiene avance reportado por el lider.",
        )

    try:
        supabase.table("actividades").delete().eq("id", actividad_id).execute()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error interno al eliminar la actividad.",
        ) from exc


@app.get("/api/mis-trabajos", response_model=list[TrabajoConActividadesOut])
def listar_mis_trabajos(
    usuario: UsuarioActual = Depends(get_usuario_actual),
) -> list[dict]:
    """Trabajos programados para HOY (hora Colombia) para el usuario
    logueado, segun la tabla programacion (asignacion diaria hecha desde
    la pestana Programacion), cada uno con sus actividades importadas
    por CSV. Solo se muestran los que estan en estado 'asignado': uno
    marcado 'finalizado' o 'standby' ya no aparece en la bandeja del
    lider aunque este programado."""
    hoy = datetime.now(ZONA_COLOMBIA).date()
    try:
        programacion_resp = (
            supabase.table("programacion")
            .select("trabajo_id")
            .eq("lider_id", usuario.id)
            .eq("fecha", hoy.isoformat())
            .execute()
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error interno al obtener tu programacion de hoy.",
        ) from exc

    trabajo_ids_hoy = [p["trabajo_id"] for p in programacion_resp.data or []]
    if not trabajo_ids_hoy:
        return []

    try:
        # Las actividades viajan incrustadas (embed de PostgREST) en la
        # misma consulta, en vez de una consulta aparte a la tabla
        # actividades: esta es la pantalla que mas seguido recarga el
        # lider (su bandeja del dia), asi que cada round-trip que se
        # quita aqui se nota.
        trabajos_resp = (
            supabase.table("trabajos")
            .select(
                "id, id_smp, site, zona, lider_id, estado, "
                "actividades(id, actividad, tipificacion, hw_actividad, qty, avance)"
            )
            .in_("id", trabajo_ids_hoy)
            .eq("estado", "asignado")
            .order("created_at", desc=True)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error interno al obtener tus trabajos.",
        ) from exc

    trabajos = trabajos_resp.data or []
    for trabajo in trabajos:
        trabajo["actividades"] = trabajo.get("actividades") or []

    return trabajos


@app.post(
    "/api/mis-trabajos/{trabajo_id}/avances",
    response_model=AvanceDiarioOut,
    status_code=status.HTTP_201_CREATED,
)
def registrar_avance_diario(
    trabajo_id: str,
    payload: AvanceDiarioCreate,
    usuario: UsuarioActual = Depends(get_usuario_actual),
) -> dict:
    """Guarda el avance del dia de un lider_cuadrilla para uno de sus
    trabajos: un comentario general y/o cuanto avanzo en cada actividad.
    Cada guardado crea un registro nuevo (no sobreescribe el anterior),
    para llevar la bitacora dia a dia."""
    obtener_trabajo_del_lider(trabajo_id, usuario.id)

    if not payload.comentario and not payload.detalles:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ingresa al menos un avance o un comentario.",
        )

    if payload.detalles:
        try:
            # El acumulado ya reportado por actividad viaja incrustado
            # (embed de PostgREST) en la misma consulta, en vez de una
            # consulta aparte a avances_diarios_detalle.
            actividades_resp = (
                supabase.table("actividades")
                .select("id, actividad, qty, avances_diarios_detalle(cantidad)")
                .eq("trabajo_id", trabajo_id)
                .execute()
            )
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Error interno al validar las actividades.",
            ) from exc

        actividades_del_trabajo = {a["id"]: a for a in actividades_resp.data or []}
        if any(d.actividad_id not in actividades_del_trabajo for d in payload.detalles):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Una de las actividades no pertenece a este trabajo.",
            )

        acumulado_por_actividad: dict[str, int] = {
            actividad_id: sum(d["cantidad"] for d in actividad.get("avances_diarios_detalle") or [])
            for actividad_id, actividad in actividades_del_trabajo.items()
        }

        for detalle in payload.detalles:
            actividad = actividades_del_trabajo[detalle.actividad_id]
            try:
                qty_maximo = int(float(actividad["qty"]))
            except (TypeError, ValueError):
                continue  # qty no numerico (viene del CSV): no se puede validar tope

            acumulado_previo = acumulado_por_actividad.get(detalle.actividad_id, 0)
            if acumulado_previo + detalle.cantidad > qty_maximo:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        f"La actividad '{actividad['actividad']}' ya tiene {acumulado_previo} de "
                        f"{qty_maximo} reportado; no se puede superar el qty."
                    ),
                )

    try:
        creado = (
            supabase.table("avances_diarios")
            .insert(
                {
                    "trabajo_id": trabajo_id,
                    "lider_id": usuario.id,
                    "comentario": payload.comentario,
                }
            )
            .execute()
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error interno al guardar el avance.",
        ) from exc

    if not creado.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="No se pudo confirmar el guardado del avance.",
        )

    avance_diario = creado.data[0]

    detalles_guardados: list[dict] = []
    if payload.detalles:
        try:
            detalle_resp = (
                supabase.table("avances_diarios_detalle")
                .insert(
                    [
                        {
                            "avance_diario_id": avance_diario["id"],
                            "actividad_id": detalle.actividad_id,
                            "cantidad": detalle.cantidad,
                        }
                        for detalle in payload.detalles
                    ]
                )
                .execute()
            )
            detalles_guardados = detalle_resp.data or []
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Error interno al guardar el detalle del avance.",
            ) from exc

    avance_diario["detalles"] = detalles_guardados
    return avance_diario


@app.get(
    "/api/mis-trabajos/{trabajo_id}/avances",
    response_model=list[AvanceDiarioOut],
)
def listar_avances_diarios(
    trabajo_id: str,
    usuario: UsuarioActual = Depends(get_usuario_actual),
) -> list[dict]:
    """Historial de avances diarios guardados para un trabajo (mas
    recientes primero)."""
    obtener_trabajo_del_lider(trabajo_id, usuario.id)

    try:
        avances_resp = (
            supabase.table("avances_diarios")
            .select("id, trabajo_id, comentario, created_at")
            .eq("trabajo_id", trabajo_id)
            .order("created_at", desc=True)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error interno al obtener los avances.",
        ) from exc

    avances = avances_resp.data or []
    if not avances:
        return []

    avance_ids = [a["id"] for a in avances]
    try:
        detalles_resp = (
            supabase.table("avances_diarios_detalle")
            .select("avance_diario_id, actividad_id, cantidad")
            .in_("avance_diario_id", avance_ids)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error interno al obtener el detalle de los avances.",
        ) from exc

    detalles_por_avance: dict[str, list[dict]] = {}
    for detalle in detalles_resp.data or []:
        detalles_por_avance.setdefault(detalle["avance_diario_id"], []).append(detalle)

    for avance in avances:
        avance["detalles"] = detalles_por_avance.get(avance["id"], [])

    return avances


@app.get(
    "/api/admin/trabajos/{trabajo_id}/avances",
    response_model=list[AvanceDiarioOut],
)
def listar_avances_diarios_de_trabajo(
    trabajo_id: str,
    _admin: UsuarioActual = Depends(requerir_staff),
) -> list[dict]:
    """Historial completo de avances/comentarios de un trabajo (mas
    recientes primero), para la pestana 'Ver Trabajos': a diferencia de
    GET /api/mis-trabajos/{id}/avances (uso del lider, exige que este
    programado HOY para ese trabajo), este endpoint es para
    administrador/coordinador y no depende de la programacion del dia,
    ya que aqui se consulta el historial completo de cualquier site."""
    _obtener_trabajo_o_404(trabajo_id)

    try:
        avances_resp = (
            supabase.table("avances_diarios")
            .select("id, trabajo_id, comentario, created_at")
            .eq("trabajo_id", trabajo_id)
            .order("created_at", desc=True)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error interno al obtener los avances.",
        ) from exc

    avances = avances_resp.data or []
    if not avances:
        return []

    avance_ids = [a["id"] for a in avances]
    try:
        detalles_resp = (
            supabase.table("avances_diarios_detalle")
            .select("avance_diario_id, actividad_id, cantidad")
            .in_("avance_diario_id", avance_ids)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error interno al obtener el detalle de los avances.",
        ) from exc

    detalles_por_avance: dict[str, list[dict]] = {}
    for detalle in detalles_resp.data or []:
        detalles_por_avance.setdefault(detalle["avance_diario_id"], []).append(detalle)

    for avance in avances:
        avance["detalles"] = detalles_por_avance.get(avance["id"], [])

    return avances


def obtener_vista_trabajos_por_fecha(
    fecha_obj: date,
    trabajo_ids_filtro: list[str] | None = None,
    solo_programados: bool = False,
) -> list[dict]:
    """Arma la vista de trabajos para una fecha (usada tanto por Daily
    como por Programacion): por cada trabajo activo, quien esta
    programado ese dia (tabla programacion), si ya actualizo el avance,
    cuanto reporto, que comentario dejo y el % de avance acumulado a esa
    fecha.

    solo_programados=True (usado por Daily) descarta los trabajos que no
    tienen a nadie programado ese dia en la tabla programacion: si el
    coordinador no planeo ese site para esa fecha, no debe aparecer en el
    Daily como si tuviera avance esperado. Programacion sigue usando
    solo_programados=False porque ahi se necesita ver tambien los sites
    sin programar, para poder asignarlos.

    Para minimizar los round-trips a Supabase (cada uno pesa varios
    cientos de ms en un backend serverless), esta funcion agrupa lo que
    antes eran 9 consultas secuenciales en 5: las actividades viajan
    incrustadas en la consulta de trabajos, el perfil del lider
    incrustado en la de programacion, y los avances/detalle "del dia" y
    "acumulados hasta la fecha" se piden una sola vez cada uno (el
    acumulado es un superconjunto del dia, asi que separarlos en dos
    consultas era trabajo duplicado)."""
    # El "dia" se define en hora de Colombia (00:00 a 23:59:59 -05:00), no
    # en UTC: un avance guardado en la noche en Colombia ya es "manana" en
    # UTC y quedaria mal clasificado si se comparara en UTC directo.
    inicio = datetime.combine(fecha_obj, datetime.min.time(), tzinfo=ZONA_COLOMBIA)
    fin = inicio + timedelta(days=1)

    try:
        query = supabase.table("trabajos").select(
            "id, id_smp, site, zona, estado, created_at, "
            "actividades(id, actividad, hw_actividad, qty)"
        )
        if trabajo_ids_filtro:
            query = query.in_("id", trabajo_ids_filtro)
        trabajos_resp = query.order("site").execute()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error interno al obtener los trabajos.",
        ) from exc

    todos_los_trabajos = trabajos_resp.data or []
    if not todos_los_trabajos:
        return []

    # "Existio para esta fecha?" es un hecho historico: aplica siempre,
    # sin importar que fecha se consulte. Se excluye si el trabajo se
    # creo despues del final del dia consultado.
    candidatos = []
    for trabajo in todos_los_trabajos:
        creado_trabajo = trabajo.get("created_at")
        if creado_trabajo:
            try:
                if _parsear_timestamptz(creado_trabajo) >= fin:
                    continue
            except ValueError:
                pass
        candidatos.append(trabajo)

    if not candidatos:
        return []

    # El estado (Asignado/Finalizado/Standby) SI se valida para
    # cualquier fecha, pero usando el estado que el trabajo tenia EN ESE
    # DIA, no el actual: un site que hoy esta en Standby no debe
    # desaparecer del Daily de un dia pasado en el que si estaba
    # Asignado, y si se reactiva, debe volver a aparecer desde el dia de
    # la reactivacion (no antes). trabajos.estado solo guarda el actual,
    # asi que se reconstruye el estado vigente a esa fecha con el
    # historial de cambios.
    candidato_ids = [t["id"] for t in candidatos]
    try:
        historial_resp = (
            supabase.table("trabajos_historial_estado")
            .select("trabajo_id, estado, created_at")
            .in_("trabajo_id", candidato_ids)
            .lt("created_at", fin.isoformat())
            .order("created_at")
            .execute()
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error interno al obtener el historial de estados.",
        ) from exc

    # Al iterar en orden ascendente de created_at, el ultimo valor que
    # quede guardado por trabajo_id es el mas reciente antes de "fin".
    estado_vigente_por_trabajo: dict[str, str] = {}
    for fila_historial in historial_resp.data or []:
        estado_vigente_por_trabajo[fila_historial["trabajo_id"]] = fila_historial["estado"]

    activos = []
    for trabajo in candidatos:
        # Si no hay historial previo a esta fecha (trabajo creado antes
        # de que existiera esta tabla, o antes de su primer cambio de
        # estado registrado), se usa el estado actual como mejor
        # aproximacion disponible.
        estado_vigente = estado_vigente_por_trabajo.get(trabajo["id"], trabajo.get("estado"))
        if estado_vigente != "asignado":
            continue
        activos.append(trabajo)

    if not activos:
        return []

    activo_ids = [t["id"] for t in activos]

    # Quien esta programado (tabla programacion) para cada trabajo en
    # esta fecha especifica -- es la fuente de verdad del lider del dia,
    # no trabajos.lider_id (que ya no se llena desde la pestana Trabajos).
    # El perfil del lider viaja incrustado en la misma consulta (embed de
    # PostgREST) en vez de una consulta aparte a profiles; se especifica
    # "profiles!lider_id" porque programacion tambien tiene un FK a
    # profiles via asignado_por y un embed sin calificar es ambiguo.
    try:
        programacion_resp = (
            supabase.table("programacion")
            .select("trabajo_id, lider_id, lider:profiles!lider_id(nombre_completo, email, activo)")
            .in_("trabajo_id", activo_ids)
            .eq("fecha", fecha_obj.isoformat())
            .execute()
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error interno al obtener la programacion de esa fecha.",
        ) from exc

    lider_id_por_trabajo: dict[str, str] = {}
    perfiles_lideres: dict[str, dict] = {}
    for fila_programacion in programacion_resp.data or []:
        lider_id_por_trabajo[fila_programacion["trabajo_id"]] = fila_programacion["lider_id"]
        perfil_lider = fila_programacion.get("lider")
        if perfil_lider:
            perfiles_lideres[fila_programacion["lider_id"]] = perfil_lider

    # "Dias en el sitio" = desde cuando el lider ACTUAL de cada trabajo
    # quedo programado ahi por primera vez (no desde que existe el
    # trabajo): si se reasigna a otro lider, el contador debe reiniciar
    # para el nuevo. Se trae todo el historial de programacion hasta la
    # fecha consultada (no solo esa fecha) y se calcula en memoria la
    # primera fecha por combinacion trabajo+lider, para no hacer una
    # consulta por trabajo.
    try:
        historial_programacion_resp = (
            supabase.table("programacion")
            .select("trabajo_id, lider_id, fecha")
            .in_("trabajo_id", activo_ids)
            .lte("fecha", fecha_obj.isoformat())
            .execute()
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error interno al obtener el historial de programacion.",
        ) from exc

    primera_fecha_por_trabajo_lider: dict[tuple[str, str], date] = {}
    for fila_historial_prog in historial_programacion_resp.data or []:
        clave = (fila_historial_prog["trabajo_id"], fila_historial_prog["lider_id"])
        fecha_fila = date.fromisoformat(fila_historial_prog["fecha"])
        actual = primera_fecha_por_trabajo_lider.get(clave)
        if actual is None or fecha_fila < actual:
            primera_fecha_por_trabajo_lider[clave] = fecha_fila

    # "El lider esta actualmente deshabilitado" es un estado del
    # PRESENTE: no debe borrar el historial de un dia pasado en el que
    # el lider si estaba habilitado y reporto avance. Por eso ese filtro
    # solo se aplica cuando se consulta hoy (o una fecha futura).
    hoy_colombia = datetime.now(ZONA_COLOMBIA).date()
    consultando_presente_o_futuro = fecha_obj >= hoy_colombia

    trabajos = []
    for trabajo in activos:
        lider_id = lider_id_por_trabajo.get(trabajo["id"])
        lider_perfil = perfiles_lideres.get(lider_id, {}) if lider_id else {}
        if consultando_presente_o_futuro and lider_perfil.get("activo") is False:
            continue
        trabajo["_lider_id"] = lider_id
        trabajo["_lider_perfil"] = lider_perfil
        trabajos.append(trabajo)

    if not trabajos:
        return []

    trabajo_ids = [t["id"] for t in trabajos]

    # Avances hasta el final del dia consultado, en una sola consulta: el
    # "avance del dia" es el subconjunto con created_at >= inicio, y el
    # total (incluyendo dias anteriores) es el que se usa para calcular
    # el % de avance acumulado. Antes esto eran 2 consultas a
    # avances_diarios (una acotada al dia, otra "< fin" para el
    # acumulado) y 2 a avances_diarios_detalle; como la segunda siempre
    # incluye a la primera, se piden ambas de una sola vez y se separan
    # en memoria.
    try:
        avances_resp = (
            supabase.table("avances_diarios")
            .select("id, trabajo_id, comentario, created_at")
            .in_("trabajo_id", trabajo_ids)
            .lt("created_at", fin.isoformat())
            .execute()
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error interno al obtener los avances del dia.",
        ) from exc

    avances_hasta_fecha = avances_resp.data or []
    avances_del_dia = [
        a for a in avances_hasta_fecha if _parsear_timestamptz(a["created_at"]) >= inicio
    ]
    avance_ids_del_dia = {a["id"] for a in avances_del_dia}
    avance_ids_hasta_fecha = [a["id"] for a in avances_hasta_fecha]

    detalles_por_avance: dict[str, list[dict]] = {}
    acumulado_por_actividad: dict[str, int] = {}
    if avance_ids_hasta_fecha:
        try:
            detalles_resp = (
                supabase.table("avances_diarios_detalle")
                .select("avance_diario_id, actividad_id, cantidad")
                .in_("avance_diario_id", avance_ids_hasta_fecha)
                .execute()
            )
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Error interno al obtener el detalle de los avances.",
            ) from exc
        for fila in detalles_resp.data or []:
            acumulado_por_actividad[fila["actividad_id"]] = (
                acumulado_por_actividad.get(fila["actividad_id"], 0) + fila["cantidad"]
            )
            if fila["avance_diario_id"] in avance_ids_del_dia:
                detalles_por_avance.setdefault(fila["avance_diario_id"], []).append(fila)

    # Las actividades viajan incrustadas en la consulta de trabajos de
    # mas arriba (embed de PostgREST), asi que no hace falta una consulta
    # aparte a la tabla actividades.
    actividades_por_id: dict[str, dict] = {}
    actividades_por_trabajo: dict[str, list[dict]] = {}
    for trabajo in trabajos:
        actividades_trabajo = trabajo.get("actividades") or []
        actividades_por_trabajo[trabajo["id"]] = actividades_trabajo
        for actividad in actividades_trabajo:
            actividades_por_id[actividad["id"]] = actividad

    avances_por_trabajo: dict[str, list[dict]] = {}
    for avance in avances_del_dia:
        avances_por_trabajo.setdefault(avance["trabajo_id"], []).append(avance)

    # solo_programados se aplica aqui (no antes de traer los avances) a
    # proposito: si el lider SI reporto avance ese dia, el site se
    # muestra aunque no haya fila en programacion para esa fecha (por
    # ejemplo, avances de antes de que existiera la pestana Programacion,
    # o asignados por el trabajos.lider_id ya en desuso). El hecho
    # historico "se reporto avance este dia" nunca debe desaparecer;
    # solo_programados descarta unicamente los sites sin nada programado
    # NI reportado ese dia.
    if solo_programados:
        trabajos = [
            t for t in trabajos if t.get("_lider_id") or avances_por_trabajo.get(t["id"])
        ]
        if not trabajos:
            return []

    resultado = []
    for trabajo in trabajos:
        lider_perfil = trabajo.get("_lider_perfil") or {}
        avances_trabajo = avances_por_trabajo.get(trabajo["id"], [])

        comentarios = [a["comentario"] for a in avances_trabajo if a.get("comentario")]

        cantidad_por_actividad: dict[str, int] = {}
        for avance in avances_trabajo:
            for detalle in detalles_por_avance.get(avance["id"], []):
                cantidad_por_actividad[detalle["actividad_id"]] = (
                    cantidad_por_actividad.get(detalle["actividad_id"], 0) + detalle["cantidad"]
                )

        detalle_resumen = [
            {
                "actividad": actividades_por_id.get(actividad_id, {}).get("actividad"),
                "hw_actividad": actividades_por_id.get(actividad_id, {}).get("hw_actividad"),
                "cantidad": cantidad,
            }
            for actividad_id, cantidad in cantidad_por_actividad.items()
        ]

        qty_total = 0.0
        acumulado_total = 0.0
        for actividad in actividades_por_trabajo.get(trabajo["id"], []):
            try:
                qty_actividad = float(actividad["qty"])
            except (TypeError, ValueError):
                continue
            qty_total += qty_actividad
            acumulado_total += min(acumulado_por_actividad.get(actividad["id"], 0), qty_actividad)

        porcentaje_avance = round((acumulado_total / qty_total) * 100) if qty_total > 0 else None

        lider_id = trabajo.get("_lider_id")
        dias_en_sitio = None
        if lider_id:
            primera_fecha = primera_fecha_por_trabajo_lider.get((trabajo["id"], lider_id))
            if primera_fecha:
                dias_en_sitio = (fecha_obj - primera_fecha).days + 1

        resultado.append(
            {
                "trabajo_id": trabajo["id"],
                "id_smp": trabajo["id_smp"],
                "site": trabajo["site"],
                "zona": trabajo["zona"],
                "lider_id": lider_id,
                "lider_nombre": lider_perfil.get("nombre_completo"),
                "lider_email": lider_perfil.get("email"),
                "actualizado": len(avances_trabajo) > 0,
                "comentarios": comentarios,
                "detalle": detalle_resumen,
                "porcentaje_avance": porcentaje_avance,
                "dias_en_sitio": dias_en_sitio,
            }
        )

    return resultado


def _parsear_fecha_query(fecha: str | None, valor_por_defecto: date) -> date:
    if not fecha:
        return valor_por_defecto
    try:
        return date.fromisoformat(fecha)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Fecha invalida, usa el formato YYYY-MM-DD.",
        ) from exc


@app.get("/api/admin/avances-diarios", response_model=list[AvanceDiarioAdminOut])
def listar_avances_diarios_admin(
    fecha: str | None = Query(default=None, description="YYYY-MM-DD, por defecto hoy"),
    _admin: UsuarioActual = Depends(requerir_acceso_daily),
) -> list[dict]:
    """Vista 'Daily' del administrador: por cada trabajo QUE ESTABA
    PROGRAMADO ese dia (tabla programacion), si el lider ya actualizo el
    avance de un dia dado (por defecto hoy), cuanto reporto y que
    comentario dejo. Un site sin nadie programado esa fecha no aparece:
    no hay nada planeado que esperar de el ese dia."""
    fecha_obj = _parsear_fecha_query(fecha, datetime.now(ZONA_COLOMBIA).date())
    return obtener_vista_trabajos_por_fecha(fecha_obj, solo_programados=True)


@app.get("/api/admin/programacion", response_model=list[AvanceDiarioAdminOut])
def listar_programacion(
    fecha: str | None = Query(default=None, description="YYYY-MM-DD, por defecto manana"),
    _admin: UsuarioActual = Depends(requerir_staff),
) -> list[dict]:
    """Vista 'Programacion': el coordinador ve todos los trabajos activos
    de una fecha (por defecto manana) para asignarles un lider_cuadrilla
    con PUT /api/admin/programacion, junto con el mismo resumen de avance
    que muestra el Daily."""
    manana = datetime.now(ZONA_COLOMBIA).date() + timedelta(days=1)
    fecha_obj = _parsear_fecha_query(fecha, manana)
    return obtener_vista_trabajos_por_fecha(fecha_obj)


def _validar_fecha_no_pasada(fecha_obj: date) -> None:
    """La Programacion es una herramienta de planeacion hacia adelante:
    no tiene sentido dejar reasignar o quitar el lider de un dia que ya
    paso (eso ya ocurrio, se reescribiria el historial). Se puede seguir
    consultando un dia pasado (GET), solo se bloquean los cambios."""
    if fecha_obj < datetime.now(ZONA_COLOMBIA).date():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No se puede modificar la programacion de un dia que ya paso.",
        )


@app.put("/api/admin/programacion", response_model=AvanceDiarioAdminOut)
def asignar_programacion(
    payload: ProgramacionAsignar,
    admin: UsuarioActual = Depends(requerir_staff),
) -> dict:
    """Asigna (o reasigna) el lider_cuadrilla que trabaja un site en una
    fecha dada. Un mismo trabajo+fecha solo tiene un lider: reasignar
    actualiza la fila existente en vez de duplicarla."""
    obtener_perfil_lider(payload.lider_id)  # valida rol lider_cuadrilla y habilitado
    fecha_obj = date.fromisoformat(payload.fecha)
    _validar_fecha_no_pasada(fecha_obj)

    try:
        supabase.table("programacion").upsert(
            {
                "trabajo_id": payload.trabajo_id,
                "lider_id": payload.lider_id,
                "fecha": payload.fecha,
                "asignado_por": admin.id,
            },
            on_conflict="trabajo_id,fecha",
        ).execute()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error interno al asignar la programacion.",
        ) from exc

    filas = obtener_vista_trabajos_por_fecha(fecha_obj, trabajo_ids_filtro=[payload.trabajo_id])
    if not filas:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No se encontro el trabajo (o ya no esta en estado Asignado).",
        )
    return filas[0]


@app.delete("/api/admin/programacion/{trabajo_id}", status_code=status.HTTP_204_NO_CONTENT)
def quitar_programacion(
    trabajo_id: str,
    fecha: str = Query(..., description="YYYY-MM-DD"),
    _admin: UsuarioActual = Depends(requerir_staff),
) -> None:
    """Quita la asignacion de lider de un trabajo para una fecha dada
    (el site vuelve a quedar 'sin asignar' ese dia). Usado por la vista de
    Programacion agrupada por lider, para mover o quitar un site."""
    try:
        fecha_obj = date.fromisoformat(fecha)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Fecha invalida, usa el formato YYYY-MM-DD.",
        ) from exc
    _validar_fecha_no_pasada(fecha_obj)

    try:
        supabase.table("programacion").delete().eq("trabajo_id", trabajo_id).eq(
            "fecha", fecha
        ).execute()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error interno al quitar la asignacion.",
        ) from exc
