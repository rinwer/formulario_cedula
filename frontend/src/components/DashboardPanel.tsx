import { useEffect, useState } from "react";
import { fetchAutenticado } from "../lib/api";
import { Calendario, hoyIso } from "./Calendario";
import { AvanceDiarioAdmin } from "../types";

const API_URL = import.meta.env.VITE_API_URL ? "" : "http://localhost:8000";

type Stats = {
  cantidad: number;
  promedio: number | null;
  completados: number;
};

function calcularStats(filas: AvanceDiarioAdmin[]): Stats {
  const conAvance = filas
    .map((f) => f.porcentaje_avance)
    .filter((p): p is number => p !== null);
  return {
    cantidad: filas.length,
    promedio:
      conAvance.length === 0
        ? null
        : Math.round(conAvance.reduce((a, b) => a + b, 0) / conAvance.length),
    completados: conAvance.filter((p) => p >= 100).length,
  };
}

type StatCardProps = { etiqueta: string; valor: string; resaltado?: "ambar" | "esmeralda" };

function StatCard({ etiqueta, valor, resaltado }: StatCardProps) {
  return (
    <div className="border border-slate-200 rounded-lg p-3">
      <p className="text-xs text-slate-500 mb-1">{etiqueta}</p>
      <p
        className={
          "text-xl font-semibold " +
          (resaltado === "ambar"
            ? "text-amber-700"
            : resaltado === "esmeralda"
            ? "text-emerald-600"
            : "text-slate-800")
        }
      >
        {valor}
      </p>
    </div>
  );
}

export default function DashboardPanel() {
  const [fecha, setFecha] = useState(hoyIso());
  const [filas, setFilas] = useState<AvanceDiarioAdmin[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = async (fechaConsulta: string) => {
    setCargando(true);
    setError(null);
    try {
      const parametros = new URLSearchParams({ fecha: fechaConsulta });
      const res = await fetchAutenticado(
        `${API_URL}/api/admin/programacion?${parametros.toString()}`
      );
      if (!res.ok) throw new Error();
      const data: AvanceDiarioAdmin[] = await res.json();
      setFilas(data);
    } catch {
      setError("No se pudo cargar el resumen de ese dia.");
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargar(fecha);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fecha]);

  const fechaFormateada = new Date(`${fecha}T00:00:00`).toLocaleDateString("es-CO", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const general = calcularStats(filas);
  const filasConLider = filas.filter((f) => f.lider_id);
  const sinAsignar = filas.length - filasConLider.length;
  const sinActualizar = filasConLider.filter((f) => !f.actualizado).length;

  // Agrupado por zona: todos los sites activos de la fecha, la tengan o
  // no asignada a un lider ese dia.
  const filasPorZona: Record<string, AvanceDiarioAdmin[]> = {};
  filas.forEach((f) => {
    (filasPorZona[f.zona] ??= []).push(f);
  });
  const zonas = Object.keys(filasPorZona).sort((a, b) => a.localeCompare(b));

  // Agrupado por lider: solo los sites que si tienen a alguien programado
  // ese dia (sin eso no hay a quien darle seguimiento).
  const filasPorLider: Record<string, AvanceDiarioAdmin[]> = {};
  filasConLider.forEach((f) => {
    (filasPorLider[f.lider_id as string] ??= []).push(f);
  });
  const liderIds = Object.keys(filasPorLider).sort((a, b) => {
    const nombreA = filasPorLider[a][0].lider_nombre ?? filasPorLider[a][0].lider_email ?? "";
    const nombreB = filasPorLider[b][0].lider_nombre ?? filasPorLider[b][0].lider_email ?? "";
    return nombreA.localeCompare(nombreB);
  });

  return (
    <div className="bg-white rounded-xl shadow-md p-5 sm:p-8">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-lg font-semibold text-slate-800">Dashboard</h1>
        <button
          onClick={() => cargar(fecha)}
          disabled={cargando}
          className="text-sm text-cobre-600 hover:text-cobre-800 disabled:text-slate-400 font-medium"
        >
          {cargando ? "Actualizando..." : "Actualizar"}
        </button>
      </div>
      <p className="text-sm text-slate-500 mb-6 capitalize">{fechaFormateada}</p>

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="w-full lg:w-64 shrink-0">
          <Calendario fechaSeleccionada={fecha} onSeleccionar={setFecha} />
        </div>

        <div className="flex-1 overflow-x-auto">
          {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

          {!cargando && !error && filas.length === 0 && (
            <p className="text-sm text-slate-500">No hay trabajos activos para esta fecha.</p>
          )}

          {!cargando && filas.length > 0 && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
                <StatCard etiqueta="Sites activos" valor={String(general.cantidad)} />
                <StatCard
                  etiqueta="Promedio de avance"
                  valor={general.promedio === null ? "—" : `${general.promedio}%`}
                />
                <StatCard
                  etiqueta="Al 100%"
                  valor={String(general.completados)}
                  resaltado="esmeralda"
                />
                <StatCard
                  etiqueta="Sin actualizar hoy"
                  valor={sinActualizar > 0 ? String(sinActualizar) : "0"}
                  resaltado={sinActualizar > 0 ? "ambar" : undefined}
                />
              </div>
              {sinAsignar > 0 && (
                <p className="text-xs text-slate-400 -mt-6 mb-8">
                  {sinAsignar} site{sinAsignar === 1 ? "" : "s"} sin lider programado esta fecha
                  (no cuentan en "Sin actualizar hoy").
                </p>
              )}

              <div className="mb-8">
                <h2 className="text-sm font-semibold text-slate-700 mb-3">Avance por zona</h2>
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="py-2 pr-4 font-medium">Zona</th>
                      <th className="py-2 pr-4 font-medium">Sites</th>
                      <th className="py-2 pr-4 font-medium">Promedio</th>
                      <th className="py-2 pr-4 font-medium">Al 100%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {zonas.map((zona) => {
                      const stats = calcularStats(filasPorZona[zona]);
                      return (
                        <tr key={zona} className="border-b border-slate-100 last:border-0">
                          <td className="py-2 pr-4 text-slate-700">{zona}</td>
                          <td className="py-2 pr-4 text-slate-700">{stats.cantidad}</td>
                          <td className="py-2 pr-4">
                            {stats.promedio === null ? (
                              <span className="text-slate-400">—</span>
                            ) : (
                              <span
                                className={
                                  "text-xs font-semibold " +
                                  (stats.promedio >= 100 ? "text-emerald-600" : "text-slate-600")
                                }
                              >
                                {stats.promedio}%
                              </span>
                            )}
                          </td>
                          <td className="py-2 pr-4 text-slate-700">{stats.completados}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div>
                <h2 className="text-sm font-semibold text-slate-700 mb-3">Avance por lider</h2>
                {liderIds.length === 0 ? (
                  <p className="text-sm text-slate-500">Nadie tiene sites programados esta fecha.</p>
                ) : (
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500">
                        <th className="py-2 pr-4 font-medium">Lider</th>
                        <th className="py-2 pr-4 font-medium">Sites</th>
                        <th className="py-2 pr-4 font-medium">Promedio</th>
                        <th className="py-2 pr-4 font-medium">Sin actualizar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {liderIds.map((liderId) => {
                        const filasLider = filasPorLider[liderId];
                        const stats = calcularStats(filasLider);
                        const sinActualizarLider = filasLider.filter((f) => !f.actualizado).length;
                        const nombre = filasLider[0].lider_nombre ?? filasLider[0].lider_email ?? "—";
                        return (
                          <tr key={liderId} className="border-b border-slate-100 last:border-0">
                            <td className="py-2 pr-4 text-slate-700">{nombre}</td>
                            <td className="py-2 pr-4 text-slate-700">{stats.cantidad}</td>
                            <td className="py-2 pr-4">
                              {stats.promedio === null ? (
                                <span className="text-slate-400">—</span>
                              ) : (
                                <span
                                  className={
                                    "text-xs font-semibold " +
                                    (stats.promedio >= 100 ? "text-emerald-600" : "text-slate-600")
                                  }
                                >
                                  {stats.promedio}%
                                </span>
                              )}
                            </td>
                            <td className="py-2 pr-4">
                              {sinActualizarLider > 0 ? (
                                <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                                  {sinActualizarLider}
                                </span>
                              ) : (
                                <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                                  0
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
