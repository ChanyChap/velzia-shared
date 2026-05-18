"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../ui/tabs";
import { Button } from "../ui/button";
import { MessageCircle, Loader2, CheckCheck } from "lucide-react";
import { createClient } from "../../lib/supabase-client";

interface ChatChannel {
  id: string;
  proyecto_id: string;
  name: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_count: number;
}

interface WaConversation {
  id: string;
  contact_name: string;
  contact_phone: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_message_direction: string | null;
  unread_count: number;
  status: string;
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "ahora";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(dateStr).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}

export function ChatBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("interno");
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalUnread, setTotalUnread] = useState(0);
  // WhatsApp state
  const [waConversations, setWaConversations] = useState<WaConversation[]>([]);
  const [waLoading, setWaLoading] = useState(true);
  const [waUnreadCount, setWaUnreadCount] = useState(0);

  const fetchChannels = useCallback(async () => {
    try {
      const res = await fetch("/api/chat/channels", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      const sorted = (data as ChatChannel[]).sort((a, b) => {
        if (!a.last_message_at) return 1;
        if (!b.last_message_at) return -1;
        return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime();
      });
      setChannels(sorted);
      const newTotal = sorted.reduce((sum, c) => sum + (c.unread_count || 0), 0);
      setTotalUnread(newTotal);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchWaConversations = useCallback(async () => {
    try {
      const supabase = createClient();
      // Only show conversations assigned to the current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("wa_conversations")
        .select(`
          id,
          last_message_at,
          last_message_preview,
          last_message_direction,
          unread_count,
          status,
          wa_contacts!inner (
            name,
            phone
          )
        `)
        .eq("assigned_to", user.id)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(20);

      if (error || !data) return;

      const mapped: WaConversation[] = data.map((conv: Record<string, unknown>) => {
        const contact = conv.wa_contacts as Record<string, unknown> | null;
        return {
          id: conv.id as string,
          contact_name: (contact?.name as string) || (contact?.phone as string) || "Desconocido",
          contact_phone: (contact?.phone as string) || "",
          last_message_at: conv.last_message_at as string | null,
          last_message_preview: conv.last_message_preview as string | null,
          last_message_direction: conv.last_message_direction as string | null,
          unread_count: (conv.unread_count as number) || 0,
          status: conv.status as string,
        };
      });

      // Sort: unread first, then by last_message_at desc
      mapped.sort((a, b) => {
        if (a.unread_count > 0 && b.unread_count === 0) return -1;
        if (a.unread_count === 0 && b.unread_count > 0) return 1;
        if (!a.last_message_at) return 1;
        if (!b.last_message_at) return -1;
        return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime();
      });

      setWaConversations(mapped);
      setWaUnreadCount(mapped.reduce((sum, c) => sum + c.unread_count, 0));
    } catch {
      // silent
    } finally {
      setWaLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchChannels();
    fetchWaConversations();
  }, [fetchChannels, fetchWaConversations]);

  // Refresh when dropdown opens
  useEffect(() => {
    if (open) {
      fetchChannels();
      fetchWaConversations();
    }
  }, [open, fetchChannels, fetchWaConversations]);

  // Realtime: listen for new messages AND read receipt updates
  useEffect(() => {
    const supabase = createClient();
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const debouncedFetch = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        fetchChannels();
      }, 500);
    };

    const channel = supabase
      .channel("chat-bell-global")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "team_chat_messages",
        },
        () => {
          debouncedFetch();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "team_chat_read_receipts",
        },
        () => {
          debouncedFetch();
        }
      )
      .subscribe();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [fetchChannels]);

  // Realtime: listen for new WhatsApp messages
  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel("wa-bell-global")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "wa_conversations",
        },
        () => {
          fetchWaConversations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchWaConversations]);

  // Poll every 60s as fallback
  useEffect(() => {
    const interval = setInterval(() => {
      fetchChannels();
      fetchWaConversations();
    }, 60000);
    return () => clearInterval(interval);
  }, [fetchChannels, fetchWaConversations]);

  // Cross-tab sync: listen for read events from other tabs + same-tab events
  useEffect(() => {
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel("chat-read-sync");
      bc.onmessage = (event) => {
        if (event.data?.type === "read") {
          fetchChannels();
        }
      };
    } catch {
      /* BroadcastChannel not supported */
    }

    // Same-tab: listen for chat-read custom event from project-chat-panel
    const handleChatRead = () => { fetchChannels(); };
    window.addEventListener("chat-read", handleChatRead);

    return () => {
      try { bc?.close(); } catch { /* */ }
      window.removeEventListener("chat-read", handleChatRead);
    };
  }, [fetchChannels]);


  function broadcastRead(channelId: string) {
    try {
      const bc = new BroadcastChannel("chat-read-sync");
      bc.postMessage({ type: "read", channelId });
      bc.close();
    } catch { /* */ }
  }

  async function handleNavigate(channel: ChatChannel) {
    // Optimistic UI update
    if (channel.unread_count > 0) {
      setChannels((prev) =>
        prev.map((c) => (c.id === channel.id ? { ...c, unread_count: 0 } : c))
      );
      setTotalUnread((prev) => Math.max(0, prev - channel.unread_count));
    }
    setOpen(false);

    // Mark as read BEFORE navigating — use keepalive so fetch survives page unload
    if (channel.unread_count > 0) {
      try {
        await fetch(`/api/chat/channels/${channel.id}/read`, {
          method: "POST",
          keepalive: true,
        });
      } catch (err) {
        console.error("[ChatBell] mark-read error:", err);
      }
      broadcastRead(channel.id);
      window.dispatchEvent(new CustomEvent("chat-read", { detail: { channelId: channel.id } }));
    }

    // Use router.push for SPA navigation (no full reload) so state persists
    // If already on the same project, just open chat
    const targetUrl = `/proyectos/${channel.proyecto_id}/documentos?chat=open`;
    if (window.location.pathname.includes(channel.proyecto_id)) {
      setOpen(false);
      window.dispatchEvent(new CustomEvent("open-project-chat"));
    } else {
      window.location.href = targetUrl;
    }
  }

  async function handleMarkAllRead() {
    const unreadChannels = channels.filter((c) => c.unread_count > 0);
    if (unreadChannels.length === 0) return;
    // Optimistic update
    setChannels((prev) => prev.map((c) => ({ ...c, unread_count: 0 })));
    setTotalUnread(0);
    // Fire all mark-read requests in parallel
    await Promise.all(
      unreadChannels.map((c) =>
        fetch(`/api/chat/channels/${c.id}/read`, { method: "POST", keepalive: true })
          .then((res) => { if (res.ok) broadcastRead(c.id); })
          .catch(() => {})
      )
    );
    // Dispatch same-tab event so other components update
    window.dispatchEvent(new CustomEvent("chat-read", { detail: { all: true } }));
  }

  async function handleWaNavigate(conv: WaConversation) {
    // Optimistic: mark as read in bell
    if (conv.unread_count > 0) {
      setWaConversations((prev) =>
        prev.map((c) => (c.id === conv.id ? { ...c, unread_count: 0 } : c))
      );
      setWaUnreadCount((prev) => Math.max(0, prev - conv.unread_count));
      // Update DB
      const supabase = createClient();
      supabase
        .from("wa_conversations")
        .update({ unread_count: 0 })
        .eq("id", conv.id)
        .then(() => {});
    }
    setOpen(false);
    router.push(`/comunicaciones?conversation=${conv.id}`);
  }

  async function handleWaMarkAllRead() {
    const unreadWa = waConversations.filter((c) => c.unread_count > 0);
    if (unreadWa.length === 0) return;
    // Optimistic update
    setWaConversations((prev) => prev.map((c) => ({ ...c, unread_count: 0 })));
    setWaUnreadCount(0);
    // Update DB
    const supabase = createClient();
    await Promise.all(
      unreadWa.map((c) =>
        supabase
          .from("wa_conversations")
          .update({ unread_count: 0 })
          .eq("id", c.id)
          .then(() => {})
      )
    );
  }

  async function handleMarkAllEverythingRead() {
    await Promise.all([
      totalUnread > 0 ? handleMarkAllRead() : Promise.resolve(),
      waUnreadCount > 0 ? handleWaMarkAllRead() : Promise.resolve(),
    ]);
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative rounded-full"
        >
          <MessageCircle className="h-5 w-5" />
          {/* Badge: combined unread count (internal + WhatsApp) */}
          {(() => {
            const combinedUnread = totalUnread + waUnreadCount;
            if (combinedUnread === 0) return null;
            return (
              <span
                className={`absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-bold ${
                  waUnreadCount > 0 && totalUnread === 0
                    ? "bg-green-500 text-white"
                    : "bg-blue-500 text-white"
                }`}
              >
                {combinedUnread > 99 ? "99+" : combinedUnread}
              </span>
            );
          })()}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2.5 border-b">
          <h3 className="font-semibold text-sm">Mensajes</h3>
          {(totalUnread + waUnreadCount) > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {totalUnread + waUnreadCount} sin leer
              </span>
              <button
                onClick={handleMarkAllEverythingRead}
                className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 font-medium"
                title="Marcar todos como leidos"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Leer todos
              </button>
            </div>
          )}
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full rounded-none border-b h-9 bg-transparent p-0">
            <TabsTrigger
              value="interno"
              className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-blue-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none text-xs gap-1"
            >
              Interno
              {totalUnread > 0 && (
                <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-blue-500 px-1 text-[10px] font-bold text-white">
                  {totalUnread > 99 ? "99+" : totalUnread}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="whatsapp"
              className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-green-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none text-xs gap-1"
            >
              WhatsApp
              {waUnreadCount > 0 && (
                <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-green-500 px-1 text-[10px] font-bold text-white">
                  {waUnreadCount > 99 ? "99+" : waUnreadCount}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Internal chat tab */}
          <TabsContent value="interno" className="mt-0">
            <div className="max-h-[360px] overflow-y-auto divide-y">
              {loading && channels.length === 0 && (
                <div className="py-8 text-center">
                  <Loader2 className="h-5 w-5 mx-auto animate-spin text-muted-foreground" />
                </div>
              )}

              {!loading && channels.length === 0 && (
                <div className="py-8 text-center">
                  <MessageCircle className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
                  <p className="text-sm text-muted-foreground">Sin conversaciones</p>
                </div>
              )}

              {channels.map((ch) => (
                <button
                  key={ch.id}
                  className={`w-full text-left px-3 py-2.5 flex gap-3 items-start hover:bg-muted/50 transition-colors ${
                    ch.unread_count > 0 ? "bg-blue-50/70" : ""
                  }`}
                  onClick={() => handleNavigate(ch)}
                >
                  <div className="mt-0.5 flex-shrink-0">
                    <MessageCircle className={`h-4 w-4 ${ch.unread_count > 0 ? "text-blue-600" : "text-muted-foreground"}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className={`text-sm leading-tight truncate ${ch.unread_count > 0 ? "font-semibold" : "font-medium"}`}>
                        {ch.name}
                      </p>
                      {ch.last_message_at && (
                        <span className="text-[11px] text-muted-foreground flex-shrink-0">
                          {timeAgo(ch.last_message_at)}
                        </span>
                      )}
                    </div>
                    {ch.last_message_preview && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                        {ch.last_message_preview}
                      </p>
                    )}
                  </div>
                  {ch.unread_count > 0 && (
                    <div className="flex-shrink-0 mt-1">
                      <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-blue-500 px-1.5 text-[10px] font-bold text-white">
                        {ch.unread_count > 99 ? "99+" : ch.unread_count}
                      </span>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </TabsContent>

          {/* WhatsApp tab */}
          <TabsContent value="whatsapp" className="mt-0">
            <div className="max-h-[360px] overflow-y-auto divide-y">
              {waLoading && waConversations.length === 0 && (
                <div className="py-8 text-center">
                  <Loader2 className="h-5 w-5 mx-auto animate-spin text-muted-foreground" />
                </div>
              )}

              {!waLoading && waConversations.length === 0 && (
                <div className="py-8 text-center">
                  <svg className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                  </svg>
                  <p className="text-sm text-muted-foreground">Sin conversaciones de WhatsApp</p>
                </div>
              )}

              {waConversations.map((conv) => (
                <button
                  key={conv.id}
                  className={`w-full text-left px-3 py-2.5 flex gap-3 items-start hover:bg-muted/50 transition-colors ${
                    conv.unread_count > 0 ? "bg-green-50/70" : ""
                  }`}
                  onClick={() => handleWaNavigate(conv)}
                >
                  <div className="mt-0.5 flex-shrink-0">
                    <svg className={`h-4 w-4 ${conv.unread_count > 0 ? "text-green-600" : "text-muted-foreground"}`} viewBox="0 0 24 24" fill="currentColor">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className={`text-sm leading-tight truncate ${conv.unread_count > 0 ? "font-semibold" : "font-medium"}`}>
                        {conv.contact_name}
                      </p>
                      {conv.last_message_at && (
                        <span className="text-[11px] text-muted-foreground flex-shrink-0">
                          {timeAgo(conv.last_message_at)}
                        </span>
                      )}
                    </div>
                    {conv.last_message_preview && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                        {conv.last_message_direction === "outbound" ? "Tu: " : ""}
                        {conv.last_message_preview}
                      </p>
                    )}
                  </div>
                  {conv.unread_count > 0 && (
                    <div className="flex-shrink-0 mt-1">
                      <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-green-500 px-1.5 text-[10px] font-bold text-white">
                        {conv.unread_count > 99 ? "99+" : conv.unread_count}
                      </span>
                    </div>
                  )}
                </button>
              ))}
            </div>

            {/* Link to full comunicaciones page */}
            <div className="border-t px-3 py-2">
              <button
                className="w-full text-center text-xs font-medium text-green-600 hover:text-green-800"
                onClick={() => {
                  setOpen(false);
                  router.push("/comunicaciones");
                }}
              >
                Abrir Comunicaciones
              </button>
            </div>
          </TabsContent>
        </Tabs>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
