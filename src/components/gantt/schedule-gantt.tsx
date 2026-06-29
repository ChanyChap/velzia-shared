'use client';

// Gantt SVG custom para la página /proyectos/[id]/tareas.
// A diferencia de ProjectGanttView (que usa tareas instanciadas en runtime
// desde un effort engine), esta vista trabaja con tareas reales de BD
// (tabla `tareas`) que tienen `start_date` y `end_date` persistidos.
// Drag-resize del borde derecho persiste end_date (cambia duración real).

import { useCallback, useEffect, useMemo, useRef, useState, type UIEventHandler } from 'react';
import { addDays, differenceInCalendarDays, parseISO, format } from 'date-fns';
import { es } from 'date-fns/locale';
import { TaskList } from './task-list';
import { TimelineBody } from './timeline-body';
import { GanttToolbar } from './gantt-toolbar';
import { DepEditModal } from './dep-edit-modal';
import { BaselineMenu } from './baseline-menu';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel,
} from '../ui/alert-dialog';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '../ui/dialog';
import { AlertTriangle, CheckCircle2, Clock, ArrowDownToLine, ChevronsUp, ChevronsDown } from 'lucide-react';
import { Button } from '../ui/button';
import { MoveBelowDialog } from './move-below-dialog';
import { useGanttLayout } from './use-gantt-layout';
import { useCollapseState } from './use-collapse-state';
import { useGanttDrag } from './use-gantt-drag';
import { useDepDrag } from './use-dep-drag';
import { useRowDrag } from './use-row-drag';
import { useZoomPersistence } from './use-zoom-persistence';
import { computeCpm, type CpmActivity, type CpmDependency } from './cpm-engine';
import { propagateTaskDates } from './propagate-task-dates';
import { LEFT_PANEL_WIDTH, ANCHOR_DATE } from './constants';
import { useResizableColumn } from './use-resizable-column';
import { formatDurationShort } from './format-duration';
import { useToast } from '../../hooks/use-toast';
import { normalizeText } from '../../lib/utils';
import type { TaskRow, GanttDependency, DependencyType } from './types';
import type {
  GanttTask as Tarea,
  GanttGroup as Estancia,
  GanttDep as TaskDependency,
  GanttDataPort,
  BaselineSummary,
  BaselineBar,
} from './types';

// Traduce un error (Supabase o del puerto) a un mensaje legible con el TIPO
// concreto, para los toasts de fallo de persistencia del Gantt. Los puertos de
// cada app pueden lanzar errores con `.code` Postgres o con `.message`.
function describeSupabaseError(err: unknown): string {
  if (!err) return 'Error desconocido al guardar';
  const e = err as { code?: string; message?: string };
  switch (e.code) {
    case 'PGRST301':
    case '42501':
      return 'Permiso denegado';
    case '23505':
      return 'Ya existe (conflicto de duplicado)';
    case '23503':
      return 'Referencia no válida (clave foránea)';
    default:
      return e.message || 'Error al guardar en el servidor';
  }
}

export interface ScheduleGanttProps {
  projectId: string;
  tenantId?: string | null;
  tareas: Tarea[];
  estancias: Estancia[];
  dependencies: TaskDependency[];
  canEdit: boolean;
  // Toda la persistencia (reorden, fechas, dependencias, líneas base,
  // asignaciones) se inyecta por aquí. Cada app implementa su propio puerto.
  port: GanttDataPort;
  // Id del usuario actual, para el filtro "Solo asignadas a mí". Opcional.
  currentUserId?: string | null;
  onResizeTask: (taskId: string, newStartISO: string, newEndISO: string) => Promise<void>;
  onSelectTask: (taskId: string) => void;
  onOpenTask: (taskId: string) => void;
  // Callback opcional para que la página recargue tareas+deps tras un
  // create/edit/delete de dependencia desde el propio Gantt.
  onDepsChanged?: () => void;
  // Abre la configuración de calendario laboral/festivos (específico de cada
  // app). Si no se provee, el botón de calendario de la toolbar no se muestra.
  onOpenCalendar?: () => void;
  // Jornada laboral para posicionar tareas SUB-DÍA (con hora) en el grid. Cuando
  // una tarea trae `start_date` con hora (ISO con "T"), su X se calcula con la
  // fracción de jornada transcurrida: inicio = workdayStartHour, longitud =
  // workdayHours. Las tareas SIN hora (todas las de RefoTask) ignoran esto y se
  // posicionan por día como siempre (retrocompatible). Defaults: 8:00 y 8h.
  workdayStartHour?: number;
  workdayHours?: number;
}

// Encuentra el día más temprano entre todas las tareas. Si no hay fechas,
// usa hoy. Lo usamos como punto de referencia para construir las posiciones
// en el Gantt en lugar del ANCHOR_DATE fijo del modo plantilla.
function findReferenceDate(tareas: Tarea[]): Date {
  let earliest: Date | null = null;
  for (const t of tareas) {
    if (!t.start_date) continue;
    const d = parseISO(t.start_date);
    if (!earliest || d < earliest) earliest = d;
  }
  return earliest || new Date();
}

function dayOffset(date: Date, reference: Date): number {
  return differenceInCalendarDays(date, reference);
}

function toRowId(kind: 'wp' | 'activity', id: string) {
  return `${kind}:${id}`;
}

// Estado base de ejecución (sin contar retrasos) a partir del status de la tarea.
function statusToBaseState(status: string | undefined): 'no_empezada' | 'empezada' | 'terminada' {
  if (status === 'completada' || status === 'completed') return 'terminada';
  if (status === 'en_progreso' || status === 'bloqueada') return 'empezada';
  return 'no_empezada';
}

// Helper de color por estado (reservado para customización futura del bar render).
// Hoy el render reutiliza GanttBar, que pinta crítico=rojo / normal=azul / pre=púrpura.
// Si en el futuro queremos color por status, pasamos un mapa Map<rowId, color>.
function _statusColor(status: string): { fill: string; stroke: string } {
  switch (status) {
    case 'completada':
      return { fill: '#16a34a', stroke: '#15803d' };
    case 'en_progreso':
      return { fill: '#eab308', stroke: '#a16207' };
    case 'bloqueada':
      return { fill: '#dc2626', stroke: '#991b1b' };
    default:
      return { fill: '#3b82f6', stroke: '#1d4ed8' };
  }
}

export function ScheduleGantt({
  projectId,
  tareas,
  estancias,
  dependencies,
  canEdit,
  port,
  currentUserId,
  onResizeTask,
  onSelectTask,
  onOpenTask,
  onDepsChanged,
  onOpenCalendar,
  workdayStartHour = 8,
  workdayHours = 8,
}: ScheduleGanttProps) {
  const { toast } = useToast();
  // Zoom horizontal + vertical persistidos por scope 'project:<projectId>'
  // → cada proyecto recuerda su propio nivel de zoom (Chany 2026-05-29).
  const { viewMode, setViewMode, pxPerDay, setPxPerDay, rowHeight, setRowHeight } =
    useZoomPersistence('project', projectId);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const [lastSelectedRowId, setLastSelectedRowId] = useState<string | null>(null);
  const [hoverRowId, setHoverRowId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [scrollTop, setScrollTop] = useState(0);
  const bodyWrapperRef = useRef<HTMLDivElement | null>(null);
  // Host del listener de rueda no-passive (ver useEffect abajo). React 18 hace
  // el evento wheel passive y e.preventDefault() sería un no-op. Chany 31 may.
  const wheelHostRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const host = wheelHostRef.current;
    if (!host) return;
    const onWheelNative = (e: WheelEvent) => {
      const body = bodyWrapperRef.current;
      if (!body) return;
      if (body.contains(e.target as Node)) return;
      body.scrollTop += e.deltaY;
      e.preventDefault();
    };
    host.addEventListener('wheel', onWheelNative, { passive: false });
    return () => host.removeEventListener('wheel', onWheelNative);
  }, []);

  // Filtros del Gantt de proyecto persistidos por projectId en localStorage.
  const filtersKey = `gantt-tareas-filters:${projectId}`;
  const initialFilters = useMemo(() => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = window.localStorage.getItem(filtersKey);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }, [filtersKey]);
  const [excludedStatuses, setExcludedStatuses] = useState<Set<string>>(
    new Set(initialFilters?.excludedStatuses || []),
  );
  const [hideMilestones, setHideMilestones] = useState<boolean>(initialFilters?.hideMilestones ?? false);
  const [onlyAssignedToMe, setOnlyAssignedToMe] = useState<boolean>(initialFilters?.onlyAssignedToMe ?? false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(filtersKey, JSON.stringify({
        excludedStatuses: Array.from(excludedStatuses),
        hideMilestones,
        onlyAssignedToMe,
      }));
    } catch { /* ignore */ }
  }, [filtersKey, excludedStatuses, hideMilestones, onlyAssignedToMe]);
  const toggleStatus = useCallback((s: string) => {
    setExcludedStatuses(prev => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }, []);

  const { collapsed, toggle, expandAll, collapseAll } = useCollapseState(`tareas:${projectId}`);

  // Recursos asignados por tarea (tabla tarea_assignments) — para el SUBTÍTULO
  // de la barra. Un único fetch batch por proyecto; el map tareaId → nombres se
  // usa al post-procesar displayedRows. No bloquea el render: si falla o tarda,
  // las barras salen sin subtítulo.
  const [assigneesByTask, setAssigneesByTask] = useState<Record<string, string[]>>({});
  useEffect(() => {
    if (!port.loadAssignees) return;
    let cancelled = false;
    (async () => {
      try {
        const map = await port.loadAssignees!();
        if (!cancelled && map) setAssigneesByTask(map);
      } catch { /* sin subtítulo si falla */ }
    })();
    return () => { cancelled = true; };
  }, [port]);

  const referenceDate = useMemo(() => findReferenceDate(tareas), [tareas]);
  // Hoy a medianoche local — para comparar con las fechas reales de las tareas y
  // detectar retrasos (debía haber empezado/terminado y no lo ha hecho).
  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);

  // ¿Cronograma jerárquico (modo árbol)? Si alguna tarea trae parent_id, el CPM
  // (camino crítico, duración total) corre SOLO sobre las actividades; los
  // paquetes (resumen) y las tareas por elemento (hojas) no tienen dependencias
  // y se excluirían como nodos aislados que falsearían la duración.
  const hasHierarchy = useMemo(() => tareas.some(t => !!t.parent_id), [tareas]);

  // Convertir las tareas en formato que el CPM puede entender. Cada tarea es
  // un nodo con duración = (end - start) en días naturales.
  const cpm = useMemo(() => {
    const cpmSource = hasHierarchy ? tareas.filter(t => t.nivel === 'actividad') : tareas;
    const acts: CpmActivity[] = cpmSource.map(t => {
      const start = t.start_date ? parseISO(t.start_date) : referenceDate;
      // Mismo fallback que en construcción de filas: end_date si existe, si no
      // calculado desde duration_days. Evita CPM con todos los nodos a duración 0
      // cuando las tareas vienen del import-edt sin end_date.
      // duration_days llega como string (NUMERIC) → Number().
      const durN = Number(t.duration_days);
      const rangeN = t.end_date ? (parseISO(t.end_date).getTime() - start.getTime()) / 86400000 : 0;
      const days = Math.max(0.5, rangeN > 0 ? rangeN : (Number.isFinite(durN) && durN > 0 ? durN : 0.5));
      // HITO solo por flag explícito; una tarea sub-día no es hito.
      return { id: t.id, days, isMilestone: !!t.is_milestone };
    });
    const deps: CpmDependency[] = dependencies.map(d => ({
      fromActivityId: d.predecessor_id,
      toActivityId: d.successor_id,
      type: (d.dependency_type as DependencyType) || 'FS',
      lagDays: d.lag_days ?? 0,
    }));
    return computeCpm(acts, deps);
  }, [tareas, dependencies, referenceDate, hasHierarchy]);

  // Construye las filas que ven TaskList y TimelineBody.
  // ===== Líneas base del PROYECTO (tabla project_baselines, mig 827) =====
  // Foto del plan real (fechas/duraciones de las tareas) para comparar.
  const [baselines, setBaselines] = useState<BaselineSummary[]>([]);
  const [shownBaselineId, setShownBaselineId] = useState<string | null>(null);
  const [baselineBars, setBaselineBars] = useState<Map<string, BaselineBar>>(new Map());
  const [shownBaselineName, setShownBaselineName] = useState<string | undefined>(undefined);

  const loadBaselines = useCallback(async () => {
    if (!port.baselines) return;
    try {
      const list = await port.baselines.list();
      setBaselines(Array.isArray(list) ? list : []);
    } catch { /* ignore */ }
  }, [port]);

  useEffect(() => { loadBaselines(); }, [loadBaselines]);

  // Crear: el servidor congela las tareas reales actuales (no manda snapshot).
  const createBaseline = useCallback(
    async (input: { name: string; notes?: string }) => {
      if (!port.baselines) return;
      await port.baselines.create({ name: input.name, notes: input.notes });
      await loadBaselines();
    },
    [port, loadBaselines],
  );

  const removeBaseline = useCallback(
    async (baselineId: string) => {
      if (!port.baselines) return;
      await port.baselines.remove(baselineId);
      if (shownBaselineId === baselineId) { setShownBaselineId(null); setBaselineBars(new Map()); }
      await loadBaselines();
    },
    [port, loadBaselines, shownBaselineId],
  );

  // Mostrar/ocultar una línea base: descarga su snapshot y construye las barras
  // (mismas coordenadas por fecha real que las filas del Gantt de proyecto).
  const setShownBaseline = useCallback(
    async (baselineId: string | null) => {
      setShownBaselineId(baselineId);
      if (!baselineId || !port.baselines) { setBaselineBars(new Map()); setShownBaselineName(undefined); return; }
      try {
        const snap = await port.baselines.getSnapshot(baselineId);
        setShownBaselineName(snap?.name);
        const tasks = snap?.tasks || [];
        const map = new Map<string, BaselineBar>();
        for (const t of tasks) {
          if (!t.start_date) continue;
          const start = parseISO(t.start_date);
          const end = t.end_date ? parseISO(t.end_date) : addDays(start, Math.max(0.5, t.duration_days || 1));
          const days = Math.max(0, differenceInCalendarDays(end, start));
          // HITO solo por flag explícito (baseline): una tarea sub-día no es hito.
          map.set(t.tarea_id, { activityId: t.tarea_id, startDate: start, days, isMilestone: !!t.is_milestone });
        }
        setBaselineBars(map);
      } catch { setBaselineBars(new Map()); }
    },
    [port],
  );

  // Reorden OPTIMISTA: el nuevo sort_order se aplica en local al instante, sin
  // esperar al UPDATE + refetch. Purga SELECTIVA: solo quitamos las entradas que
  // el refetch ya reflejó (la tarea real ya tiene el sort_order del override),
  // conservando las que aún no han llegado para que la UI no parpadee. Mismo
  // patrón que reorderOverride del Gantt EDT (Chany 30 may).
  const [taskSortOverride, setTaskSortOverride] = useState<Map<string, number>>(new Map());
  useEffect(() => {
    setTaskSortOverride(prev => {
      if (prev.size === 0) return prev;
      const byId = new Map(tareas.map(t => [t.id, t]));
      let changed = false;
      const next = new Map(prev);
      prev.forEach((so, taskId) => {
        const real = byId.get(taskId);
        if (!real) return; // aún no llega en el refetch → conservar
        if ((real.sort_order ?? 0) === so) { next.delete(taskId); changed = true; }
      });
      return changed ? next : prev;
    });
  }, [tareas]);
  // Override OPTIMISTA de fechas (start/end) por tarea. Lo usa el resize de la
  // cápsula para reflejar el nuevo ancho AL INSTANTE sin esperar el refetch del
  // padre (~2-3s). Purga selectiva cuando la tarea real ya trae esas fechas.
  const [optimisticDates, setOptimisticDates] = useState<Map<string, { start: string; end: string }>>(new Map());
  useEffect(() => {
    setOptimisticDates(prev => {
      if (prev.size === 0) return prev;
      const byId = new Map(tareas.map(t => [t.id, t]));
      let changed = false;
      const next = new Map(prev);
      prev.forEach((od, taskId) => {
        const real = byId.get(taskId);
        if (!real) return;
        if (real.start_date === od.start && real.end_date === od.end) { next.delete(taskId); changed = true; }
      });
      return changed ? next : prev;
    });
  }, [tareas]);

  const orderedTareas = useMemo(() => {
    if (taskSortOverride.size === 0 && optimisticDates.size === 0) return tareas;
    return tareas.map(t => {
      const so = taskSortOverride.get(t.id);
      const od = optimisticDates.get(t.id);
      if (so == null && !od) return t;
      return {
        ...t,
        ...(so != null ? { sort_order: so } : {}),
        ...(od ? { start_date: od.start, end_date: od.end } : {}),
      };
    });
  }, [tareas, taskSortOverride, optimisticDates]);

  const { rows, deps: gdeps, minStart, maxEnd } = useMemo(() => {
    const estMap = new Map(estancias.map(e => [e.id, e.name]));
    // Lista PLANA global (sin árbol por estancia). El orden es el `sort_order`
    // global de las tareas, que el generador (import-edt / generate-edt) asigna
    // recorriendo las actividades en el orden de la PLANTILLA EDT y, dentro de
    // cada actividad por-estancia, una estancia tras otra. Resultado: las copias
    // por estancia de una misma actividad quedan consecutivas (una debajo de
    // otra) y luego viene la siguiente actividad. Al nombre de la actividad se le
    // concatena el de la estancia (si no lo trae ya). (Chany 02 jun)
    const flat = [...orderedTareas].sort(
      (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id.localeCompare(b.id),
    );

    const allRows: TaskRow[] = [];
    const rowByTaskId = new Map<string, string>();

    // ── Jerarquía EDT opcional (modo árbol) ──────────────────────────────
    // Si alguna tarea trae parent_id, construimos un árbol (paquete → actividad
    // → tarea); si ninguna lo trae (RefoTask), todo queda plano (depth 0). El
    // orden vertical ya es DFS porque el generador asigna sort_order recorriendo
    // el árbol. Precomputamos hijos (para hasChildren / bloquear arrastre de los
    // resúmenes).
    const childCount = new Map<string, number>();
    let hasHierarchy = false;
    for (const t of flat) {
      if (t.parent_id) {
        hasHierarchy = true;
        childCount.set(t.parent_id, (childCount.get(t.parent_id) ?? 0) + 1);
      }
    }
    const nivelToKind = (n: unknown): TaskRow['kind'] =>
      n === 'paquete' ? 'wp' : n === 'tarea' ? 'task' : 'activity';
    const nivelToDepth = (n: unknown): number =>
      n === 'paquete' ? 0 : n === 'actividad' ? 1 : n === 'tarea' ? 2 : 0;

    for (const t of flat) {
      const rowId = toRowId('activity', t.id);
      rowByTaskId.set(t.id, rowId);
      const childrenOfThis = childCount.get(t.id) ?? 0;
      const start = t.start_date ? parseISO(t.start_date) : referenceDate;
      // Fallback en cascada: si no hay end_date, usar duration_days; si tampoco hay, asumir 1 día.
      // Importante: el endpoint /api/proyectos/[id]/import-edt guarda duration_days pero no end_date,
      // así que sin este fallback las barras importadas saldrían con anchura 0.
      // Duración real en días (FRACCIONARIA). OJO: duration_days llega de Supabase
      // como string (columna NUMERIC) → hay que convertirla con Number(); el
      // `typeof === 'number'` anterior fallaba y las tareas sub-día (0.125/0.25 d)
      // salían como "0"/"1d" en vez de "1h"/"2h".
      // Las tareas sub-día NO guardan end_date (es null) y sus fechas son DATE sin
      // hora, así que el rango start→end nunca refleja fracciones. Por eso:
      //  - Si hay end_date y el rango es >0 días → usamos el rango (multi-día,
      //    cubre findes/festivos cruzados).
      //  - Si no hay end_date (o el rango es 0) → usamos duration_days real, que
      //    SÍ tiene la fracción. formatDurationShort la muestra en h/m.
      const durDays = Number(t.duration_days);
      const durValid = Number.isFinite(durDays) && durDays > 0;
      const rangeDays = t.end_date
        ? (parseISO(t.end_date).getTime() - start.getTime()) / 86400000
        : 0;
      const daysReal = rangeDays > 0 ? rangeDays : (durValid ? durDays : 1);
      // `end` real (para la detección de retraso): el end_date si existe; si no,
      // aproximamos con la duración redondeada (las sub-día sin end_date no
      // disparan retraso de fin porque el check exige end_date).
      const end = t.end_date ? parseISO(t.end_date) : addDays(start, Math.max(1, Math.ceil(daysReal)));
      const sched = cpm.schedule.get(t.id);
      // Nombre = actividad · estancia. Si el nombre ya incluye la estancia
      // (import-edt genera "Actividad — Estancia"), no la duplicamos.
      const estName = t.estancia_id ? estMap.get(t.estancia_id) : null;
      const displayName = estName && !t.name.includes(estName)
        ? `${t.name} · ${estName}`
        : t.name;

      // ── Estado de ejecución + retraso (color verde/rojo de la barra) ──────
      // Estado base por status; el RETRASO manda sobre el color: si una tarea
      // debía haber terminado/empezado (fecha real < hoy) y no lo ha hecho → rojo.
      const base = statusToBaseState(t.status);
      let executionState: TaskRow['executionState'] = base;
      let delayReason: string | undefined;
      const fmtDate = (d: Date) => format(d, "d 'de' MMMM 'de' yyyy", { locale: es });
      const plannedStartDate = t.start_date ? start : undefined;
      const plannedEndDate = t.end_date ? end : (t.start_date ? end : undefined);
      if (base !== 'terminada' && t.end_date && end < today) {
        executionState = 'retraso_fin';
        delayReason = `Debía haber terminado el ${fmtDate(end)} y aún no está terminada.`;
      } else if (base === 'no_empezada' && t.start_date && start < today) {
        executionState = 'retraso_inicio';
        delayReason = `Debía haber empezado el ${fmtDate(start)} y aún no ha empezado.`;
      }
      // Progreso para la metáfora claro/oscuro: terminada=100 (todo oscuro),
      // no empezada=0 (todo claro), empezada=progreso real (o 50% si no hay).
      const realProgress = typeof t.progress === 'number' ? Math.max(0, Math.min(100, t.progress)) : 0;
      const stateProgress = base === 'terminada'
        ? 100
        : base === 'empezada'
          ? (realProgress > 0 && realProgress < 100 ? realProgress : 50)
          : 0;

      // Posición SUB-DÍA: si la tarea trae HORA (start_date ISO con "T"),
      // calculamos su offset fraccionario desde el ancla para que la barra
      // arranque a la hora real dentro de la jornada (workdayStartHour..+Hours).
      // Sin hora → undefined → posición por día (retrocompatible, RefoTask).
      let startOffsetDays: number | undefined;
      if (t.start_date && t.start_date.includes('T')) {
        const minutesOfDay = start.getHours() * 60 + start.getMinutes();
        const dayMin = Math.max(1, workdayHours) * 60;
        const frac = Math.min(1, Math.max(0, (minutesOfDay - workdayStartHour * 60) / dayMin));
        startOffsetDays = differenceInCalendarDays(start, ANCHOR_DATE) + frac;
      }

      allRows.push({
        id: rowId,
        kind: hasHierarchy ? nivelToKind(t.nivel) : 'activity',
        name: displayName,
        depth: hasHierarchy ? nivelToDepth(t.nivel) : 0,
        parentRowId: t.parent_id ? toRowId('activity', t.parent_id) : null,
        startDate: start,
        startOffsetDays,
        days: daysReal,
        // HITO solo por flag explícito de la tarea. Antes se infería con
        // daysReal===0, pero una tarea de 1h tiene start y end el MISMO día
        // natural -> differenceInCalendarDays=0 -> se pintaba como rombo de
        // hito siendo una actividad real. Bug corregido (Chany 30 may).
        isMilestone: !!t.is_milestone,
        isCritical: cpm.criticalActivityIds.has(t.id),
        isCollapsedRollup: false,
        isHidden: false,
        // wpId limita el arrastre de reorden al mismo grupo. En modo árbol = el
        // padre (solo se reordena entre hermanos); en plano = la estancia.
        wpId: hasHierarchy ? (t.parent_id || '__root__') : (t.estancia_id || '__none__'),
        activityId: t.id,
        // hasChildren = nodo resumen (paquete o actividad con tareas). Los
        // resúmenes no se arrastran/redimensionan: sus fechas derivan de los hijos.
        hasChildren: childrenOfThis > 0,
        // Drag-and-drop por día: cualquier tarea HOJA con start_date y duración >0
        // puede arrastrarse horizontalmente para cambiar de día. El move se
        // persiste en onMoveCommit (más abajo) manteniendo la duración.
        draggable: canEdit && !!t.start_date && daysReal > 0 && childrenOfThis === 0,
        resizable: canEdit && childrenOfThis === 0,
        // Progreso ajustado al estado (controla el split claro/oscuro de la barra).
        progress: stateProgress,
        // Estado de ejecución (color verde/rojo) + datos para el KPI/modal.
        executionState,
        plannedStartDate,
        plannedEndDate,
        delayReason,
        earlyStartDay: sched?.earlyStart,
        earlyFinishDay: sched?.earlyFinish,
        lateStartDay: sched?.lateStart,
        lateFinishDay: sched?.lateFinish,
        totalFloatDays: sched?.totalFloat,
      });
    }

    const gdepsBuilt: GanttDependency[] = [];
    for (const d of dependencies) {
      const fromRowId = rowByTaskId.get(d.predecessor_id);
      const toRowId = rowByTaskId.get(d.successor_id);
      if (!fromRowId || !toRowId) continue;
      gdepsBuilt.push({
        id: d.id,
        fromRowId,
        toRowId,
        type: (d.dependency_type as DependencyType) || 'FS',
        lagDays: d.lag_days ?? 0,
        isCritical:
          cpm.criticalActivityIds.has(d.predecessor_id) &&
          cpm.criticalActivityIds.has(d.successor_id),
        isVirtual: false,
      });
    }

    let minStart = referenceDate;
    let maxEnd = addDays(referenceDate, 14);
    for (const r of allRows) {
      if (r.startDate < minStart) minStart = r.startDate;
      const end = addDays(r.startDate, Math.max(1, r.days));
      if (end > maxEnd) maxEnd = end;
    }
    return { rows: allRows, deps: gdepsBuilt, minStart, maxEnd };
  }, [orderedTareas, estancias, dependencies, canEdit, referenceDate, cpm, today]);

  // Actividades retrasadas (para el KPI + modal). Conserva el orden del Gantt.
  const delayedRows = useMemo(
    () => rows.filter(r => r.executionState === 'retraso_inicio' || r.executionState === 'retraso_fin'),
    [rows],
  );
  const [showDelayedModal, setShowDelayedModal] = useState(false);

  // Menú contextual de la estructura EDT (clic derecho) + diálogo "Poner debajo de…".
  const [ctxMenu, setCtxMenu] = useState<{ taskId: string; x: number; y: number } | null>(null);
  const [moveBelowSources, setMoveBelowSources] = useState<string[]>([]);

  // Mueve la tarea `sourceId` JUSTO debajo de `targetId` reordenando sort_order.
  // Renumera de forma consecutiva y persiste SOLO las filas cuyo orden cambia
  // (un movimiento local toca pocas filas). Optimista vía taskSortOverride.
  // Persiste un nuevo orden COMPLETO de tareas (renumera sort_order = índice),
  // optimista + escribiendo solo las que cambian. Compartido por "Poner debajo
  // de…", "Mover al inicio" y "Mover al fondo".
  const applyTaskOrder = useCallback(
    async (reordered: string[]) => {
      const sortById = new Map(tareas.map(t => [t.id, t.sort_order ?? 0]));
      const currentSort = (id: string) => taskSortOverride.get(id) ?? sortById.get(id) ?? 0;
      const changed = reordered
        .map((id, i) => ({ id, so: i }))
        .filter(({ id, so }) => currentSort(id) !== so);
      if (changed.length === 0) return;

      const prevEntries = new Map<string, number | undefined>();
      changed.forEach(({ id }) => prevEntries.set(id, taskSortOverride.get(id)));
      setTaskSortOverride(prev => {
        const next = new Map(prev);
        changed.forEach(({ id, so }) => next.set(id, so));
        return next;
      });

      try {
        await port.updateTaskSortOrders(changed.map(({ id, so }) => ({ id, sortOrder: so })));
      } catch (err) {
        setTaskSortOverride(prev => {
          const next = new Map(prev);
          prevEntries.forEach((v, id) => { if (v == null) next.delete(id); else next.set(id, v); });
          return next;
        });
        toast({ title: 'No se pudo mover', description: describeSupabaseError(err), variant: 'destructive' });
        onDepsChanged?.();
        return;
      }
      toast({ title: 'Actividad movida' });
      onDepsChanged?.();
    },
    [tareas, taskSortOverride, toast, onDepsChanged, port],
  );

  const orderedActivityIds = useCallback(
    () => rows.filter(r => r.kind === 'activity' && r.activityId).map(r => r.activityId as string),
    [rows],
  );

  // Ids de tarea sobre los que actúa el menú: TODA la selección si la clicada
  // está dentro; si no, solo la clicada. (Chany 3 jun)
  const ctxTaskSourceIds = useCallback(
    (clickedTaskId: string): string[] => {
      const clickedRowId = toRowId('activity', clickedTaskId);
      if (selectedRowIds.has(clickedRowId) && selectedRowIds.size > 1) {
        return rows
          .filter(r => r.kind === 'activity' && r.activityId && selectedRowIds.has(r.id))
          .map(r => r.activityId as string);
      }
      return [clickedTaskId];
    },
    [rows, selectedRowIds],
  );

  const moveTasksBelow = useCallback(
    async (sourceIds: string[], targetId: string) => {
      const set = new Set(sourceIds);
      if (set.has(targetId) || set.size === 0) return;
      const ids = orderedActivityIds();
      if (ids.indexOf(targetId) < 0) return;
      const moving = ids.filter(id => set.has(id));
      const rest = ids.filter(id => !set.has(id));
      const ti = rest.indexOf(targetId);
      await applyTaskOrder([...rest.slice(0, ti + 1), ...moving, ...rest.slice(ti + 1)]);
    },
    [orderedActivityIds, applyTaskOrder],
  );

  const moveTasksToEdge = useCallback(
    async (sourceIds: string[], edge: 'top' | 'bottom') => {
      const set = new Set(sourceIds);
      if (set.size === 0) return;
      const ids = orderedActivityIds();
      const moving = ids.filter(id => set.has(id));
      const rest = ids.filter(id => !set.has(id));
      await applyTaskOrder(edge === 'top' ? [...moving, ...rest] : [...rest, ...moving]);
    },
    [orderedActivityIds, applyTaskOrder],
  );

  // Mapa rápido id-de-tarea → tarea para los filtros de estado.
  const taskById = useMemo(() => new Map(tareas.map(t => [t.id, t])), [tareas]);

  // Aplicamos filtros — solo a visualización. Además inyectamos el SUBTÍTULO de
  // recursos asignados en las filas de actividad (= tarea del proyecto, su
  // activityId es el id de la tarea).
  const displayedRows = useMemo(() => {
    // Colapso del árbol: una fila se oculta si algún ancestro está colapsado.
    const parentByRow = new Map<string, string | null>(rows.map(r => [r.id, r.parentRowId]));
    const hasCollapsedAncestor = (r: TaskRow): boolean => {
      let p = r.parentRowId;
      while (p) {
        if (collapsed.has(p)) return true;
        p = parentByRow.get(p) ?? null;
      }
      return false;
    };
    const filtered = rows.filter(r => {
      if (hasCollapsedAncestor(r)) return false;
      if (r.kind === 'wp') return true; // WPs siempre visibles para mantener jerarquía
      if (hideMilestones && r.isMilestone) return false;
      if (r.activityId) {
        const t = taskById.get(r.activityId);
        if (t) {
          if (excludedStatuses.has(t.status)) return false;
          // Filtro "asignadas a mí": usa el currentUserId que provee la app.
          // Si no se provee, el filtro no excluye nada.
          if (onlyAssignedToMe && currentUserId) {
            if (!(t.assigned_user_ids || []).includes(currentUserId)) return false;
          }
        }
      }
      return true;
    });
    return filtered.map(r => {
      const subtitle = r.kind === 'activity' && r.activityId
        ? (assigneesByTask[r.activityId]?.join(', ') || undefined)
        : undefined;
      if (subtitle === r.subtitle) return r;
      return { ...r, subtitle };
    });
  }, [rows, hideMilestones, excludedStatuses, onlyAssignedToMe, taskById, assigneesByTask, currentUserId, collapsed]);

  const activeFilterCount =
    excludedStatuses.size +
    (hideMilestones ? 1 : 0) +
    (onlyAssignedToMe ? 1 : 0);

  const layout = useGanttLayout({
    pxPerDay,
    totalRows: displayedRows.length,
    paddingDaysBefore: 7,
    paddingDaysAfter: 14,
    maxEndDate: maxEnd,
    minStartDate: minStart,
    rowHeight,
  });

  const matchedRowIds = useMemo<Set<string> | null>(() => {
    if (searchTerm.trim().length === 0) return null;
    const needle = normalizeText(searchTerm);
    const matched = new Set<string>();
    for (const r of rows) {
      if (r.kind === 'wp') continue;
      if (normalizeText(r.name).includes(needle)) matched.add(r.id);
    }
    Array.from(matched).forEach(id => {
      const row = rows.find(r => r.id === id);
      if (row?.parentRowId) matched.add(row.parentRowId);
    });
    return matched;
  }, [searchTerm, rows]);

  const handleRowClick = useCallback(
    (rowId: string, event?: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean }) => {
      // Seleccionar fila deselecciona la dependencia activa (excluyentes).
      setSelectedDepId(null);
      const ctrl = !!(event?.ctrlKey || event?.metaKey);
      const shift = !!event?.shiftKey;
      const row = rows.find(r => r.id === rowId);
      if (shift && lastSelectedRowId) {
        const ids = rows.map(r => r.id);
        const a = ids.indexOf(lastSelectedRowId);
        const b = ids.indexOf(rowId);
        if (a >= 0 && b >= 0) {
          const [from, to] = a < b ? [a, b] : [b, a];
          setSelectedRowIds(new Set(ids.slice(from, to + 1)));
          return;
        }
      }
      if (ctrl) {
        setSelectedRowIds(prev => {
          const next = new Set(prev);
          if (next.has(rowId)) next.delete(rowId);
          else next.add(rowId);
          return next;
        });
        setLastSelectedRowId(rowId);
        return;
      }
      setSelectedRowIds(new Set([rowId]));
      setLastSelectedRowId(rowId);
      if (row?.activityId) onSelectTask(row.activityId);
    },
    [rows, lastSelectedRowId, onSelectTask],
  );

  const handleOpen = useCallback(
    (rowId: string) => {
      const row = rows.find(r => r.id === rowId);
      if (row?.activityId) onOpenTask(row.activityId);
    },
    [rows, onOpenTask],
  );

  const onResizeCommit = useCallback(
    async (row: TaskRow, newDays: number) => {
      if (!row.activityId) return;
      const tarea = tareas.find(t => t.id === row.activityId);
      if (!tarea?.start_date) return;
      const start = parseISO(tarea.start_date);
      const end = addDays(start, Math.max(1, Math.round(newDays)));
      // Mantener formato YYYY-MM-DD para start/end.
      const startISO = tarea.start_date;
      const endISO = end.toISOString().slice(0, 10);
      // Si la tarea ERA un hito y la nueva duración es > 0, deja de ser hito y
      // pasa a ser una tarea normal (rombo → cápsula). Persistimos is_milestone
      // antes de las fechas; onResizeTask hace el refetch que actualiza la barra
      // (Chany 30 may).
      const convertMilestone = !!tarea.is_milestone && newDays > 0;
      // Optimista: pinta el nuevo ancho YA, antes del await (igual que
      // onMoveCommit). Sin esto la cápsula esperaba ~2-3s al refetch del padre
      // para reflejar la nueva duración. Chany 31 may.
      setOptimisticDates(prev => new Map(prev).set(row.activityId!, { start: startISO, end: endISO }));
      try {
        if (convertMilestone) {
          await port.setTaskMilestone(row.activityId, false);
        }
        await onResizeTask(row.activityId, startISO, endISO);
        if (convertMilestone) {
          toast({ title: 'Hito convertido en tarea', description: 'Tenía duración > 0, así que pasa de hito a tarea.' });
        }
      } catch (err) {
        // Rollback: quitar el override para volver al ancho anterior.
        setOptimisticDates(prev => { const n = new Map(prev); n.delete(row.activityId!); return n; });
        toast({ title: 'No se pudo guardar la duración', description: describeSupabaseError(err), variant: 'destructive' });
      }
    },
    [tareas, onResizeTask, toast, port],
  );

  // Estado del diálogo "mover a fecha que no cuadra con dep+lag" (#18). Guarda
  // el movimiento pendiente para que el usuario decida: ajustar el lag de la
  // predecesora o fijar la fecha (start_date_fixed).
  const [moveConflict, setMoveConflict] = useState<{
    taskId: string;
    daysDelta: number;
    startISO: string;
    endISO: string;
    predDepId: string | null;
  } | null>(null);

  // Devuelve true si el movimiento se persistió, false si falló (ya avisa con
  // toast). Los callers (move directo, resolveMoveByLag/Fix) usan el booleano
  // para abortar la propagación/escrituras posteriores si la primera falla — así
  // no dejamos la barra movida pero las sucesoras a medias.
  const applyMoveDates = useCallback(
    async (taskId: string, startISO: string, endISO: string): Promise<boolean> => {
      try {
        await onResizeTask(taskId, startISO, endISO);
        return true;
      } catch (err) {
        toast({ title: 'No se pudo mover la tarea', description: describeSupabaseError(err), variant: 'destructive' });
        return false;
      }
    },
    [onResizeTask, toast],
  );

  // Drag horizontal de la barra. Si la tarea TIENE predecesora, mover a un día
  // que no corresponde a la dependencia+lag abre un diálogo (Chany 29 may):
  // 1) ajustar el lag de la predecesora, o 2) fijar la fecha (start_date_fixed).
  // Sin predecesora se mueve directo.
  const onMoveCommit = useCallback(
    async (row: TaskRow, daysDelta: number) => {
      if (!row.activityId || daysDelta === 0) return;
      const tarea = tareas.find(t => t.id === row.activityId);
      if (!tarea?.start_date) return;
      const oldStart = parseISO(tarea.start_date);
      const oldEnd = tarea.end_date
        ? parseISO(tarea.end_date)
        : addDays(oldStart, Math.max(1, Number(tarea.duration_days) || 1));
      const newStart = addDays(oldStart, daysDelta);
      const newEnd = addDays(oldEnd, daysDelta);
      const startISO = newStart.toISOString().slice(0, 10);
      const endISO = newEnd.toISOString().slice(0, 10);

      const incoming = dependencies.find(d => d.successor_id === row.activityId);
      if (incoming) {
        setMoveConflict({ taskId: row.activityId, daysDelta, startISO, endISO, predDepId: incoming.id });
        return;
      }
      await applyMoveDates(row.activityId, startISO, endISO);
    },
    [tareas, dependencies, applyMoveDates],
  );

  const drag = useGanttDrag({
    pxPerDay: layout.pxPerDay,
    rows,
    canEdit,
    onResizeCommit,
    onMoveCommit,
  });

  // ===== Dependencias: click selecciona + abre modal compacta, drag desde
  // handles crea nueva dep. Mismo patrón que el Gantt EDT plantillas. Persiste
  // en task_dependencies (mig 232) vía cliente Supabase.
  const [editingDepId, setEditingDepId] = useState<string | null>(null);
  // Click destaca, doble click abre modal (Chany 2026-05-29).
  const [selectedDepId, setSelectedDepId] = useState<string | null>(null);
  // Overlay de dependencias optimistas — pintado instantáneo al crear (Chany 29 may).
  const [optimisticDeps, setOptimisticDeps] = useState<GanttDependency[]>([]);
  // Borradas optimistamente — desaparecen al instante.
  const [removedDepIds, setRemovedDepIds] = useState<Set<string>>(new Set());

  // Mezcla deps reales + optimistas, descartando la optimista en cuanto existe
  // la real equivalente y ocultando las borradas optimistamente.
  const renderedDeps = useMemo<GanttDependency[]>(() => {
    const base = removedDepIds.size === 0 ? gdeps : gdeps.filter(d => !removedDepIds.has(d.id));
    if (optimisticDeps.length === 0) return base;
    const realKeys = new Set(base.map(d => `${d.fromRowId}|${d.toRowId}|${d.type}`));
    const pending = optimisticDeps.filter(d => !realKeys.has(`${d.fromRowId}|${d.toRowId}|${d.type}`));
    return pending.length === 0 ? base : [...base, ...pending];
  }, [gdeps, optimisticDeps, removedDepIds]);

  useEffect(() => {
    if (optimisticDeps.length > 0) {
      const realKeys = new Set(gdeps.map(d => `${d.fromRowId}|${d.toRowId}|${d.type}`));
      const stillPending = optimisticDeps.filter(d => !realKeys.has(`${d.fromRowId}|${d.toRowId}|${d.type}`));
      if (stillPending.length !== optimisticDeps.length) setOptimisticDeps(stillPending);
    }
    if (removedDepIds.size > 0) {
      const present = new Set(gdeps.map(d => d.id));
      let changed = false;
      const next = new Set<string>();
      removedDepIds.forEach(id => { if (present.has(id)) next.add(id); else changed = true; });
      if (changed) setRemovedDepIds(next);
    }
  }, [gdeps, optimisticDeps, removedDepIds]);

  // Estado transitorio para marcar tareas que se acaban de mover por
  // propagación. Se usa en gantt-bar.tsx para aplicar transition CSS solo a
  // estas filas. Limpieza automática tras 350ms (animación = 280ms).
  const [tasksRecentlyAnimated, setTasksRecentlyAnimated] = useState<Set<string>>(new Set());
  const animTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flagAnimatedTasks = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    setTasksRecentlyAnimated(new Set(ids));
    if (animTimerRef.current) clearTimeout(animTimerRef.current);
    animTimerRef.current = setTimeout(() => setTasksRecentlyAnimated(new Set()), 350);
  }, []);

  // Aplica propagación BFS+toposort tras un cambio de dep. Usa la utility
  // propagateTaskDates con el array de deps simulado (incluyendo el cambio
  // recién hecho, antes de que vuelva el refetch). Si detecta ciclo, toast y
  // no persiste nada. Si hay changes, batch UPDATE de tareas + flag animado.
  const applyDatePropagation = useCallback(
    async (seedTaskId: string, depsAfter: TaskDependency[]): Promise<void> => {
      const result = propagateTaskDates(seedTaskId, tareas, depsAfter);
      if (result.cycleDetected) {
        toast({
          title: 'Dependencia rechazada: crearía un ciclo',
          description: 'Revisa las predecesoras de las tareas afectadas.',
          variant: 'destructive',
        });
        return;
      }
      if (result.changes.length === 0) return;

      // Batch UPDATE de fechas vía puerto. Si falla, el refetch del padre
      // (onDepsChanged) restaurará las fechas reales de las no guardadas.
      try {
        await port.updateTaskDates(
          result.changes.map(ch => ({ taskId: ch.taskId, start: ch.start, end: ch.end })),
        );
      } catch (error) {
        toast({ title: 'No se pudieron recalcular todas las fechas', description: describeSupabaseError(error), variant: 'destructive' });
      }
      flagAnimatedTasks(result.changes.map(c => c.taskId));
    },
    [tareas, toast, flagAnimatedTasks, port],
  );

  // Diálogo #18 — Opción 1: ajustar el lag de la dependencia entrante
  // (+daysDelta) y propagar a las sucesoras.
  const resolveMoveByLag = useCallback(async () => {
    if (!moveConflict?.predDepId) { setMoveConflict(null); return; }
    const dep = dependencies.find(d => d.id === moveConflict.predDepId);
    if (!dep) { setMoveConflict(null); return; }
    const newLag = (dep.lag_days ?? 0) + moveConflict.daysDelta;
    try {
      await port.updateDependency(dep.id, { type: (dep.dependency_type as DependencyType) || 'FS', lagDays: newLag });
    } catch (error) {
      toast({ title: 'No se pudo ajustar el lag', description: describeSupabaseError(error), variant: 'destructive' }); setMoveConflict(null); return;
    }
    // Si el movimiento de fechas falla, NO propagamos (evita dejar las sucesoras
    // recalculadas sobre una fecha que no se guardó). applyMoveDates ya avisa.
    const moved = await applyMoveDates(moveConflict.taskId, moveConflict.startISO, moveConflict.endISO);
    if (!moved) { setMoveConflict(null); onDepsChanged?.(); return; }
    await applyDatePropagation(moveConflict.taskId, dependencies.map(d => d.id === dep.id ? { ...d, lag_days: newLag } : d));
    toast({ title: 'Lag de la predecesora actualizado' });
    setMoveConflict(null);
    onDepsChanged?.();
  }, [moveConflict, dependencies, applyMoveDates, applyDatePropagation, toast, onDepsChanged, port]);

  // Diálogo #18 — Opción 2: fijar la fecha (start_date_fixed = true) y mover.
  const resolveMoveByFix = useCallback(async () => {
    if (!moveConflict) return;
    // Si el movimiento de fechas falla (applyMoveDates ya avisa), no marcamos la
    // fecha como fija — no tendría sentido fijar una fecha que no se guardó.
    const moved = await applyMoveDates(moveConflict.taskId, moveConflict.startISO, moveConflict.endISO);
    if (!moved) { setMoveConflict(null); onDepsChanged?.(); return; }
    let fixErr: unknown = null;
    try { await port.setTaskStartDateFixed(moveConflict.taskId, true); } catch (e) { fixErr = e; }
    toast(fixErr
      ? { title: 'Fecha movida, pero no se pudo marcar como fija', description: describeSupabaseError(fixErr), variant: 'destructive' }
      : { title: 'Fecha de inicio fijada' });
    setMoveConflict(null);
    onDepsChanged?.();
  }, [moveConflict, applyMoveDates, toast, onDepsChanged, port]);

  const createTaskDep = useCallback(
    async (fromActivityId: string, toActivityId: string, type: DependencyType) => {
      // Si ya existe el par predecesora→sucesora, no reinsertar (UNIQUE).
      // El control de tenant lo hace el puerto de cada app.
      if (dependencies.some(d => d.predecessor_id === fromActivityId && d.successor_id === toActivityId)) {
        toast({ title: 'Esa dependencia ya existe', variant: 'default' });
        return;
      }
      // Pintado instantáneo: añadimos la flecha al overlay optimista antes de
      // tocar el servidor (insert + propagación tardan ~segundos).
      const fromRowId = rows.find(r => r.activityId === fromActivityId)?.id;
      const toRowId = rows.find(r => r.activityId === toActivityId)?.id;
      const optimisticId = `optimistic-${fromActivityId}-${toActivityId}-${type}`;
      if (fromRowId && toRowId) {
        setOptimisticDeps(prev => [
          ...prev.filter(d => d.id !== optimisticId),
          { id: optimisticId, fromRowId, toRowId, type, lagDays: 0, isCritical: false, isVirtual: false },
        ]);
      }
      let inserted: TaskDependency;
      try {
        inserted = await port.createDependency({ predecessorId: fromActivityId, successorId: toActivityId, type });
      } catch (error) {
        setOptimisticDeps(prev => prev.filter(d => d.id !== optimisticId));
        toast({ title: 'No se pudo crear la dependencia', description: describeSupabaseError(error), variant: 'destructive' });
        return;
      }

      // Propagar fechas a TODA la subred descendiente desde la sucesora.
      const depsAfter = [...dependencies, inserted];
      await applyDatePropagation(toActivityId, depsAfter);

      toast({ title: 'Dependencia creada' });
      onDepsChanged?.();
    },
    [dependencies, applyDatePropagation, toast, onDepsChanged, rows, port],
  );

  const depDrag = useDepDrag({
    rows,
    canEdit,
    containerRef: bodyWrapperRef,
    onCreateDep: createTaskDep,
  });

  // Reorder de tareas con drag — persiste tareas.sort_order. Solo permite
  // reorden dentro de la misma estancia (Chany 2026-05-29). Cross-estancia
  // se podría implementar después actualizando también estancia_id.
  const handleRowReorder = useCallback(
    async (fromRowId: string, hoverIndex: number) => {
      const fromRow = rows.find(r => r.id === fromRowId);
      if (!fromRow || !fromRow.activityId || fromRow.kind !== 'activity') return;
      const target = rows[hoverIndex];
      if (!target || target.kind !== 'activity' || target.wpId !== fromRow.wpId) {
        toast({ title: 'Solo se puede reordenar dentro de la misma estancia' });
        return;
      }
      const siblings = rows
        .filter(r => r.kind === 'activity' && r.wpId === fromRow.wpId && r.activityId)
        .map(r => r.activityId as string);
      const oldIdx = siblings.indexOf(fromRow.activityId);
      let newIdx = siblings.indexOf(target.activityId as string);
      if (oldIdx < 0 || newIdx < 0 || oldIdx === newIdx) return;
      const reordered = [...siblings];
      reordered.splice(oldIdx, 1);
      if (newIdx > oldIdx) newIdx -= 1;
      reordered.splice(newIdx, 0, fromRow.activityId);
      // Guardamos los overrides previos de las filas afectadas para revertir
      // exactamente si alguna escritura falla.
      const prevEntries = new Map<string, number | undefined>();
      reordered.forEach(id => prevEntries.set(id, taskSortOverride.get(id)));
      // Optimista: reordenamos en local AL INSTANTE.
      setTaskSortOverride(prev => {
        const next = new Map(prev);
        reordered.forEach((id, i) => next.set(id, (i + 1) * 10));
        return next;
      });
      try {
        await port.updateTaskSortOrders(reordered.map((id, i) => ({ id, sortOrder: (i + 1) * 10 })));
      } catch (reorderErr) {
        // Rollback del orden optimista de todas las filas afectadas.
        setTaskSortOverride(prev => {
          const next = new Map(prev);
          prevEntries.forEach((val, id) => {
            if (val == null) next.delete(id);
            else next.set(id, val);
          });
          return next;
        });
        toast({ title: 'No se pudo reordenar', description: describeSupabaseError(reorderErr), variant: 'destructive' });
        onDepsChanged?.();
        return;
      }
      toast({ title: 'Orden actualizado' });
      onDepsChanged?.();
    },
    [rows, toast, onDepsChanged, taskSortOverride, port],
  );

  const rowDrag = useRowDrag({
    rows,
    canEdit,
    containerRef: bodyWrapperRef,
    onReorder: handleRowReorder,
    rowHeight,
  });

  const editingDep = useMemo(
    () => editingDepId ? gdeps.find(d => d.id === editingDepId) || null : null,
    [editingDepId, gdeps],
  );

  const findRowName = useCallback((rowId: string) => rows.find(r => r.id === rowId)?.name || rowId, [rows]);

  const handleSaveDep = useCallback(
    async (updates: { type: DependencyType; lagDays: number }) => {
      if (!editingDep) return;
      try {
        await port.updateDependency(editingDep.id, { type: updates.type, lagDays: updates.lagDays });
      } catch (error) {
        toast({ title: 'No se pudo guardar la dependencia', description: describeSupabaseError(error), variant: 'destructive' });
        return;
      }

      // Propagar fechas tras editar la dep: simulamos el array actualizado y
      // recalculamos desde la sucesora hacia abajo.
      const succTaskId = rows.find(r => r.id === editingDep.toRowId)?.activityId;
      if (succTaskId) {
        const depsAfter: TaskDependency[] = dependencies.map(d =>
          d.id === editingDep.id
            ? { ...d, dependency_type: updates.type, lag_days: updates.lagDays }
            : d,
        );
        await applyDatePropagation(succTaskId, depsAfter);
      }

      toast({ title: 'Dependencia actualizada' });
      onDepsChanged?.();
    },
    [editingDep, dependencies, rows, applyDatePropagation, toast, onDepsChanged, port],
  );

  const handleDeleteDep = useCallback(async () => {
    if (!editingDep) return;
    const succTaskId = rows.find(r => r.id === editingDep.toRowId)?.activityId;
    try {
      await port.deleteDependency(editingDep.id);
    } catch (error) {
      toast({ title: 'No se pudo borrar la dependencia', description: describeSupabaseError(error), variant: 'destructive' });
      return;
    }

    // Recalcular: si a la sucesora le quedan otras predecesoras, propagar con
    // las restantes. Si ya no tiene preds, propagateTaskDates mantiene su
    // fecha original (no la mueve hacia atrás).
    if (succTaskId) {
      const depsAfter = dependencies.filter(d => d.id !== editingDep.id);
      await applyDatePropagation(succTaskId, depsAfter);
    }

    toast({ title: 'Dependencia eliminada' });
    setEditingDepId(null);
    onDepsChanged?.();
  }, [editingDep, dependencies, rows, applyDatePropagation, toast, onDepsChanged, port]);

  // Borrado de dependencia por id (lo usa SUPR sobre la línea seleccionada).
  const handleDeleteDepById = useCallback(
    async (depId: string) => {
      const dep = dependencies.find(d => d.id === depId);
      if (!dep) return;
      const succRowId = gdeps.find(g => g.id === depId)?.toRowId;
      const succTaskId = succRowId ? rows.find(r => r.id === succRowId)?.activityId : undefined;
      // Optimista: la línea desaparece AL INSTANTE; persistimos en 2.º plano.
      setRemovedDepIds(prev => { const s = new Set(prev); s.add(depId); return s; });
      try {
        await port.deleteDependency(depId);
      } catch (error) {
        setRemovedDepIds(prev => { const s = new Set(prev); s.delete(depId); return s; });
        toast({ title: 'No se pudo borrar la dependencia', description: describeSupabaseError(error), variant: 'destructive' });
        return;
      }
      if (succTaskId) {
        await applyDatePropagation(succTaskId, dependencies.filter(d => d.id !== depId));
      }
      toast({ title: 'Dependencia eliminada' });
      onDepsChanged?.();
    },
    [dependencies, gdeps, rows, applyDatePropagation, toast, onDepsChanged, port],
  );

  // SUPR/Backspace con una línea de dependencia seleccionada → borra la
  // dependencia (no la tarea). Ignora optimistas aún sin persistir.
  useEffect(() => {
    function onKeyDep(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return;
      }
      if (e.key === 'Escape' && selectedDepId) {
        setSelectedDepId(null);
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && canEdit && selectedDepId && !editingDepId) {
        if (selectedDepId.startsWith('optimistic-')) return;
        e.preventDefault();
        if (!window.confirm('¿Eliminar esta dependencia?')) return;
        handleDeleteDepById(selectedDepId);
        setSelectedDepId(null);
      }
    }
    window.addEventListener('keydown', onKeyDep);
    return () => window.removeEventListener('keydown', onKeyDep);
  }, [canEdit, selectedDepId, editingDepId, handleDeleteDepById]);

  const allWpRowIds = useMemo(() => rows.filter(r => r.kind === 'wp').map(r => r.id), [rows]);
  const handleCollapseAll = useCallback(() => collapseAll(allWpRowIds), [collapseAll, allWpRowIds]);

  const onWrapperScroll: UIEventHandler<HTMLDivElement> = e => {
    setScrollTop(e.currentTarget.scrollTop);
  };

  // Mismos handlers que el Gantt EDT: HOY centra el scroll, Ajustar calcula
  // pxPerDay óptimo para que el Gantt entero entre en el contenedor, Imprimir
  // dispara window.print().
  const handleGoToToday = useCallback(() => {
    const wrapper = bodyWrapperRef.current;
    if (!wrapper) return;
    const today = new Date();
    const x = layout.xOf(today);
    if (Number.isFinite(x)) {
      wrapper.scrollTo({ left: Math.max(0, x - wrapper.clientWidth / 2), behavior: 'smooth' });
    }
  }, [layout]);

  const handleFitToContent = useCallback(() => {
    const wrapper = bodyWrapperRef.current;
    if (!wrapper) return;
    const availablePx = wrapper.clientWidth;
    const days = Math.max(1, layout.totalDays);
    setPxPerDay(Math.max(2, availablePx / days));
  }, [layout.totalDays, setPxPerDay]);

  const handlePrint = useCallback(() => {
    if (typeof window !== 'undefined') window.print();
  }, []);

  // Pantalla completa por CSS (overlay fixed), NO la Fullscreen API: así los
  // modales/menús porteados a document.body se ven por encima (antes quedaban
  // ocultos bajo la pantalla). ESC sale. (Chany 3 jun)
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const toggleFullscreen = useCallback(() => setIsFullscreen(v => !v), []);
  useEffect(() => {
    if (!isFullscreen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsFullscreen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isFullscreen]);

  // Panel "Estructura EDT": ancho redimensionable + colapso.
  const { width: panelWidth, onPointerDown: onPanelResize } = useResizableColumn(
    'gantt-proyecto-panel-width', LEFT_PANEL_WIDTH, { min: 180, max: 700 },
  );
  const [panelCollapsed, setPanelCollapsed] = useState(false);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        {/* KPI: actividades retrasadas. */}
        {delayedRows.length === 0 ? (
          <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
            <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
            <span>Sin actividades retrasadas.</span>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowDelayedModal(true)}
            className="flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100"
            title="Ver el detalle de las actividades retrasadas"
          >
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            <span>
              {delayedRows.length} {delayedRows.length === 1 ? 'actividad retrasada' : 'actividades retrasadas'}
            </span>
            <span className="text-xs font-normal text-red-600 underline">Ver detalle</span>
          </button>
        )}
        {/* Leyenda de colores por estado. */}
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3 w-5 rounded-full border border-green-700" style={{ background: '#dcfce7' }} />
            No empezada
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3 w-5 rounded-full border border-green-700" style={{ background: 'linear-gradient(to right, #14532d 50%, #dcfce7 50%)' }} />
            Empezada
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3 w-5 rounded-full border border-green-700" style={{ background: '#14532d' }} />
            Terminada
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3 w-5 rounded-full border border-red-800" style={{ background: '#ef4444' }} />
            Retrasada
          </span>
        </div>
      </div>

      <div
        ref={rootRef}
        className={
          'flex flex-col bg-white border rounded-md overflow-hidden' +
          (isFullscreen ? ' fixed inset-0 z-40 rounded-none' : '')
        }
        style={{ height: isFullscreen ? '100vh' : '70vh' }}
      >
      <GanttToolbar
        viewMode={viewMode}
        setViewMode={setViewMode}
        pxPerDay={layout.pxPerDay}
        setPxPerDay={setPxPerDay}
        rowHeight={rowHeight}
        setRowHeight={setRowHeight}
        onExpandAll={expandAll}
        onCollapseAll={handleCollapseAll}
        rowCount={displayedRows.length}
        totalDurationDays={Math.round(cpm.totalDuration)}
        criticalCount={cpm.criticalActivityIds.size}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        onGoToToday={handleGoToToday}
        onFitToContent={handleFitToContent}
        onPrint={handlePrint}
        onToggleFullscreen={toggleFullscreen}
        isFullscreen={isFullscreen}
        onOpenCalendar={onOpenCalendar}
        extraActions={
          <BaselineMenu
            baselines={baselines}
            shownBaselineId={shownBaselineId}
            onSetShown={setShownBaseline}
            onCreate={async ({ name, notes }) => { await createBaseline({ name, notes }); }}
            onDelete={removeBaseline}
            canEdit={canEdit}
            scopeNoun="proyecto"
            // El snapshot lo congela el servidor desde las tareas reales — aquí
            // solo enviamos nombre/notas, así que devolvemos un snapshot vacío.
            buildSnapshot={() => ({ snapshot: { activities: [], dependencies: [] }, totalDurationDays: 0 })}
          />
        }
        filterLabel={activeFilterCount > 0 ? `Filtros (${activeFilterCount})` : 'Filtros'}
        filterControls={(
          <div className="space-y-2 text-xs">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Ocultar estados
            </p>
            {(['pendiente', 'en_progreso', 'completada', 'bloqueada'] as const).map(s => (
              <label key={s} className="flex items-center gap-2 capitalize">
                <input
                  type="checkbox"
                  checked={excludedStatuses.has(s)}
                  onChange={() => toggleStatus(s)}
                />
                <span>{s.replace('_', ' ')}</span>
              </label>
            ))}
            <div className="border-t pt-2 mt-2 space-y-1">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={hideMilestones}
                  onChange={e => setHideMilestones(e.target.checked)}
                />
                <span>Ocultar hitos</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={onlyAssignedToMe}
                  onChange={e => setOnlyAssignedToMe(e.target.checked)}
                />
                <span>Solo asignadas a mí</span>
              </label>
            </div>
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  setExcludedStatuses(new Set());
                  setHideMilestones(false);
                  setOnlyAssignedToMe(false);
                }}
                className="w-full text-[10px] text-center text-muted-foreground hover:text-foreground border rounded py-1 mt-2"
              >
                Limpiar filtros
              </button>
            )}
          </div>
        )}
      />
      <div
        ref={wheelHostRef}
        className="flex flex-1 min-h-0 overflow-hidden"
        // El scroll de rueda lo redirige el listener no-passive del useEffect.
      >
        <TaskList
          rows={displayedRows}
          collapsed={collapsed}
          onToggle={toggle}
          onRowClick={handleRowClick}
          onRowDoubleClick={handleOpen}
          onCommitName={() => {}}
          onCommitDuration={(row, newDays) => onResizeCommit(row, newDays)}
          selectedRowIds={selectedRowIds}
          hoverRowId={hoverRowId}
          onHoverRow={setHoverRowId}
          scrollTop={scrollTop}
          canEdit={canEdit}
          matchedRowIds={matchedRowIds}
          rowHeight={rowHeight}
          onRowDragHandleDown={canEdit ? rowDrag.beginFromHandle : undefined}
          rowDragState={rowDrag.state}
          onContextMenuRow={canEdit ? (rowId, x, y) => {
            const r = rows.find(rr => rr.id === rowId);
            if (r?.kind === 'activity' && r.activityId) setCtxMenu({ taskId: r.activityId, x, y });
          } : undefined}
          width={panelWidth}
          panelCollapsed={panelCollapsed}
          onToggleCollapsed={() => setPanelCollapsed(v => !v)}
          onResizePointerDown={onPanelResize}
        />
        <div
          ref={bodyWrapperRef}
          className="flex-1 overflow-auto relative"
          onScroll={onWrapperScroll}
          style={{ background: '#ffffff', overscrollBehavior: 'contain' }}
        >
          <TimelineBody
            rows={displayedRows}
            dependencies={renderedDeps}
            layout={layout}
            viewMode={viewMode}
            selectedRowIds={selectedRowIds}
            hoverRowId={hoverRowId}
            matchedRowIds={matchedRowIds}
            dragState={drag.dragState}
            dragDeltaX={drag.liveDelta}
            baselineBars={baselineBars.size > 0 ? baselineBars : undefined}
            baselineName={shownBaselineName}
            depDragState={depDrag.dragState}
            depHoverTarget={depDrag.hoverTarget}
            onDepHoverChange={depDrag.setHover}
            onBeginDepDrag={canEdit ? depDrag.beginFromHandle : undefined}
            onClickDep={(id) => { setSelectedDepId(id); setSelectedRowIds(new Set()); }}
            onDoubleClickDep={canEdit ? setEditingDepId : undefined}
            selectedDepId={selectedDepId || editingDepId}
            onHoverRow={setHoverRowId}
            onSelect={(rowId, e) => handleRowClick(rowId, e)}
            onOpen={handleOpen}
            onResizeStart={drag.beginResize}
            onMoveStart={drag.beginMove}
            animateAllBars={tasksRecentlyAnimated.size > 0}
            scrollTop={scrollTop}
          />
          <DepEditModal
            open={!!editingDep}
            onOpenChange={(v) => { if (!v) setEditingDepId(null); }}
            dep={editingDep}
            fromName={editingDep ? findRowName(editingDep.fromRowId) : ''}
            toName={editingDep ? findRowName(editingDep.toRowId) : ''}
            canEdit={canEdit}
            onSave={handleSaveDep}
            onDelete={handleDeleteDep}
          />
        </div>
      </div>
      {/* Barra de info de la dependencia seleccionada (1 click sobre la línea). */}
      {selectedDepId && (() => {
        const dep = gdeps.find(d => d.id === selectedDepId);
        if (!dep) return null;
        const DEP_FULL: Record<string, string> = {
          FS: 'Fin → Inicio', SS: 'Inicio → Inicio', FF: 'Fin → Fin', SF: 'Inicio → Fin',
        };
        return (
          <div className="flex items-center gap-2 px-3 py-1.5 border-t bg-slate-50 text-xs text-slate-700">
            <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded bg-slate-200 font-semibold">
              {dep.type}
            </span>
            <span className="text-slate-500">{DEP_FULL[dep.type]}</span>
            <span className="font-medium truncate">{findRowName(dep.fromRowId)}</span>
            <span className="text-slate-400">→</span>
            <span className="font-medium truncate">{findRowName(dep.toRowId)}</span>
            {dep.lagDays !== 0 && (
              <span className="text-slate-500">· Lag {dep.lagDays > 0 ? '+' : ''}{formatDurationShort(dep.lagDays)}</span>
            )}
            <button
              type="button"
              onClick={() => setSelectedDepId(null)}
              className="ml-auto text-slate-400 hover:text-slate-700"
              title="Cerrar"
              aria-label="Cerrar"
            >
              ✕
            </button>
          </div>
        );
      })()}

      {/* Diálogo #18: mover a una fecha que no cuadra con la dependencia+lag. */}
      <AlertDialog open={!!moveConflict} onOpenChange={(o) => { if (!o) setMoveConflict(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Esa fecha no coincide con su predecesora</AlertDialogTitle>
            <AlertDialogDescription>
              La fecha a la que has movido esta tarea no corresponde con su dependencia y su desfase (lag).
              ¿Qué quieres hacer?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-2 py-1">
            <Button variant="outline" className="justify-start h-auto py-2 text-left" onClick={resolveMoveByLag}>
              <span className="flex flex-col items-start">
                <span className="font-medium">Modificar el lag de la predecesora</span>
                <span className="text-xs text-muted-foreground">Ajusta el desfase para respetar la nueva fecha; las sucesoras se recalculan.</span>
              </span>
            </Button>
            <Button variant="outline" className="justify-start h-auto py-2 text-left" onClick={resolveMoveByFix}>
              <span className="flex flex-col items-start">
                <span className="font-medium">Fijar la fecha de inicio</span>
                <span className="text-xs text-muted-foreground">Ancla la tarea a esta fecha (fecha fija); la dependencia deja de moverla.</span>
              </span>
            </Button>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>

      {/* Modal de actividades retrasadas (se abre al pinchar el KPI). */}
      <Dialog open={showDelayedModal} onOpenChange={setShowDelayedModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <AlertTriangle className="h-5 w-5" />
              Actividades retrasadas ({delayedRows.length})
            </DialogTitle>
            <DialogDescription>
              Una actividad está retrasada si <strong>debía haber empezado</strong> o{' '}
              <strong>debía haber terminado</strong> (según su fecha planificada) y todavía no lo ha hecho.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-auto">
            {delayedRows.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">No hay actividades retrasadas.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-slate-400">
                    <th className="py-2 pr-3 font-medium">Actividad</th>
                    <th className="py-2 px-3 font-medium">Debía empezar</th>
                    <th className="py-2 px-3 font-medium">Debía terminar</th>
                    <th className="py-2 pl-3 font-medium">Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {delayedRows.map(r => (
                    <tr key={r.id} className="border-b last:border-0 align-top">
                      <td className="py-2 pr-3 font-medium text-slate-800">{r.name}</td>
                      <td className="py-2 px-3 whitespace-nowrap text-slate-600">
                        {r.plannedStartDate ? format(r.plannedStartDate, 'dd/MM/yyyy', { locale: es }) : '—'}
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap text-slate-600">
                        {r.plannedEndDate ? format(r.plannedEndDate, 'dd/MM/yyyy', { locale: es }) : '—'}
                      </td>
                      <td className="py-2 pl-3 text-slate-600">
                        <span className="inline-flex items-center gap-1.5">
                          {r.executionState === 'retraso_fin' ? (
                            <Clock className="h-3.5 w-3.5 flex-shrink-0 text-red-600" />
                          ) : (
                            <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 text-red-600" />
                          )}
                          {r.delayReason ??
                            (r.executionState === 'retraso_fin'
                              ? 'No ha terminado a tiempo.'
                              : 'No ha empezado a tiempo.')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Menú contextual de la estructura EDT (clic derecho sobre una fila). */}
      {ctxMenu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setCtxMenu(null)}
            onContextMenu={e => { e.preventDefault(); setCtxMenu(null); }}
          />
          <div className="fixed z-50 w-56 rounded-md border bg-white py-1 shadow-lg text-sm" style={{ left: ctxMenu.x, top: ctxMenu.y }}>
            {(() => {
              const ids = ctxTaskSourceIds(ctxMenu.taskId);
              const suffix = ids.length > 1 ? ` (${ids.length})` : '';
              return (
                <>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-slate-100"
                    onClick={() => { setCtxMenu(null); moveTasksToEdge(ids, 'top'); }}
                  >
                    <ChevronsUp className="h-3.5 w-3.5" /> Mover al inicio{suffix}
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-slate-100"
                    onClick={() => { setCtxMenu(null); moveTasksToEdge(ids, 'bottom'); }}
                  >
                    <ChevronsDown className="h-3.5 w-3.5" /> Mover al fondo{suffix}
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-slate-100"
                    onClick={() => { setMoveBelowSources(ids); setCtxMenu(null); }}
                  >
                    <ArrowDownToLine className="h-3.5 w-3.5" /> Poner debajo de…{suffix}
                  </button>
                </>
              );
            })()}
          </div>
        </>
      )}

      {/* Diálogo "Poner debajo de…": buscador con todas las actividades. */}
      <MoveBelowDialog
        open={moveBelowSources.length > 0}
        onOpenChange={(v) => { if (!v) setMoveBelowSources([]); }}
        movingName={
          moveBelowSources.length === 1
            ? rows.find(r => r.activityId === moveBelowSources[0])?.name
            : moveBelowSources.length > 1
              ? `${moveBelowSources.length} actividades`
              : undefined
        }
        items={rows
          .filter(r => r.kind === 'activity' && r.activityId && !moveBelowSources.includes(r.activityId as string))
          .map(r => ({ id: r.activityId as string, name: r.name }))}
        onSelect={(targetId) => { if (moveBelowSources.length) moveTasksBelow(moveBelowSources, targetId); }}
      />
    </div>
  );
}

export default ScheduleGantt;
