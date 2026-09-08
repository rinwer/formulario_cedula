import { supabase } from "./supabaseClient";

// Cuanto margen se le da antes de que expire de verdad: si al token le
// queda menos de esto, se refresca de una vez en vez de arriesgarse a
// que venza a mitad de la peticion.
const MARGEN_EXPIRACION_MS = 60_000;

// Cuanto esperar una respuesta antes de darla por perdida. Sin esto, con
// mala señal (comun en campo) una peticion puede quedar "colgada"
// indefinidamente sin que el usuario sepa si esta pasando algo o no
// (ej. el boton "Guardando..." sin avanzar nunca).
const TIMEOUT_MS = 20_000;

// Un fetch "colgado" por mala señal deja al usuario sin saber si algo
// esta pasando o no. Con AbortController se le pone un limite de
// tiempo; si la conexion fallo ANTES de llegar al servidor (un
// TypeError de fetch, tipico de un wifi que se corta un instante o un
// DNS que no responde) se reintenta una sola vez, porque en ese caso el
// pedido nunca se envio y reintentarlo es seguro incluso para un POST.
// Un timeout (la respuesta tardo demasiado) NO se reintenta solo: no
// hay forma de saber si el servidor ya proceso el pedido, y reintentar
// un POST/PUT ahi podria duplicar el guardado (ej. un avance repetido).
async function fetchConTimeoutYReintento(
  input: string,
  init: RequestInit,
  yaReintento = false
): Promise<Response> {
  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), TIMEOUT_MS);

  try {
    return await fetch(input, { ...init, signal: controlador.signal });
  } catch (error) {
    if (controlador.signal.aborted) {
      throw new Error("La conexion tardo demasiado en responder. Verifica tu señal e intenta de nuevo.");
    }
    if (!yaReintento && error instanceof TypeError) {
      return fetchConTimeoutYReintento(input, init, true);
    }
    throw error;
  } finally {
    clearTimeout(temporizador);
  }
}

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
    const { data: refrescada, error } = await supabase.auth.refreshSession();
    if (error || !refrescada.session) {
      // El refresh token tambien esta vencido/invalido: no hay forma de
      // recuperar la sesion. Si se sigue mandando el access_token viejo,
      // el backend siempre responde 401 y la app queda trabada en
      // "Cargando tu perfil..." sin salida. Cerrar sesion aca dispara
      // onAuthStateChange y la app vuelve sola a la pantalla de login.
      await supabase.auth.signOut();
      session = null;
    } else {
      session = refrescada.session;
    }
  }

  const headers = new Headers(init.headers);
  if (session?.access_token) headers.set("Authorization", `Bearer ${session.access_token}`);

  return fetchConTimeoutYReintento(input, { ...init, headers });
}
