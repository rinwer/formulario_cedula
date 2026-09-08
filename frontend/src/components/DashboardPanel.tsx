import { useEffect, useState } from "react";
import { fetchAutenticado } from "../lib/api";
import { Calendario, hoyIso } from "./Calendario";
import { AvanceDiarioAdmin, HistorialSite } from "../types";

const API_URL = import.meta.env.VITE_API_URL ? "" : "http://localhost:8000";

export default function DashboardPanel() {
  const [fecha, setFecha] = useState(hoyIso());
  const [filas, setFilas] = useState<AvanceDiarioAdmin[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [historialPorLider, setHistorialPorLider] = useState<Record<string, HistorialSite[]>>({});
  const [errorHistorial, setErrorHistorial] = useState<string | null>(null);

  const cargar = async (fechaConsulta: string) => {
    setCargando(true);
    setError(null);
    setErrorHistorial(null);
    try {
      const parametros = new URLSearchParams({ fecha: fechaConsulta });
      const res = await fetchAutenticado(`${API_URL}/api/admin/programacion?${parametros.toString()}`);
      if (!res.ok) throw new Error();
      const data: AvanceDiarioAdmin[] = await res.json();
      setFilas(data);

      // El historial de cada lider se trae de una vez (en paralelo), para
      // mostrarlo siempre desplegado sin exigir un clic por lider.
      const liderIds = Array.from(
        new Set(data.filter((f) => f.lider_id).map((f) => f.lider_id as string))
      );
      const resultados = await Promise.all(
        liderIds.map(async (liderId): Promise<[string, HistorialSite[] | null]> => {
          try {
            const resHistorial = await fetchAutenticado(
              `${API_URL}/api/admin/dashboard/lider/${liderId}/historial`
            );
            if (!resHistorial.ok) throw new Error();
            return [liderId, await resHistorial.json()];
          } catch {
            return [liderId, null];
          }
        })
      );

      const nuevoHistorial: Record<string, HistorialSite[]> = {};
      let huboError = false;
      for (const [liderId, historial] of resultados) {
        if (historial) nuevoHistorial[liderId] = historial;
        else huboError = true;
      }
      setHistorialPorLider(nuevoHistorial);
      if (huboError) setErrorHistorial("No se pudo cargar el historial de algun lider.");
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

  // Una fila por lider (no por site): la mayoria de lideres solo tiene
  // un site asignado por dia. Ordenado por nombre.
  const filasLiderOrdenadas = [...filas]
    .filter((f) => f.lider_id)
    .sort((a, b) => {
      const nombreA = a.lider_nombre ?? a.lider_email ?? "";
      const nombreB = b.lider_nombre ?? b.lider_email ?? "";
      const cmpNombre = nombreA.localeCompare(nombreB);
      return cmpNombre !== 0 ? cmpNombre : a.site.localeCompare(b.site);
    });

  return (
    <div className="bg-white rounded-xl shadow-md p-5 sm:p-8">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-lg font-semibold text-slate-800">Dashboard</h1>
        <button
          onClick={() => cargar(fecha)}
          disabled={cargando}
          className="text-sm text-slate-600 hover:text-slate-800 disabled:text-slate-400 font-medium px-3 py-1.5 rounded-md border border-slate-300"
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
          {errorHistorial && <p className="text-sm text-red-600 mb-4">{errorHistorial}</p>}

          {!cargando && !error && filasLiderOrdenadas.length === 0 && (
            <p className="text-sm text-slate-500">Nadie tiene sites programados esta fecha.</p>
          )}

          {filasLiderOrdenadas.length > 0 && (
            <div className="flex flex-col divide-y divide-slate-100">
              {filasLiderOrdenadas.map((fila) => {
                const liderId = fila.lider_id as string;
                const historial = historialPorLider[liderId];
                return (
                  <div key={fila.trabajo_id} className="py-3">
                    <h3 className="font-medium text-slate-800 mb-2">
                      {fila.lider_nombre ?? fila.lider_email ?? "—"}
                    </h3>
                    {!historial ? (
                      <p className="text-xs text-slate-500">Sin datos.</p>
                    ) : historial.length === 0 ? (
                      <p className="text-xs text-slate-500">Todavia no tiene historial de sites.</p>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {(() => {
                          const maxDias = Math.max(...historial.map((h) => h.dias));
                          return historial.map((h, i) => (
                            <div key={i} className="flex items-center gap-3">
                              <span
                                className="w-36 shrink-0 text-xs text-slate-700 truncate"
                                title={`${h.site} (${h.zona})`}
                              >
                                {h.site}
                              </span>
                              <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
                                <div
                                  className={
                                    "h-full rounded-full " +
                                    (h.es_actual ? "bg-cobre-500" : "bg-slate-400")
                                  }
                                  style={{ width: `${(h.dias / maxDias) * 100}%` }}
                                />
                              </div>
                              <span className="w-16 shrink-0 text-xs text-slate-600 text-right">
                                {h.dias} dia{h.dias === 1 ? "" : "s"}
                              </span>
                              {h.es_actual && (
                                <span className="w-16 shrink-0 text-xs text-cobre-600 font-medium">
                                  en curso
                                </span>
                              )}
                            </div>
                          ));
                        })()}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
