"use client";

import { useState } from "react";
import Link from "next/link";
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
  const { count, slaBreached, whatsappCount } = useChatUnreadDigest();
  const [open, setOpen] = useState(false);

  const ariaLabel = `Abrir notificaciones de chat (${count} pendientes${
    whatsappCount > 0 ? `, ${whatsappCount} de WhatsApp` : ""
  }${slaBreached ? ", una con SLA superado" : ""})`;

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
