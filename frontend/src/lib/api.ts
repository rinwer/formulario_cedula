import { supabase } from "./supabaseClient";

/**
 * fetch() que siempre manda un access token vigente. supabase.auth.getSession()
 * refresca el token si ya vencio (usando el refresh token) antes de
 * devolverlo; usar eso aqui en vez de guardar el token una sola vez evita
 * el "Token invalido o expirado" que se veia en movil cuando el celular
 * suspende el timer de auto-refresh (pantalla bloqueada, app en segundo
 * plano) y el usuario vuelve horas despues con el token ya vencido.
 */
export async function fetchAutenticado(input: string, init: RequestInit = {}): Promise<Response> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);

  return fetch(input, { ...init, headers });
}
