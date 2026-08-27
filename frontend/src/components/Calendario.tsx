import { useEffect, useState } from "react";

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

export function hoyIso(): string {
  // en-CA formatea como YYYY-MM-DD.
  return FORMATO_FECHA_COLOMBIA.format(new Date());
}

type CalendarioProps = {
  fechaSeleccionada: string;
  onSeleccionar: (fecha: string) => void;
  // Si se pasa, los dias anteriores a esta fecha quedan deshabilitados
  // (no se pueden seleccionar). Usado por Programacion, que es hacia
  // adelante: no tiene sentido "programar" un dia que ya paso.
  fechaMinima?: string;
};

export function Calendario({ fechaSeleccionada, onSeleccionar, fechaMinima }: CalendarioProps) {
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

  const estaDeshabilitado = (dia: number) => !!fechaMinima && formatearCelda(dia) < fechaMinima;

  const cambiarMes = (delta: number) =>
    setMesVisible(new Date(mesVisible.getFullYear(), mesVisible.getMonth() + delta, 1));

  // Si el mes anterior completo queda antes de fechaMinima, no tiene
  // caso dejar navegar hacia el (todos sus dias saldrian deshabilitados).
  const ultimoDiaMesAnteriorIso = (() => {
    const d = new Date(mesVisible.getFullYear(), mesVisible.getMonth(), 0);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")}`;
  })();
  const puedeIrMesAnterior = !fechaMinima || ultimoDiaMesAnteriorIso >= fechaMinima;

  return (
    <div className="border border-slate-200 rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={() => cambiarMes(-1)}
          disabled={!puedeIrMesAnterior}
          className="text-slate-500 hover:text-slate-800 disabled:text-slate-300 disabled:cursor-not-allowed px-2 py-1"
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
              onClick={() => {
                if (!estaDeshabilitado(dia)) onSeleccionar(formatearCelda(dia));
              }}
              disabled={estaDeshabilitado(dia)}
              className={
                "h-8 w-8 mx-auto rounded-full text-sm flex items-center justify-center transition-colors " +
                (estaDeshabilitado(dia)
                  ? "text-slate-300 cursor-not-allowed"
                  : esSeleccionado(dia)
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
