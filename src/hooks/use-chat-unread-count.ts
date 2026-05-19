"use client";

import { useEffect, useState } from "react";
import { createClient } from "../lib/supabase-client";
import { chatFetch } from "../lib/chat-api-base";

export interface ChatUnreadDigest {
  count: number;
  slaBreached: boolean;
  whatsappCount: number;
  mentionsCount: number;
  outboundCount: number;
}

// Cuenta los mensajes "Sin responder por mí" del usuario actual: filas en
// team_chat_mentions con mentioned_user_id = me y responded_at IS NULL.
// Cubre @<nombre> y @equipo (este último expande a una fila por miembro al
// insertar el mensaje). Detecta si alguna ha superado su SLA según
// team_chat_sla_config del tenant.
//
// responded_at se marca SOLO cuando el usuario envía un reply explícito
// (reply_to_id apunta al message_id de la mención). Antes se marcaba al
// enviar cualquier mensaje al canal y eso vaciaba la bandeja aunque el
// usuario no hubiese contestado lo que le preguntaban.
export function useChatUnreadDigest(): ChatUnreadDigest {
  const [digest, setDigest] = useState<ChatUnreadDigest>({
    count: 0,
    slaBreached: false,
    whatsappCount: 0,
    mentionsCount: 0,
    outboundCount: 0,
  });

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    async function fetchWhatsappUnread(userId: string): Promise<number> {
      const { data } = await supabase
        .from("wa_conversations")
        .select("unread_count")
        .eq("assigned_to", userId)
        .gt("unread_count", 0);
      if (!data) return 0;
      return data.reduce((sum, c) => sum + (c.unread_count || 0), 0);
    }

    async function fetchOutboundUnread(): Promise<number> {
      try {
        const res = await chatFetch("/api/chat/outbound-unread-messages", {
          cache: "no-store",
        });
        if (!res.ok) return 0;
        const data = await res.json();
        return Array.isArray(data?.messages) ? data.messages.length : 0;
      } catch {
        return 0;
      }
    }

    async function refresh() {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("tenant_id")
        .eq("id", userId)
        .single();
      const tenantId = profile?.tenant_id;
      if (!tenantId) {
        if (!cancelled)
          setDigest({
            count: 0,
            slaBreached: false,
            whatsappCount: 0,
            mentionsCount: 0,
            outboundCount: 0,
          });
        return;
      }

      const [waCount, outboundCount] = await Promise.all([
        fetchWhatsappUnread(userId),
        fetchOutboundUnread(),
      ]);

      // FUENTE DE VERDAD UNIFICADA: el `mentionsCount` se calcula a partir
      // del MISMO endpoint que consume la lista (`UnreadMessagesList` /
      // pestaña "Sin responder por mí"), `/api/chat/unread-messages`.
      // Antes este hook consultaba Supabase directamente y podía
      // desincronizarse con la lista (badge "2" con lista vacía): el
      // endpoint aplica filtros que el hook no replicaba (join con
      // `team_chat_channels`, limit, exclusiones extra). Decisión Chany
      // 2026-05-19 — bug reportado en VelziaOnSite.
      let mentionsCount = 0;
      let anyBreached = false;
      try {
        const res = await chatFetch("/api/chat/unread-messages", {
          cache: "no-store",
        });
        if (res.ok) {
          const data = (await res.json()) as {
            messages?: Array<{ sla_breached?: boolean }>;
          };
          const items = Array.isArray(data?.messages) ? data.messages : [];
          mentionsCount = items.length;
          anyBreached = items.some((m) => m?.sla_breached === true);
        }
      } catch {
        // Sin red: no actualizamos esa parte del digest. Realtime y los
        // polls posteriores reintentarán.
      }

      if (!cancelled) {
        setDigest({
          count: mentionsCount + waCount,
          slaBreached: anyBreached,
          whatsappCount: waCount,
          mentionsCount,
          outboundCount,
        });
      }
    }

    refresh();

    // Evento custom global para forzar refresh inmediato del digest.
    // Lo emiten los componentes que cambian team_chat_mentions a través
    // del API (enviar mensaje con @, hacer reply, mark-as-responded,
    // end-thread). Sin esto el badge tarda hasta 30s en actualizarse
    // (poll) o depende del Realtime, que a veces no llega — bug
    // reportado por Chany 18 may 2026.
    const onCustomRefresh = () => {
      if (!cancelled) refresh();
    };
    window.addEventListener("chat:digest-refresh", onCustomRefresh);

    // Nombre de canal único por instancia: dos componentes (topbar +
    // pestaña "Sin responder por mí") montan el hook a la vez y Supabase
    // rechaza añadir .on() tras .subscribe() si el nombre se reusa.
    const channelName = `chat-mentions-${Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "team_chat_mentions" },
        () => refresh(),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "team_chat_mentions" },
        () => refresh(),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "team_chat_messages" },
        () => refresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "wa_conversations" },
        () => refresh(),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "team_chat_messages" },
        () => refresh(),
      )
      .subscribe();

    // Recalcula cada 30 s: cubre Realtime caído y el avance del reloj
    // (un mensaje con 59 min puede pasar a breached entre eventos).
    const pollInterval = setInterval(() => {
      if (!cancelled) refresh();
    }, 30_000);

    const onVisible = () => {
      if (document.visibilityState === "visible" && !cancelled) refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);

    return () => {
      cancelled = true;
      clearInterval(pollInterval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
      window.removeEventListener("chat:digest-refresh", onCustomRefresh);
      supabase.removeChannel(channel);
    };
  }, []);

  return digest;
}

// Compat: callers antiguos que solo querían el contador.
export function useChatUnreadCount(): number {
  return useChatUnreadDigest().count;
}
