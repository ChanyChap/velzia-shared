"use client";

import { useEffect, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { FileText } from "lucide-react";
import type { MeasurementTemplate } from "@/lib/types";

interface TemplateSelectorProps {
  productTypeId?: string | null;
  value?: string;
  onChange: (template: MeasurementTemplate | null) => void;
}

export function TemplateSelector({ productTypeId, value, onChange }: TemplateSelectorProps) {
  const [templates, setTemplates] = useState<MeasurementTemplate[]>([]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (productTypeId) params.set("product_type_id", productTypeId);
    fetch(`/api/measurement-templates?${params}`)
      .then((r) => r.json())
      .then((data) => setTemplates(Array.isArray(data) ? data : []))
      .catch(() => setTemplates([]));
  }, [productTypeId]);

  if (templates.length === 0) return null;

  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-1">
        <FileText className="h-3.5 w-3.5" />
        Plantilla de medición
      </Label>
      <Select
        value={value || "none"}
        onValueChange={(v) => {
          if (v === "none") {
            onChange(null);
          } else {
            const tpl = templates.find((t) => t.id === v);
            onChange(tpl || null);
          }
        }}
      >
        <SelectTrigger>
          <SelectValue placeholder="Sin plantilla" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Sin plantilla</SelectItem>
          {templates.map((t) => (
            <SelectItem key={t.id} value={t.id}>
              {t.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
