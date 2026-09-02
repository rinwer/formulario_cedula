import { useEffect, useState } from "react";
import { fetchAutenticado } from "../lib/api";
import { hoyIso } from "./Calendario";
import { LineaTiempoItem, Usuario } from "../types";

const API_URL = import.meta.env.VITE_API_URL ? "" : "http://localhost:8000";

const VENTANA_DIAS = 14;

const COLORES_SITE = [
  "bg-sky-100 text-sky-800",
  "bg-violet-100 text-violet-800",
  "bg-rose-100 text-rose-800",
  "bg-amber-100 text-amber-800",
  "bg-emerald-100 text-emerald-800",
  "bg-cyan-100 text-cyan-800",
  "bg-fuchsia-100 text-fuchsia-800",
  "bg-lime-100 text-lime-800",
  "bg-orange-100 text-orange-800",
  "bg-indigo-100 text-indigo-800",
];

function colorSite(site: string): string {
  let hash = 0;
  for (let i = 0; i < site.length; i++) hash = (hash * 31 + site.charCodeAt(i)) >>> 0;
  return COLORES_SITE[hash % COLORES_SITE.length];
}

function sumarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + dias);
  const anio = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${anio}-${mes}-${dia}`;
}

function listaDeDias(desde: string, hasta: string): string[] {
  const dias: string[] = [];
  let actual = desde;
  while (actual <= hasta) {
    dias.push(actual);
    actual = sumarDias(actual, 1);
  }
  return dias;
}

export default function GanttPanel() {
  const [hastaFecha, setHastaFecha] = useState(hoyIso());
  const desdeFecha = sumarDias(hastaFecha, -(VENTANA_DIAS - 1));
  const dias = listaDeDias(desdeFecha, hastaFecha);

  const [items, setItems] = useState<LineaTiempoItem[]>([]);
  const [lideres, setLideres] = useState<Usuario[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAutenticado(`${API_URL}/api/admin/usuarios`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: Usuario[]) => setLideres(data))
      .catch(() => {
        // Si falla, se muestra el id del lider en vez del nombre; el
        // resto del panel sigue funcionando.
      });
  }, []);

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    setError(null);
    const parametros = new URLSearchParams({ desde: desdeFecha, hasta: hastaFecha });
    fetchAutenticado(`${API_URL}/api/admin/linea-tiempo?${parametros.toString()}`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: LineaTiempoItem[]) => {
        if (!cancelado) setItems(data);
      })
      .catch(() => {
        if (!cancelado) setError("No se pudo cargar la linea de tiempo.");
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desdeFecha, hastaFecha]);

  const nombrePorLiderId: Record<string, string> = {};
  lideres.forEach((l) => {
    nombrePorLiderId[l.id] = l.nombre_completo || l.email;
  });

  // fecha+lider -> site, para pintar cada celda de la cuadricula.
  const sitePorLiderYFecha: Record<string, Record<string, { site: string; zona: string }>> = {};
  const liderIds = new Set<string>();
  items.forEach((item) => {
    liderIds.add(item.lider_id);
    (sitePorLiderYFecha[item.lider_id] ??= {})[item.fecha] = {
      site: item.site,
      zona: item.zona,
    };
  });

  const liderIdsOrdenados = Array.from(liderIds).sort((a, b) => {
    const nombreA = nombrePorLiderId[a] ?? a;
    const nombreB = nombrePorLiderId[b] ?? b;
    return nombreA.localeCompare(nombreB);
  });

  const formatearCabeceraDia = (iso: string) => {
    const d = new Date(`${iso}T00:00:00`);
    return {
      numero: d.getDate(),
      dia: d.toLocaleDateString("es-CO", { weekday: "short" }).slice(0, 1).toUpperCase(),
      esHoy: iso === hoyIso(),
    };
  };

  const rangoFormateado = `${new Date(`${desdeFecha}T00:00:00`).toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "short",
  })} — ${new Date(`${hastaFecha}T00:00:00`).toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })}`;

  return (
    <div className="bg-white rounded-xl shadow-md p-5 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
        <h1 className="text-lg font-semibold text-slate-800">Gantt</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setHastaFecha(sumarDias(hastaFecha, -VENTANA_DIAS))}
            className="text-sm text-cobre-600 hover:text-cobre-800 font-medium px-2 py-1"
          >
            ‹ 2 semanas
          </button>
          <button
            onClick={() => setHastaFecha(hoyIso())}
            className="text-sm text-slate-600 hover:text-slate-900 font-medium px-2 py-1"
          >
            Hoy
          </button>
          <button
            onClick={() => setHastaFecha(sumarDias(hastaFecha, VENTANA_DIAS))}
            className="text-sm text-cobre-600 hover:text-cobre-800 font-medium px-2 py-1"
          >
            2 semanas ›
          </button>
        </div>
      </div>
      <p className="text-sm text-slate-500 mb-6 capitalize">{rangoFormateado}</p>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {!cargando && !error && liderIdsOrdenados.length === 0 && (
        <p className="text-sm text-slate-500">No hay asignaciones registradas en este rango.</p>
      )}

      {liderIdsOrdenados.length > 0 && (
        <div className="overflow-x-auto">
          <table className="border-collapse text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 bg-white py-2 pr-4 text-left font-medium text-slate-500 whitespace-nowrap">
                  Lider
                </th>
                {dias.map((diaIso) => {
                  const { numero, dia, esHoy } = formatearCabeceraDia(diaIso);
                  return (
                    <th
                      key={diaIso}
                      className={
                        "px-1 pb-2 text-center font-medium w-[52px] " +
                        (esHoy ? "text-cobre-600" : "text-slate-400")
                      }
                    >
                      <div className="text-[10px] leading-tight">{dia}</div>
                      <div className={"text-xs " + (esHoy ? "font-bold" : "")}>{numero}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {liderIdsOrdenados.map((liderId) => (
                <tr key={liderId} className="border-t border-slate-100">
                  <td className="sticky left-0 bg-white py-1.5 pr-4 text-slate-700 font-medium whitespace-nowrap">
                    {nombrePorLiderId[liderId] ?? liderId}
                  </td>
                  {dias.map((diaIso) => {
                    const celda = sitePorLiderYFecha[liderId]?.[diaIso];
                    return (
                      <td key={diaIso} className="p-0.5 text-center align-middle">
                        {celda ? (
                          <div
                            title={`${celda.site} (${celda.zona})`}
                            className={
                              "h-7 rounded text-[9px] leading-7 font-medium truncate px-0.5 " +
                              colorSite(celda.site)
                            }
                          >
                            {celda.site}
                          </div>
                        ) : (
                          <div className="h-7" />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
