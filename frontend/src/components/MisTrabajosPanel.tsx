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

function qtyNumerico(qty: string | null): number | null {
  if (qty === null || qty.trim() === "") return null;
  const valor = Number(qty);
  return Number.isFinite(valor) ? valor : null;
}

type TrabajoCardProps = {
  trabajo: TrabajoConActividades;
  accessToken: string;
};

function TrabajoCard({ trabajo, accessToken }: TrabajoCardProps) {
  const [expandido, setExpandido] = useState(false);

  const [avances, setAvances] = useState<Record<string, string>>({});
  const [comentario, setComentario] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<MensajeState>(null);

  const [historial, setHistorial] = useState<AvanceDiario[]>([]);
  const [cargandoHistorial, setCargandoHistorial] = useState(false);

  const hwActividadPorId: Record<string, string> = {};
  trabajo.actividades.forEach((a) => {
    hwActividadPorId[a.id] = a.hw_actividad ?? "(sin HW-Actividad)";
  });

  const acumuladoPorActividad: Record<string, number> = {};
  historial.forEach((avance) => {
    avance.detalles.forEach((d) => {
      acumuladoPorActividad[d.actividad_id] = (acumuladoPorActividad[d.actividad_id] ?? 0) + d.cantidad;
    });
  });

  const actividadesCompletas = new Set(
    trabajo.actividades
      .filter((a) => {
        const qtyMax = qtyNumerico(a.qty);
        const acumulado = acumuladoPorActividad[a.id] ?? 0;
        return qtyMax !== null && acumulado >= qtyMax;
      })
      .map((a) => a.id)
  );

  // Cuanto le falta a cada actividad (qty - acumulado). null = sin qty
  // numerico, no se puede limitar.
  const pendientePorActividad: Record<string, number | null> = {};
  trabajo.actividades.forEach((a) => {
    const qtyMax = qtyNumerico(a.qty);
    const acumulado = acumuladoPorActividad[a.id] ?? 0;
    pendientePorActividad[a.id] = qtyMax !== null ? Math.max(qtyMax - acumulado, 0) : null;
  });

  const manejarCambioAvance = (actividadId: string, valorTexto: string) => {
    if (valorTexto.trim() === "") {
      setAvances((prev) => ({ ...prev, [actividadId]: "" }));
      return;
    }
    const numero = Number(valorTexto);
    if (!Number.isFinite(numero)) return;
    const tope = pendientePorActividad[actividadId];
    const acotado = Math.max(0, tope !== null ? Math.min(numero, tope) : numero);
    setAvances((prev) => ({ ...prev, [actividadId]: String(acotado) }));
  };

  // Agrupa por el nombre de la columna "Actividad" (ej: "1. PRE",
  // "2. Instalacion") para sacar el % de avance de cada grupo: suma el
  // qty y el acumulado de todas las filas (HW-Actividad) que comparten
  // ese nombre.
  const gruposPorActividad: Record<string, { qtyTotal: number; acumuladoTotal: number }> = {};
  trabajo.actividades.forEach((a) => {
    const qty = qtyNumerico(a.qty);
    if (qty === null) return;
    const nombre = a.actividad ?? "(sin nombre)";
    const acumulado = Math.min(acumuladoPorActividad[a.id] ?? 0, qty);
    if (!gruposPorActividad[nombre]) {
      gruposPorActividad[nombre] = { qtyTotal: 0, acumuladoTotal: 0 };
    }
    gruposPorActividad[nombre].qtyTotal += qty;
    gruposPorActividad[nombre].acumuladoTotal += acumulado;
  });

  // Porcentaje general del trabajo completo, para mostrar en el resumen
  // colapsado sin tener que desplegar la tarjeta.
  let qtyTotalGeneral = 0;
  let acumuladoTotalGeneral = 0;
  trabajo.actividades.forEach((a) => {
    const qty = qtyNumerico(a.qty);
    if (qty === null) return;
    qtyTotalGeneral += qty;
    acumuladoTotalGeneral += Math.min(acumuladoPorActividad[a.id] ?? 0, qty);
  });
  const porcentajeGeneral =
    qtyTotalGeneral > 0 ? Math.round((acumuladoTotalGeneral / qtyTotalGeneral) * 100) : null;

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
      .filter(([actividad_id, valor]) => valor.trim() !== "" && !actividadesCompletas.has(actividad_id))
      .map(([actividad_id, valor]) => ({ actividad_id, cantidad: Number(valor) }));

    const comentarioLimpio = comentario.trim();

    if (detalles.some((d) => !Number.isFinite(d.cantidad) || d.cantidad < 0)) {
      setMensaje({ type: "error", text: "El avance debe ser un numero valido (0 o mas)." });
      return;
    }

    const excedeLoPendiente = detalles.some((d) => {
      const tope = pendientePorActividad[d.actividad_id];
      return tope !== null && d.cantidad > tope;
    });
    if (excedeLoPendiente) {
      setMensaje({
        type: "error",
        text: "Un avance supera lo que falta por completar en esa actividad.",
      });
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
      <button
        type="button"
        onClick={() => setExpandido((v) => !v)}
        className="w-full flex flex-wrap items-center justify-between gap-3 text-left"
      >
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="font-semibold text-slate-800">{trabajo.id_smp}</span>
          <span className="text-sm text-slate-600">Site: {trabajo.site}</span>
          <span className="text-sm text-slate-600">Zona: {trabajo.zona}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {porcentajeGeneral !== null && (
            <span
              className={
                "text-xs font-semibold px-2 py-0.5 rounded-full " +
                (porcentajeGeneral >= 100
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-blue-100 text-blue-700")
              }
            >
              {porcentajeGeneral}% avance
            </span>
          )}
          <span
            className={"text-slate-400 transition-transform " + (expandido ? "rotate-180" : "")}
            aria-hidden
          >
            ▾
          </span>
        </div>
      </button>

      {expandido && (
        <div className="mt-4">
          {trabajo.actividades.length === 0 ? (
            <p className="text-sm text-slate-500">
              Todavia no se han cargado actividades para este site.
            </p>
          ) : (
            <>
              <div className="flex flex-col lg:flex-row items-start gap-4">
                <div className="w-full max-w-xs sm:w-56 shrink-0 border border-slate-200 rounded-lg p-3">
                  <h3 className="text-sm font-semibold text-slate-700 mb-2">Avance por actividad</h3>
                  {Object.keys(gruposPorActividad).length === 0 ? (
                    <p className="text-xs text-slate-400">
                      Ninguna actividad tiene un qty numerico para calcular el %.
                    </p>
                  ) : (
                    <ul className="space-y-3">
                      {Object.entries(gruposPorActividad).map(([nombre, grupo]) => {
                        const porcentaje =
                          grupo.qtyTotal > 0
                            ? Math.round((grupo.acumuladoTotal / grupo.qtyTotal) * 100)
                            : 0;
                        return (
                          <li key={nombre}>
                            <div className="flex justify-between text-xs text-slate-600 mb-1">
                              <span>{nombre}</span>
                              <span className="font-medium">{porcentaje}%</span>
                            </div>
                            <div className="h-1.5 w-full rounded-full bg-slate-100">
                              <div
                                className={
                                  "h-1.5 rounded-full " +
                                  (porcentaje >= 100 ? "bg-emerald-500" : "bg-blue-500")
                                }
                                style={{ width: `${Math.min(porcentaje, 100)}%` }}
                              />
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                <div className="overflow-x-auto flex-1">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500">
                        <th className="py-2 pr-4 font-medium">Actividad</th>
                        <th className="py-2 pr-4 font-medium">Tipificacion</th>
                        <th className="py-2 pr-4 font-medium">HW-Actividad</th>
                        <th className="py-2 pr-4 font-medium">Qty</th>
                        <th className="py-2 pr-4 font-medium">Avance</th>
                        <th className="py-2 pr-4 font-medium">Avance de hoy</th>
                        <th className="py-2 pr-4 font-medium">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trabajo.actividades.map((actividad) => {
                        const qtyMax = qtyNumerico(actividad.qty);
                        const acumulado = acumuladoPorActividad[actividad.id] ?? 0;
                        const completa = actividadesCompletas.has(actividad.id);
                        return (
                          <tr
                            key={actividad.id}
                            className={
                              "border-b border-slate-100 last:border-0 " +
                              (completa ? "bg-emerald-50/60" : "")
                            }
                          >
                            <td className="py-2 pr-4 text-slate-700">{actividad.actividad}</td>
                            <td className="py-2 pr-4 text-slate-700">{actividad.tipificacion}</td>
                            <td className="py-2 pr-4 text-slate-700">{actividad.hw_actividad}</td>
                            <td className="py-2 pr-4 text-slate-700">{actividad.qty}</td>
                            <td className="py-2 pr-4 text-slate-700">{actividad.avance}</td>
                            <td className="py-2 pr-4">
                              {completa ? (
                                <span className="inline-flex items-center gap-1 text-emerald-600 text-sm font-medium">
                                  <span aria-hidden>✓</span> {acumulado} reportado
                                </span>
                              ) : (
                                <input
                                  type="number"
                                  min={0}
                                  max={pendientePorActividad[actividad.id] ?? undefined}
                                  inputMode="numeric"
                                  value={avances[actividad.id] ?? ""}
                                  onChange={(e) => manejarCambioAvance(actividad.id, e.target.value)}
                                  className="w-20 rounded-md border border-slate-300 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  placeholder="0"
                                />
                              )}
                            </td>
                            <td className="py-2 pr-4">
                              {completa ? (
                                <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                                  Completado
                                </span>
                              ) : qtyMax !== null ? (
                                <span className="text-xs font-semibold text-red-600">
                                  Faltan {qtyMax - acumulado}
                                </span>
                              ) : null}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
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
                      "text-sm mt-2 " +
                      (mensaje.type === "success" ? "text-green-600" : "text-red-600")
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
                            .map(
                              (d) => `${hwActividadPorId[d.actividad_id] ?? d.actividad_id}: ${d.cantidad}`
                            )
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
