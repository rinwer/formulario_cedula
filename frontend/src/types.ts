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
};
