import { useEffect, useState } from "react";
import { fetchAutenticado } from "../lib/api";
import { Calendario, hoyIso } from "./Calendario";
import {
  ActividadAdmin,
  AvanceDiarioAdmin,
  CatalogoOpcion,
  Disponibilidad,
  LiderLigero,
  SiteLigero,
} from "../types";

const API_URL = import.meta.env.VITE_API_URL ? "" : "http://localhost:8000";

type ModalRetroactivoProps = {
  trabajoId: string;
  site: string;
  liderId: string;
  liderNombre: string;
  fecha: string;
  catalogoTipoTrabajo: CatalogoOpcion[];
  catalogoOfensor: CatalogoOpcion[];
  onCerrar: () => void;
  onGuardado: () => void;
};

// Formulario para que un coordinador/administrador registre, en nombre
// del lider, el avance de un dia YA PASADO que quedo "Sin actualizar"
// (tipicamente tras hablar con el lider por telefono). Nunca reemplaza
// el reporte del lider mismo dia: queda marcado como "diligenciado por"
// para que se note la diferencia en el Daily.
function ModalAvanceRetroactivo({
  trabajoId,
  site,
  liderId,
  liderNombre,
  fecha,
  catalogoTipoTrabajo,
  catalogoOfensor,
  onCerrar,
  onGuardado,
}: ModalRetroactivoProps) {
  const [actividades, setActividades] = useState<ActividadAdmin[]>([]);
  const [cargandoActividades, setCargandoActividades] = useState(true);
  const [avances, setAvances] = useState<Record<string, string>>({});
  const [comentario, setComentario] = useState("");
  const [tipoTrabajoId, setTipoTrabajoId] = useState("");
  const [ofensorId, setOfensorId] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  useEffect(() => {
    fetchAutenticado(`${API_URL}/api/admin/trabajos/${trabajoId}/actividades`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: ActividadAdmin[]) => setActividades(data.filter((a) => a.activo)))
      .catch(() => setMensaje("No se pudieron cargar las actividades de este site."))
      .finally(() => setCargandoActividades(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fechaFormateada = new Date(`${fecha}T00:00:00`).toLocaleDateString("es-CO", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const guardar = async () => {
    if (!tipoTrabajoId) {
      setMensaje("Selecciona el tipo de trabajo realizado ese dia.");
      return;
    }
    const detalles = Object.entries(avances)
      .filter(([, valor]) => valor.trim() !== "")
      .map(([actividad_id, valor]) => ({ actividad_id, cantidad: Number(valor) }));
    const comentarioLimpio = comentario.trim();
    if (detalles.some((d) => !Number.isFinite(d.cantidad) || d.cantidad < 0)) {
      setMensaje("El avance debe ser un numero valido (0 o mas).");
      return;
    }
    if (detalles.length === 0 && !comentarioLimpio) {
      setMensaje("Ingresa al menos un avance o un comentario.");
      return;
    }

    setMensaje(null);
    setGuardando(true);
    try {
      const res = await fetchAutenticado(
        `${API_URL}/api/admin/trabajos/${trabajoId}/avances-retroactivos`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fecha,
            lider_id: liderId,
            comentario: comentarioLimpio || null,
            detalles,
            ofensor_id: ofensorId || null,
            tipo_trabajo_id: tipoTrabajoId,
          }),
        }
      );
      if (res.ok) {
        onGuardado();
      } else {
        const data = await res.json().catch(() => null);
        setMensaje(data?.detail ?? "Ocurrio un error al guardar el avance.");
      }
    } catch {
      setMensaje("No se pudo conectar con el servidor. Intenta de nuevo.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-20">
      <div className="bg-white rounded-lg shadow-lg max-w-lg w-full p-5 sm:p-6 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-semibold text-slate-800">Registrar avance de {site}</h3>
          <button
            onClick={onCerrar}
            aria-label="Cerrar"
            className="text-slate-400 hover:text-slate-600 text-lg leading-none"
          >
            ✕
          </button>
        </div>
        <p className="text-xs text-slate-400 mb-4 capitalize">
          {liderNombre} · {fechaFormateada}. Este registro queda marcado como diligenciado por ti,
          no como un reporte del lider.
        </p>

        {cargandoActividades ? (
          <p className="text-sm text-slate-500 mb-3">Cargando actividades...</p>
        ) : actividades.length === 0 ? (
          <p className="text-sm text-slate-500 mb-3">
            Este site no tiene actividades activas para reportar avance.
          </p>
        ) : (
          <div className="flex flex-col gap-2 mb-4">
            {actividades.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between gap-2 border border-slate-200 rounded-md px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm text-slate-700 truncate">
                    {a.hw_actividad ?? a.actividad ?? "—"}
                  </p>
                  <p className="text-xs text-slate-400">Qty: {a.qty ?? "—"}</p>
                </div>
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={avances[a.id] ?? ""}
                  onChange={(e) =>
                    setAvances((prev) => ({ ...prev, [a.id]: e.target.value }))
                  }
                  className="w-20 rounded-md border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-cobre-500"
                  placeholder="0"
                />
              </div>
            ))}
          </div>
        )}

        <label htmlFor="retro-comentario" className="block text-sm font-medium text-slate-700 mb-1">
          Comentario
        </label>
        <textarea
          id="retro-comentario"
          value={comentario}
          onChange={(e) => setComentario(e.target.value)}
          rows={3}
          className="w-full rounded-md border border-slate-300 px-3 py-2 mb-3 focus:outline-none focus:ring-2 focus:ring-cobre-500"
          placeholder="Lo que el lider conto por telefono..."
        />

        <div className="flex flex-col sm:flex-row gap-3 mb-3">
          <div className="flex-1">
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Tipo de trabajo <span className="text-red-600">*</span>
            </label>
            <select
              value={tipoTrabajoId}
              onChange={(e) => setTipoTrabajoId(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-cobre-500"
            >
              <option value="">Selecciona una opcion...</option>
              {catalogoTipoTrabajo.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.valor}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-slate-700 mb-1">Ofensor</label>
            <select
              value={ofensorId}
              onChange={(e) => setOfensorId(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-cobre-500"
            >
              <option value="">Ninguno</option>
              {catalogoOfensor.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.valor}
                </option>
              ))}
            </select>
          </div>
        </div>

        {mensaje && <p className="text-sm text-red-600 mb-3">{mensaje}</p>}

        <button
          onClick={guardar}
          disabled={guardando}
          className="bg-cobre-600 hover:bg-cobre-700 disabled:bg-cobre-300 text-white font-medium px-4 py-2 rounded-md transition-colors"
        >
          {guardando ? "Guardando..." : "Guardar avance"}
        </button>
      </div>
    </div>
  );
}

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

  const [catalogoTipoTrabajo, setCatalogoTipoTrabajo] = useState<CatalogoOpcion[]>([]);
  const [catalogoOfensor, setCatalogoOfensor] = useState<CatalogoOpcion[]>([]);
  const [filaRetroactiva, setFilaRetroactiva] = useState<AvanceDiarioAdmin | null>(null);

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
    fetchAutenticado(`${API_URL}/api/catalogo?categoria=tipo_trabajo`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: CatalogoOpcion[]) => setCatalogoTipoTrabajo(data))
      .catch(() => {
        // Si falla, el modal de registro retroactivo queda sin opciones.
      });
    fetchAutenticado(`${API_URL}/api/catalogo?categoria=ofensor`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: CatalogoOpcion[]) => setCatalogoOfensor(data))
      .catch(() => {
        // Si falla, el modal de registro retroactivo queda sin opciones.
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
  // Solo se puede registrar retroactivamente un dia YA pasado: el de hoy
  // sigue siendo trabajo del lider, no algo para que el coordinador cubra.
  const esFechaPasada = fecha < hoyIso();

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
            <>
              {/* Pantalla chica: tarjetas apiladas, sin scroll horizontal. */}
              <div className="flex flex-col gap-2 md:hidden">
                {filasOrdenadas.map((fila) => (
                  <div
                    key={fila.trabajo_id}
                    className={
                      "rounded-lg border p-3 " +
                      (!fila.actualizado
                        ? "border-amber-200 bg-amber-50/60"
                        : "border-slate-200")
                    }
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-slate-800">{fila.site}</p>
                        <p className="text-xs text-slate-500">
                          {fila.lider_nombre ?? fila.lider_email ?? "—"}
                        </p>
                      </div>
                      <span
                        className={
                          "shrink-0 inline-block px-2 py-0.5 rounded-full text-xs font-medium " +
                          (fila.actualizado
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-amber-100 text-amber-700")
                        }
                      >
                        {fila.actualizado ? "Actualizado" : "Sin actualizar"}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs">
                      {fila.porcentaje_avance !== null && (
                        <span
                          className={
                            "font-semibold " +
                            (fila.porcentaje_avance >= 100 ? "text-emerald-600" : "text-slate-600")
                          }
                        >
                          {fila.porcentaje_avance}% avance
                        </span>
                      )}
                      {fila.tipos_trabajo.length > 0 && (
                        <span className="text-slate-600">{fila.tipos_trabajo.join(" | ")}</span>
                      )}
                      {fila.ofensores.length > 0 && (
                        <span className="text-amber-700 font-medium">
                          Ofensor: {fila.ofensores.join(" | ")}
                        </span>
                      )}
                    </div>

                    {fila.detalle.length > 0 && (
                      <p className="mt-1.5 text-xs text-slate-500">
                        {fila.detalle
                          .map((d) => `${d.hw_actividad ?? d.actividad ?? "—"}: ${d.cantidad}`)
                          .join(" · ")}
                      </p>
                    )}
                    {fila.comentarios.length > 0 && (
                      <p className="mt-1.5 text-sm text-slate-700">
                        {fila.comentarios.join(" | ")}
                      </p>
                    )}
                    {fila.diligenciado_por.length > 0 && (
                      <p className="mt-1.5 text-xs text-slate-400 italic">
                        Diligenciado por: {fila.diligenciado_por.join(" | ")}
                      </p>
                    )}
                    {!fila.actualizado && esFechaPasada && fila.lider_id && (
                      <button
                        type="button"
                        onClick={() => setFilaRetroactiva(fila)}
                        className="mt-2 text-sm text-cobre-600 hover:text-cobre-800 font-medium"
                      >
                        Registrar avance
                      </button>
                    )}
                  </div>
                ))}
                {noDisponibles.map((d) => (
                  <div
                    key={`no-disponible-${d.lider_id}`}
                    className="rounded-lg border border-slate-200 bg-slate-50 p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-slate-800">
                        {nombrePorLiderId[d.lider_id] ?? d.lider_id}
                      </p>
                      <span className="shrink-0 inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-slate-200 text-slate-600">
                        No disponible
                      </span>
                    </div>
                    {d.motivo && <p className="mt-1.5 text-sm text-slate-700">{d.motivo}</p>}
                  </div>
                ))}
              </div>

              {/* Desktop/tablet: tabla completa. */}
              <table className="hidden md:table w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2 pr-4 font-medium">Site</th>
                    <th className="py-2 pr-4 font-medium">Lider</th>
                    <th className="py-2 pr-4 font-medium">Actualizo</th>
                    <th className="py-2 pr-4 font-medium">% Avance</th>
                    <th className="py-2 pr-4 font-medium">Tipo de trabajo</th>
                    <th className="py-2 pr-4 font-medium">Ofensor</th>
                    <th className="py-2 pr-4 font-medium">Avance del dia</th>
                    <th className="py-2 pr-4 font-medium">Comentario</th>
                    <th className="py-2 pr-4 font-medium">Acciones</th>
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
                      <td className="py-2 pr-4 text-slate-700">
                        {fila.tipos_trabajo.length === 0 ? "—" : fila.tipos_trabajo.join(" | ")}
                      </td>
                      <td className="py-2 pr-4 text-amber-700">
                        {fila.ofensores.length === 0 ? "—" : fila.ofensores.join(" | ")}
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
                        {fila.diligenciado_por.length > 0 && (
                          <p className="text-xs text-slate-400 italic mt-0.5">
                            Diligenciado por: {fila.diligenciado_por.join(" | ")}
                          </p>
                        )}
                      </td>
                      <td className="py-2 pr-4">
                        {!fila.actualizado && esFechaPasada && fila.lider_id && (
                          <button
                            type="button"
                            onClick={() => setFilaRetroactiva(fila)}
                            className="text-sm text-cobre-600 hover:text-cobre-800 font-medium whitespace-nowrap"
                          >
                            Registrar avance
                          </button>
                        )}
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
                      <td className="py-2 pr-4 text-slate-400">—</td>
                      <td className="py-2 pr-4 text-slate-400">—</td>
                      <td className="py-2 pr-4 text-slate-700">{d.motivo ?? "—"}</td>
                      <td className="py-2 pr-4" />
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>

      {filaRetroactiva && filaRetroactiva.lider_id && (
        <ModalAvanceRetroactivo
          trabajoId={filaRetroactiva.trabajo_id}
          site={filaRetroactiva.site}
          liderId={filaRetroactiva.lider_id}
          liderNombre={
            filaRetroactiva.lider_nombre ?? filaRetroactiva.lider_email ?? "el lider"
          }
          fecha={fecha}
          catalogoTipoTrabajo={catalogoTipoTrabajo}
          catalogoOfensor={catalogoOfensor}
          onCerrar={() => setFilaRetroactiva(null)}
          onGuardado={() => {
            setFilaRetroactiva(null);
            cargar(fecha);
          }}
        />
      )}
    </div>
  );
}
