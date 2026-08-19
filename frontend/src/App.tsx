import { Session } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import LoginPage from "./components/LoginPage";
import PerfilesPanel from "./components/PerfilesPanel";
import { supabase } from "./lib/supabaseClient";
import { Perfil } from "./types";

const API_URL = import.meta.env.VITE_API_URL ? "" : "http://localhost:8000";

type Tab = "perfiles";

const TABS: { key: Tab; label: string }[] = [{ key: "perfiles", label: "Perfiles" }];

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
    fetch(`${API_URL}/api/me`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
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
        <div className="w-full max-w-sm bg-white rounded-xl shadow-md p-8 text-center">
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
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-6">
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

          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-500">{perfil.nombre_completo || perfil.email}</span>
            <button
              onClick={cerrarSesion}
              className="text-sm text-slate-600 hover:text-slate-900 font-medium"
            >
              Cerrar sesion
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {perfil.role === "administrador" ? (
          tabActiva === "perfiles" && <PerfilesPanel accessToken={session.access_token} />
        ) : (
          <div className="bg-white rounded-xl shadow-md p-8">
            <h1 className="text-lg font-semibold text-slate-800 mb-2">
              Bienvenido, {perfil.nombre_completo || perfil.email}
            </h1>
            <p className="text-sm text-slate-600">
              Tu panel de lider de cuadrilla estara disponible proximamente.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
