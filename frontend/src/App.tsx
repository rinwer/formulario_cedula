import { Session } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import AsignacionPanel from "./components/AsignacionPanel";
import DailyPanel from "./components/DailyPanel";
import LoginPage from "./components/LoginPage";
import MisTrabajosPanel from "./components/MisTrabajosPanel";
import PerfilesPanel from "./components/PerfilesPanel";
import ProgramacionPanel from "./components/ProgramacionPanel";
import { fetchAutenticado } from "./lib/api";
import { supabase } from "./lib/supabaseClient";
import { Perfil } from "./types";

const API_URL = import.meta.env.VITE_API_URL ? "" : "http://localhost:8000";

type Tab = "perfiles" | "asignacion" | "programacion" | "daily";

const TABS: { key: Tab; label: string }[] = [
  { key: "perfiles", label: "Perfiles" },
  { key: "asignacion", label: "Trabajos" },
  { key: "programacion", label: "Programacion" },
  { key: "daily", label: "Daily" },
];

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [cargandoSesion, setCargandoSesion] = useState(true);
  const [tabActiva, setTabActiva] = useState<Tab>("perfiles");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setCargandoSesion(false);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nuevaSesion) => {
      setSession(nuevaSesion);
    });

    return () => authListener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setPerfil(null);
      return;
    }

    let cancelado = false;
    fetchAutenticado(`${API_URL}/api/me`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: Perfil) => {
        if (!cancelado) setPerfil(data);
      })
      .catch(() => {
        if (!cancelado) setPerfil(null);
      });

    return () => {
      cancelado = true;
    };
  }, [session]);

  const cerrarSesion = () => {
    supabase.auth.signOut();
  };

  const anchoAmplio =
    perfil?.role === "lider_cuadrilla" || tabActiva === "daily" || tabActiva === "programacion";

  if (cargandoSesion) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <p className="text-slate-500 text-sm">Cargando...</p>
      </div>
    );
  }

  if (!session) {
    return <LoginPage />;
  }

  if (!perfil) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-white rounded-xl shadow-md p-5 sm:p-8 text-center">
          <p className="text-sm text-slate-600 mb-4">Cargando tu perfil...</p>
          <button
            onClick={cerrarSesion}
            className="text-sm text-blue-600 hover:text-blue-800 font-medium"
          >
            Cerrar sesion
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-white border-b border-slate-200">
        <div
          className={
            "mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3 " +
            (anchoAmplio ? "max-w-7xl" : "max-w-5xl")
          }
        >
          <div className="flex flex-wrap items-center gap-4 sm:gap-6">
            <span className="font-semibold text-slate-800">Gestion de Usuarios</span>
            {perfil.role === "administrador" && (
              <nav className="flex gap-4">
                {TABS.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setTabActiva(tab.key)}
                    className={
                      "text-sm font-medium pb-1 border-b-2 transition-colors " +
                      (tabActiva === tab.key
                        ? "text-blue-600 border-blue-600"
                        : "text-slate-500 border-transparent hover:text-slate-700")
                    }
                  >
                    {tab.label}
                  </button>
                ))}
              </nav>
            )}
          </div>

          <div className="flex items-center gap-3 sm:gap-4">
            <span className="text-sm text-slate-500 max-w-[45vw] sm:max-w-none truncate">
              {perfil.nombre_completo || perfil.email}
            </span>
            <button
              onClick={cerrarSesion}
              className="text-sm text-slate-600 hover:text-slate-900 font-medium whitespace-nowrap"
            >
              Cerrar sesion
            </button>
          </div>
        </div>
      </header>

      <main
        className={
          "mx-auto px-4 py-6 sm:py-8 " + (anchoAmplio ? "max-w-7xl" : "max-w-5xl")
        }
      >
        {perfil.role === "administrador" ? (
          <>
            {tabActiva === "perfiles" && <PerfilesPanel />}
            {tabActiva === "asignacion" && <AsignacionPanel />}
            {tabActiva === "programacion" && <ProgramacionPanel />}
            {tabActiva === "daily" && <DailyPanel />}
          </>
        ) : (
          <MisTrabajosPanel />
        )}
      </main>
    </div>
  );
}
