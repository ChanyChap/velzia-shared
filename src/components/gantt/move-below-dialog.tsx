'use client';

// Diálogo "Poner debajo de…": buscador con todas las actividades del Gantt.
// Al elegir una, el componente padre mueve la actividad de origen JUSTO debajo
// de la elegida (reordena sort_order). Compartido por el Gantt de plantilla EDT
// y el de tareas del proyecto.

import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '../ui/dialog';
import {
  Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from '../ui/command';
import { normalizeText } from '../../lib/utils';

export interface MoveBelowItem {
  id: string;
  name: string;
}

interface MoveBelowDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  // Nombre de la actividad que se va a mover (para el título).
  movingName?: string;
  // Todas las actividades candidatas (se excluye la de origen automáticamente).
  items: MoveBelowItem[];
  excludeId?: string;
  onSelect: (targetId: string) => void;
}

export function MoveBelowDialog({
  open, onOpenChange, movingName, items, excludeId, onSelect,
}: MoveBelowDialogProps) {
  const candidates = items.filter(it => it.id !== excludeId);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Poner debajo de…</DialogTitle>
          <DialogDescription>
            {movingName
              ? <>Elige debajo de qué actividad quieres colocar <strong>{movingName}</strong>.</>
              : <>Elige debajo de qué actividad quieres colocar la actividad seleccionada.</>}
          </DialogDescription>
        </DialogHeader>
        <Command
          // Filtro insensible a acentos/mayúsculas (regla del proyecto).
          filter={(value, search) => (normalizeText(value).includes(normalizeText(search)) ? 1 : 0)}
        >
          <CommandInput placeholder="Buscar actividad…" autoFocus />
          <CommandList className="max-h-72">
            <CommandEmpty>No se encontró ninguna actividad.</CommandEmpty>
            <CommandGroup>
              {candidates.map(it => (
                <CommandItem
                  key={it.id}
                  value={`${it.name} ${it.id}`}
                  onSelect={() => { onSelect(it.id); onOpenChange(false); }}
                >
                  {it.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
