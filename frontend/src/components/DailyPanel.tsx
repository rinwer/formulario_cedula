import { useEffect, useState } from "react";
import { AvanceDiarioAdmin } from "../types";

const API_URL = import.meta.env.VITE_API_URL ? "" : "http://localhost:8000";

const DIAS_SEMANA = ["D", "L", "M", "M", "J", "V", "S"];

// Colombia no tiene horario de verano (offset fijo -05:00). Se calcula
// "hoy" en esa zona horaria en vez de la del navegador que abre la
// pagina, para que coincida con lo que el backend considera "hoy".
const FORMATO_FECHA_COLOMBIA = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Bogota",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function hoyIso(): string {
  // en-CA formatea como YYYY-MM-DD.
  return FORMATO_FECHA_COLOMBIA.format(new Date());
}

type CalendarioProps = {
  fechaSeleccionada: string;
  onSeleccionar: (fecha: string) => void;
};

function Calendario({ fechaSeleccionada, onSeleccionar }: CalendarioProps) {
  const hoyIsoColombia = hoyIso();
  const fechaSel = new Date(`${fechaSeleccionada}T00:00:00`);
  const [mesVisible, setMesVisible] = useState(
    new Date(fechaSel.getFullYear(), fechaSel.getMonth(), 1)
  );

  useEffect(() => {
    setMesVisible(new Date(fechaSel.getFullYear(), fechaSel.getMonth(), 1));
    // Solo debe re-sincronizar cuando cambia la fecha seleccionada (por
    // ejemplo al hacer clic en "Ir a hoy"), no en cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fechaSeleccionada]);

  const primerDiaSemana = new Date(mesVisible.getFullYear(), mesVisible.getMonth(), 1).getDay();
  const diasEnMes = new Date(mesVisible.getFullYear(), mesVisible.getMonth() + 1, 0).getDate();

  const celdas: (number | null)[] = [];
  for (let i = 0; i < primerDiaSemana; i++) celdas.push(null);
  for (let dia = 1; dia <= diasEnMes; dia++) celdas.push(dia);

  const formatearCelda = (dia: number) => {
    const anio = mesVisible.getFullYear();
    const mes = String(mesVisible.getMonth() + 1).padStart(2, "0");
    return `${anio}-${mes}-${String(dia).padStart(2, "0")}`;
  };

  const esHoy = (dia: number) => formatearCelda(dia) === hoyIsoColombia;

  const esSeleccionado = (dia: number) => formatearCelda(dia) === fechaSeleccionada;

  const cambiarMes = (delta: number) =>
    setMesVisible(new Date(mesVisible.getFullYear(), mesVisible.getMonth() + delta, 1));

  return (
    <div className="border border-slate-200 rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={() => cambiarMes(-1)}
          className="text-slate-500 hover:text-slate-800 px-2 py-1"
          aria-label="Mes anterior"
        >
          ‹
        </button>
        <span className="text-sm font-semibold text-slate-700 capitalize">
          {mesVisible.toLocaleDateString("es-CO", { month: "long", year: "numeric" })}
        </span>
        <button
          onClick={() => cambiarMes(1)}
          className="text-slate-500 hover:text-slate-800 px-2 py-1"
          aria-label="Mes siguiente"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs text-slate-400 mb-1">
        {DIAS_SEMANA.map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {celdas.map((dia, i) =>
          dia === null ? (
            <span key={i} />
          ) : (
            <button
              key={i}
              onClick={() => onSeleccionar(formatearCelda(dia))}
              className={
                "h-8 w-8 mx-auto rounded-full text-sm flex items-center justify-center transition-colors " +
                (esSeleccionado(dia)
                  ? "bg-blue-600 text-white font-semibold"
                  : esHoy(dia)
                  ? "border-2 border-blue-500 text-blue-600 font-semibold"
                  : "text-slate-700 hover:bg-slate-100")
              }
            >
              {dia}
            </button>
          )
        )}
      </div>

      <button
        onClick={() => onSeleccionar(hoyIso())}
        className="mt-3 text-xs text-blue-600 hover:text-blue-800 font-medium"
      >
        Ir a hoy
      </button>
    </div>
  );
}

type Props = {
  accessToken: string;
};

export default function DailyPanel({ accessToken }: Props) {
  const [fecha, setFecha] = useState(hoyIso());
  const [filas, setFilas] = useState<AvanceDiarioAdmin[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = async (fechaConsulta: string) => {
    setCargando(true);
    setError(null);
    try {
      const parametros = new URLSearchParams({ fecha: fechaConsulta });
      const res = await fetch(`${API_URL}/api/admin/avances-diarios?${parametros.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
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
    <div className="bg-white rounded-xl shadow-md p-5 sm:p-8">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-lg font-semibold text-slate-800">Daily</h1>
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
        </div>

        <div className="flex-1 overflow-x-auto">
          {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

          {!cargando && !error && filas.length === 0 && (
            <p className="text-sm text-slate-500">No hay trabajos asignados.</p>
          )}

          {filas.length > 0 && (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-4 font-medium">Site</th>
                  <th className="py-2 pr-4 font-medium">Lider</th>
                  <th className="py-2 pr-4 font-medium">Actualizo</th>
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
