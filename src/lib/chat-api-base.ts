// Helper para llamadas a las API routes `/api/chat/*`.
//
// Las API routes del chat viven SOLO en rt.sig. Cuando los componentes del
// shared se ejecutan en Factorías/VelziaCAD/vz-logistica, cada `fetch
// ("/api/chat/...")` apuntaría al dominio de la app, donde no existe la
// ruta y devolvería 404. Para evitarlo cada app destino setea la env var
// `NEXT_PUBLIC_VELZIA_CHAT_API_BASE=https://refotask.com` y este helper
// prepende esa base al path.
//
// Si el destino es cross-origin: añade `Authorization: Bearer <access_token>`
// (el token de Supabase es válido en cualquier dominio que use el mismo
// proyecto Supabase) y `credentials: "include"`. rt.sig debe responder
// con cabeceras CORS adecuadas para los dominios Velzia.
//
// Si la env var está vacía (default = rt.sig consumiendo su propio chat
// local) el helper degenera en `fetch(path, init)` literal, sin overhead.

import { createClient } from "./supabase-client";

function getBase(): string {
  if (typeof process === "undefined") return "";
  return process.env.NEXT_PUBLIC_VELZIA_CHAT_API_BASE || "";
}

export function getChatApiUrl(path: string): string {
  const base = getBase();
  if (!base) return path;
  // Defensa: si el path ya viene absoluto, no lo tocamos.
  if (/^https?:\/\//i.test(path)) return path;
  return base.replace(/\/+$/, "") + path;
}

export async function chatFetch(
  path: string,
  init?: RequestInit
): Promise<Response> {
  const base = getBase();
  const url = getChatApiUrl(path);

  if (!base) {
    // Same-origin (rt.sig consumiendo su propio backend). Cookie + RLS
    // se encargan; sin Bearer extra.
    return fetch(url, init);
  }

  // Cross-origin: añadir Bearer del token Supabase. El token cubre RLS.
  const supabase = createClient();
  let accessToken: string | undefined;
  try {
    const sessionRes = await supabase.auth.getSession?.();
    accessToken = sessionRes?.data?.session?.access_token;
  } catch {
    accessToken = undefined;
  }

  const headers = new Headers(init?.headers);
  if (accessToken && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }
  return fetch(url, {
    ...init,
    headers,
    credentials: init?.credentials ?? "include",
  });
}
