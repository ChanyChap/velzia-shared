// ═══════════════════════════════════════════════════════════════════
// Calendario laboral del cliente para el Gantt EDT (lado cliente)
// ═══════════════════════════════════════════════════════════════════
//
// PORQUÉ: el CPM del Gantt de plantilla EDT trabaja en "días laborables
// abstractos" (HOURS_PER_DAY = 8). Chany necesita que la programación
// respete la jornada REAL del tenant: si una actividad de 1h empieza el
// 6/1 a las 08:00, su sucesora FS debe empezar el 6/1 a las 09:00, y las
// horas deben repartirse entre días laborables saltando findes y festivos.
// Este módulo convierte los offsets abstractos del CPM a fechas+hora
// reales usando la jornada (work_schedules) y los festivos (holidays) del
// tenant, que el endpoint /working-calendar entrega ya filtrado por tenant.

// ───────────────────────────────────────────────────────────────────
// Shape crudo que devuelve el endpoint
// ───────────────────────────────────────────────────────────────────

// Una fila de jornada semanal tal cual llega del servidor (work_schedules).
export interface RawWorkScheduleDay {
  day_of_week: number; // 0=domingo .. 6=sábado
  is_working_day: boolean;
  start_time: string; // "08:00:00"
  end_time: string; // "17:00:00"
  break_minutes: number;
}

// Respuesta completa del endpoint de calendario laboral.
export interface WorkingCalendarRaw {
  schedule: RawWorkScheduleDay[];
  holidays: string[]; // fechas ISO "YYYY-MM-DD" (recurrentes ya expandidos)
  hoursPerDay: number;
}

// ───────────────────────────────────────────────────────────────────
// Estructura procesada (lista para cálculo rápido)
// ───────────────────────────────────────────────────────────────────

// Jornada de un día ya normalizada a minutos desde medianoche.
export interface CalendarDay {
  is_working_day: boolean;
  startMin: number; // minutos desde 00:00 hasta el inicio de jornada
  endMin: number; // minutos desde 00:00 hasta el fin de jornada
  breakMin: number; // minutos de descanso dentro de la jornada
}

export interface WorkingCalendar {
  // Indexado por day_of_week (0=domingo..6=sábado)
  schedule: Map<number, CalendarDay>;
  // Festivos puntuales como claves "YYYY-MM-DD".
  holidays: Set<string>;
  // Festivos recurrentes anuales (clave "MM-DD") como defensa por si el
  // reparto de horas cae fuera del rango ISO que envió el endpoint.
  recurringHolidays: Set<string>;
  // Horas de un día laborable "típico" — base de la conversión offset↔horas.
  hoursPerDay: number;
}

// ───────────────────────────────────────────────────────────────────
// Helpers internos de fecha
// ───────────────────────────────────────────────────────────────────

// Clave "YYYY-MM-DD" en hora LOCAL (no UTC) para no desfasar el día por la
// zona horaria. El Gantt es abstracto y se ancla a fechas locales.
function dateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Clave "MM-DD" para comparar festivos recurrentes anuales.
function monthDayKey(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${m}-${d}`;
}

// Convierte "HH:MM[:SS]" a minutos desde medianoche.
function timeToMinutes(time: string): number {
  const parts = time.split(":").map(Number);
  const h = parts[0] || 0;
  const m = parts[1] || 0;
  return h * 60 + m;
}

// ───────────────────────────────────────────────────────────────────
// buildWorkingCalendar — construye el calendario desde la respuesta cruda
// ───────────────────────────────────────────────────────────────────

/**
 * Construye un WorkingCalendar a partir del shape crudo del endpoint.
 * Normaliza horas a minutos y deriva el set de recurrentes (mes-día).
 */
export function buildWorkingCalendar(raw: WorkingCalendarRaw): WorkingCalendar {
  const schedule = new Map<number, CalendarDay>();
  for (const row of raw.schedule) {
    schedule.set(row.day_of_week, {
      is_working_day: row.is_working_day,
      startMin: timeToMinutes(row.start_time),
      endMin: timeToMinutes(row.end_time),
      breakMin: row.break_minutes ?? 0,
    });
  }

  const holidays = new Set<string>();
  const recurringHolidays = new Set<string>();
  for (const iso of raw.holidays) {
    holidays.add(iso);
    if (iso.length >= 10) recurringHolidays.add(iso.slice(5, 10));
  }

  return {
    schedule,
    holidays,
    recurringHolidays,
    hoursPerDay: raw.hoursPerDay > 0 ? raw.hoursPerDay : 8,
  };
}

// ───────────────────────────────────────────────────────────────────
// isHoliday / isWorkingDate — un día concreto es laborable o no
// ───────────────────────────────────────────────────────────────────

// True si la fecha es festivo (puntual o recurrente por mes-día).
function isHoliday(cal: WorkingCalendar, date: Date): boolean {
  if (cal.holidays.has(dateKey(date))) return true;
  return cal.recurringHolidays.has(monthDayKey(date));
}

// True si la fecha es un día laborable real (jornada activa y no festivo).
function isWorkingDate(cal: WorkingCalendar, date: Date): boolean {
  const day = cal.schedule.get(date.getDay());
  if (!day || !day.is_working_day) return false;
  return !isHoliday(cal, date);
}

// True si la fecha NO es laborable (finde o festivo según el calendario del
// tenant). La usa el Gantt para sombrear en gris esos días. Exportada porque
// timeline-body necesita distinguir festivos además de los findes.
export function isNonWorkingDate(cal: WorkingCalendar, date: Date): boolean {
  return !isWorkingDate(cal, date);
}

// ───────────────────────────────────────────────────────────────────
// workingHoursOfDay — horas laborables netas de un día concreto
// ───────────────────────────────────────────────────────────────────

/**
 * Horas laborables netas de un día (jornada menos descanso). 0 si el día
 * no es laborable o es festivo.
 */
export function workingHoursOfDay(cal: WorkingCalendar, date: Date): number {
  const day = cal.schedule.get(date.getDay());
  if (!day || !day.is_working_day) return 0;
  if (isHoliday(cal, date)) return 0;
  const netMin = day.endMin - day.startMin - day.breakMin;
  return netMin > 0 ? netMin / 60 : 0;
}

// ───────────────────────────────────────────────────────────────────
// Helpers de avance de fecha
// ───────────────────────────────────────────────────────────────────

// Devuelve un Date al inicio de jornada (start_time) del día dado.
function atStartOfWorkday(cal: WorkingCalendar, date: Date): Date {
  const day = cal.schedule.get(date.getDay());
  const startMin = day ? day.startMin : 8 * 60; // 08:00 por defecto
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  result.setMinutes(startMin);
  return result;
}

// Devuelve el siguiente día laborable a partir de date (excluyente),
// posicionado al inicio de su jornada. Tope de seguridad de 366 días.
function nextWorkingDayStart(cal: WorkingCalendar, date: Date): Date {
  const cursor = new Date(date);
  cursor.setHours(0, 0, 0, 0);
  for (let i = 0; i < 366; i++) {
    cursor.setDate(cursor.getDate() + 1);
    if (isWorkingDate(cal, cursor)) {
      return atStartOfWorkday(cal, cursor);
    }
  }
  // Fallback defensivo: no debería ocurrir con una jornada válida.
  return atStartOfWorkday(cal, cursor);
}

// ───────────────────────────────────────────────────────────────────
// workingStartOfProject — primer instante laborable >= ancla
// ───────────────────────────────────────────────────────────────────

/**
 * Primer instante laborable a partir de anchorDate, posicionado a la hora
 * de inicio de jornada. Si el día del ancla es laborable usa su start_time;
 * si no, salta al siguiente día laborable.
 */
export function workingStartOfProject(cal: WorkingCalendar, anchorDate: Date): Date {
  if (isWorkingDate(cal, anchorDate)) {
    return atStartOfWorkday(cal, anchorDate);
  }
  return nextWorkingDayStart(cal, anchorDate);
}

// ───────────────────────────────────────────────────────────────────
// addWorkingHours — reparte horas laborables sobre el calendario real
// ───────────────────────────────────────────────────────────────────

/**
 * Reparte `hours` horas laborables a partir de startDateTime y devuelve la
 * fecha+hora resultante.
 *
 * MODELO DEL DESCANSO (decisión documentada): tratamos la jornada como un
 * bloque contiguo de horas NETAS (jornada bruta menos break) que empieza a
 * start_time. Es decir, NO insertamos el hueco de la comida en el reloj: si
 * la jornada es 08:00-17:00 con 60 min de break (8h netas), 8h de trabajo
 * terminan a las 16:00 (08:00 + 8h netas), no a las 17:00. Se eligió por ser
 * simple, determinista y coherente con HOURS_PER_DAY: una actividad de "1
 * día" (8h) llena exactamente la capacidad neta del día. Si en el futuro se
 * quiere modelar el hueco real de la comida habría que partir la jornada en
 * dos tramos; no se necesita para el caso de Chany (actividades cortas al
 * inicio de jornada).
 *
 * Caso de Chany: empieza 6/1 08:00, 1h → consume 1h de las 8h netas del día
 * → termina 6/1 09:00. La sucesora FS arranca en ese mismo instante.
 */
export function addWorkingHours(
  cal: WorkingCalendar,
  startDateTime: Date,
  hours: number,
): Date {
  // Normaliza el punto de partida a un instante laborable válido.
  let cursor = new Date(startDateTime);
  if (!isWorkingDate(cal, cursor)) {
    cursor = nextWorkingDayStart(cal, cursor);
  } else {
    // Si el instante cae antes del inicio de jornada, lo subimos a start.
    const cfg = cal.schedule.get(cursor.getDay());
    const cursorMin = cursor.getHours() * 60 + cursor.getMinutes();
    if (cfg && cursorMin < cfg.startMin) {
      cursor = atStartOfWorkday(cal, cursor);
    }
  }

  let remaining = hours;
  // Tope de iteraciones (~un día por vuelta) para evitar bucles infinitos.
  let guard = 0;
  while (remaining > 1e-9 && guard < 4000) {
    guard++;
    const day = cal.schedule.get(cursor.getDay());
    const dayNetHours = workingHoursOfDay(cal, cursor);

    if (!day || dayNetHours <= 0) {
      cursor = nextWorkingDayStart(cal, cursor);
      continue;
    }

    // Minutos ya consumidos del día desde su inicio de jornada (modelo
    // contiguo neto: el cursor avanza dentro del bloque de horas netas).
    const cursorMin = cursor.getHours() * 60 + cursor.getMinutes();
    const consumedMin = Math.max(0, cursorMin - day.startMin);
    const dayCapacityMin = dayNetHours * 60;
    const availableMin = dayCapacityMin - consumedMin;

    const needMin = remaining * 60;

    if (needMin <= availableMin + 1e-6) {
      // Cabe en lo que queda de hoy: avanzamos el cursor y terminamos.
      cursor = new Date(cursor.getTime() + needMin * 60 * 1000);
      remaining = 0;
      break;
    }

    // No cabe: consumimos lo que queda de hoy y saltamos al siguiente día.
    remaining -= availableMin / 60;
    cursor = nextWorkingDayStart(cal, cursor);
  }

  return cursor;
}

// ───────────────────────────────────────────────────────────────────
// offsetDaysToDateTime — convierte offset del CPM a fecha+hora real
// ───────────────────────────────────────────────────────────────────

/**
 * Convierte un offset del CPM (en días laborables abstractos de hoursPerDay)
 * a una fecha+hora real. Multiplica offset * hoursPerDay = horas laborables y
 * aplica addWorkingHours desde el inicio laborable del proyecto (primer
 * instante laborable >= anchorDate).
 */
export function offsetDaysToDateTime(
  cal: WorkingCalendar,
  anchorDate: Date,
  offsetInWorkingDays: number,
): Date {
  const projectStart = workingStartOfProject(cal, anchorDate);
  if (offsetInWorkingDays <= 0) return projectStart;
  const hours = offsetInWorkingDays * cal.hoursPerDay;
  return addWorkingHours(cal, projectStart, hours);
}

// ───────────────────────────────────────────────────────────────────
// Aritmética de DÍAS HÁBILES (mover barras y propagar a sucesoras)
// ───────────────────────────────────────────────────────────────────
//
// PORQUÉ: Chany (9-oct-2026) decidió que mover una barra y propagar a las
// sucesoras cuente días HÁBILES del calendario del Gantt, no naturales: una
// tarea de 5 días que se mueve al jueves no puede quedarse en 5 días naturales
// (jue→lun = 3 hábiles). Trabajan por FECHA, no por horas: la hora del día del
// Date de entrada se conserva tal cual (como shiftDateKeepingTime en el Gantt).

// Tope de días que se recorren buscando un laborable: un calendario sin ningún
// día laborable no debe colgar la pestaña.
const MAX_SCAN_DAYS = 3660;

/**
 * El propio día si es laborable; si no, el siguiente laborable. Conserva la
 * hora del día. Si el calendario no tiene ningún laborable, devuelve la fecha
 * tal cual.
 */
export function nextWorkingDate(cal: WorkingCalendar, date: Date): Date {
  const cursor = new Date(date);
  for (let i = 0; i < MAX_SCAN_DAYS; i++) {
    if (isWorkingDate(cal, cursor)) return cursor;
    cursor.setDate(cursor.getDate() + 1);
  }
  return new Date(date);
}

/**
 * Avanza (n > 0) o retrocede (n < 0) `n` días laborables desde `date`, saltando
 * findes y festivos; solo cuentan los días en los que se ATERRIZA. Con n = 0
 * devuelve la misma fecha. Conserva la hora del día. `n` se trunca a entero.
 */
export function addWorkingDays(cal: WorkingCalendar, date: Date, n: number): Date {
  const cursor = new Date(date);
  let remaining = Math.trunc(Math.abs(n));
  const step = n < 0 ? -1 : 1;
  let guard = 0;
  while (remaining > 0 && guard < MAX_SCAN_DAYS) {
    guard++;
    cursor.setDate(cursor.getDate() + step);
    if (isWorkingDate(cal, cursor)) {
      remaining--;
      guard = 0;
    }
  }
  return remaining > 0 ? new Date(date) : cursor;
}

/**
 * Días laborables en el intervalo semiabierto [from, to) por FECHA (la hora no
 * cuenta). Si `to` es anterior a `from`, el resultado es negativo (los
 * laborables de [to, from) con signo menos), de modo que
 * addWorkingDays(nextWorkingDate(from), countWorkingDays(from, to)) vuelve al
 * primer laborable >= to cuando `from` es laborable. Para contar un rango con
 * el último día incluido, pasa `to` = día siguiente al último.
 */
export function countWorkingDays(cal: WorkingCalendar, from: Date, to: Date): number {
  const a = new Date(from);
  a.setHours(0, 0, 0, 0);
  const b = new Date(to);
  b.setHours(0, 0, 0, 0);
  const sign = b < a ? -1 : 1;
  const [lo, hi] = sign > 0 ? [a, b] : [b, a];
  let count = 0;
  const cursor = new Date(lo);
  while (cursor < hi) {
    if (isWorkingDate(cal, cursor)) count++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return sign * count;
}

// ───────────────────────────────────────────────────────────────────
// Ventana de cada día en la REJILLA (columna del día = su jornada)
// ───────────────────────────────────────────────────────────────────
//
// PORQUÉ (deuda DT-20260930-CAL02 §6 de VelziaCAD): con horario por día (L-J
// 08–18, V 08–14) el Gantt colocaba todas las horas con UNA sola jornada
// (workdayStartHour + workdayHours). Un viernes las 11:00 caían al 30 % de la
// columna y las 14:00 (salida) al 60 %: el 40 % restante era una jornada que no
// existe y la barra no cuadraba con las sub-líneas de hora ni con el motor de
// VelziaCAD, que mide la fracción de cada día sobre SU ventana.
//
// Regla: con calendario, la columna de un día laborable representa SU jornada
// (inicio → inicio + horas netas). Sin calendario, o en un día sin jornada
// (finde, festivo, fila sin horas), se usa la jornada única de siempre: así
// RefoTask/OnSite, que no pasan calendario, no se mueven ni un píxel.

/** Jornada de un día en minutos: inicio desde medianoche y duración neta. */
export interface WorkdayWindow {
  startMin: number;
  minutes: number;
}

export function workdayWindowOf(
  cal: WorkingCalendar | null | undefined,
  date: Date,
  fallbackStartHour: number,
  fallbackHours: number,
): WorkdayWindow {
  if (cal) {
    const day = cal.schedule.get(date.getDay());
    if (day && day.is_working_day && !isHoliday(cal, date)) {
      // Horas NETAS (sin el descanso), igual que workingHoursOfDay y que
      // addWorkingHours: la jornada es un bloque contiguo desde start_time.
      const net = day.endMin - day.startMin - day.breakMin;
      if (net > 0) return { startMin: day.startMin, minutes: net };
    }
  }
  return { startMin: fallbackStartHour * 60, minutes: Math.max(1, fallbackHours) * 60 };
}

/** Fracción (0..1) de la columna del día en la que cae un instante con hora. */
export function workdayFractionOf(
  cal: WorkingCalendar | null | undefined,
  d: Date,
  fallbackStartHour: number,
  fallbackHours: number,
): number {
  const w = workdayWindowOf(cal, d, fallbackStartHour, fallbackHours);
  const minutesOfDay = d.getHours() * 60 + d.getMinutes();
  return Math.min(1, Math.max(0, (minutesOfDay - w.startMin) / w.minutes));
}

/**
 * Instante (fecha + hora) que corresponde a la posición `startFrac + spanDays`
 * medida en COLUMNAS desde el día de `start`: la parte entera son días de
 * calendario y la fracción, la parte de la jornada de ESE día. Es la inversa de
 * workdayFractionOf; la usa el tooltip para enseñar el fin de una barra con hora.
 */
export function dateAtColumnOffset(
  cal: WorkingCalendar | null | undefined,
  start: Date,
  spanDays: number,
  fallbackStartHour: number,
  fallbackHours: number,
): Date {
  const startFrac = workdayFractionOf(cal, start, fallbackStartHour, fallbackHours);
  const endOffset = startFrac + Math.max(0, spanDays);
  // Un entero exacto es la SALIDA del día anterior, no la entrada del siguiente.
  const extraDays = endOffset > 0 ? Math.ceil(endOffset - 1e-9) - 1 : 0;
  const endFrac = endOffset - extraDays;
  const endDay = new Date(start);
  endDay.setHours(0, 0, 0, 0);
  endDay.setDate(endDay.getDate() + extraDays);
  const w = workdayWindowOf(cal, endDay, fallbackStartHour, fallbackHours);
  endDay.setMinutes(Math.round(w.startMin + endFrac * w.minutes));
  return endDay;
}
