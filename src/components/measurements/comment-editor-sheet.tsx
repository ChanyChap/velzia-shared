"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Trash2, AlertTriangle, XCircle, Info, CheckCircle } from "lucide-react";
import type { MeasurementComment } from "@/lib/types";
import { cn } from "@/lib/utils";

interface CommentEditorSheetProps {
  comment: MeasurementComment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (commentId: string, updates: Partial<MeasurementComment>) => void;
  onDelete: (commentId: string) => void;
}

const ICON_OPTIONS = [
  { value: "none", label: "Sin icono", icon: null },
  { value: "warning", label: "Aviso", icon: AlertTriangle, color: "text-amber-500" },
  { value: "danger", label: "Peligro", icon: XCircle, color: "text-red-500" },
  { value: "info", label: "Info", icon: Info, color: "text-blue-500" },
  { value: "check", label: "OK", icon: CheckCircle, color: "text-green-500" },
] as const;

const FONT_STYLE_OPTIONS = [
  { value: "normal", label: "Normal" },
  { value: "bold", label: "Negrita" },
  { value: "italic", label: "Cursiva" },
] as const;

const FONT_SIZE_OPTIONS = [
  { value: "small", label: "S" },
  { value: "medium", label: "M" },
  { value: "large", label: "L" },
] as const;

const COLOR_OPTIONS = [
  "#ffffff",
  "#fbbf24",
  "#ef4444",
  "#22c55e",
  "#60a5fa",
  "#f97316",
  "#a78bfa",
];

export function CommentEditorSheet({
  comment,
  open,
  onOpenChange,
  onSave,
  onDelete,
}: CommentEditorSheetProps) {
  const [text, setText] = useState("");
  const [icon, setIcon] = useState("none");
  const [fontStyle, setFontStyle] = useState("normal");
  const [fontSize, setFontSize] = useState("medium");
  const [color, setColor] = useState("#ffffff");

  useEffect(() => {
    if (comment) {
      setText(comment.text);
      setIcon(comment.icon);
      setFontStyle(comment.font_style);
      setFontSize(comment.font_size);
      setColor(comment.color);
    }
  }, [comment]);

  function handleSave() {
    if (!comment) return;
    onSave(comment.id, { text, icon, font_style: fontStyle, font_size: fontSize, color } as any);
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[70vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Editar comentario</SheetTitle>
        </SheetHeader>

        <div className="space-y-4 pt-4">
          {/* Text */}
          <div className="space-y-1.5">
            <Label>Texto</Label>
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Escribe una nota..."
              autoFocus
            />
          </div>

          {/* Icon */}
          <div className="space-y-1.5">
            <Label>Icono</Label>
            <div className="flex gap-1.5">
              {ICON_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setIcon(opt.value)}
                  className={cn(
                    "flex items-center gap-1 px-3 py-1.5 rounded-md border text-sm transition-colors",
                    icon === opt.value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-gray-200 hover:bg-gray-50"
                  )}
                >
                  {opt.icon && <opt.icon className={cn("h-4 w-4", opt.color)} />}
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Font style */}
          <div className="space-y-1.5">
            <Label>Estilo</Label>
            <div className="flex gap-1.5">
              {FONT_STYLE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setFontStyle(opt.value)}
                  className={cn(
                    "px-3 py-1.5 rounded-md border text-sm transition-colors",
                    opt.value === "bold" && "font-bold",
                    opt.value === "italic" && "italic",
                    fontStyle === opt.value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-gray-200 hover:bg-gray-50"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Font size */}
          <div className="space-y-1.5">
            <Label>Tamano</Label>
            <div className="flex gap-1.5">
              {FONT_SIZE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setFontSize(opt.value)}
                  className={cn(
                    "w-10 h-10 rounded-md border text-sm transition-colors flex items-center justify-center",
                    fontSize === opt.value
                      ? "border-primary bg-primary/10 text-primary font-semibold"
                      : "border-gray-200 hover:bg-gray-50"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Color */}
          <div className="space-y-1.5">
            <Label>Color del texto</Label>
            <div className="flex gap-2">
              {COLOR_OPTIONS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={cn(
                    "w-8 h-8 rounded-full border-2 transition-transform",
                    color === c ? "border-primary scale-110" : "border-gray-300"
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-2">
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => {
                if (comment) onDelete(comment.id);
                onOpenChange(false);
              }}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Eliminar
            </Button>
            <Button size="sm" onClick={handleSave}>
              Guardar
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
