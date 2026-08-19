import { FormEvent, useEffect, useState } from "react";
import { Usuario } from "../types";

const API_URL = import.meta.env.VITE_API_URL ? "" : "http://localhost:8000";

type PopupState = {
  visible: boolean;
  type: "success" | "duplicate" | "error";
  message: string;
};

const initialPopup: PopupState = { visible: false, type: "success", message: "" };

const ROLE_LABEL: Record<string, string> = {
  administrador: "Administrador",
  lider_cuadrilla: "Lider de cuadrilla",
};

type Props = {
  accessToken: string;
};

export default function PerfilesPanel({ accessToken }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nombreCompleto, setNombreCompleto] = useState("");
  const [errores, setErrores] = useState<{ email?: string; password?: string; nombre?: string }>(
    {}
  );
  const [guardando, setGuardando] = useState(false);
  const [popup, setPopup] = useState<PopupState>(initialPopup);

  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [cargandoLista, setCargandoLista] = useState(false);
  const [errorLista, setErrorLista] = useState<string | null>(null);

  const cerrarPopup = () => setPopup(initialPopup);

  const cargarUsuarios = async () => {
    setCargandoLista(true);
    setErrorLista(null);
    try {
      const res = await fetch(`${API_URL}/api/admin/usuarios`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error();
      const data: Usuario[] = await res.json();
      setUsuarios(data);
    } catch {
      setErrorLista("No se pudo cargar la lista de usuarios.");
    } finally {
      setCargandoLista(false);
    }
  };

  useEffect(() => {
    cargarUsuarios();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const validar = () => {
    const nuevosErrores: typeof errores = {};
    if (!email.trim()) nuevosErrores.email = "El correo es obligatorio.";
    if (!password || password.length < 8)
      nuevosErrores.password = "La contrasena debe tener al menos 8 caracteres.";
    if (!nombreCompleto.trim()) nuevosErrores.nombre = "El nombre completo es obligatorio.";
    return nuevosErrores;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    const nuevosErrores = validar();
    if (Object.keys(nuevosErrores).length > 0) {
      setErrores(nuevosErrores);
      return;
    }
    setErrores({});
    setGuardando(true);

    try {
      const res = await fetch(`${API_URL}/api/admin/lideres`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          email: email.trim(),
          password,
          nombre_completo: nombreCompleto.trim(),
        }),
      });

      if (res.status === 201) {
        setPopup({
          visible: true,
          type: "success",
          message: "El lider de cuadrilla se creo con exito.",
        });
        setEmail("");
        setPassword("");
        setNombreCompleto("");
        cargarUsuarios();
      } else if (res.status === 409) {
        setPopup({
          visible: true,
          type: "duplicate",
          message: "Ya existe un usuario registrado con ese correo.",
        });
      } else {
        const data = await res.json().catch(() => null);
        setPopup({
          visible: true,
          type: "error",
          message: data?.detail ?? "Ocurrio un error al crear el usuario.",
        });
      }
    } catch {
      setPopup({
        visible: true,
        type: "error",
        message: "No se pudo conectar con el servidor. Intenta de nuevo.",
      });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-md p-8">
        <h2 className="text-lg font-semibold text-slate-800 mb-6">Nuevo lider de cuadrilla</h2>

        <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2" noValidate>
          <div>
            <label htmlFor="nombre" className="block text-sm font-medium text-slate-700 mb-1">
              Nombre completo
            </label>
            <input
              id="nombre"
              type="text"
              value={nombreCompleto}
              onChange={(e) => setNombreCompleto(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Ej: Juana Perez Gomez"
            />
            {errores.nombre && <p className="text-sm text-red-600 mt-1">{errores.nombre}</p>}
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">
              Correo
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="lider@ejemplo.com"
            />
            {errores.email && <p className="text-sm text-red-600 mt-1">{errores.email}</p>}
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">
              Contrasena temporal
            </label>
            <input
              id="password"
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Minimo 8 caracteres"
            />
            {errores.password && <p className="text-sm text-red-600 mt-1">{errores.password}</p>}
            <p className="text-xs text-slate-500 mt-1">
              Comunicasela al lider de cuadrilla por otro medio; el sistema no la envia por correo.
            </p>
          </div>

          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={guardando}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-medium px-4 py-2 rounded-md transition-colors"
            >
              {guardando ? "Creando..." : "Crear lider de cuadrilla"}
            </button>
          </div>
        </form>
      </div>

      <div className="bg-white rounded-xl shadow-md p-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-slate-800">Usuarios</h2>
          <button
            onClick={cargarUsuarios}
            disabled={cargandoLista}
            className="text-sm text-blue-600 hover:text-blue-800 disabled:text-slate-400 font-medium"
          >
            {cargandoLista ? "Actualizando..." : "Actualizar"}
          </button>
        </div>

        {errorLista && <p className="text-sm text-red-600 mb-4">{errorLista}</p>}

        {!errorLista && usuarios.length === 0 && !cargandoLista && (
          <p className="text-sm text-slate-500">Todavia no hay usuarios registrados.</p>
        )}

        {usuarios.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-4 font-medium">Nombre</th>
                  <th className="py-2 pr-4 font-medium">Correo</th>
                  <th className="py-2 pr-4 font-medium">Rol</th>
                </tr>
              </thead>
              <tbody>
                {usuarios.map((usuario) => (
                  <tr key={usuario.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 pr-4 text-slate-700">{usuario.nombre_completo}</td>
                    <td className="py-2 pr-4 text-slate-700">{usuario.email}</td>
                    <td className="py-2 pr-4">
                      <span
                        className={
                          "inline-block px-2 py-0.5 rounded-full text-xs font-medium " +
                          (usuario.role === "administrador"
                            ? "bg-purple-100 text-purple-700"
                            : "bg-emerald-100 text-emerald-700")
                        }
                      >
                        {ROLE_LABEL[usuario.role] ?? usuario.role}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {popup.visible && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-lg max-w-sm w-full p-6 text-center">
            <div
              className={
                "mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full text-white " +
                (popup.type === "success"
                  ? "bg-green-500"
                  : popup.type === "duplicate"
                  ? "bg-amber-500"
                  : "bg-red-500")
              }
            >
              {popup.type === "success" ? "✓" : popup.type === "duplicate" ? "!" : "✕"}
            </div>
            <h3 className="text-lg font-semibold text-slate-800 mb-1">
              {popup.type === "success"
                ? "Guardado con exito"
                : popup.type === "duplicate"
                ? "Correo duplicado"
                : "Error"}
            </h3>
            <p className="text-sm text-slate-600 mb-5">{popup.message}</p>
            <button
              onClick={cerrarPopup}
              className="bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded-md text-sm"
            >
              Aceptar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
