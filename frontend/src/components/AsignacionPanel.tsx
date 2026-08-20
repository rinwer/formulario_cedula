import { FormEvent, useEffect, useState } from "react";
import { EstadoTrabajo, Trabajo, Usuario } from "../types";

const API_URL = import.meta.env.VITE_API_URL ? "" : "http://localhost:8000";

type PopupState = {
  visible: boolean;
  type: "success" | "error";
  message: string;
};

const initialPopup: PopupState = { visible: false, type: "success", message: "" };

const ESTADO_LABEL: Record<EstadoTrabajo, string> = {
  pendiente: "Pendiente",
  en_progreso: "En progreso",
  completado: "Completado",
};

const ESTADO_BADGE: Record<EstadoTrabajo, string> = {
  pendiente: "bg-amber-100 text-amber-700",
  en_progreso: "bg-blue-100 text-blue-700",
  completado: "bg-emerald-100 text-emerald-700",
};

type Props = {
  accessToken: string;
};

export default function AsignacionPanel({ accessToken }: Props) {
  const [lideres, setLideres] = useState<Usuario[]>([]);

  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [liderId, setLiderId] = useState("");
  const [errores, setErrores] = useState<{ titulo?: string; lider?: string }>({});
  const [guardando, setGuardando] = useState(false);
  const [popup, setPopup] = useState<PopupState>(initialPopup);

  const [trabajos, setTrabajos] = useState<Trabajo[]>([]);
  const [cargandoLista, setCargandoLista] = useState(false);
  const [errorLista, setErrorLista] = useState<string | null>(null);

  const [idEditando, setIdEditando] = useState<string | null>(null);
  const [tituloEditado, setTituloEditado] = useState("");
  const [descripcionEditada, setDescripcionEditada] = useState("");
  const [liderEditado, setLiderEditado] = useState("");
  const [estadoEditado, setEstadoEditado] = useState<EstadoTrabajo>("pendiente");
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);
  const [errorEdicion, setErrorEdicion] = useState<string | null>(null);

  const cerrarPopup = () => setPopup(initialPopup);

  const cargarLideres = async () => {
    try {
      const res = await fetch(`${API_URL}/api/admin/usuarios`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error();
      const data: Usuario[] = await res.json();
      setLideres(data.filter((u) => u.role === "lider_cuadrilla"));
    } catch {
      // La lista de trabajos igual muestra el nombre del lider; si esto
      // falla solo se pierde el selector para crear trabajos nuevos.
    }
  };

  const cargarTrabajos = async () => {
    setCargandoLista(true);
    setErrorLista(null);
    try {
      const res = await fetch(`${API_URL}/api/admin/trabajos`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error();
      const data: Trabajo[] = await res.json();
      setTrabajos(data);
    } catch {
      setErrorLista("No se pudo cargar la lista de trabajos.");
    } finally {
      setCargandoLista(false);
    }
  };

  useEffect(() => {
    cargarLideres();
    cargarTrabajos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const validar = () => {
    const nuevosErrores: typeof errores = {};
    if (!titulo.trim()) nuevosErrores.titulo = "El titulo es obligatorio.";
    if (!liderId) nuevosErrores.lider = "Selecciona un lider de cuadrilla.";
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
      const res = await fetch(`${API_URL}/api/admin/trabajos`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          titulo: titulo.trim(),
          descripcion: descripcion.trim() || null,
          lider_id: liderId,
          estado: "pendiente",
        }),
      });

      if (res.status === 201) {
        setPopup({ visible: true, type: "success", message: "El trabajo se asigno con exito." });
        setTitulo("");
        setDescripcion("");
        setLiderId("");
        cargarTrabajos();
      } else {
        const data = await res.json().catch(() => null);
        setPopup({
          visible: true,
          type: "error",
          message: data?.detail ?? "Ocurrio un error al asignar el trabajo.",
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

  const iniciarEdicion = (trabajo: Trabajo) => {
    setIdEditando(trabajo.id);
    setTituloEditado(trabajo.titulo);
    setDescripcionEditada(trabajo.descripcion ?? "");
    setLiderEditado(trabajo.lider_id);
    setEstadoEditado(trabajo.estado);
    setErrorEdicion(null);
  };

  const cancelarEdicion = () => {
    setIdEditando(null);
    setErrorEdicion(null);
  };

  const guardarEdicion = async (trabajoId: string) => {
    if (!tituloEditado.trim() || !liderEditado) return;
    setErrorEdicion(null);
    setGuardandoEdicion(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/trabajos/${trabajoId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          titulo: tituloEditado.trim(),
          descripcion: descripcionEditada.trim() || null,
          lider_id: liderEditado,
          estado: estadoEditado,
        }),
      });

      if (res.ok) {
        const actualizado: Trabajo = await res.json();
        setTrabajos((prev) => prev.map((t) => (t.id === actualizado.id ? actualizado : t)));
        cancelarEdicion();
      } else {
        const data = await res.json().catch(() => null);
        setErrorEdicion(data?.detail ?? "Ocurrio un error al actualizar el trabajo.");
      }
    } catch {
      setErrorEdicion("No se pudo conectar con el servidor. Intenta de nuevo.");
    } finally {
      setGuardandoEdicion(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-md p-5 sm:p-8">
        <h2 className="text-lg font-semibold text-slate-800 mb-6">Nuevo trabajo</h2>

        <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2" noValidate>
          <div>
            <label htmlFor="titulo" className="block text-sm font-medium text-slate-700 mb-1">
              Titulo
            </label>
            <input
              id="titulo"
              type="text"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Ej: Revision de red en barrio X"
            />
            {errores.titulo && <p className="text-sm text-red-600 mt-1">{errores.titulo}</p>}
          </div>

          <div>
            <label htmlFor="lider" className="block text-sm font-medium text-slate-700 mb-1">
              Lider de cuadrilla
            </label>
            <select
              id="lider"
              value={liderId}
              onChange={(e) => setLiderId(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Selecciona un lider</option>
              {lideres.map((lider) => (
                <option key={lider.id} value={lider.id}>
                  {lider.nombre_completo}
                </option>
              ))}
            </select>
            {errores.lider && <p className="text-sm text-red-600 mt-1">{errores.lider}</p>}
            {lideres.length === 0 && (
              <p className="text-xs text-slate-500 mt-1">
                Todavia no hay lideres de cuadrilla creados en la pestana Perfiles.
              </p>
            )}
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="descripcion" className="block text-sm font-medium text-slate-700 mb-1">
              Descripcion
            </label>
            <textarea
              id="descripcion"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Detalle del trabajo (opcional)"
            />
          </div>

          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={guardando}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-medium px-4 py-2 rounded-md transition-colors"
            >
              {guardando ? "Asignando..." : "Asignar trabajo"}
            </button>
          </div>
        </form>
      </div>

      <div className="bg-white rounded-xl shadow-md p-5 sm:p-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-slate-800">Trabajos asignados</h2>
          <button
            onClick={cargarTrabajos}
            disabled={cargandoLista}
            className="text-sm text-blue-600 hover:text-blue-800 disabled:text-slate-400 font-medium"
          >
            {cargandoLista ? "Actualizando..." : "Actualizar"}
          </button>
        </div>

        {errorLista && <p className="text-sm text-red-600 mb-4">{errorLista}</p>}

        {!errorLista && trabajos.length === 0 && !cargandoLista && (
          <p className="text-sm text-slate-500">Todavia no hay trabajos asignados.</p>
        )}

        {trabajos.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-4 font-medium">Titulo / descripcion</th>
                  <th className="py-2 pr-4 font-medium">Lider</th>
                  <th className="py-2 pr-4 font-medium">Estado</th>
                  <th className="py-2 pr-4 font-medium text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {trabajos.map((trabajo) => {
                  const editando = idEditando === trabajo.id;
                  return (
                    <tr key={trabajo.id} className="border-b border-slate-100 last:border-0 align-top">
                      <td className="py-2 pr-4 text-slate-700">
                        {editando ? (
                          <div className="space-y-1 min-w-[200px]">
                            <input
                              type="text"
                              value={tituloEditado}
                              onChange={(e) => setTituloEditado(e.target.value)}
                              className="w-full rounded-md border border-slate-300 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                              autoFocus
                            />
                            <textarea
                              value={descripcionEditada}
                              onChange={(e) => setDescripcionEditada(e.target.value)}
                              rows={2}
                              className="w-full rounded-md border border-slate-300 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                              placeholder="Descripcion (opcional)"
                            />
                          </div>
                        ) : (
                          <>
                            <p className="font-medium">{trabajo.titulo}</p>
                            {trabajo.descripcion && (
                              <p className="text-slate-500 text-xs mt-0.5">{trabajo.descripcion}</p>
                            )}
                          </>
                        )}
                      </td>
                      <td className="py-2 pr-4 text-slate-700">
                        {editando ? (
                          <select
                            value={liderEditado}
                            onChange={(e) => setLiderEditado(e.target.value)}
                            className="rounded-md border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            {lideres.map((lider) => (
                              <option key={lider.id} value={lider.id}>
                                {lider.nombre_completo}
                              </option>
                            ))}
                          </select>
                        ) : (
                          trabajo.lider_nombre ?? trabajo.lider_email ?? "—"
                        )}
                      </td>
                      <td className="py-2 pr-4">
                        {editando ? (
                          <select
                            value={estadoEditado}
                            onChange={(e) => setEstadoEditado(e.target.value as EstadoTrabajo)}
                            className="rounded-md border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="pendiente">Pendiente</option>
                            <option value="en_progreso">En progreso</option>
                            <option value="completado">Completado</option>
                          </select>
                        ) : (
                          <span
                            className={
                              "inline-block px-2 py-0.5 rounded-full text-xs font-medium " +
                              ESTADO_BADGE[trabajo.estado]
                            }
                          >
                            {ESTADO_LABEL[trabajo.estado]}
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-4 text-right whitespace-nowrap">
                        {editando ? (
                          <div className="flex flex-col items-end gap-2">
                            {errorEdicion && (
                              <p className="text-xs text-red-600 max-w-[200px] text-right">
                                {errorEdicion}
                              </p>
                            )}
                            <div className="flex justify-end gap-2">
                              <button
                                onClick={() => guardarEdicion(trabajo.id)}
                                disabled={
                                  guardandoEdicion || !tituloEditado.trim() || !liderEditado
                                }
                                className="text-sm text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 px-3 py-1 rounded-md"
                              >
                                {guardandoEdicion ? "Guardando..." : "Guardar"}
                              </button>
                              <button
                                onClick={cancelarEdicion}
                                disabled={guardandoEdicion}
                                className="text-sm text-slate-600 hover:text-slate-800 px-3 py-1 rounded-md"
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => iniciarEdicion(trabajo)}
                            className="text-sm text-blue-600 hover:text-blue-800 font-medium px-3 py-1"
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
          <div className="bg-white rounded-lg shadow-lg max-w-sm w-full p-6 text-center">
            <div
              className={
                "mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full text-white " +
                (popup.type === "success" ? "bg-green-500" : "bg-red-500")
              }
            >
              {popup.type === "success" ? "✓" : "✕"}
            </div>
            <h3 className="text-lg font-semibold text-slate-800 mb-1">
              {popup.type === "success" ? "Guardado con exito" : "Error"}
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
