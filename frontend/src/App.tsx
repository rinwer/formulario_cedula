import { FormEvent, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL ? "" : "http://localhost:8000";

type PopupState = {
  visible: boolean;
  type: "success" | "duplicate" | "error";
  message: string;
};

const initialPopup: PopupState = { visible: false, type: "success", message: "" };

function validarCedula(cedula: string): string | null {
  if (!cedula.trim()) return "La cedula es obligatoria.";
  if (!/^\d+$/.test(cedula.trim())) return "La cedula debe contener solo numeros.";
  return null;
}

function validarNombre(nombre: string): string | null {
  if (!nombre.trim()) return "El nombre completo es obligatorio.";
  return null;
}

export default function App() {
  const [cedula, setCedula] = useState("");
  const [nombreCompleto, setNombreCompleto] = useState("");
  const [errores, setErrores] = useState<{ cedula?: string; nombre?: string }>({});
  const [guardando, setGuardando] = useState(false);
  const [popup, setPopup] = useState<PopupState>(initialPopup);

  const cerrarPopup = () => setPopup(initialPopup);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    const errorCedula = validarCedula(cedula);
    const errorNombre = validarNombre(nombreCompleto);

    if (errorCedula || errorNombre) {
      setErrores({ cedula: errorCedula ?? undefined, nombre: errorNombre ?? undefined });
      return;
    }
    setErrores({});
    setGuardando(true);

    try {
      const res = await fetch(`${API_URL}/api/personas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cedula: cedula.trim(), nombre_completo: nombreCompleto.trim() }),
      });

      if (res.status === 201) {
        setPopup({
          visible: true,
          type: "success",
          message: "El registro se guardo con exito.",
        });
        setCedula("");
        setNombreCompleto("");
      } else if (res.status === 409) {
        setPopup({
          visible: true,
          type: "duplicate",
          message: "Ese numero de cedula ya esta registrado en la base de datos.",
        });
      } else {
        const data = await res.json().catch(() => null);
        setPopup({
          visible: true,
          type: "error",
          message: data?.detail ?? "Ocurrio un error al guardar el registro.",
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
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-md p-8">
        <h1 className="text-xl font-semibold text-slate-800 mb-6">Registro de Persona</h1>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label htmlFor="cedula" className="block text-sm font-medium text-slate-700 mb-1">
              Cedula
            </label>
            <input
              id="cedula"
              type="text"
              inputMode="numeric"
              value={cedula}
              onChange={(e) => setCedula(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Ej: 1020304050"
            />
            {errores.cedula && <p className="text-sm text-red-600 mt-1">{errores.cedula}</p>}
          </div>

          <div>
            <label htmlFor="nombre" className="block text-sm font-medium text-slate-700 mb-1">
              Nombre completo
            </label>
            <input
              id="nombre"
              type="text"
              value={nombreCompleto}
              onChange={(e) => setNombreCompleto(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Ej: Juana Perez Gomez"
            />
            {errores.nombre && <p className="text-sm text-red-600 mt-1">{errores.nombre}</p>}
          </div>

          <button
            type="submit"
            disabled={guardando}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-medium py-2 rounded-md transition-colors"
          >
            {guardando ? "Guardando..." : "Guardar"}
          </button>
        </form>
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
            <h2 className="text-lg font-semibold text-slate-800 mb-1">
              {popup.type === "success"
                ? "Guardado con exito"
                : popup.type === "duplicate"
                ? "Registro duplicado"
                : "Error"}
            </h2>
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
