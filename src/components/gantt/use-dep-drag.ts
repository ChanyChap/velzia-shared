'use client';

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { DependencyType, TaskRow } from './types';

export type BarSide = 'start' | 'end';

export interface DepDragState {
  fromRowId: string;
  fromActivityId: string;
  fromSide: BarSide;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

export interface DepDropTarget {
  toRowId: string;
  toActivityId: string;
  toSide: BarSide;
}

interface UseDepDragInput {
  rows: TaskRow[];
  canEdit: boolean;
  containerRef: React.RefObject<HTMLElement | null>;
  onCreateDep: (fromActivityId: string, toActivityId: string, type: DependencyType) => void;
}

function inferDepType(fromSide: BarSide, toSide: BarSide): DependencyType {
  if (fromSide === 'end' && toSide === 'start') return 'FS';
  if (fromSide === 'start' && toSide === 'start') return 'SS';
  if (fromSide === 'end' && toSide === 'end') return 'FF';
  return 'SF';
}

export function useDepDrag(input: UseDepDragInput) {
  const { rows, canEdit, containerRef, onCreateDep } = input;
  const [dragState, setDragState] = useState<DepDragState | null>(null);
  const [hoverTarget, setHoverTarget] = useState<DepDropTarget | null>(null);

  const stateRef = useRef<DepDragState | null>(null);
  stateRef.current = dragState;
  const hoverRef = useRef<DepDropTarget | null>(null);
  hoverRef.current = hoverTarget;

  const beginFromHandle = useCallback(
    (
      rowId: string,
      activityId: string,
      side: BarSide,
      event: ReactPointerEvent,
    ) => {
      if (!canEdit) return;
      event.stopPropagation();
      const rect = containerRef.current?.getBoundingClientRect();
      const scrollLeft = containerRef.current?.scrollLeft ?? 0;
      const scrollTop = containerRef.current?.scrollTop ?? 0;
      const baseX = rect ? rect.left : 0;
      const baseY = rect ? rect.top : 0;
      const x = event.clientX - baseX + scrollLeft;
      const y = event.clientY - baseY + scrollTop;
      setDragState({
        fromRowId: rowId,
        fromActivityId: activityId,
        fromSide: side,
        startX: x,
        startY: y,
        currentX: x,
        currentY: y,
      });
      try {
        (event.target as Element).setPointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }
    },
    [canEdit, containerRef],
  );

  const setHover = useCallback((target: DepDropTarget | null) => {
    setHoverTarget(target);
  }, []);

  useEffect(() => {
    if (!dragState) return;

    function onMove(e: PointerEvent) {
      const rect = containerRef.current?.getBoundingClientRect();
      const scrollLeft = containerRef.current?.scrollLeft ?? 0;
      const scrollTop = containerRef.current?.scrollTop ?? 0;
      const baseX = rect ? rect.left : 0;
      const baseY = rect ? rect.top : 0;
      const x = e.clientX - baseX + scrollLeft;
      const y = e.clientY - baseY + scrollTop;
      const current = stateRef.current;
      if (!current) return;
      setDragState({ ...current, currentX: x, currentY: y });
    }

    function onUp() {
      const current = stateRef.current;
      const hover = hoverRef.current;
      if (current && hover && hover.toActivityId !== current.fromActivityId) {
        const type = inferDepType(current.fromSide, hover.toSide);
        const fromAct = rows.find(r => r.id === current.fromRowId);
        const toAct = rows.find(r => r.id === hover.toRowId);
        if (fromAct && toAct && fromAct.activityId && toAct.activityId) {
          onCreateDep(fromAct.activityId, toAct.activityId, type);
        }
      }
      setDragState(null);
      setHoverTarget(null);
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [dragState, rows, containerRef, onCreateDep]);

  return { dragState, hoverTarget, beginFromHandle, setHover };
}
