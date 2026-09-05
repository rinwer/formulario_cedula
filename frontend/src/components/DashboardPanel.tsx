import { useEffect, useState } from "react";
import { fetchAutenticado } from "../lib/api";
import { Calendario, hoyIso } from "./Calendario";
import { AvanceDiarioAdmin, TendenciaSite } from "../types";

const API_URL = import.meta.env.VITE_API_URL ? "" : "http://localhost:8000";

function sumarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + dias);
  const anio = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${anio}-${mes}-${dia}`;
}

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

type Direccion = "normal" | "invertida";

// "normal": subir es bueno (promedio de avance, sites al 100%).
// "invertida": bajar es bueno (sites sin actualizar).
function Delta({
  actual,
  anterior,
  direccion = "normal",
  sufijo = "",
}: {
  actual: number;
  anterior: number | null;
  direccion?: Direccion;
  sufijo?: string;
}) {
  if (anterior === null) return null;
  const diferencia = actual - anterior;
  if (diferencia === 0) {
    return <p className="text-xs text-slate-400 mt-1.5">Igual que ayer</p>;
  }
  const esBueno = direccion === "normal" ? diferencia > 0 : diferencia < 0;
  const color = esBueno ? "text-emerald-600" : "text-red-600";
  const flecha = diferencia > 0 ? "▲" : "▼";
  return (
    <p className={"text-xs mt-1.5 " + color}>
      {flecha} {Math.abs(diferencia)}
      {sufijo} vs ayer
    </p>
  );
}

type StatCardProps = {
  etiqueta: string;
  valor: string;
  resaltado?: "ambar" | "esmeralda";
  delta?: React.ReactNode;
};

function StatCard({ etiqueta, valor, resaltado, delta }: StatCardProps) {
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
      {delta}
    </div>
  );
}

type EstadoRitmo = "verde" | "ambar" | "rojo";

const ESTADO_DOT: Record<EstadoRitmo, string> = {
  verde: "bg-emerald-500",
  ambar: "bg-amber-500",
  rojo: "bg-red-500",
};

const ESTADO_STROKE: Record<EstadoRitmo, string> = {
  verde: "#059669",
  ambar: "#b45309",
  rojo: "#b91c1c",
};

function calcularEstadoRitmo(actualizado: boolean, serie: TendenciaSite | undefined): EstadoRitmo {
  const valores = (serie?.serie ?? [])
    .map((p) => p.porcentaje)
    .filter((p): p is number => p !== null);
  const ultimoValor = valores.length > 0 ? valores[valores.length - 1] : null;

  if (valores.length >= 3) {
    const ultimosTres = valores.slice(-3);
    const sinCambio = ultimosTres.every((v) => v === ultimosTres[0]);
    if (sinCambio && (ultimoValor ?? 0) < 100) return "rojo";
  }
  if (!actualizado) return "ambar";
  return "verde";
}

// Sparkline en escala fija 0-100% (no autoescalado): asi una linea plana
// en 20% y una en 90% no se ven igual de "activas" solo por el rango de
// datos que les toco.
function Sparkline({ serie, color }: { serie: TendenciaSite | undefined; color: string }) {
  const valores = (serie?.serie ?? [])
    .map((p) => p.porcentaje)
    .filter((p): p is number => p !== null);

  if (valores.length < 2) {
    return (
      <svg width="72" height="24" viewBox="0 0 72 24" fill="none">
        <line x1="0" y1="20" x2="72" y2="20" stroke="#e2e8f0" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  const paso = 72 / (valores.length - 1);
  const puntos = valores.map((v, i) => `${i * paso},${22 - (v / 100) * 20}`).join(" ");

  return (
    <svg width="72" height="24" viewBox="0 0 72 24" fill="none">
      <polyline points={puntos} stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function DashboardPanel() {
  const [fecha, setFecha] = useState(hoyIso());
  const [filas, setFilas] = useState<AvanceDiarioAdmin[]>([]);
  const [filasAyer, setFilasAyer] = useState<AvanceDiarioAdmin[] | null>(null);
  const [tendencias, setTendencias] = useState<Record<string, TendenciaSite>>({});
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = async (fechaConsulta: string) => {
    setCargando(true);
    setError(null);
    try {
      const [resHoy, resAyer] = await Promise.all([
        fetchAutenticado(
          `${API_URL}/api/admin/programacion?${new URLSearchParams({ fecha: fechaConsulta })}`
        ),
        fetchAutenticado(
          `${API_URL}/api/admin/programacion?${new URLSearchParams({
            fecha: sumarDias(fechaConsulta, -1),
          })}`
        ),
      ]);
      if (!resHoy.ok) throw new Error();
      const data: AvanceDiarioAdmin[] = await resHoy.json();
      setFilas(data);
      setFilasAyer(resAyer.ok ? await resAyer.json() : null);

      const idsConLider = data.filter((f) => f.lider_id).map((f) => f.trabajo_id);
      if (idsConLider.length > 0) {
        const parametrosTendencia = new URLSearchParams({
          trabajo_ids: idsConLider.join(","),
          hasta: fechaConsulta,
          dias: "10",
        });
        const resTendencias = await fetchAutenticado(
          `${API_URL}/api/admin/dashboard/tendencias?${parametrosTendencia.toString()}`
        );
        if (resTendencias.ok) {
          const data: TendenciaSite[] = await resTendencias.json();
          setTendencias(Object.fromEntries(data.map((t) => [t.trabajo_id, t])));
        } else {
          setTendencias({});
        }
      } else {
        setTendencias({});
      }
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

  const generalAyer = filasAyer ? calcularStats(filasAyer) : null;
  const sinActualizarAyer = filasAyer
    ? filasAyer.filter((f) => f.lider_id && !f.actualizado).length
    : null;

  // Agrupado por zona: todos los sites activos de la fecha, la tengan o
  // no asignada a un lider ese dia.
  const filasPorZona: Record<string, AvanceDiarioAdmin[]> = {};
  filas.forEach((f) => {
    (filasPorZona[f.zona] ??= []).push(f);
  });
  const zonas = Object.keys(filasPorZona).sort((a, b) => a.localeCompare(b));

  // Una fila por site (no agregado por lider): la mayoria de lideres solo
  // tiene un site asignado por dia, asi que el promedio agregado ocultaba
  // el nombre del site. Ordenado por lider y luego por site.
  const filasLiderOrdenadas = [...filasConLider].sort((a, b) => {
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
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-1">
                <StatCard
                  etiqueta="Sites activos"
                  valor={String(general.cantidad)}
                  delta={
                    generalAyer && (
                      <Delta actual={general.cantidad} anterior={generalAyer.cantidad} />
                    )
                  }
                />
                <StatCard
                  etiqueta="Promedio de avance"
                  valor={general.promedio === null ? "—" : `${general.promedio}%`}
                  delta={
                    generalAyer && general.promedio !== null && (
                      <Delta actual={general.promedio} anterior={generalAyer.promedio} sufijo=" pts" />
                    )
                  }
                />
                <StatCard
                  etiqueta="Al 100%"
                  valor={String(general.completados)}
                  resaltado="esmeralda"
                  delta={
                    generalAyer && (
                      <Delta actual={general.completados} anterior={generalAyer.completados} />
                    )
                  }
                />
                <StatCard
                  etiqueta="Sin actualizar hoy"
                  valor={sinActualizar > 0 ? String(sinActualizar) : "0"}
                  resaltado={sinActualizar > 0 ? "ambar" : undefined}
                  delta={
                    sinActualizarAyer !== null && (
                      <Delta actual={sinActualizar} anterior={sinActualizarAyer} direccion="invertida" />
                    )
                  }
                />
              </div>
              {sinAsignar > 0 && (
                <p className="text-xs text-slate-400 mt-3 mb-8">
                  {sinAsignar} site{sinAsignar === 1 ? "" : "s"} sin lider programado esta fecha
                  (no cuentan en "Sin actualizar hoy").
                </p>
              )}

              <div className={sinAsignar > 0 ? "mb-8" : "mt-8 mb-8"}>
                <h2 className="text-sm font-semibold text-slate-700 mb-3">Avance por zona</h2>
                <div className="flex flex-col gap-2.5">
                  {zonas.map((zona) => {
                    const stats = calcularStats(filasPorZona[zona]);
                    const promedio = stats.promedio ?? 0;
                    const colorBarra =
                      promedio >= 100 ? "bg-emerald-600" : promedio >= 60 ? "bg-cobre-600" : "bg-slate-300";
                    return (
                      <div key={zona} className="flex items-center gap-4">
                        <span className="w-20 shrink-0 text-sm text-slate-700">{zona}</span>
                        <div className="flex-1 h-3.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={"h-full rounded-full " + colorBarra}
                            style={{ width: `${Math.min(promedio, 100)}%` }}
                          />
                        </div>
                        <span className="w-48 shrink-0 text-xs text-slate-500 text-right">
                          {stats.promedio === null ? "—" : `${stats.promedio}%`} &middot; {stats.cantidad}{" "}
                          site{stats.cantidad === 1 ? "" : "s"} &middot; {stats.completados} al 100%
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <h2 className="text-sm font-semibold text-slate-700 mb-3">Avance por lider</h2>
                {filasLiderOrdenadas.length === 0 ? (
                  <p className="text-sm text-slate-500">Nadie tiene sites programados esta fecha.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {filasLiderOrdenadas.map((fila) => {
                      const serie = tendencias[fila.trabajo_id];
                      const estado = calcularEstadoRitmo(fila.actualizado, serie);
                      return (
                        <div
                          key={fila.trabajo_id}
                          className="border border-slate-200 rounded-lg p-4"
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span className={"w-1.5 h-1.5 rounded-full shrink-0 " + ESTADO_DOT[estado]} />
                            <span className="text-sm font-semibold text-slate-800 truncate">
                              {fila.lider_nombre ?? fila.lider_email ?? "—"}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 mb-0.5 truncate">{fila.site}</p>
                          <p className="text-[11px] text-slate-400 mb-2.5">
                            {fila.dias_en_sitio === null
                              ? "—"
                              : `${fila.dias_en_sitio} dia${fila.dias_en_sitio === 1 ? "" : "s"} en el sitio`}
                            {estado === "rojo" && (
                              <span className="text-red-700 font-medium"> &middot; estancado</span>
                            )}
                          </p>
                          <div className="flex items-end justify-between">
                            <Sparkline serie={serie} color={ESTADO_STROKE[estado]} />
                            {fila.porcentaje_avance === null ? (
                              <span className="text-lg font-semibold text-slate-400">—</span>
                            ) : (
                              <span
                                className={
                                  "text-lg font-semibold " +
                                  (fila.porcentaje_avance >= 100 ? "text-emerald-600" : "text-slate-800")
                                }
                              >
                                {fila.porcentaje_avance}%
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
