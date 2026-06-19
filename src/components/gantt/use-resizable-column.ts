"use client";

import { useCallback, useRef } from "react";
import { usePersistentState } from "./use-persistent-state";

/**
 * useResizableColumn — ancho de la primera columna (la de nombre: persona u
 * obra) de un timeline, arrastrable por el usuario y persistido en el
 * dispositivo (localStorage) para que cada usuario conserve su preferencia
 * entre recargas y entre sesiones.
 *
 * Devuelve:
 *  - `width`: ancho actual en píxeles (úsalo en gridTemplateColumns: `${width}px 1fr`).
 *  - `onPointerDown`: handler para el div "agarrador" del borde derecho de la
 *    columna. Mientras se arrastra, ajusta el ancho dentro de [min, max] y
 *    bloquea la selección de texto + pone el cursor col-resize en todo el body.
 */
export function useResizableColumn(
  storageKey: string,
  defaultWidth: number,
  opts?: { min?: number; max?: number },
): { width: number; onPointerDown: (e: React.PointerEvent) => void } {
  const min = opts?.min ?? 140;
  const max = opts?.max ?? 560;
  const [width, setWidth] = usePersistentState<number>(storageKey, defaultWidth);
  // Punto de partida del arrastre: posición X y ancho al pulsar.
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Evitamos que el agarrador dispare otros handlers (p.ej. el click del
      // botón de obra) ni inicie una selección de texto.
      e.preventDefault();
      e.stopPropagation();
      dragRef.current = { startX: e.clientX, startW: width };

      const onMove = (ev: PointerEvent) => {
        if (!dragRef.current) return;
        const delta = ev.clientX - dragRef.current.startX;
        const next = Math.max(min, Math.min(max, dragRef.current.startW + delta));
        setWidth(next);
      };
      const onUp = () => {
        dragRef.current = null;
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        document.body.style.userSelect = "";
        document.body.style.cursor = "";
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";
    },
    [width, setWidth, min, max],
  );

  return { width, onPointerDown };
}
