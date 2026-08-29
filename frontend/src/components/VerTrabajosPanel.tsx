import { useEffect, useState } from "react";
import { fetchAutenticado } from "../lib/api";
import { ActividadAdmin, AvanceDiario, EstadoTrabajo, Trabajo } from "../types";

const API_URL = import.meta.env.VITE_API_URL ? "" : "http://localhost:8000";

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

function qtyNumerico(qty: string | null): number | null {
  if (qty === null || qty.trim() === "") return null;
  const valor = Number(qty);
  return Number.isFinite(valor) ? valor : null;
}

function formatearFecha(iso: string): string {
  try {
    return new Date(iso).toLocaleString("es-CO", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function VerTrabajosPanel() {
  const [trabajos, setTrabajos] = useState<Trabajo[]>([]);
  const [cargandoTrabajos, setCargandoTrabajos] = useState(true);
  const [errorTrabajos, setErrorTrabajos] = useState<string | null>(null);

  const [busqueda, setBusqueda] = useState("");
  const [trabajoSeleccionado, setTrabajoSeleccionado] = useState<Trabajo | null>(null);

  const [actividades, setActividades] = useState<ActividadAdmin[]>([]);
  const [cargandoActividades, setCargandoActividades] = useState(false);
  const [errorActividades, setErrorActividades] = useState<string | null>(null);

  const [avances, setAvances] = useState<AvanceDiario[]>([]);
  const [cargandoAvances, setCargandoAvances] = useState(false);
  const [errorAvances, setErrorAvances] = useState<string | null>(null);

  const cargarTrabajos = async () => {
    setCargandoTrabajos(true);
    setErrorTrabajos(null);
    try {
      const res = await fetchAutenticado(`${API_URL}/api/admin/trabajos`);
      if (!res.ok) throw new Error();
      const data: Trabajo[] = await res.json();
      setTrabajos(data);
    } catch {
      setErrorTrabajos("No se pudo cargar la lista de trabajos.");
    } finally {
      setCargandoTrabajos(false);
    }
  };

  useEffect(() => {
    cargarTrabajos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cargarActividades = async (trabajoId: string) => {
    setCargandoActividades(true);
    setErrorActividades(null);
    try {
      const res = await fetchAutenticado(`${API_URL}/api/admin/trabajos/${trabajoId}/actividades`);
      if (!res.ok) throw new Error();
      const data: ActividadAdmin[] = await res.json();
      setActividades(data);
    } catch {
      setErrorActividades("No se pudieron cargar las actividades.");
    } finally {
      setCargandoActividades(false);
    }
  };

  const cargarAvances = async (trabajoId: string) => {
    setCargandoAvances(true);
    setErrorAvances(null);
    try {
      const res = await fetchAutenticado(`${API_URL}/api/admin/trabajos/${trabajoId}/avances`);
      if (!res.ok) throw new Error();
      const data: AvanceDiario[] = await res.json();
      setAvances(data);
    } catch {
      setErrorAvances("No se pudieron cargar los comentarios.");
    } finally {
      setCargandoAvances(false);
    }
  };

  const seleccionarTrabajo = (trabajo: Trabajo) => {
    setTrabajoSeleccionado(trabajo);
    setBusqueda(trabajo.site);
    cargarActividades(trabajo.id);
    cargarAvances(trabajo.id);
  };

  const limpiarSeleccion = () => {
    setTrabajoSeleccionado(null);
    setBusqueda("");
    setActividades([]);
    setAvances([]);
  };

  const coincidencias =
    busqueda.trim() && (!trabajoSeleccionado || trabajoSeleccionado.site !== busqueda)
      ? trabajos
          .filter((t) => t.site.toLowerCase().includes(busqueda.trim().toLowerCase()))
          .slice(0, 8)
      : [];

  const hwActividadPorId: Record<string, string> = {};
  actividades.forEach((a) => {
    hwActividadPorId[a.id] = a.hw_actividad ?? a.actividad ?? "(sin nombre)";
  });

  // La columna "Avance" del CSV es el valor crudo importado (casi
  // siempre vacio); lo que realmente importa es cuanto ha reportado el
  // lider dia a dia, que se calcula sumando avances_diarios_detalle.
  const acumuladoPorActividad: Record<string, number> = {};
  avances.forEach((avance) => {
    avance.detalles.forEach((d) => {
      acumuladoPorActividad[d.actividad_id] = (acumuladoPorActividad[d.actividad_id] ?? 0) + d.cantidad;
    });
  });

  const comentarios = avances.filter((a) => a.comentario);

  return (
    <div className="bg-white rounded-xl shadow-md p-5 sm:p-8">
      <h1 className="text-lg font-semibold text-slate-800 mb-1">Ver Trabajos</h1>
      <p className="text-sm text-slate-500 mb-6">
        Busca un site para ver todas sus actividades cargadas por CSV y el historial de
        comentarios que ha dejado el lider de cuadrilla.
      </p>

      {errorTrabajos && <p className="text-sm text-red-600 mb-4">{errorTrabajos}</p>}

      <div className="relative max-w-md mb-6">
        <input
          type="text"
          value={busqueda}
          onChange={(e) => {
            setBusqueda(e.target.value);
            if (trabajoSeleccionado) setTrabajoSeleccionado(null);
          }}
          placeholder={cargandoTrabajos ? "Cargando sites..." : "Buscar site por nombre..."}
          disabled={cargandoTrabajos}
          className="w-full rounded-md border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-cobre-500"
        />
        {busqueda && (
          <button
            type="button"
            onClick={limpiarSeleccion}
            aria-label="Limpiar busqueda"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          >
            ✕
          </button>
        )}

        {coincidencias.length > 0 && (
          <ul className="absolute z-10 mt-1 w-full rounded-md border border-slate-300 bg-white shadow-lg max-h-60 overflow-y-auto">
            {coincidencias.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => seleccionarTrabajo(t)}
                  className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                >
                  <span className="font-medium">{t.site}</span>{" "}
                  <span className="text-slate-400">— {t.zona}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {trabajoSeleccionado && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-3 pb-4 border-b border-slate-200">
            <h2 className="text-base font-semibold text-slate-800">{trabajoSeleccionado.site}</h2>
            <span className="text-sm text-slate-500">{trabajoSeleccionado.zona}</span>
            <span
              className={
                "inline-block px-2 py-0.5 rounded-full text-xs font-medium " +
                ESTADO_BADGE[trabajoSeleccionado.estado]
              }
            >
              {ESTADO_LABEL[trabajoSeleccionado.estado]}
            </span>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Actividades (CSV)</h3>
            {errorActividades && <p className="text-sm text-red-600 mb-3">{errorActividades}</p>}
            {cargandoActividades ? (
              <p className="text-sm text-slate-500">Cargando...</p>
            ) : actividades.length === 0 ? (
              <p className="text-sm text-slate-500">Este trabajo todavia no tiene actividades.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="py-2 pr-4 font-medium">Actividad</th>
                      <th className="py-2 pr-4 font-medium">Tipificacion</th>
                      <th className="py-2 pr-4 font-medium">HW-Actividad</th>
                      <th className="py-2 pr-4 font-medium">Qty</th>
                      <th className="py-2 pr-4 font-medium">Avance</th>
                      <th className="py-2 pr-4 font-medium">Reportado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {actividades.map((a) => {
                      const qtyMax = qtyNumerico(a.qty);
                      const acumulado = acumuladoPorActividad[a.id] ?? 0;
                      const completa = qtyMax !== null && acumulado >= qtyMax;
                      return (
                        <tr
                          key={a.id}
                          className={
                            "border-b border-slate-100 last:border-0 " +
                            (completa
                              ? "bg-emerald-50"
                              : acumulado === 0
                              ? "bg-amber-50"
                              : "")
                          }
                        >
                          <td className="py-2 pr-4 text-slate-700">{a.actividad ?? "—"}</td>
                          <td className="py-2 pr-4 text-slate-700">{a.tipificacion ?? "—"}</td>
                          <td className="py-2 pr-4 text-slate-700">{a.hw_actividad ?? "—"}</td>
                          <td className="py-2 pr-4 text-slate-700">{a.qty ?? "—"}</td>
                          <td className="py-2 pr-4 text-slate-700">{a.avance ?? "—"}</td>
                          <td className="py-2 pr-4">
                            {acumulado === 0 ? (
                              <span className="text-sm font-semibold text-amber-700">Sin avance</span>
                            ) : (
                              <span
                                className={
                                  "text-xs font-semibold " +
                                  (completa ? "text-emerald-700" : "text-slate-700")
                                }
                              >
                                {qtyMax !== null ? `${acumulado} / ${qtyMax}` : acumulado}
                                {completa && " ✓"}
                              </span>
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

          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Comentarios</h3>
            {errorAvances && <p className="text-sm text-red-600 mb-3">{errorAvances}</p>}
            {cargandoAvances ? (
              <p className="text-sm text-slate-500">Cargando...</p>
            ) : comentarios.length === 0 ? (
              <p className="text-sm text-slate-500">Todavia no hay comentarios registrados.</p>
            ) : (
              <ul className="space-y-3">
                {comentarios.map((avance) => (
                  <li key={avance.id} className="border-b border-slate-100 pb-3 last:border-0">
                    <span className="text-sm font-medium text-slate-700">
                      {formatearFecha(avance.created_at)}
                    </span>
                    <p className="text-sm text-slate-600 mt-0.5">{avance.comentario}</p>
                    {avance.detalles.length > 0 && (
                      <p className="mt-0.5 text-xs text-slate-500">
                        {avance.detalles
                          .map(
                            (d) => `${hwActividadPorId[d.actividad_id] ?? d.actividad_id}: ${d.cantidad}`
                          )
                          .join(" · ")}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
