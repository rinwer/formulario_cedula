export type Rol = "administrador" | "coordinador" | "visualizador" | "lider_cuadrilla";

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

export type LiderLigero = {
  id: string;
  nombre_completo: string;
  activo: boolean;
};

export type EstadoTrabajo = "asignado" | "finalizado" | "standby";

export type Trabajo = {
  id: string;
  id_smp: string;
  site: string;
  zona: string;
  lider_id: string | null;
  estado: EstadoTrabajo;
  lider_nombre: string | null;
  lider_email: string | null;
};

export type Actividad = {
  id: string;
  actividad: string | null;
  tipificacion: string | null;
  hw_actividad: string | null;
  qty: string | null;
  avance: string | null;
};

export type ActividadAdmin = Actividad & {
  tiene_avance: boolean;
};

export type TrabajoConActividades = Trabajo & {
  actividades: Actividad[];
};

export type AvanceDetalle = {
  actividad_id: string;
  cantidad: number;
};

export type AvanceDiario = {
  id: string;
  trabajo_id: string;
  comentario: string | null;
  created_at: string;
  detalles: AvanceDetalle[];
};

export type AvanceResumenDetalle = {
  actividad: string | null;
  hw_actividad: string | null;
  cantidad: number;
};

export type AvanceDiarioAdmin = {
  trabajo_id: string;
  id_smp: string;
  site: string;
  zona: string;
  lider_id: string | null;
  lider_nombre: string | null;
  lider_email: string | null;
  actualizado: boolean;
  comentarios: string[];
  detalle: AvanceResumenDetalle[];
  porcentaje_avance: number | null;
  dias_en_sitio: number | null;
};

export type LineaTiempoItem = {
  fecha: string;
  lider_id: string;
  tipo: "site" | "no_disponible";
  trabajo_id: string | null;
  site: string | null;
  zona: string | null;
  motivo: string | null;
};

export type Disponibilidad = {
  lider_id: string;
  motivo: string | null;
};

export type SiteLigero = {
  id: string;
  site: string;
  zona: string;
};
