export const ANCHOR_DATE = new Date(2025, 0, 6);

// Look & feel "Bryntum-like" (ref. de Chany 2026-05-28): barras finas con forma
// cápsula (rx = BAR_HEIGHT/2) y filas más espaciadas. BAR_HEIGHT 14px da
// suficiente alto para ver progreso interno y la duración centrada sin
// agobiar visualmente.
export const ROW_HEIGHT = 34;
export const BAR_HEIGHT = 14;
export const HEADER_HEIGHT = 60;
export const LEFT_PANEL_WIDTH = 420;
export const ROW_PADDING_Y = (ROW_HEIGHT - BAR_HEIGHT) / 2;

export const VIEW_MODE_PX_PER_DAY = {
  day: 40,
  week: 14,
  month: 4,
} as const;

// Bounds amplios para que el slider de zoom horizontal cubra desde "vista año
// entera comprimida" (1 px/día) hasta "zoom de detalle por hora" (200 px/día).
// Estos valores reemplazan los rangos anteriores que limitaban demasiado.
export const VIEW_MODE_PX_PER_DAY_BOUNDS = {
  day: { min: 4, max: 200 },
  week: { min: 1.5, max: 60 },
  month: { min: 0.5, max: 20 },
} as const;

// Zoom vertical: altura mínima y máxima de fila (px). El valor por defecto es
// ROW_HEIGHT (34) y se persiste por usuario+tipo Gantt en localStorage.
export const ROW_HEIGHT_BOUNDS = { min: 22, max: 80 } as const;

export const COLORS = {
  // Tonos de la barra principal — el "claro" es el fondo (parte pendiente) y
  // el "dark" se pinta encima hasta el % de progreso de la actividad. Esto
  // imita el aspecto Bryntum donde cada barra muestra completado vs restante.
  bar: '#3b82f6',
  barLight: '#dbeafe',
  barStroke: '#1d4ed8',
  barText: '#ffffff',
  // Color sub-tarea EDT (hija de actividad). Tono más claro y suave que el de
  // actividad para que la jerarquía visual sea obvia. Se aplica además
  // opacidad 0.6 al renderizar (ver gantt-bar.tsx).
  task: '#93c5fd',
  taskStroke: '#3b82f6',
  taskText: '#1e3a8a',
  preActivity: '#a855f7',
  preActivityStroke: '#7e22ce',
  milestone: '#0ea5e9',
  milestoneStroke: '#0369a1',
  critical: '#dc2626',
  criticalStroke: '#991b1b',
  wpRow: '#f1f5f9',
  wpRowAlt: '#f8fafc',
  rowStripe: '#fafafa',
  // Banda de día NO laborable (finde o festivo). Gris claro pero claramente
  // distinguible del blanco de los días laborables, para que el usuario vea de
  // un vistazo qué días no se trabaja (Chany 31 may).
  nonWorking: '#e2e8f0',
  // Flecha de dependencia: slate-600 en vez del antiguo slate-400 (#94a3b8),
  // que se veía demasiado claro y la dirección no se distinguía (Chany 29 may).
  arrow: '#475569',
  arrowCritical: '#dc2626',
  grid: '#e5e7eb',
  gridDay: '#f1f5f9',
  gridWeek: '#cbd5e1',
  gridMonth: '#94a3b8',
  todayLine: '#ef4444',
  text: '#0f172a',
  textMuted: '#64748b',
  selection: '#fde68a',
} as const;

// Stub horizontal base de las flechas de dependencia antes de girar al tramo
// vertical. Moderado: lo justo para separar la línea de la cápsula sin escalones.
export const DEPENDENCY_OFFSET = 14;

export const RESIZE_HANDLE_WIDTH = 8;

// Línea naranja vertical "Project start" tipo Bryntum.
export const PROJECT_START_COLOR = '#f59e0b';

export const LOCAL_STORAGE_COLLAPSE_KEY = (templateId: string) =>
  `edt-gantt-custom:collapsed:${templateId}`;

export const LOCAL_STORAGE_VIEWMODE_KEY = (templateId: string) =>
  `edt-gantt-custom:viewmode:${templateId}`;

export const LOCAL_STORAGE_PX_KEY = (templateId: string) =>
  `edt-gantt-custom:px:${templateId}`;

// Persistencia de zoom por usuario+tipo de Gantt (template vs project),
// SIN templateId — Chany prefiere que el mismo nivel de zoom horizontal y
// vertical se aplique a TODAS las plantillas EDT que abre y a TODOS los
// Gantts de proyecto. Así no tiene que reajustar cada vez que cambia de
// proyecto/plantilla.
// scope acepta string libre — además de 'template' / 'project' globales,
// puede ser 'template:<templateId>' o 'project:<projectId>' para
// persistencia por entidad concreta (Chany 2026-05-29).
export const LOCAL_STORAGE_ZOOM_X_KEY = (scope: string) =>
  `gantt-zoom-x:${scope}`;
export const LOCAL_STORAGE_ZOOM_Y_KEY = (scope: string) =>
  `gantt-zoom-y:${scope}`;
export const LOCAL_STORAGE_VIEWMODE_SCOPE_KEY = (scope: string) =>
  `gantt-viewmode:${scope}`;
