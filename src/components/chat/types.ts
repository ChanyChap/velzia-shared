export interface ChatMessage {
  id: string;
  channel_id: string;
  sender_id: string;
  content: string;
  reply_to_id: string | null;
  reply_to?: { content: string; sender_name: string; created_at?: string } | null;
  attachments: ChatAttachment[];
  edited_at: string | null;
  deleted_at: string | null;
  created_at: string;
  priority: "normal" | "urgente" | "tarea";
  sender: {
    id: string;
    full_name: string;
    avatar_url: string | null;
    role: string;
  };
  read_by?: {
    user_id: string;
    full_name: string;
    read_at: string;
  }[];
  mentions?: {
    id: string;
    mentioned_user_id: string;
    mentioned_user_name?: string;
    task_status: "pendiente" | "realizada" | null;
    task_completed_at: string | null;
    project_task_id?: string | null;
  }[];
}

export interface ChatAttachment {
  name: string;
  url: string;
  type: string;
  size: number;
  thumbnail_url?: string;
}

export interface TeamMember {
  id: string;
  full_name: string;
  avatar_url: string | null;
  role: string;
}

export interface DocumentDetection {
  type: string;
  label: string;
  path: string;
}

export interface ChatSlaConfig {
  sla_urgente_minutes: number;
  sla_normal_minutes: number;
  enabled: boolean;
  pre_breach_reminder_minutes?: number;
  pre_breach_reminder_enabled?: boolean;
}

export interface PendingMention {
  id: string;
  message_id: string;
  channel_id: string;
  mentioned_user_id: string;
  sender_id: string;
  priority: "normal" | "urgente" | "tarea";
  created_at: string;
  resolved_at: string | null;
  sla_deadline: string;
  notified_at: string | null;
  escalated_at: string | null;
}
