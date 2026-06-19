// Tipos del Gantt compartido (@velzia/shared).
//
// Antes dependían de `@/lib/types` de RefoTask; ahora el paquete es autónomo y
// cada app consumidora (rt.sig, VelziaCAD) mapea sus entidades de dominio
// (tareas/estancias/dependencias) a los tipos genéricos `GanttTask`,
// `GanttGroup` y `GanttDep`, y provee la persistencia mediante `GanttDataPort`.

// 'task' = tarea EDT (EdtActivityTask) hija de una actividad. Visualmente se
// pinta como una sub-barra con color más claro/transparente para distinguir
// del nivel actividad. Se puede ocultar plegando la actividad madre.
export type RowKind = 'wp' | 'activity' | 'pre-activity' | 'task';

export type ViewMode = 'day' | 'week' | 'month';

// Tipos de dependencia del cronograma: Fin→Inicio, Inicio→Inicio, Fin→Fin,
// Inicio→Fin. Antes venía de `@/lib/types`; ahora es local al paquete.
export type DependencyType = 'FS' | 'SS' | 'FF' | 'SF';

export interface CriticalPathInfo {
  duration: number;
  activityIds: Set<string>;
}

export interface TaskRow {
  id: string;
  kind: RowKind;
  name: string;
  depth: number;
  parentRowId: string | null;

  startDate: Date;
  // Offset FRACCIONARIO en días desde ANCHOR_DATE (para posicionar barras con
  // precisión sub-día). Si está presente, manda sobre startDate para la X.
  // Solo lo rellena el Gantt de plantilla EDT (use-gantt-data); el de proyecto
  // usa startDate directo. Chany 29 may.
  startOffsetDays?: number;
  days: number;
  // Ancho de la barra en días-CALENDARIO (solo modo calendario laboral del
  // Gantt de plantilla EDT). Cuando está presente manda sobre `days` para el
  // ANCHO de la cápsula y para los extremos de las flechas de dependencia, de
  // modo que una actividad que cruza un finde/festivo se ve más ancha. `days`
  // sigue siendo la duración real (para la etiqueta "1h"/"2d"). undefined en el
  // Gantt de proyecto y en modo abstracto. Chany 30 may.
  widthDays?: number;
  isMilestone: boolean;

  isCritical: boolean;
  isCollapsedRollup: boolean;
  isHidden: boolean;

  wpId?: string;
  activityId?: string;
  preActivityId?: string;
  parentActivityId?: string | null;
  leadDays?: number;
  // taskId: id de la tarea EDT (kind='task'). parentActivityId apunta a la
  // actividad madre, igual que en pre-activities.
  taskId?: string;

  hasChildren: boolean;
  draggable: boolean;
  resizable: boolean;

  earlyStartDay?: number;
  earlyFinishDay?: number;
  lateStartDay?: number;
  lateFinishDay?: number;
  totalFloatDays?: number;

  // Progreso 0..100 — solo se rellena en el Gantt de tareas reales del proyecto
  // (schedule-gantt). En el modo plantilla EDT queda undefined (la barra se
  // pinta entera en color oscuro). Pinta la "parte completada" sobre la base
  // clara, estilo Bryntum.
  progress?: number;

  // Estado de ejecución de la actividad en el Gantt de PROYECTO. En plantilla
  // EDT queda undefined y la barra conserva su color clásico (azul/crítica).
  // Cuando está presente, colorForRow pinta en la gama VERDE (no empezada →
  // claro, empezada → claro+oscuro, terminada → oscuro) o ROJO (retrasos). El
  // retraso SIEMPRE manda sobre el estado base.
  executionState?: 'no_empezada' | 'empezada' | 'terminada' | 'retraso_inicio' | 'retraso_fin';
  // Fechas planificadas REALES. Se usan para el KPI/modal de "actividades
  // retrasadas": cuándo debía empezar y cuándo debía terminar.
  plannedStartDate?: Date;
  plannedEndDate?: Date;
  // Texto del motivo del retraso para el modal (ej. "Debía haber empezado el …").
  delayReason?: string;

  // Subtítulo opcional que se pinta DEBAJO del nombre de la barra, en texto
  // pequeño y atenuado. En el Gantt de PROYECTO contiene los nombres de los
  // recursos asignados (personas/subcontratas). Se rellena post-proceso.
  subtitle?: string;

  // Datos crudos opcionales de la app consumidora (genéricos, sin acoplar el
  // paquete a un modelo concreto). schedule-gantt no los usa.
  rawActivity?: unknown;
  rawWp?: unknown;

  // Marcado de "accesoria": una actividad subordinada a una PRINCIPAL del mismo
  // paquete. Lo calcula use-gantt-data (plantilla EDT).
  isAccessory?: boolean;
  // true en una actividad PRINCIPAL que tiene al menos una accesoria apuntándola.
  hasAccessories?: boolean;
}

export interface GanttDependency {
  id: string;
  fromRowId: string;
  toRowId: string;
  type: DependencyType;
  lagDays: number;
  isCritical: boolean;
  isVirtual: boolean;
}

export interface ScaleConfig {
  pxPerDay: number;
  viewMode: ViewMode;
}

export interface DragState {
  rowId: string;
  kind: 'move' | 'resize';
  startX: number;
  currentX: number;
  originalDays: number;
  originalStartDate: Date;
  originalLeadDays: number;
}

// ───────────────────────── Tipos de datos genéricos ─────────────────────────
// Estos tipos son SUBCONJUNTOS ESTRUCTURALES de las entidades de dominio de las
// apps consumidoras: RefoTask (`Tarea`/`Estancia`/`TaskDependency` con campos
// snake_case) puede pasar sus arrays tal cual; VelziaCAD mapea sus `cad_tareas`/
// `cad_dependencias` (campos en español) a esta forma en su wrapper.

export interface GanttTask {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  // NUMERIC de Supabase puede llegar como string; el componente normaliza con Number().
  duration_days?: number | string | null;
  is_milestone?: boolean | null;
  status: string;
  progress?: number | null;
  sort_order?: number | null;
  // Id del grupo/estancia para limitar reorden y construir el subtítulo. En
  // VelziaCAD se puede usar el capítulo/partida como grupo.
  estancia_id?: string | null;
  assigned_user_ids?: string[] | null;
  start_date_fixed?: boolean | null;
  // Jerarquía EDT opcional (modo árbol). Si `parent_id` está presente en alguna
  // tarea, el Gantt construye un árbol (paquete → actividad → tarea) en vez de
  // la lista plana. `nivel` mapea a la profundidad/estilo de fila. Ausentes en
  // RefoTask → lista plana (compatibilidad hacia atrás).
  parent_id?: string | null;
  nivel?: 'paquete' | 'actividad' | 'tarea' | string | null;
}

export interface GanttGroup {
  id: string;
  name: string;
}

export interface GanttDep {
  id: string;
  predecessor_id: string;
  successor_id: string;
  dependency_type?: DependencyType | string | null;
  lag_days?: number | null;
}

// ──────────────────────────── Líneas base ───────────────────────────────────
export interface BaselineSummary {
  id: string;
  name: string;
  notes: string | null;
  created_at: string;
  total_duration_days: number;
}

export interface BaselineBar {
  activityId: string;
  startDate: Date;
  days: number;
  isMilestone: boolean;
}

// ──────────────────────────── Puerto de datos ───────────────────────────────
// Toda la persistencia del Gantt se inyecta por aquí. RefoTask la implementa con
// el cliente Supabase directo (tablas `tareas`/`task_dependencies`); VelziaCAD
// con fetch a `/api/cad/projects/[id]/schedule/...`. Así el mismo componente
// escribe en tablas distintas sin acoplarse a ninguna.

export interface GanttBaselinePort {
  list: () => Promise<BaselineSummary[]>;
  create: (input: { name: string; notes?: string }) => Promise<void>;
  remove: (id: string) => Promise<void>;
  getSnapshot: (id: string) => Promise<{
    name?: string;
    tasks: Array<{
      tarea_id: string;
      start_date: string | null;
      end_date: string | null;
      duration_days: number | null;
      is_milestone: boolean | null;
    }>;
  }>;
}

export interface GanttDataPort {
  // Persiste el nuevo sort_order de las tareas indicadas (reorden / mover).
  updateTaskSortOrders: (updates: Array<{ id: string; sortOrder: number }>) => Promise<void>;
  // Convierte hito↔tarea (al redimensionar un hito a duración > 0).
  setTaskMilestone: (taskId: string, isMilestone: boolean) => Promise<void>;
  // Marca la fecha de inicio como fija (la dependencia deja de moverla).
  setTaskStartDateFixed: (taskId: string, fixed: boolean) => Promise<void>;
  // Aplica en lote las fechas recalculadas por la propagación.
  updateTaskDates: (changes: Array<{ taskId: string; start: string; end: string }>) => Promise<void>;
  // CRUD de dependencias. createDependency devuelve la dep creada (al menos su id).
  createDependency: (input: {
    predecessorId: string;
    successorId: string;
    type: DependencyType;
  }) => Promise<GanttDep>;
  updateDependency: (id: string, updates: { type: DependencyType; lagDays: number }) => Promise<void>;
  deleteDependency: (id: string) => Promise<void>;
  // Subtítulo de recursos asignados por tarea (opcional). Map tareaId → nombres.
  loadAssignees?: () => Promise<Record<string, string[]>>;
  // Líneas base (opcional). Si no se provee, el menú de líneas base se oculta.
  baselines?: GanttBaselinePort;
}
