"use client";

import { useEffect, useRef, useCallback } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "../../lib/utils";

import { ChatMessageBubble } from "./chat-message-bubble";
import type { SlaCountdownInfo } from "./use-sla-countdown";
import type { ChatMessage, ChatSlaConfig } from "./types";

interface ChatMessageListProps {
  messages: ChatMessage[];
  currentUserId: string;
  onEdit: (id: string, content: string, priority?: string) => void;
  onDelete: (id: string) => void;
  onReply: (message: ChatMessage) => void;
  onClaimTask?: (messageId: string) => void;
  onToggleTask?: (
    mentionId: string,
    messageId: string,
    status: "pendiente" | "realizada"
  ) => void;
  onQuickComplete?: (messageId: string) => void;
  onCreateTaskFromMessage?: (message: ChatMessage) => void;
  highlightMessageId?: string | null;
  loadMore: () => void;
  hasMore: boolean;
  loading: boolean;
  slaConfig?: ChatSlaConfig;
  slaCountdowns?: Map<string, SlaCountdownInfo>;
}

function formatDateSeparator(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const msgDate = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  );

  if (msgDate.getTime() === today.getTime()) return "Hoy";
  if (msgDate.getTime() === yesterday.getTime()) return "Ayer";

  return date.toLocaleDateString("es-ES", {
    day: "numeric",
    month: "long",
    year:
      date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

// Formato sticky: "HOY · 12 MAYO" / "AYER · 11 MAYO" / "6 MAYO".
// Para días que no son hoy/ayer omitimos el prefijo y enseñamos solo la
// fecha (más limpio que "1 MAYO · 1 MAYO").
function formatDaySticky(dateStr: string): string {
  const label = formatDateSeparator(dateStr);
  const date = new Date(dateStr);
  const dayMonth = date.toLocaleDateString("es-ES", {
    day: "numeric",
    month: "long",
  });
  if (label === "Hoy" || label === "Ayer") {
    return `${label.toUpperCase()} · ${dayMonth.toUpperCase()}`;
  }
  return dayMonth.toUpperCase();
}

function groupMessagesByDate(
  messages: ChatMessage[]
): Map<string, ChatMessage[]> {
  const groups = new Map<string, ChatMessage[]>();
  for (const msg of messages) {
    const dateKey = new Date(msg.created_at).toLocaleDateString("es-ES");
    const existing = groups.get(dateKey);
    if (existing) {
      existing.push(msg);
    } else {
      groups.set(dateKey, [msg]);
    }
  }
  return groups;
}

export function ChatMessageList({
  messages,
  currentUserId,
  onEdit,
  onDelete,
  onReply,
  onClaimTask,
  onToggleTask,
  onQuickComplete,
  onCreateTaskFromMessage,
  loadMore,
  hasMore,
  loading,
  slaCountdowns,
  highlightMessageId,
}: ChatMessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const prevMessageCountRef = useRef(messages.length);
  const isAtBottomRef = useRef(true);
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Scroll to bottom on new messages (only if already at bottom)
  useEffect(() => {
    if (messages.length > prevMessageCountRef.current && isAtBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevMessageCountRef.current = messages.length;
  }, [messages.length]);

  // Initial scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView();
  }, []);

  // Track scroll position to know if we're at bottom
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const threshold = 100;
    isAtBottomRef.current =
      target.scrollHeight - target.scrollTop - target.clientHeight < threshold;
  }, []);

  // Scroll to highlighted message
  useEffect(() => {
    if (!highlightMessageId) return;
    const el = messageRefs.current.get(highlightMessageId);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlightMessageId]);

  // Infinite scroll up with intersection observer
  useEffect(() => {
    const sentinel = topSentinelRef.current;
    if (!sentinel || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading) {
          loadMore();
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loading, loadMore]);

  const grouped = groupMessagesByDate(messages);

  return (
    <div
      ref={scrollAreaRef}
      className="flex-1 overflow-y-auto px-4 py-3"
      onScroll={handleScroll}
    >
      {/* Top sentinel for infinite scroll */}
      <div ref={topSentinelRef} className="h-1" />

      {/* Loading indicator */}
      {loading && (
        <div className="flex justify-center py-3">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* No messages */}
      {messages.length === 0 && !loading && (
        <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
          <p className="text-sm">No hay mensajes aun.</p>
          <p className="text-xs mt-1">Escribe el primero.</p>
        </div>
      )}

      {/* Messages grouped by date.
          La cabecera de cada grupo es sticky: se queda pegada al borde
          superior del scroll mientras el grupo siga visible, y al pasar al
          siguiente día el navegador la reemplaza automáticamente porque la
          siguiente sticky empuja a la anterior. No requiere intersection
          observer, es CSS puro. Position relative en el grupo es necesario
          para que el sticky se ancle a esa franja y no al scroll completo. */}
      {Array.from(grouped.entries()).map(([dateKey, msgs], groupIndex) => (
        <div key={dateKey} className="relative">
          <div
            data-testid={groupIndex === 0 ? "chat-day-sticky" : undefined}
            className={cn(
              "sticky top-0 z-10 -mx-4 px-4 py-1.5",
              "bg-background/95 backdrop-blur-sm border-b",
              "text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
            )}
          >
            {formatDaySticky(msgs[0].created_at)}
          </div>

          {/* Messages */}
          {msgs.map((msg) => (
            <div
              key={msg.id}
              ref={(el) => {
                if (el) messageRefs.current.set(msg.id, el);
                else messageRefs.current.delete(msg.id);
              }}
              className={cn(
                highlightMessageId === msg.id && "bg-yellow-100/60 rounded-lg transition-colors duration-1000"
              )}
            >
              <ChatMessageBubble
                message={msg}
                isOwn={msg.sender_id === currentUserId}
                currentUserId={currentUserId}
                onEdit={onEdit}
                onDelete={onDelete}
                onReply={onReply}
                onClaimTask={onClaimTask}
                onToggleTask={onToggleTask}
                onQuickComplete={onQuickComplete}
                onCreateTaskFromMessage={onCreateTaskFromMessage}
                slaCountdown={slaCountdowns?.get(msg.id)}
                isFirst={msg.id === messages[0]?.id}
              />
            </div>
          ))}
        </div>
      ))}

      {/* Bottom anchor */}
      <div ref={bottomRef} />
    </div>
  );
}
