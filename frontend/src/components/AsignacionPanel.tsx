import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import { Trabajo, Usuario } from "../types";

const API_URL = import.meta.env.VITE_API_URL ? "" : "http://localhost:8000";

type PopupState = {
  visible: boolean;
  type: "success" | "error";
  message: string;
};

const initialPopup: PopupState = { visible: false, type: "success", message: "" };

type Props = {
  accessToken: string;
};

export default function AsignacionPanel({ accessToken }: Props) {
  const [lideres, setLideres] = useState<Usuario[]>([]);

  const [idSmp, setIdSmp] = useState("");
  const [site, setSite] = useState("");
  const [zona, setZona] = useState("");
  const [liderId, setLiderId] = useState("");
  const [errores, setErrores] = useState<{ idSmp?: string; site?: string; zona?: string; lider?: string }>(
    {}
  );
  const [guardando, setGuardando] = useState(false);
  const [popup, setPopup] = useState<PopupState>(initialPopup);

  const [trabajos, setTrabajos] = useState<Trabajo[]>([]);
  const [cargandoLista, setCargandoLista] = useState(false);
  const [errorLista, setErrorLista] = useState<string | null>(null);

  const [idEditando, setIdEditando] = useState<string | null>(null);
  const [idSmpEditado, setIdSmpEditado] = useState("");
  const [siteEditado, setSiteEditado] = useState("");
  const [zonaEditada, setZonaEditada] = useState("");
  const [liderEditado, setLiderEditado] = useState("");
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);
  const [errorEdicion, setErrorEdicion] = useState<string | null>(null);

  const inputArchivoRef = useRef<HTMLInputElement>(null);
  const [subiendoCsv, setSubiendoCsv] = useState(false);

  const cerrarPopup = () => setPopup(initialPopup);

  const lideresHabilitados = lideres.filter((u) => u.role === "lider_cuadrilla" && u.activo);

  const cargarLideres = async () => {
    try {
      const res = await fetch(`${API_URL}/api/admin/usuarios`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error();
      const data: Usuario[] = await res.json();
      setLideres(data);
    } catch {
      // La lista de trabajos igual muestra el nombre del lider; si esto
      // falla solo se pierde el selector para crear/editar trabajos.
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
    if (!idSmp.trim()) nuevosErrores.idSmp = "El ID / SMP es obligatorio.";
    if (!site.trim()) nuevosErrores.site = "El site es obligatorio.";
    if (!zona.trim()) nuevosErrores.zona = "La zona es obligatoria.";
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
          id_smp: idSmp.trim(),
          site: site.trim(),
          zona: zona.trim(),
          lider_id: liderId,
        }),
      });

      if (res.status === 201) {
        setPopup({ visible: true, type: "success", message: "El trabajo se asigno con exito." });
        setIdSmp("");
        setSite("");
        setZona("");
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
    setIdSmpEditado(trabajo.id_smp);
    setSiteEditado(trabajo.site);
    setZonaEditada(trabajo.zona);
    setLiderEditado(trabajo.lider_id);
    setErrorEdicion(null);
  };

  const cancelarEdicion = () => {
    setIdEditando(null);
    setErrorEdicion(null);
  };

  const guardarEdicion = async (trabajoId: string) => {
    if (!idSmpEditado.trim() || !siteEditado.trim() || !zonaEditada.trim() || !liderEditado) return;
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
          id_smp: idSmpEditado.trim(),
          site: siteEditado.trim(),
          zona: zonaEditada.trim(),
          lider_id: liderEditado,
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

  const subirCsv = async (archivo: File) => {
    setSubiendoCsv(true);

    try {
      const formData = new FormData();
      formData.append("archivo", archivo);

      const res = await fetch(`${API_URL}/api/admin/actividades/importar`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: formData,
      });

      const data = await res.json().catch(() => null);

      if (res.ok) {
        const sinCoincidencia: string[] = data?.sitios_no_encontrados ?? [];
        let mensaje = `Se cargaron ${data?.actividades_cargadas ?? 0} actividad(es).`;
        if (sinCoincidencia.length > 0) {
          mensaje += ` No se encontro asignacion para estos sites: ${sinCoincidencia.join(", ")}.`;
        }
        setPopup({ visible: true, type: "success", message: mensaje });
      } else {
        setPopup({
          visible: true,
          type: "error",
          message: data?.detail ?? "Ocurrio un error al cargar el archivo.",
        });
      }
    } catch {
      setPopup({
        visible: true,
        type: "error",
        message: "No se pudo conectar con el servidor. Intenta de nuevo.",
      });
    } finally {
      setSubiendoCsv(false);
      if (inputArchivoRef.current) inputArchivoRef.current.value = "";
    }
  };

  const handleArchivoSeleccionado = (e: ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0];
    if (archivo) subirCsv(archivo);
  };

  const dispararSelectorArchivo = () => inputArchivoRef.current?.click();

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-md p-5 sm:p-8">
        <h2 className="text-lg font-semibold text-slate-800 mb-6">Nuevo trabajo</h2>

        <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2" noValidate>
          <div>
            <label htmlFor="id_smp" className="block text-sm font-medium text-slate-700 mb-1">
              ID / SMP
            </label>
            <input
              id="id_smp"
              type="text"
              value={idSmp}
              onChange={(e) => setIdSmp(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Ej: SMP-00123"
            />
            {errores.idSmp && <p className="text-sm text-red-600 mt-1">{errores.idSmp}</p>}
          </div>

          <div>
            <label htmlFor="site" className="block text-sm font-medium text-slate-700 mb-1">
              Site
            </label>
            <input
              id="site"
              type="text"
              value={site}
              onChange={(e) => setSite(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Ej: BOG-0045"
            />
            {errores.site && <p className="text-sm text-red-600 mt-1">{errores.site}</p>}
            <p className="text-xs text-slate-500 mt-1">
              Debe coincidir con la columna SITE del CSV de actividades.
            </p>
          </div>

          <div>
            <label htmlFor="zona" className="block text-sm font-medium text-slate-700 mb-1">
              Zona
            </label>
            <input
              id="zona"
              type="text"
              value={zona}
              onChange={(e) => setZona(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Ej: Norte"
            />
            {errores.zona && <p className="text-sm text-red-600 mt-1">{errores.zona}</p>}
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
              {lideresHabilitados.map((lider) => (
                <option key={lider.id} value={lider.id}>
                  {lider.nombre_completo}
                </option>
              ))}
            </select>
            {errores.lider && <p className="text-sm text-red-600 mt-1">{errores.lider}</p>}
            {lideresHabilitados.length === 0 && (
              <p className="text-xs text-slate-500 mt-1">
                No hay lideres de cuadrilla habilitados. Crea o habilita uno en la pestana Perfiles.
              </p>
            )}
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

        <div className="mt-6 pt-6 border-t border-slate-200">
          <h3 className="text-sm font-semibold text-slate-800 mb-1">Cargar actividades (CSV)</h3>
          <p className="text-xs text-slate-500 mb-3">
            Columnas esperadas: SITE, ACTIVIDAD, TIPIFICACION, HW-ACTIVIDAD, QTY, AVANCE (separadas
            por coma, punto y coma o punto — se detecta solo). El SITE debe coincidir con el de una
            asignacion existente.
          </p>
          <input
            ref={inputArchivoRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleArchivoSeleccionado}
            className="hidden"
          />
          <button
            type="button"
            onClick={dispararSelectorArchivo}
            disabled={subiendoCsv}
            className="text-sm text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 font-medium px-4 py-2 rounded-md transition-colors"
          >
            {subiendoCsv ? "Cargando..." : "Seleccionar archivo"}
          </button>
        </div>
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
                  <th className="py-2 pr-4 font-medium">ID / SMP</th>
                  <th className="py-2 pr-4 font-medium">Site</th>
                  <th className="py-2 pr-4 font-medium">Lider de cuadrilla</th>
                  <th className="py-2 pr-4 font-medium">Zona</th>
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
                          <input
                            type="text"
                            value={idSmpEditado}
                            onChange={(e) => setIdSmpEditado(e.target.value)}
                            className="w-full rounded-md border border-slate-300 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            autoFocus
                          />
                        ) : (
                          trabajo.id_smp
                        )}
                      </td>
                      <td className="py-2 pr-4 text-slate-700">
                        {editando ? (
                          <input
                            type="text"
                            value={siteEditado}
                            onChange={(e) => setSiteEditado(e.target.value)}
                            className="w-full rounded-md border border-slate-300 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        ) : (
                          trabajo.site
                        )}
                      </td>
                      <td className="py-2 pr-4 text-slate-700">
                        {editando ? (
                          <select
                            value={liderEditado}
                            onChange={(e) => setLiderEditado(e.target.value)}
                            className="rounded-md border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            {!lideresHabilitados.some((l) => l.id === trabajo.lider_id) && (
                              <option value={trabajo.lider_id}>
                                {trabajo.lider_nombre ?? trabajo.lider_email} (deshabilitado)
                              </option>
                            )}
                            {lideresHabilitados.map((lider) => (
                              <option key={lider.id} value={lider.id}>
                                {lider.nombre_completo}
                              </option>
                            ))}
                          </select>
                        ) : (
                          trabajo.lider_nombre ?? trabajo.lider_email ?? "—"
                        )}
                      </td>
                      <td className="py-2 pr-4 text-slate-700">
                        {editando ? (
                          <input
                            type="text"
                            value={zonaEditada}
                            onChange={(e) => setZonaEditada(e.target.value)}
                            className="w-full rounded-md border border-slate-300 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        ) : (
                          trabajo.zona
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
                                  guardandoEdicion ||
                                  !idSmpEditado.trim() ||
                                  !siteEditado.trim() ||
                                  !zonaEditada.trim() ||
                                  !liderEditado
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
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => iniciarEdicion(trabajo)}
                              className="text-sm text-blue-600 hover:text-blue-800 font-medium px-3 py-1"
                            >
                              Editar
                            </button>
                            <button
                              onClick={dispararSelectorArchivo}
                              disabled={subiendoCsv}
                              className="text-sm text-slate-600 hover:text-slate-800 disabled:text-slate-400 font-medium px-3 py-1"
                            >
                              Cargar CSV
                            </button>
                          </div>
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
