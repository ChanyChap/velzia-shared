"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { useChatUnreadDigest } from "../../hooks/use-chat-unread-count";
import { cn } from "../../lib/utils";
import { ChatNotificationsSheet } from "./chat-notifications-sheet";

interface ChatBubbleButtonProps {
  className?: string;
  // 'header' (compacto, dentro del topbar) | 'fab' (botón circular grande)
  variant?: "header" | "fab";
}

// Burbuja del header que abre un Sheet flotante con las notificaciones de
// chat (proyecto, equipos, menciones) y WhatsApp clientes asignados al
// usuario. El badge suma menciones de team_chat_mentions (no respondidas)
// más wa_conversations.unread_count de las conversaciones asignadas al
// usuario. Si hay alguna mención con SLA superado el badge parpadea.
//
// La variante 'fab' (móvil, embed) mantiene Link directo a /chat porque no
// puede montar el Sheet por sí misma.
export function ChatBubbleButton({
  className,
  variant = "header",
}: ChatBubbleButtonProps) {
  const { count, slaBreached, whatsappCount, mentionsCount } = useChatUnreadDigest();
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  const ariaLabel = `Abrir notificaciones de chat (${count} pendientes${
    whatsappCount > 0 ? `, ${whatsappCount} de WhatsApp` : ""
  }${slaBreached ? ", una con SLA superado" : ""})`;

  // Auto-apertura del sheet al abrir RefoTask cuando el usuario tiene
  // mensajes "Sin responder por mí". Solo en la variante 'header' (la del
  // dashboard) y solo UNA vez por sesión de navegador para no ser ruidoso.
  // Si el usuario ya está dentro del sheet o en /chat, no lo reabrimos.
  // Petición de Chany 18 may 2026: que la modal salte en cuanto abre la app
  // si tiene mensajes pendientes de responder.
  useEffect(() => {
    if (variant !== "header") return;
    if (mentionsCount <= 0) return;
    if (typeof window === "undefined") return;
    const FLAG = "rt:auto-opened-unread-sheet";
    if (window.sessionStorage.getItem(FLAG) === "1") return;
    if (pathname?.startsWith("/chat")) return;
    window.sessionStorage.setItem(FLAG, "1");
    // Forzamos tab=unread en la URL antes de abrir para que ChatTabs lo
    // lea del search param y caiga directamente en "Sin responder por mí".
    const params = new URLSearchParams(search?.toString() || "");
    if (params.get("tab") !== "unread") {
      params.set("tab", "unread");
      router.replace(`${pathname || ""}?${params.toString()}`, { scroll: false });
    }
    setOpen(true);
  }, [variant, mentionsCount, pathname, search, router]);

  if (variant === "fab") {
    return (
      <Link
        href="/chat"
        aria-label={ariaLabel}
        className={cn(
          "fixed bottom-6 right-6 z-40 grid place-items-center w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-colors",
          className
        )}
      >
        <MessageCircle className="h-6 w-6" />
        {count > 0 && (
          <span
            className={cn(
              "absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold leading-none grid place-items-center",
              slaBreached && "animate-pulse ring-2 ring-red-300"
            )}
          >
            {count > 99 ? "99+" : count}
          </span>
        )}
      </Link>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={ariaLabel}
        className={cn(
          "relative inline-grid place-items-center h-9 w-9 rounded-full hover:bg-accent transition-colors text-foreground",
          className
        )}
      >
        <MessageCircle className="h-5 w-5" />
        {count > 0 && (
          <span
            className={cn(
              "absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full text-white text-[10px] font-semibold leading-none grid place-items-center",
              whatsappCount > 0 && count === whatsappCount
                ? "bg-green-500"
                : "bg-red-500",
              slaBreached && "animate-pulse ring-2 ring-red-300"
            )}
          >
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>
      <ChatNotificationsSheet open={open} onOpenChange={setOpen} />
    </>
  );
}
