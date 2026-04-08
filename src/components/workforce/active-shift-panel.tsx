"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, MapPin, Building2 } from "lucide-react";
import type { Shift } from "@/lib/types";

interface ActiveShiftPanelProps {
  shift: Shift;
}

export function ActiveShiftPanel({ shift }: ActiveShiftPanelProps) {
  const clockIn = new Date(shift.clock_in);
  const now = new Date();
  const elapsedMs = now.getTime() - clockIn.getTime();
  const elapsedHours = Math.floor(elapsedMs / 3600000);
  const elapsedMinutes = Math.floor((elapsedMs % 3600000) / 60000);

  return (
    <Card className="border-green-200 bg-green-50/50">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Turno activo</CardTitle>
          <Badge variant="outline" className="bg-green-100 text-green-700 border-green-300">
            En curso
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-center gap-2 text-sm">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <span>Entrada: {clockIn.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}</span>
          <span className="text-muted-foreground">|</span>
          <span className="font-medium">{elapsedHours}h {elapsedMinutes}m</span>
        </div>
        {shift.work_center && (
          <div className="flex items-center gap-2 text-sm">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <span>{shift.work_center.name}</span>
          </div>
        )}
        {shift.clock_in_lat && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <MapPin className="h-4 w-4" />
            <span>GPS registrado</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
