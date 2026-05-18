"use client";

import { useState, useEffect } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "../ui/sheet";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Switch } from "../ui/switch";
import { useToast } from "../../hooks/use-toast";
import { Loader2 } from "lucide-react";
import { chatFetch } from "../../lib/chat-api-base";

interface ChatConfigPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface SlaConfig {
  sla_normal_minutes: number;
  sla_urgente_minutes: number;
  escalation_normal_minutes: number;
  escalation_urgente_minutes: number;
  notify_sender: boolean;
  notify_admins: boolean;
  sla_enabled: boolean;
}

const DEFAULT_CONFIG: SlaConfig = {
  sla_normal_minutes: 60,
  sla_urgente_minutes: 15,
  escalation_normal_minutes: 240,
  escalation_urgente_minutes: 60,
  notify_sender: true,
  notify_admins: true,
  sla_enabled: true,
};

export function ChatConfigPanel({ open, onOpenChange }: ChatConfigPanelProps) {
  const [config, setConfig] = useState<SlaConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!open) return;

    setLoading(true);
    chatFetch("/api/chat/sla")
      .then((res) => {
        if (!res.ok) throw new Error("Error al cargar configuración");
        return res.json();
      })
      .then((data) => {
        setConfig({ ...DEFAULT_CONFIG, ...data });
      })
      .catch(() => {
        // Use defaults on error
        setConfig(DEFAULT_CONFIG);
      })
      .finally(() => setLoading(false));
  }, [open]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await chatFetch("/api/chat/sla", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (!res.ok) throw new Error("Error al guardar");

      toast({
        title: "Configuración guardada",
        description: "Los ajustes de SLA se han actualizado correctamente.",
      });
      onOpenChange(false);
    } catch {
      toast({
        title: "Error",
        description: "No se pudo guardar la configuración",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const updateField = <K extends keyof SlaConfig>(
    key: K,
    value: SlaConfig[K]
  ) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[400px] sm:w-[440px]">
        <SheetHeader>
          <SheetTitle>Configuración del Chat</SheetTitle>
        </SheetHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="mt-6 space-y-6">
            {/* SLA Enabled */}
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium">SLA habilitado</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Activar seguimiento de tiempos de respuesta
                </p>
              </div>
              <Switch
                checked={config.sla_enabled}
                onCheckedChange={(v) => updateField("sla_enabled", v)}
              />
            </div>

            <div className="border-t pt-4">
              <h4 className="text-sm font-medium mb-3">
                Tiempos de respuesta (SLA)
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Mensajes normales (min)</Label>
                  <Input
                    type="number"
                    min={1}
                    value={config.sla_normal_minutes}
                    onChange={(e) =>
                      updateField(
                        "sla_normal_minutes",
                        parseInt(e.target.value) || 60
                      )
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Mensajes urgentes (min)</Label>
                  <Input
                    type="number"
                    min={1}
                    value={config.sla_urgente_minutes}
                    onChange={(e) =>
                      updateField(
                        "sla_urgente_minutes",
                        parseInt(e.target.value) || 15
                      )
                    }
                  />
                </div>
              </div>
            </div>

            <div className="border-t pt-4">
              <h4 className="text-sm font-medium mb-3">
                Escalación
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Normal (min)</Label>
                  <Input
                    type="number"
                    min={1}
                    value={config.escalation_normal_minutes}
                    onChange={(e) =>
                      updateField(
                        "escalation_normal_minutes",
                        parseInt(e.target.value) || 240
                      )
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Urgente (min)</Label>
                  <Input
                    type="number"
                    min={1}
                    value={config.escalation_urgente_minutes}
                    onChange={(e) =>
                      updateField(
                        "escalation_urgente_minutes",
                        parseInt(e.target.value) || 60
                      )
                    }
                  />
                </div>
              </div>
            </div>

            <div className="border-t pt-4 space-y-4">
              <h4 className="text-sm font-medium">Notificaciones</h4>
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs">Notificar al remitente</Label>
                  <p className="text-xs text-muted-foreground">
                    Cuando se supera el SLA
                  </p>
                </div>
                <Switch
                  checked={config.notify_sender}
                  onCheckedChange={(v) => updateField("notify_sender", v)}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs">Notificar a administradores</Label>
                  <p className="text-xs text-muted-foreground">
                    Cuando se supera el SLA
                  </p>
                </div>
                <Switch
                  checked={config.notify_admins}
                  onCheckedChange={(v) => updateField("notify_admins", v)}
                />
              </div>
            </div>

            <div className="border-t pt-4">
              <Button
                onClick={handleSave}
                disabled={saving}
                className="w-full"
              >
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Guardar configuración
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
