import { FormEvent, useEffect, useState } from "react";
import { fetchAutenticado } from "../lib/api";
import { CatalogoOpcion, CategoriaCatalogo, Rol, Usuario } from "../types";

const API_URL = import.meta.env.VITE_API_URL ? "" : "http://localhost:8000";

type PopupState = {
  visible: boolean;
  type: "success" | "duplicate" | "error";
  message: string;
};

const initialPopup: PopupState = { visible: false, type: "success", message: "" };

const ROLE_LABEL: Record<string, string> = {
  administrador: "Administrador",
  coordinador: "Coordinador",
  visualizador: "Visualizador",
  lider_cuadrilla: "Lider de cuadrilla",
};

const ROLE_BADGE: Record<string, string> = {
  administrador: "bg-purple-100 text-purple-700",
  coordinador: "bg-sky-100 text-sky-700",
  visualizador: "bg-amber-100 text-amber-700",
  lider_cuadrilla: "bg-emerald-100 text-emerald-700",
};

type ColumnaOrden = "nombre" | "email" | "role" | "activo";

const COLUMNAS_ORDENABLES: { columna: ColumnaOrden; label: string }[] = [
  { columna: "nombre", label: "Nombre" },
  { columna: "email", label: "Correo / contrasena" },
  { columna: "role", label: "Rol" },
  { columna: "activo", label: "Estado" },
];

export default function PerfilesPanel() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nombreCompleto, setNombreCompleto] = useState("");
  const [role, setRole] = useState<Rol>("lider_cuadrilla");
  const [tipoTrabajoId, setTipoTrabajoId] = useState("");
  const [errores, setErrores] = useState<{ email?: string; password?: string; nombre?: string }>(
    {}
  );
  const [guardando, setGuardando] = useState(false);
  const [popup, setPopup] = useState<PopupState>(initialPopup);

  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [cargandoLista, setCargandoLista] = useState(false);
  const [errorLista, setErrorLista] = useState<string | null>(null);
  const [busquedaUsuarios, setBusquedaUsuarios] = useState("");

  const [catalogoTipoTrabajo, setCatalogoTipoTrabajo] = useState<CatalogoOpcion[]>([]);

  const [idEditando, setIdEditando] = useState<string | null>(null);
  const [nombreEditado, setNombreEditado] = useState("");
  const [emailEditado, setEmailEditado] = useState("");
  const [passwordEditado, setPasswordEditado] = useState("");
  const [rolEditado, setRolEditado] = useState<Rol>("lider_cuadrilla");
  const [activoEditado, setActivoEditado] = useState(true);
  const [tipoTrabajoIdEditado, setTipoTrabajoIdEditado] = useState("");
  const [errorEdicion, setErrorEdicion] = useState<string | null>(null);
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);

  const [orden, setOrden] = useState<{ columna: ColumnaOrden; direccion: "asc" | "desc" } | null>(
    null
  );

  const cambiarOrden = (columna: ColumnaOrden) => {
    setOrden((prev) =>
      prev?.columna === columna
        ? { columna, direccion: prev.direccion === "asc" ? "desc" : "asc" }
        : { columna, direccion: "asc" }
    );
  };

  const usuariosFiltrados = usuarios.filter((usuario) => {
    const consulta = busquedaUsuarios.trim().toLowerCase();
    if (!consulta) return true;
    const campos = [
      usuario.nombre_completo,
      usuario.email,
      ROLE_LABEL[usuario.role] ?? usuario.role,
      usuario.activo ? "Habilitado" : "Deshabilitado",
    ];
    return campos.some((campo) => campo?.toLowerCase().includes(consulta));
  });

  const usuariosOrdenados = [...usuariosFiltrados].sort((a, b) => {
    if (!orden) return 0;
    const factor = orden.direccion === "asc" ? 1 : -1;
    switch (orden.columna) {
      case "nombre":
        return a.nombre_completo.localeCompare(b.nombre_completo) * factor;
      case "email":
        return a.email.localeCompare(b.email) * factor;
      case "role":
        return (ROLE_LABEL[a.role] ?? a.role).localeCompare(ROLE_LABEL[b.role] ?? b.role) * factor;
      case "activo":
        return (Number(a.activo) - Number(b.activo)) * factor;
      default:
        return 0;
    }
  });

  const cerrarPopup = () => setPopup(initialPopup);

  const iniciarEdicion = (usuario: Usuario) => {
    setIdEditando(usuario.id);
    setNombreEditado(usuario.nombre_completo);
    setEmailEditado(usuario.email);
    setPasswordEditado("");
    setRolEditado(usuario.role);
    setActivoEditado(usuario.activo);
    setTipoTrabajoIdEditado(usuario.tipo_trabajo_id ?? "");
    setErrorEdicion(null);
  };

  const cancelarEdicion = () => {
    setIdEditando(null);
    setNombreEditado("");
    setEmailEditado("");
    setPasswordEditado("");
    setErrorEdicion(null);
  };

  const guardarEdicion = async (usuarioId: string) => {
    if (!nombreEditado.trim() || !emailEditado.trim()) return;
    if (passwordEditado && passwordEditado.length < 8) {
      setErrorEdicion("La contrasena debe tener al menos 8 caracteres.");
      return;
    }
    setErrorEdicion(null);
    setGuardandoEdicion(true);
    try {
      const res = await fetchAutenticado(`${API_URL}/api/admin/usuarios/${usuarioId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre_completo: nombreEditado.trim(),
          email: emailEditado.trim(),
          role: rolEditado,
          activo: activoEditado,
          password: passwordEditado || null,
          tipo_trabajo_id: rolEditado === "lider_cuadrilla" ? tipoTrabajoIdEditado || null : null,
        }),
      });

      if (res.ok) {
        const actualizado: Usuario = await res.json();
        setUsuarios((prev) => prev.map((u) => (u.id === actualizado.id ? actualizado : u)));
        cancelarEdicion();
      } else {
        const data = await res.json().catch(() => null);
        setErrorEdicion(data?.detail ?? "Ocurrio un error al actualizar el usuario.");
      }
    } catch {
      setErrorEdicion("No se pudo conectar con el servidor. Intenta de nuevo.");
    } finally {
      setGuardandoEdicion(false);
    }
  };

  const cargarUsuarios = async () => {
    setCargandoLista(true);
    setErrorLista(null);
    try {
      const res = await fetchAutenticado(`${API_URL}/api/admin/usuarios`);
      if (!res.ok) throw new Error();
      const data: Usuario[] = await res.json();
      setUsuarios(data);
    } catch {
      setErrorLista("No se pudo cargar la lista de usuarios.");
    } finally {
      setCargandoLista(false);
    }
  };

  const cargarCatalogoTipoTrabajo = async () => {
    try {
      const res = await fetchAutenticado(`${API_URL}/api/admin/catalogo?categoria=tipo_trabajo`);
      if (!res.ok) throw new Error();
      const data: CatalogoOpcion[] = await res.json();
      setCatalogoTipoTrabajo(data);
    } catch {
      // silencioso: el select simplemente queda vacio si falla
    }
  };

  useEffect(() => {
    cargarUsuarios();
    cargarCatalogoTipoTrabajo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const validar = () => {
    const nuevosErrores: typeof errores = {};
    if (!email.trim()) nuevosErrores.email = "El correo es obligatorio.";
    if (!password || password.length < 8)
      nuevosErrores.password = "La contrasena debe tener al menos 8 caracteres.";
    if (!nombreCompleto.trim()) nuevosErrores.nombre = "El nombre completo es obligatorio.";
    return nuevosErrores;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    const nuevosErrores = validar();
    if (Object.keys(nuevosErrores).length > 0) {
      setErrores(nuevosErrores);
      return;
    }
    setErrores({});
    setGuardando(true);

    try {
      const res = await fetchAutenticado(`${API_URL}/api/admin/usuarios`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password,
          nombre_completo: nombreCompleto.trim(),
          role,
          tipo_trabajo_id: role === "lider_cuadrilla" ? tipoTrabajoId || null : null,
        }),
      });

      if (res.status === 201) {
        setPopup({
          visible: true,
          type: "success",
          message: "El usuario se creo con exito.",
        });
        setEmail("");
        setPassword("");
        setNombreCompleto("");
        setRole("lider_cuadrilla");
        setTipoTrabajoId("");
        cargarUsuarios();
      } else if (res.status === 409) {
        setPopup({
          visible: true,
          type: "duplicate",
          message: "Ya existe un usuario registrado con ese correo.",
        });
      } else {
        const data = await res.json().catch(() => null);
        setPopup({
          visible: true,
          type: "error",
          message: data?.detail ?? "Ocurrio un error al crear el usuario.",
        });
      }
    } catch {
      setPopup({
        visible: true,
        type: "error",
        message: "No se pudo conectar con el servidor. Intenta de nuevo.",
      });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-md p-5 sm:p-8">
        <h2 className="text-lg font-semibold text-slate-800 mb-6">Nuevo usuario</h2>

        <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2" noValidate>
          <div>
            <label htmlFor="nombre" className="block text-sm font-medium text-slate-700 mb-1">
              Nombre completo
            </label>
            <input
              id="nombre"
              type="text"
              value={nombreCompleto}
              onChange={(e) => setNombreCompleto(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-cobre-500"
              placeholder="Ej: Juana Perez Gomez"
            />
            {errores.nombre && <p className="text-sm text-red-600 mt-1">{errores.nombre}</p>}
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">
              Correo
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-cobre-500"
              placeholder="usuario@ejemplo.com"
            />
            {errores.email && <p className="text-sm text-red-600 mt-1">{errores.email}</p>}
          </div>

          <div>
            <label htmlFor="role" className="block text-sm font-medium text-slate-700 mb-1">
              Perfil
            </label>
            <select
              id="role"
              value={role}
              onChange={(e) => setRole(e.target.value as Rol)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-cobre-500"
            >
              <option value="lider_cuadrilla">Lider de cuadrilla</option>
              <option value="coordinador">Coordinador</option>
              <option value="visualizador">Visualizador</option>
              <option value="administrador">Administrador</option>
            </select>
          </div>

          {role === "lider_cuadrilla" && (
            <div>
              <label htmlFor="tipoTrabajo" className="block text-sm font-medium text-slate-700 mb-1">
                Tipo de trabajo
              </label>
              <select
                id="tipoTrabajo"
                value={tipoTrabajoId}
                onChange={(e) => setTipoTrabajoId(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-cobre-500"
              >
                <option value="">Sin definir</option>
                {catalogoTipoTrabajo
                  .filter((opcion) => opcion.activo)
                  .map((opcion) => (
                    <option key={opcion.id} value={opcion.id}>
                      {opcion.valor}
                    </option>
                  ))}
              </select>
            </div>
          )}

          <div className="sm:col-span-2">
            <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">
              Contrasena temporal
            </label>
            <input
              id="password"
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-cobre-500"
              placeholder="Minimo 8 caracteres"
            />
            {errores.password && <p className="text-sm text-red-600 mt-1">{errores.password}</p>}
            <p className="text-xs text-slate-500 mt-1">
              Comunicasela al usuario por otro medio; el sistema no la envia por correo.
            </p>
          </div>

          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={guardando}
              className="bg-cobre-600 hover:bg-cobre-700 disabled:bg-cobre-300 text-white font-medium px-4 py-2 rounded-md transition-colors"
            >
              {guardando ? "Creando..." : "Crear usuario"}
            </button>
          </div>
        </form>
      </div>

      <div className="bg-white rounded-xl shadow-md p-5 sm:p-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-slate-800">Usuarios</h2>
          <button
            onClick={cargarUsuarios}
            disabled={cargandoLista}
            className="text-sm text-cobre-600 hover:text-cobre-800 disabled:text-slate-400 font-medium"
          >
            {cargandoLista ? "Actualizando..." : "Actualizar"}
          </button>
        </div>

        {errorLista && <p className="text-sm text-red-600 mb-4">{errorLista}</p>}

        {!errorLista && usuarios.length === 0 && !cargandoLista && (
          <p className="text-sm text-slate-500">Todavia no hay usuarios registrados.</p>
        )}

        {usuarios.length > 0 && (
          <input
            type="text"
            value={busquedaUsuarios}
            onChange={(e) => setBusquedaUsuarios(e.target.value)}
            placeholder="Buscar por nombre, correo, rol o estado..."
            className="w-full sm:w-96 rounded-md border border-slate-300 px-3 py-1.5 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-cobre-500"
          />
        )}

        {usuarios.length > 0 && usuariosOrdenados.length === 0 && (
          <p className="text-sm text-slate-500">Ningun usuario coincide con esa busqueda.</p>
        )}

        {usuariosOrdenados.length > 0 && (
          <>
            {/* Pantalla chica: tarjetas apiladas, sin scroll horizontal. */}
            <div className="flex flex-col gap-2 md:hidden">
              {usuariosOrdenados.map((usuario) => {
                const editando = idEditando === usuario.id;
                if (editando) {
                  return (
                    <div
                      key={usuario.id}
                      className="rounded-lg border border-cobre-200 bg-cobre-50/30 p-3 space-y-2"
                    >
                      <input
                        type="text"
                        value={nombreEditado}
                        onChange={(e) => setNombreEditado(e.target.value)}
                        placeholder="Nombre completo"
                        className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cobre-500"
                        autoFocus
                      />
                      <input
                        type="email"
                        value={emailEditado}
                        onChange={(e) => setEmailEditado(e.target.value)}
                        placeholder="Correo"
                        className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cobre-500"
                      />
                      <input
                        type="text"
                        value={passwordEditado}
                        onChange={(e) => setPasswordEditado(e.target.value)}
                        placeholder="Nueva contrasena (opcional)"
                        className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cobre-500"
                      />
                      <select
                        value={rolEditado}
                        onChange={(e) => setRolEditado(e.target.value as Rol)}
                        className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cobre-500"
                      >
                        <option value="lider_cuadrilla">Lider de cuadrilla</option>
                        <option value="coordinador">Coordinador</option>
                        <option value="visualizador">Visualizador</option>
                        <option value="administrador">Administrador</option>
                      </select>
                      {rolEditado === "lider_cuadrilla" && (
                        <select
                          value={tipoTrabajoIdEditado}
                          onChange={(e) => setTipoTrabajoIdEditado(e.target.value)}
                          className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cobre-500"
                        >
                          <option value="">Tipo de trabajo: sin definir</option>
                          {catalogoTipoTrabajo
                            .filter((opcion) => opcion.activo)
                            .map((opcion) => (
                              <option key={opcion.id} value={opcion.id}>
                                {opcion.valor}
                              </option>
                            ))}
                        </select>
                      )}
                      <label className="flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={activoEditado}
                          onChange={(e) => setActivoEditado(e.target.checked)}
                          className="h-4 w-4 rounded border-slate-300 text-cobre-600 focus:ring-cobre-500"
                        />
                        Habilitado
                      </label>
                      {errorEdicion && <p className="text-xs text-red-600">{errorEdicion}</p>}
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => guardarEdicion(usuario.id)}
                          disabled={
                            guardandoEdicion || !nombreEditado.trim() || !emailEditado.trim()
                          }
                          className="text-sm text-white bg-cobre-600 hover:bg-cobre-700 disabled:bg-cobre-300 px-3 py-1.5 rounded-md"
                        >
                          {guardandoEdicion ? "Guardando..." : "Guardar"}
                        </button>
                        <button
                          onClick={cancelarEdicion}
                          disabled={guardandoEdicion}
                          className="text-sm text-slate-600 hover:text-slate-800 px-3 py-1.5 rounded-md"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  );
                }
                return (
                  <div key={usuario.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-slate-800 truncate">
                          {usuario.nombre_completo}
                        </p>
                        <p className="text-xs text-slate-500 truncate">{usuario.email}</p>
                      </div>
                      <button
                        onClick={() => iniciarEdicion(usuario)}
                        className="shrink-0 text-sm text-cobre-600 hover:text-cobre-800 font-medium"
                      >
                        Editar
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      <span
                        className={
                          "inline-block px-2 py-0.5 rounded-full text-xs font-medium " +
                          (ROLE_BADGE[usuario.role] ?? "bg-slate-200 text-slate-600")
                        }
                      >
                        {ROLE_LABEL[usuario.role] ?? usuario.role}
                      </span>
                      <span
                        className={
                          "inline-block px-2 py-0.5 rounded-full text-xs font-medium " +
                          (usuario.activo
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-slate-200 text-slate-600")
                        }
                      >
                        {usuario.activo ? "Habilitado" : "Deshabilitado"}
                      </span>
                    </div>
                    {usuario.role === "lider_cuadrilla" && usuario.tipo_trabajo_valor && (
                      <p className="text-xs text-slate-500 mt-1.5">{usuario.tipo_trabajo_valor}</p>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Desktop/tablet: tabla completa. */}
            <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  {COLUMNAS_ORDENABLES.map(({ columna, label }) => (
                    <th key={columna} className="py-2 pr-4 font-medium">
                      <button
                        type="button"
                        onClick={() => cambiarOrden(columna)}
                        className="flex items-center gap-1 font-medium text-slate-500 hover:text-slate-700"
                      >
                        {label}
                        <span className="text-[10px] w-3 inline-block">
                          {orden?.columna === columna ? (orden.direccion === "asc" ? "▲" : "▼") : ""}
                        </span>
                      </button>
                    </th>
                  ))}
                  <th className="py-2 pr-4 font-medium text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {usuariosOrdenados.map((usuario) => {
                  const editando = idEditando === usuario.id;
                  return (
                    <tr key={usuario.id} className="border-b border-slate-100 last:border-0 align-top">
                      <td className="py-2 pr-4 text-slate-700">
                        {editando ? (
                          <input
                            type="text"
                            value={nombreEditado}
                            onChange={(e) => setNombreEditado(e.target.value)}
                            className="w-full rounded-md border border-slate-300 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-cobre-500"
                            autoFocus
                          />
                        ) : (
                          usuario.nombre_completo
                        )}
                      </td>
                      <td className="py-2 pr-4 text-slate-700">
                        {editando ? (
                          <div className="space-y-1 min-w-[180px]">
                            <input
                              type="email"
                              value={emailEditado}
                              onChange={(e) => setEmailEditado(e.target.value)}
                              className="w-full rounded-md border border-slate-300 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-cobre-500"
                              placeholder="Correo"
                            />
                            <input
                              type="text"
                              value={passwordEditado}
                              onChange={(e) => setPasswordEditado(e.target.value)}
                              className="w-full rounded-md border border-slate-300 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-cobre-500"
                              placeholder="Nueva contrasena (opcional)"
                            />
                          </div>
                        ) : (
                          usuario.email
                        )}
                      </td>
                      <td className="py-2 pr-4">
                        {editando ? (
                          <div className="space-y-1 min-w-[160px]">
                            <select
                              value={rolEditado}
                              onChange={(e) => setRolEditado(e.target.value as Rol)}
                              className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-cobre-500"
                            >
                              <option value="lider_cuadrilla">Lider de cuadrilla</option>
                              <option value="coordinador">Coordinador</option>
                              <option value="visualizador">Visualizador</option>
                              <option value="administrador">Administrador</option>
                            </select>
                            {rolEditado === "lider_cuadrilla" && (
                              <select
                                value={tipoTrabajoIdEditado}
                                onChange={(e) => setTipoTrabajoIdEditado(e.target.value)}
                                className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-cobre-500"
                              >
                                <option value="">Tipo de trabajo: sin definir</option>
                                {catalogoTipoTrabajo
                                  .filter((opcion) => opcion.activo)
                                  .map((opcion) => (
                                    <option key={opcion.id} value={opcion.id}>
                                      {opcion.valor}
                                    </option>
                                  ))}
                              </select>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <span
                              className={
                                "inline-block px-2 py-0.5 rounded-full text-xs font-medium " +
                                (ROLE_BADGE[usuario.role] ?? "bg-slate-200 text-slate-600")
                              }
                            >
                              {ROLE_LABEL[usuario.role] ?? usuario.role}
                            </span>
                            {usuario.role === "lider_cuadrilla" && usuario.tipo_trabajo_valor && (
                              <p className="text-xs text-slate-500">{usuario.tipo_trabajo_valor}</p>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="py-2 pr-4">
                        {editando ? (
                          <label className="flex items-center gap-2 text-sm text-slate-700">
                            <input
                              type="checkbox"
                              checked={activoEditado}
                              onChange={(e) => setActivoEditado(e.target.checked)}
                              className="h-4 w-4 rounded border-slate-300 text-cobre-600 focus:ring-cobre-500"
                            />
                            Habilitado
                          </label>
                        ) : (
                          <span
                            className={
                              "inline-block px-2 py-0.5 rounded-full text-xs font-medium " +
                              (usuario.activo
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-slate-200 text-slate-600")
                            }
                          >
                            {usuario.activo ? "Habilitado" : "Deshabilitado"}
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-4 text-right whitespace-nowrap">
                        {editando ? (
                          <div className="flex flex-col items-end gap-2">
                            {errorEdicion && (
                              <p className="text-xs text-red-600 max-w-[200px] text-right">
                                {errorEdicion}
                              </p>
                            )}
                            <div className="flex justify-end gap-2">
                              <button
                                onClick={() => guardarEdicion(usuario.id)}
                                disabled={
                                  guardandoEdicion || !nombreEditado.trim() || !emailEditado.trim()
                                }
                                className="text-sm text-white bg-cobre-600 hover:bg-cobre-700 disabled:bg-cobre-300 px-3 py-1 rounded-md"
                              >
                                {guardandoEdicion ? "Guardando..." : "Guardar"}
                              </button>
                              <button
                                onClick={cancelarEdicion}
                                disabled={guardandoEdicion}
                                className="text-sm text-slate-600 hover:text-slate-800 px-3 py-1 rounded-md"
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => iniciarEdicion(usuario)}
                            className="text-sm text-cobre-600 hover:text-cobre-800 font-medium px-3 py-1"
                          >
                            Editar
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-md p-5 sm:p-8">
        <h2 className="text-lg font-semibold text-slate-800 mb-2">Catalogos</h2>
        <p className="text-sm text-slate-500 mb-6">
          Agrega o desactiva las opciones de tipo de trabajo (perfil del lider) y de ofensores
          (avance diario). Nunca se eliminan para no romper un perfil o un avance que ya apunte a
          esa opcion.
        </p>
        <div className="grid gap-8 sm:grid-cols-2">
          <CatalogoManager
            categoria="tipo_trabajo"
            titulo="Tipo de trabajo"
            onChange={cargarCatalogoTipoTrabajo}
          />
          <CatalogoManager categoria="ofensor" titulo="Ofensores" />
        </div>
      </div>

      {popup.visible && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-lg max-w-sm w-full p-6 text-center">
            <div
              className={
                "mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full text-white " +
                (popup.type === "success"
                  ? "bg-green-500"
                  : popup.type === "duplicate"
                  ? "bg-amber-500"
                  : "bg-red-500")
              }
            >
              {popup.type === "success" ? "✓" : popup.type === "duplicate" ? "!" : "✕"}
            </div>
            <h3 className="text-lg font-semibold text-slate-800 mb-1">
              {popup.type === "success"
                ? "Guardado con exito"
                : popup.type === "duplicate"
                ? "Correo duplicado"
                : "Error"}
            </h3>
            <p className="text-sm text-slate-600 mb-5">{popup.message}</p>
            <button
              onClick={cerrarPopup}
              className="bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded-md text-sm"
            >
              Aceptar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CatalogoManager({
  categoria,
  titulo,
  onChange,
}: {
  categoria: CategoriaCatalogo;
  titulo: string;
  onChange?: () => void;
}) {
  const [opciones, setOpciones] = useState<CatalogoOpcion[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nuevoValor, setNuevoValor] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [actualizandoId, setActualizandoId] = useState<string | null>(null);

  const cargar = async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await fetchAutenticado(`${API_URL}/api/admin/catalogo?categoria=${categoria}`);
      if (!res.ok) throw new Error();
      const data: CatalogoOpcion[] = await res.json();
      setOpciones(data);
    } catch {
      setError("No se pudo cargar la lista.");
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoria]);

  const agregarOpcion = async (e: FormEvent) => {
    e.preventDefault();
    if (!nuevoValor.trim()) return;
    setGuardando(true);
    setError(null);
    try {
      const res = await fetchAutenticado(`${API_URL}/api/admin/catalogo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoria, valor: nuevoValor.trim() }),
      });
      if (res.status === 201) {
        setNuevoValor("");
        await cargar();
        onChange?.();
      } else if (res.status === 409) {
        setError("Esa opcion ya existe.");
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.detail ?? "Ocurrio un error al agregar la opcion.");
      }
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setGuardando(false);
    }
  };

  const alternarActivo = async (opcion: CatalogoOpcion) => {
    setActualizandoId(opcion.id);
    setError(null);
    try {
      const res = await fetchAutenticado(`${API_URL}/api/admin/catalogo/${opcion.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ valor: opcion.valor, activo: !opcion.activo }),
      });
      if (res.ok) {
        await cargar();
        onChange?.();
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.detail ?? "Ocurrio un error al actualizar la opcion.");
      }
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setActualizandoId(null);
    }
  };

  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-700 mb-2">{titulo}</h3>
      <form onSubmit={agregarOpcion} className="flex gap-2 mb-3">
        <input
          type="text"
          value={nuevoValor}
          onChange={(e) => setNuevoValor(e.target.value)}
          placeholder="Nueva opcion..."
          className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cobre-500"
        />
        <button
          type="submit"
          disabled={guardando || !nuevoValor.trim()}
          className="bg-cobre-600 hover:bg-cobre-700 disabled:bg-cobre-300 text-white text-sm font-medium px-3 py-1.5 rounded-md transition-colors"
        >
          {guardando ? "Agregando..." : "Agregar"}
        </button>
      </form>

      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}

      {cargando && opciones.length === 0 ? (
        <p className="text-sm text-slate-500">Cargando...</p>
      ) : opciones.length === 0 ? (
        <p className="text-sm text-slate-500">Todavia no hay opciones.</p>
      ) : (
        <ul className="space-y-1">
          {opciones.map((opcion) => (
            <li
              key={opcion.id}
              className="flex items-center justify-between gap-2 rounded-md border border-slate-200 px-2 py-1.5"
            >
              <span
                className={
                  "text-sm " + (opcion.activo ? "text-slate-700" : "text-slate-400 line-through")
                }
              >
                {opcion.valor}
              </span>
              <button
                onClick={() => alternarActivo(opcion)}
                disabled={actualizandoId === opcion.id}
                className={
                  "text-xs font-medium px-2 py-1 rounded-md " +
                  (opcion.activo
                    ? "text-slate-600 hover:text-slate-800"
                    : "text-emerald-600 hover:text-emerald-800")
                }
              >
                {actualizandoId === opcion.id ? "..." : opcion.activo ? "Desactivar" : "Activar"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
