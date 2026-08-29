import { Session } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import AsignacionPanel from "./components/AsignacionPanel";
import DailyPanel from "./components/DailyPanel";
import LoginPage from "./components/LoginPage";
import MisTrabajosPanel from "./components/MisTrabajosPanel";
import PerfilesPanel from "./components/PerfilesPanel";
import ProgramacionPanel from "./components/ProgramacionPanel";
import VerTrabajosPanel from "./components/VerTrabajosPanel";
import { fetchAutenticado } from "./lib/api";
import { supabase } from "./lib/supabaseClient";
import { Perfil } from "./types";

const API_URL = import.meta.env.VITE_API_URL ? "" : "http://localhost:8000";

type Tab = "perfiles" | "asignacion" | "ver_trabajos" | "programacion" | "daily";

const TABS: { key: Tab; label: string }[] = [
  { key: "perfiles", label: "Perfiles" },
  { key: "asignacion", label: "Trabajos" },
  { key: "ver_trabajos", label: "Ver Trabajos" },
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

  // "Staff" = cualquier rol que usa el layout con pestanas (en vez de la
  // bandeja del lider_cuadrilla): administrador, coordinador y
  // visualizador (este ultimo de solo lectura, solo ve Daily).
  const esStaff =
    perfil?.role === "administrador" ||
    perfil?.role === "coordinador" ||
    perfil?.role === "visualizador";

  // Cada rol ve un subconjunto de pestanas: administrador las ve todas;
  // coordinador todo menos Perfiles (no gestiona usuarios); visualizador
  // solo Daily (rol de solo lectura).
  const tabsVisibles =
    perfil?.role === "administrador"
      ? TABS
      : perfil?.role === "coordinador"
      ? TABS.filter((tab) => tab.key !== "perfiles")
      : perfil?.role === "visualizador"
      ? TABS.filter((tab) => tab.key === "daily")
      : [];

  // tabActiva arranca en "perfiles" antes de saber el rol; si el usuario
  // logueado es coordinador esa pestana no existe para el, asi que se
  // usa la primera pestana visible como respaldo.
  const tabEfectiva = tabsVisibles.some((tab) => tab.key === tabActiva)
    ? tabActiva
    : tabsVisibles[0]?.key;

  const anchoAmplio =
    perfil?.role === "lider_cuadrilla" ||
    tabEfectiva === "daily" ||
    tabEfectiva === "programacion" ||
    tabEfectiva === "ver_trabajos";

  if (cargandoSesion) {
    return (
      <div className="min-h-screen bg-zinc-900 flex items-center justify-center">
        <p className="text-zinc-400 text-sm">Cargando...</p>
      </div>
    );
  }

  if (!session) {
    return <LoginPage />;
  }

  if (!perfil) {
    return (
      <div className="min-h-screen bg-zinc-900 flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-zinc-800 rounded-xl shadow-md p-5 sm:p-8 text-center">
          <p className="text-sm text-zinc-300 mb-4">Cargando tu perfil...</p>
          <button
            onClick={cerrarSesion}
            className="text-sm text-cobre-500 hover:text-cobre-300 font-medium"
          >
            Cerrar sesion
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-900">
      <header className="bg-zinc-800 border-b border-zinc-700">
        <div
          className={
            "mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3 " +
            (anchoAmplio ? "max-w-7xl" : "max-w-5xl")
          }
        >
          <div className="flex flex-wrap items-center gap-4 sm:gap-6">
            <span className="font-semibold text-zinc-50">Seguimiento</span>
            {esStaff && (
              <nav className="flex gap-4">
                {tabsVisibles.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setTabActiva(tab.key)}
                    className={
                      "text-sm font-medium pb-1 border-b-2 transition-colors " +
                      (tabEfectiva === tab.key
                        ? "text-cobre-500 border-cobre-500"
                        : "text-zinc-400 border-transparent hover:text-zinc-200")
                    }
                  >
                    {tab.label}
                  </button>
                ))}
              </nav>
            )}
          </div>

          <div className="flex items-center gap-3 sm:gap-4">
            <span className="text-sm text-zinc-400 max-w-[45vw] sm:max-w-none truncate">
              {perfil.nombre_completo || perfil.email}
            </span>
            <button
              onClick={cerrarSesion}
              className="text-sm text-zinc-300 hover:text-white font-medium whitespace-nowrap"
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
        {esStaff ? (
          <>
            {tabEfectiva === "perfiles" && perfil.role === "administrador" && <PerfilesPanel />}
            {tabEfectiva === "asignacion" &&
              (perfil.role === "administrador" || perfil.role === "coordinador") && (
                <AsignacionPanel />
              )}
            {tabEfectiva === "ver_trabajos" &&
              (perfil.role === "administrador" || perfil.role === "coordinador") && (
                <VerTrabajosPanel />
              )}
            {tabEfectiva === "programacion" &&
              (perfil.role === "administrador" || perfil.role === "coordinador") && (
                <ProgramacionPanel />
              )}
            {tabEfectiva === "daily" && <DailyPanel />}
          </>
        ) : (
          <MisTrabajosPanel />
        )}
      </main>
    </div>
  );
}
