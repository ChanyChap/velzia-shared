'use client';

import { memo, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { ChevronDown, ChevronRight, Diamond, FolderTree, Pencil, Check, GripVertical, PanelLeftClose, PanelLeftOpen, CornerDownRight } from 'lucide-react';
import { COLORS, ROW_HEIGHT as DEFAULT_ROW_HEIGHT, HEADER_HEIGHT, LEFT_PANEL_WIDTH } from './constants';
import { formatDurationShort, pickNaturalUnit, unitToDays } from './format-duration';
import type { TaskRow } from './types';

interface TaskListProps {
  rows: TaskRow[];
  collapsed: Set<string>;
  onToggle: (rowId: string) => void;
  onRowClick: (rowId: string, event?: ReactMouseEvent) => void;
  onRowDoubleClick: (rowId: string) => void;
  onCommitName: (row: TaskRow, newName: string) => void;
  onCommitDuration: (row: TaskRow, newDays: number) => void;
  selectedRowIds: Set<string>;
  hoverRowId: string | null;
  onHoverRow: (rowId: string | null) => void;
  scrollTop: number;
  canEdit: boolean;
  matchedRowIds: Set<string> | null;
  // Pills opcionales por fila (ej. empresa(s) asignada(s) en el Gantt de
  // proyecto). Genérico: si no se pasa, no se pinta nada (el Gantt de plantilla
  // no lo usa). Cada pill lleva su color para distinguir empresas de un vistazo.
  rowBadges?: Map<string, { label: string; color: string }[]>;
  // COLUMNA extra al final de la fila, indexada por `row.activityId` (el id de
  // la tarea de la app). Genérico: el Gantt de proyecto de VelziaCAD la usa para
  // el RESPONSABLE (proveedor o interno) con aviso cuando falta. Si no se pasa,
  // la columna no existe (el Gantt de plantilla no la usa).
  rowMeta?: Map<string, { label: string; tone?: 'ok' | 'warn' | 'muted' }>;
  // Título de esa columna en la cabecera. Sin él, la cabecera solo dice "Estructura EDT".
  rowMetaHeader?: string;
  // Ancho en px de la columna extra (default 130).
  rowMetaWidth?: number;
  onRowDragHandleDown?: (rowId: string, event: ReactPointerEvent) => void;
  // Doble click sobre el asa (6 puntos): abre el diálogo "ubicar debajo de…".
  onGripDoubleClick?: (rowId: string) => void;
  rowDragState?: { fromRowId: string; hoverIndex: number; fromIndex: number } | null;
  onContextMenuRow?: (rowId: string, x: number, y: number) => void;
  // Zoom vertical. Si no se pasa, usa el default global.
  rowHeight?: number;
  // Ancho del panel (px). Si no se pasa, usa LEFT_PANEL_WIDTH.
  width?: number;
  // Colapsar/expandir el panel "Estructura EDT".
  panelCollapsed?: boolean;
  onToggleCollapsed?: () => void;
  // Grabber de redimensión del borde derecho (lo provee el contenedor).
  onResizePointerDown?: (e: ReactPointerEvent) => void;
  // ── Columnas internas redimensionables (todo opcional) ──────────────────
  // Ancho en px de la columna "Duración". Es el interruptor del modo columnas:
  // sin él la duración se pinta pegada al nombre y sin cabecera, como siempre
  // (RefoTask y el Gantt de plantilla no cambian ni un píxel).
  durationColWidth?: number;
  // Separador Nombre|Duración: arrastre y doble clic para restablecer.
  onDurationResizePointerDown?: (e: ReactPointerEvent) => void;
  onDurationResizeReset?: () => void;
  // Separador Duración|columna extra. Solo se pinta si hay `rowMeta`.
  onMetaResizePointerDown?: (e: ReactPointerEvent) => void;
  onMetaResizeReset?: () => void;
}

// Ancho del botón de colapsar de la cabecera (icono de 15 px + 2 de padding a
// cada lado). Las filas reservan ese mismo hueco al final para que las columnas
// caigan exactamente a plomo bajo sus títulos.
const COLLAPSE_BTN_WIDTH = 19;

// Recorte con puntos suspensivos: lo comparten cabeceras y celdas para que al
// estrechar una columna el texto se corte en vez de desbordar sobre la vecina.
const ELLIPSIS_STYLE: CSSProperties = {
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

// Cabecera de una columna con ancho propio (Duración y la columna extra). La
// guía vertical se pinta con borderLeft para que arranque aquí y siga por todas
// las filas: así se ve de dónde a dónde llega cada columna.
const HEADER_COL_STYLE: CSSProperties = {
  boxSizing: 'border-box',
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  padding: '0 6px',
  fontSize: 11,
  fontWeight: 600,
  color: COLORS.textMuted,
  borderLeft: `1px solid ${COLORS.grid}`,
};

// Celda de esa misma columna dentro de una fila: mismo ancho y misma guía que
// su cabecera.
const ROW_COL_STYLE: CSSProperties = {
  boxSizing: 'border-box',
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  padding: '0 6px',
  overflow: 'hidden',
  borderLeft: `1px solid ${COLORS.grid}`,
};

// Separador arrastrable entre dos columnas de la cabecera. Ocupa 0 px en el
// flujo (no descuadra el reparto de anchos) y la zona de agarre es un overlay
// de 6 px centrado sobre la junta, que es lo que hace cómodo el arrastre.
// Doble clic = restablecer el ancho por defecto de esa columna.
function ColumnResizer({
  onPointerDown,
  onDoubleClick,
  title,
  label,
}: {
  onPointerDown: (e: ReactPointerEvent) => void;
  onDoubleClick?: () => void;
  title: string;
  label: string;
}) {
  return (
    <span style={{ position: 'relative', width: 0, flexShrink: 0, alignSelf: 'stretch' }}>
      <span
        role="separator"
        aria-orientation="vertical"
        aria-label={label}
        onPointerDown={onPointerDown}
        onDoubleClick={onDoubleClick}
        title={title}
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: -3,
          width: 6,
          cursor: 'col-resize',
          touchAction: 'none',
          zIndex: 7,
        }}
      />
    </span>
  );
}

function rowBackground(row: TaskRow, selected: boolean, hover: boolean): string {
  if (selected) return COLORS.selection;
  if (hover) return '#eff6ff';
  if (row.kind === 'wp') return COLORS.wpRow;
  if (row.kind === 'pre-activity') return '#faf5ff';
  // Sub-tarea: fondo muy claro azulado para reforzar la jerarquía visual.
  if (row.kind === 'task') return '#f0f9ff';
  return '#ffffff';
}

interface EditState {
  rowId: string;
  field: 'name' | 'duration';
  value: string;
}

// formatDurationShort movido a ./format-duration para compartirse con gantt-bar.tsx

// prevDays: duración anterior de la fila. Si el usuario escribe SOLO un número
// (sin d/h/m), se interpreta en la unidad anterior (Chany 30 may): si antes era
// "30m" y teclea "45", se entiende 45 minutos, no 45 días.
function parseDurationInputLocal(input: string, prevDays?: number): number | null {
  const s = input.trim().toLowerCase().replace(',', '.');
  if (s.length === 0) return null;
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = parseFloat(s);
    if (!Number.isFinite(n) || n < 0) return null;
    const unit = prevDays != null ? pickNaturalUnit(prevDays) : 'd';
    return Math.round(unitToDays(n, unit) * 100000) / 100000;
  }
  let totalDays = 0;
  let matched = false;
  const dayRe = /(\d+(?:\.\d+)?)\s*d/g;
  const hourRe = /(\d+(?:\.\d+)?)\s*h/g;
  const minRe = /(\d+(?:\.\d+)?)\s*(?:min|m(?!s))/g;
  let m: RegExpExecArray | null;
  while ((m = dayRe.exec(s)) !== null) {
    totalDays += parseFloat(m[1]);
    matched = true;
  }
  while ((m = hourRe.exec(s)) !== null) {
    totalDays += parseFloat(m[1]) / 8;
    matched = true;
  }
  while ((m = minRe.exec(s)) !== null) {
    totalDays += parseFloat(m[1]) / (8 * 60);
    matched = true;
  }
  // 5 decimales (no 2) para no corromper minutos: 30m=0.0625 → "29m" con 2 dec.
  return matched ? Math.round(totalDays * 100000) / 100000 : null;
}

function TaskListImpl({
  rows,
  collapsed,
  onToggle,
  onRowClick,
  onRowDoubleClick,
  onCommitName,
  onCommitDuration,
  selectedRowIds,
  hoverRowId,
  onHoverRow,
  scrollTop,
  canEdit,
  matchedRowIds,
  rowBadges,
  rowMeta,
  rowMetaHeader,
  rowMetaWidth,
  onRowDragHandleDown,
  onGripDoubleClick,
  rowDragState,
  onContextMenuRow,
  rowHeight,
  width,
  panelCollapsed = false,
  onToggleCollapsed,
  onResizePointerDown,
  durationColWidth,
  onDurationResizePointerDown,
  onDurationResizeReset,
  onMetaResizePointerDown,
  onMetaResizeReset,
}: TaskListProps) {
  const ROW_HEIGHT = rowHeight ?? DEFAULT_ROW_HEIGHT;
  const panelWidth = width ?? LEFT_PANEL_WIDTH;
  const metaWidth = rowMetaWidth ?? 130;
  // Modo columnas: solo cuando el contenedor manda el ancho de "Duración".
  // Sin él todo se pinta como antes (retrocompatibilidad con RefoTask).
  const columnsMode = durationColWidth != null;
  const durWidth = durationColWidth ?? 0;
  // Hueco final que ocupa el botón de colapsar en la cabecera y que las filas
  // replican para que las dos rejillas coincidan.
  const trailWidth = onToggleCollapsed ? COLLAPSE_BTN_WIDTH : 0;
  const [edit, setEdit] = useState<EditState | null>(null);
  const editingRow = edit ? rows.find(r => r.id === edit.rowId) : null;
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [edit?.rowId, edit?.field]);

  const commit = () => {
    if (!edit || !editingRow) {
      setEdit(null);
      return;
    }
    const value = edit.value.trim();
    if (edit.field === 'name') {
      if (value.length > 0 && value !== editingRow.name) {
        onCommitName(editingRow, value);
      }
    } else {
      const parsed = parseDurationInputLocal(value, editingRow.days);
      if (parsed != null && parsed !== editingRow.days) {
        onCommitDuration(editingRow, parsed);
      }
    }
    setEdit(null);
  };

  const handleKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setEdit(null);
    }
  };

  // Panel colapsado: tira estrecha con botón de expandir y el título vertical.
  if (panelCollapsed) {
    return (
      <div
        className="border-r bg-white"
        style={{ width: 30, minWidth: 30, position: 'relative', overflow: 'hidden' }}
      >
        <div
          style={{
            height: HEADER_HEIGHT,
            borderBottom: `1px solid ${COLORS.grid}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#f8fafc',
          }}
        >
          <button
            type="button"
            onClick={onToggleCollapsed}
            title="Expandir Estructura EDT"
            aria-label="Expandir Estructura EDT"
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: COLORS.textMuted }}
          >
            <PanelLeftOpen size={16} />
          </button>
        </div>
        <div
          style={{
            writingMode: 'vertical-rl',
            transform: 'rotate(180deg)',
            padding: '10px 0',
            fontSize: 11,
            fontWeight: 600,
            color: COLORS.textMuted,
            whiteSpace: 'nowrap',
          }}
        >
          Estructura EDT
        </div>
      </div>
    );
  }

  // El botón de colapsar es el mismo con y sin columnas: se declara una vez
  // porque en modo columnas viaja dentro del grupo derecho de la cabecera.
  const collapseButton = onToggleCollapsed ? (
    <button
      type="button"
      onClick={onToggleCollapsed}
      title="Colapsar Estructura EDT"
      aria-label="Colapsar Estructura EDT"
      style={{
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        color: COLORS.textMuted,
        padding: 2,
        ...(columnsMode ? { flexShrink: 0, alignSelf: 'center' } : {}),
      }}
    >
      <PanelLeftClose size={15} />
    </button>
  ) : null;

  return (
    <div
      className="border-r bg-white"
      style={{
        width: panelWidth,
        minWidth: panelWidth,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          height: HEADER_HEIGHT,
          borderBottom: `1px solid ${COLORS.grid}`,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '0 8px 0 12px',
          fontWeight: 600,
          fontSize: 13,
          color: COLORS.text,
          background: '#f8fafc',
        }}
      >
        <span
          style={
            columnsMode
              ? { flex: 1, ...ELLIPSIS_STYLE }
              : { flex: 1 }
          }
        >
          Estructura EDT
        </span>
        {columnsMode ? (
          // Grupo derecho de la cabecera: gap 0 y el mismo hueco final que las
          // filas, para que cada separador caiga justo sobre la guía vertical
          // de su columna. "Nombre" no está aquí: es el flex:1 que absorbe el
          // resto, así arrastrar reparte espacio y nunca aparece scroll.
          <div style={{ display: 'flex', alignItems: 'stretch', alignSelf: 'stretch', gap: 0, flexShrink: 0 }}>
            {onDurationResizePointerDown && (
              <ColumnResizer
                onPointerDown={onDurationResizePointerDown}
                onDoubleClick={onDurationResizeReset}
                title="Arrastra para repartir el ancho entre Estructura EDT y Duración · doble clic para restablecer"
                label="Cambiar el ancho de la columna Duración"
              />
            )}
            <span style={{ ...HEADER_COL_STYLE, width: durWidth, justifyContent: 'flex-end' }}>
              <span style={ELLIPSIS_STYLE}>Duración</span>
            </span>
            {rowMeta && onMetaResizePointerDown && (
              <ColumnResizer
                onPointerDown={onMetaResizePointerDown}
                onDoubleClick={onMetaResizeReset}
                title={`Arrastra para repartir el ancho entre Duración y ${rowMetaHeader ?? 'la última columna'} · doble clic para restablecer`}
                label={`Cambiar el ancho de la columna ${rowMetaHeader ?? 'final'}`}
              />
            )}
            {rowMeta && (
              <span style={{ ...HEADER_COL_STYLE, width: metaWidth }}>
                <span style={ELLIPSIS_STYLE}>{rowMetaHeader ?? ''}</span>
              </span>
            )}
            {collapseButton}
          </div>
        ) : (
          <>
            {rowMeta && rowMetaHeader && (
              <span
                style={{
                  width: metaWidth,
                  flexShrink: 0,
                  fontSize: 11,
                  fontWeight: 600,
                  color: COLORS.textMuted,
                  textAlign: 'left',
                }}
              >
                {rowMetaHeader}
              </span>
            )}
            {collapseButton}
          </>
        )}
      </div>
      <div style={{ transform: `translateY(${-scrollTop}px)`, position: 'relative' }}>
        {rowDragState && rowDragState.hoverIndex !== rowDragState.fromIndex && (
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: rowDragState.hoverIndex * ROW_HEIGHT,
              height: 2,
              background: '#3b82f6',
              boxShadow: '0 0 6px rgba(59,130,246,0.5)',
              zIndex: 5,
              pointerEvents: 'none',
            }}
          />
        )}
        {rows.map((row, rowIdx) => {
          const isCollapsed = collapsed.has(row.id);
          const selected = selectedRowIds.has(row.id);
          const isHover = hoverRowId === row.id;
          const isEditingName = edit?.rowId === row.id && edit.field === 'name';
          const isEditingDuration = edit?.rowId === row.id && edit.field === 'duration';
          const canInlineEdit =
            canEdit && (row.kind === 'activity' || row.kind === 'pre-activity');
          const dim = matchedRowIds != null && !matchedRowIds.has(row.id);
          const rowDraggable = canEdit && !!onRowDragHandleDown && (row.kind === 'activity' || row.kind === 'pre-activity');
          return (
            <div
              key={row.id}
              role="button"
              tabIndex={0}
              onClick={e => onRowClick(row.id, e)}
              onPointerDown={rowDraggable ? (e) => {
                // Drag desde cualquier parte de la fila, salvo controles
                // interactivos (chevron, lápiz, inputs) que tienen su propia
                // acción de click (Chany 29 may).
                const el = e.target as HTMLElement;
                if (el.closest('button, input, a, [contenteditable="true"]')) return;
                onRowDragHandleDown!(row.id, e);
              } : undefined}
              onMouseEnter={() => onHoverRow(row.id)}
              onMouseLeave={() => onHoverRow(null)}
              onContextMenu={e => {
                if (!onContextMenuRow) return;
                e.preventDefault();
                onContextMenuRow(row.id, e.clientX, e.clientY);
              }}
              onDoubleClick={() => {
                // Doble click SIEMPRE abre el modal de edición de la actividad.
                // (El renombrado inline se mantiene solo en el botón del lápiz.)
                onRowDoubleClick(row.id);
              }}
              style={{
                height: ROW_HEIGHT,
                display: 'flex',
                alignItems: 'center',
                padding: '0 8px',
                borderBottom: `1px solid ${COLORS.grid}`,
                background: rowBackground(row, selected, isHover),
                cursor: rowDraggable ? 'grab' : 'pointer',
                gap: 4,
                touchAction: rowDraggable ? 'none' : undefined,
                // Evita que arrastrar desde el texto de la fila inicie una
                // selección de texto del navegador en vez del reorden.
                userSelect: rowDraggable ? 'none' : undefined,
                WebkitUserSelect: rowDraggable ? 'none' : undefined,
                opacity: dim ? 0.35 : 1,
                transition: 'opacity 120ms',
              }}
            >
              <div style={{ width: row.depth * 16, flexShrink: 0 }} />
              {canEdit && onRowDragHandleDown && (row.kind === 'activity' || row.kind === 'pre-activity') ? (
                <span
                  onPointerDown={e => {
                    e.stopPropagation();
                    onRowDragHandleDown(row.id, e);
                  }}
                  onDoubleClick={e => {
                    // Doble click en el asa: ubicar esta actividad debajo de otra
                    // (elegida en un selector). No abre el modal de la actividad.
                    e.stopPropagation();
                    onGripDoubleClick?.(row.id);
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 12,
                    cursor: 'grab',
                    color: '#cbd5e1',
                  }}
                  title="Arrastra para reordenar · doble click para ubicar debajo de otra actividad"
                  aria-label="Reordenar o ubicar debajo de otra actividad"
                >
                  <GripVertical size={12} />
                </span>
              ) : (
                <div style={{ width: 12 }} />
              )}
              {row.hasChildren ? (
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    onToggle(row.id);
                  }}
                  style={{
                    width: 18,
                    height: 18,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    color: COLORS.textMuted,
                  }}
                  aria-label={isCollapsed ? 'Expandir' : 'Colapsar'}
                >
                  {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                </button>
              ) : (
                <div style={{ width: 18 }} />
              )}
              {/* Estilo Bryntum: bullet point pequeño "•" para actividades y
                  pre-actividades; icono Folder discreto para WP; rombo solo
                  para milestones. Mucho más limpio que iconos grandes. */}
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 14,
                  color:
                    row.kind === 'wp'
                      ? COLORS.textMuted
                      : row.kind === 'pre-activity'
                        ? COLORS.preActivityStroke
                        : row.kind === 'task'
                          ? COLORS.taskStroke
                          : row.isCritical
                            ? COLORS.critical
                            : COLORS.textMuted,
                }}
              >
                {row.kind === 'wp' ? (
                  <FolderTree size={12} />
                ) : row.isMilestone ? (
                  <Diamond size={11} />
                ) : row.isAccessory ? (
                  // Actividad ACCESORIA: icono de "subordinada" (flecha en
                  // ángulo) para que se distinga a simple vista de una actividad
                  // principal, que lleva el bullet "•".
                  <CornerDownRight size={12} style={{ color: '#94a3b8' }} />
                ) : (
                  // Bullet "•" — minimal estilo Bryntum (actividad principal).
                  <span
                    style={{
                      display: 'inline-block',
                      width: 5,
                      height: 5,
                      borderRadius: '50%',
                      background: 'currentColor',
                    }}
                  />
                )}
              </span>
              {isEditingName ? (
                <input
                  ref={inputRef}
                  className="flex-1 text-sm px-1 py-0 border border-blue-400 rounded outline-none"
                  value={edit!.value}
                  onChange={e => setEdit({ ...edit!, value: e.target.value })}
                  onBlur={commit}
                  onKeyDown={handleKey}
                  onClick={e => e.stopPropagation()}
                />
              ) : (
                <span
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  {/* Etiqueta "acc." gris delante de las accesorias — refuerza
                      la jerarquía y hace la lista autoexplicativa (no hace falta
                      mirar el icono para entender qué es). */}
                  {row.isAccessory && (
                    <span
                      style={{
                        flexShrink: 0,
                        fontSize: 9,
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: 0.4,
                        color: '#94a3b8',
                        background: '#f1f5f9',
                        borderRadius: 3,
                        padding: '0 4px',
                        lineHeight: '14px',
                      }}
                      title="Actividad accesoria de una actividad principal del mismo paquete"
                    >
                      acc.
                    </span>
                  )}
                  <span
                    style={{
                      fontSize: row.kind === 'wp' ? 13 : row.kind === 'task' ? 11 : 12,
                      // Actividades PRINCIPALES (kind activity, no accesoria) en
                      // negrita 600 para distinguirlas de las accesorias (400 +
                      // color atenuado). WP y críticas mantienen su 600 previo.
                      fontWeight:
                        row.kind === 'wp'
                          ? 600
                          : row.isCritical
                            ? 600
                            : row.kind === 'activity' && !row.isAccessory
                              ? 600
                              : 400,
                      // Tareas hijas y accesorias con color más tenue (jerarquía).
                      color:
                        row.kind === 'task' || row.isAccessory ? COLORS.textMuted : COLORS.text,
                      fontStyle: row.kind === 'task' ? 'italic' : 'normal',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      minWidth: 0,
                      textTransform: row.kind === 'wp' ? 'uppercase' : 'none',
                      letterSpacing: row.kind === 'wp' ? 0.3 : 0,
                    }}
                    title={row.tooltip || row.name}
                  >
                    {row.name}
                  </span>
                  {/* Insignia de estado (VelziaCAD): punto de color + etiqueta corta. */}
                  {row.statusBadge && (
                    <span
                      title={row.statusBadge.label}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0,
                        fontSize: 10, lineHeight: '14px', padding: '0 6px', borderRadius: 999,
                        background: `${row.statusBadge.color}1a`, border: `1px solid ${row.statusBadge.color}66`,
                        color: '#334155', whiteSpace: 'nowrap',
                      }}
                    >
                      <span style={{ width: 7, height: 7, borderRadius: 999, background: row.statusBadge.color, flexShrink: 0 }} />
                      {row.statusBadge.label}
                    </span>
                  )}
                  {/* Pills de empresa(s) asignada(s) — solo Gantt de proyecto.
                      Color por empresa + nombre corto; tooltip con el nombre
                      completo. Si no hay empresa, no se pinta nada. */}
                  {(rowBadges?.get(row.id)?.length ?? 0) > 0 && (
                    <span style={{ display: 'inline-flex', gap: 3, flexShrink: 0 }}>
                      {rowBadges!.get(row.id)!.map((b, i) => (
                        <span
                          key={i}
                          title={b.label}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 3,
                            maxWidth: 120,
                            fontSize: 10,
                            lineHeight: '14px',
                            padding: '0 5px',
                            borderRadius: 999,
                            background: `${b.color}1a`,
                            border: `1px solid ${b.color}66`,
                            color: '#334155',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          <span
                            style={{
                              flexShrink: 0,
                              width: 6,
                              height: 6,
                              borderRadius: '50%',
                              background: b.color,
                            }}
                          />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.label}</span>
                        </span>
                      ))}
                    </span>
                  )}
                </span>
              )}
              {canInlineEdit && !isEditingName && (
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    setEdit({ rowId: row.id, field: 'name', value: row.name });
                  }}
                  className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-slate-700"
                  style={{ background: 'none', border: 'none', padding: 2 }}
                  title="Renombrar (Enter para guardar)"
                  aria-label="Renombrar"
                >
                  <Pencil size={12} />
                </button>
              )}
              {/* Cola de la fila: Duración y columna extra. En modo columnas
                  van dentro de un grupo de ancho fijo (gap 0 + hueco final
                  igual al de la cabecera) para que caigan a plomo bajo sus
                  títulos; sin ese modo se pintan sueltas, como siempre. */}
              {(() => {
                const meta = rowMeta && row.activityId ? rowMeta.get(row.activityId) : undefined;
                const metaColor =
                  meta?.tone === 'warn' ? '#b45309' : meta?.tone === 'muted' ? COLORS.textMuted : '#334155';
                // Con columna propia el texto debe poder encogerse y recortarse;
                // sin ella conserva el flexShrink: 0 de siempre.
                const durationFit: CSSProperties = columnsMode
                  ? { ...ELLIPSIS_STYLE, flexShrink: 1 }
                  : { flexShrink: 0 };
                // Celda de duración editable. Se muestra en ACTIVIDADES, incluidos
                // los HITOS: editar la duración de un hito a > 0 lo convierte en
                // actividad (lo gestiona onCommitDuration). Antes los hitos no
                // permitían editar duración (Chany 30 may).
                const duration =
                  row.kind === 'activity' ? (
                    isEditingDuration ? (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          ...(columnsMode ? { flex: 1, minWidth: 0 } : {}),
                        }}
                        onClick={e => e.stopPropagation()}
                      >
                        <input
                          ref={inputRef}
                          className={`text-xs px-1 py-0 border border-blue-400 rounded outline-none tabular-nums${columnsMode ? '' : ' w-14'}`}
                          style={columnsMode ? { flex: 1, minWidth: 0 } : undefined}
                          value={edit!.value}
                          onChange={e => setEdit({ ...edit!, value: e.target.value })}
                          onBlur={commit}
                          onKeyDown={handleKey}
                          placeholder="2d, 4h…"
                        />
                        <Check
                          size={12}
                          className="text-emerald-600 cursor-pointer"
                          onClick={commit}
                        />
                      </span>
                    ) : (
                      <span
                        style={{
                          fontSize: 11,
                          color: COLORS.textMuted,
                          fontVariantNumeric: 'tabular-nums',
                          ...durationFit,
                          cursor: canEdit ? 'text' : 'default',
                          padding: '0 2px',
                          borderRadius: 3,
                        }}
                        onClick={e => {
                          // UN SOLO click entra en edición (antes hacía falta doble
                          // click). stopPropagation para no seleccionar la fila al
                          // pinchar el número. Enter confirma; el guardado es
                          // optimista en onCommitDuration. Chany 31 may.
                          if (!canEdit) return;
                          e.stopPropagation();
                          setEdit({ rowId: row.id, field: 'duration', value: formatDurationShort(row.days) });
                        }}
                        onDoubleClick={e => {
                          // Evita que el doble click sobre la celda abra además el
                          // modal de la actividad (onRowDoubleClick de la fila).
                          if (!canEdit) return;
                          e.stopPropagation();
                        }}
                        title={canEdit ? 'Click para editar la duración (Enter para guardar)' : undefined}
                      >
                        {formatDurationShort(row.days)}
                      </span>
                    )
                  ) : row.kind === 'pre-activity' ? (
                    <span
                      style={{
                        fontSize: 11,
                        color: COLORS.preActivityStroke,
                        fontVariantNumeric: 'tabular-nums',
                        ...durationFit,
                      }}
                      title="Días antes del inicio de la actividad madre"
                    >
                      -{row.leadDays ?? 0}d
                    </span>
                  ) : null;

                // Sin modo columnas: exactamente el mismo marcado de siempre —
                // duración suelta y, si hay rowMeta, su celda de ancho fijo (o
                // un hueco vacío para que las de abajo no se desalineen).
                if (!columnsMode) {
                  return (
                    <>
                      {duration}
                      {rowMeta &&
                        (meta ? (
                          <span
                            title={meta.label}
                            style={{
                              width: metaWidth,
                              flexShrink: 0,
                              fontSize: 11,
                              color: metaColor,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              fontWeight: meta.tone === 'warn' ? 600 : 400,
                            }}
                          >
                            {meta.label}
                          </span>
                        ) : (
                          <span style={{ width: metaWidth, flexShrink: 0 }} />
                        ))}
                    </>
                  );
                }

                // Con columnas: la celda de duración se pinta SIEMPRE (aunque el
                // paquete o la sub-tarea no tenga), porque si no la columna
                // extra se correría a la izquierda en esas filas.
                return (
                  <div style={{ display: 'flex', alignItems: 'stretch', alignSelf: 'stretch', gap: 0, flexShrink: 0 }}>
                    <span style={{ ...ROW_COL_STYLE, width: durWidth, justifyContent: 'flex-end' }}>
                      {duration}
                    </span>
                    {/* Columna extra (rowMeta). En VelziaCAD es el RESPONSABLE:
                        nombre del proveedor/persona, o aviso ámbar si falta. */}
                    {rowMeta && (
                      <span style={{ ...ROW_COL_STYLE, width: metaWidth }}>
                        {meta && (
                          <span
                            title={meta.label}
                            style={{
                              ...ELLIPSIS_STYLE,
                              fontSize: 11,
                              color: metaColor,
                              fontWeight: meta.tone === 'warn' ? 600 : 400,
                            }}
                          >
                            {meta.label}
                          </span>
                        )}
                      </span>
                    )}
                    {trailWidth > 0 && <span style={{ width: trailWidth, flexShrink: 0 }} />}
                  </div>
                );
              })()}
            </div>
          );
        })}
      </div>
      {/* Grabber de redimensión: borde derecho del panel. */}
      {onResizePointerDown && (
        <div
          onPointerDown={onResizePointerDown}
          title="Arrastra para cambiar el ancho del panel"
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            width: 6,
            cursor: 'col-resize',
            zIndex: 6,
          }}
        />
      )}
    </div>
  );
}

export const TaskList = memo(TaskListImpl);
