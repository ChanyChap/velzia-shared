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

import { addDays, differenceInCalendarDays, parseISO } from 'date-fns';
import type { GanttTask as Tarea, GanttDep as TaskDependency } from './types';

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

interface Scheduled { start: Date; end: Date; }

const toISO = (d: Date): string => d.toISOString().slice(0, 10);

function durationOf(t: Tarea): number {
  if (typeof t.duration_days === 'number' && t.duration_days > 0) return t.duration_days;
  if (t.start_date && t.end_date) {
    const diff = differenceInCalendarDays(parseISO(t.end_date), parseISO(t.start_date));
    if (diff > 0) return diff;
  }
  return 1;
}

function currentDates(t: Tarea): Scheduled | null {
  if (!t.start_date) return null;
  const start = parseISO(t.start_date);
  const end = t.end_date ? parseISO(t.end_date) : addDays(start, durationOf(t));
  return { start, end };
}

export function propagateTaskDates(
  seedTaskId: string,
  tasks: Tarea[],
  deps: TaskDependency[],
): PropagateResult {
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
    const c = currentDates(t);
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

      const dur = durationOf(task);
      const original = currentDates(task);

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
            candidate = addDays(predScheduled.end, lag);
          } else if (d.dependency_type === 'SS') {
            candidate = addDays(predScheduled.start, lag);
          } else if (d.dependency_type === 'FF') {
            candidate = addDays(predScheduled.end, lag - dur);
          } else if (d.dependency_type === 'SF') {
            candidate = addDays(predScheduled.start, lag - dur);
          }
          if (candidate && (!earliest || candidate > earliest)) {
            earliest = candidate;
          }
        }
        if (earliest) {
          newStart = earliest;
          newEnd = addDays(earliest, dur);
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
    const original = currentDates(task);
    const next = scheduled.get(tid) as Scheduled;
    if (!original) {
      changes.push({ taskId: tid, start: toISO(next.start), end: toISO(next.end) });
      continue;
    }
    if (
      next.start.getTime() !== original.start.getTime() ||
      next.end.getTime() !== original.end.getTime()
    ) {
      changes.push({ taskId: tid, start: toISO(next.start), end: toISO(next.end) });
    }
  }

  return { changes, cycleDetected, cycleTaskIds };
}
