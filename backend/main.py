"""
Backend FastAPI: autenticacion, roles y alta de usuarios.
Unico responsable de hablar con Supabase con la service_role key.
"""

import csv
import io
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, HTTPException, UploadFile, status
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
        if value not in ("administrador", "lider_cuadrilla"):
            raise ValueError("El rol debe ser administrador o lider_cuadrilla")
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


class TrabajoCreate(BaseModel):
    id_smp: str = Field(..., min_length=1)
    site: str = Field(..., min_length=1)
    zona: str = Field(..., min_length=1)
    lider_id: str

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


class TrabajoUpdate(TrabajoCreate):
    pass


class TrabajoOut(BaseModel):
    id: str
    id_smp: str
    site: str
    zona: str
    lider_id: str
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


class ImportarActividadesResultado(BaseModel):
    actividades_cargadas: int
    sitios_no_encontrados: list[str]


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
        "activo": True,
    }


@app.get("/api/admin/trabajos", response_model=list[TrabajoOut])
def listar_trabajos(
    _admin: UsuarioActual = Depends(requerir_administrador),
) -> list[dict]:
    try:
        response = (
            supabase.table("trabajos")
            .select(
                "id, id_smp, site, zona, lider_id, "
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
    admin: UsuarioActual = Depends(requerir_administrador),
) -> dict:
    lider = obtener_perfil_lider(payload.lider_id)

    try:
        response = (
            supabase.table("trabajos")
            .insert(
                {
                    "id_smp": payload.id_smp,
                    "site": payload.site,
                    "zona": payload.zona,
                    "lider_id": payload.lider_id,
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
    fila["lider_nombre"] = lider["nombre_completo"]
    fila["lider_email"] = lider["email"]
    return fila


@app.put("/api/admin/trabajos/{trabajo_id}", response_model=TrabajoOut)
def actualizar_trabajo(
    trabajo_id: str,
    payload: TrabajoUpdate,
    _admin: UsuarioActual = Depends(requerir_administrador),
) -> dict:
    lider = obtener_perfil_lider(payload.lider_id)

    try:
        response = (
            supabase.table("trabajos")
            .update(
                {
                    "id_smp": payload.id_smp,
                    "site": payload.site,
                    "zona": payload.zona,
                    "lider_id": payload.lider_id,
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

    fila = response.data[0]
    fila["lider_nombre"] = lider["nombre_completo"]
    fila["lider_email"] = lider["email"]
    return fila


COLUMNAS_CSV_ACTIVIDADES = ("SITE", "ACTIVIDAD", "TIPIFICACION", "HW-ACTIVIDAD", "QTY", "AVANCE")


@app.post("/api/admin/actividades/importar", response_model=ImportarActividadesResultado)
def importar_actividades(
    archivo: UploadFile = File(...),
    _admin: UsuarioActual = Depends(requerir_administrador),
) -> dict:
    """Importa un CSV con columnas SITE, ACTIVIDAD, TIPIFICACION,
    HW-ACTIVIDAD, QTY, AVANCE. Cada fila se liga al trabajo cuyo site
    coincida (sin distinguir mayusculas ni espacios de mas). Por cada
    trabajo afectado se reemplazan sus actividades anteriores por las del
    CSV nuevo."""
    try:
        texto = archivo.file.read().decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El archivo debe ser un CSV en UTF-8.",
        ) from exc

    # Excel en espanol suele exportar CSV delimitado por ";" en vez de ",".
    # Se detecta el delimitador real en vez de asumir coma.
    try:
        dialecto = csv.Sniffer().sniff(texto[:4096], delimiters=",;\t")
    except csv.Error:
        dialecto = csv.excel

    lector = csv.DictReader(io.StringIO(texto), dialect=dialecto)
    encabezados = {(c or "").strip().upper() for c in (lector.fieldnames or [])}
    if not set(COLUMNAS_CSV_ACTIVIDADES).issubset(encabezados):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"El CSV debe tener las columnas: {', '.join(COLUMNAS_CSV_ACTIVIDADES)}. "
                f"Columnas encontradas: {', '.join(sorted(encabezados)) or 'ninguna'}."
            ),
        )

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
            supabase.table("actividades").delete().in_("trabajo_id", trabajo_ids_afectados).execute()
            filas_a_insertar = [
                fila for filas in filas_por_trabajo.values() for fila in filas
            ]
            supabase.table("actividades").insert(filas_a_insertar).execute()
            actividades_cargadas = len(filas_a_insertar)
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Error interno al guardar las actividades.",
            ) from exc

    return {
        "actividades_cargadas": actividades_cargadas,
        "sitios_no_encontrados": sitios_no_encontrados,
    }


@app.get("/api/mis-trabajos", response_model=list[TrabajoConActividadesOut])
def listar_mis_trabajos(
    usuario: UsuarioActual = Depends(get_usuario_actual),
) -> list[dict]:
    """Trabajos asignados al usuario logueado (para el panel del
    lider_cuadrilla), cada uno con sus actividades importadas por CSV."""
    try:
        trabajos_resp = (
            supabase.table("trabajos")
            .select("id, id_smp, site, zona, lider_id")
            .eq("lider_id", usuario.id)
            .order("created_at", desc=True)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error interno al obtener tus trabajos.",
        ) from exc

    trabajos = trabajos_resp.data or []
    if not trabajos:
        return []

    trabajo_ids = [t["id"] for t in trabajos]
    try:
        actividades_resp = (
            supabase.table("actividades")
            .select("id, trabajo_id, actividad, tipificacion, hw_actividad, qty, avance")
            .in_("trabajo_id", trabajo_ids)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error interno al obtener las actividades.",
        ) from exc

    actividades_por_trabajo: dict[str, list[dict]] = {}
    for actividad in actividades_resp.data or []:
        actividades_por_trabajo.setdefault(actividad["trabajo_id"], []).append(actividad)

    for trabajo in trabajos:
        trabajo["actividades"] = actividades_por_trabajo.get(trabajo["id"], [])

    return trabajos
