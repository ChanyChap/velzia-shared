/**
 * Propagación de fechas tras crear/editar/borrar una dependencia entre
 * tareas reales (tabla `tareas`). Recalcula start/end de todas las tareas
 * alcanzables descendiendo desde `seedTaskId` respetando las dependencias
 * con FS/SS/FF/SF + lag_days. Mantiene la duración de cada tarea.
 *
 * Algoritmo: BFS para encontrar la subred descendiente + topological sort
 * iterativo (mismo patrón que el scheduling intra-actividad de
 * use-gantt-data.ts:166-195). Guard contra ciclos con maxIter.
 *
 * No persiste. Devuelve solo las tareas cuyas fechas cambian. El caller
 * decide qué hacer con los changes (batch UPDATE o descarte si ciclo).
 */

import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns';
import type { GanttTask as Tarea, GanttDep as TaskDependency } from './types';
import { addWorkingDays, countWorkingDays, nextWorkingDate, type WorkingCalendar } from './working-calendar';

export interface DateChange {
  taskId: string;
  start: string;
  end: string;
}

export interface PropagateResult {
  changes: DateChange[];
  cycleDetected: boolean;
  cycleTaskIds: string[];
}

export interface PropagateOptions {
  // Misma convención que ScheduleGantt.inclusiveEndDate: un `end_date` SIN hora
  // es el ÚLTIMO día incluido. Internamente se calcula con fin exclusivo (día
  // siguiente) y el `end` devuelto vuelve a ser el último día incluido.
  inclusiveEndDate?: boolean;
  // Calendario del Gantt. Si viene, lag y duración se cuentan en días HÁBILES
  // (Chany, 9-oct-2026): una sucesora FS no arranca en sábado y una tarea de 5
  // días no se queda en 3 hábiles por cruzar un finde. Sin él, días naturales.
  calendar?: WorkingCalendar | null;
}

interface Scheduled { start: Date; end: Date; }

// format de date-fns (hora LOCAL): toISOString() pasa a UTC y, en Europe/Madrid,
// la medianoche local cae en el día anterior.
const toISO = (d: Date): string => format(d, 'yyyy-MM-dd');

const isDateOnly = (iso: string): boolean => !iso.includes('T');

// Fin EXCLUSIVO (instante en que termina) con el que opera el algoritmo.
function exclusiveEnd(endISO: string, inclusive: boolean): Date {
  const d = parseISO(endISO);
  return inclusive && isDateOnly(endISO) ? addDays(d, 1) : d;
}

function durationOf(t: Tarea, inclusive: boolean): number {
  if (typeof t.duration_days === 'number' && t.duration_days > 0) return t.duration_days;
  if (t.start_date && t.end_date) {
    const diff = differenceInCalendarDays(exclusiveEnd(t.end_date, inclusive), parseISO(t.start_date));
    if (diff > 0) return diff;
  }
  return 1;
}

// Días HÁBILES que ocupa la tarea según sus fechas actuales. Un fin con hora
// (que no sea medianoche) cuenta su propio día: ese día se trabaja.
function workingDurationOf(t: Tarea, inclusive: boolean, cal: WorkingCalendar): number {
  if (t.start_date && t.end_date) {
    const endExcl = exclusiveEnd(t.end_date, inclusive);
    const endsInsideDay = !isDateOnly(t.end_date) && (endExcl.getHours() !== 0 || endExcl.getMinutes() !== 0);
    const n = countWorkingDays(cal, parseISO(t.start_date), endsInsideDay ? addDays(endExcl, 1) : endExcl);
    if (n > 0) return n;
  }
  if (typeof t.duration_days === 'number' && t.duration_days > 0) return Math.ceil(t.duration_days);
  return 1;
}

function currentDates(t: Tarea, inclusive: boolean): Scheduled | null {
  if (!t.start_date) return null;
  const start = parseISO(t.start_date);
  const end = t.end_date ? exclusiveEnd(t.end_date, inclusive) : addDays(start, durationOf(t, inclusive));
  return { start, end };
}

export function propagateTaskDates(
  seedTaskId: string,
  tasks: Tarea[],
  deps: TaskDependency[],
  options: PropagateOptions = {},
): PropagateResult {
  const inclusive = !!options.inclusiveEndDate;
  const cal = options.calendar ?? null;
  // Con calendario: el inicio cae en el primer hábil >= ancla, y el fin
  // (exclusivo) es el día siguiente al último hábil, así la barra no se estira
  // sobre el finde que la sigue.
  const startFrom = (anchor: Date, lag: number): Date =>
    cal ? addWorkingDays(cal, nextWorkingDate(cal, anchor), Math.round(lag)) : addDays(anchor, lag);
  const endFromStart = (start: Date, dur: number): Date =>
    cal ? addDays(addWorkingDays(cal, start, Math.max(1, dur) - 1), 1) : addDays(start, dur);
  // FF/SF: se ancla el FIN y se retrocede la duración para obtener el inicio.
  const startBeforeEnd = (anchor: Date, lag: number, dur: number): Date =>
    cal ? addWorkingDays(cal, startFrom(anchor, lag), -Math.max(1, dur)) : addDays(anchor, lag - dur);
  // Fin que se devuelve: con la convención inclusiva, el último día incluido.
  const endToISO = (end: Date, t: Tarea): string =>
    inclusive && (!t.end_date || isDateOnly(t.end_date)) ? toISO(addDays(end, -1)) : toISO(end);
  const byId = new Map<string, Tarea>(tasks.map(t => [t.id, t]));
  if (!byId.has(seedTaskId)) {
    return { changes: [], cycleDetected: false, cycleTaskIds: [] };
  }

  const predsByTask = new Map<string, TaskDependency[]>();
  const successorsByTask = new Map<string, TaskDependency[]>();
  for (const d of deps) {
    const preds = predsByTask.get(d.successor_id) ?? [];
    preds.push(d);
    predsByTask.set(d.successor_id, preds);
    const succs = successorsByTask.get(d.predecessor_id) ?? [];
    succs.push(d);
    successorsByTask.set(d.predecessor_id, succs);
  }

  const reachable = new Set<string>([seedTaskId]);
  const queue: string[] = [seedTaskId];
  while (queue.length > 0) {
    const curr = queue.shift() as string;
    const succs = successorsByTask.get(curr) ?? [];
    for (const d of succs) {
      if (!reachable.has(d.successor_id)) {
        reachable.add(d.successor_id);
        queue.push(d.successor_id);
      }
    }
  }

  const scheduled = new Map<string, Scheduled>();
  for (const t of tasks) {
    if (reachable.has(t.id)) continue;
    const c = currentDates(t, inclusive);
    if (c) scheduled.set(t.id, c);
  }

  const remaining = new Set(reachable);
  const maxIter = reachable.size + 1;
  let iter = 0;

  while (remaining.size > 0 && iter++ < maxIter) {
    let progressedThisRound = false;
    for (const tid of Array.from(remaining)) {
      const preds = predsByTask.get(tid) ?? [];
      const reachablePreds = preds.filter(p => reachable.has(p.predecessor_id));
      const allReachablePredsDone = reachablePreds.every(p => scheduled.has(p.predecessor_id));
      if (!allReachablePredsDone) continue;

      const task = byId.get(tid);
      if (!task) { remaining.delete(tid); continue; }

      const dur = cal ? workingDurationOf(task, inclusive, cal) : durationOf(task, inclusive);
      const original = currentDates(task, inclusive);

      let newStart: Date | null = null;
      let newEnd: Date | null = null;

      if (preds.length === 0) {
        if (original) {
          newStart = original.start;
          newEnd = original.end;
        }
      } else {
        let earliest: Date | null = null;
        for (const d of preds) {
          const predScheduled = scheduled.get(d.predecessor_id);
          if (!predScheduled) continue;
          let candidate: Date | null = null;
          const lag = d.lag_days ?? 0;
          if (d.dependency_type === 'FS') {
            candidate = startFrom(predScheduled.end, lag);
          } else if (d.dependency_type === 'SS') {
            candidate = startFrom(predScheduled.start, lag);
          } else if (d.dependency_type === 'FF') {
            candidate = startBeforeEnd(predScheduled.end, lag, dur);
          } else if (d.dependency_type === 'SF') {
            candidate = startBeforeEnd(predScheduled.start, lag, dur);
          }
          if (candidate && (!earliest || candidate > earliest)) {
            earliest = candidate;
          }
        }
        if (earliest) {
          newStart = earliest;
          newEnd = endFromStart(earliest, dur);
        } else if (original) {
          newStart = original.start;
          newEnd = original.end;
        }
      }

      if (newStart && newEnd) {
        scheduled.set(tid, { start: newStart, end: newEnd });
      }
      remaining.delete(tid);
      progressedThisRound = true;
    }
    if (!progressedThisRound) break;
  }

  const cycleDetected = remaining.size > 0;
  const cycleTaskIds = Array.from(remaining);

  const changes: DateChange[] = [];
  // Array.from: tsconfig no fija target, así que TS asume ES3 y no deja
  // iterar un Set con for...of sin downlevelIteration (rompe el build en Vercel).
  for (const tid of Array.from(reachable)) {
    if (!scheduled.has(tid)) continue;
    const task = byId.get(tid);
    if (!task) continue;
    const original = currentDates(task, inclusive);
    const next = scheduled.get(tid) as Scheduled;
    if (!original) {
      changes.push({ taskId: tid, start: toISO(next.start), end: endToISO(next.end, task) });
      continue;
    }
    if (
      next.start.getTime() !== original.start.getTime() ||
      next.end.getTime() !== original.end.getTime()
    ) {
      changes.push({ taskId: tid, start: toISO(next.start), end: endToISO(next.end, task) });
    }
  }

  return { changes, cycleDetected, cycleTaskIds };
}
