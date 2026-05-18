"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { PendingMention, ChatSlaConfig } from "./types";
import { chatFetch } from "../../lib/chat-api-base";

export interface SlaCountdownInfo {
  remainingSeconds: number;
  isBreached: boolean;
  isWarning: boolean;
  isEscalated: boolean;
  deadline: Date;
}

export interface UrgentMessageRef {
  id: string;
  priority: "normal" | "urgente" | "tarea";
  created_at: string;
}

export function useSlaCountdown(
  channelId: string | null,
  currentUserId: string,
  slaConfig: ChatSlaConfig | null,
  messages: UrgentMessageRef[]
) {
  const [pendingMentions, setPendingMentions] = useState<PendingMention[]>([]);
  const [countdowns, setCountdowns] = useState<Map<string, SlaCountdownInfo>>(new Map());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const warningMinutes = slaConfig?.pre_breach_reminder_minutes ?? 5;
  const reminderEnabled = slaConfig?.pre_breach_reminder_enabled ?? true;
  const slaUrgenteMinutes = slaConfig?.sla_urgente_minutes ?? 15;

  const fetchPendingMentions = useCallback(async () => {
    if (!channelId || !currentUserId || !slaConfig?.enabled) return;
    try {
      const res = await chatFetch(`/api/chat/sla/pending-mentions?channel_id=${channelId}`);
      if (!res.ok) return;
      const data = await res.json();
      setPendingMentions(data.mentions || []);
    } catch {
      // silent
    }
  }, [channelId, currentUserId, slaConfig?.enabled]);

  useEffect(() => {
    fetchPendingMentions();
  }, [fetchPendingMentions, messages.length]);

  useEffect(() => {
    if (!slaConfig?.enabled) return;
    const id = setInterval(fetchPendingMentions, 30000);
    return () => clearInterval(id);
  }, [fetchPendingMentions, slaConfig?.enabled]);

  // Calculate countdowns every second for ALL urgent messages
  useEffect(() => {
    if (!slaConfig?.enabled) {
      setCountdowns(new Map());
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    const urgentMessages = messages.filter((m) => m.priority === "urgente");

    if (urgentMessages.length === 0 && pendingMentions.length === 0) {
      setCountdowns(new Map());
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    const calculate = () => {
      const now = Date.now();
      const newMap = new Map<string, SlaCountdownInfo>();

      // 1. Mention-based countdowns (higher priority — use API-provided deadline)
      for (const mention of pendingMentions) {
        const deadline = new Date(mention.sla_deadline);
        const remainingMs = deadline.getTime() - now;
        const remainingSeconds = Math.max(0, Math.floor(remainingMs / 1000));
        const isBreached = remainingMs <= 0;
        const isWarning = reminderEnabled && !isBreached && remainingMs <= warningMinutes * 60 * 1000;
        const isEscalated = !!mention.escalated_at;
        newMap.set(mention.message_id, { remainingSeconds, isBreached, isWarning, isEscalated, deadline });
      }

      // 2. Fallback: time-based countdowns for ALL urgent messages without mention data
      for (const msg of urgentMessages) {
        if (newMap.has(msg.id)) continue; // Mention-based takes priority
        const createdAt = new Date(msg.created_at).getTime();
        const deadlineMs = createdAt + slaUrgenteMinutes * 60 * 1000;
        const deadline = new Date(deadlineMs);
        const remainingMs = deadlineMs - now;
        const remainingSeconds = Math.max(0, Math.floor(remainingMs / 1000));
        const isBreached = remainingMs <= 0;
        const isWarning = reminderEnabled && !isBreached && remainingMs <= warningMinutes * 60 * 1000;
        newMap.set(msg.id, { remainingSeconds, isBreached, isWarning, isEscalated: false, deadline });
      }

      setCountdowns(newMap);
    };

    calculate();
    intervalRef.current = setInterval(calculate, 1000);
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [messages, pendingMentions, slaConfig?.enabled, slaUrgenteMinutes, warningMinutes, reminderEnabled]);

  return { countdowns, pendingMentions, refetchMentions: fetchPendingMentions };
}

export function formatCountdown(totalSeconds: number): string {
  if (totalSeconds <= 0) return "00:00";
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
