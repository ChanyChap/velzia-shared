"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { createClient } from "../../lib/supabase-client";
import { useToast } from "../../hooks/use-toast";
import { Loader2, Settings, Search, Paperclip } from "lucide-react";
import { Button } from "../ui/button";
import { ChatMessageList } from "./chat-message-list";
import { ChatInput } from "./chat-input";
import { ChatNewMessageTrigger } from "./chat-new-message-trigger";
import { ChatConfigPanel } from "./chat-config-panel";
import { ChatCreateTaskModal } from "./chat-create-task-modal";
import { ChatSearchPanel } from "./chat-search-panel";
import { ChatAttachmentsPanel } from "./chat-attachments-panel";
import { ChatTipBanner } from "./chat-tip-banner";
import { useSlaCountdown } from "./use-sla-countdown";
import type { ChatMessage, TeamMember, ChatSlaConfig } from "./types";

interface ProjectChatPanelProps {
  /** Requerido si scope='project'. Ignorado si scope='team'. */
  projectId?: string;
  projectName?: string;
  compact?: boolean;
  /**
   * Tipo de canal. 'project' (default) abre el chat del proyecto indicado en
   * projectId. 'team' abre el canal del equipo indicado por teamId.
   */
  scope?: "project" | "team";
  /** Requerido si scope='team'. Identifica el equipo. */
  teamId?: string;
}

const PAGE_SIZE = 30;

export function ProjectChatPanel({
  projectId,
  projectName,
  compact = false,
  scope = "project",
  teamId,
}: ProjectChatPanelProps) {
  const [channelId, setChannelId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [tenantMembers, setTenantMembers] = useState<TeamMember[]>([]);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [slaConfig, setSlaConfig] = useState<ChatSlaConfig | null>(null);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [taskModalMessage, setTaskModalMessage] = useState<ChatMessage | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [attachmentsOpen, setAttachmentsOpen] = useState(false);
  const [highlightMessageId, setHighlightMessageId] = useState<string | null>(null);
  // Composer oculto por defecto: el usuario debe pulsar "Nuevo mensaje" o el
  // icono de Responder de un mensaje. Evita que el textbox vacío domine la
  // parte baja del panel y empuja al patrón "responder en hilo".
  const [composerOpen, setComposerOpen] = useState(false);
  // Token para forzar re-foco del textarea cuando se pulsa Reply estando el
  // composer ya abierto (cambiar replyTo no es suficiente: el useEffect que
  // hace .focus() depende de la prop autoFocus, y autoFocus pasa a true al
  // abrir; necesitamos un trigger nuevo en cada Reply).
  const [composerFocusToken, setComposerFocusToken] = useState(0);
  const subscriptionRef = useRef<ReturnType<
    ReturnType<typeof createClient>["channel"]
  > | null>(null);
  const syncInFlightRef = useRef(false);
  const { toast } = useToast();

  // Get current user + check admin role
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setCurrentUserId(data.user.id);
        supabase
          .from("profiles")
          .select("role")
          .eq("id", data.user.id)
          .single()
          .then(({ data: profile }) => {
            if (
              profile &&
              ["superadmin", "admin_empresa"].includes(profile.role)
            ) {
              setIsAdmin(true);
            }
          });
      }
    });
  }, []);

  // Fetch SLA config
  useEffect(() => {
    fetch("/api/chat/sla")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setSlaConfig({
          sla_normal_minutes: data.sla_normal_minutes ?? 60,
          sla_urgente_minutes: data.sla_urgente_minutes ?? 15,
          enabled: data.sla_enabled ?? true,
          pre_breach_reminder_enabled: data.pre_breach_reminder_enabled ?? true,
          pre_breach_reminder_minutes: data.pre_breach_reminder_minutes ?? 5,
        });
      }).catch(() => {});
  }, []);

  // Pass message refs (id, priority, created_at) for SLA countdown on ALL urgent messages
  const messageRefs = useMemo(
    () => messages.map((m) => ({ id: m.id, priority: m.priority, created_at: m.created_at })),
    [messages]
  );
  const { countdowns: slaCountdowns } = useSlaCountdown(channelId, currentUserId, slaConfig, messageRefs);

  // Fetch or create channel — soporta scope='project' (con projectId) o
  // scope='team' (con teamId). El endpoint POST /api/chat/channels recibe
  // distinto body según el scope.
  useEffect(() => {
    async function initChannel() {
      if (scope === "project" && !projectId) {
        setLoading(false);
        return;
      }
      if (scope === "team" && !teamId) {
        setLoading(false);
        return;
      }
      try {
        const res = await fetch("/api/chat/channels", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            scope === "team"
              ? { channel_type: "team", team_id: teamId }
              : { proyecto_id: projectId }
          ),
        });
        if (!res.ok) throw new Error("Error al crear/obtener canal");
        const data = await res.json();
        setChannelId(data.id);
        if (data.members) {
          setTenantMembers(data.members);
        }
      } catch {
        toast({
          title: "Error",
          description: "No se pudo cargar el chat del proyecto",
          variant: "destructive",
        });
      }
    }
    initChannel();
    // toast se omite a propósito: useToast() devuelve función nueva en cada
    // render y meterla provocaría re-init infinito del canal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, scope, teamId]);

  // Load messages (cursor-based: before=ISO timestamp)
  const loadMessages = useCallback(
    async (channelIdParam: string, before?: string) => {
      try {
        const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
        if (before) params.set("before", before);
        const res = await fetch(
          `/api/chat/channels/${channelIdParam}/messages?${params}`
        );
        if (!res.ok) throw new Error("Error al cargar mensajes");
        const data = await res.json();
        // API returns messages in DESC order, reverse for display (oldest first)
        const newMessages: ChatMessage[] = (data.messages || []).reverse();

        if (before) {
          // Prepend older messages
          setMessages((prev) => [...newMessages, ...prev]);
        } else {
          setMessages(newMessages);
        }

        setHasMore(newMessages.length === PAGE_SIZE);
      } catch {
        toast({
          title: "Error",
          description: "No se pudieron cargar los mensajes",
          variant: "destructive",
        });
      }
    },
    [toast]
  );

  const syncLatestMessages = useCallback(
    async (channelIdParam: string) => {
      if (syncInFlightRef.current) return;
      syncInFlightRef.current = true;

      try {
        const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
        const res = await fetch(
          `/api/chat/channels/${channelIdParam}/messages?${params}`
        );
        if (!res.ok) throw new Error("Error al sincronizar mensajes");
        const data = await res.json();
        const latestMessages: ChatMessage[] = (data.messages || []).reverse();

        setMessages((prev) => {
          if (prev.length === 0) return latestMessages;

          const merged = new Map<string, ChatMessage>();
          for (const msg of prev) merged.set(msg.id, msg);
          for (const msg of latestMessages) {
            const existing = merged.get(msg.id);
            merged.set(msg.id, existing ? { ...existing, ...msg } : msg);
          }

          return Array.from(merged.values()).sort(
            (a, b) =>
              new Date(a.created_at).getTime() -
              new Date(b.created_at).getTime()
          );
        });
      } catch {
        // Silent fallback sync — no toast to avoid noise
      } finally {
        syncInFlightRef.current = false;
      }
    },
    []
  );

  // Initial load when channel ready
  useEffect(() => {
    if (!channelId) return;
    setLoading(true);
    loadMessages(channelId).finally(() => setLoading(false));
  }, [channelId, loadMessages]);

  // Fallback sync in case realtime delivery is delayed in some browsers/tabs
  useEffect(() => {
    if (!channelId) return;

    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        syncLatestMessages(channelId);
      }
    }, 4000);

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === "visible") {
        syncLatestMessages(channelId);
      }
    };

    window.addEventListener("focus", handleVisibilityOrFocus);
    document.addEventListener("visibilitychange", handleVisibilityOrFocus);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", handleVisibilityOrFocus);
      document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
    };
  }, [channelId, syncLatestMessages]);

  // Load more (older) messages
  const loadMore = useCallback(() => {
    if (!channelId || loadingMore || !hasMore || messages.length === 0) return;
    setLoadingMore(true);
    const oldestMessage = messages[0];
    loadMessages(channelId, oldestMessage.created_at).finally(() =>
      setLoadingMore(false)
    );
  }, [channelId, loadingMore, hasMore, messages, loadMessages]);

  // Realtime subscription
  useEffect(() => {
    if (!channelId) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`chat:${channelId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "team_chat_messages",
          filter: `channel_id=eq.${channelId}`,
        },
        (payload) => {
          const newMsg = payload.new as Record<string, unknown>;
          // Skip own messages (already added optimistically or via POST response)
          if (newMsg.sender_id === currentUserId) return;
          // Build ChatMessage from payload + known members
          const sender = tenantMembers.find(
            (m) => m.id === newMsg.sender_id
          );
          const msg: ChatMessage = {
            id: newMsg.id as string,
            channel_id: newMsg.channel_id as string,
            sender_id: newMsg.sender_id as string,
            content: newMsg.content as string,
            reply_to_id: (newMsg.reply_to_id as string) || null,
            reply_to: null,
            attachments:
              (newMsg.attachments as ChatMessage["attachments"]) || [],
            edited_at: (newMsg.edited_at as string) || null,
            deleted_at: (newMsg.deleted_at as string) || null,
            created_at: newMsg.created_at as string,
            priority:
              (newMsg.priority as "normal" | "urgente" | "tarea") || "normal",
            sender: sender
              ? {
                  id: sender.id,
                  full_name: sender.full_name,
                  avatar_url: sender.avatar_url,
                  role: sender.role,
                }
              : {
                  id: newMsg.sender_id as string,
                  full_name: "Usuario",
                  avatar_url: null,
                  role: "",
                },
          };
          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
          // Auto mark-read since panel is open and user is viewing
          fetch(`/api/chat/channels/${channelId}/read`, { method: "POST" })
            .then((res) => {
              if (res.ok) {
                try {
                  const bc = new BroadcastChannel("chat-read-sync");
                  bc.postMessage({ type: "read", channelId });
                  bc.close();
                } catch { /* */ }
              }
            })
            .catch(() => { /* silent */ });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "team_chat_messages",
          filter: `channel_id=eq.${channelId}`,
        },
        (payload) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === payload.new.id
                ? {
                    ...m,
                    content: payload.new.content,
                    edited_at: payload.new.edited_at,
                    deleted_at: payload.new.deleted_at,
                    ...(payload.new.priority && {
                      priority: payload.new.priority,
                    }),
                  }
                : m
            )
          );
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "team_chat_read_receipts",
          filter: `channel_id=eq.${channelId}`,
        },
        (payload) => {
          // When someone reads messages, update read_by on affected messages
          const receipt = payload.new as { user_id?: string; last_read_at?: string };
          if (!receipt.user_id || !receipt.last_read_at || receipt.user_id === currentUserId) return;
          const readerName = tenantMembers.find((m) => m.id === receipt.user_id)?.full_name || "Usuario";
          setMessages((prev) =>
            prev.map((m) => {
              if (m.sender_id === receipt.user_id) return m;
              if (receipt.last_read_at && m.created_at <= receipt.last_read_at) {
                const existing = m.read_by || [];
                if (existing.some((r) => r.user_id === receipt.user_id)) return m;
                return {
                  ...m,
                  read_by: [...existing, { user_id: receipt.user_id!, full_name: readerName, read_at: receipt.last_read_at! }],
                };
              }
              return m;
            })
          );
        }
      )
      .subscribe();

    subscriptionRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, currentUserId]);

  // Mark messages as read when panel opens or channel changes
  useEffect(() => {
    if (!channelId || !currentUserId) return;

    const markRead = () => {
      fetch(`/api/chat/channels/${channelId}/read`, {
        method: "POST",
      })
        .then((res) => {
          if (res.ok) {
            // Notify other tabs/components that we've read this channel
            try {
              const bc = new BroadcastChannel("chat-read-sync");
              bc.postMessage({ type: "read", channelId });
              bc.close();
            } catch {
              /* BroadcastChannel not supported */
            }
            // Also notify same-tab components (chat-bell, project-nav)
            window.dispatchEvent(new CustomEvent("chat-read", { detail: { channelId } }));
          }
        })
        .catch(() => {
          /* silent */
        });
    };

    markRead();
  }, [channelId, currentUserId]);

  // Send message
  const handleSend = useCallback(
    async (
      content: string,
      attachments?: ChatMessage["attachments"],
      replyToId?: string,
      priority?: "normal" | "urgente" | "tarea"
    ) => {
      if (!channelId) return;

      try {
        const res = await fetch(
          `/api/chat/channels/${channelId}/messages`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              content,
              attachments: attachments || [],
              reply_to_id: replyToId || null,
              priority: priority || "normal",
            }),
          }
        );
        if (!res.ok) throw new Error("Error al enviar mensaje");
        const data = await res.json();
        if (data.message) {
          const sender = tenantMembers.find(
            (m) => m.id === currentUserId
          );
          const fullMsg: ChatMessage = {
            ...data.message,
            priority:
              data.message.priority || priority || "normal",
            sender: sender
              ? {
                  id: sender.id,
                  full_name: sender.full_name,
                  avatar_url: sender.avatar_url,
                  role: sender.role,
                }
              : {
                  id: currentUserId,
                  full_name: "Tu",
                  avatar_url: null,
                  role: "",
                },
            reply_to: null,
          };
          setMessages((prev) => {
            if (prev.some((m) => m.id === fullMsg.id)) return prev;
            return [...prev, fullMsg];
          });
          if ((priority || "normal") === "urgente" || (priority || "normal") === "tarea") {
            syncLatestMessages(channelId);
          }
        }
        setReplyTo(null);
      } catch (err) {
        toast({
          title: "Error",
          description: "No se pudo enviar el mensaje",
          variant: "destructive",
        });
        throw err; // Re-throw so ChatInput doesn't clear the content
      }
    },
    [channelId, toast, currentUserId, tenantMembers, syncLatestMessages]
  );

  const handleClaimTask = useCallback(
    async (messageId: string) => {
      try {
        const res = await fetch(`/api/chat/messages/${messageId}/claim-task`, {
          method: "POST",
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          const detail = errData.detail ? ` (${errData.detail})` : "";
          throw new Error((errData.error || "No se pudo añadir la tarea") + detail);
        }
        const data = await res.json();
        const claimedMention = data.mention;
        if (!claimedMention) throw new Error("Respuesta inválida del servidor");

        setMessages((prev) =>
          prev.map((message) =>
            message.id === messageId
              ? {
                  ...message,
                  mentions: [
                    ...(message.mentions || []).filter(
                      (mention) => mention.id !== claimedMention.id
                    ),
                    claimedMention,
                  ],
                }
              : message
          )
        );

        toast({
          title: data.reused
            ? "La tarea ya estaba en tus tareas"
            : "Tarea añadida a tus tareas",
          description: data.mentionLinkFailed
            ? "La tarea se creó en el proyecto pero no se pudo vincular al mensaje del chat."
            : "La verás en tu dashboard y en Tareas Equipo.",
        });
      } catch (err) {
        toast({
          title: "Error",
          description: err instanceof Error ? err.message : "No se pudo añadir la tarea a tus tareas",
          variant: "destructive",
        });
      }
    },
    [toast]
  );

  // Toggle urgente task for sender or mentioned users
  const handleToggleTask = useCallback(async (
    mentionId: string,
    messageId: string,
    status: "pendiente" | "realizada"
  ) => {
    try {
      const res = await fetch(`/api/chat/mentions/${mentionId}/complete-task`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        const data = await res.json();
        const updatedMentions = new Map(
          ((data.updatedMentions || []) as Array<{
            id: string;
            task_status: "pendiente" | "realizada" | null;
            task_completed_at: string | null;
          }>).map((mention) => [mention.id, mention])
        );
        setMessages((prev) => prev.map((m) =>
          m.id === messageId
            ? { ...m, mentions: m.mentions?.map((mention) =>
                updatedMentions.has(mention.id)
                  ? {
                      ...mention,
                      task_status: updatedMentions.get(mention.id)?.task_status as
                        | "pendiente"
                        | "realizada"
                        | null,
                      task_completed_at:
                        updatedMentions.get(mention.id)?.task_completed_at || null,
                    }
                  : mention
              )}
            : m
        ));
        toast({
          title:
            status === "realizada"
              ? "Tarea marcada como realizada"
              : "Tarea marcada como pendiente",
        });
      } else {
        throw new Error("No se pudo actualizar la tarea");
      }
    } catch {
      toast({ title: "Error al actualizar la tarea", variant: "destructive" });
    }
  }, [toast]);

  // Quick complete: single click to claim+complete or toggle an urgente/tarea message
  const handleQuickComplete = useCallback(
    async (messageId: string) => {
      try {
        const res = await fetch(`/api/chat/messages/${messageId}/claim-task`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ autoComplete: true }),
        });
        if (!res.ok) throw new Error("Error");
        const data = await res.json();
        const mention = data.mention;
        if (!mention) return;

        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId
              ? {
                  ...m,
                  mentions: [
                    ...(m.mentions || []).filter((x) => x.id !== mention.id),
                    mention,
                  ],
                }
              : m
          )
        );

        toast({
          title: mention.task_status === "realizada"
            ? "Marcado como hecho"
            : "Marcado como pendiente",
        });
      } catch {
        toast({
          title: "Error al marcar como hecho",
          variant: "destructive",
        });
      }
    },
    [toast]
  );

  // Open task modal from a message
  const handleCreateTaskFromMessage = useCallback((message: ChatMessage) => {
    setTaskModalMessage(message);
    setTaskModalOpen(true);
  }, []);

  // Create team task from chat message
  const handleCreateTask = useCallback(async (data: {
    title: string;
    due_date: string;
    priority: string;
  }) => {
    try {
      // Auto-detect user's first team
      const supabase = createClient();
      const { data: membership } = await supabase
        .from("team_members")
        .select("team_id")
        .eq("profile_id", currentUserId)
        .limit(1)
        .single();

      if (!membership?.team_id) {
        toast({
          title: "Sin equipo asignado",
          description: "Necesitas pertenecer a un equipo para crear tareas. Contacta con tu administrador.",
          variant: "destructive",
        });
        return;
      }

      const res = await fetch("/api/team-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          team_id: membership.team_id,
          title: data.title,
          description: taskModalMessage
            ? `Desde chat del proyecto:\n\n${taskModalMessage.content}`
            : undefined,
          priority: data.priority,
          due_date: data.due_date,
          assigned_to: currentUserId,
          label: "Chat proyecto",
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Error al crear tarea");
      }

      toast({
        title: "Tarea creada",
        description: "La tarea aparece en tu dashboard y en Tareas Equipo.",
      });
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "No se pudo crear la tarea",
        variant: "destructive",
      });
      throw err;
    }
  }, [currentUserId, taskModalMessage, toast]);

  // Edit message
  const handleEdit = useCallback(
    async (messageId: string, newContent: string, priority?: string) => {
      if (!channelId) return;

      try {
        const res = await fetch(
          `/api/chat/channels/${channelId}/messages/${messageId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              content: newContent,
              ...(priority && { priority }),
            }),
          }
        );
        if (!res.ok) throw new Error("Error al editar mensaje");

        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId
              ? {
                  ...m,
                  content: newContent,
                  edited_at: new Date().toISOString(),
                  ...(priority && {
                    priority: priority as "normal" | "urgente" | "tarea",
                  }),
                }
              : m
          )
        );
      } catch {
        toast({
          title: "Error",
          description: "No se pudo editar el mensaje",
          variant: "destructive",
        });
      }
    },
    [channelId, toast]
  );

  // Delete message
  const handleDelete = useCallback(
    async (messageId: string) => {
      if (!channelId) return;

      try {
        const res = await fetch(
          `/api/chat/channels/${channelId}/messages/${messageId}`,
          { method: "DELETE" }
        );
        if (!res.ok) throw new Error("Error al eliminar mensaje");

        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId
              ? { ...m, deleted_at: new Date().toISOString() }
              : m
          )
        );
      } catch {
        toast({
          title: "Error",
          description: "No se pudo eliminar el mensaje",
          variant: "destructive",
        });
      }
    },
    [channelId, toast]
  );

  if (loading) {
    // h-full sin min-h: el spinner ocupa TODA la altura del contenedor padre
    // para no dejar aire blanco arriba o abajo cuando el panel se monta en
    // cold (visto en FAT 2026-05-13 — flash de 1.8s entre auto-entry de
    // team y empty state del chat).
    return (
      <div className="flex items-center justify-center h-full w-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        {!compact && projectName ? (
          <div>
            <h3 className="font-semibold text-sm">Chat del equipo</h3>
            <p className="text-xs text-muted-foreground">
              {projectName}
            </p>
          </div>
        ) : (
          <div />
        )}
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => setSearchOpen((v) => !v)}
            title="Buscar mensajes en el chat"
          >
            <Search className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => setAttachmentsOpen(true)}
            title="Ver documentos compartidos"
          >
            <Paperclip className="h-4 w-4" />
          </Button>
          {isAdmin && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => setConfigOpen(true)}
              title="Configuración del chat"
            >
              <Settings className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {isAdmin && (
        <ChatConfigPanel
          open={configOpen}
          onOpenChange={setConfigOpen}
        />
      )}

      {channelId && (
        <ChatSearchPanel
          channelId={channelId}
          open={searchOpen}
          onClose={() => setSearchOpen(false)}
          onSelectMessage={(msgId) => {
            setHighlightMessageId(msgId);
            setTimeout(() => setHighlightMessageId(null), 3000);
          }}
        />
      )}

      <ChatAttachmentsPanel
        channelId={channelId}
        open={attachmentsOpen}
        onOpenChange={setAttachmentsOpen}
      />

      <ChatTipBanner />

      <ChatMessageList
        messages={messages}
        currentUserId={currentUserId}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onReply={(msg) => {
          setReplyTo(msg);
          setComposerOpen(true);
          setComposerFocusToken((t) => t + 1);
        }}
        onClaimTask={handleClaimTask}
        onToggleTask={handleToggleTask}
        onQuickComplete={handleQuickComplete}
        onCreateTaskFromMessage={handleCreateTaskFromMessage}
        loadMore={loadMore}
        hasMore={hasMore}
        loading={loadingMore}
        slaConfig={slaConfig ?? undefined}
        slaCountdowns={slaCountdowns}
        highlightMessageId={highlightMessageId}
      />

      <ChatCreateTaskModal
        open={taskModalOpen}
        onOpenChange={setTaskModalOpen}
        defaultTitle={
          taskModalMessage
            ? taskModalMessage.content
                .replace(/@\S+/g, "")
                .replace(/\s+/g, " ")
                .trim()
                .slice(0, 120) || "Tarea del chat"
            : "Tarea del chat"
        }
        onCreateTask={handleCreateTask}
      />

      {channelId && (
        composerOpen ? (
          <ChatInput
            // key cambia en cada apertura para que el efecto autoFocus se
            // dispare de nuevo cuando se pulsa "Responder" varias veces
            // seguidas (mismo composer, distinto mensaje al que se responde).
            key={composerFocusToken}
            onSend={async (...args) => {
              await handleSend(...args);
              // Tras enviar, cerrar el composer y volver al trigger discreto.
              setComposerOpen(false);
            }}
            replyTo={replyTo}
            onCancelReply={() => setReplyTo(null)}
            channelId={channelId}
            tenantMembers={tenantMembers}
            projectId={projectId}
            autoFocus
            onClose={() => {
              setReplyTo(null);
              setComposerOpen(false);
            }}
          />
        ) : (
          <ChatNewMessageTrigger
            onClick={() => {
              setReplyTo(null);
              setComposerOpen(true);
              setComposerFocusToken((t) => t + 1);
            }}
          />
        )
      )}
    </div>
  );
}
