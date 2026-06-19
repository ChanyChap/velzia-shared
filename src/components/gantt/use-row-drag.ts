'use client';

import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { TaskRow } from './types';
import { HEADER_HEIGHT, ROW_HEIGHT as DEFAULT_ROW_HEIGHT } from './constants';

export interface RowDragState {
  fromRowId: string;
  fromIndex: number;
  startY: number;
  currentY: number;
  // Indice del row sobre el que está actualmente el puntero (drop target).
  hoverIndex: number;
}

interface UseRowDragInput {
  rows: TaskRow[];
  canEdit: boolean;
  containerRef: React.RefObject<HTMLElement | null>;
  onReorder: (fromRowId: string, hoverIndex: number) => void;
  // Altura de fila ACTUAL (zoom vertical). Debe coincidir con la del render
  // para que la línea azul de drop caiga justo donde está el cursor. Si no se
  // pasa, usa la constante por defecto (Chany 29 may).
  rowHeight?: number;
}

// Píxeles que hay que mover antes de que un pointerdown se considere "drag".
// Por debajo de este umbral se trata como click (selección) — así se puede
// arrastrar desde CUALQUIER parte de la fila sin romper el click (Chany 29 may).
const DRAG_THRESHOLD = 4;

export function useRowDrag(input: UseRowDragInput) {
  const { rows, canEdit, containerRef, onReorder } = input;
  const ROW_HEIGHT = input.rowHeight ?? DEFAULT_ROW_HEIGHT;
  const rowHeightRef = useRef(ROW_HEIGHT);
  rowHeightRef.current = ROW_HEIGHT;
  const [state, setState] = useState<RowDragState | null>(null);
  const stateRef = useRef<RowDragState | null>(null);
  stateRef.current = state;
  // Refs vivos para que los listeners de window vean siempre lo último.
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const onReorderRef = useRef(onReorder);
  onReorderRef.current = onReorder;

  // Inicia el seguimiento desde un pointerdown (en la fila entera o en el asa).
  // No activa el drag hasta superar DRAG_THRESHOLD; mientras tanto el click de
  // selección sigue funcionando.
  const beginFromHandle = useCallback(
    (rowId: string, event: ReactPointerEvent) => {
      if (!canEdit) return;
      if (event.button !== undefined && event.button !== 0) return; // solo botón primario
      const fromIndex = rowsRef.current.findIndex(r => r.id === rowId);
      if (fromIndex < 0) return;

      const startX = event.clientX;
      const startY = event.clientY;
      let active = false;

      // hoverIndex = HUECO de inserción (0..length), redondeando al gap más
      // cercano al cursor. Con esto la línea azul (que se dibuja en el borde
      // superior de la fila hoverIndex) cae justo en el hueco donde quedará el
      // item, y el resultado del reorden coincide EXACTO con la línea. Antes era
      // Math.floor (fila bajo el cursor, clamp length-1): no se podía soltar al
      // final y, con el +1 del handler, el item caía una posición por debajo de
      // la línea (Chany 31 may — "lo suelto y lo pone en otro sitio").
      const computeHover = (clientY: number): number => {
        const wrapper = containerRef.current;
        if (!wrapper) return fromIndex;
        const rect = wrapper.getBoundingClientRect();
        const yInBody = clientY - rect.top + wrapper.scrollTop - HEADER_HEIGHT;
        return Math.max(0, Math.min(rowsRef.current.length, Math.round(yInBody / rowHeightRef.current)));
      };

      const onMove = (e: PointerEvent) => {
        if (!active) {
          if (Math.abs(e.clientY - startY) < DRAG_THRESHOLD && Math.abs(e.clientX - startX) < DRAG_THRESHOLD) {
            return; // todavía es un click potencial, no un drag
          }
          active = true;
        }
        const hoverIndex = computeHover(e.clientY);
        setState({ fromRowId: rowId, fromIndex, startY, currentY: e.clientY, hoverIndex });
      };

      const cleanup = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
      };

      const onUp = () => {
        cleanup();
        const cur = stateRef.current;
        if (active && cur && cur.hoverIndex !== cur.fromIndex) {
          onReorderRef.current(cur.fromRowId, cur.hoverIndex);
        }
        if (active) {
          // Tras un drag real, suprimimos el click que dispararía el navegador
          // para que la fila no se "seleccione" al soltar.
          const suppress = (ce: Event) => {
            ce.stopPropagation();
            ce.preventDefault();
          };
          window.addEventListener('click', suppress, { capture: true, once: true });
          // Por si no llega ningún click, limpiamos el listener al poco.
          setTimeout(() => window.removeEventListener('click', suppress, true), 250);
        }
        setState(null);
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    },
    [canEdit, containerRef],
  );

  return { state, beginFromHandle };
}
