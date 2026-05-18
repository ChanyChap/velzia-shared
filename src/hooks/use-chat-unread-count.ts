"use client";

import { useEffect, useState } from "react";
import { createClient } from "../lib/supabase-client";

const DEFAULT_SLA_NORMAL = 60;
const DEFAULT_SLA_URGENTE = 15;

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
        const res = await fetch("/api/chat/outbound-unread-messages", {
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

      const { data: slaCfg } = await supabase
        .from("team_chat_sla_config")
        .select("sla_minutes_normal, sla_minutes_urgente, enabled")
        .eq("tenant_id", tenantId)
        .single();

      const slaEnabled = slaCfg?.enabled !== false;
      const slaNormal = slaCfg?.sla_minutes_normal ?? DEFAULT_SLA_NORMAL;
      const slaUrgente = slaCfg?.sla_minutes_urgente ?? DEFAULT_SLA_URGENTE;

      const { data: mentions } = await supabase
        .from("team_chat_mentions")
        .select("id, message_id, priority")
        .eq("tenant_id", tenantId)
        .eq("mentioned_user_id", userId)
        .is("responded_at", null);

      if (!mentions || mentions.length === 0) {
        if (!cancelled)
          setDigest({
            count: waCount,
            slaBreached: false,
            whatsappCount: waCount,
            mentionsCount: 0,
            outboundCount,
          });
        return;
      }

      // Necesitamos created_at de los mensajes para evaluar SLA. La mención
      // tiene su propio created_at pero el SLA se mide contra el mensaje.
      const messageIds = mentions.map((m) => m.message_id);
      const { data: messages } = await supabase
        .from("team_chat_messages")
        .select("id, created_at, priority, deleted_at, sender_id")
        .in("id", messageIds);

      const msgMap = new Map<
        string,
        { created_at: string; priority: string | null; sender_id: string }
      >();
      (messages || [])
        .filter((m) => !m.deleted_at && m.sender_id !== userId)
        .forEach((m) =>
          msgMap.set(m.id, {
            created_at: m.created_at,
            priority: m.priority,
            sender_id: m.sender_id,
          }),
        );

      let total = 0;
      let anyBreached = false;
      const now = Date.now();
      for (const mention of mentions) {
        const msg = msgMap.get(mention.message_id);
        if (!msg) continue;
        total += 1;
        if (slaEnabled && !anyBreached) {
          const priority = (
            mention.priority ||
            msg.priority ||
            "normal"
          ).toLowerCase();
          const slaMin = priority === "urgente" ? slaUrgente : slaNormal;
          const ageMin = (now - new Date(msg.created_at).getTime()) / 60000;
          if (ageMin > slaMin) anyBreached = true;
        }
      }
      if (!cancelled) {
        setDigest({
          count: total + waCount,
          slaBreached: anyBreached,
          whatsappCount: waCount,
          mentionsCount: total,
          outboundCount,
        });
      }
    }

    refresh();

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
      supabase.removeChannel(channel);
    };
  }, []);

  return digest;
}

// Compat: callers antiguos que solo querían el contador.
export function useChatUnreadCount(): number {
  return useChatUnreadDigest().count;
}
