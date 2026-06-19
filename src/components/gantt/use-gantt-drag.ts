'use client';

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { DragState, TaskRow } from './types';

interface UseGanttDragInput {
  pxPerDay: number;
  rows: TaskRow[];
  canEdit: boolean;
  onResizeCommit: (row: TaskRow, newDays: number) => void;
  onMoveCommit: (row: TaskRow, daysDelta: number) => void;
}

interface UseGanttDragResult {
  dragState: DragState | null;
  beginResize: (rowId: string, event: ReactPointerEvent) => void;
  beginMove: (rowId: string, event: ReactPointerEvent) => void;
  liveDelta: number;
  liveDays: number;
}

export function useGanttDrag(input: UseGanttDragInput): UseGanttDragResult {
  const { pxPerDay, rows, canEdit, onResizeCommit, onMoveCommit } = input;

  const [dragState, setDragState] = useState<DragState | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  dragStateRef.current = dragState;

  const beginResize = useCallback(
    (rowId: string, event: ReactPointerEvent) => {
      if (!canEdit) return;
      const row = rows.find(r => r.id === rowId);
      if (!row || !row.resizable) return;
      const next: DragState = {
        rowId,
        kind: 'resize',
        startX: event.clientX,
        currentX: event.clientX,
        originalDays: row.days,
        originalStartDate: row.startDate,
        originalLeadDays: row.leadDays ?? 0,
      };
      setDragState(next);
      try {
        (event.target as Element).setPointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }
    },
    [canEdit, rows],
  );

  const beginMove = useCallback(
    (rowId: string, event: ReactPointerEvent) => {
      if (!canEdit) return;
      const row = rows.find(r => r.id === rowId);
      if (!row || !row.draggable) return;
      const next: DragState = {
        rowId,
        kind: 'move',
        startX: event.clientX,
        currentX: event.clientX,
        originalDays: row.days,
        originalStartDate: row.startDate,
        originalLeadDays: row.leadDays ?? 0,
      };
      setDragState(next);
      try {
        (event.target as Element).setPointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }
    },
    [canEdit, rows],
  );

  useEffect(() => {
    if (!dragState) return;

    function onPointerMove(e: PointerEvent) {
      const current = dragStateRef.current;
      if (!current) return;
      setDragState({ ...current, currentX: e.clientX });
    }

    function onPointerUp() {
      const current = dragStateRef.current;
      if (!current) {
        setDragState(null);
        return;
      }
      const deltaX = current.currentX - current.startX;
      const daysDelta = Math.round(deltaX / pxPerDay);
      const row = rows.find(r => r.id === current.rowId);
      if (row && daysDelta !== 0) {
        if (current.kind === 'resize') {
          const newDays = Math.max(0, current.originalDays + daysDelta);
          onResizeCommit(row, newDays);
        } else {
          onMoveCommit(row, daysDelta);
        }
      }
      setDragState(null);
    }

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
  }, [dragState, pxPerDay, rows, onResizeCommit, onMoveCommit]);

  let liveDelta = 0;
  let liveDays = 0;
  if (dragState) {
    const deltaX = dragState.currentX - dragState.startX;
    liveDelta = deltaX;
    const daysDelta = Math.round(deltaX / pxPerDay);
    if (dragState.kind === 'resize') {
      liveDays = Math.max(0, dragState.originalDays + daysDelta);
    } else {
      liveDays = dragState.originalDays;
    }
  }

  return { dragState, beginResize, beginMove, liveDelta, liveDays };
}
