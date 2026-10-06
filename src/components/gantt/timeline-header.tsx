'use client';

import { memo, useId } from 'react';
import { addDays, differenceInCalendarDays, format, isMonday, isWeekend, startOfDay, startOfMonth, startOfWeek } from 'date-fns';
import { es } from 'date-fns/locale';
import { COLORS, HEADER_HEIGHT, HEADER_STYLE, PROJECT_START_COLOR } from './constants';
import type { ViewMode } from './types';
import type { GanttLayout } from './use-gantt-layout';
import { type WorkingCalendar, isNonWorkingDate, workingHoursOfDay } from './working-calendar';

// Umbral de zoom (px/día) para etiquetar las HORAS de la jornada bajo cada día.
// Coincide con el umbral de timeline-body para que rejilla y cabecera casen.
const HOUR_MARKS_MIN_PX_PER_DAY = 60;

// Rótulo por día: desde 30 px/día el número («05») con la inicial de HOY /
// MAÑANA / AYER; desde 44 px/día «lun 05» con la palabra entera, como las
// columnas anchas y estrechas del planificador simplificado.
const DAY_CELL_MIN_PX = 30;
const DAY_CELL_WIDE_PX = 44;

type RelativeDay = 'HOY' | 'MAÑANA' | 'AYER';

// Por fechas de calendario y no por 24 h: el cambio de hora no descuadra el día.
function relativeDay(d: Date, now: Date = new Date()): RelativeDay | null {
  const diff = differenceInCalendarDays(d, now);
  if (diff === 0) return 'HOY';
  if (diff === 1) return 'MAÑANA';
  if (diff === -1) return 'AYER';
  return null;
}

interface TimelineHeaderProps {
  layout: GanttLayout;
  viewMode: ViewMode;
  // Fecha de inicio del proyecto/plantilla. Si se pasa, se pinta un "tag"
  // amarillo "Project start" centrado en esa columna en el header inferior.
  projectStart?: Date | null;
  // Fecha actual. Si se pasa, su columna se pinta en índigo con «HOY» debajo
  // de la fecha (y «MAÑANA»/«AYER» en las vecinas).
  today?: Date | null;
  // Calendario laboral; si está, vista=día y el zoom es alto, se pintan las
  // horas de jornada (08, 09, 10…) bajo cada día para leer la hora.
  calendar?: WorkingCalendar | null;
  // Scroll horizontal del contenedor: el rótulo del mes se queda pegado al
  // borde izquierdo visible mientras su mes siga en pantalla.
  scrollLeft?: number;
}

function TimelineHeaderImpl({ layout, viewMode, projectStart, today, calendar, scrollLeft = 0 }: TimelineHeaderProps) {
  const clipBase = `gantt-mes-${useId().replace(/:/g, '')}`;
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

  // Cabecera con el estilo del planificador simplificado (Chany 6-oct-2026):
  // cada día con su fecha y, debajo, «HOY», «MAÑANA» o «AYER»; el día de hoy
  // en índigo y los no laborables en gris. Solo cuando cada día tiene sitio
  // para su rótulo; con menos zoom se mantienen las marcas semanales.
  const dayCells: {
    x: number;
    label: string;
    relative: RelativeDay | null;
    isToday: boolean;
    nonWorking: boolean;
  }[] = [];
  const perDayLabels = viewMode === 'day' && pxPerDay >= DAY_CELL_MIN_PX;
  if (perDayLabels) {
    const wide = pxPerDay >= DAY_CELL_WIDE_PX;
    for (let i = 0; i < totalDays; i++) {
      const date = addDays(startDate, i);
      const relative = relativeDay(date, today ?? undefined);
      dayCells.push({
        x: xOf(date),
        label: wide
          ? date.toLocaleDateString('es-ES', { weekday: 'short', day: '2-digit' }).replace('.', '')
          : format(date, 'dd'),
        relative,
        isToday: relative === 'HOY',
        nonWorking: calendar ? isNonWorkingDate(calendar, date) : isWeekend(date),
      });
    }
  }
  const narrowCells = perDayLabels && pxPerDay < DAY_CELL_WIDE_PX;
  // Con las horas debajo no caben dos líneas: la etiqueta va en línea («lun 05 · HOY»).
  const relativeInline = showHourLabels;

  const todayCellX = today ? xOf(startOfDay(today)) : null;

  // Posición del marcador amarillo "Project start" (estilo Bryntum).
  const projectStartX = projectStart ? xOf(projectStart) : null;

  const font = 'inherit';
  const lowerMid = rowH + (HEADER_HEIGHT - rowH) / 2;

  return (
    <g style={{ fontFamily: font }}>
      {/* Fondo del header completo */}
      <rect
        x={0}
        y={0}
        width={totalWidth}
        height={HEADER_HEIGHT}
        fill="#ffffff"
      />
      {/* Banda superior: el mes, como FilaMeses del planificador. El rótulo se
          desliza con el scroll horizontal y no sale de su mes. */}
      <rect x={0} y={0} width={totalWidth} height={rowH} fill={HEADER_STYLE.monthBg} />
      {months.map((m, i) => {
        const pad = 8;
        const estWidth = m.label.length * 6.6;
        const labelX = Math.max(m.x + pad, Math.min(scrollLeft + pad, m.x + m.width - estWidth - pad));
        return (
          <g key={`m-${i}`}>
            <clipPath id={`${clipBase}-${i}`}>
              <rect x={m.x} y={0} width={Math.max(0, m.width - 2)} height={rowH} />
            </clipPath>
            {i > 0 && (
              <line
                x1={m.x}
                x2={m.x}
                y1={0}
                y2={HEADER_HEIGHT}
                stroke={HEADER_STYLE.border}
                strokeWidth={1}
              />
            )}
            <text
              x={labelX}
              y={rowH / 2}
              fontSize={11}
              fontWeight={600}
              fill={HEADER_STYLE.monthText}
              textAnchor="start"
              dominantBaseline="middle"
              clipPath={`url(#${clipBase}-${i})`}
              style={{ userSelect: 'none', textTransform: 'capitalize' }}
            >
              {m.label}
            </text>
          </g>
        );
      })}
      {/* Línea separadora entre fila superior (mes) y fila inferior (días) */}
      <line
        x1={0}
        x2={totalWidth}
        y1={rowH}
        y2={rowH}
        stroke={HEADER_STYLE.border}
        strokeWidth={1}
      />
      {/* Fondo de HOY también con poco zoom, cuando no caben los rótulos por día. */}
      {!perDayLabels && todayCellX !== null && todayCellX >= 0 && todayCellX <= totalWidth && (
        <rect
          x={todayCellX}
          y={rowH}
          width={Math.max(2, pxPerDay)}
          height={HEADER_HEIGHT - rowH}
          fill={HEADER_STYLE.todayBg}
        >
          <title>Hoy</title>
        </rect>
      )}
      {perDayLabels
        ? dayCells.map((c, i) => {
            const fill = c.isToday ? HEADER_STYLE.todayText : c.nonWorking ? HEADER_STYLE.nonWorkingText : HEADER_STYLE.dayText;
            const tag = c.relative ? (narrowCells ? c.relative.charAt(0) : c.relative) : null;
            const tagFill = c.isToday ? HEADER_STYLE.todayText : HEADER_STYLE.relativeText;
            const cx = c.x + pxPerDay / 2;
            return (
              <g key={`d-${i}`}>
                {(c.isToday || c.nonWorking) && (
                  <rect
                    x={c.x}
                    y={rowH}
                    width={pxPerDay}
                    height={HEADER_HEIGHT - rowH}
                    fill={c.isToday ? HEADER_STYLE.todayBg : HEADER_STYLE.nonWorkingBg}
                  />
                )}
                <line x1={c.x} x2={c.x} y1={rowH} y2={HEADER_HEIGHT} stroke={HEADER_STYLE.border} />
                {relativeInline ? (
                  <text
                    x={cx}
                    y={rowH + 9}
                    fontSize={11}
                    fontWeight={500}
                    fill={fill}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    style={{ userSelect: 'none' }}
                  >
                    {c.label}
                    {tag && (
                      <tspan fontWeight={700} fill={tagFill}>{` · ${tag}`}</tspan>
                    )}
                  </text>
                ) : (
                  <>
                    <text
                      x={cx}
                      y={tag ? rowH + 11 : lowerMid}
                      fontSize={11}
                      fontWeight={500}
                      fill={fill}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      style={{ userSelect: 'none' }}
                    >
                      {c.label}
                    </text>
                    {tag && (
                      <text
                        x={cx}
                        y={rowH + 23}
                        fontSize={narrowCells ? 7 : 9}
                        fontWeight={700}
                        fill={tagFill}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        letterSpacing="0.025em"
                        style={{ userSelect: 'none' }}
                      >
                        {tag}
                      </text>
                    )}
                  </>
                )}
              </g>
            );
          })
        : minorTicks.map((t, i) => (
            <g key={`mt-${i}`}>
              <line
                x1={t.x}
                x2={t.x}
                y1={rowH}
                y2={HEADER_HEIGHT}
                stroke={HEADER_STYLE.border}
              />
              {pxPerDay > 6 && (
                <text
                  x={t.x + 6}
                  y={lowerMid}
                  fontSize={11}
                  fontWeight={500}
                  fill={HEADER_STYLE.dayText}
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

      {/* Etiquetas de HORA bajo cada día (solo calendario + día + zoom alto).
          Se pintan pegadas al borde inferior del header para no chocar con la
          fecha "dd MMM" de la banda inferior. */}
      {hourLabels.map((hl, i) => (
        <text
          key={`hr-${i}`}
          x={hl.x + 1}
          y={HEADER_HEIGHT - 3}
          fontSize={8}
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
        stroke={HEADER_STYLE.border}
      />
    </g>
  );
}

export const TimelineHeader = memo(TimelineHeaderImpl);
