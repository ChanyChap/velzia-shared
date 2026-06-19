'use client';

import { memo, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
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
  onRowDragHandleDown,
  onGripDoubleClick,
  rowDragState,
  onContextMenuRow,
  rowHeight,
  width,
  panelCollapsed = false,
  onToggleCollapsed,
  onResizePointerDown,
}: TaskListProps) {
  const ROW_HEIGHT = rowHeight ?? DEFAULT_ROW_HEIGHT;
  const panelWidth = width ?? LEFT_PANEL_WIDTH;
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
        <span style={{ flex: 1 }}>Estructura EDT</span>
        {onToggleCollapsed && (
          <button
            type="button"
            onClick={onToggleCollapsed}
            title="Colapsar Estructura EDT"
            aria-label="Colapsar Estructura EDT"
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: COLORS.textMuted, padding: 2 }}
          >
            <PanelLeftClose size={15} />
          </button>
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
                    title={row.name}
                  >
                    {row.name}
                  </span>
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
              {/* Celda de duración editable. Se muestra en ACTIVIDADES, incluidos
                  los HITOS: editar la duración de un hito a > 0 lo convierte en
                  actividad (lo gestiona onCommitDuration). Antes los hitos no
                  permitían editar duración (Chany 30 may). */}
              {row.kind === 'activity' && (
                isEditingDuration ? (
                  <span
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                    onClick={e => e.stopPropagation()}
                  >
                    <input
                      ref={inputRef}
                      className="w-14 text-xs px-1 py-0 border border-blue-400 rounded outline-none tabular-nums"
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
                      flexShrink: 0,
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
              )}
              {row.kind === 'pre-activity' && (
                <span
                  style={{
                    fontSize: 11,
                    color: COLORS.preActivityStroke,
                    fontVariantNumeric: 'tabular-nums',
                    flexShrink: 0,
                  }}
                  title="Días antes del inicio de la actividad madre"
                >
                  -{row.leadDays ?? 0}d
                </span>
              )}
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
