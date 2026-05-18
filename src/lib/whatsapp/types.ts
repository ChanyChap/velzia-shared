// ============================================================
// WhatsApp Communications Module — TypeScript Types
// ============================================================

// --- Database Row Types ---

export interface WaLabel {
  id: string;
  tenant_id: string;
  name: string;
  color: string;
  description: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface WaTeam {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  color: string;
  created_at: string;
  updated_at: string;
  members?: WaTeamMember[];
}

export interface WaTeamMember {
  id: string;
  team_id: string;
  profile_id: string;
  role: "leader" | "member";
  created_at: string;
  profile?: { full_name: string; avatar_url: string | null; email: string };
}

export interface WaContact {
  id: string;
  tenant_id: string;
  wa_id: string;
  phone: string;
  name: string | null;
  display_name?: string | null;
  profile_picture_url: string | null;
  cliente_id: string | null;
  lead_id: string | null;
  bsuid: string | null; // WhatsApp Business Scoped User ID (June 2026+)
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type ConversationStatus = "open" | "assigned" | "pending" | "resolved" | "closed";
export type ConversationPriority = "low" | "normal" | "high" | "urgent";

export interface WaConversation {
  id: string;
  tenant_id: string;
  contact_id: string;
  assigned_to: string | null;
  // Responsable explícito de responder al cliente (SLA tracking).
  // Distinto de assigned_to: assignees son varios, responsible es uno solo.
  // Migration 740.
  responsible_user_id?: string | null;
  team_id: string | null;
  stage_id: string | null;
  status: ConversationStatus;
  priority: ConversationPriority;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_message_direction: "inbound" | "outbound" | null;
  // Estado real del último mensaje saliente no-interno (sent/delivered/read/failed).
  // Mantenido por trigger en wa_messages (migración 743). Antes el listado asumía
  // siempre "read" y pintaba todo en azul aunque no se hubiera leído.
  last_outbound_message_status?: MessageStatus | null;
  // Timestamps mantenidos por trigger DB (migration 740) — para cálculo de SLA.
  last_client_message_at?: string | null;
  last_internal_response_at?: string | null;
  unread_count: number;
  window_expires_at: string | null;
  is_group: boolean;
  group_name: string | null;
  group_participants: unknown[];
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  line_id: string | null;
  proyecto_id: string | null;
  // Joined relations
  contact?: WaContact;
  labels?: WaLabel[];
  assigned_agent?: { full_name: string; avatar_url: string | null };
  assignees?: WaConversationAssignee[];
  team?: WaTeam;
  stage?: WaStage;
}

export interface WaConversationAssignee {
  id: string;
  conversation_id: string;
  profile_id: string;
  assigned_by: string | null;
  assigned_at: string;
  profile?: { full_name: string; avatar_url: string | null };
}

export type MessageType =
  | "text" | "image" | "video" | "audio" | "document" | "sticker"
  | "location" | "contacts" | "template" | "interactive" | "reaction"
  | "call_log" | "note";

export type MessageDirection = "inbound" | "outbound";
export type MessageSenderType = "contact" | "agent" | "system" | "bot";
export type MessageStatus = "pending" | "sent" | "delivered" | "read" | "failed";

export interface WaMessage {
  id: string;
  tenant_id: string;
  conversation_id: string;
  wa_message_id: string | null;
  direction: MessageDirection;
  sender_type: MessageSenderType;
  sender_id: string | null;
  message_type: MessageType;
  content: string | null;
  media_url: string | null;
  media_mime_type: string | null;
  media_filename: string | null;
  media_size: number | null;
  template_name: string | null;
  template_params: Record<string, unknown> | null;
  interactive_data: Record<string, unknown> | null;
  location_data: { latitude: number; longitude: number; name?: string; address?: string } | null;
  reaction_emoji: string | null;
  quoted_message_id: string | null;
  status: MessageStatus;
  error_message: string | null;
  is_internal_note: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  // Joined
  sender?: { full_name: string; avatar_url: string | null };
  quoted_message?: WaMessage;
}

export type TemplateCategory = "UTILITY" | "MARKETING" | "AUTHENTICATION";
export type TemplateStatus = "draft" | "pending" | "approved" | "rejected";

export interface WaTemplate {
  id: string;
  tenant_id: string;
  name: string;
  language: string;
  category: TemplateCategory;
  status: TemplateStatus;
  header_type: "text" | "image" | "video" | "document" | null;
  header_content: string | null;
  body_text: string;
  footer_text: string | null;
  buttons: TemplateButton[];
  sample_values: Record<string, string>;
  meta_template_id: string | null;
  rejection_reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface TemplateButton {
  type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER";
  text: string;
  url?: string;
  phone_number?: string;
}

export type CallStatus = "initiated" | "ringing" | "in_progress" | "completed" | "missed" | "failed" | "voicemail";
export type CallPermissionStatus = "pending" | "accepted" | "rejected";

export interface WaCall {
  id: string;
  tenant_id: string;
  conversation_id: string | null;
  contact_id: string;
  agent_id: string | null;
  direction: "inbound" | "outbound";
  status: CallStatus;
  duration_seconds: number | null;
  recording_url: string | null;
  recording_duration_seconds: number | null;
  transcription: string | null;
  wa_call_id: string | null;
  call_provider: "whatsapp" | "zadarma";
  zadarma_call_id: string | null;
  zadarma_recording_id: string | null;
  call_permission_status: CallPermissionStatus | null;
  sdp_data: { offer?: string; answer?: string } | null;
  notes: string | null;
  started_at: string;
  answered_at: string | null;
  ended_at: string | null;
  created_at: string;
  // Joined
  contact?: WaContact;
  agent?: { full_name: string; avatar_url: string | null };
}

export interface WaStage {
  id: string;
  tenant_id: string;
  name: string;
  color: string;
  sort_order: number;
  is_final: boolean;
  created_at: string;
}

export interface WaQuickReply {
  id: string;
  tenant_id: string;
  shortcut: string;
  title: string;
  content: string;
  media_url: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// --- WhatsApp Cloud API Types ---

export interface WhatsAppWebhookPayload {
  object: "whatsapp_business_account";
  entry: WhatsAppWebhookEntry[];
}

export interface WhatsAppWebhookEntry {
  id: string;
  changes: WhatsAppWebhookChange[];
}

export interface WhatsAppWebhookChange {
  value: {
    messaging_product: "whatsapp";
    metadata: { display_phone_number: string; phone_number_id: string };
    contacts?: { profile: { name: string }; wa_id: string }[];
    messages?: WhatsAppIncomingMessage[];
    statuses?: WhatsAppMessageStatus[];
    // WhatsApp Calling API events
    calls?: WhatsAppCallEvent[];
  };
  field: "messages" | "calls";
}

// --- WhatsApp Business Calling API Types ---

export interface WhatsAppCallEvent {
  id: string;
  from: string;
  to: string;
  event: "connect" | "ringing" | "terminate" | "offer" | "answer";
  timestamp: string;
  direction: "USER_INITIATED" | "BUSINESS_INITIATED";
  session?: {
    sdp: string;
    sdp_type: "offer" | "answer";
  };
  duration?: number;
  disconnect_reason?: string;
}

export interface WhatsAppIncomingMessage {
  from: string;
  id: string;
  timestamp: string;
  type: "text" | "image" | "video" | "audio" | "document" | "sticker" | "location" | "contacts" | "interactive" | "button" | "reaction";
  text?: { body: string };
  image?: WhatsAppMediaInfo;
  video?: WhatsAppMediaInfo;
  audio?: WhatsAppMediaInfo;
  document?: WhatsAppMediaInfo & { filename: string };
  sticker?: WhatsAppMediaInfo;
  location?: { latitude: number; longitude: number; name?: string; address?: string };
  contacts?: unknown[];
  interactive?: { type: string; button_reply?: { id: string; title: string }; list_reply?: { id: string; title: string } };
  reaction?: { message_id: string; emoji: string };
  context?: { from: string; id: string };
}

export interface WhatsAppMediaInfo {
  id: string;
  mime_type: string;
  sha256?: string;
  caption?: string;
}

export interface WhatsAppMessageStatus {
  id: string;
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: string;
  recipient_id: string;
  errors?: { code: number; title: string }[];
}

// --- Phone Lines ---

export type PhoneLineProvider = "whatsapp" | "zadarma";
export type PhoneLineStatus = "pending" | "active" | "suspended" | "disconnected";

export interface WaPhoneLine {
  id: string;
  tenant_id: string;
  name: string;
  phone_number: string;
  phone_number_id: string | null;
  business_account_id: string | null;
  access_token: string | null;
  webhook_verify_token: string | null;
  provider: PhoneLineProvider;
  zadarma_api_key: string | null;
  zadarma_api_secret: string | null;
  zadarma_sip_id: string | null;
  status: PhoneLineStatus;
  is_default: boolean;
  color: string;
  description: string | null;
  greeting_message: string | null;
  away_message: string | null;
  business_hours: {
    enabled: boolean;
    timezone: string;
    schedule: Record<string, { start: string; end: string; enabled: boolean }>;
  };
  auto_assign_team_id: string | null;
  auto_assign_role: string | null;
  max_concurrent_chats: number;
  quality_rating: "green" | "yellow" | "red";
  messaging_limit: number;
  calling_enabled: boolean;
  created_at: string;
  updated_at: string;
  // Joined
  team_access?: WaLineTeamAccess[];
  agent_access?: WaLineAgentAccess[];
  role_access?: WaLineRoleAccess[];
}

export interface WaLineTeamAccess {
  id: string;
  line_id: string;
  team_id: string;
  can_view: boolean;
  can_send: boolean;
  can_manage: boolean;
  created_at: string;
  team?: WaTeam;
}

export interface WaLineRoleAccess {
  id: string;
  line_id: string;
  role: string;
  tenant_id: string;
  created_at: string;
}

export interface WaUserCommsSettings {
  id: string;
  profile_id: string;
  tenant_id: string;
  see_all_conversations: boolean;
  created_at: string;
  updated_at: string;
}

export interface WaLineAgentAccess {
  id: string;
  line_id: string;
  profile_id: string;
  can_view: boolean;
  can_send: boolean;
  created_at: string;
  profile?: { full_name: string; avatar_url: string | null };
}

// --- Automations ---

export type AutomationTriggerType =
  | "new_message"
  | "new_conversation"
  | "keyword_match"
  | "contact_created"
  | "no_reply_timeout"
  | "business_hours_start"
  | "business_hours_end"
  | "label_added"
  | "stage_changed"
  | "conversation_assigned"
  | "conversation_resolved"
  | "manual"
  | "webhook_received"
  | "scheduled";

export type AutomationStepType =
  | "send_message"
  | "send_template"
  | "assign_agent"
  | "assign_team"
  | "add_label"
  | "remove_label"
  | "set_stage"
  | "wait"
  | "condition"
  | "webhook"
  | "close_conversation"
  | "transfer_line"
  | "send_media"
  | "internal_note";

export interface AutomationStep {
  id: string;
  type: AutomationStepType;
  config: Record<string, unknown>;
  // For conditions: branch paths
  on_true?: AutomationStep[];
  on_false?: AutomationStep[];
}

export interface WaAutomation {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  trigger_type: AutomationTriggerType;
  trigger_config: Record<string, unknown>;
  applies_to_lines: string[];
  applies_to_all_lines: boolean;
  steps: AutomationStep[];
  times_triggered: number;
  last_triggered_at: string | null;
  created_by: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface WaAutomationLog {
  id: string;
  tenant_id: string;
  automation_id: string;
  conversation_id: string | null;
  contact_id: string | null;
  status: "running" | "completed" | "failed" | "skipped";
  steps_executed: Record<string, unknown>[];
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
}

// --- UI State Types ---

export type InboxFilter = "all" | "mine" | "unassigned" | "team" | "unanswered" | "automation_broadcast";
export type InboxStatusFilter = "open" | "closed" | "all";
export type InboxTab = "inbox" | "contacts" | "calls" | "templates" | "labels" | "stages" | "teams" | "automations" | "lines" | "settings";

export interface InboxState {
  selectedConversationId: string | null;
  filter: InboxFilter;
  statusFilter: InboxStatusFilter;
  filterLabel: string | null;
  filterStage: string | null;
  filterLine: string | null;
  filterTeam: string | null;
  searchQuery: string;
  showContactPanel: boolean;
  activeTab: InboxTab;
}
