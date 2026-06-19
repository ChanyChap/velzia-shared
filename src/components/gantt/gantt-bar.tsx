'use client';

import { memo, useCallback, useMemo, type CSSProperties, type PointerEvent as ReactPointerEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { addDays, format } from 'date-fns';
import { es } from 'date-fns/locale';
import { COLORS, RESIZE_HANDLE_WIDTH } from './constants';
import { formatDurationShort } from './format-duration';
import type { TaskRow } from './types';
import type { BarSide } from './use-dep-drag';
import type { WorkingCalendar } from './working-calendar';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

interface BarRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface GanttBarProps {
  row: TaskRow;
  rect: BarRect;
  selected: boolean;
  dim?: boolean;
  onClick: (rowId: string, event: ReactMouseEvent) => void;
  onDoubleClick: (rowId: string) => void;
  onResizeStart: (rowId: string, event: ReactPointerEvent) => void;
  onMoveStart: (rowId: string, event: ReactPointerEvent) => void;
  onBeginDepDrag?: (rowId: string, activityId: string, side: BarSide, event: ReactPointerEvent) => void;
  dragDeltaX?: number;
  showDepHandles?: boolean;
  // Si true, GanttBar renderiza ÚNICAMENTE los puntitos de conexión de
  // dependencias (no la cápsula ni nada más). El contenedor lo usa para pintar
  // los handles en una capa SUPERIOR, por encima de las flechas de dependencia,
  // así nunca quedan tapados por una flecha existente y se pueden añadir varias
  // predecesoras/sucesoras (Chany 31 may).
  handlesOnly?: boolean;
  // Cuando handlesOnly: 'visual' pinta los puntos azules SIN capturar eventos
  // (van DEBAJO de las flechas, para no tapar las cabezas de flecha);
  // 'interactive' pinta círculos TRANSPARENTES que sí capturan el arrastre (van
  // ENCIMA de las flechas). Así la punta de flecha se ve y el punto sigue siendo
  // agarrable. Si se omite, comportamiento clásico (punto azul + arrastre juntos).
  handlesVariant?: 'visual' | 'interactive';
  // Si true, la cápsula y la barra de progreso animan su deslizamiento al
  // cambiar `tx` / `rect.width`. Lo activa el contenedor cuando la fila
  // acaba de moverse por propagación de deps o cambio de duración. Durante
  // drag manual debe quedar false (sería pegajoso).
  animateMove?: boolean;
  // Calendario laboral; si existe, el tooltip muestra la HORA de inicio/fin
  // (caso de Chany: actividad de 1h al inicio de jornada → "08:00 · 09:00").
  calendar?: WorkingCalendar | null;
  // Sangría extra (px) del NOMBRE de la actividad hacia la derecha cuando hay
  // líneas de dependencia saliendo/llegando por el lado derecho de la barra, para
  // que las líneas no se solapen con el texto. 0 si no hay líneas a la derecha.
  rightLinePad?: number;
}

function colorForRow(row: TaskRow): { fill: string; light: string; stroke: string } {
  // light = tono "parte pendiente" (fondo). fill = tono "parte completada"
  // (capa superior limitada al % de progreso). Para crítica/pre-activity/task
  // usamos derivados claros del color principal.

  // Gantt de PROYECTO: color por estado de ejecución real. Manda sobre todo lo
  // demás (incluido crítica). Gama verde para el avance normal; rojo para los
  // retrasos. La metáfora claro/oscuro la aporta row.progress:
  //   - no empezada → progress 0   → todo verde claro
  //   - empezada    → progress 1-99 → verde claro + verde oscuro
  //   - terminada   → progress 100 → todo verde oscuro
  //   - retraso     → light=fill=rojo → barra uniformemente roja (debía haber
  //     empezado/terminado y no lo ha hecho), sea cual sea su progreso.
  if (row.executionState) {
    if (row.executionState === 'retraso_inicio' || row.executionState === 'retraso_fin') {
      return { fill: '#ef4444', light: '#ef4444', stroke: '#991b1b' };
    }
    return { fill: '#14532d', light: '#dcfce7', stroke: '#166534' };
  }

  if (row.isCritical) {
    return { fill: COLORS.critical, light: '#fecaca', stroke: COLORS.criticalStroke };
  }
  if (row.kind === 'pre-activity') {
    return { fill: COLORS.preActivity, light: '#e9d5ff', stroke: COLORS.preActivityStroke };
  }
  if (row.kind === 'task') {
    return { fill: COLORS.task, light: '#e0f2fe', stroke: COLORS.taskStroke };
  }
  return { fill: COLORS.bar, light: COLORS.barLight, stroke: COLORS.barStroke };
}

function GanttBarImpl({
  row,
  rect,
  selected,
  dim = false,
  onClick,
  onDoubleClick,
  onResizeStart,
  onMoveStart,
  onBeginDepDrag,
  dragDeltaX = 0,
  showDepHandles = false,
  handlesOnly = false,
  handlesVariant,
  animateMove = false,
  calendar,
  rightLinePad = 0,
}: GanttBarProps) {
  const handleClick = useCallback(
    (e: ReactMouseEvent) => {
      e.stopPropagation();
      onClick(row.id, e);
    },
    [onClick, row.id],
  );

  const handleDouble = useCallback(
    (e: ReactMouseEvent) => {
      e.stopPropagation();
      onDoubleClick(row.id);
    },
    [onDoubleClick, row.id],
  );

  const handleMoveDown = useCallback(
    (e: ReactPointerEvent) => {
      if (!row.draggable) return;
      e.stopPropagation();
      onMoveStart(row.id, e);
    },
    [onMoveStart, row.id, row.draggable],
  );

  const handleResizeDown = useCallback(
    (e: ReactPointerEvent) => {
      if (!row.resizable) return;
      e.stopPropagation();
      onResizeStart(row.id, e);
    },
    [onResizeStart, row.id, row.resizable],
  );

  const handleDepDown = useCallback(
    (side: BarSide) => (e: ReactPointerEvent) => {
      if (!onBeginDepDrag || !row.activityId) return;
      e.stopPropagation();
      onBeginDepDrag(row.id, row.activityId, side, e);
    },
    [onBeginDepDrag, row.id, row.activityId],
  );

  const { fill, light, stroke } = colorForRow(row);
  const tx = rect.x + dragDeltaX;
  const y = rect.y;
  // El wrapper exterior translatea (tx, 0) con transition CSS cuando
  // animateMove === true (cambio por dep o duración). Los internos usan
  // coords relativas (x=0) — así la cápsula entera se desliza como una
  // unidad. Durante drag manual no se anima (sería pegajoso al arrastrar).
  const wrapperStyle: CSSProperties = {
    transform: `translate(${tx}px, 0px)`,
    transition: animateMove
      ? 'transform 280ms cubic-bezier(.22,.61,.36,1)'
      : 'none',
  };
  const widthTransitionStyle: CSSProperties = animateMove
    ? { transition: 'width 280ms cubic-bezier(.22,.61,.36,1)' }
    : {};

  const tooltipText = useMemo(() => {
    // Mostramos SIEMPRE la hora de inicio y fin en el hover (petición de Chany):
    // además de la fecha, la hora exacta de comienzo y final de la actividad.
    const dateFmt = "dd/MM/yyyy HH:mm";
    const startStr = format(row.startDate, dateFmt, { locale: es });
    // Fin real: el span en días-CALENDARIO (widthDays) cubre findes/festivos
    // cruzados; si no, la duración abstracta `days`. Sumamos milisegundos en vez
    // de addDays (que TRUNCA la fracción de día) para conservar la hora de fin
    // exacta cuando la actividad cruza la medianoche (Chany 31 may).
    const spanForEnd = Math.max(0, row.widthDays ?? row.days);
    const endDate = new Date(row.startDate.getTime() + spanForEnd * MS_PER_DAY);
    const endStr = format(endDate, dateFmt, { locale: es });
    const lines: string[] = [];
    lines.push(row.name);
    lines.push(''); // separador
    if (row.isMilestone) {
      lines.push(`Hito · ${startStr}`);
    } else {
      lines.push(`Inicio: ${startStr}    Fin: ${endStr}`);
      lines.push(`Duración: ${formatDurationShort(row.days)}`);
    }
    if (typeof row.progress === 'number' && row.progress > 0) {
      lines.push(`Progreso: ${Math.round(row.progress)}%`);
    }
    if (typeof row.totalFloatDays === 'number') {
      if (row.isCritical) lines.push('⚠ Crítica (float = 0)');
      else lines.push(`Holgura: ${Math.round(row.totalFloatDays)}d`);
    }
    if (row.kind === 'pre-activity' && typeof row.leadDays === 'number') {
      lines.push(`Lead time: ${row.leadDays}d antes de la madre`);
    }
    // Dependencias y asignados — si existen en rawActivity (datos crudos
    // opcionales de la app), las exponemos. El tipo es genérico (unknown), así
    // que lo casteamos a una forma laxa para leer estos campos opcionales.
    const a = row.rawActivity as
      | { dependencies?: unknown[]; required_role_source?: unknown; required_role_id?: unknown }
      | null
      | undefined;
    if (a) {
      const deps = a.dependencies || [];
      if (deps.length > 0) {
        lines.push('');
        lines.push(`Predecesoras: ${deps.length}`);
      }
      if (a.required_role_source && a.required_role_id) {
        lines.push(`Rol necesario: configurado`);
      }
    }
    return lines.join('\n');
  }, [row, calendar]);

  const showHandles = showDepHandles && !!row.activityId && row.kind === 'activity';

  // Subtítulo (roles responsables en plantilla EDT / recursos asignados en
  // proyecto). Se trunca para no invadir el timeline. Si existe, el nombre se
  // sube ~5px y el subtítulo se pinta ~10px por debajo, en gris atenuado.
  const rawSubtitle = row.subtitle?.trim();
  const subtitle = rawSubtitle
    ? (rawSubtitle.length > 40 ? `${rawSubtitle.slice(0, 40)}…` : rawSubtitle)
    : null;

  // Alto dinámico de la cápsula — viene del layout (BAR_HEIGHT proporcional
  // al rowHeight). Lo recibimos vía rect.height, no la constante.
  const BAR_HEIGHT = rect.height;

  // Modo "solo handles": el contenedor nos invoca una segunda vez, DESPUÉS de
  // las flechas de dependencia, para pintar los puntitos por encima de ellas.
  // Así los handles nunca quedan tapados por una flecha que ya conecta con esta
  // barra y se pueden trazar MÚLTIPLES predecesoras/sucesoras. Radio y opacidad
  // un punto mayores que antes para que destaquen sobre la flecha.
  if (handlesOnly) {
    if (!showHandles) return null;
    const cy = y + BAR_HEIGHT / 2;
    // Dos variantes (ver prop handlesVariant):
    //  - 'visual': el punto azul VISIBLE, sin capturar eventos, pintado DEBAJO de
    //    las flechas → la cabeza de flecha se ve por encima del punto.
    //  - 'interactive': círculo TRANSPARENTE (radio algo mayor) que captura el
    //    arrastre, pintado ENCIMA de las flechas → el punto sigue agarrable.
    //  - omitido (legacy): punto azul + arrastre juntos.
    const interactive = handlesVariant !== 'visual';
    const visible = handlesVariant !== 'interactive';
    const fill = visible ? '#3b82f6' : 'transparent';
    const fillOpacity = visible ? 0.9 : 0;
    const strokeCol = visible ? '#ffffff' : 'none';
    const pe: CSSProperties['pointerEvents'] = handlesVariant === 'visual' ? 'none' : 'all';
    const cursor = handlesVariant === 'visual' ? 'default' : 'crosshair';
    const onDown = (side: BarSide) => (interactive ? handleDepDown(side) : undefined);
    // El área de captura transparente es un pelín mayor para que sea fácil de
    // pinchar aunque no se vea.
    const grow = handlesVariant === 'interactive' ? 2 : 0;
    if (row.isMilestone) {
      const cx = BAR_HEIGHT / 2;
      return (
        <g style={wrapperStyle}>
          <circle
            cx={cx}
            cy={cy}
            r={4.5 + grow}
            fill={fill}
            fillOpacity={fillOpacity}
            stroke={strokeCol}
            strokeWidth={1.4}
            style={{ cursor, pointerEvents: pe }}
            onPointerDown={onDown('end')}
            data-dep-handle="milestone"
          >
            {interactive && <title>Arrastra para crear una dependencia (puedes añadir varias)</title>}
          </circle>
        </g>
      );
    }
    const hr = 4 + grow;
    return (
      <g style={wrapperStyle}>
        <circle
          cx={-4}
          cy={cy}
          r={hr}
          fill={fill}
          fillOpacity={fillOpacity}
          stroke={strokeCol}
          strokeWidth={1.4}
          style={{ cursor, pointerEvents: pe }}
          onPointerDown={onDown('start')}
          data-dep-handle="start"
        >
          {interactive && <title>Arrastra para crear dependencia desde el INICIO (puedes añadir varias)</title>}
        </circle>
        <circle
          cx={rect.width + 4}
          cy={cy}
          r={hr}
          fill={fill}
          fillOpacity={fillOpacity}
          stroke={strokeCol}
          strokeWidth={1.4}
          style={{ cursor, pointerEvents: pe }}
          onPointerDown={onDown('end')}
          data-dep-handle="end"
        >
          {interactive && <title>Arrastra para crear dependencia desde el FIN (puedes añadir varias)</title>}
        </circle>
      </g>
    );
  }

  if (row.isMilestone) {
    const cx = BAR_HEIGHT / 2;
    const cy = y + BAR_HEIGHT / 2;
    const r = BAR_HEIGHT / 2;
    const points = `${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`;
    return (
      <g style={wrapperStyle}>
        <g
          onClick={handleClick}
          onDoubleClick={handleDouble}
          style={{ cursor: 'pointer' }}
          opacity={dim ? 0.3 : row.isCollapsedRollup ? 0.7 : 1}
        >
          <title>{tooltipText}</title>
          <polygon
            points={points}
            fill={row.isCritical ? COLORS.critical : COLORS.milestone}
            stroke={row.isCritical ? COLORS.criticalStroke : COLORS.milestoneStroke}
            strokeWidth={selected ? 2 : 1}
          />
          {/* Nombre del hito a la derecha del rombo (igual que las actividades).
              Si hay subtítulo, subimos el nombre 5px para dejar sitio debajo. */}
          <text
            x={cx + r + 14 + rightLinePad}
            y={subtitle ? cy - 11 : cy - 6}
            fill="#1f2937"
            fontSize={12}
            fontFamily="ui-sans-serif, system-ui, sans-serif"
            dominantBaseline="middle"
            pointerEvents="none"
            style={{ userSelect: 'none' }}
          >
            {row.isCollapsedRollup ? `${row.name} ▾` : row.name}
          </text>
          {/* Subtítulo del hito (roles/recursos) — gris atenuado, ~10px debajo. */}
          {subtitle && (
            <text
              x={cx + r + 14 + rightLinePad}
              y={cy + 7}
              fill={COLORS.textMuted}
              fontSize={9}
              fontFamily="ui-sans-serif, system-ui, sans-serif"
              dominantBaseline="middle"
              pointerEvents="none"
              style={{ userSelect: 'none' }}
            >
              {subtitle}
            </text>
          )}
          {/* Los puntitos de dependencia se pintan en una capa SUPERIOR
              (handlesOnly), no aquí, para que queden por encima de las flechas. */}
        </g>
      </g>
    );
  }

  const showResizeHandle = row.resizable && rect.width > 16;

  // Etiqueta de duración dentro de la barra. Usamos formatDurationShort para
  // que actividades con duración < 1 día se muestren en HORAS (ej "1h", "4h")
  // igual que la lista de la izquierda — antes salía "0d" en estos casos.
  const formattedDuration = formatDurationShort(row.days);
  const durationLabel = row.isCollapsedRollup
    ? `~${formattedDuration}`
    : formattedDuration;
  const showDurationInside = rect.width >= 22;

  // Nombre de la actividad — ahora va a la DERECHA de la barra (fuera del
  // rectángulo) para que sea legible aunque la barra sea estrecha. Si la
  // actividad es un rollup colapsado, añadimos "…" para distinguir.
  const labelNameRight = row.isCollapsedRollup ? `${row.name} ▾` : row.name;

  // Sub-tarea EDT: render más sutil (barra ligeramente más estrecha) para
  // reforzar la jerarquía actividad/tarea visualmente.
  const isTask = row.kind === 'task';
  const taskOpacity = isTask ? 0.75 : 1;
  const taskBarOffset = isTask ? 2 : 0;
  const taskBarHeight = isTask ? BAR_HEIGHT - 4 : BAR_HEIGHT;

  // Forma cápsula completa (rx = altura/2) estilo Bryntum. Dos capas:
  //  - Fondo CLARO ocupando todo el ancho (parte pendiente).
  //  - Capa OSCURA encima limitada al % de progress.
  // Si progress = 0 (default en EDT plantilla), se ve solo el fondo claro;
  // ponemos al menos un tinte oscuro al borde para mantener visibilidad.
  const radius = taskBarHeight / 2;
  const progress = Math.max(0, Math.min(100, row.progress ?? 0));
  const progressWidth = (rect.width * progress) / 100;
  // En EDT plantilla (progress=0) preferimos pintar la barra "completa" en el
  // tono oscuro porque no hay seguimiento real — la metáfora claro/oscuro
  // solo aplica cuando hay datos reales. Heurística: si row.activityId está
  // presente Y progress está definido en tipos (>0), pintamos progreso;
  // si no, pintamos toda la barra en `fill`.
  const useProgressLayer = typeof row.progress === 'number';
  // Clip path circular para que la capa oscura herede el redondeo cápsula.
  const clipId = `bar-clip-${row.id}`;

  return (
    <g style={wrapperStyle}>
    <g
      onClick={handleClick}
      onDoubleClick={handleDouble}
      opacity={dim ? 0.3 : row.isCollapsedRollup ? 0.7 : taskOpacity}
    >
      <title>{tooltipText}</title>
      <defs>
        <clipPath id={clipId}>
          <rect
            x={0}
            y={y + taskBarOffset}
            width={rect.width}
            height={taskBarHeight}
            rx={radius}
            ry={radius}
          />
        </clipPath>
      </defs>
      {/* Capa 1: fondo (parte pendiente, color claro). Si no hay tracking de
          progreso, se usa el color principal directamente. */}
      <rect
        x={0}
        y={y + taskBarOffset}
        width={rect.width}
        height={taskBarHeight}
        rx={radius}
        ry={radius}
        fill={useProgressLayer ? light : fill}
        stroke={stroke}
        strokeWidth={selected ? 1.5 : 1}
        style={{ cursor: 'pointer', ...widthTransitionStyle }}
        onPointerDown={handleMoveDown}
      />
      {/* Capa 2: progreso (clippeada a la cápsula). Solo si hay tracking real. */}
      {useProgressLayer && progressWidth > 0 && (
        <rect
          x={0}
          y={y + taskBarOffset}
          width={progressWidth}
          height={taskBarHeight}
          fill={fill}
          clipPath={`url(#${clipId})`}
          pointerEvents="none"
          style={widthTransitionStyle}
        />
      )}
      {/* Indicador visual de atraso (Gantt de TAREAS reales): si la tarea tiene
          progress < 100 y su fecha de fin REAL ya pasó, borde rojo intermitente.
          NO aplica al Gantt de PROYECTO EDT (executionState presente): ahí las
          barras se posicionan sobre una fecha ancla sintética, así que comparar
          startDate+days con hoy daría siempre "pasado"; el retraso real se
          calcula con el cronograma anclado a fecha_inicio_obra y se pinta en
          rojo vía executionState. */}
      {useProgressLayer && row.executionState == null && typeof row.progress === 'number' && row.progress < 100 && (() => {
        const endDate = addDays(row.startDate, Math.max(0, row.days));
        if (endDate >= new Date()) return null;
        return (
          <rect
            x={-1}
            y={y + taskBarOffset - 1}
            width={rect.width + 2}
            height={taskBarHeight + 2}
            rx={radius}
            ry={radius}
            fill="none"
            stroke="#dc2626"
            strokeWidth={2}
            strokeDasharray="4 2"
            pointerEvents="none"
          >
            <title>Atraso: tarea no completada y fecha de fin ya pasó</title>
          </rect>
        );
      })()}
      {row.isCollapsedRollup && (
        <rect
          x={0}
          y={y + taskBarOffset}
          width={rect.width}
          height={taskBarHeight}
          rx={radius}
          ry={radius}
          fill="none"
          stroke={stroke}
          strokeWidth={1}
          strokeDasharray="3 2"
          pointerEvents="none"
          style={widthTransitionStyle}
        />
      )}
      {/* Duración (ej. "5d") centrada DENTRO de la barra. Color que contrasta:
          si la barra usa la doble capa (claro+oscuro), el texto va oscuro;
          si va plana en color principal (EDT plantilla), texto blanco. */}
      {showDurationInside && (
        <text
          x={rect.width / 2}
          y={y + taskBarOffset + taskBarHeight / 2}
          fill={useProgressLayer ? stroke : COLORS.barText}
          fontSize={10}
          fontFamily="ui-sans-serif, system-ui, sans-serif"
          fontWeight={600}
          textAnchor="middle"
          dominantBaseline="middle"
          pointerEvents="none"
          style={{ userSelect: 'none' }}
        >
          {durationLabel}
        </text>
      )}
      {/* Nombre de la actividad FUERA, a la derecha de la barra. Espacio
          generoso (14px) para que la cápsula respire y no se pegue al texto.
          Si hay subtítulo, subimos el nombre 5px para dejar sitio debajo. */}
      <text
        x={rect.width + 14 + rightLinePad}
        y={y + taskBarOffset + taskBarHeight / 2 - (subtitle ? 11 : 6)}
        fill="#1f2937"
        fontSize={12}
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        dominantBaseline="middle"
        pointerEvents="none"
        style={{ userSelect: 'none' }}
      >
        {labelNameRight}
      </text>
      {/* Subtítulo (roles responsables / recursos asignados) — gris atenuado,
          ~10px por debajo del nombre. Truncado a 40 chars en `subtitle`. */}
      {subtitle && (
        <text
          x={rect.width + 14 + rightLinePad}
          y={y + taskBarOffset + taskBarHeight / 2 + 7}
          fill={COLORS.textMuted}
          fontSize={9}
          fontFamily="ui-sans-serif, system-ui, sans-serif"
          dominantBaseline="middle"
          pointerEvents="none"
          style={{ userSelect: 'none' }}
        >
          {subtitle}
        </text>
      )}
      {/* Los puntitos de dependencia ya NO se pintan aquí: el contenedor los
          renderiza en una capa SUPERIOR (handlesOnly), por encima de las flechas,
          para que nunca queden tapados y se puedan añadir varias dependencias. */}
      {/* Estrella de "Actividad principal" (marcada en el editor): arriba a la
          IZQUIERDA de la cápsula, en el padding superior de la fila, para no
          tapar el texto (a la derecha), la cápsula ni las líneas de dependencia
          (que discurren por el centro vertical de la fila). (Chany 3 jun) */}
      {row.hasAccessories && (
        <text
          x={-3}
          y={y + taskBarOffset - 2}
          fontSize={11}
          fill="#f59e0b"
          stroke="#b45309"
          strokeWidth={0.3}
          dominantBaseline="auto"
          pointerEvents="none"
          style={{ userSelect: 'none' }}
        >
          <title>Actividad principal</title>★
        </text>
      )}
      {/* Resize handle DESPUÉS (encima en z-order). Si por alguna razón un
          círculo se monta encima (responsive resize del SVG, escala), el resize
          gana en el último 8px. */}
      {showResizeHandle && (
        <rect
          x={rect.width - RESIZE_HANDLE_WIDTH}
          y={y + taskBarOffset}
          width={RESIZE_HANDLE_WIDTH}
          height={taskBarHeight}
          fill="transparent"
          style={{ cursor: 'ew-resize' }}
          onPointerDown={handleResizeDown}
        >
          <title>Arrastra para redimensionar</title>
        </rect>
      )}
    </g>
    </g>
  );
}

export const GanttBar = memo(GanttBarImpl);
