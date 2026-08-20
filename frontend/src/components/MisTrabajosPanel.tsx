import { useEffect, useState } from "react";
import { TrabajoConActividades } from "../types";

const API_URL = import.meta.env.VITE_API_URL ? "" : "http://localhost:8000";

type Props = {
  accessToken: string;
};

export default function MisTrabajosPanel({ accessToken }: Props) {
  const [trabajos, setTrabajos] = useState<TrabajoConActividades[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargarMisTrabajos = async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/mis-trabajos`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error();
      const data: TrabajoConActividades[] = await res.json();
      setTrabajos(data);
    } catch {
      setError("No se pudo cargar tus trabajos asignados.");
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarMisTrabajos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="bg-white rounded-xl shadow-md p-5 sm:p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold text-slate-800">Mis trabajos asignados</h1>
        <button
          onClick={cargarMisTrabajos}
          disabled={cargando}
          className="text-sm text-blue-600 hover:text-blue-800 disabled:text-slate-400 font-medium"
        >
          {cargando ? "Actualizando..." : "Actualizar"}
        </button>
      </div>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {!error && trabajos.length === 0 && !cargando && (
        <p className="text-sm text-slate-500">Todavia no tienes trabajos asignados.</p>
      )}

      <div className="space-y-6">
        {trabajos.map((trabajo) => (
          <div key={trabajo.id} className="border border-slate-200 rounded-lg p-4">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-3">
              <span className="font-semibold text-slate-800">{trabajo.id_smp}</span>
              <span className="text-sm text-slate-600">Site: {trabajo.site}</span>
              <span className="text-sm text-slate-600">Zona: {trabajo.zona}</span>
            </div>

            {trabajo.actividades.length === 0 ? (
              <p className="text-sm text-slate-500">
                Todavia no se han cargado actividades para este site.
              </p>
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
                    </tr>
                  </thead>
                  <tbody>
                    {trabajo.actividades.map((actividad) => (
                      <tr key={actividad.id} className="border-b border-slate-100 last:border-0">
                        <td className="py-2 pr-4 text-slate-700">{actividad.actividad}</td>
                        <td className="py-2 pr-4 text-slate-700">{actividad.tipificacion}</td>
                        <td className="py-2 pr-4 text-slate-700">{actividad.hw_actividad}</td>
                        <td className="py-2 pr-4 text-slate-700">{actividad.qty}</td>
                        <td className="py-2 pr-4 text-slate-700">{actividad.avance}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
