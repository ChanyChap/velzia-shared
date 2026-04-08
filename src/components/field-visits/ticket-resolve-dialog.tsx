"use client";

import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { X, CheckCircle2, Shield, Wrench, TrendingUp } from "lucide-react";
import { SignatureCanvas } from "./signature-canvas";
import type { FieldTicket, FieldTicketCategory } from "@/lib/types";

const CATEGORY_CONFIG: Record<FieldTicketCategory, { label: string; icon: any; color: string; bg: string }> = {
  garantia: { label: "Garantía", icon: Shield, color: "text-green-700", bg: "bg-green-100" },
  postventa: { label: "Postventa", icon: Wrench, color: "text-orange-700", bg: "bg-orange-100" },
  ampliacion: { label: "Ampliación", icon: TrendingUp, color: "text-blue-700", bg: "bg-blue-100" },
};

interface TicketResolveDialogProps {
  ticket: FieldTicket | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onResolve: (data: { resolution_notes: string; signature_data: string }) => void;
}

export function TicketResolveDialog({ ticket, open, onOpenChange, onResolve }: TicketResolveDialogProps) {
  const [notes, setNotes] = useState("");
  const [signatureData, setSignatureData] = useState<string | null>(null);

  if (!ticket) return null;

  const cat = CATEGORY_CONFIG[ticket.category];

  function handleResolve() {
    if (!signatureData) return;
    onResolve({ resolution_notes: notes.trim(), signature_data: signatureData });
    setNotes("");
    setSignatureData(null);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[100dvh] sm:max-h-[90vh] h-[100dvh] sm:h-auto overflow-y-auto p-0 sm:p-6 gap-0 sm:gap-4 sm:rounded-lg rounded-none border-0 sm:border">
        <div className="sticky top-0 z-10 bg-background border-b sm:border-0 p-4 sm:p-0 flex items-center justify-between sm:block">
          <DialogHeader>
            <DialogTitle className="text-lg">Resolver ticket</DialogTitle>
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
          {/* Ticket summary */}
          <div className="bg-muted/50 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Badge className={`${cat.bg} ${cat.color} text-xs`} variant="secondary">
                {cat.label}
              </Badge>
            </div>
            <h3 className="font-medium">{ticket.title}</h3>
            {ticket.description && (
              <p className="text-sm text-muted-foreground mt-1">{ticket.description}</p>
            )}
          </div>

          {/* Resolution notes */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Notas de resolución</Label>
            <Textarea
              placeholder="Describe cómo se resolvió la incidencia..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="text-base rounded-xl"
            />
          </div>

          {/* Signature */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Firma del cliente</Label>
            <SignatureCanvas onSignatureChange={setSignatureData} />
          </div>
        </div>

        {/* Actions */}
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
            className="flex-1 h-12 rounded-xl sm:h-10 sm:rounded-md bg-emerald-600 hover:bg-emerald-700"
            onClick={handleResolve}
            disabled={!signatureData}
          >
            <CheckCircle2 className="h-4 w-4 mr-2" />
            Resolver ticket
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
