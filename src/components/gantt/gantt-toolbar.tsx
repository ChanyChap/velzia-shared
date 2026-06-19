'use client';

import { type ReactNode } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { ZoomIn, ZoomOut, ChevronsDownUp, ChevronsUpDown, Calendar, CalendarDays, CalendarRange, Undo2, Redo2, Search, X, MoveVertical, CalendarClock, Maximize2, Printer, Filter, Expand, Minimize, CalendarCog } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import type { ViewMode } from './types';
import { VIEW_MODE_PX_PER_DAY_BOUNDS, ROW_HEIGHT_BOUNDS } from './constants';

interface GanttToolbarProps {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  pxPerDay: number;
  setPxPerDay: (px: number) => void;
  // Zoom vertical (altura de fila). Opcional para mantener compatibilidad
  // si algún consumidor antiguo aún no lo pasa.
  rowHeight?: number;
  setRowHeight?: (h: number) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  rowCount: number;
  totalDurationDays?: number;
  criticalCount?: number;
  extraActions?: ReactNode;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  searchTerm: string;
  onSearchChange: (term: string) => void;
  // Botón "Ir a HOY": scroll horizontal hasta la columna del día actual.
  onGoToToday?: () => void;
  // Botón "Ajustar al contenido": ajusta pxPerDay para que el Gantt completo
  // entre en el ancho del contenedor.
  onFitToContent?: () => void;
  // Botón "Imprimir / Exportar": dispara window.print() del Gantt.
  onPrint?: () => void;
  // Botón "Pantalla completa": pone el Gantt en fullscreen del navegador.
  onToggleFullscreen?: () => void;
  isFullscreen?: boolean;
  // Botón "Calendario laboral": abre la config de festivos/jornada en otra pestaña.
  onOpenCalendar?: () => void;
  // Slot opcional para controles de filtro específicos del contexto (Gantt EDT
  // vs Gantt proyecto). Se renderiza dentro de un Popover al lado de la toolbar.
  filterControls?: ReactNode;
  // Etiqueta del botón de filtros (ej. "3 activos" o "Sin filtros").
  filterLabel?: string;
}

export function GanttToolbar({
  viewMode,
  setViewMode,
  pxPerDay,
  setPxPerDay,
  rowHeight,
  setRowHeight,
  onExpandAll,
  onCollapseAll,
  rowCount,
  totalDurationDays,
  criticalCount,
  extraActions,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  searchTerm,
  onSearchChange,
  onGoToToday,
  onFitToContent,
  onPrint,
  onToggleFullscreen,
  isFullscreen = false,
  onOpenCalendar,
  filterControls,
  filterLabel,
}: GanttToolbarProps) {
  const bounds = VIEW_MODE_PX_PER_DAY_BOUNDS[viewMode];

  const canZoomIn = pxPerDay < bounds.max;
  const canZoomOut = pxPerDay > bounds.min;

  // Sliders del zoom: input range estándar HTML, con su feedback al usuario.
  const supportsVerticalZoom = typeof rowHeight === 'number' && !!setRowHeight;

  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b bg-white">
      <div className="flex items-center gap-1 border rounded-md p-0.5">
        <Button
          variant={viewMode === 'day' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setViewMode('day')}
          className="h-7 px-2"
        >
          <Calendar className="h-3.5 w-3.5 mr-1" />
          Día
        </Button>
        <Button
          variant={viewMode === 'week' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setViewMode('week')}
          className="h-7 px-2"
        >
          <CalendarDays className="h-3.5 w-3.5 mr-1" />
          Semana
        </Button>
        <Button
          variant={viewMode === 'month' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setViewMode('month')}
          className="h-7 px-2"
        >
          <CalendarRange className="h-3.5 w-3.5 mr-1" />
          Mes
        </Button>
      </div>

      {/* Zoom horizontal: botones - slider - + para granularidad fina */}
      <div className="flex items-center gap-1" title={`Zoom horizontal: ${pxPerDay.toFixed(1)} px/día`}>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPxPerDay(Math.max(bounds.min, pxPerDay * 0.8))}
          disabled={!canZoomOut}
          className="h-7 w-7 p-0"
          title="Reducir zoom horizontal"
          aria-label="Reducir zoom horizontal"
        >
          <ZoomOut className="h-3.5 w-3.5" />
        </Button>
        <input
          type="range"
          min={bounds.min}
          max={bounds.max}
          step={0.5}
          value={pxPerDay}
          onChange={e => setPxPerDay(parseFloat(e.target.value))}
          className="w-24 h-1.5"
          title={`Zoom horizontal: ${pxPerDay.toFixed(1)} px/día`}
          aria-label="Slider zoom horizontal"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPxPerDay(Math.min(bounds.max, pxPerDay * 1.25))}
          disabled={!canZoomIn}
          className="h-7 w-7 p-0"
          title="Aumentar zoom horizontal"
          aria-label="Aumentar zoom horizontal"
        >
          <ZoomIn className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Zoom vertical: altura de fila. Solo si la página lo pasa. */}
      {supportsVerticalZoom && (
        <div className="flex items-center gap-1" title={`Zoom vertical: ${rowHeight}px de alto por fila`}>
          <MoveVertical className="h-3.5 w-3.5 text-slate-500" />
          <input
            type="range"
            min={ROW_HEIGHT_BOUNDS.min}
            max={ROW_HEIGHT_BOUNDS.max}
            step={1}
            value={rowHeight}
            onChange={e => setRowHeight!(parseInt(e.target.value, 10))}
            className="w-20 h-1.5"
            title={`Zoom vertical: ${rowHeight}px de alto por fila`}
            aria-label="Slider zoom vertical (altura de fila)"
          />
        </div>
      )}

      <div className="h-6 w-px bg-slate-200" />

      {/* Filtros — popover con controles propios del contexto. Solo icono; el
          texto va en el tooltip. Si hay filtros activos, un puntito naranja. */}
      {filterControls && (
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-7 p-0 relative"
              title={filterLabel || 'Filtros del Gantt'}
              aria-label={filterLabel || 'Filtros del Gantt'}
            >
              <Filter className="h-3.5 w-3.5" />
              {filterLabel && filterLabel !== 'Filtros' && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-orange-500" />
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 p-3">
            {filterControls}
          </PopoverContent>
        </Popover>
      )}

      <Button variant="outline" size="sm" onClick={onCollapseAll} className="h-7 w-7 p-0" title="Colapsar todo" aria-label="Colapsar todo">
        <ChevronsDownUp className="h-3.5 w-3.5" />
      </Button>
      <Button variant="outline" size="sm" onClick={onExpandAll} className="h-7 w-7 p-0" title="Expandir todo" aria-label="Expandir todo">
        <ChevronsUpDown className="h-3.5 w-3.5" />
      </Button>

      {/* Acciones extra de navegación / impresión */}
      {(onGoToToday || onFitToContent || onPrint || onToggleFullscreen || onOpenCalendar) && (
        <>
          <div className="h-6 w-px bg-slate-200" />
          {onGoToToday && (
            <Button variant="outline" size="sm" onClick={onGoToToday} className="h-7" title="Centrar en HOY">
              <CalendarClock className="h-3.5 w-3.5 mr-1" />
              Hoy
            </Button>
          )}
          {onFitToContent && (
            <Button variant="outline" size="sm" onClick={onFitToContent} className="h-7" title="Ajustar zoom para que entre todo el Gantt">
              <Maximize2 className="h-3.5 w-3.5 mr-1" />
              Ajustar
            </Button>
          )}
          {onToggleFullscreen && (
            <Button
              variant="outline"
              size="sm"
              onClick={onToggleFullscreen}
              className="h-7 w-7 p-0"
              title={isFullscreen ? 'Salir de pantalla completa (ESC)' : 'Pantalla completa (ESC para salir)'}
              aria-label={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
            >
              {isFullscreen ? <Minimize className="h-3.5 w-3.5" /> : <Expand className="h-3.5 w-3.5" />}
            </Button>
          )}
          {onOpenCalendar && (
            <Button
              variant="outline"
              size="sm"
              onClick={onOpenCalendar}
              className="h-7"
              title="Editar el calendario laboral (festivos y jornada) en otra pestaña"
            >
              <CalendarCog className="h-3.5 w-3.5 mr-1" />
              Calendario laboral
            </Button>
          )}
          {onPrint && (
            <Button variant="outline" size="sm" onClick={onPrint} className="h-7 w-7 p-0" title="Imprimir / Exportar PDF">
              <Printer className="h-3.5 w-3.5" />
            </Button>
          )}
        </>
      )}

      {(onUndo || onRedo) && (
        <>
          <div className="h-6 w-px bg-slate-200" />
          <Button
            variant="outline"
            size="sm"
            onClick={onUndo}
            disabled={!canUndo}
            className="h-7 w-7 p-0"
            title="Deshacer (Ctrl+Z)"
            aria-label="Deshacer"
          >
            <Undo2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onRedo}
            disabled={!canRedo}
            className="h-7 w-7 p-0"
            title="Rehacer (Ctrl+Shift+Z)"
            aria-label="Rehacer"
          >
            <Redo2 className="h-3.5 w-3.5" />
          </Button>
        </>
      )}

      {extraActions && (
        <>
          <div className="h-6 w-px bg-slate-200" />
          {extraActions}
        </>
      )}

      <div className="flex-1" />

      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
        <Input
          value={searchTerm}
          onChange={e => onSearchChange(e.target.value)}
          placeholder="Buscar actividad…"
          className="h-7 w-44 pl-7 pr-7 text-xs"
        />
        {searchTerm.length > 0 && (
          <button
            type="button"
            onClick={() => onSearchChange('')}
            className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-700"
            aria-label="Limpiar búsqueda"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {typeof totalDurationDays === 'number' && (
        <span
          className="text-xs text-slate-700 tabular-nums"
          title="Duración total del proyecto según CPM (camino crítico)"
        >
          Duración: <strong className="font-semibold">{totalDurationDays}d</strong>
        </span>
      )}
      {typeof criticalCount === 'number' && criticalCount > 0 && (
        <span
          className="text-xs text-red-700 tabular-nums"
          title="Actividades en el camino crítico (float = 0)"
        >
          <span className="inline-block w-2 h-2 rounded-full bg-red-600 mr-1 align-middle" />
          Críticas: <strong className="font-semibold">{criticalCount}</strong>
        </span>
      )}
      <span className="text-xs text-slate-500 tabular-nums">
        {rowCount} filas
      </span>
    </div>
  );
}
