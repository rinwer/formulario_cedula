import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import { EstadoTrabajo, Trabajo } from "../types";

const API_URL = import.meta.env.VITE_API_URL ? "" : "http://localhost:8000";

type PopupState = {
  visible: boolean;
  type: "success" | "error";
  message: string;
};

const initialPopup: PopupState = { visible: false, type: "success", message: "" };

const ESTADO_LABEL: Record<EstadoTrabajo, string> = {
  asignado: "Asignado",
  finalizado: "Finalizado",
  standby: "Standby",
};

const ESTADO_BADGE: Record<EstadoTrabajo, string> = {
  asignado: "bg-emerald-100 text-emerald-700",
  finalizado: "bg-slate-200 text-slate-600",
  standby: "bg-amber-100 text-amber-700",
};

type InfoTooltipProps = {
  texto: string;
  variante?: "info" | "advertencia";
  label: string;
};

function InfoTooltip({ texto, variante = "info", label }: InfoTooltipProps) {
  const [abierto, setAbierto] = useState(false);
  const contenedorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const manejarClickFuera = (e: MouseEvent) => {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target as Node)) {
        setAbierto(false);
      }
    };
    document.addEventListener("mousedown", manejarClickFuera);
    return () => document.removeEventListener("mousedown", manejarClickFuera);
  }, [abierto]);

  const colores =
    variante === "advertencia"
      ? "text-amber-700 bg-amber-50 border-amber-200"
      : "text-slate-600 bg-white border-slate-200";

  return (
    <div className="relative inline-block" ref={contenedorRef}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-label={label}
        className="flex h-4 w-4 items-center justify-center rounded-full bg-slate-200 text-slate-600 text-[10px] font-bold hover:bg-slate-300"
      >
        i
      </button>
      {abierto && (
        <div
          className={
            "absolute left-0 top-6 z-10 w-72 text-xs rounded-md border px-3 py-2 pr-6 shadow-md " +
            colores
          }
        >
          <button
            type="button"
            onClick={() => setAbierto(false)}
            aria-label="Cerrar"
            className="absolute top-1 right-1.5 text-slate-400 hover:text-slate-600 leading-none"
          >
            ✕
          </button>
          {texto}
        </div>
      )}
    </div>
  );
}

type Props = {
  accessToken: string;
};

export default function AsignacionPanel({ accessToken }: Props) {
  const [idSmp, setIdSmp] = useState("");
  const [site, setSite] = useState("");
  const [zona, setZona] = useState("");
  const [errores, setErrores] = useState<{ idSmp?: string; site?: string; zona?: string }>({});
  const [guardando, setGuardando] = useState(false);
  const [popup, setPopup] = useState<PopupState>(initialPopup);

  const [trabajos, setTrabajos] = useState<Trabajo[]>([]);
  const [cargandoLista, setCargandoLista] = useState(false);
  const [errorLista, setErrorLista] = useState<string | null>(null);

  const [idEditando, setIdEditando] = useState<string | null>(null);
  const [idSmpEditado, setIdSmpEditado] = useState("");
  const [siteEditado, setSiteEditado] = useState("");
  const [zonaEditada, setZonaEditada] = useState("");
  const [estadoEditado, setEstadoEditado] = useState<EstadoTrabajo>("asignado");
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);
  const [errorEdicion, setErrorEdicion] = useState<string | null>(null);

  const inputArchivoRef = useRef<HTMLInputElement>(null);
  const [subiendoCsv, setSubiendoCsv] = useState(false);

  const cerrarPopup = () => setPopup(initialPopup);

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
    cargarTrabajos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const validar = () => {
    const nuevosErrores: typeof errores = {};
    if (!idSmp.trim()) nuevosErrores.idSmp = "El ID / SMP es obligatorio.";
    if (!site.trim()) nuevosErrores.site = "El site es obligatorio.";
    if (!zona.trim()) nuevosErrores.zona = "La zona es obligatoria.";
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
        }),
      });

      if (res.status === 201) {
        setPopup({ visible: true, type: "success", message: "El trabajo se creo con exito." });
        setIdSmp("");
        setSite("");
        setZona("");
        cargarTrabajos();
      } else {
        const data = await res.json().catch(() => null);
        setPopup({
          visible: true,
          type: "error",
          message: data?.detail ?? "Ocurrio un error al crear el trabajo.",
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
    setEstadoEditado(trabajo.estado);
    setErrorEdicion(null);
  };

  const cancelarEdicion = () => {
    setIdEditando(null);
    setErrorEdicion(null);
  };

  const guardarEdicion = async (trabajoId: string) => {
    if (!idSmpEditado.trim() || !siteEditado.trim() || !zonaEditada.trim()) return;
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
        const cargadas: number = data?.actividades_cargadas ?? 0;
        let mensaje = `Se cargaron ${cargadas} actividad(es).`;
        if (sinCoincidencia.length > 0) {
          mensaje += ` No se encontro asignacion para estos sites: ${sinCoincidencia.join(", ")}.`;
          if (cargadas === 0) {
            mensaje +=
              ' Primero haz clic en "Asignar" para crear ese site y despues vuelve a cargar el CSV.';
          }
        }
        // Si no se cargo nada, no es realmente un exito aunque la
        // peticion haya respondido 200: se muestra en rojo para que no
        // parezca que si funciono.
        setPopup({ visible: true, type: cargadas > 0 ? "success" : "error", message: mensaje });
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

          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={guardando}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-medium px-4 py-2 rounded-md transition-colors"
            >
              {guardando ? "Asignando..." : "Asignar"}
            </button>
          </div>
        </form>

        <div className="mt-6 pt-6 border-t border-slate-200">
          <div className="flex items-center gap-1.5 mb-3">
            <h3 className="text-sm font-semibold text-slate-800">Cargar actividades (CSV)</h3>
            <InfoTooltip
              variante="advertencia"
              label="Ayuda: cuando se puede cargar el CSV"
              texto={
                'Si el site es nuevo, primero haz clic en "Asignar" arriba para crearlo. ' +
                'El CSV solo vincula actividades a sites que ya existan en "Trabajos"; ' +
                "si lo subes antes, no se carga nada aunque el archivo este bien."
              }
            />
            <InfoTooltip
              label="Ayuda: columnas esperadas del CSV"
              texto={
                "Columnas esperadas: SITE, ACTIVIDAD, TIPIFICACION, HW-ACTIVIDAD, QTY, AVANCE " +
                "(separadas por coma, punto y coma o punto — se detecta solo). El SITE debe " +
                "coincidir con el de una asignacion existente."
              }
            />
          </div>
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
          <h2 className="text-lg font-semibold text-slate-800">Trabajos</h2>
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
          <p className="text-sm text-slate-500">Todavia no hay trabajos creados.</p>
        )}

        {trabajos.length > 0 && (
          <p className="text-xs text-slate-500 mb-3">
            Un trabajo en <strong>Finalizado</strong> o <strong>Standby</strong> deja de aparecer en
            la bandeja del lider de cuadrilla.
          </p>
        )}

        {trabajos.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-4 font-medium">ID / SMP</th>
                  <th className="py-2 pr-4 font-medium">Site</th>
                  <th className="py-2 pr-4 font-medium">Zona</th>
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
                      <td className="py-2 pr-4">
                        {editando ? (
                          <select
                            value={estadoEditado}
                            onChange={(e) => setEstadoEditado(e.target.value as EstadoTrabajo)}
                            className="rounded-md border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="asignado">Asignado</option>
                            <option value="finalizado">Finalizado</option>
                            <option value="standby">Standby</option>
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
                                  guardandoEdicion ||
                                  !idSmpEditado.trim() ||
                                  !siteEditado.trim() ||
                                  !zonaEditada.trim()
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
