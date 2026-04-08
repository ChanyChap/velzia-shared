"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Image, Video, Trash2, Edit2, Wrench, Shield, TrendingUp, CalendarClock } from "lucide-react";
import { formatDate } from "@/lib/utils";
import type { FieldTicket, FieldTicketCategory } from "@/lib/types";

const CATEGORY_CONFIG: Record<FieldTicketCategory, { label: string; icon: any; color: string; bg: string }> = {
  garantia: { label: "Garantía", icon: Shield, color: "text-green-700", bg: "bg-green-100" },
  postventa: { label: "Postventa", icon: Wrench, color: "text-orange-700", bg: "bg-orange-100" },
  ampliacion: { label: "Ampliación", icon: TrendingUp, color: "text-blue-700", bg: "bg-blue-100" },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  baja: { label: "Baja", color: "bg-gray-100 text-gray-700" },
  media: { label: "Media", color: "bg-yellow-100 text-yellow-700" },
  alta: { label: "Alta", color: "bg-orange-100 text-orange-700" },
  urgente: { label: "Urgente", color: "bg-red-100 text-red-700" },
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pendiente: { label: "Pendiente", color: "bg-gray-100 text-gray-700" },
  en_revision: { label: "En revisión", color: "bg-blue-100 text-blue-700" },
  aprobado: { label: "Aprobado", color: "bg-green-100 text-green-700" },
  of_generada: { label: "OF Generada", color: "bg-purple-100 text-purple-700" },
  descartada: { label: "Descartada", color: "bg-red-100 text-red-700" },
  resuelta: { label: "Resuelta", color: "bg-emerald-100 text-emerald-700" },
};

interface TicketCardProps {
  ticket: FieldTicket;
  onEdit?: (ticket: FieldTicket) => void;
  onDelete?: (ticketId: string) => void;
  compact?: boolean;
}

export function TicketCard({ ticket, onEdit, onDelete, compact }: TicketCardProps) {
  const cat = CATEGORY_CONFIG[ticket.category];
  const pri = PRIORITY_CONFIG[ticket.priority];
  const status = STATUS_CONFIG[ticket.status];
  const CatIcon = cat.icon;

  const imageCount = ticket.media?.filter((m) => m.type === "image").length || 0;
  const videoCount = ticket.media?.filter((m) => m.type === "video").length || 0;

  return (
    <Card className="overflow-hidden rounded-xl">
      <CardContent className={compact ? "p-3" : "p-4"}>
        <div className="flex items-start gap-3">
          {/* Category icon — larger touch target */}
          <div className={`p-2.5 rounded-xl ${cat.bg} flex-shrink-0`}>
            <CatIcon className={`h-5 w-5 ${cat.color}`} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <Badge className={`${cat.bg} ${cat.color} text-xs`} variant="secondary">
                {cat.label}
              </Badge>
              <Badge className={`${pri.color} text-xs`} variant="secondary">
                {pri.label}
              </Badge>
              {status && (
                <Badge className={`${status.color} text-xs`} variant="secondary">
                  {status.label}
                </Badge>
              )}
            </div>

            <h4 className="font-medium text-sm mt-2">{ticket.title}</h4>

            {!compact && ticket.description && (
              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                {ticket.description}
              </p>
            )}

            {(imageCount > 0 || videoCount > 0) && (
              <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                {imageCount > 0 && (
                  <span className="flex items-center gap-1">
                    <Image className="h-3.5 w-3.5" />
                    {imageCount} foto{imageCount !== 1 ? "s" : ""}
                  </span>
                )}
                {videoCount > 0 && (
                  <span className="flex items-center gap-1">
                    <Video className="h-3.5 w-3.5" />
                    {videoCount} vídeo{videoCount !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
            )}

            {/* Commitment date */}
            {ticket.commitment_date && (
              <div className={`flex items-center gap-1.5 mt-2 text-xs font-medium ${
                new Date(ticket.commitment_date) < new Date() && ticket.status !== "resuelta"
                  ? "text-red-600"
                  : "text-muted-foreground"
              }`}>
                <CalendarClock className="h-3.5 w-3.5" />
                <span>
                  {ticket.commitment_mode === "fecha_para_dar_fechas" ? "Dar fecha: " : "Subsanar: "}
                  {formatDate(ticket.commitment_date)}
                </span>
                {new Date(ticket.commitment_date) < new Date() && ticket.status !== "resuelta" && (
                  <Badge className="bg-red-100 text-red-700 text-[10px] px-1 py-0" variant="secondary">Vencido</Badge>
                )}
              </div>
            )}

            {/* Media preview thumbnails — larger on mobile */}
            {!compact && ticket.media && ticket.media.length > 0 && (
              <div className="flex gap-2 mt-2 overflow-x-auto pb-1">
                {ticket.media.filter((m) => m.type === "image").slice(0, 4).map((m, idx) => (
                  <img
                    key={idx}
                    src={m.url}
                    alt={m.filename}
                    className="h-20 w-20 md:h-16 md:w-16 object-cover rounded-lg border flex-shrink-0"
                  />
                ))}
              </div>
            )}
          </div>

          {/* Action buttons — minimum 44px touch targets */}
          {(onEdit || onDelete) && (
            <div className="flex flex-col gap-1 flex-shrink-0">
              {onEdit && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 rounded-lg"
                  onClick={() => onEdit(ticket)}
                >
                  <Edit2 className="h-4 w-4" />
                </Button>
              )}
              {onDelete && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 rounded-lg text-red-500"
                  onClick={() => onDelete(ticket.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
