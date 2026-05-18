// Factory pattern para inyectar el cliente Supabase desde la app consumidora.
//
// Cada app (Factorías, VelziaCAD, vz-logistica, rt.sig) tiene su propio
// `createBrowserClient` con sus env vars y su tipado Database. El paquete
// @velzia/shared NO puede asumir cuál es. La app debe llamar a
// `setSupabaseClientFactory(() => createClient())` ANTES de renderizar
// cualquier componente del chat.
//
// Si un componente del chat se renderiza sin factory inicializada,
// `getSupabaseClient()` lanza un error claro para que sea fácil de detectar
// en desarrollo.

import type { SupabaseClient } from "@supabase/supabase-js";

// Usamos `any` para los genéricos de Database porque cada app tiene tipos
// distintos y este paquete no quiere acoplarse a ninguno. A runtime es el
// mismo cliente Supabase, así que las llamadas .from().select().eq() etc.
// funcionan idénticamente.
type AnyClient = SupabaseClient<any, any, any>;

type SupabaseClientFactory = () => AnyClient;

let factory: SupabaseClientFactory | null = null;
let cachedClient: AnyClient | null = null;

export function setSupabaseClientFactory(fn: SupabaseClientFactory): void {
  factory = fn;
  cachedClient = null;
}

// Mantiene la firma `createClient()` original de rt.sig para que los
// imports reescritos `from "../../lib/supabase-client"` funcionen sin más
// cambios en los componentes copiados.
export function createClient(): AnyClient {
  if (!factory) {
    throw new Error(
      "[@velzia/shared] Cliente Supabase no inicializado. Llama a " +
        "setSupabaseClientFactory(() => createBrowserClient(...)) en el entry " +
        "point de tu app antes de renderizar componentes del chat."
    );
  }
  if (!cachedClient) {
    cachedClient = factory();
  }
  return cachedClient;
}
