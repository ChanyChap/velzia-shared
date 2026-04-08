"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronDown, ChevronUp, AlertTriangle, XCircle, CheckCircle2, ShieldCheck } from "lucide-react";
import type { ValidationSummary } from "@/lib/measurement-validation";
import { cn } from "@/lib/utils";

interface ValidationPanelProps {
  validation: ValidationSummary | null;
  onRunValidation: () => void;
  loading?: boolean;
}

export function ValidationPanel({ validation, onRunValidation, loading }: ValidationPanelProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            className="flex items-center gap-2 p-0 h-auto hover:bg-transparent"
            onClick={() => setExpanded(!expanded)}
          >
            <ShieldCheck className="h-4 w-4" />
            <span className="font-medium text-sm">Validación</span>
            {validation && (
              <div className="flex gap-1.5">
                {validation.errors_count > 0 && (
                  <Badge variant="destructive" className="text-xs px-1.5">
                    {validation.errors_count} error{validation.errors_count > 1 ? "es" : ""}
                  </Badge>
                )}
                {validation.warnings_count > 0 && (
                  <Badge className="text-xs px-1.5 bg-yellow-100 text-yellow-700">
                    {validation.warnings_count} aviso{validation.warnings_count > 1 ? "s" : ""}
                  </Badge>
                )}
                {validation.errors_count === 0 && validation.warnings_count === 0 && (
                  <Badge className="text-xs px-1.5 bg-green-100 text-green-700">OK</Badge>
                )}
              </div>
            )}
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
          <Button size="sm" variant="outline" onClick={onRunValidation} disabled={loading}>
            {loading ? "Validando..." : "Validar"}
          </Button>
        </div>

        {expanded && validation && (
          <div className="mt-3 space-y-2">
            {/* Cross validations */}
            {validation.cross_results.map((r, i) => (
              <div
                key={i}
                className={cn(
                  "flex items-start gap-2 p-2 rounded text-sm",
                  r.status === "ok" && "bg-green-50",
                  r.status === "warning" && "bg-yellow-50",
                  r.status === "error" && "bg-red-50"
                )}
              >
                {r.status === "ok" && <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />}
                {r.status === "warning" && <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5 shrink-0" />}
                {r.status === "error" && <XCircle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />}
                <div>
                  <div className="font-medium">{r.rule}</div>
                  <div className="text-muted-foreground text-xs">{r.message}</div>
                </div>
              </div>
            ))}

            {/* Completeness */}
            <div className={cn(
              "p-2 rounded text-sm",
              validation.completeness.is_complete ? "bg-green-50" : "bg-gray-50"
            )}>
              <div className="font-medium">
                Completitud: {validation.completeness.points_with_value}/{validation.completeness.total_points} cotas con valor
              </div>
              {!validation.completeness.has_photos && (
                <div className="text-red-600 text-xs">Falta al menos 1 foto</div>
              )}
              {validation.completeness.missing_points.length > 0 && (
                <div className="text-yellow-600 text-xs">
                  Faltan: {validation.completeness.missing_points.join(", ")}
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
