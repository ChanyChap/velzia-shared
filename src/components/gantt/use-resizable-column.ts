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
 *  - `onPointerDown`: handler para el div "agarrador" del borde de la
 *    columna. Mientras se arrastra, ajusta el ancho dentro de [min, max] y
 *    bloquea la selección de texto + pone el cursor col-resize en todo el body.
 *  - `reset`: vuelve al ancho por defecto. Lo usa el doble clic sobre el
 *    agarrador, para recuperar el reparto original sin afinar el arrastre.
 */
export function useResizableColumn(
  storageKey: string,
  defaultWidth: number,
  opts?: { min?: number; max?: number; invert?: boolean },
): {
  width: number;
  onPointerDown: (e: React.PointerEvent) => void;
  reset: () => void;
} {
  const min = opts?.min ?? 140;
  const max = opts?.max ?? 560;
  // `invert`: el agarrador no está en el borde derecho de la columna sino en
  // el IZQUIERDO (columnas ancladas a la derecha del panel, como Duración y
  // Responsable en el árbol del Gantt). Ahí la columna crece hacia la
  // izquierda, así que arrastrar hacia la derecha la ESTRECHA: sin este signo
  // el separador huiría del cursor.
  const sign = opts?.invert ? -1 : 1;
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
        const next = Math.max(min, Math.min(max, dragRef.current.startW + sign * delta));
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
    [width, setWidth, min, max, sign],
  );

  // Restablecer al ancho por defecto (doble clic en el agarrador): es la
  // salida rápida cuando el usuario se pasa arrastrando y no acierta a volver.
  const reset = useCallback(() => setWidth(defaultWidth), [setWidth, defaultWidth]);

  return { width, onPointerDown, reset };
}
