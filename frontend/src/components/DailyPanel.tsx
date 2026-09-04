import { useEffect, useState } from "react";
import { fetchAutenticado } from "../lib/api";
import { Calendario, hoyIso } from "./Calendario";
import { AvanceDiarioAdmin, Disponibilidad, LiderLigero } from "../types";

const API_URL = import.meta.env.VITE_API_URL ? "" : "http://localhost:8000";

export default function DailyPanel() {
  const [fecha, setFecha] = useState(hoyIso());
  const [filas, setFilas] = useState<AvanceDiarioAdmin[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [lideres, setLideres] = useState<LiderLigero[]>([]);
  const [noDisponibles, setNoDisponibles] = useState<Disponibilidad[]>([]);

  useEffect(() => {
    fetchAutenticado(`${API_URL}/api/admin/lideres`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: LiderLigero[]) => setLideres(data))
      .catch(() => {
        // Si falla, se muestra el id del lider en vez del nombre; el
        // resto del panel sigue funcionando.
      });
  }, []);

  const cargar = async (fechaConsulta: string) => {
    setCargando(true);
    setError(null);
    try {
      const parametros = new URLSearchParams({ fecha: fechaConsulta });
      const [resAvances, resDisponibilidad] = await Promise.all([
        fetchAutenticado(`${API_URL}/api/admin/avances-diarios?${parametros.toString()}`),
        fetchAutenticado(`${API_URL}/api/admin/disponibilidad?${parametros.toString()}`),
      ]);
      if (!resAvances.ok) throw new Error();
      const data: AvanceDiarioAdmin[] = await resAvances.json();
      setFilas(data);
      setNoDisponibles(resDisponibilidad.ok ? await resDisponibilidad.json() : []);
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

  const nombrePorLiderId: Record<string, string> = {};
  lideres.forEach((l) => {
    nombrePorLiderId[l.id] = l.nombre_completo;
  });

  const fechaFormateada = new Date(`${fecha}T00:00:00`).toLocaleDateString("es-CO", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const pendientes = filas.filter((fila) => !fila.actualizado).length;

  // Sin actualizar primero para que salten a la vista de inmediato; el
  // orden por site que ya trae el backend se conserva dentro de cada grupo.
  const filasOrdenadas = [...filas].sort((a, b) => {
    if (a.actualizado === b.actualizado) return 0;
    return a.actualizado ? 1 : -1;
  });

  return (
    <div className="bg-white rounded-xl shadow-md p-5 sm:p-8">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-lg font-semibold text-slate-800">Daily</h1>
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
            <p className="text-sm text-slate-500">No hay trabajos asignados.</p>
          )}

          {!cargando && filas.length > 0 && (
            <div
              className={
                "flex items-center gap-2 rounded-lg px-3 py-2 mb-4 text-sm font-medium " +
                (pendientes > 0
                  ? "bg-amber-50 text-amber-800 border border-amber-200"
                  : "bg-emerald-50 text-emerald-700 border border-emerald-200")
              }
            >
              {pendientes > 0
                ? `${pendientes} de ${filas.length} sites sin actualizar hoy`
                : `Todos los sites (${filas.length}) actualizaron hoy`}
            </div>
          )}

          {(filas.length > 0 || noDisponibles.length > 0) && (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-4 font-medium">Site</th>
                  <th className="py-2 pr-4 font-medium">Lider</th>
                  <th className="py-2 pr-4 font-medium">Actualizo</th>
                  <th className="py-2 pr-4 font-medium">% Avance</th>
                  <th className="py-2 pr-4 font-medium">Avance del dia</th>
                  <th className="py-2 pr-4 font-medium">Comentario</th>
                </tr>
              </thead>
              <tbody>
                {filasOrdenadas.map((fila) => (
                  <tr
                    key={fila.trabajo_id}
                    className={
                      "border-b border-slate-100 last:border-0 align-top " +
                      (!fila.actualizado ? "bg-amber-50/60" : "")
                    }
                  >
                    <td className="py-2 pr-4 text-slate-700">{fila.site}</td>
                    <td className="py-2 pr-4 text-slate-700">
                      {fila.lider_nombre ?? fila.lider_email ?? "—"}
                    </td>
                    <td className="py-2 pr-4">
                      <span
                        className={
                          "inline-block px-2 py-0.5 rounded-full text-xs font-medium " +
                          (fila.actualizado
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-amber-100 text-amber-700")
                        }
                      >
                        {fila.actualizado ? "Actualizado" : "Sin actualizar"}
                      </span>
                    </td>
                    <td className="py-2 pr-4">
                      {fila.porcentaje_avance === null ? (
                        <span className="text-slate-400">—</span>
                      ) : (
                        <span
                          className={
                            "text-xs font-semibold " +
                            (fila.porcentaje_avance >= 100 ? "text-emerald-600" : "text-slate-600")
                          }
                        >
                          {fila.porcentaje_avance}%
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-xs text-slate-600">
                      {fila.detalle.length === 0
                        ? "—"
                        : fila.detalle
                            .map((d) => `${d.hw_actividad ?? d.actividad ?? "—"}: ${d.cantidad}`)
                            .join(" · ")}
                    </td>
                    <td className="py-2 pr-4 text-slate-700">
                      {fila.comentarios.length === 0 ? "—" : fila.comentarios.join(" | ")}
                    </td>
                  </tr>
                ))}
                {noDisponibles.map((d) => (
                  <tr key={`no-disponible-${d.lider_id}`} className="border-b border-slate-100 last:border-0 align-top bg-slate-50">
                    <td className="py-2 pr-4 text-slate-400">—</td>
                    <td className="py-2 pr-4 text-slate-700">
                      {nombrePorLiderId[d.lider_id] ?? d.lider_id}
                    </td>
                    <td className="py-2 pr-4">
                      <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-slate-200 text-slate-600">
                        No disponible
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-slate-400">—</td>
                    <td className="py-2 pr-4 text-slate-400">—</td>
                    <td className="py-2 pr-4 text-slate-700">{d.motivo ?? "—"}</td>
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
