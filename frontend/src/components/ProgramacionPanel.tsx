import { useState, useEffect } from "react";
import { fetchAutenticado } from "../lib/api";
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

type FilaProgramacionProps = {
  fila: AvanceDiarioAdmin;
  ocupado: boolean;
  bloqueado: boolean;
  onQuitar: (trabajoId: string) => void;
};

function FilaProgramacion({ fila, ocupado, bloqueado, onQuitar }: FilaProgramacionProps) {
  return (
    <tr className="border-b border-zinc-800 last:border-0 align-top">
      <td className="py-2 pr-4 text-zinc-200">{fila.site}</td>
      <td className="py-2 pr-4 text-zinc-200">{fila.zona}</td>
      <td className="py-2 pr-4">
        <span
          className={
            "inline-block px-2 py-0.5 rounded-full text-xs font-medium " +
            (fila.actualizado ? "bg-emerald-950 text-emerald-400" : "bg-amber-950 text-amber-400")
          }
        >
          {fila.actualizado ? "Actualizado" : "Sin actualizar"}
        </span>
      </td>
      <td className="py-2 pr-4">
        {fila.porcentaje_avance === null ? (
          <span className="text-zinc-500">—</span>
        ) : (
          <span
            className={
              "text-xs font-semibold " +
              (fila.porcentaje_avance >= 100 ? "text-emerald-400" : "text-zinc-400")
            }
          >
            {fila.porcentaje_avance}%
          </span>
        )}
      </td>
      <td className="py-2 pr-4 text-xs text-zinc-400">
        {fila.detalle.length === 0
          ? "—"
          : fila.detalle.map((d) => `${d.hw_actividad ?? d.actividad ?? "—"}: ${d.cantidad}`).join(" · ")}
      </td>
      <td className="py-2 pr-4 text-zinc-200">
        {fila.comentarios.length === 0 ? "—" : fila.comentarios.join(" | ")}
      </td>
      <td className="py-2 pr-4 text-right">
        <button
          type="button"
          onClick={() => onQuitar(fila.trabajo_id)}
          disabled={ocupado || bloqueado}
          className="text-sm text-red-500 hover:text-red-300 disabled:text-zinc-600 font-medium"
        >
          {ocupado ? "..." : "Quitar"}
        </button>
      </td>
    </tr>
  );
}

type AgregarSiteControlProps = {
  liderId: string;
  opciones: AvanceDiarioAdmin[];
  deshabilitado: boolean;
  onAgregar: (trabajoId: string) => void;
};

function AgregarSiteControl({ liderId, opciones, deshabilitado, onAgregar }: AgregarSiteControlProps) {
  const [busqueda, setBusqueda] = useState("");

  const coincidencia = opciones.find(
    (o) => o.site.trim().toLowerCase() === busqueda.trim().toLowerCase()
  );

  const agregar = () => {
    if (!coincidencia) return;
    onAgregar(coincidencia.trabajo_id);
    setBusqueda("");
  };

  const listaId = `sites-disponibles-${liderId}`;

  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        list={listaId}
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            agregar();
          }
        }}
        placeholder="Buscar site por nombre..."
        disabled={deshabilitado}
        className="rounded-md border border-zinc-600 bg-zinc-900 text-zinc-100 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-cobre-500 disabled:bg-zinc-800"
      />
      <datalist id={listaId}>
        {opciones.map((o) => (
          <option key={o.trabajo_id} value={o.site} />
        ))}
      </datalist>
      <button
        type="button"
        onClick={agregar}
        disabled={deshabilitado || !coincidencia}
        className="text-sm text-white bg-cobre-600 hover:bg-cobre-500 disabled:bg-cobre-900 font-medium px-3 py-1 rounded-md whitespace-nowrap"
      >
        Agregar
      </button>
    </div>
  );
}

export default function ProgramacionPanel() {
  const [fecha, setFecha] = useState(mananaIso());
  const [filas, setFilas] = useState<AvanceDiarioAdmin[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [lideres, setLideres] = useState<Usuario[]>([]);
  const [trabajoOcupadoId, setTrabajoOcupadoId] = useState<string | null>(null);
  const [errorAsignacion, setErrorAsignacion] = useState<string | null>(null);

  const lideresHabilitados = lideres.filter((u) => u.role === "lider_cuadrilla" && u.activo);

  // La Programacion es hacia adelante: se puede seguir consultando un
  // dia que ya paso (para saber quien estaba asignado), pero no tiene
  // sentido reasignar o quitar el lider de un dia que ya ocurrio.
  const esFechaPasada = fecha < hoyIso();

  const cargarLideres = async () => {
    try {
      const res = await fetchAutenticado(`${API_URL}/api/admin/usuarios`);
      if (!res.ok) throw new Error();
      const data: Usuario[] = await res.json();
      setLideres(data);
    } catch {
      // Si falla, no aparecen tarjetas de lider; el resto del panel sigue
      // funcionando.
    }
  };

  const cargar = async (fechaConsulta: string) => {
    setCargando(true);
    setError(null);
    try {
      const parametros = new URLSearchParams({ fecha: fechaConsulta });
      const res = await fetchAutenticado(
        `${API_URL}/api/admin/programacion?${parametros.toString()}`
      );
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
    setTrabajoOcupadoId(trabajoId);
    try {
      const res = await fetchAutenticado(`${API_URL}/api/admin/programacion`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
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
      setTrabajoOcupadoId(null);
    }
  };

  const quitarAsignacion = async (trabajoId: string) => {
    setErrorAsignacion(null);
    setTrabajoOcupadoId(trabajoId);
    try {
      const parametros = new URLSearchParams({ fecha });
      const res = await fetchAutenticado(
        `${API_URL}/api/admin/programacion/${trabajoId}?${parametros.toString()}`,
        { method: "DELETE" }
      );

      if (res.status === 204) {
        setFilas((prev) =>
          prev.map((f) =>
            f.trabajo_id === trabajoId
              ? { ...f, lider_id: null, lider_nombre: null, lider_email: null }
              : f
          )
        );
      } else {
        const data = await res.json().catch(() => null);
        setErrorAsignacion(data?.detail ?? "Ocurrio un error al quitar la asignacion.");
      }
    } catch {
      setErrorAsignacion("No se pudo conectar con el servidor. Intenta de nuevo.");
    } finally {
      setTrabajoOcupadoId(null);
    }
  };

  const fechaFormateada = new Date(`${fecha}T00:00:00`).toLocaleDateString("es-CO", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  // Agrupa los sites activos de esta fecha por el lider que tienen
  // asignado (segun la tabla programacion), para que el coordinador
  // trabaje "por lider" en vez de "por site": elige un lider y le agrega
  // o quita sites, en vez de ir fila por fila entre todos los sites. Los
  // sites sin asignar no se listan aparte; solo aparecen como opcion
  // dentro del buscador "Agregar site" de cada lider.
  const filasPorLider: Record<string, AvanceDiarioAdmin[]> = {};
  filas.forEach((fila) => {
    if (fila.lider_id) {
      (filasPorLider[fila.lider_id] ??= []).push(fila);
    }
  });

  // Un lider deshabilitado (o ya no en la lista de usuarios) puede seguir
  // teniendo sites asignados de una programacion anterior: se muestran
  // aparte, en modo solo lectura + boton "Quitar", en vez de esconderlos.
  const idsHabilitados = new Set(lideresHabilitados.map((l) => l.id));
  const liderIdsNoHabilitadosConSites = Object.keys(filasPorLider).filter(
    (id) => !idsHabilitados.has(id)
  );

  return (
    <div className="bg-zinc-800 rounded-xl shadow-md p-5 sm:p-8">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-lg font-semibold text-zinc-50">Programacion</h1>
        <button
          onClick={() => cargar(fecha)}
          disabled={cargando}
          className="text-sm text-cobre-500 hover:text-cobre-300 disabled:text-zinc-600 font-medium"
        >
          {cargando ? "Actualizando..." : "Actualizar"}
        </button>
      </div>
      <p className="text-sm text-zinc-400 mb-6 capitalize">{fechaFormateada}</p>

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="w-full lg:w-64 shrink-0">
          <Calendario fechaSeleccionada={fecha} onSeleccionar={setFecha} fechaMinima={hoyIso()} />
          <p className="text-xs text-zinc-500 mt-2">
            Por defecto muestra el dia siguiente a hoy, para programar el trabajo de manana. La
            Programacion es hacia adelante: para consultar como quedo programado un dia que ya
            paso, revisa el Daily.
          </p>
        </div>

        <div className="flex-1 overflow-x-auto">
          {error && <p className="text-sm text-red-400 mb-4">{error}</p>}
          {errorAsignacion && <p className="text-sm text-red-400 mb-4">{errorAsignacion}</p>}

          {!cargando && !error && filas.length === 0 && (
            <p className="text-sm text-zinc-400">No hay trabajos activos para programar.</p>
          )}

          {!cargando && !error && filas.length > 0 && lideresHabilitados.length === 0 && (
            <p className="text-sm text-zinc-400">No hay lideres de cuadrilla habilitados.</p>
          )}

          <div className="space-y-5">
            {lideresHabilitados.map((lider) => {
              const sitesDelLider = filasPorLider[lider.id] ?? [];
              const sitesParaAgregar = filas.filter((f) => f.lider_id !== lider.id);

              return (
                <div key={lider.id} className="border border-zinc-700 rounded-lg p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                    <h3 className="font-semibold text-zinc-50">{lider.nombre_completo}</h3>
                    <AgregarSiteControl
                      liderId={lider.id}
                      opciones={sitesParaAgregar}
                      deshabilitado={
                        trabajoOcupadoId !== null || esFechaPasada || sitesParaAgregar.length === 0
                      }
                      onAgregar={(trabajoId) => asignarLider(trabajoId, lider.id)}
                    />
                  </div>

                  {sitesDelLider.length === 0 ? (
                    <p className="text-sm text-zinc-500">Sin sites asignados para este dia.</p>
                  ) : (
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-zinc-700 text-zinc-400">
                          <th className="py-2 pr-4 font-medium">Site</th>
                          <th className="py-2 pr-4 font-medium">Zona</th>
                          <th className="py-2 pr-4 font-medium">Actualizo</th>
                          <th className="py-2 pr-4 font-medium">% Avance</th>
                          <th className="py-2 pr-4 font-medium">Avance del dia</th>
                          <th className="py-2 pr-4 font-medium">Comentario</th>
                          <th className="py-2 pr-4 font-medium text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sitesDelLider.map((fila) => (
                          <FilaProgramacion
                            key={fila.trabajo_id}
                            fila={fila}
                            ocupado={trabajoOcupadoId === fila.trabajo_id}
                            bloqueado={esFechaPasada}
                            onQuitar={quitarAsignacion}
                          />
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })}

            {liderIdsNoHabilitadosConSites.map((liderId) => {
              const sitesDelLider = filasPorLider[liderId];
              const nombre =
                sitesDelLider[0]?.lider_nombre ?? sitesDelLider[0]?.lider_email ?? "Lider";
              return (
                <div key={liderId} className="border border-amber-800 bg-amber-950/40 rounded-lg p-4">
                  <h3 className="font-semibold text-zinc-50 mb-3">{nombre} (deshabilitado)</h3>
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-zinc-700 text-zinc-400">
                        <th className="py-2 pr-4 font-medium">Site</th>
                        <th className="py-2 pr-4 font-medium">Zona</th>
                        <th className="py-2 pr-4 font-medium">Actualizo</th>
                        <th className="py-2 pr-4 font-medium">% Avance</th>
                        <th className="py-2 pr-4 font-medium">Avance del dia</th>
                        <th className="py-2 pr-4 font-medium">Comentario</th>
                        <th className="py-2 pr-4 font-medium text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sitesDelLider.map((fila) => (
                        <FilaProgramacion
                          key={fila.trabajo_id}
                          fila={fila}
                          ocupado={trabajoOcupadoId === fila.trabajo_id}
                          bloqueado={esFechaPasada}
                          onQuitar={quitarAsignacion}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
