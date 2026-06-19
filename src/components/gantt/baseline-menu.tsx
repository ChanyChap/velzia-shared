'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel } from '../ui/dropdown-menu';
import { GitCompare, Plus, Trash2, Eye, EyeOff, Layers, X } from 'lucide-react';
import { useToast } from '../../hooks/use-toast';
import type { BaselineSummary, BaselineSnapshot } from './use-baselines';

interface BaselineMenuProps {
  baselines: BaselineSummary[];
  shownBaselineId: string | null;
  onSetShown: (id: string | null) => void;
  onCreate: (input: { name: string; notes?: string; snapshot: BaselineSnapshot; totalDurationDays: number }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  canEdit: boolean;
  buildSnapshot: () => { snapshot: BaselineSnapshot; totalDurationDays: number };
  // Sustantivo del ámbito ("plantilla" por defecto, "proyecto" en el Gantt de
  // proyecto) para que los textos del menú sean autoexplicativos.
  scopeNoun?: string;
}

export function BaselineMenu({
  baselines,
  shownBaselineId,
  onSetShown,
  onCreate,
  onDelete,
  canEdit,
  buildSnapshot,
  scopeNoun = 'plantilla',
}: BaselineMenuProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (name.trim().length === 0) {
      toast({ title: 'Pon un nombre a la línea base', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const { snapshot, totalDurationDays } = buildSnapshot();
      await onCreate({ name: name.trim(), notes: notes.trim() || undefined, snapshot, totalDurationDays });
      toast({ title: 'Línea base guardada' });
      setName('');
      setNotes('');
      setCreateOpen(false);
    } catch (e) {
      toast({ title: 'No se pudo guardar', description: e instanceof Error ? e.message : '', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, n: string) => {
    if (!window.confirm(`¿Borrar la línea base "${n}"? Esta acción no se puede deshacer.`)) return;
    try {
      await onDelete(id);
      toast({ title: 'Línea base borrada' });
    } catch (e) {
      toast({ title: 'No se pudo borrar', description: e instanceof Error ? e.message : '', variant: 'destructive' });
    }
  };

  const shown = baselines.find(b => b.id === shownBaselineId);

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-7 gap-1.5">
            <Layers className="h-3.5 w-3.5" />
            Líneas base
            {baselines.length > 0 && (
              <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-slate-200 text-slate-700 text-[10px] font-semibold">
                {baselines.length}
              </span>
            )}
            {shown && (
              <span
                className="inline-flex items-center gap-0.5 ml-0.5 text-[10px] text-emerald-700"
                title={`Comparando con: ${shown.name}`}
              >
                <Eye className="h-3 w-3" />
              </span>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80">
          <DropdownMenuLabel className="flex items-center justify-between">
            <span>Líneas base de est{scopeNoun === 'proyecto' ? 'e' : 'a'} {scopeNoun}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {baselines.length === 0 ? (
            <div className="px-3 py-4 text-xs text-slate-500">
              Sin líneas base todavía. Guarda una para poder comparar después.
            </div>
          ) : (
            <div className="max-h-72 overflow-auto">
              {baselines.map(b => {
                const isShown = b.id === shownBaselineId;
                return (
                  <div
                    key={b.id}
                    className={`group flex items-start gap-2 px-2 py-2 border-b last:border-b-0 ${
                      isShown ? 'bg-emerald-50' : ''
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onSetShown(isShown ? null : b.id)}
                      className="flex-1 text-left"
                    >
                      <div className="text-sm font-medium text-slate-800 flex items-center gap-1.5">
                        {isShown ? (
                          <Eye className="h-3.5 w-3.5 text-emerald-600" />
                        ) : (
                          <EyeOff className="h-3.5 w-3.5 text-slate-400" />
                        )}
                        {b.name}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
                        {format(new Date(b.created_at), "d 'de' MMM yyyy 'a las' HH:mm", { locale: es })}
                        {' · '}
                        {b.total_duration_days}d totales
                      </div>
                      {b.notes && (
                        <div className="text-[11px] text-slate-600 mt-1 italic line-clamp-2">{b.notes}</div>
                      )}
                    </button>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => handleDelete(b.id, b.name)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-slate-400 hover:text-red-600"
                        title="Borrar línea base"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <DropdownMenuSeparator />
          {shownBaselineId && (
            <DropdownMenuItem onClick={() => onSetShown(null)} className="text-xs">
              <X className="h-3.5 w-3.5 mr-2" />
              Dejar de comparar
            </DropdownMenuItem>
          )}
          {canEdit && (
            <DropdownMenuItem
              onClick={() => {
                setOpen(false);
                setCreateOpen(true);
              }}
              className="text-xs"
            >
              <Plus className="h-3.5 w-3.5 mr-2" />
              Guardar planificación actual como línea base
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitCompare className="h-5 w-5 text-primary" />
              Guardar línea base
            </DialogTitle>
            <DialogDescription>
              Una línea base es una fotografía de la planificación actual (actividades, duraciones y dependencias).
              Luego podrás compararla visualmente con cómo evolucione {scopeNoun === 'proyecto' ? 'el proyecto' : 'la plantilla'}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">
                Nombre de la línea base
              </label>
              <Input
                placeholder='Ej: "Planificación inicial firma contrato"'
                value={name}
                onChange={e => setName(e.target.value)}
                disabled={saving}
                autoFocus
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">
                Notas <span className="font-normal text-slate-500">(opcional)</span>
              </label>
              <Textarea
                placeholder="Contexto: por qué guardas esta versión, qué cambió desde la última…"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                disabled={saving}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={saving || name.trim().length === 0}>
              {saving ? 'Guardando…' : 'Guardar línea base'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
