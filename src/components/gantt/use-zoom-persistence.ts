'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  LOCAL_STORAGE_ZOOM_X_KEY,
  LOCAL_STORAGE_ZOOM_Y_KEY,
  LOCAL_STORAGE_VIEWMODE_SCOPE_KEY,
  ROW_HEIGHT,
  ROW_HEIGHT_BOUNDS,
  VIEW_MODE_PX_PER_DAY,
  VIEW_MODE_PX_PER_DAY_BOUNDS,
} from './constants';
import type { ViewMode } from './types';

// Scope de persistencia: 'template' (plantillas EDT) o 'project' (Gantt de
// proyecto). Cada scope mantiene su propio zoom horizontal, vertical y
// viewMode. Persistido en localStorage por usuario+navegador.
//
// scopeId (opcional): si se pasa, la persistencia es POR plantilla o POR
// proyecto en lugar de compartida entre todos. Útil cuando Chany quiere
// ajustar el zoom de una plantilla concreta sin afectar al resto.

export function useZoomPersistence(scope: 'template' | 'project', scopeId?: string) {
  // Si hay scopeId construimos el key como `${scope}:${scopeId}` para que
  // cada plantilla/proyecto recuerde sus valores. Sin scopeId, comparten
  // un único key por scope (comportamiento anterior).
  const k = scopeId ? (`${scope}:${scopeId}` as const) : scope;
  // Lectura perezosa de localStorage en el cliente. SSR-safe: en el primer
  // render usamos defaults; el efecto sincroniza al hidratar.
  const [viewMode, setViewModeState] = useState<ViewMode>('day');
  const [pxPerDay, setPxPerDayState] = useState<number>(VIEW_MODE_PX_PER_DAY.day);
  const [rowHeight, setRowHeightState] = useState<number>(ROW_HEIGHT);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const vm = window.localStorage.getItem(LOCAL_STORAGE_VIEWMODE_SCOPE_KEY(k)) as ViewMode | null;
      const px = window.localStorage.getItem(LOCAL_STORAGE_ZOOM_X_KEY(k));
      const rh = window.localStorage.getItem(LOCAL_STORAGE_ZOOM_Y_KEY(k));
      if (vm === 'day' || vm === 'week' || vm === 'month') {
        setViewModeState(vm);
        if (px) {
          const parsed = parseFloat(px);
          if (Number.isFinite(parsed) && parsed > 0) {
            const bounds = VIEW_MODE_PX_PER_DAY_BOUNDS[vm];
            setPxPerDayState(Math.min(bounds.max, Math.max(bounds.min, parsed)));
          } else {
            setPxPerDayState(VIEW_MODE_PX_PER_DAY[vm]);
          }
        } else {
          setPxPerDayState(VIEW_MODE_PX_PER_DAY[vm]);
        }
      }
      if (rh) {
        const parsed = parseInt(rh, 10);
        if (Number.isFinite(parsed)) {
          setRowHeightState(
            Math.min(ROW_HEIGHT_BOUNDS.max, Math.max(ROW_HEIGHT_BOUNDS.min, parsed)),
          );
        }
      }
    } catch {
      /* ignore */
    } finally {
      setHydrated(true);
    }
  }, [k]);

  const setViewMode = useCallback(
    (next: ViewMode) => {
      setViewModeState(next);
      const px = VIEW_MODE_PX_PER_DAY[next];
      setPxPerDayState(px);
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(LOCAL_STORAGE_VIEWMODE_SCOPE_KEY(k), next);
          window.localStorage.setItem(LOCAL_STORAGE_ZOOM_X_KEY(k), String(px));
        } catch {
          /* ignore */
        }
      }
    },
    [k],
  );

  const setPxPerDay = useCallback(
    (next: number) => {
      setPxPerDayState(next);
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(LOCAL_STORAGE_ZOOM_X_KEY(k), String(next));
        } catch {
          /* ignore */
        }
      }
    },
    [k],
  );

  const setRowHeight = useCallback(
    (next: number) => {
      const clamped = Math.min(ROW_HEIGHT_BOUNDS.max, Math.max(ROW_HEIGHT_BOUNDS.min, next));
      setRowHeightState(clamped);
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(LOCAL_STORAGE_ZOOM_Y_KEY(k), String(clamped));
        } catch {
          /* ignore */
        }
      }
    },
    [k],
  );

  return {
    viewMode,
    setViewMode,
    pxPerDay,
    setPxPerDay,
    rowHeight,
    setRowHeight,
    hydrated,
  };
}
