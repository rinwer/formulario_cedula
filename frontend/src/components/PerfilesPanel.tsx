import { FormEvent, useEffect, useState } from "react";
import { fetchAutenticado } from "../lib/api";
import { Usuario } from "../types";

const API_URL = import.meta.env.VITE_API_URL ? "" : "http://localhost:8000";

type PopupState = {
  visible: boolean;
  type: "success" | "duplicate" | "error";
  message: string;
};

const initialPopup: PopupState = { visible: false, type: "success", message: "" };

const ROLE_LABEL: Record<string, string> = {
  administrador: "Coordinador",
  lider_cuadrilla: "Lider de cuadrilla",
};

export default function PerfilesPanel() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nombreCompleto, setNombreCompleto] = useState("");
  const [role, setRole] = useState<"administrador" | "lider_cuadrilla">("lider_cuadrilla");
  const [errores, setErrores] = useState<{ email?: string; password?: string; nombre?: string }>(
    {}
  );
  const [guardando, setGuardando] = useState(false);
  const [popup, setPopup] = useState<PopupState>(initialPopup);

  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [cargandoLista, setCargandoLista] = useState(false);
  const [errorLista, setErrorLista] = useState<string | null>(null);

  const [idEditando, setIdEditando] = useState<string | null>(null);
  const [nombreEditado, setNombreEditado] = useState("");
  const [emailEditado, setEmailEditado] = useState("");
  const [passwordEditado, setPasswordEditado] = useState("");
  const [rolEditado, setRolEditado] = useState<"administrador" | "lider_cuadrilla">(
    "lider_cuadrilla"
  );
  const [activoEditado, setActivoEditado] = useState(true);
  const [errorEdicion, setErrorEdicion] = useState<string | null>(null);
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);

  const cerrarPopup = () => setPopup(initialPopup);

  const iniciarEdicion = (usuario: Usuario) => {
    setIdEditando(usuario.id);
    setNombreEditado(usuario.nombre_completo);
    setEmailEditado(usuario.email);
    setPasswordEditado("");
    setRolEditado(usuario.role);
    setActivoEditado(usuario.activo);
    setErrorEdicion(null);
  };

  const cancelarEdicion = () => {
    setIdEditando(null);
    setNombreEditado("");
    setEmailEditado("");
    setPasswordEditado("");
    setErrorEdicion(null);
  };

  const guardarEdicion = async (usuarioId: string) => {
    if (!nombreEditado.trim() || !emailEditado.trim()) return;
    if (passwordEditado && passwordEditado.length < 8) {
      setErrorEdicion("La contrasena debe tener al menos 8 caracteres.");
      return;
    }
    setErrorEdicion(null);
    setGuardandoEdicion(true);
    try {
      const res = await fetchAutenticado(`${API_URL}/api/admin/usuarios/${usuarioId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre_completo: nombreEditado.trim(),
          email: emailEditado.trim(),
          role: rolEditado,
          activo: activoEditado,
          password: passwordEditado || null,
        }),
      });

      if (res.ok) {
        const actualizado: Usuario = await res.json();
        setUsuarios((prev) => prev.map((u) => (u.id === actualizado.id ? actualizado : u)));
        cancelarEdicion();
      } else {
        const data = await res.json().catch(() => null);
        setErrorEdicion(data?.detail ?? "Ocurrio un error al actualizar el usuario.");
      }
    } catch {
      setErrorEdicion("No se pudo conectar con el servidor. Intenta de nuevo.");
    } finally {
      setGuardandoEdicion(false);
    }
  };

  const cargarUsuarios = async () => {
    setCargandoLista(true);
    setErrorLista(null);
    try {
      const res = await fetchAutenticado(`${API_URL}/api/admin/usuarios`);
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
      const res = await fetchAutenticado(`${API_URL}/api/admin/usuarios`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password,
          nombre_completo: nombreCompleto.trim(),
          role,
        }),
      });

      if (res.status === 201) {
        setPopup({
          visible: true,
          type: "success",
          message: "El usuario se creo con exito.",
        });
        setEmail("");
        setPassword("");
        setNombreCompleto("");
        setRole("lider_cuadrilla");
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
      <div className="bg-zinc-800 rounded-xl shadow-md p-5 sm:p-8">
        <h2 className="text-lg font-semibold text-zinc-50 mb-6">Nuevo usuario</h2>

        <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2" noValidate>
          <div>
            <label htmlFor="nombre" className="block text-sm font-medium text-zinc-300 mb-1">
              Nombre completo
            </label>
            <input
              id="nombre"
              type="text"
              value={nombreCompleto}
              onChange={(e) => setNombreCompleto(e.target.value)}
              className="w-full rounded-md border border-zinc-600 bg-zinc-900 text-zinc-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-cobre-500"
              placeholder="Ej: Juana Perez Gomez"
            />
            {errores.nombre && <p className="text-sm text-red-400 mt-1">{errores.nombre}</p>}
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-zinc-300 mb-1">
              Correo
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-zinc-600 bg-zinc-900 text-zinc-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-cobre-500"
              placeholder="usuario@ejemplo.com"
            />
            {errores.email && <p className="text-sm text-red-400 mt-1">{errores.email}</p>}
          </div>

          <div>
            <label htmlFor="role" className="block text-sm font-medium text-zinc-300 mb-1">
              Perfil
            </label>
            <select
              id="role"
              value={role}
              onChange={(e) => setRole(e.target.value as "administrador" | "lider_cuadrilla")}
              className="w-full rounded-md border border-zinc-600 bg-zinc-900 text-zinc-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-cobre-500"
            >
              <option value="lider_cuadrilla">Lider de cuadrilla</option>
              <option value="administrador">Coordinador</option>
            </select>
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="password" className="block text-sm font-medium text-zinc-300 mb-1">
              Contrasena temporal
            </label>
            <input
              id="password"
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-zinc-600 bg-zinc-900 text-zinc-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-cobre-500"
              placeholder="Minimo 8 caracteres"
            />
            {errores.password && <p className="text-sm text-red-400 mt-1">{errores.password}</p>}
            <p className="text-xs text-zinc-500 mt-1">
              Comunicasela al usuario por otro medio; el sistema no la envia por correo.
            </p>
          </div>

          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={guardando}
              className="bg-cobre-600 hover:bg-cobre-500 disabled:bg-cobre-900 text-white font-medium px-4 py-2 rounded-md transition-colors"
            >
              {guardando ? "Creando..." : "Crear usuario"}
            </button>
          </div>
        </form>
      </div>

      <div className="bg-zinc-800 rounded-xl shadow-md p-5 sm:p-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-zinc-50">Usuarios</h2>
          <button
            onClick={cargarUsuarios}
            disabled={cargandoLista}
            className="text-sm text-cobre-500 hover:text-cobre-300 disabled:text-zinc-600 font-medium"
          >
            {cargandoLista ? "Actualizando..." : "Actualizar"}
          </button>
        </div>

        {errorLista && <p className="text-sm text-red-400 mb-4">{errorLista}</p>}

        {!errorLista && usuarios.length === 0 && !cargandoLista && (
          <p className="text-sm text-zinc-400">Todavia no hay usuarios registrados.</p>
        )}

        {usuarios.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-700 text-zinc-400">
                  <th className="py-2 pr-4 font-medium">Nombre</th>
                  <th className="py-2 pr-4 font-medium">Correo / contrasena</th>
                  <th className="py-2 pr-4 font-medium">Rol</th>
                  <th className="py-2 pr-4 font-medium">Estado</th>
                  <th className="py-2 pr-4 font-medium text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {usuarios.map((usuario) => {
                  const editando = idEditando === usuario.id;
                  return (
                    <tr key={usuario.id} className="border-b border-zinc-800 last:border-0 align-top">
                      <td className="py-2 pr-4 text-zinc-200">
                        {editando ? (
                          <input
                            type="text"
                            value={nombreEditado}
                            onChange={(e) => setNombreEditado(e.target.value)}
                            className="w-full rounded-md border border-zinc-600 bg-zinc-900 text-zinc-100 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-cobre-500"
                            autoFocus
                          />
                        ) : (
                          usuario.nombre_completo
                        )}
                      </td>
                      <td className="py-2 pr-4 text-zinc-200">
                        {editando ? (
                          <div className="space-y-1 min-w-[180px]">
                            <input
                              type="email"
                              value={emailEditado}
                              onChange={(e) => setEmailEditado(e.target.value)}
                              className="w-full rounded-md border border-zinc-600 bg-zinc-900 text-zinc-100 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-cobre-500"
                              placeholder="Correo"
                            />
                            <input
                              type="text"
                              value={passwordEditado}
                              onChange={(e) => setPasswordEditado(e.target.value)}
                              className="w-full rounded-md border border-zinc-600 bg-zinc-900 text-zinc-100 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-cobre-500"
                              placeholder="Nueva contrasena (opcional)"
                            />
                          </div>
                        ) : (
                          usuario.email
                        )}
                      </td>
                      <td className="py-2 pr-4">
                        {editando ? (
                          <select
                            value={rolEditado}
                            onChange={(e) =>
                              setRolEditado(e.target.value as "administrador" | "lider_cuadrilla")
                            }
                            className="rounded-md border border-zinc-600 bg-zinc-900 text-zinc-100 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-cobre-500"
                          >
                            <option value="lider_cuadrilla">Lider de cuadrilla</option>
                            <option value="administrador">Coordinador</option>
                          </select>
                        ) : (
                          <span
                            className={
                              "inline-block px-2 py-0.5 rounded-full text-xs font-medium " +
                              (usuario.role === "administrador"
                                ? "bg-purple-950 text-purple-400"
                                : "bg-emerald-950 text-emerald-400")
                            }
                          >
                            {ROLE_LABEL[usuario.role] ?? usuario.role}
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-4">
                        {editando ? (
                          <label className="flex items-center gap-2 text-sm text-zinc-300">
                            <input
                              type="checkbox"
                              checked={activoEditado}
                              onChange={(e) => setActivoEditado(e.target.checked)}
                              className="h-4 w-4 rounded border-zinc-600 bg-zinc-900 text-cobre-600 focus:ring-cobre-500"
                            />
                            Habilitado
                          </label>
                        ) : (
                          <span
                            className={
                              "inline-block px-2 py-0.5 rounded-full text-xs font-medium " +
                              (usuario.activo
                                ? "bg-emerald-950 text-emerald-400"
                                : "bg-zinc-700 text-zinc-300")
                            }
                          >
                            {usuario.activo ? "Habilitado" : "Deshabilitado"}
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-4 text-right whitespace-nowrap">
                        {editando ? (
                          <div className="flex flex-col items-end gap-2">
                            {errorEdicion && (
                              <p className="text-xs text-red-400 max-w-[200px] text-right">
                                {errorEdicion}
                              </p>
                            )}
                            <div className="flex justify-end gap-2">
                              <button
                                onClick={() => guardarEdicion(usuario.id)}
                                disabled={
                                  guardandoEdicion || !nombreEditado.trim() || !emailEditado.trim()
                                }
                                className="text-sm text-white bg-cobre-600 hover:bg-cobre-500 disabled:bg-cobre-900 px-3 py-1 rounded-md"
                              >
                                {guardandoEdicion ? "Guardando..." : "Guardar"}
                              </button>
                              <button
                                onClick={cancelarEdicion}
                                disabled={guardandoEdicion}
                                className="text-sm text-zinc-300 hover:text-white px-3 py-1 rounded-md"
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => iniciarEdicion(usuario)}
                            className="text-sm text-cobre-500 hover:text-cobre-300 font-medium px-3 py-1"
                          >
                            Editar
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {popup.visible && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-zinc-800 rounded-lg shadow-lg max-w-sm w-full p-6 text-center">
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
            <h3 className="text-lg font-semibold text-zinc-50 mb-1">
              {popup.type === "success"
                ? "Guardado con exito"
                : popup.type === "duplicate"
                ? "Correo duplicado"
                : "Error"}
            </h3>
            <p className="text-sm text-zinc-300 mb-5">{popup.message}</p>
            <button
              onClick={cerrarPopup}
              className="bg-zinc-700 hover:bg-zinc-600 text-white px-4 py-2 rounded-md text-sm"
            >
              Aceptar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
