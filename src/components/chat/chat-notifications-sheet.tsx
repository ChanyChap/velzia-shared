"use client";

import { useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MessageCircle, ArrowRight } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "../ui/sheet";
import { ChatTabs } from "./chat-tabs";

interface ChatNotificationsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Sheet flotante del header que monta las notificaciones de chat
// (menciones, proyecto, equipos) + WhatsApp clientes asignados. Reemplaza
// el viejo Link directo a /chat. El footer "Ver todas" navega a /chat con
// el tab actual para usuarios que quieren ver el listado completo en
// pantalla entera. La página /chat sigue existiendo y se comporta igual
// que antes — este Sheet la embebe vía ChatTabs.
export function ChatNotificationsSheet({
  open,
  onOpenChange,
}: ChatNotificationsSheetProps) {
  const router = useRouter();
  const search = useSearchParams();

  const handleViewAll = useCallback(() => {
    const tab = search.get("tab") || "unread";
    onOpenChange(false);
    router.push(`/chat?tab=${tab}`);
  }, [router, search, onOpenChange]);

  const handleClose = useCallback(() => onOpenChange(false), [onOpenChange]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="
          p-0 flex flex-col
          inset-y-0 right-0 h-full w-full max-w-full
          sm:inset-y-auto sm:top-auto sm:bottom-4 sm:right-4
          sm:h-[85vh] sm:max-h-[900px]
          sm:w-[640px] sm:max-w-[640px]
          sm:rounded-2xl sm:border sm:shadow-2xl
        "
      >
        <SheetHeader className="px-4 py-3 border-b shrink-0 pr-10">
          <div className="flex items-center gap-2.5 text-left">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <MessageCircle className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Notificaciones
              </div>
              <SheetTitle className="text-sm font-semibold truncate leading-tight">
                Chat y WhatsApp
              </SheetTitle>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 min-h-0 overflow-hidden">
          <ChatTabs defaultTab="unread" onClose={handleClose} />
        </div>

        <div className="shrink-0 border-t bg-muted/30 px-3 py-2 flex items-center justify-end">
          <button
            type="button"
            onClick={handleViewAll}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            Ver todas las notificaciones
            <ArrowRight className="h-3 w-3" />
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
