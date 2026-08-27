import { useEffect, useState } from "react";
import { fetchAutenticado } from "../lib/api";
import { Calendario, hoyIso } from "./Calendario";
import { AvanceDiarioAdmin } from "../types";

const API_URL = import.meta.env.VITE_API_URL ? "" : "http://localhost:8000";

export default function DailyPanel() {
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
        `${API_URL}/api/admin/avances-diarios?${parametros.toString()}`
      );
      if (!res.ok) throw new Error();
      const data: AvanceDiarioAdmin[] = await res.json();
      setFilas(data);
    } catch {
      setError("No se pudo cargar la informacion del dia.");
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

  return (
    <div className="bg-zinc-800 rounded-xl shadow-md p-5 sm:p-8">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-lg font-semibold text-zinc-50">Daily</h1>
        <button
          onClick={() => cargar(fecha)}
          disabled={cargando}
          className="text-sm text-cobre-500 hover:text-cobre-300 disabled:text-zinc-600 font-medium"
        >
          {cargando ? "Actualizando..." : "Actualizar"}
        </button>
      </div>
      <p className="text-sm text-zinc-400 mb-6 capitalize">{fechaFormateada}</p>

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="w-full lg:w-64 shrink-0">
          <Calendario fechaSeleccionada={fecha} onSeleccionar={setFecha} />
        </div>

        <div className="flex-1 overflow-x-auto">
          {error && <p className="text-sm text-red-400 mb-4">{error}</p>}

          {!cargando && !error && filas.length === 0 && (
            <p className="text-sm text-zinc-400">No hay trabajos asignados.</p>
          )}

          {filas.length > 0 && (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-700 text-zinc-400">
                  <th className="py-2 pr-4 font-medium">Site</th>
                  <th className="py-2 pr-4 font-medium">Lider</th>
                  <th className="py-2 pr-4 font-medium">Actualizo</th>
                  <th className="py-2 pr-4 font-medium">% Avance</th>
                  <th className="py-2 pr-4 font-medium">Avance del dia</th>
                  <th className="py-2 pr-4 font-medium">Comentario</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((fila) => (
                  <tr
                    key={fila.trabajo_id}
                    className="border-b border-zinc-800 last:border-0 align-top"
                  >
                    <td className="py-2 pr-4 text-zinc-200">{fila.site}</td>
                    <td className="py-2 pr-4 text-zinc-200">
                      {fila.lider_nombre ?? fila.lider_email ?? "—"}
                    </td>
                    <td className="py-2 pr-4">
                      <span
                        className={
                          "inline-block px-2 py-0.5 rounded-full text-xs font-medium " +
                          (fila.actualizado
                            ? "bg-emerald-950 text-emerald-400"
                            : "bg-amber-950 text-amber-400")
                        }
                      >
                        {fila.actualizado ? "Actualizado" : "Sin actualizar"}
                      </span>
                    </td>
                    <td className="py-2 pr-4">
                      {fila.porcentaje_avance === null ? (
                        <span className="text-zinc-500">—</span>
                      ) : (
                        <span
                          className={
                            "text-xs font-semibold " +
                            (fila.porcentaje_avance >= 100 ? "text-emerald-400" : "text-zinc-400")
                          }
                        >
                          {fila.porcentaje_avance}%
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-xs text-zinc-400">
                      {fila.detalle.length === 0
                        ? "—"
                        : fila.detalle
                            .map((d) => `${d.hw_actividad ?? d.actividad ?? "—"}: ${d.cantidad}`)
                            .join(" · ")}
                    </td>
                    <td className="py-2 pr-4 text-zinc-200">
                      {fila.comentarios.length === 0 ? "—" : fila.comentarios.join(" | ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
