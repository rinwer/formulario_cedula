import { useEffect, useState } from "react";
import { fetchAutenticado } from "../lib/api";
import { Calendario, hoyIso } from "./Calendario";
import { AvanceDiarioAdmin } from "../types";

const API_URL = import.meta.env.VITE_API_URL ? "" : "http://localhost:8000";

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
      const res = await fetchAutenticado(`${API_URL}/api/admin/programacion?${parametros.toString()}`);
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

          {!cargando && !error && filasLiderOrdenadas.length === 0 && (
            <p className="text-sm text-slate-500">Nadie tiene sites programados esta fecha.</p>
          )}

          {filasLiderOrdenadas.length > 0 && (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-4 font-medium">Lider</th>
                  <th className="py-2 pr-4 font-medium">Site actual</th>
                  <th className="py-2 pr-4 font-medium">Dias en el sitio</th>
                </tr>
              </thead>
              <tbody>
                {filasLiderOrdenadas.map((fila) => (
                  <tr key={fila.trabajo_id} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 pr-4 text-slate-700">
                      {fila.lider_nombre ?? fila.lider_email ?? "—"}
                    </td>
                    <td className="py-2 pr-4 text-slate-700">{fila.site}</td>
                    <td className="py-2 pr-4 text-slate-700">
                      {fila.dias_en_sitio === null
                        ? "—"
                        : `${fila.dias_en_sitio} dia${fila.dias_en_sitio === 1 ? "" : "s"}`}
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
