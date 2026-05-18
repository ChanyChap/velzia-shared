"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Loader2 } from "lucide-react";

interface ChatCreateTaskModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTitle: string;
  onCreateTask: (data: {
    title: string;
    due_date: string;
    priority: string;
  }) => Promise<void>;
}

export function ChatCreateTaskModal({
  open,
  onOpenChange,
  defaultTitle,
  onCreateTask,
}: ChatCreateTaskModalProps) {
  const [title, setTitle] = useState(defaultTitle);
  const [dueDate, setDueDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [priority, setPriority] = useState("media");
  const [saving, setSaving] = useState(false);

  // Reset form when opening with new default
  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      setTitle(defaultTitle);
      setDueDate(new Date().toISOString().split("T")[0]);
      setPriority("media");
    }
    onOpenChange(isOpen);
  };

  const handleSubmit = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await onCreateTask({
        title: title.trim(),
        due_date: dueDate,
        priority,
      });
      onOpenChange(false);
    } catch {
      // Error handled by parent
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="text-base">
            Guardar como tarea
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 pt-1">
          <div>
            <Label htmlFor="task-title" className="text-xs text-muted-foreground">
              Titulo de la tarea
            </Label>
            <Input
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Descripcion de la tarea"
              className="mt-1"
              autoFocus
            />
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <Label htmlFor="task-date" className="text-xs text-muted-foreground">
                Fecha limite
              </Label>
              <Input
                id="task-date"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="mt-1"
              />
            </div>
            <div className="flex-1">
              <Label className="text-xs text-muted-foreground">
                Prioridad
              </Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="baja">Baja</SelectItem>
                  <SelectItem value="media">Media</SelectItem>
                  <SelectItem value="alta">Alta</SelectItem>
                  <SelectItem value="urgente">Urgente</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={saving || !title.trim()}
            >
              {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Guardar tarea
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
