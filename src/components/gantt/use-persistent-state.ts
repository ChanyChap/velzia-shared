"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * usePersistentState — estado React que se guarda en las preferencias del
 * USUARIO, para que filtros, zoom y preferencias de vista sobrevivan a recargas
 * y se sincronicen entre dispositivos del mismo usuario.
 *
 * Doble capa:
 *  1. localStorage (instantáneo, por dispositivo) → arranque sin parpadeo.
 *  2. Servidor (tabla user_preferences, por usuario) → fuente de verdad que
 *     sincroniza entre dispositivos. Se carga una sola vez por sesión (store
 *     singleton) y se escribe con debounce.
 *
 * Si el servidor no responde o la tabla aún no existe, se degrada a solo
 * localStorage sin romper nada (el blob remoto llega vacío).
 *
 * Funciona como useState pero requiere una `key` única.
 */

// ───────────────────────── Store singleton (módulo) ─────────────────────────
// Cargamos el blob de preferencias del usuario una sola vez y lo compartimos
// entre todas las instancias del hook. `currentBlob` acumula el estado completo
// (incluidas keys de otras pantallas) para que cada PUT no pise lo que no toca.

type PrefBlob = Record<string, unknown>;

let serverLoadPromise: Promise<PrefBlob> | null = null;
let currentBlob: PrefBlob = {};
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function loadServerPrefs(): Promise<PrefBlob> {
  if (typeof window === "undefined") return Promise.resolve({});
  if (serverLoadPromise) return serverLoadPromise;
  serverLoadPromise = fetch("/api/user-preferences")
    .then((r) => (r.ok ? r.json() : { prefs: {} }))
    .then((d: { prefs?: PrefBlob }) => {
      const prefs = d?.prefs && typeof d.prefs === "object" ? d.prefs : {};
      // Sembramos el blob con TODO lo del servidor para no perder keys ajenas
      // a la pantalla actual en los PUT posteriores.
      currentBlob = { ...prefs, ...currentBlob };
      return prefs;
    })
    .catch(() => ({}) as PrefBlob);
  return serverLoadPromise;
}

function scheduleFlush() {
  if (typeof window === "undefined") return;
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushTimer = null;
    // Fire-and-forget: si falla (tabla inexistente, offline) seguimos con
    // localStorage; no molestamos al usuario.
    fetch("/api/user-preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prefs: currentBlob }),
    }).catch(() => {});
  }, 800);
}

function setServerPref(key: string, value: unknown) {
  currentBlob[key] = value;
  scheduleFlush();
}

// ───────────────────────────────── Hook ─────────────────────────────────────
export function usePersistentState<T>(
  key: string,
  defaultValue: T,
): [T, (value: T | ((prev: T) => T)) => void] {
  // Lectura perezosa: solo en el primer render y solo en cliente.
  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") return defaultValue;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw === null) return defaultValue;
      return JSON.parse(raw) as T;
    } catch {
      return defaultValue;
    }
  });

  const keyRef = useRef(key);
  keyRef.current = key;
  // Ref al valor actual para poder sembrar el servidor tras la carga inicial.
  const valueRef = useRef(value);
  valueRef.current = value;
  // Hasta que no resolvemos la carga del servidor NO escribimos en él, para no
  // pisar el valor remoto con el de localStorage en una carrera de arranque.
  const serverLoadedRef = useRef(false);

  // Carga inicial desde servidor (una vez). Si la key existe en el servidor,
  // adoptamos su valor; si no, sembramos el servidor con el valor local actual.
  useEffect(() => {
    if (typeof window === "undefined") return;
    let active = true;
    loadServerPrefs().then((server) => {
      if (!active) return;
      serverLoadedRef.current = true;
      if (Object.prototype.hasOwnProperty.call(server, keyRef.current)) {
        const remote = server[keyRef.current] as T;
        setValue(remote);
        try {
          window.localStorage.setItem(keyRef.current, JSON.stringify(remote));
        } catch {
          /* cuota / modo privado */
        }
      } else {
        // Usuario sin esta preferencia guardada todavía: la sembramos.
        setServerPref(keyRef.current, valueRef.current);
      }
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persistencia en cada cambio: localStorage siempre; servidor solo tras la
  // carga inicial (evita la carrera de arranque descrita arriba).
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(keyRef.current, JSON.stringify(value));
    } catch {
      // Cuota llena o modo privado: ignoramos, el estado sigue en memoria.
    }
    if (serverLoadedRef.current) setServerPref(keyRef.current, value);
  }, [value]);

  const setter = useCallback((next: T | ((prev: T) => T)) => {
    setValue(next);
  }, []);

  return [value, setter];
}
