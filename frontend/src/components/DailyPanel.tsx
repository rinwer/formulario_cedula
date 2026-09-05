import { useEffect, useState } from "react";
import { fetchAutenticado } from "../lib/api";
import { Calendario, hoyIso } from "./Calendario";
import { AvanceDiarioAdmin, Disponibilidad, LiderLigero, SiteLigero } from "../types";

const API_URL = import.meta.env.VITE_API_URL ? "" : "http://localhost:8000";

export default function DailyPanel() {
  const [fecha, setFecha] = useState(hoyIso());
  const [filas, setFilas] = useState<AvanceDiarioAdmin[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [lideres, setLideres] = useState<LiderLigero[]>([]);
  const [noDisponibles, setNoDisponibles] = useState<Disponibilidad[]>([]);

  const [modoExport, setModoExport] = useState<"rango" | "site">("rango");
  const [exportDesde, setExportDesde] = useState(hoyIso());
  const [exportHasta, setExportHasta] = useState(hoyIso());
  const [exportLiderId, setExportLiderId] = useState("");
  const [sites, setSites] = useState<SiteLigero[]>([]);
  const [busquedaSite, setBusquedaSite] = useState("");
  const [exportando, setExportando] = useState(false);
  const [errorExport, setErrorExport] = useState<string | null>(null);

  useEffect(() => {
    fetchAutenticado(`${API_URL}/api/admin/lideres`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: LiderLigero[]) => setLideres(data))
      .catch(() => {
        // Si falla, se muestra el id del lider en vez del nombre; el
        // resto del panel sigue funcionando.
      });
    fetchAutenticado(`${API_URL}/api/admin/sites`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: SiteLigero[]) => setSites(data))
      .catch(() => {
        // Si falla, el buscador de "exportar historial de un site" queda
        // sin opciones; el resto del panel sigue funcionando.
      });
  }, []);

  const siteSeleccionado = sites.find(
    (s) => s.site.trim().toLowerCase() === busquedaSite.trim().toLowerCase()
  );

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

  const exportarExcel = async () => {
    if (modoExport === "site" && !siteSeleccionado) return;

    setErrorExport(null);
    setExportando(true);
    try {
      const parametros =
        modoExport === "site"
          ? new URLSearchParams({ trabajo_id: siteSeleccionado!.id })
          : new URLSearchParams({
              desde: exportDesde,
              hasta: exportHasta,
              ...(exportLiderId ? { lider_id: exportLiderId } : {}),
            });

      const res = await fetchAutenticado(
        `${API_URL}/api/admin/daily/exportar?${parametros.toString()}`
      );
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.detail ?? "Ocurrio un error al exportar.");
      }
      const blob = await res.blob();
      const disposicion = res.headers.get("Content-Disposition") ?? "";
      const nombreArchivo = disposicion.match(/filename="?([^"]+)"?/)?.[1] ?? "daily_export.xlsx";

      const url = URL.createObjectURL(blob);
      const enlace = document.createElement("a");
      enlace.href = url;
      enlace.download = nombreArchivo;
      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setErrorExport(err instanceof Error ? err.message : "Ocurrio un error al exportar.");
    } finally {
      setExportando(false);
    }
  };

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

      <div className="mb-6 pb-6 border-b border-slate-200">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="export-modo" className="block text-xs font-medium text-slate-500 mb-1">
              Exportar
            </label>
            <select
              id="export-modo"
              value={modoExport}
              onChange={(e) => setModoExport(e.target.value as "rango" | "site")}
              className="rounded-md border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-cobre-500"
            >
              <option value="rango">Rango de fechas</option>
              <option value="site">Historial completo de un site</option>
            </select>
          </div>

          {modoExport === "rango" ? (
            <>
              <div>
                <label
                  htmlFor="export-desde"
                  className="block text-xs font-medium text-slate-500 mb-1"
                >
                  Desde
                </label>
                <input
                  id="export-desde"
                  type="date"
                  value={exportDesde}
                  max={exportHasta}
                  onChange={(e) => setExportDesde(e.target.value)}
                  className="rounded-md border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-cobre-500"
                />
              </div>
              <div>
                <label
                  htmlFor="export-hasta"
                  className="block text-xs font-medium text-slate-500 mb-1"
                >
                  Hasta
                </label>
                <input
                  id="export-hasta"
                  type="date"
                  value={exportHasta}
                  min={exportDesde}
                  onChange={(e) => setExportHasta(e.target.value)}
                  className="rounded-md border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-cobre-500"
                />
              </div>
              <div>
                <label
                  htmlFor="export-lider"
                  className="block text-xs font-medium text-slate-500 mb-1"
                >
                  Lider
                </label>
                <select
                  id="export-lider"
                  value={exportLiderId}
                  onChange={(e) => setExportLiderId(e.target.value)}
                  className="rounded-md border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-cobre-500"
                >
                  <option value="">Todos los lideres</option>
                  {lideres
                    .filter((l) => l.activo)
                    .map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.nombre_completo}
                      </option>
                    ))}
                </select>
              </div>
            </>
          ) : (
            <div>
              <label
                htmlFor="export-site"
                className="block text-xs font-medium text-slate-500 mb-1"
              >
                Site
              </label>
              <input
                id="export-site"
                type="text"
                list="export-sites-disponibles"
                value={busquedaSite}
                onChange={(e) => setBusquedaSite(e.target.value)}
                placeholder="Buscar site por nombre..."
                className="rounded-md border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-cobre-500"
              />
              <datalist id="export-sites-disponibles">
                {sites.map((s) => (
                  <option key={s.id} value={s.site} />
                ))}
              </datalist>
            </div>
          )}

          <button
            type="button"
            onClick={exportarExcel}
            disabled={exportando || (modoExport === "site" && !siteSeleccionado)}
            className="text-sm text-white bg-cobre-600 hover:bg-cobre-700 disabled:bg-cobre-300 font-medium px-4 py-2 rounded-md whitespace-nowrap"
          >
            {exportando ? "Exportando..." : "Exportar a Excel"}
          </button>
        </div>
        {modoExport === "site" && (
          <p className="text-xs text-slate-400 mt-2">
            Exporta todo el historial de avances del site, sin importar la fecha.
          </p>
        )}
        {errorExport && <p className="text-sm text-red-600 mt-2">{errorExport}</p>}
      </div>

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
