'use client';

import { useCallback, useMemo } from 'react';
import { addDays, differenceInCalendarDays } from 'date-fns';
import { ANCHOR_DATE, ROW_HEIGHT as DEFAULT_ROW_HEIGHT, BAR_HEIGHT as DEFAULT_BAR_HEIGHT } from './constants';

interface LayoutInput {
  pxPerDay: number;
  totalRows: number;
  paddingDaysBefore: number;
  paddingDaysAfter: number;
  maxEndDate: Date;
  minStartDate: Date;
  // Altura de fila configurable (zoom vertical). Si no se pasa, usa el default.
  rowHeight?: number;
}

export function useGanttLayout(input: LayoutInput) {
  const { pxPerDay, totalRows, paddingDaysBefore, paddingDaysAfter, maxEndDate, minStartDate } =
    input;
  const ROW_HEIGHT = input.rowHeight ?? DEFAULT_ROW_HEIGHT;
  // Cápsula proporcional al alto de la fila — al hacer zoom vertical también
  // crece la barra (Chany 2026-05-29). Mínimo 12px para que siga siendo
  // legible la duración interna; máximo 48px para que no se hinche.
  const BAR_HEIGHT = Math.max(12, Math.min(48, Math.round(ROW_HEIGHT * 0.55)));
  // Padding vertical recalculado en función de la altura actual para que la
  // barra siga centrada en la fila al hacer zoom vertical.
  const ROW_PADDING_Y = (ROW_HEIGHT - BAR_HEIGHT) / 2;
  // DEFAULT_BAR_HEIGHT importado pero no usado directamente — la barra es
  // ahora siempre derivada. Lo dejamos como referencia para tests/snapshot.
  void DEFAULT_BAR_HEIGHT;

  const startDate = useMemo(
    () => addDays(minStartDate, -paddingDaysBefore),
    [minStartDate, paddingDaysBefore],
  );

  const endDate = useMemo(
    () => addDays(maxEndDate, paddingDaysAfter),
    [maxEndDate, paddingDaysAfter],
  );

  const totalDays = useMemo(
    () => Math.max(1, differenceInCalendarDays(endDate, startDate) + 1),
    [endDate, startDate],
  );

  const totalWidth = useMemo(() => totalDays * pxPerDay, [totalDays, pxPerDay]);

  const totalHeight = useMemo(() => totalRows * ROW_HEIGHT, [totalRows, ROW_HEIGHT]);

  const xOf = useCallback(
    (date: Date) => differenceInCalendarDays(date, startDate) * pxPerDay,
    [pxPerDay, startDate],
  );

  const dateOf = useCallback(
    (x: number) => addDays(startDate, Math.round(x / pxPerDay)),
    [pxPerDay, startDate],
  );

  const rowYOf = useCallback((rowIndex: number) => rowIndex * ROW_HEIGHT, [ROW_HEIGHT]);

  const barYOf = useCallback(
    (rowIndex: number) => rowIndex * ROW_HEIGHT + ROW_PADDING_Y,
    [ROW_HEIGHT, ROW_PADDING_Y],
  );

  const barRectFor = useCallback(
    (rowIndex: number, start: Date, days: number) => {
      const x = xOf(start);
      // Ancho mínimo 6px: una cápsula sub-día (ej. actividad de 1h = 0.125
      // días) debe seguir siendo legible, no una línea casi invisible. Antes
      // era 2px, demasiado fino para distinguir una barra real de un artefacto.
      const width = Math.max(6, days * pxPerDay);
      return {
        x,
        y: barYOf(rowIndex),
        width,
        height: BAR_HEIGHT,
      };
    },
    [xOf, barYOf, pxPerDay],
  );

  return {
    pxPerDay,
    rowHeight: ROW_HEIGHT,
    barHeight: BAR_HEIGHT,
    startDate,
    endDate,
    totalDays,
    totalWidth,
    totalHeight,
    xOf,
    dateOf,
    rowYOf,
    barYOf,
    barRectFor,
    anchor: ANCHOR_DATE,
  };
}

export type GanttLayout = ReturnType<typeof useGanttLayout>;
