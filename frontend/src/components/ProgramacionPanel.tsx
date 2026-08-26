import { useEffect, useState } from "react";
import { Calendario, hoyIso } from "./Calendario";
import { AvanceDiarioAdmin, Usuario } from "../types";

const API_URL = import.meta.env.VITE_API_URL ? "" : "http://localhost:8000";

function mananaIso(): string {
  const hoy = new Date(`${hoyIso()}T00:00:00`);
  hoy.setDate(hoy.getDate() + 1);
  const anio = hoy.getFullYear();
  const mes = String(hoy.getMonth() + 1).padStart(2, "0");
  const dia = String(hoy.getDate()).padStart(2, "0");
  return `${anio}-${mes}-${dia}`;
}

type Props = {
  accessToken: string;
};

export default function ProgramacionPanel({ accessToken }: Props) {
  const [fecha, setFecha] = useState(mananaIso());
  const [filas, setFilas] = useState<AvanceDiarioAdmin[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [lideres, setLideres] = useState<Usuario[]>([]);
  const [guardandoTrabajoId, setGuardandoTrabajoId] = useState<string | null>(null);
  const [errorAsignacion, setErrorAsignacion] = useState<string | null>(null);

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
      // Si falla, el selector de lider queda vacio; el resto del panel
      // sigue funcionando.
    }
  };

  const cargar = async (fechaConsulta: string) => {
    setCargando(true);
    setError(null);
    try {
      const parametros = new URLSearchParams({ fecha: fechaConsulta });
      const res = await fetch(`${API_URL}/api/admin/programacion?${parametros.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error();
      const data: AvanceDiarioAdmin[] = await res.json();
      setFilas(data);
    } catch {
      setError("No se pudo cargar la programacion de ese dia.");
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarLideres();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    cargar(fecha);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fecha]);

  const asignarLider = async (trabajoId: string, liderId: string) => {
    if (!liderId) return;
    setErrorAsignacion(null);
    setGuardandoTrabajoId(trabajoId);
    try {
      const res = await fetch(`${API_URL}/api/admin/programacion`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ trabajo_id: trabajoId, lider_id: liderId, fecha }),
      });

      if (res.ok) {
        const actualizada: AvanceDiarioAdmin = await res.json();
        setFilas((prev) => prev.map((f) => (f.trabajo_id === trabajoId ? actualizada : f)));
      } else {
        const data = await res.json().catch(() => null);
        setErrorAsignacion(data?.detail ?? "Ocurrio un error al asignar el lider.");
      }
    } catch {
      setErrorAsignacion("No se pudo conectar con el servidor. Intenta de nuevo.");
    } finally {
      setGuardandoTrabajoId(null);
    }
  };

  const fechaFormateada = new Date(`${fecha}T00:00:00`).toLocaleDateString("es-CO", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="bg-white rounded-xl shadow-md p-5 sm:p-8">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-lg font-semibold text-slate-800">Programacion</h1>
        <button
          onClick={() => cargar(fecha)}
          disabled={cargando}
          className="text-sm text-blue-600 hover:text-blue-800 disabled:text-slate-400 font-medium"
        >
          {cargando ? "Actualizando..." : "Actualizar"}
        </button>
      </div>
      <p className="text-sm text-slate-500 mb-6 capitalize">{fechaFormateada}</p>

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="w-full lg:w-64 shrink-0">
          <Calendario fechaSeleccionada={fecha} onSeleccionar={setFecha} />
          <p className="text-xs text-slate-400 mt-2">
            Por defecto muestra el dia siguiente a hoy, para programar el trabajo de manana.
          </p>
        </div>

        <div className="flex-1 overflow-x-auto">
          {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
          {errorAsignacion && <p className="text-sm text-red-600 mb-4">{errorAsignacion}</p>}

          {!cargando && !error && filas.length === 0 && (
            <p className="text-sm text-slate-500">No hay trabajos activos para programar.</p>
          )}

          {filas.length > 0 && (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-4 font-medium">Site</th>
                  <th className="py-2 pr-4 font-medium">Zona</th>
                  <th className="py-2 pr-4 font-medium">Lider de cuadrilla</th>
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
                    className="border-b border-slate-100 last:border-0 align-top"
                  >
                    <td className="py-2 pr-4 text-slate-700">{fila.site}</td>
                    <td className="py-2 pr-4 text-slate-700">{fila.zona}</td>
                    <td className="py-2 pr-4">
                      <select
                        value={fila.lider_id ?? ""}
                        onChange={(e) => asignarLider(fila.trabajo_id, e.target.value)}
                        disabled={guardandoTrabajoId === fila.trabajo_id}
                        className="rounded-md border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Sin asignar</option>
                        {fila.lider_id &&
                          !lideresHabilitados.some((l) => l.id === fila.lider_id) && (
                            <option value={fila.lider_id}>
                              {fila.lider_nombre ?? fila.lider_email} (deshabilitado)
                            </option>
                          )}
                        {lideresHabilitados.map((lider) => (
                          <option key={lider.id} value={lider.id}>
                            {lider.nombre_completo}
                          </option>
                        ))}
                      </select>
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
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
