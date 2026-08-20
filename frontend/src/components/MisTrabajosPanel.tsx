import { useEffect, useState } from "react";
import { AvanceDiario, TrabajoConActividades } from "../types";

const API_URL = import.meta.env.VITE_API_URL ? "" : "http://localhost:8000";

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

type MensajeState = { type: "success" | "error"; text: string } | null;

type TrabajoCardProps = {
  trabajo: TrabajoConActividades;
  accessToken: string;
};

function TrabajoCard({ trabajo, accessToken }: TrabajoCardProps) {
  const [avances, setAvances] = useState<Record<string, string>>({});
  const [comentario, setComentario] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<MensajeState>(null);

  const [historial, setHistorial] = useState<AvanceDiario[]>([]);
  const [cargandoHistorial, setCargandoHistorial] = useState(false);

  const nombresActividad: Record<string, string> = {};
  trabajo.actividades.forEach((a) => {
    nombresActividad[a.id] = a.actividad ?? "(sin nombre)";
  });

  const cargarHistorial = async () => {
    setCargandoHistorial(true);
    try {
      const res = await fetch(`${API_URL}/api/mis-trabajos/${trabajo.id}/avances`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error();
      const data: AvanceDiario[] = await res.json();
      setHistorial(data);
    } catch {
      // El historial es informativo; si falla no bloquea el registro de hoy.
    } finally {
      setCargandoHistorial(false);
    }
  };

  useEffect(() => {
    cargarHistorial();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleGuardar = async () => {
    const detalles = Object.entries(avances)
      .filter(([, valor]) => valor.trim() !== "")
      .map(([actividad_id, valor]) => ({ actividad_id, cantidad: Number(valor) }));

    const comentarioLimpio = comentario.trim();

    if (detalles.some((d) => !Number.isFinite(d.cantidad) || d.cantidad < 0)) {
      setMensaje({ type: "error", text: "El avance debe ser un numero valido (0 o mas)." });
      return;
    }

    if (detalles.length === 0 && !comentarioLimpio) {
      setMensaje({ type: "error", text: "Ingresa al menos un avance o un comentario." });
      return;
    }

    setMensaje(null);
    setGuardando(true);
    try {
      const res = await fetch(`${API_URL}/api/mis-trabajos/${trabajo.id}/avances`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ comentario: comentarioLimpio || null, detalles }),
      });

      if (res.ok) {
        const nuevo: AvanceDiario = await res.json();
        setHistorial((prev) => [nuevo, ...prev]);
        setAvances({});
        setComentario("");
        setMensaje({ type: "success", text: "Avance guardado con exito." });
      } else {
        const data = await res.json().catch(() => null);
        setMensaje({
          type: "error",
          text: data?.detail ?? "Ocurrio un error al guardar el avance.",
        });
      }
    } catch {
      setMensaje({ type: "error", text: "No se pudo conectar con el servidor. Intenta de nuevo." });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="border border-slate-200 rounded-lg p-4">
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
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-4 font-medium">Actividad</th>
                  <th className="py-2 pr-4 font-medium">Tipificacion</th>
                  <th className="py-2 pr-4 font-medium">HW-Actividad</th>
                  <th className="py-2 pr-4 font-medium">Qty</th>
                  <th className="py-2 pr-4 font-medium">Avance</th>
                  <th className="py-2 pr-4 font-medium">Avance de hoy</th>
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
                    <td className="py-2 pr-4">
                      <input
                        type="number"
                        min={0}
                        inputMode="numeric"
                        value={avances[actividad.id] ?? ""}
                        onChange={(e) =>
                          setAvances((prev) => ({ ...prev, [actividad.id]: e.target.value }))
                        }
                        className="w-20 rounded-md border border-slate-300 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="0"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4">
            <label
              htmlFor={`comentario-${trabajo.id}`}
              className="block text-sm font-medium text-slate-700 mb-1"
            >
              Comentario del avance de hoy
            </label>
            <textarea
              id={`comentario-${trabajo.id}`}
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Describe lo que realmente se avanzo hoy..."
            />

            {mensaje && (
              <p
                className={
                  "text-sm mt-2 " + (mensaje.type === "success" ? "text-green-600" : "text-red-600")
                }
              >
                {mensaje.text}
              </p>
            )}

            <button
              onClick={handleGuardar}
              disabled={guardando}
              className="mt-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-medium px-4 py-2 rounded-md transition-colors"
            >
              {guardando ? "Guardando..." : "Guardar avance de hoy"}
            </button>
          </div>

          <div className="mt-5 pt-4 border-t border-slate-200">
            <h3 className="text-sm font-semibold text-slate-700 mb-2">Historial de avances</h3>
            {cargandoHistorial && <p className="text-sm text-slate-500">Cargando...</p>}
            {!cargandoHistorial && historial.length === 0 && (
              <p className="text-sm text-slate-500">Todavia no hay avances registrados.</p>
            )}
            <ul className="space-y-2">
              {historial.map((avance) => (
                <li key={avance.id} className="text-sm text-slate-600 border-b border-slate-100 pb-2">
                  <span className="font-medium text-slate-700">
                    {formatearFecha(avance.created_at)}
                  </span>
                  {avance.comentario && <p className="mt-0.5">{avance.comentario}</p>}
                  {avance.detalles.length > 0 && (
                    <p className="mt-0.5 text-xs text-slate-500">
                      {avance.detalles
                        .map((d) => `${nombresActividad[d.actividad_id] ?? d.actividad_id}: ${d.cantidad}`)
                        .join(" · ")}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

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
          <TrabajoCard key={trabajo.id} trabajo={trabajo} accessToken={accessToken} />
        ))}
      </div>
    </div>
  );
}
