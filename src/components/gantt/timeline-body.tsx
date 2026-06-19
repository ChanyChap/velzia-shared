'use client';

import { memo, useMemo, useCallback, type PointerEvent as ReactPointerEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { addDays, isMonday, isWeekend } from 'date-fns';
import { BAR_HEIGHT, COLORS, HEADER_HEIGHT, PROJECT_START_COLOR, DEPENDENCY_OFFSET } from './constants';
import type { GanttDependency, TaskRow, DragState } from './types';
import type { GanttLayout } from './use-gantt-layout';
import { ArrowMarkers, GanttDependencyArrow, type RowObstacle } from './gantt-dependency-arrow';
import { GanttBar } from './gantt-bar';
import { TimelineHeader } from './timeline-header';
import type { BaselineBar } from './use-baseline-render';
import type { BarSide, DepDragState, DepDropTarget } from './use-dep-drag';
import { type WorkingCalendar, workingHoursOfDay, isNonWorkingDate } from './working-calendar';

// Umbral de zoom (px por día) a partir del cual dibujamos sub-líneas de cada
// HORA dentro del día. Por debajo solo marcamos el inicio de jornada (línea
// fuerte). Coincide con el umbral de la cabecera (timeline-header).
const HOUR_MARKS_MIN_PX_PER_DAY = 60;

// Ancho de fila/barra en días-calendario: usa widthDays (modo calendario,
// cubre findes/festivos) si está; si no, la duración abstracta `days`.
function spanDaysOf(row: TaskRow): number {
  return row.widthDays ?? row.days;
}

// Medición de ancho de texto cacheada (un canvas singleton a nivel de módulo +
// cache por texto). La usamos para que el router de flechas conozca cuánto ocupa
// el NOMBRE/subtítulo a la derecha de cada barra y no pase ninguna línea por
// encima del texto. La fuente DEBE coincidir con la que pinta gantt-bar.tsx
// (ui-sans-serif, system-ui, sans-serif). Sobreestimar es seguro (rodeo mayor,
// nunca cruce); por eso el fallback sin canvas multiplica por un factor amplio.
let _measureCtx: CanvasRenderingContext2D | null = null;
const _measureCache = new Map<string, number>();
function measureTextWidth(text: string, fontPx: number): number {
  if (!text) return 0;
  const key = fontPx + '|' + text;
  const hit = _measureCache.get(key);
  if (hit !== undefined) return hit;
  let w: number;
  if (typeof document !== 'undefined') {
    if (!_measureCtx) _measureCtx = document.createElement('canvas').getContext('2d');
    if (_measureCtx) {
      _measureCtx.font = `${fontPx}px ui-sans-serif, system-ui, sans-serif`;
      w = _measureCtx.measureText(text).width;
    } else {
      w = text.length * fontPx * 0.58;
    }
  } else {
    w = text.length * fontPx * 0.58;
  }
  _measureCache.set(key, w);
  return w;
}

interface TimelineBodyProps {
  rows: TaskRow[];
  dependencies: GanttDependency[];
  layout: GanttLayout;
  viewMode: 'day' | 'week' | 'month';
  selectedRowIds: Set<string>;
  hoverRowId: string | null;
  matchedRowIds: Set<string> | null;
  dragState: DragState | null;
  dragDeltaX: number;
  baselineBars?: Map<string, BaselineBar>;
  baselineName?: string;
  depDragState?: DepDragState | null;
  depHoverTarget?: DepDropTarget | null;
  onDepHoverChange?: (target: DepDropTarget | null) => void;
  onClickDep?: (depId: string) => void;
  onDoubleClickDep?: (depId: string) => void;
  // id de la dependencia actualmente seleccionada (resaltada en naranja).
  selectedDepId?: string | null;
  onBeginDepDrag?: (rowId: string, activityId: string, side: BarSide, event: ReactPointerEvent) => void;
  onHoverRow: (rowId: string | null) => void;
  onSelect: (rowId: string, event: ReactMouseEvent) => void;
  onOpen: (rowId: string) => void;
  onResizeStart: (rowId: string, event: ReactPointerEvent) => void;
  onMoveStart: (rowId: string, event: ReactPointerEvent) => void;
  onContextMenuRow?: (rowId: string, x: number, y: number) => void;
  // Si true, las cápsulas de TODAS las filas animan su deslizamiento
  // (translate y width) durante este render. Lo activa el contenedor durante
  // ~350ms tras un cambio de dep o duración. NO activar durante drag manual.
  animateAllBars?: boolean;
  // Calendario laboral del tenant. Si está, se dibujan marcas de hora (vista
  // día + zoom alto) y los tooltips de barra muestran la hora real. Sin él, el
  // body se comporta exactamente como antes (degradación elegante).
  calendar?: WorkingCalendar | null;
  // Scroll vertical actual del contenedor. Se usa para "fijar" la cabecera de
  // fechas: el grupo del header se traslada en Y por scrollTop para quedar
  // siempre pegado al borde superior visible aunque se haga scroll hacia abajo.
  scrollTop?: number;
}

function TimelineBodyImpl({
  rows,
  dependencies,
  layout,
  viewMode,
  selectedRowIds,
  hoverRowId,
  matchedRowIds,
  dragState,
  dragDeltaX,
  baselineBars,
  baselineName,
  depDragState,
  depHoverTarget,
  onDepHoverChange,
  onClickDep,
  onDoubleClickDep,
  selectedDepId,
  onBeginDepDrag,
  onHoverRow,
  onSelect,
  onOpen,
  onResizeStart,
  onMoveStart,
  onContextMenuRow,
  animateAllBars = false,
  calendar,
  scrollTop = 0,
}: TimelineBodyProps) {
  const { totalWidth, totalHeight, xOf, barRectFor, totalDays, startDate, pxPerDay, rowHeight: ROW_HEIGHT } = layout;

  const rowIndexById = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((r, i) => map.set(r.id, i));
    return map;
  }, [rows]);

  // Offset de "carril" por dependencia: las líneas cuyo tramo vertical cae en
  // la misma X se separan ligeramente para no confundirse (Chany 29 may).
  const depLaneOffsets = useMemo(() => {
    const off = DEPENDENCY_OFFSET;
    const xOf = layout.xOf;
    // X del tramo vertical de cada dependencia según su tipo.
    const vx = (dep: GanttDependency): number | null => {
      const fi = rowIndexById.get(dep.fromRowId);
      const ti = rowIndexById.get(dep.toRowId);
      if (fi == null || ti == null) return null;
      const fr = rows[fi]; const tr = rows[ti];
      if (!fr || !tr) return null;
      const fEnd = xOf(addDays(fr.startDate, Math.max(0, spanDaysOf(fr))));
      const fStart = xOf(fr.startDate);
      const tStart = xOf(tr.startDate);
      const tEnd = xOf(addDays(tr.startDate, Math.max(0, spanDaysOf(tr))));
      switch (dep.type) {
        case 'FS': return Math.max(fStart + off, tStart - off);
        case 'SS': return Math.min(fStart, tStart) - off;
        case 'FF': return Math.max(fEnd, tEnd) + off;
        default: return (fStart + tEnd) / 2; // SF
      }
    };
    // Agrupamos por X redondeada; dentro de cada grupo con >1, offset centrado.
    const groups = new Map<number, string[]>();
    for (const dep of dependencies) {
      if (dep.isVirtual) continue;
      const x = vx(dep);
      if (x == null) continue;
      const key = Math.round(x);
      const arr = groups.get(key) || [];
      arr.push(dep.id);
      groups.set(key, arr);
    }
    const result = new Map<string, number>();
    groups.forEach(ids => {
      if (ids.length < 2) return;
      ids.sort(); // orden estable
      // Separación entre líneas de dependencia paralelas que comparten corredor.
      // Moderada: lo justo para distinguirlas sin crear escalones/curvas feas por
      // sobre-desplazamiento. La limpieza la da el vertical único + esquivar
      // cápsulas, no una separación enorme. (Chany 2 jun)
      const step = 10;
      ids.forEach((id, i) => result.set(id, (i - (ids.length - 1) / 2) * step));
    });
    return result;
  }, [dependencies, rows, rowIndexById, layout]);

  // Filas con una línea de dependencia que sale/llega por su lado DERECHO:
  // predecesora de una FS/FF (la flecha sale por la derecha) o sucesora de una
  // FF/SF (la flecha llega por la derecha). En esas barras el NOMBRE se indenta
  // un poco más a la derecha (rightLinePad) para que la línea no lo solape.
  const rightLineRowIds = useMemo(() => {
    const s = new Set<string>();
    for (const dep of dependencies) {
      if (dep.isVirtual) continue;
      if (dep.type === 'FS' || dep.type === 'FF') s.add(dep.fromRowId);
      if (dep.type === 'FF' || dep.type === 'SF') s.add(dep.toRowId);
    }
    return s;
  }, [dependencies]);

  const today = useMemo(() => new Date(), []);

  const verticalLines = useMemo(() => {
    const lines: { x: number; color: string }[] = [];
    if (viewMode === 'day') {
      for (let i = 0; i <= totalDays; i++) {
        const d = addDays(startDate, i);
        const x = xOf(d);
        lines.push({
          x,
          color: isMonday(d) ? COLORS.gridWeek : COLORS.gridDay,
        });
      }
    } else if (viewMode === 'week') {
      for (let i = 0; i <= totalDays; i += 7) {
        const d = addDays(startDate, i);
        lines.push({ x: xOf(d), color: COLORS.gridWeek });
      }
    } else {
      for (let i = 0; i <= totalDays; i += 7) {
        const d = addDays(startDate, i);
        if (d.getDate() <= 7) {
          lines.push({ x: xOf(d), color: COLORS.gridMonth });
        }
      }
    }
    return lines;
  }, [viewMode, totalDays, startDate, xOf]);

  // Bandas grises de días NO laborables. Con calendario del tenant marcamos
  // findes Y festivos reales (isNonWorkingDate); sin calendario, solo findes
  // (sábado/domingo). Así el usuario ve de un vistazo qué días no se trabaja.
  const weekendBands = useMemo(() => {
    if (viewMode !== 'day' || pxPerDay < 12) return [];
    const bands: { x: number; width: number }[] = [];
    for (let i = 0; i < totalDays; i++) {
      const d = addDays(startDate, i);
      const nonWorking = calendar ? isNonWorkingDate(calendar, d) : isWeekend(d);
      if (nonWorking) {
        bands.push({ x: xOf(d), width: pxPerDay });
      }
    }
    return bands;
  }, [viewMode, pxPerDay, totalDays, startDate, xOf, calendar]);

  const todayX = useMemo(() => {
    const x = xOf(today);
    if (x < 0 || x > totalWidth) return null;
    return x;
  }, [xOf, today, totalWidth]);

  // Sub-líneas de HORA dentro de cada día laborable (solo con calendario y
  // vista de día). Línea FUERTE al inicio de jornada siempre; una línea fina
  // por cada hora de jornada cuando el zoom es alto (para que se lean). En
  // findes/festivos no se dibuja nada (no hay horas laborables). Chany 30 may.
  const hourLines = useMemo(() => {
    if (!calendar || viewMode !== 'day') return [] as { x: number; strong: boolean }[];
    const pxPerHour = pxPerDay / calendar.hoursPerDay;
    const showHours = pxPerDay >= HOUR_MARKS_MIN_PX_PER_DAY;
    const result: { x: number; strong: boolean }[] = [];
    for (let i = 0; i < totalDays; i++) {
      const date = addDays(startDate, i);
      const dayHours = workingHoursOfDay(calendar, date);
      if (dayHours <= 0) continue;
      const dayX = xOf(date);
      result.push({ x: dayX, strong: true });
      if (showHours) {
        for (let h = 1; h < Math.ceil(dayHours); h++) {
          result.push({ x: dayX + h * pxPerHour, strong: false });
        }
      }
    }
    return result;
  }, [calendar, viewMode, pxPerDay, totalDays, startDate, xOf]);

  // "Project start" — fecha de inicio del proyecto/plantilla. Es la
  // startDate más temprana entre las filas tipo activity/task. Se pinta
  // como línea naranja vertical estilo Bryntum.
  const projectStartDate = useMemo<Date | null>(() => {
    let earliest: Date | null = null;
    for (const r of rows) {
      if (r.kind === 'wp') continue;
      if (!earliest || r.startDate < earliest) earliest = r.startDate;
    }
    return earliest;
  }, [rows]);
  const projectStartX = projectStartDate ? xOf(projectStartDate) : null;

  // Banda padre tipo Bryntum: para cada fila WP, dibujamos una barra horizontal
  // azul clara que cubre el rango total de sus actividades hijas. Da contexto
  // visual rápido del scope temporal del paquete de trabajo.
  const wpRangeBars = useMemo(() => {
    const out: { rowIdx: number; x: number; width: number }[] = [];
    for (let i = 0; i < rows.length; i++) {
      const wp = rows[i];
      if (wp.kind !== 'wp') continue;
      let minStart: Date | null = null;
      let maxEnd: Date | null = null;
      // Recorremos las filas siguientes hasta encontrar otro WP del mismo
      // depth o un nivel superior (fin de la sub-rama).
      for (let j = i + 1; j < rows.length; j++) {
        const r = rows[j];
        if (r.kind === 'wp' && r.depth <= wp.depth) break;
        if (r.kind === 'wp') continue;
        const end = addDays(r.startDate, Math.max(0, spanDaysOf(r)));
        if (!minStart || r.startDate < minStart) minStart = r.startDate;
        if (!maxEnd || end > maxEnd) maxEnd = end;
      }
      if (!minStart || !maxEnd) continue;
      const x = xOf(minStart);
      const width = Math.max(2, xOf(maxEnd) - x);
      out.push({ rowIdx: i, x, width });
    }
    return out;
  }, [rows, xOf]);

  const onSvgPointerMove = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      if (!depDragState || !onDepHoverChange) return;
      const svg = e.currentTarget;
      const ctm = svg.getScreenCTM();
      if (!ctm) return;
      const inv = ctm.inverse();
      const pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const local = pt.matrixTransform(inv);
      const yInBody = local.y - HEADER_HEIGHT;
      const rowIdx = Math.floor(yInBody / ROW_HEIGHT);
      if (rowIdx < 0 || rowIdx >= rows.length) {
        if (depHoverTarget) onDepHoverChange(null);
        return;
      }
      const row = rows[rowIdx];
      if (row.kind === 'wp' || !row.activityId || row.id === depDragState.fromRowId) {
        if (depHoverTarget) onDepHoverChange(null);
        return;
      }
      const barRect = barRectFor(rowIdx, row.startDate, Math.max(row.isMilestone ? 0 : row.days, row.isMilestone ? 0 : 1));
      const midX = barRect.x + barRect.width / 2;
      const toSide: BarSide = local.x < midX ? 'start' : 'end';
      if (!depHoverTarget || depHoverTarget.toRowId !== row.id || depHoverTarget.toSide !== toSide) {
        onDepHoverChange({ toRowId: row.id, toActivityId: row.activityId, toSide });
      }
    },
    [depDragState, depHoverTarget, onDepHoverChange, rows, barRectFor],
  );

  // Geometría (rect + delta de drag) de cada barra, calculada UNA sola vez y
  // reutilizada por la capa de barras y por la capa SUPERIOR de puntitos de
  // dependencia. Antes el rect se calculaba dentro del map de barras; al
  // extraerlo aquí ambas capas comparten exactamente la misma posición y no
  // pueden desincronizarse (Chany 31 may).
  const barLayouts = rows
    .map((row, idx) => {
      if (row.kind === 'wp') return null;
      const widthSpan = row.isMilestone ? 0 : spanDaysOf(row);
      let rect = barRectFor(idx, row.startDate, widthSpan);
      let dragDelta = 0;
      if (dragState && dragState.rowId === row.id) {
        if (dragState.kind === 'resize') {
          const days = Math.max(0, dragState.originalDays + Math.round(dragDeltaX / pxPerDay));
          rect = barRectFor(idx, row.startDate, days);
        } else {
          dragDelta = dragDeltaX;
        }
      }
      if (row.startOffsetDays != null) {
        rect = { ...rect, x: xOf(layout.anchor) + row.startOffsetDays * pxPerDay };
      }
      return { row, idx, rect, dragDelta };
    })
    .filter((b): b is NonNullable<typeof b> => b !== null);

  // Obstáculo RECTANGULAR completo de cada fila por índice: cápsula + su TEXTO
  // (nombre/subtítulo, pintado a la derecha de la barra). Lo usan las flechas de
  // dependencia para NO pasar por encima ni de la cápsula NI de su texto. Solo
  // filas con barra real (no paquetes de trabajo). El alto [top,bottom] es la
  // franja de la cápsula; el padding de fila por arriba/abajo queda libre (canal).
  const rowObstacleByIndex = new Map<number, RowObstacle>();
  for (const b of barLayouts) {
    // Los HITOS se dibujan como un rombo de ~BAR_HEIGHT de ancho (rect.width≈0).
    const barVisualW = b.row.isMilestone ? b.rect.height : b.rect.width;
    const barRight = b.rect.x + Math.max(barVisualW, 6);
    // El nombre arranca 14px tras la barra (+rightLinePad si la fila lo indenta),
    // igual que gantt-bar.tsx. Medimos nombre (12px) y subtítulo (9px) y tomamos
    // el más ancho. labelNameRight = name (+ ' ▾' si es rollup colapsado).
    const pad = rightLineRowIds.has(b.row.id) ? DEPENDENCY_OFFSET + 6 : 0;
    const labelName = b.row.isCollapsedRollup ? `${b.row.name} ▾` : b.row.name;
    const nameW = measureTextWidth(labelName, 12);
    const subW = b.row.subtitle ? measureTextWidth(b.row.subtitle, 9) : 0;
    const textRight = barRight + 14 + pad + Math.max(nameW, subW);
    rowObstacleByIndex.set(b.idx, {
      left: b.rect.x,
      top: b.rect.y,
      right: textRight,
      bottom: b.rect.y + b.rect.height,
    });
  }
  const rowObstacleOf = (i: number) => rowObstacleByIndex.get(i) ?? null;

  return (
    <svg
      width={totalWidth}
      height={HEADER_HEIGHT + totalHeight}
      style={{ display: 'block' }}
      onPointerMove={onSvgPointerMove}
    >
      <ArrowMarkers />

      <g transform={`translate(0, ${HEADER_HEIGHT})`}>
        {rows.map((row, idx) => {
          const isWp = row.kind === 'wp';
          const selected = selectedRowIds.has(row.id);
          const isHover = hoverRowId === row.id;
          const dim = matchedRowIds != null && !matchedRowIds.has(row.id);
          return (
            <rect
              key={`row-${row.id}`}
              x={0}
              y={idx * ROW_HEIGHT}
              width={totalWidth}
              height={ROW_HEIGHT}
              fill={
                selected
                  ? COLORS.selection
                  : isHover
                    ? '#eff6ff'
                    : isWp
                      ? COLORS.wpRow
                      : idx % 2 === 0
                        ? '#ffffff'
                        : COLORS.rowStripe
              }
              opacity={dim ? 0.4 : 1}
              stroke={COLORS.grid}
              strokeWidth={0.5}
              onClick={e => onSelect(row.id, e)}
              onMouseEnter={() => onHoverRow(row.id)}
              onMouseLeave={() => onHoverRow(null)}
              onContextMenu={e => {
                if (!onContextMenuRow) return;
                e.preventDefault();
                onContextMenuRow(row.id, e.clientX, e.clientY);
              }}
              style={{ cursor: 'pointer' }}
            />
          );
        })}

        {/* Bandas grises de findes/festivos. Se pintan DESPUÉS de los fondos de
            fila (que son opacos) para que NO queden tapadas — antes iban antes y
            los rects de fila las ocultaban (por eso "no se destacaban"). Con
            opacidad parcial dejan ver el tinte de hover/selección por debajo y
            las barras/flechas (que se pintan más tarde) quedan por encima. */}
        {weekendBands.map((b, i) => (
          <rect
            key={`wk-${i}`}
            x={b.x}
            y={0}
            width={b.width}
            height={totalHeight}
            fill={COLORS.nonWorking}
            fillOpacity={0.65}
            pointerEvents="none"
          />
        ))}

        {verticalLines.map((l, i) => (
          <line
            key={`v-${i}`}
            x1={l.x}
            x2={l.x}
            y1={0}
            y2={totalHeight}
            stroke={l.color}
            strokeWidth={0.5}
            pointerEvents="none"
          />
        ))}

        {/* Sub-líneas de hora (solo con calendario, vista día). Inicio de
            jornada = línea fuerte; cada hora = línea fina (a zoom alto). */}
        {hourLines.map((l, i) => (
          <line
            key={`hl-${i}`}
            x1={l.x}
            x2={l.x}
            y1={0}
            y2={totalHeight}
            stroke={l.strong ? COLORS.gridWeek : COLORS.gridDay}
            strokeWidth={l.strong ? 0.75 : 0.4}
            pointerEvents="none"
          />
        ))}

        {todayX !== null && (
          <line
            x1={todayX}
            x2={todayX}
            y1={0}
            y2={totalHeight}
            stroke={COLORS.todayLine}
            strokeWidth={1.5}
            strokeDasharray="4 3"
            pointerEvents="none"
          />
        )}

        {/* Línea vertical naranja "Project start" estilo Bryntum */}
        {projectStartX !== null && projectStartX >= 0 && projectStartX <= totalWidth && (
          <line
            x1={projectStartX}
            x2={projectStartX}
            y1={0}
            y2={totalHeight}
            stroke={PROJECT_START_COLOR}
            strokeWidth={2}
            pointerEvents="none"
          />
        )}

        {/* Banda de rango total en filas WP (rollup azul claro) */}
        {wpRangeBars.map(b => (
          <rect
            key={`wp-range-${b.rowIdx}`}
            x={b.x}
            y={b.rowIdx * ROW_HEIGHT + (ROW_HEIGHT - 6) / 2}
            width={b.width}
            height={6}
            rx={3}
            ry={3}
            fill="#bae6fd"
            opacity={0.85}
            pointerEvents="none"
          />
        ))}

        {baselineBars && baselineBars.size > 0 && rows.map((row, idx) => {
          if (row.kind === 'wp' || !row.activityId) return null;
          const b = baselineBars.get(row.activityId);
          if (!b) return null;
          const baseRect = barRectFor(idx, b.startDate, Math.max(b.isMilestone ? 0 : b.days, b.isMilestone ? 0 : 1));
          const baseY = baseRect.y + BAR_HEIGHT + 2;
          const baseH = 6;
          if (b.isMilestone) {
            const cx = baseRect.x + baseH;
            const cy = baseY + baseH / 2;
            return (
              <polygon
                key={`baseline-${row.id}`}
                points={`${cx},${cy - baseH} ${cx + baseH},${cy} ${cx},${cy + baseH} ${cx - baseH},${cy}`}
                fill="#94a3b8"
                fillOpacity={0.5}
                stroke="#475569"
                strokeWidth={0.5}
                strokeDasharray="2 1"
                pointerEvents="none"
              >
                <title>{`Línea base${baselineName ? ` "${baselineName}"` : ''}: hito`}</title>
              </polygon>
            );
          }
          return (
            <g key={`baseline-${row.id}`} pointerEvents="none">
              <rect
                x={baseRect.x}
                y={baseY}
                width={Math.max(2, baseRect.width)}
                height={baseH}
                rx={2}
                fill="#94a3b8"
                fillOpacity={0.55}
                stroke="#475569"
                strokeWidth={0.5}
                strokeDasharray="3 2"
              >
                <title>{`Línea base${baselineName ? ` "${baselineName}"` : ''}: ${b.days}d`}</title>
              </rect>
            </g>
          );
        })}

        {barLayouts.map(({ row, rect, dragDelta }) => (
          <GanttBar
            key={`bar-${row.id}`}
            row={row}
            rect={rect}
            selected={selectedRowIds.has(row.id)}
            dim={matchedRowIds != null && !matchedRowIds.has(row.id)}
            onClick={onSelect}
            onDoubleClick={onOpen}
            onResizeStart={onResizeStart}
            onMoveStart={onMoveStart}
            onBeginDepDrag={onBeginDepDrag}
            dragDeltaX={dragDelta}
            animateMove={animateAllBars && dragState === null}
            calendar={calendar}
            rightLinePad={rightLineRowIds.has(row.id) ? DEPENDENCY_OFFSET + 6 : 0}
          />
        ))}

        {/* Puntos de dependencia VISUALES (azules) — se pintan ANTES que las
            flechas, así la CABEZA DE FLECHA queda por encima del punto y se ve
            su sentido en los extremos (antes el punto opaco la tapaba). No
            capturan eventos; el arrastre lo gestiona la capa transparente de
            más abajo. (Chany 3 jun) */}
        {onBeginDepDrag &&
          barLayouts.map(({ row, rect, dragDelta }) =>
            row.kind === 'activity' ? (
              <GanttBar
                key={`depv-${row.id}`}
                row={row}
                rect={rect}
                selected={false}
                onClick={onSelect}
                onDoubleClick={onOpen}
                onResizeStart={onResizeStart}
                onMoveStart={onMoveStart}
                onBeginDepDrag={onBeginDepDrag}
                showDepHandles
                handlesOnly
                handlesVariant="visual"
                dragDeltaX={dragDelta}
                animateMove={animateAllBars && dragState === null}
                calendar={calendar}
              />
            ) : null,
          )}

        {/* Flechas de dependencia — entre los puntos visuales (debajo) y la capa
            transparente de captura (encima), para que su CABEZA se vea siempre
            sobre el punto del que sale/llega (Chany 3 jun). */}
        {dependencies.map(dep => {
          const fromIdx = rowIndexById.get(dep.fromRowId);
          const toIdx = rowIndexById.get(dep.toRowId);
          if (fromIdx == null || toIdx == null) return null;
          const fromRow = rows[fromIdx];
          const toRow = rows[toIdx];
          if (!fromRow || !toRow) return null;
          return (
            <GanttDependencyArrow
              key={dep.id}
              dep={dep}
              fromRow={fromRow}
              fromIndex={fromIdx}
              toRow={toRow}
              toIndex={toIdx}
              layout={layout}
              onClick={onClickDep}
              onDoubleClick={onDoubleClickDep}
              selected={selectedDepId === dep.id}
              laneOffset={depLaneOffsets.get(dep.id) ?? 0}
              rowObstacleOf={rowObstacleOf}
            />
          );
        })}

        {/* Capa SUPERIOR de captura de dependencias — círculos TRANSPARENTES
            por encima de las flechas. No tapan nada (invisibles) pero mantienen
            el punto agarrable para arrastrar y crear más dependencias aunque la
            barra ya tenga flechas llegando a su borde. (Chany 3 jun) */}
        {onBeginDepDrag &&
          barLayouts.map(({ row, rect, dragDelta }) =>
            row.kind === 'activity' ? (
              <GanttBar
                key={`deph-${row.id}`}
                row={row}
                rect={rect}
                selected={false}
                onClick={onSelect}
                onDoubleClick={onOpen}
                onResizeStart={onResizeStart}
                onMoveStart={onMoveStart}
                onBeginDepDrag={onBeginDepDrag}
                showDepHandles
                handlesOnly
                handlesVariant="interactive"
                dragDeltaX={dragDelta}
                animateMove={animateAllBars && dragState === null}
                calendar={calendar}
              />
            ) : null,
          )}

        {/* Guía vertical durante el drag-move: línea naranja en el día al que
            se va a snapear la barra. Da feedback inmediato de a qué columna
            exacta caerá. Visible solo durante drag.kind === 'move' o 'resize'. */}
        {dragState && (() => {
          const r = rows[rowIndexById.get(dragState.rowId) ?? -1];
          if (!r) return null;
          const daysDelta = Math.round(dragDeltaX / pxPerDay);
          let snapDate: Date;
          if (dragState.kind === 'move') {
            snapDate = addDays(r.startDate, daysDelta);
          } else {
            snapDate = addDays(r.startDate, Math.max(0, r.days + daysDelta));
          }
          const sx = xOf(snapDate);
          if (sx < 0 || sx > totalWidth) return null;
          return (
            <g pointerEvents="none">
              <line
                x1={sx}
                x2={sx}
                y1={0}
                y2={totalHeight}
                stroke="#f59e0b"
                strokeWidth={1.5}
                strokeDasharray="3 3"
              />
            </g>
          );
        })()}

        {depDragState && (
          <g pointerEvents="none">
            <line
              x1={depDragState.startX}
              y1={depDragState.startY - HEADER_HEIGHT}
              x2={depDragState.currentX}
              y2={depDragState.currentY - HEADER_HEIGHT}
              stroke="#3b82f6"
              strokeWidth={1.5}
              strokeDasharray="4 3"
            />
            <circle
              cx={depDragState.currentX}
              cy={depDragState.currentY - HEADER_HEIGHT}
              r={4}
              fill="#3b82f6"
              fillOpacity={0.8}
            />
            {depHoverTarget && (() => {
              const idx = rowIndexById.get(depHoverTarget.toRowId);
              if (idx == null) return null;
              const r = rows[idx];
              if (!r) return null;
              const hoverRect = barRectFor(idx, r.startDate, Math.max(r.isMilestone ? 0 : r.days, r.isMilestone ? 0 : 1));
              const hx = depHoverTarget.toSide === 'start' ? hoverRect.x : hoverRect.x + hoverRect.width;
              const hy = hoverRect.y + BAR_HEIGHT / 2;
              return (
                <circle
                  cx={hx}
                  cy={hy}
                  r={7}
                  fill="#22c55e"
                  fillOpacity={0.3}
                  stroke="#15803d"
                  strokeWidth={1.5}
                />
              );
            })()}
          </g>
        )}
      </g>

      {/* Cabecera de fechas FIJA: se renderiza la última (encima de las filas)
          y se traslada en Y por scrollTop para quedar siempre pegada al borde
          superior visible al hacer scroll vertical. El fondo blanco del propio
          header tapa las filas que pasan por debajo (Chany 31 may). */}
      <g transform={`translate(0, ${scrollTop})`}>
        <TimelineHeader
          layout={layout}
          viewMode={viewMode}
          projectStart={projectStartDate}
          today={today}
          calendar={calendar}
        />
      </g>
    </svg>
  );
}

export const TimelineBody = memo(TimelineBodyImpl);
