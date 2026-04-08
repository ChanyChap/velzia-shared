"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle2, AlertTriangle, XCircle, Clock } from "lucide-react";
import type { MeasurementSession, MeasurementPoint, MeasurementValidationStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const STATUS_ICONS: Record<MeasurementValidationStatus, { icon: any; color: string }> = {
  pending: { icon: Clock, color: "text-gray-400" },
  ok: { icon: CheckCircle2, color: "text-green-500" },
  warning: { icon: AlertTriangle, color: "text-yellow-500" },
  error: { icon: XCircle, color: "text-red-500" },
};

const SOURCE_LABELS: Record<string, string> = {
  manual: "Manual",
  bluetooth: "Bluetooth",
  ai_estimated: "IA",
};

interface MeasurementSummaryProps {
  session: MeasurementSession;
}

export function MeasurementSummary({ session }: MeasurementSummaryProps) {
  // Flatten all points from all photos
  const allPoints: MeasurementPoint[] = (session.photos || []).flatMap(
    (p) => p.points || []
  );

  return (
    <div className="space-y-4">
      {/* Session info */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Resumen de medición</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-1">
          <div><strong>Sesión:</strong> {session.session_number}</div>
          <div><strong>Fecha:</strong> {new Date(session.measurement_date).toLocaleDateString("es-ES")}</div>
          {session.room_name && <div><strong>Habitación:</strong> {session.room_name}</div>}
          {session.location_address && <div><strong>Dirección:</strong> {session.location_address}</div>}
          {session.temperature_celsius != null && (
            <div><strong>Temperatura:</strong> {session.temperature_celsius}°C</div>
          )}
          {session.humidity_percent != null && (
            <div><strong>Humedad:</strong> {session.humidity_percent}%</div>
          )}
          <div><strong>Fotos:</strong> {session.photos?.length || 0}</div>
          <div><strong>Cotas:</strong> {allPoints.length}</div>
        </CardContent>
      </Card>

      {/* Photos thumbnails */}
      {session.photos && session.photos.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Fotos ({session.photos.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-2">
              {session.photos.map((photo) => (
                <div key={photo.id} className="relative aspect-video rounded overflow-hidden bg-gray-100">
                  <img
                    src={photo.url}
                    alt={photo.filename}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute bottom-1 right-1">
                    <Badge variant="secondary" className="text-[10px] px-1">
                      {photo.points?.length || 0} cotas
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Measurements table */}
      {allPoints.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Tabla de mediciones</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cota</TableHead>
                  <TableHead className="text-right">Valor (mm)</TableHead>
                  <TableHead>Fuente</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allPoints.map((point) => {
                  const statusConf = STATUS_ICONS[point.validation_status];
                  const StatusIcon = statusConf.icon;
                  return (
                    <TableRow key={point.id}>
                      <TableCell className="font-medium text-sm">{point.label}</TableCell>
                      <TableCell className="text-right font-mono">
                        {point.value_mm !== null ? point.value_mm : "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {SOURCE_LABELS[point.value_source] || point.value_source}
                      </TableCell>
                      <TableCell>
                        <StatusIcon className={cn("h-4 w-4", statusConf.color)} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
