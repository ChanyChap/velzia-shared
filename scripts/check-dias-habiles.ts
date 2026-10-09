// Comprobación mínima (el paquete no tiene runner de tests) de la aritmética de
// días hábiles y de propagateTaskDates con calendario.
// Ejecutar: npx tsx scripts/check-dias-habiles.ts
import assert from 'node:assert/strict';
import { addWorkingDays, buildWorkingCalendar, countWorkingDays, nextWorkingDate } from '../src/components/gantt/working-calendar';
import { propagateTaskDates } from '../src/components/gantt/propagate-task-dates';
import type { GanttTask, GanttDep } from '../src/components/gantt/types';

const laborable = (d: number) => ({ day_of_week: d, is_working_day: d >= 1 && d <= 5, start_time: '08:00:00', end_time: '17:00:00', break_minutes: 60 });
// Festivo: miércoles 14-oct-2026.
const cal = buildWorkingCalendar({ schedule: [0, 1, 2, 3, 4, 5, 6].map(laborable), holidays: ['2026-10-14'], hoursPerDay: 8 });
const d = (iso: string) => new Date(`${iso}T00:00:00`);
const k = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;

// 10-oct-2026 es sábado.
assert.equal(k(nextWorkingDate(cal, d('2026-10-10'))), '2026-10-12');
assert.equal(k(nextWorkingDate(cal, d('2026-10-09'))), '2026-10-09');
assert.equal(k(nextWorkingDate(cal, d('2026-10-14'))), '2026-10-15');
assert.equal(k(addWorkingDays(cal, d('2026-10-09'), 1)), '2026-10-12');
assert.equal(k(addWorkingDays(cal, d('2026-10-12'), 2)), '2026-10-15'); // salta el festivo
assert.equal(k(addWorkingDays(cal, d('2026-10-12'), -1)), '2026-10-09');
assert.equal(k(addWorkingDays(cal, d('2026-10-12'), 0)), '2026-10-12');
const conHora = addWorkingDays(cal, new Date('2026-10-09T10:30:00'), 1);
assert.equal(conHora.getHours() * 60 + conHora.getMinutes(), 630);
assert.equal(countWorkingDays(cal, d('2026-10-05'), d('2026-10-10')), 5);
assert.equal(countWorkingDays(cal, d('2026-10-12'), d('2026-10-17')), 4); // festivo
assert.equal(countWorkingDays(cal, d('2026-10-10'), d('2026-10-05')), -5);
assert.equal(countWorkingDays(cal, d('2026-10-05'), d('2026-10-05')), 0);

const t = (id: string, start: string, end: string): GanttTask => ({ id, start_date: start, end_date: end } as GanttTask);
const dep = (pred: string, succ: string, type = 'FS', lag = 0): GanttDep => ({ id: `${pred}-${succ}`, predecessor_id: pred, successor_id: succ, dependency_type: type, lag_days: lag } as GanttDep);

// FS, fin inclusivo (VelziaCAD): A lun 5 → vie 9; B (3 hábiles) arranca el lun 12
// y, saltando el festivo del 14, acaba el jue 15.
{
  const r = propagateTaskDates('A', [t('A', '2026-10-05', '2026-10-09'), t('B', '2026-10-01', '2026-10-05')], [dep('A', 'B')], { inclusiveEndDate: true, calendar: cal });
  assert.deepEqual(r.changes, [{ taskId: 'B', start: '2026-10-12', end: '2026-10-15' }]);
}
// Igual con lag 1 hábil → mar 13, y 3 hábiles → vie 16.
{
  const r = propagateTaskDates('A', [t('A', '2026-10-05', '2026-10-09'), t('B', '2026-10-01', '2026-10-05')], [dep('A', 'B', 'FS', 1)], { inclusiveEndDate: true, calendar: cal });
  assert.deepEqual(r.changes, [{ taskId: 'B', start: '2026-10-13', end: '2026-10-16' }]);
}
// Fin exclusivo (RefoTask/OnSite): el fin devuelto es el día siguiente al último hábil.
{
  const r = propagateTaskDates('A', [t('A', '2026-10-05', '2026-10-10'), t('B', '2026-09-30', '2026-10-03')], [dep('A', 'B')], { calendar: cal });
  assert.deepEqual(r.changes, [{ taskId: 'B', start: '2026-10-12', end: '2026-10-16' }]);
}
// FF: B (2 hábiles) acaba el mismo día que A (vie 9) → empieza el jue 8.
{
  const r = propagateTaskDates('A', [t('A', '2026-10-05', '2026-10-09'), t('B', '2026-10-19', '2026-10-20')], [dep('A', 'B', 'FF')], { inclusiveEndDate: true, calendar: cal });
  assert.deepEqual(r.changes, [{ taskId: 'B', start: '2026-10-08', end: '2026-10-09' }]);
}
// Sin calendario: idéntico a antes (días naturales).
{
  const r = propagateTaskDates('A', [t('A', '2026-10-05', '2026-10-09'), t('B', '2026-10-01', '2026-10-03')], [dep('A', 'B')], { inclusiveEndDate: true });
  assert.deepEqual(r.changes, [{ taskId: 'B', start: '2026-10-10', end: '2026-10-12' }]);
}

console.log('OK: días hábiles');
