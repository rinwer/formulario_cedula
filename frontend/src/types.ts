export type Rol = "administrador" | "lider_cuadrilla";

export type Perfil = {
  id: string;
  email: string | null;
  nombre_completo: string | null;
  role: Rol;
};

export type Usuario = {
  id: string;
  email: string;
  nombre_completo: string;
  role: Rol;
  activo: boolean;
};

export type EstadoTrabajo = "pendiente" | "en_progreso" | "completado";

export type Trabajo = {
  id: string;
  titulo: string;
  descripcion: string | null;
  estado: EstadoTrabajo;
  lider_id: string;
  lider_nombre: string | null;
  lider_email: string | null;
};
