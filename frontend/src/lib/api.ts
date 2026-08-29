import { supabase } from "./supabaseClient";

// Cuanto margen se le da antes de que expire de verdad: si al token le
// queda menos de esto, se refresca de una vez en vez de arriesgarse a
// que venza a mitad de la peticion.
const MARGEN_EXPIRACION_MS = 60_000;

/**
 * fetch() que siempre manda un access token vigente. No basta con confiar
 * en que supabase.auth.getSession() siempre refresque a tiempo por su
 * cuenta: eso dejaba pasar un "Token invalido o expirado" justo al cargar
 * la pagina, cuando getSession() todavia devolvia la sesion vieja
 * cacheada mientras el refresh automatico apenas arrancaba en segundo
 * plano (una carrera entre el efecto que carga la sesion y el que llama
 * a /api/me). Aca se revisa explicitamente expires_at y se fuerza un
 * refreshSession() si ya vencio o esta por vencer, en vez de asumir que
 * el token que devuelve getSession() ya es valido.
 */
export async function fetchAutenticado(input: string, init: RequestInit = {}): Promise<Response> {
  const { data } = await supabase.auth.getSession();
  let session = data.session;

  const expiraPronto =
    !session || (session.expires_at ?? 0) * 1000 - Date.now() < MARGEN_EXPIRACION_MS;

  if (expiraPronto) {
    const { data: refrescada } = await supabase.auth.refreshSession();
    session = refrescada.session ?? session;
  }

  const headers = new Headers(init.headers);
  if (session?.access_token) headers.set("Authorization", `Bearer ${session.access_token}`);

  return fetch(input, { ...init, headers });
}
