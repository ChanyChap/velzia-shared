'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Trash2, GitBranch } from 'lucide-react';
import type { DependencyType, GanttDependency } from './types';

interface DepEditModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  dep: GanttDependency | null;
  fromName: string;
  toName: string;
  canEdit: boolean;
  onSave: (updates: { type: DependencyType; lagDays: number }) => Promise<void>;
  onDelete: () => Promise<void>;
}

const TYPE_LABELS: Record<DependencyType, string> = {
  FS: 'FS — Fin → Inicio (clásica)',
  SS: 'SS — Inicio → Inicio',
  FF: 'FF — Fin → Fin',
  SF: 'SF — Inicio → Fin (rara)',
};

export function DepEditModal({
  open,
  onOpenChange,
  dep,
  fromName,
  toName,
  canEdit,
  onSave,
  onDelete,
}: DepEditModalProps) {
  const [type, setType] = useState<DependencyType>('FS');
  const [lagStr, setLagStr] = useState('0');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!dep) return;
    setType(dep.type);
    setLagStr(String(dep.lagDays));
  }, [dep]);

  if (!dep) return null;

  const handleSave = async () => {
    const lag = parseFloat(lagStr.replace(',', '.'));
    if (!Number.isFinite(lag)) return;
    setSaving(true);
    try {
      await onSave({ type, lagDays: Math.round(lag) });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`¿Borrar la dependencia entre "${fromName}" → "${toName}"?`)) return;
    setSaving(true);
    try {
      await onDelete();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-primary" />
            Dependencia entre actividades
          </DialogTitle>
          <DialogDescription>
            <strong>{fromName}</strong> → <strong>{toName}</strong>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1">
              Tipo de dependencia
            </label>
            <Select value={type} onValueChange={v => setType(v as DependencyType)} disabled={!canEdit || saving}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(TYPE_LABELS) as DependencyType[]).map(k => (
                  <SelectItem key={k} value={k}>
                    {TYPE_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1">
              Lag (días)
              <span className="font-normal text-slate-500 ml-1">
                — positivo = retrasa la sucesora; negativo = la solapa
              </span>
            </label>
            <Input
              type="number"
              value={lagStr}
              onChange={e => setLagStr(e.target.value)}
              disabled={!canEdit || saving}
            />
          </div>
        </div>
        <DialogFooter className="flex items-center sm:justify-between gap-2">
          {canEdit && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDelete}
              disabled={saving}
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Borrar
            </Button>
          )}
          <div className="flex gap-2 ml-auto">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={!canEdit || saving}>
              {saving ? 'Guardando…' : 'Guardar'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
