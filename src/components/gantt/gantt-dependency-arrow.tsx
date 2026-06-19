'use client';

import { memo } from 'react';
import type React from 'react';
import { COLORS, DEPENDENCY_OFFSET } from './constants';
import type { GanttDependency, TaskRow } from './types';
import type { GanttLayout } from './use-gantt-layout';

interface ArrowProps {
  dep: GanttDependency;
  fromRow: TaskRow;
  fromIndex: number;
  toRow: TaskRow;
  toIndex: number;
  layout: GanttLayout;
  // Click simple: destaca la dependencia (no abre nada).
  onClick?: (depId: string) => void;
  // Doble click: abre el modal de edición.
  onDoubleClick?: (depId: string) => void;
  // Cuando coincide con dep.id, la flecha se pinta destacada (stroke más
  // grueso + color naranja) para que el usuario vea claramente qué línea ha
  // seleccionado al hacer click.
  selected?: boolean;
  // Desplazamiento horizontal (px) del tramo vertical para separar líneas que
  // comparten el mismo corredor X y se solaparían (Chany 29 may).
  laneOffset?: number;
  // Obstáculo RECTANGULAR completo de cada fila (por índice): cápsula + su TEXTO
  // (nombre/subtítulo, que se pinta a la derecha de la barra). null si la fila no
  // tiene cápsula (paquete de trabajo). Lo usa el router para que NINGUNA línea
  // pase por encima de una cápsula NI de su texto: el tramo vertical busca un X
  // libre y los tramos horizontales discurren por el canal de padding entre filas
  // (fuera de la franja [top,bottom] que ocupan barra+texto). (Chany 3 jun)
  rowObstacleOf?: (rowIndex: number) => RowObstacle | null;
}

// Rectángulo de ocupación visual de una fila: barra + texto a su derecha.
export interface RowObstacle {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

// Margen de seguridad alrededor de cada obstáculo al buscar corredor (px).
const OBSTACLE_MARGIN = 6;

// Resuelve el X del tramo VERTICAL principal para que NO caiga sobre ningún
// obstáculo (cápsula + texto) de las filas que el vertical cruza. Solo cuentan
// los obstáculos cuyo rango Y [top,bottom] solapa el rango vertical [vTop,vBottom]
// del tramo — así las filas origen/destino (cuyo texto queda fuera del recorrido
// vertical, en su propia franja) no bloquean indebidamente. Si el X preferido
// choca, escanea simétricamente hacia ambos lados dentro de [minX,maxX] buscando
// el hueco libre más cercano. Sin hueco → mejor esfuerzo (cruce mínimo). (Chany 3 jun)
function resolveCorridorXFull(
  preferred: number,
  minX: number,
  maxX: number,
  vTop: number,
  vBottom: number,
  obstacles: RowObstacle[],
  M = OBSTACLE_MARGIN,
): number {
  const rLo = Math.min(minX, maxX);
  const rHi = Math.max(minX, maxX);
  const clampR = (v: number) => Math.max(rLo, Math.min(rHi, v));
  const base = clampR(preferred);
  if (rHi - rLo < 1) return base; // rango nulo
  // Solo obstáculos cuya franja vertical solapa el recorrido del tramo vertical.
  const obs = obstacles.filter(o => o.bottom > vTop + 0.5 && o.top < vBottom - 0.5);
  if (obs.length === 0) return base;
  const isClear = (cx: number) => obs.every(o => cx < o.left - M || cx > o.right + M);
  if (isClear(base)) return base;
  const span = rHi - rLo;
  for (let d = 2; d <= span + 2; d += 2) {
    const right = clampR(base + d);
    if (right <= rHi && isClear(right)) return right;
    const left = clampR(base - d);
    if (left >= rLo && isClear(left)) return left;
  }
  // Sin hueco contiguo dentro del rango: en vez de CRUZAR (lo que dejaba la línea
  // por encima de una cápsula+texto), nos vamos a un lado que SÍ despeja todos
  // los obstáculos del recorrido: justo a la izquierda del más a la izquierda o
  // justo a la derecha del más a la derecha, eligiendo el más cercano al deseado.
  // El llamante amplía minX/maxX para que estas posiciones quepan en el rango.
  const leftClear = clampR(Math.min(...obs.map(o => o.left)) - M - 1);
  const rightClear = clampR(Math.max(...obs.map(o => o.right)) + M + 1);
  const leftOk = isClear(leftClear);
  const rightOk = isClear(rightClear);
  if (leftOk && (!rightOk || Math.abs(leftClear - base) <= Math.abs(rightClear - base))) return leftClear;
  if (rightOk) return rightClear;
  return base; // ni izquierda ni derecha caben: mejor esfuerzo (cruce mínimo)
}

// ¿Un segmento ORTOGONAL (horizontal o vertical) entra en el rect (con margen)?
function segmentHitsRect(
  ax: number, ay: number, bx: number, by: number,
  rect: RowObstacle, M = OBSTACLE_MARGIN,
): boolean {
  const segLeft = Math.min(ax, bx);
  const segRight = Math.max(ax, bx);
  const segTop = Math.min(ay, by);
  const segBottom = Math.max(ay, by);
  // Solape de cajas (el segmento es una caja degenerada de grosor 0).
  return (
    segRight > rect.left - M &&
    segLeft < rect.right + M &&
    segBottom > rect.top - M &&
    segTop < rect.bottom + M
  );
}

// ¿Algún segmento del path cruza algún obstáculo? Red de seguridad: en dev avisa
// para diagnosticar; en prod no hace nada (best-effort ya aplicado por el router).
function pathCrossesObstacle(points: { x: number; y: number }[], obstacles: RowObstacle[]): boolean {
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    for (const o of obstacles) {
      if (segmentHitsRect(a.x, a.y, b.x, b.y, o)) return true;
    }
  }
  return false;
}

// Generador de ruta ortogonal con esquinas REDONDEADAS muy ligeras (radio 4px),
// aspecto suave estilo Bryntum. Filtra puntos consecutivos duplicados (que
// aparecen cuando un tramo colapsa a longitud 0) para no romper el suavizado.
function roundedPath(rawPoints: { x: number; y: number }[]): string {
  const points: { x: number; y: number }[] = [];
  for (const p of rawPoints) {
    const last = points[points.length - 1];
    if (!last || Math.abs(last.x - p.x) > 0.5 || Math.abs(last.y - p.y) > 0.5) points.push(p);
  }
  if (points.length < 2) return '';
  // Radio de redondeo de las esquinas. Un poco mayor que antes (4→6) para que
  // los giros se vean suaves y no como quiebros duros (Chany 3 jun).
  const r = 6;
  const out: string[] = [`M ${points[0].x} ${points[0].y}`];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];
    const dx1 = curr.x - prev.x;
    const dy1 = curr.y - prev.y;
    const dx2 = next.x - curr.x;
    const dy2 = next.y - curr.y;
    const len1 = Math.hypot(dx1, dy1);
    const len2 = Math.hypot(dx2, dy2);
    const cornerR = Math.min(r, len1 / 2, len2 / 2);
    if (cornerR <= 0.1) {
      out.push(`L ${curr.x} ${curr.y}`);
      continue;
    }
    const ux1 = dx1 / len1;
    const uy1 = dy1 / len1;
    const ux2 = dx2 / len2;
    const uy2 = dy2 / len2;
    out.push(`L ${curr.x - ux1 * cornerR} ${curr.y - uy1 * cornerR}`);
    out.push(`Q ${curr.x} ${curr.y} ${curr.x + ux2 * cornerR} ${curr.y + uy2 * cornerR}`);
  }
  const last = points[points.length - 1];
  out.push(`L ${last.x} ${last.y}`);
  return out.join(' ');
}

// Construye el path de la flecha rutando por CANALES: sale del borde de la barra
// origen, sube/baja al canal de padding (exitY) — fuera de la franja de la barra
// y de su texto —, recorre horizontal hasta el corredor vertical `midX`, baja/sube
// por él (ya elegido para no cruzar obstáculos), entra por el canal de la fila
// destino (entryY) y remata en el borde de la barra destino. Los puntos
// duplicados (tramos colapsados) los filtra roundedPath. Devuelve también los
// vértices para poder validar que no cruzan obstáculos. (Chany 3 jun)
function buildChannelPath(
  fromX: number, cyFrom: number, exitY: number,
  midX: number,
  entryY: number, toX: number, cyTo: number,
): { d: string; points: { x: number; y: number }[] } {
  const points = [
    { x: fromX, y: cyFrom },
    { x: fromX, y: exitY },
    { x: midX, y: exitY },
    { x: midX, y: entryY },
    { x: toX, y: entryY },
    { x: toX, y: cyTo },
  ];
  return { d: roundedPath(points), points };
}

function GanttDependencyArrowImpl({
  dep,
  fromRow,
  fromIndex,
  toRow,
  toIndex,
  layout,
  onClick,
  onDoubleClick,
  selected = false,
  laneOffset = 0,
  rowObstacleOf,
}: ArrowProps) {
  const { xOf, barYOf, barHeight, pxPerDay } = layout;

  // Bordes VISUALES de la cápsula. DEBEN coincidir EXACTAMENTE con el ancho que
  // pinta timeline-body: ancho PROPORCIONAL a la duración real (mínimo 6px), NO
  // forzado a 1 día. Antes usábamos Math.max(days,1) y las flechas de una tarea
  // sub-día salían/curvaban como si durara 1 día (Chany 30 may).
  //   Fx (FS/FF) → sale por la DERECHA;  Sx (SS/SF) → sale por la IZQUIERDA;
  //   xS (FS/SS) → entra por la IZQUIERDA; xF (FF/SF) → entra por la DERECHA.
  const edgesOf = (row: TaskRow, index: number) => {
    const cy = barYOf(index) + barHeight / 2;
    // Misma X que la barra: fraccionaria si la fila la aporta (sub-día).
    const left = row.startOffsetDays != null
      ? xOf(layout.anchor) + row.startOffsetDays * pxPerDay
      : xOf(row.startDate);
    // El borde derecho usa la VARIACIÓN en días-calendario (widthDays = fin-inicio
    // real), NO la duración `days`. Con calendario, una actividad de 1 día que
    // empieza a media jornada cruza la medianoche y ocupa >1 día: la cápsula se
    // dibuja con widthDays, así que la flecha debe partir de ESE borde derecho y
    // no de la mitad (que era lo que daba row.days). Mismo span que timeline-body
    // (spanDaysOf) y barRectFor (Chany 31 may).
    const spanDays = row.widthDays ?? row.days;
    const right = row.isMilestone
      ? left + barHeight // el rombo del hito ocupa ~BAR_HEIGHT de ancho
      : left + Math.max(6, spanDays * pxPerDay); // ancho real, mínimo 6px (igual que barRectFor)
    return { left, right, cy };
  };
  const fromE = edgesOf(fromRow, fromIndex);
  const toE = edgesOf(toRow, toIndex);
  const fromY = fromE.cy;
  const toY = toE.cy;

  // Lado de salida/entrada según el tipo. Fx (FS/FF) → sale por la DERECHA;
  // Sx (SS/SF) → sale por la IZQUIERDA; xS (FS/SS) → entra por la IZQUIERDA;
  // xF (FF/SF) → entra por la DERECHA.
  let fromX: number;
  let toX: number;
  switch (dep.type) {
    case 'FS': fromX = fromE.right; toX = toE.left; break;
    case 'SS': fromX = fromE.left; toX = toE.left; break;
    case 'FF': fromX = fromE.right; toX = toE.right; break;
    case 'SF': fromX = fromE.left; toX = toE.right; break;
  }

  // Conector ortogonal de 5 puntos (estilo MS-Project). La FORMA la fija el lado
  // de SALIDA y de ENTRADA de cada tipo, y SIEMPRE se ve porque AMBOS extremos
  // llevan un STUB horizontal FIJO que toca su cápsula, aunque las dos barras
  // estén casi en la misma X (actividades de pocas horas):
  //   FS: sale dcha, entra izq  → S invertida
  //   SS: sale izq,  entra izq  → C
  //   FF: sale dcha, entra dcha → C invertida
  //   SF: sale izq,  entra dcha → S
  // Recorrido: stub horizontal de salida → vertical → tramo horizontal por el
  // hueco entre filas → vertical → stub horizontal de entrada. (Chany 4 jun)
  const STUB = 16; // tramo horizontal fijo de salida/entrada a cada cápsula
  const exitDir = dep.type === 'FS' || dep.type === 'FF' ? 1 : -1; // salida: dcha/izq
  const enterDir = dep.type === 'FF' || dep.type === 'SF' ? 1 : -1; // entrada: dcha/izq
  let exitX = fromX + exitDir * STUB;
  const entryX = toX + enterDir * STUB;
  // Tramo intermedio horizontal por el hueco entre las dos filas; laneOffset lo
  // separa de otras líneas paralelas.
  let midY = (fromY + toY) / 2 + laneOffset;

  // Evitar cruzar cápsulas/texto de filas INTERMEDIAS (las que quedan entre la
  // predecesora y la sucesora). Heurística (Chany 4 jun): ENSANCHAR la horizontal
  // de salida hasta pasar el obstáculo y BAJAR solo cuando ya estamos al lado de
  // la sucesora; el tramo intermedio se lleva al hueco pegado a la sucesora
  // (por debajo de las cápsulas de en medio), no a media altura.
  if (rowObstacleOf) {
    const lo = Math.min(fromIndex, toIndex);
    const hi = Math.max(fromIndex, toIndex);
    const obs: RowObstacle[] = [];
    for (let i = lo + 1; i <= hi - 1; i++) {
      const o = rowObstacleOf(i);
      if (o) obs.push(o);
    }
    if (obs.length > 0) {
      // Tramo intermedio pegado a la fila de la sucesora (en su hueco de approach).
      const approach = barHeight / 2 + 5;
      midY = toY + (toY >= fromY ? -approach : approach);
      // La bajada larga (en exitX) se aparta del obstáculo más exterior por su lado.
      if (exitDir > 0) {
        const obsRight = Math.max(...obs.map(o => o.right));
        exitX = Math.max(exitX, obsRight + 8);
      } else {
        const obsLeft = Math.min(...obs.map(o => o.left));
        exitX = Math.min(exitX, obsLeft - 8);
      }
    }
  }

  const points = [
    { x: fromX, y: fromY },  // borde de la predecesora (su lado)
    { x: exitX, y: fromY },  // horizontal de SALIDA (se ensancha para esquivar)
    { x: exitX, y: midY },   // baja/sube ya pasado el obstáculo
    { x: entryX, y: midY },  // tramo intermedio (pegado a la sucesora si hay obstáculo)
    { x: entryX, y: toY },   // baja/sube a la fila de la sucesora
    { x: toX, y: toY },      // stub horizontal de ENTRADA al borde de la sucesora
  ];
  const d = roundedPath(points);

  // Etiqueta de tipo (FS/SS/FF/SF) en el centro del tramo intermedio.
  const labelX = (exitX + entryX) / 2;
  const labelY = midY;
  // Color destacado naranja vivo si está seleccionada — se ve por encima del
  // color por defecto y del crítico.
  const color = selected
    ? '#fb923c'
    : dep.isCritical
      ? COLORS.arrowCritical
      : COLORS.arrow;
  // Trazado más grueso si seleccionada (3.5px) para que se vea desde lejos.
  // Subimos también el grosor por defecto (1.2 → 2) para que la línea de
  // dependencia se distinga con claridad (Chany 29 may).
  const strokeWidth = selected ? 3.5 : dep.isCritical ? 2.4 : 2;
  const dasharray = dep.isVirtual ? '4 3' : undefined;

  const markerId = selected
    ? 'arrow-selected'
    : dep.isCritical
      ? 'arrow-critical'
      : 'arrow-default';
  const clickable = (!!onClick || !!onDoubleClick) && !dep.isVirtual;

  return (
    <g
      onClick={clickable && onClick ? (e: React.MouseEvent) => { e.stopPropagation(); onClick(dep.id); } : undefined}
      onDoubleClick={clickable && onDoubleClick ? (e: React.MouseEvent) => { e.stopPropagation(); onDoubleClick(dep.id); } : undefined}
      style={clickable ? { cursor: 'pointer' } : undefined}
    >
      {clickable && (
        <path
          d={d}
          fill="none"
          stroke="transparent"
          strokeWidth={10}
          pointerEvents="stroke"
        />
      )}
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={dasharray}
        markerEnd={`url(#${markerId})`}
        pointerEvents="none"
      />
      {!dep.isVirtual && (
        <text
          x={labelX}
          y={labelY}
          fontSize={8}
          fontWeight={700}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={color}
          stroke="#ffffff"
          strokeWidth={2.5}
          pointerEvents="none"
          style={{ userSelect: 'none', paintOrder: 'stroke' }}
        >
          {dep.type}
        </text>
      )}
    </g>
  );
}

export const GanttDependencyArrow = memo(GanttDependencyArrowImpl);

export function ArrowMarkers() {
  // Markers triangulares grandes (10x10px en userSpaceOnUse) para que la punta
  // de flecha se vea SIEMPRE y deje clara la dirección de la dependencia, sin
  // depender del grosor del trazo (antes markerUnits='strokeWidth' default los
  // encogía con líneas finas y la flecha casi no se veía — Chany 29 may).
  // refX=9 deja la punta justo en el borde de la barra hija.
  const tri = 'M 0 0 L 10 5 L 0 10 L 2.5 5 Z';
  return (
    <defs>
      <marker
        id="arrow-default"
        viewBox="0 0 10 10"
        refX="9"
        refY="5"
        markerWidth="10"
        markerHeight="10"
        markerUnits="userSpaceOnUse"
        orient="auto-start-reverse"
      >
        <path d={tri} fill={COLORS.arrow} />
      </marker>
      <marker
        id="arrow-critical"
        viewBox="0 0 10 10"
        refX="9"
        refY="5"
        markerWidth="10"
        markerHeight="10"
        markerUnits="userSpaceOnUse"
        orient="auto-start-reverse"
      >
        <path d={tri} fill={COLORS.arrowCritical} />
      </marker>
      <marker
        id="arrow-selected"
        viewBox="0 0 10 10"
        refX="9"
        refY="5"
        markerWidth="10"
        markerHeight="10"
        markerUnits="userSpaceOnUse"
        orient="auto-start-reverse"
      >
        <path d={tri} fill="#fb923c" />
      </marker>
    </defs>
  );
}
