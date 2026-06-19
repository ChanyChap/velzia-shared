'use client';

import { memo } from 'react';
import { addDays, format, isMonday, startOfMonth, startOfWeek } from 'date-fns';
import { es } from 'date-fns/locale';
import { COLORS, HEADER_HEIGHT, PROJECT_START_COLOR } from './constants';
import type { ViewMode } from './types';
import type { GanttLayout } from './use-gantt-layout';
import { type WorkingCalendar, workingHoursOfDay } from './working-calendar';

// Umbral de zoom (px/día) para etiquetar las HORAS de la jornada bajo cada día.
// Coincide con el umbral de timeline-body para que rejilla y cabecera casen.
const HOUR_MARKS_MIN_PX_PER_DAY = 60;

interface TimelineHeaderProps {
  layout: GanttLayout;
  viewMode: ViewMode;
  // Fecha de inicio del proyecto/plantilla. Si se pasa, se pinta un "tag"
  // amarillo "Project start" centrado en esa columna en el header inferior.
  projectStart?: Date | null;
  // Fecha actual ("HOY"). Si se pasa, se pinta un tag rojo en el header
  // similar al de PROJECT START para localizar visualmente la columna del día.
  today?: Date | null;
  // Calendario laboral; si está, vista=día y el zoom es alto, se pintan las
  // horas de jornada (08, 09, 10…) bajo cada día para leer la hora.
  calendar?: WorkingCalendar | null;
}

function TimelineHeaderImpl({ layout, viewMode, projectStart, today, calendar }: TimelineHeaderProps) {
  const { startDate, totalDays, xOf, totalWidth, pxPerDay } = layout;

  const rowH = HEADER_HEIGHT / 2;

  // Etiquetas de hora bajo cada día: solo con calendario, vista=día y zoom alto.
  // Se dibujan en la mitad inferior del header, pequeñas, sin tapar la fecha.
  const showHourLabels =
    !!calendar && viewMode === 'day' && pxPerDay >= HOUR_MARKS_MIN_PX_PER_DAY;
  const hourLabels: { x: number; label: string }[] = [];
  if (showHourLabels && calendar) {
    const pxPerHour = pxPerDay / calendar.hoursPerDay;
    for (let i = 0; i < totalDays; i++) {
      const date = addDays(startDate, i);
      const dayHours = workingHoursOfDay(calendar, date);
      if (dayHours <= 0) continue;
      const dayCfg = calendar.schedule.get(date.getDay());
      const startHour = dayCfg ? Math.floor(dayCfg.startMin / 60) : 8;
      const dayX = xOf(date);
      // Una etiqueta por hora de jornada (mostramos par/impar según ancho para
      // no amontonar: si la hora no cabe en pxPerHour>=14, saltamos las impares).
      const step = pxPerHour >= 14 ? 1 : 2;
      for (let h = 0; h < Math.ceil(dayHours); h += step) {
        hourLabels.push({
          x: dayX + h * pxPerHour,
          label: String(startHour + h).padStart(2, '0'),
        });
      }
    }
  }

  const months: { x: number; width: number; label: string }[] = [];
  let cursor = startOfMonth(startDate);
  while (cursor <= addDays(startDate, totalDays)) {
    const next = startOfMonth(addDays(cursor, 32));
    const left = Math.max(0, xOf(cursor));
    const right = Math.min(totalWidth, xOf(next));
    months.push({
      x: left,
      width: Math.max(2, right - left),
      label: format(cursor, "LLLL yyyy", { locale: es }),
    });
    cursor = next;
  }

  // Para el header inferior tipo Bryntum queremos columnas semanales con la
  // fecha del LUNES (ej "09 Jun"). En modo day, generamos un tick por semana
  // (no por día) para que el header sea más limpio aunque cada día siga
  // siendo arrastrable abajo.
  const minorTicks: { x: number; label: string; emphasis: boolean }[] = [];
  if (viewMode === 'day') {
    // Si pxPerDay es muy alto (>= 30) mostramos día a día; si no, semana.
    if (pxPerDay >= 30) {
      for (let i = 0; i < totalDays; i++) {
        const date = addDays(startDate, i);
        const isMon = isMonday(date);
        minorTicks.push({
          x: xOf(date),
          label: format(date, "dd MMM", { locale: es }),
          emphasis: isMon,
        });
      }
    } else {
      let d = startOfWeek(startDate, { weekStartsOn: 1 });
      while (d <= addDays(startDate, totalDays)) {
        minorTicks.push({
          x: xOf(d),
          label: format(d, "dd MMM", { locale: es }),
          emphasis: true,
        });
        d = addDays(d, 7);
      }
    }
  } else if (viewMode === 'week') {
    let d = startOfWeek(startDate, { weekStartsOn: 1 });
    while (d <= addDays(startDate, totalDays)) {
      const weekNumber = format(d, 'I');
      minorTicks.push({
        x: xOf(d),
        label: `S${weekNumber}`,
        emphasis: false,
      });
      d = addDays(d, 7);
    }
  } else {
    for (let i = 0; i < totalDays; i += 7) {
      const date = addDays(startDate, i);
      if (date.getDate() <= 7) {
        minorTicks.push({
          x: xOf(date),
          label: format(date, 'd'),
          emphasis: true,
        });
      }
    }
  }

  // Posición del marcador amarillo "Project start" (estilo Bryntum).
  const projectStartX = projectStart ? xOf(projectStart) : null;

  return (
    <g>
      {/* Fondo del header completo */}
      <rect
        x={0}
        y={0}
        width={totalWidth}
        height={HEADER_HEIGHT}
        fill="#ffffff"
      />
      {/* Banda superior: meses con título grande tipo "Jun 2024" */}
      {months.map((m, i) => (
        <g key={`m-${i}`}>
          <rect
            x={m.x}
            y={0}
            width={m.width}
            height={rowH}
            fill="#ffffff"
          />
          {/* Separador vertical fino entre meses */}
          {i > 0 && (
            <line
              x1={m.x}
              x2={m.x}
              y1={0}
              y2={HEADER_HEIGHT}
              stroke={COLORS.grid}
              strokeWidth={1}
            />
          )}
          <text
            x={m.x + 12}
            y={rowH / 2}
            fontSize={13}
            fontFamily="ui-sans-serif, system-ui, sans-serif"
            fontWeight={500}
            fill={COLORS.text}
            textAnchor="start"
            dominantBaseline="middle"
            style={{ userSelect: 'none', textTransform: 'capitalize' }}
          >
            {m.label}
          </text>
        </g>
      ))}
      {/* Línea separadora entre fila superior (mes) y fila inferior (días) */}
      <line
        x1={0}
        x2={totalWidth}
        y1={rowH}
        y2={rowH}
        stroke={COLORS.grid}
        strokeWidth={1}
      />
      {/* Banda inferior: días/semanas con etiqueta "09 Jun" */}
      {minorTicks.map((t, i) => (
        <g key={`mt-${i}`}>
          <line
            x1={t.x}
            x2={t.x}
            y1={rowH}
            y2={HEADER_HEIGHT}
            stroke={COLORS.grid}
          />
          {pxPerDay > 6 && (
            <text
              x={t.x + 6}
              y={rowH + (HEADER_HEIGHT - rowH) / 2}
              fontSize={11}
              fontFamily="ui-sans-serif, system-ui, sans-serif"
              fontWeight={500}
              fill={COLORS.text}
              dominantBaseline="middle"
              style={{ userSelect: 'none' }}
            >
              {t.label}
            </text>
          )}
        </g>
      ))}
      {/* Marca de inicio del proyecto: solo un triángulo pequeño naranja
          apuntando hacia abajo en la separación entre las dos bandas del
          header, justo en la columna de la fecha. El label completo
          "Project start" tapaba el calendario; ahora se muestra como tooltip
          al hacer hover sobre el triángulo. La línea vertical naranja larga
          la pinta timeline-body. */}
      {projectStartX !== null && projectStartX >= 0 && projectStartX <= totalWidth && (
        <g>
          <polygon
            points={`${projectStartX - 5},${rowH - 1} ${projectStartX + 5},${rowH - 1} ${projectStartX},${rowH + 5}`}
            fill={PROJECT_START_COLOR}
            stroke="#b45309"
            strokeWidth={0.5}
            style={{ pointerEvents: 'all' }}
          >
            <title>Inicio del proyecto</title>
          </polygon>
        </g>
      )}

      {/* Marca HOY: triángulo rojo apuntando hacia abajo en la columna del día
          actual, simétrico al triángulo naranja de PROJECT START. La línea
          roja vertical en el body la sigue pintando timeline-body. */}
      {today && (() => {
        const x = xOf(today);
        if (x < 0 || x > totalWidth) return null;
        return (
          <g>
            <polygon
              points={`${x - 5},${rowH - 1} ${x + 5},${rowH - 1} ${x},${rowH + 5}`}
              fill="#ef4444"
              stroke="#991b1b"
              strokeWidth={0.5}
              style={{ pointerEvents: 'all' }}
            >
              <title>Hoy</title>
            </polygon>
          </g>
        );
      })()}
      {/* Etiquetas de HORA bajo cada día (solo calendario + día + zoom alto).
          Se pintan pegadas al borde inferior del header para no chocar con la
          fecha "dd MMM" de la banda inferior. */}
      {hourLabels.map((hl, i) => (
        <text
          key={`hr-${i}`}
          x={hl.x + 1}
          y={HEADER_HEIGHT - 3}
          fontSize={8}
          fontFamily="ui-sans-serif, system-ui, sans-serif"
          fill={COLORS.textMuted}
          dominantBaseline="alphabetic"
          style={{ userSelect: 'none' }}
        >
          {hl.label}
        </text>
      ))}
      {/* Línea inferior del header */}
      <line
        x1={0}
        x2={totalWidth}
        y1={HEADER_HEIGHT}
        y2={HEADER_HEIGHT}
        stroke={COLORS.grid}
      />
    </g>
  );
}

export const TimelineHeader = memo(TimelineHeaderImpl);
