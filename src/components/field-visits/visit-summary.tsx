"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, Wrench, TrendingUp, Calendar, MapPin, FileText, User, CalendarClock } from "lucide-react";
import { formatDate } from "@/lib/utils";
import type { FieldTicket, FieldTicketCategory } from "@/lib/types";

const CATEGORY_CONFIG: Record<FieldTicketCategory, { label: string; icon: any; color: string; bg: string }> = {
  garantia: { label: "Garantía", icon: Shield, color: "text-green-700", bg: "bg-green-100" },
  postventa: { label: "Postventa", icon: Wrench, color: "text-orange-700", bg: "bg-orange-100" },
  ampliacion: { label: "Ampliación", icon: TrendingUp, color: "text-blue-700", bg: "bg-blue-100" },
};

interface VisitSummaryProps {
  visitNumber: string;
  visitDate: string;
  projectName: string;
  locationAddress?: string | null;
  visitedByName?: string | null;
  tickets: FieldTicket[];
  summary?: string | null;
  conclusions?: string | null;
}

export function VisitSummary({
  visitNumber, visitDate, projectName, locationAddress,
  visitedByName, tickets, summary, conclusions,
}: VisitSummaryProps) {
  return (
    <div className="space-y-4">
      {/* Visit header info */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Resumen del parte de trabajo</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-muted-foreground flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5" /> Número
              </dt>
              <dd className="font-mono font-medium">{visitNumber}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" /> Fecha
              </dt>
              <dd className="font-medium">{formatDate(visitDate)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Proyecto</dt>
              <dd className="font-medium">{projectName}</dd>
            </div>
            {locationAddress && (
              <div>
                <dt className="text-muted-foreground flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" /> Dirección
                </dt>
                <dd className="font-medium">{locationAddress}</dd>
              </div>
            )}
            {visitedByName && (
              <div>
                <dt className="text-muted-foreground flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5" /> Técnico
                </dt>
                <dd className="font-medium">{visitedByName}</dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>

      {/* AI Summary */}
      {(summary || conclusions) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Acta de la visita</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {summary && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Resumen</p>
                <p className="text-sm">{summary}</p>
              </div>
            )}
            {conclusions && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Conclusiones</p>
                <p className="text-sm whitespace-pre-wrap">{conclusions}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Compromisos */}
      {tickets.some((t) => t.commitment_date) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarClock className="h-4 w-4" />
              Compromisos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {tickets
                .filter((t) => t.commitment_date)
                .map((ticket, idx) => {
                  const cat = CATEGORY_CONFIG[ticket.category];
                  return (
                    <div key={ticket.id || idx} className="flex items-center gap-3 text-sm">
                      <Badge className={`${cat.bg} ${cat.color} text-xs`} variant="secondary">
                        {cat.label}
                      </Badge>
                      <span className="flex-1 truncate">{ticket.title}</span>
                      <span className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                        {ticket.commitment_mode === "fecha_para_dar_fechas" ? "Dar fecha: " : ""}
                        {formatDate(ticket.commitment_date!)}
                      </span>
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tickets */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Tickets ({tickets.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {tickets.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No hay tickets registrados
            </p>
          ) : (
            <div className="divide-y">
              {tickets.map((ticket, idx) => {
                const cat = CATEGORY_CONFIG[ticket.category];
                const CatIcon = cat.icon;
                return (
                  <div key={ticket.id || idx} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex items-start gap-3">
                      <div className={`p-1.5 rounded ${cat.bg} flex-shrink-0`}>
                        <CatIcon className={`h-3.5 w-3.5 ${cat.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Badge className={`${cat.bg} ${cat.color} text-xs`} variant="secondary">
                            {cat.label}
                          </Badge>
                          <span className="text-sm font-medium truncate">{ticket.title}</span>
                        </div>
                        {ticket.description && (
                          <p className="text-xs text-muted-foreground mt-1">{ticket.description}</p>
                        )}
                        {ticket.media && ticket.media.length > 0 && (
                          <div className="flex gap-1.5 mt-2">
                            {ticket.media.filter((m) => m.type === "image").slice(0, 3).map((m, mIdx) => (
                              <img
                                key={mIdx}
                                src={m.url}
                                alt={m.filename}
                                className="h-12 w-12 object-cover rounded border"
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
