"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Bluetooth, Pencil, Trash2, Check, AlertTriangle, XCircle } from "lucide-react";
import type { MeasurementPoint, MeasurementValueSource, WallPosition, MeasurementValidationStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const WALL_POSITION_LABELS: Record<WallPosition, string> = {
  top: "Ancho superior",
  bottom: "Ancho inferior",
  left: "Alto izquierdo",
  right: "Alto derecho",
  diagonal_tl_br: "Diagonal ↘",
  diagonal_tr_bl: "Diagonal ↙",
  depth: "Profundidad",
};

const VALIDATION_CONFIG: Record<MeasurementValidationStatus, { label: string; icon: any; color: string }> = {
  pending: { label: "Pendiente", icon: null, color: "bg-gray-100 text-gray-600" },
  ok: { label: "OK", icon: Check, color: "bg-green-100 text-green-700" },
  warning: { label: "Aviso", icon: AlertTriangle, color: "bg-yellow-100 text-yellow-700" },
  error: { label: "Error", icon: XCircle, color: "bg-red-100 text-red-700" },
};

interface DimensionEditorSheetProps {
  point: MeasurementPoint | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (pointId: string, updates: Partial<MeasurementPoint>) => void;
  onDelete: (pointId: string) => void;
  bluetoothConnected?: boolean;
  lastBluetoothValue?: number | null;
}

export function DimensionEditorSheet({
  point,
  open,
  onOpenChange,
  onSave,
  onDelete,
  bluetoothConnected,
  lastBluetoothValue,
}: DimensionEditorSheetProps) {
  const [valueMm, setValueMm] = useState("");
  const [label, setLabel] = useState("");
  const [wallPosition, setWallPosition] = useState<WallPosition | "">("");
  const [valueSource, setValueSource] = useState<MeasurementValueSource>("manual");

  useEffect(() => {
    if (point && open) {
      setValueMm(point.value_mm !== null ? String(point.value_mm) : "");
      setLabel(point.label);
      setWallPosition(point.wall_position || "");
      setValueSource(point.value_source);
    }
  }, [point, open]);

  // Auto-fill from Bluetooth
  useEffect(() => {
    if (open && bluetoothConnected && lastBluetoothValue != null) {
      setValueMm(String(lastBluetoothValue));
      setValueSource("bluetooth");
    }
  }, [lastBluetoothValue, open, bluetoothConnected]);

  if (!point) return null;

  const validation = VALIDATION_CONFIG[point.validation_status];
  const ValidationIcon = validation.icon;

  function handleSave() {
    const numVal = valueMm ? parseFloat(valueMm) : null;
    onSave(point!.id, {
      value_mm: numVal,
      label,
      wall_position: wallPosition || null,
      value_source: valueSource,
    } as Partial<MeasurementPoint>);
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-auto max-h-[85vh] rounded-t-xl">
        <SheetHeader>
          <SheetTitle className="flex items-center justify-between">
            <span>Editar cota</span>
            <Badge className={cn("text-xs", validation.color)}>
              {ValidationIcon && <ValidationIcon className="h-3 w-3 mr-1" />}
              {validation.label}
            </Badge>
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-4 py-4">
          {/* Label */}
          <div className="space-y-2">
            <Label>Etiqueta</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>

          {/* Wall position */}
          <div className="space-y-2">
            <Label>Posicion</Label>
            <Select value={wallPosition} onValueChange={(v) => setWallPosition(v as WallPosition)}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar posicion" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(WALL_POSITION_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Value - large touch-friendly input */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              Valor (mm)
              {valueSource === "bluetooth" && (
                <Badge variant="outline" className="text-blue-600 border-blue-300">
                  <Bluetooth className="h-3 w-3 mr-1" />
                  BT
                </Badge>
              )}
              {valueSource === "manual" && (
                <Badge variant="outline" className="text-gray-600">
                  <Pencil className="h-3 w-3 mr-1" />
                  Manual
                </Badge>
              )}
            </Label>
            <Input
              type="number"
              inputMode="decimal"
              value={valueMm}
              onChange={(e) => {
                setValueMm(e.target.value);
                setValueSource("manual");
              }}
              className="text-3xl font-bold h-16 text-center"
              placeholder="0"
            />
          </div>

          {/* Validation message */}
          {point.validation_message && (
            <div className={cn(
              "p-3 rounded-lg text-sm",
              point.validation_status === "warning" && "bg-yellow-50 text-yellow-800",
              point.validation_status === "error" && "bg-red-50 text-red-800",
            )}>
              {point.validation_message}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                onDelete(point.id);
                onOpenChange(false);
              }}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Eliminar
            </Button>
            <Button className="flex-1" onClick={handleSave}>
              <Check className="h-4 w-4 mr-1" />
              Guardar
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
