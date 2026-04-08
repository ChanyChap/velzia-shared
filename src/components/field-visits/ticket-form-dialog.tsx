"use client";

import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Shield, Wrench, TrendingUp, X, CalendarClock, ListChecks } from "lucide-react";
import { MediaUpload } from "./media-upload";
import type { FieldTicketCategory, FieldTicketMedia, FieldTicketPriority, TicketCommitmentMode } from "@/lib/types";

export interface TemplatePhase {
  name: string;
  sort_order: number;
  duration_days: number | null;
  duration_hours: number | null;
  is_milestone: boolean;
  is_anchor: boolean;
  is_system: boolean;
  phase_type: string | null;
  alert_days_before: number | null;
}

interface TicketDraft {
  category: FieldTicketCategory;
  title: string;
  description: string;
  priority: FieldTicketPriority;
  media: FieldTicketMedia[];
  notes: string;
  commitment_mode: TicketCommitmentMode | null;
  commitment_date: string;
  commitment_notes: string;
  selected_phases: TemplatePhase[];
}

interface TicketFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (ticket: TicketDraft) => void;
  initial?: Partial<TicketDraft>;
  ticketId?: string | null;
  uploadEndpoint?: string;
  availablePhases?: TemplatePhase[];
}

const CATEGORIES: { value: FieldTicketCategory; label: string; icon: any; color: string; bg: string }[] = [
  { value: "garantia", label: "Garantía", icon: Shield, color: "text-green-700", bg: "bg-green-50 border-green-200" },
  { value: "postventa", label: "Postventa", icon: Wrench, color: "text-orange-700", bg: "bg-orange-50 border-orange-200" },
  { value: "ampliacion", label: "Ampliación", icon: TrendingUp, color: "text-blue-700", bg: "bg-blue-50 border-blue-200" },
];

const PRIORITIES = [
  { value: "baja", label: "Baja", color: "bg-gray-100 border-gray-300" },
  { value: "media", label: "Media", color: "bg-yellow-50 border-yellow-300" },
  { value: "alta", label: "Alta", color: "bg-orange-50 border-orange-300" },
  { value: "urgente", label: "Urgente", color: "bg-red-50 border-red-300" },
];

export function TicketFormDialog({
  open, onOpenChange, onSave, initial, ticketId, uploadEndpoint, availablePhases = [],
}: TicketFormDialogProps) {
  const [category, setCategory] = useState<FieldTicketCategory>(initial?.category || "garantia");
  const [title, setTitle] = useState(initial?.title || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [priority, setPriority] = useState<FieldTicketPriority>(initial?.priority || "media");
  const [media, setMedia] = useState<FieldTicketMedia[]>(initial?.media || []);
  const [notes, setNotes] = useState(initial?.notes || "");
  const [commitmentMode, setCommitmentMode] = useState<TicketCommitmentMode | null>(initial?.commitment_mode || null);
  const [commitmentDate, setCommitmentDate] = useState(initial?.commitment_date || "");
  const [commitmentNotes, setCommitmentNotes] = useState(initial?.commitment_notes || "");
  const [selectedPhaseIndices, setSelectedPhaseIndices] = useState<Set<number>>(new Set());

  // Reset when initial changes (editing different ticket)
  useEffect(() => {
    if (open) {
      setCategory(initial?.category || "garantia");
      setTitle(initial?.title || "");
      setDescription(initial?.description || "");
      setPriority((initial?.priority as FieldTicketPriority) || "media");
      setMedia(initial?.media || []);
      setNotes(initial?.notes || "");
      setCommitmentMode(initial?.commitment_mode || null);
      setCommitmentDate(initial?.commitment_date || "");
      setCommitmentNotes(initial?.commitment_notes || "");
      // Restore selected phases from initial
      if (initial?.selected_phases && availablePhases.length > 0) {
        const indices = new Set<number>();
        for (const sp of initial.selected_phases) {
          const idx = availablePhases.findIndex((ap) => ap.name === sp.name);
          if (idx >= 0) indices.add(idx);
        }
        setSelectedPhaseIndices(indices);
      } else {
        setSelectedPhaseIndices(new Set());
      }
    }
  }, [open, initial, availablePhases]);

  function handleSave() {
    if (!title.trim()) return;
    const selected_phases = Array.from(selectedPhaseIndices)
      .map((idx) => availablePhases[idx])
      .filter(Boolean);
    onSave({
      category,
      title: title.trim(),
      description: description.trim(),
      priority,
      media,
      notes: notes.trim(),
      commitment_mode: commitmentMode,
      commitment_date: commitmentDate,
      commitment_notes: commitmentNotes.trim(),
      selected_phases,
    });
  }

  function handleMediaUploaded(item: FieldTicketMedia) {
    setMedia((prev) => [...prev, item]);
  }

  function handleRemoveMedia(index: number) {
    setMedia((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Full screen on mobile, normal dialog on desktop */}
      <DialogContent className="sm:max-w-lg max-h-[100dvh] sm:max-h-[90vh] h-[100dvh] sm:h-auto overflow-y-auto p-0 sm:p-6 gap-0 sm:gap-4 sm:rounded-lg rounded-none border-0 sm:border">
        {/* Mobile header */}
        <div className="sticky top-0 z-10 bg-background border-b sm:border-0 p-4 sm:p-0 flex items-center justify-between sm:block">
          <DialogHeader>
            <DialogTitle className="text-lg">
              {initial?.title ? "Editar ticket" : "Nuevo ticket"}
            </DialogTitle>
          </DialogHeader>
          <Button
            variant="ghost"
            size="icon"
            className="sm:hidden h-9 w-9"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="flex-1 space-y-5 p-4 sm:p-0 sm:py-2 overflow-y-auto">
          {/* Category selector — large tap targets */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Categoría *</Label>
            <div className="grid grid-cols-3 gap-2">
              {CATEGORIES.map((cat) => {
                const Icon = cat.icon;
                const isSelected = category === cat.value;
                return (
                  <button
                    key={cat.value}
                    type="button"
                    onClick={() => setCategory(cat.value)}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all active:scale-95 ${
                      isSelected
                        ? `${cat.bg} border-current ${cat.color} ring-2 ring-current/20`
                        : "border-muted bg-background hover:bg-muted/50"
                    }`}
                  >
                    <Icon className={`h-6 w-6 ${isSelected ? cat.color : "text-muted-foreground"}`} />
                    <span className={`text-xs font-medium ${isSelected ? cat.color : "text-muted-foreground"}`}>
                      {cat.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Priority — pill selector */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Prioridad</Label>
            <div className="flex gap-2">
              {PRIORITIES.map((p) => {
                const isSelected = priority === p.value;
                return (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setPriority(p.value as FieldTicketPriority)}
                    className={`flex-1 py-2.5 px-3 rounded-lg border text-xs font-medium transition-all active:scale-95 ${
                      isSelected
                        ? `${p.color} border-current ring-1 ring-current/30`
                        : "border-muted bg-background text-muted-foreground"
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Title */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Título *</Label>
            <Input
              placeholder="Ej: Puerta desalineada, Grieta en encimera..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-12 text-base rounded-xl"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Descripción</Label>
            <Textarea
              placeholder="Detalla la incidencia..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="text-base rounded-xl"
            />
          </div>

          {/* Media upload */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Fotos / Vídeos</Label>
            <MediaUpload
              media={media}
              onUploaded={handleMediaUploaded}
              onRemove={handleRemoveMedia}
              ticketId={ticketId}
              uploadEndpoint={uploadEndpoint}
            />
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Notas internas</Label>
            <Textarea
              placeholder="Notas para el equipo (no visible para el cliente)..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="text-base rounded-xl"
            />
          </div>

          {/* EDT Phases — only if availablePhases were passed */}
          {availablePhases.length > 0 && (
            <div className="space-y-3 border-t pt-4">
              <div className="flex items-center gap-2">
                <ListChecks className="h-4 w-4 text-muted-foreground" />
                <Label className="text-sm font-medium">Fases EDT afectadas</Label>
              </div>
              <div className="space-y-1.5">
                {availablePhases.map((phase, idx) => (
                  <label
                    key={idx}
                    className="flex items-center gap-3 p-2.5 rounded-lg border hover:bg-muted/30 cursor-pointer"
                  >
                    <Checkbox
                      checked={selectedPhaseIndices.has(idx)}
                      onCheckedChange={(checked) => {
                        setSelectedPhaseIndices((prev) => {
                          const next = new Set(prev);
                          if (checked) next.add(idx);
                          else next.delete(idx);
                          return next;
                        });
                      }}
                    />
                    <span className="text-sm">{phase.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Commitment section */}
          <div className="space-y-3 border-t pt-4">
            <div className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-muted-foreground" />
              <Label className="text-sm font-medium">Fecha comprometida</Label>
            </div>

            <div className="flex gap-2">
              {[
                { value: "fecha_concreta" as TicketCommitmentMode, label: "Fecha concreta" },
                { value: "fecha_para_dar_fechas" as TicketCommitmentMode, label: "Dar fecha después" },
              ].map((mode) => (
                <button
                  key={mode.value}
                  type="button"
                  onClick={() => setCommitmentMode(commitmentMode === mode.value ? null : mode.value)}
                  className={`flex-1 py-2.5 px-3 rounded-lg border text-xs font-medium transition-all active:scale-95 ${
                    commitmentMode === mode.value
                      ? "bg-primary/10 border-primary text-primary ring-1 ring-primary/30"
                      : "border-muted bg-background text-muted-foreground"
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>

            {commitmentMode && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">
                    {commitmentMode === "fecha_concreta"
                      ? "Fecha de subsanación"
                      : "Fecha para dar fecha definitiva"}
                  </Label>
                  <Input
                    type="date"
                    value={commitmentDate}
                    onChange={(e) => setCommitmentDate(e.target.value)}
                    className="h-12 text-base rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Notas del compromiso</Label>
                  <Textarea
                    placeholder="Detalles sobre el compromiso..."
                    value={commitmentNotes}
                    onChange={(e) => setCommitmentNotes(e.target.value)}
                    rows={2}
                    className="text-base rounded-xl"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Sticky bottom actions */}
        <div className="sticky bottom-0 bg-background border-t p-4 sm:p-0 sm:border-0 sm:pt-2 flex gap-3">
          <Button
            variant="outline"
            className="flex-1 h-12 rounded-xl sm:hidden"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button
            variant="outline"
            className="hidden sm:inline-flex"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button
            className="flex-1 h-12 rounded-xl sm:h-10 sm:rounded-md"
            onClick={handleSave}
            disabled={!title.trim()}
          >
            {initial?.title ? "Guardar cambios" : "Añadir ticket"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
