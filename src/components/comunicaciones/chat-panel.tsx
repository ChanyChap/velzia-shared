"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createClient } from "../../lib/supabase-client";
import { MessageBubble } from "./message-bubble";
import { ResponsibleSelect } from "./responsible-select";
import {
  Send, Paperclip, Mic, Phone, PhoneCall, MoreVertical, Smartphone,
  Image as ImageIcon, FileText, MapPin, LayoutTemplate, X,
  ChevronDown, User, Tag, ArrowRight, ArrowLeft, StickyNote,
  CheckCheck, AlertCircle, UserPlus, RotateCcw, Archive,
  EyeOff, Circle, Sparkles, Loader2, ClipboardList, Calendar, Clock, Smile,
  MessageSquareReply, GitBranch, UserCog, Briefcase,
} from "lucide-react";
import { cn, normalizeText } from "../../lib/utils";
import { canAccessPhoneLine, isAdminCommsRole } from "../../lib/whatsapp/line-permissions";
import { useToast } from "../../hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { LOST_REASONS } from "../../lib/crm";
import type { CrmLossReason } from "../../lib/types";
import type {
  WaConversation, WaMessage, WaLabel, WaStage, WaTeam, WaPhoneLine, WaQuickReply,
} from "../../lib/whatsapp/types";

interface ChatPanelProps {
  conversation: WaConversation;
  profile: any;
  tenantId: string;
  labels: WaLabel[];
  stages: WaStage[];
  agents: any[];
  teams: WaTeam[];
  phoneLines?: WaPhoneLine[];
  myTeamIds?: string[];
  onToggleContactPanel: () => void;
  onToggleCallPanel: () => void;
  onConversationUpdate: () => void;
  onBack?: () => void;
}

export function ChatPanel({
  conversation,
  profile,
  tenantId,
  labels,
  stages,
  agents,
  teams: _teams,
  phoneLines,
  onToggleContactPanel,
  onToggleCallPanel,
  onConversationUpdate,
  onBack,
  myTeamIds,
}: ChatPanelProps) {
  const supabase = createClient();
  const { toast } = useToast();
  const [messages, setMessages] = useState<WaMessage[]>([]);
  const [messageText, setMessageText] = useState("");
  const [sending, setSending] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showQuickActions, setShowQuickActions] = useState(false);
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [quickReplies, setQuickReplies] = useState<WaQuickReply[]>([]);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [showAssignDropdown, setShowAssignDropdown] = useState(false);
  const [assignSearch, setAssignSearch] = useState("");
  const [showLabelDropdown, setShowLabelDropdown] = useState(false);
  const [showStageDropdown, setShowStageDropdown] = useState(false);
  const [showMentions, setShowMentions] = useState(false);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDate, setTaskDate] = useState("");
  const [taskTime, setTaskTime] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [taskPriority, setTaskPriority] = useState("media");
  const [taskType, setTaskType] = useState("otro");
  const [creatingTask, setCreatingTask] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionStartIdx, setMentionStartIdx] = useState(-1);
  const [correcting, setCorrecting] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [sendLineId, setSendLineId] = useState<string | null>(null);
  const [showLineSelector, setShowLineSelector] = useState(false);
  const [showCallMenu, setShowCallMenu] = useState(false);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [availableTemplates, setAvailableTemplates] = useState<any[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<any | null>(null);
  const [templateParams, setTemplateParams] = useState<Record<string, string>>({});
  const [templateHeaderMedia, setTemplateHeaderMedia] = useState<{ url: string; filename: string; waMediaId?: string } | null>(null);
  const [uploadingHeaderMedia, setUploadingHeaderMedia] = useState(false);
  const [optimisticAssignees, setOptimisticAssignees] = useState<Set<string> | null>(null);
  const [optimisticLabels, setOptimisticLabels] = useState<Set<string> | null>(null);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [reactionMessageId, setReactionMessageId] = useState<string | null>(null);
  const [replyToMessage, setReplyToMessage] = useState<WaMessage | null>(null);
  const assignOpsInFlight = useRef(0);
  const labelOpsInFlight = useRef(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const contact = conversation.contact;
  const displayName = contact?.display_name || contact?.name || contact?.phone || "Desconocido";
  const linkedLeadId = contact?.lead_id || null;
  const isClosed = conversation.status === "resolved" || conversation.status === "closed";

  // CRM/Project stages for linked leads
  const [crmStages, setCrmStages] = useState<{ key: string; label: string; color: string }[]>([]);
  const [leadStage, setLeadStage] = useState<string | null>((conversation as any).lead_stage || null);
  const [usingProjectStatuses, setUsingProjectStatuses] = useState(false);
  const [linkedProyectoId, setLinkedProyectoId] = useState<string | null>(conversation.proyecto_id || null);
  const [linkedFunnelId, setLinkedFunnelId] = useState<string | null>(null);

  // Pipeline + comercial del lead vinculado (controles "al lado de Etiquetas")
  const [crmFunnels, setCrmFunnels] = useState<{ id: string; name: string }[]>([]);
  const [leadAssignedTo, setLeadAssignedTo] = useState<string | null>(null);
  const [showPipelineDropdown, setShowPipelineDropdown] = useState(false);
  const [showLeadStageDropdown, setShowLeadStageDropdown] = useState(false);
  const [showLeadCommercialDropdown, setShowLeadCommercialDropdown] = useState(false);
  const [leadCommercialSearch, setLeadCommercialSearch] = useState("");

  // Lost-reason modal (when the user picks "cerrado_perdido" from the chat stage dropdown)
  const [showLostForm, setShowLostForm] = useState(false);
  const [lostReason, setLostReason] = useState("");
  const [lostNotes, setLostNotes] = useState("");
  const [funnelLossReasons, setFunnelLossReasons] = useState<CrmLossReason[]>([]);
  const [savingLost, setSavingLost] = useState(false);

  useEffect(() => {
    if (!linkedLeadId) {
      setCrmStages([]);
      setCrmFunnels([]);
      setLeadAssignedTo(null);
      setLinkedFunnelId(null);
      return;
    }
    (async () => {
      try {
        const leadRes = await supabase
          .from("leads")
          .select("stage, funnel_id, proyecto_id, assigned_to")
          .eq("id", linkedLeadId)
          .single();
        const lead = leadRes.data;
        if (!lead) return;

        setLinkedFunnelId(lead.funnel_id || null);
        setLeadAssignedTo(lead.assigned_to || null);
        const proyectoId = lead.proyecto_id || conversation.proyecto_id;
        if (proyectoId) setLinkedProyectoId(proyectoId);

        // Cargar la lista de pipelines del tenant para el dropdown Pipeline
        const funnelRes = await fetch("/api/crm/funnels");
        const funnelsData = funnelRes.ok ? await funnelRes.json() : { funnels: [] };
        const allFunnels = (funnelsData.funnels || []).filter(
          (f: any) => f.is_active !== false
        );
        setCrmFunnels(allFunnels.map((f: any) => ({ id: f.id, name: f.name })));

        // If lead has a project → use project_statuses from that pipeline
        if (proyectoId) {
          const funnelParam = lead.funnel_id ? `?funnel_id=${lead.funnel_id}` : "";
          const statusRes = await fetch(`/api/project-statuses${funnelParam}`);
          if (statusRes.ok) {
            const { statuses } = await statusRes.json();
            if (statuses?.length > 0) {
              setCrmStages(statuses.map((s: any) => ({
                key: s.key, label: s.label, color: s.color || "#6B7280",
              })));
              setUsingProjectStatuses(true);
              // Get current project status
              const { data: proyecto } = await supabase
                .from("proyectos").select("status").eq("id", proyectoId).single();
              if (proyecto?.status) setLeadStage(proyecto.status);
              return;
            }
          }
        }

        // No project → use CRM funnel stages
        setLeadStage(lead.stage);
        setUsingProjectStatuses(false);
        const targetFunnel = lead.funnel_id
          ? allFunnels.find((f: any) => f.id === lead.funnel_id)
          : allFunnels[0];
        if (targetFunnel?.stages) {
          setCrmStages(targetFunnel.stages.filter((s: any) => !s.is_hidden).map((s: any) => ({
            key: s.key, label: s.label, color: s.color,
          })));
        }
      } catch (e) {
        console.error("[Chat] Error loading CRM stages for lead:", linkedLeadId, e);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedLeadId]);
  const allLines = phoneLines || [];
  // Deduplicate lines with same phone number (keep first = oldest)
  const uniqueLines = allLines.filter((line, idx, arr) =>
    arr.findIndex((l) => l.phone_number === line.phone_number) === idx
  );
  const conversationLine = allLines.find((l) => l.id === conversation.line_id) || null;
  const userIsAdmin = isAdminCommsRole(profile?.role);
  const visibleLines = userIsAdmin
    ? uniqueLines
    : uniqueLines.filter((line) =>
        canAccessPhoneLine({
          line: line as any,
          profileId: profile?.id,
          role: profile?.role,
          customRoleId: profile?.custom_role_id,
          teamIds: myTeamIds,
          mode: "send",
        })
      );
  const activeLines = visibleLines.filter((l) => l.status === "active");
  const selectedSendLine = visibleLines.find((l) => l.id === sendLineId) || null;
  const allowedConversationLine =
    !conversationLine || userIsAdmin
      ? conversationLine
      : canAccessPhoneLine({
          line: conversationLine as any,
          profileId: profile?.id,
          role: profile?.role,
          customRoleId: profile?.custom_role_id,
          teamIds: myTeamIds,
          mode: "send",
        })
        ? conversationLine
        : null;
  const effectiveSendLine = userIsAdmin
    ? selectedSendLine || conversationLine || activeLines.find((l) => l.is_default) || activeLines[0] || allLines[0] || null
    : selectedSendLine || allowedConversationLine || activeLines.find((l) => l.is_default) || activeLines[0] || visibleLines[0] || null;
  const outboundLineId = sendLineId || (!userIsAdmin ? effectiveSendLine?.id || null : null);

  // Reset optimistic state when switching to a different conversation
  const msgRequestId = useRef(0);
  const msgDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    setOptimisticAssignees(null);
    setOptimisticLabels(null);
    setSendLineId(null);
    assignOpsInFlight.current = 0;
    labelOpsInFlight.current = 0;
    // Close all dropdowns/overlays when switching conversations
    setShowAttachMenu(false);
    setShowQuickActions(false);
    setShowAssignDropdown(false);
    setShowLabelDropdown(false);
    setShowStageDropdown(false);
    setShowPipelineDropdown(false);
    setShowLeadStageDropdown(false);
    setShowLeadCommercialDropdown(false);
    setLeadCommercialSearch("");
    setShowCallMenu(false);
    setShowLineSelector(false);
    setShowTemplatePicker(false);
    setReplyToMessage(null);
    // Invalidate any in-flight message loads for the previous conversation
    msgRequestId.current++;
  }, [conversation.id]);

  // Load messages — uses requestId to discard stale responses
  // Paginates through ALL messages so no conversation gets truncated.
  const loadMessages = useCallback(async () => {
    const thisRequestId = ++msgRequestId.current;

    const PAGE_SIZE = 1000;
    const allMessages: any[] = [];
    let from = 0;

    // Fetch messages in pages of 1000 until we've drained the conversation.
    // Prevents Supabase's default maxRows cap from ever truncating history.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data, error } = await supabase
        .from("wa_messages")
        .select("*")
        .eq("conversation_id", conversation.id)
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);

      // Stale response — user switched conversation before this returned
      if (thisRequestId !== msgRequestId.current) return;

      if (error) {
        console.error("[ChatPanel] Error loading messages:", error);
        return;
      }

      if (!data || data.length === 0) break;
      allMessages.push(...data);
      if (data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }

    const agentMap = new Map(agents.map((a: any) => [a.id, a]));
    // Filtrar mensajes ocultos (notas superseded de la IA, razonamiento purgado).
    // Estas filas se mantienen en DB para auditoría pero no se muestran al usuario.
    const visible = allMessages.filter((m: any) => {
      const meta = m.metadata as Record<string, unknown> | null;
      return meta?.superseded !== true;
    });
    // Build a map of all messages for quoted message lookup
    const msgMap = new Map(visible.map((m: any) => [m.id, m]));
    setMessages(visible.map((m: any) => ({
      ...m,
      sender: m.sender_id ? agentMap.get(m.sender_id) || null : null,
      quoted_message: m.quoted_message_id ? msgMap.get(m.quoted_message_id) || null : null,
    })));

    // Mark as read
    await supabase
      .from("wa_conversations")
      .update({ unread_count: 0 })
      .eq("id", conversation.id)
      .eq("tenant_id", tenantId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.id, agents, tenantId]);

  // Load quick replies
  useEffect(() => {
    supabase
      .from("wa_quick_replies")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("shortcut")
      .then(({ data }) => setQuickReplies(data || []));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  // Debounced message reload for real-time events
  const debouncedLoadMessages = useCallback(() => {
    if (msgDebounceRef.current) clearTimeout(msgDebounceRef.current);
    msgDebounceRef.current = setTimeout(() => {
      loadMessages();
    }, 400);
  }, [loadMessages]);

  // Real-time messages
  useEffect(() => {
    const channel = supabase
      .channel(`wa-msgs-${conversation.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "wa_messages", filter: `conversation_id=eq.${conversation.id}` },
        () => { debouncedLoadMessages(); }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "wa_messages", filter: `conversation_id=eq.${conversation.id}` },
        () => { debouncedLoadMessages(); }
      )
      .subscribe();

    return () => {
      if (msgDebounceRef.current) clearTimeout(msgDebounceRef.current);
      supabase.removeChannel(channel);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.id, debouncedLoadMessages]);

  // Auto-scroll — jump to bottom on first load, smooth scroll on new messages (only if near bottom)
  const prevMessageCountRef = useRef(0);
  const initialScrollDoneRef = useRef(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const isNewMessage = messages.length > prevMessageCountRef.current;
    prevMessageCountRef.current = messages.length;
    if (!isNewMessage || messages.length === 0) return;

    // First load: jump to bottom instantly (no smooth, no distance check)
    if (!initialScrollDoneRef.current) {
      initialScrollDoneRef.current = true;
      // Use requestAnimationFrame to ensure DOM has rendered
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "instant" as ScrollBehavior });
      });
      return;
    }

    // Subsequent messages: only scroll if user is near the bottom (within 200px)
    const container = messagesContainerRef.current;
    if (container) {
      const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
      if (distanceFromBottom > 200) return; // User is reading history, don't scroll
    }
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Reset initial scroll flag when conversation changes
  useEffect(() => {
    initialScrollDoneRef.current = false;
    prevMessageCountRef.current = 0;
  }, [conversation.id]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [messageText]);

  // Quick reply / mention detection
  useEffect(() => {
    if (messageText.startsWith("/") && messageText.length > 1) {
      setShowQuickReplies(true);
    } else {
      setShowQuickReplies(false);
    }
  }, [messageText]);

  // Filtered mention suggestions
  const mentionSuggestions = useMemo(() => {
    if (!showMentions || !mentionQuery) return agents;
    const q = normalizeText(mentionQuery);
    return agents.filter((a: any) => normalizeText(a.full_name || "").includes(q));
  }, [showMentions, mentionQuery, agents]);

  async function handleCreateTask() {
    if (!taskTitle.trim() || creatingTask) return;
    setCreatingTask(true);
    try {
      const res = await fetch("/api/whatsapp/send-task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_id: conversation.id,
          title: taskTitle,
          description: taskDescription || undefined,
          due_date: taskDate || undefined,
          due_time: taskTime || undefined,
          priority: taskPriority,
          task_type: taskType,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Error al crear tarea");
      }
      // Reset form
      setShowTaskForm(false);
      setTaskTitle("");
      setTaskDate("");
      setTaskTime("");
      setTaskDescription("");
      setTaskPriority("media");
      setTaskType("otro");
    } catch (err: any) {
      setSendError(err.message || "Error al crear tarea");
      setTimeout(() => setSendError(null), 5000);
    } finally {
      setCreatingTask(false);
    }
  }

  async function handleSend() {
    if (!messageText.trim() || sending) return;
    if (!isInternalNote && !effectiveSendLine) {
      setSendError("No tienes acceso a ninguna linea activa para enviar desde este chat");
      setTimeout(() => setSendError(null), 5000);
      return;
    }
    setSending(true);
    setSendError(null);

    try {
      const res = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_id: conversation.id,
          message_type: "text",
          content: messageText.trim(),
          is_internal_note: isInternalNote,
          ...(outboundLineId && { line_id: outboundLineId }),
          ...(replyToMessage && { reply_to_message_id: replyToMessage.id }),
        }),
      });

      if (res.ok) {
        setMessageText("");
        setIsInternalNote(false);
        setReplyToMessage(null);
        loadMessages();
        onConversationUpdate();
      } else {
        const data = await res.json().catch(() => ({}));
        setSendError(data.error || "Error al enviar mensaje");
        setTimeout(() => setSendError(null), 5000);
      }
    } catch {
      setSendError("Error de conexion");
      setTimeout(() => setSendError(null), 5000);
    } finally {
      setSending(false);
    }
  }

  // --- Emoji reaction handler ---
  async function handleReaction(messageId: string, emoji: string) {
    // "__picker__" means user wants the full emoji picker for a reaction
    if (emoji === "__picker__") {
      setReactionMessageId(messageId);
      setShowEmojiPicker(true);
      return;
    }

    // Optimistically update the message in state
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, reaction_emoji: emoji } : m))
    );

    try {
      const res = await fetch("/api/whatsapp/react", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message_id: messageId, emoji }),
      });
      if (!res.ok) {
        // Revert on error
        loadMessages();
        const data = await res.json().catch(() => ({}));
        toast({ variant: "destructive", title: "Error", description: data.error || "No se pudo enviar la reaccion" });
      }
    } catch {
      loadMessages();
      toast({ variant: "destructive", title: "Error", description: "Error de conexion al enviar reaccion" });
    }
  }

  function handleEmojiSelect(emoji: string) {
    if (reactionMessageId) {
      // Sending as a reaction to a message
      handleReaction(reactionMessageId, emoji);
      setReactionMessageId(null);
    } else {
      // Inserting emoji into message text
      setMessageText((prev) => prev + emoji);
      textareaRef.current?.focus();
    }
    setShowEmojiPicker(false);
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setSending(true);
    try {
      // Upload directly to Supabase Storage from browser (bypasses Vercel 4.5MB body limit)
      const storagePath = `tenant/${tenantId}/wa-media/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { error: storageErr } = await supabase.storage
        .from("tenant-files")
        .upload(storagePath, file, { contentType: file.type || "application/octet-stream" });

      if (storageErr) {
        console.error("[ChatPanel] Storage upload error:", storageErr);
        setSendError("Error al subir archivo: " + (storageErr.message || "storage error"));
        setTimeout(() => setSendError(null), 5000);
        return;
      }

      const { data: urlData } = supabase.storage.from("tenant-files").getPublicUrl(storagePath);
      const storageUrl = urlData?.publicUrl || null;

      // Upload to WhatsApp via server (server downloads from storage URL, no large body)
      const formData = new FormData();
      formData.append("file", file);
      formData.append("mime_type", file.type);
      formData.append("filename", file.name);
      if (outboundLineId) formData.append("line_id", outboundLineId);

      const uploadRes = await fetch("/api/whatsapp/media", {
        method: "POST",
        body: formData,
      });

      // If server upload fails (e.g. file too large for Vercel), use storage URL directly
      let waMediaId: string | null = null;
      if (uploadRes.ok) {
        const uploadData = await uploadRes.json();
        waMediaId = uploadData.wa_media_id;
      } else {
        console.warn("[ChatPanel] Server media upload failed, using storage URL only");
      }

      let messageType = "document";
      if (file.type.startsWith("image/")) messageType = "image";
      else if (file.type.startsWith("video/")) messageType = "video";
      else if (file.type.startsWith("audio/")) messageType = "audio";

      const sendRes = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_id: conversation.id,
          message_type: messageType,
          media_url: storageUrl,
          wa_media_id: waMediaId,
          media_filename: file.name,
          content: messageText.trim() || undefined,
          ...(outboundLineId && { line_id: outboundLineId }),
          ...(replyToMessage && { reply_to_message_id: replyToMessage.id }),
        }),
      });

      if (sendRes.ok) {
        setMessageText("");
        setReplyToMessage(null);
        loadMessages();
        onConversationUpdate();
      } else {
        const errData = await sendRes.json().catch(() => ({}));
        setSendError(errData.error || "Error al enviar archivo");
        setTimeout(() => setSendError(null), 5000);
      }
    } finally {
      setSending(false);
      setShowAttachMenu(false);
      // Reset file input so same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  // --- Voice recording ---
  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      audioChunksRef.current = [];

      // Use ogg/opus if available (preferred by WhatsApp), then mp4 (Chrome 124+), then aac
      // IMPORTANT: audio/webm is NOT accepted by WhatsApp API, so we skip it entirely
      const mimeType = MediaRecorder.isTypeSupported("audio/ogg; codecs=opus")
        ? "audio/ogg; codecs=opus"
        : MediaRecorder.isTypeSupported("audio/mp4")
        ? "audio/mp4"
        : MediaRecorder.isTypeSupported("audio/aac")
        ? "audio/aac"
        : MediaRecorder.isTypeSupported("audio/webm; codecs=opus")
        ? "audio/webm; codecs=opus" // Last resort — may fail on WhatsApp
        : undefined; // let browser pick default

      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        // Clean up stream
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;

        if (audioChunksRef.current.length === 0) return;

        // Use the actual mimeType from the recorder (may differ from requested on iOS)
        const actualMime = recorder.mimeType || mimeType || "audio/mp4";
        const audioBlob = new Blob(audioChunksRef.current, { type: actualMime });
        audioChunksRef.current = [];

        // Send the recorded audio
        await sendVoiceNote(audioBlob, actualMime);
      };

      recorder.start(250); // collect chunks every 250ms
      setIsRecording(true);
      setRecordingDuration(0);

      // Timer for duration display
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.error("[Voice] Microphone access error:", err);
      setSendError("No se pudo acceder al microfono. Verifica los permisos.");
      setTimeout(() => setSendError(null), 5000);
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    setIsRecording(false);
    setRecordingDuration(0);
  }

  function cancelRecording() {
    // Stop without sending
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.ondataavailable = null;
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    audioChunksRef.current = [];
    setIsRecording(false);
    setRecordingDuration(0);
  }

  async function sendVoiceNote(audioBlob: Blob, mimeType: string) {
    setSending(true);
    try {
      const ext = mimeType.includes("ogg") ? "ogg" : mimeType.includes("mp4") ? "m4a" : mimeType.includes("aac") ? "aac" : "webm";
      const filename = `voice_note_${Date.now()}.${ext}`;

      const formData = new FormData();
      formData.append("file", audioBlob, filename);
      formData.append("mime_type", mimeType);
      formData.append("filename", filename);
      if (outboundLineId) formData.append("line_id", outboundLineId);

      const uploadRes = await fetch("/api/whatsapp/media", {
        method: "POST",
        body: formData,
      });

      if (!uploadRes.ok) {
        const errData = await uploadRes.json().catch(() => ({}));
        setSendError(errData.error || "Error al subir nota de voz");
        setTimeout(() => setSendError(null), 5000);
        return;
      }

      const uploadData = await uploadRes.json();

      const sendRes = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_id: conversation.id,
          message_type: "audio",
          media_url: uploadData.storage_url,
          wa_media_id: uploadData.wa_media_id,
          media_filename: filename,
          ...(outboundLineId && { line_id: outboundLineId }),
          ...(replyToMessage && { reply_to_message_id: replyToMessage.id }),
        }),
      });

      if (sendRes.ok) {
        setReplyToMessage(null);
        loadMessages();
        onConversationUpdate();
      } else {
        const errData = await sendRes.json().catch(() => ({}));
        setSendError(errData.error || "Error al enviar nota de voz");
        setTimeout(() => setSendError(null), 5000);
      }
    } finally {
      setSending(false);
    }
  }

  function formatRecordingTime(seconds: number) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  // --- Template picker ---
  async function openTemplatePicker() {
    setShowTemplatePicker(true);
    setSelectedTemplate(null);
    setTemplateParams({});
    setLoadingTemplates(true);
    try {
      // First try to load local templates
      const res = await fetch("/api/whatsapp/templates");
      const data = await res.json();
      let approved = (data.templates || []).filter((t: any) => t.status === "approved");

      // Filter by current sending line — ONLY show templates assigned to this line
      const currentLineId = effectiveSendLine?.id || null;
      if (currentLineId) {
        approved = approved.filter((t: any) => {
          const tLineId = t.line_id || t.wa_phone_lines?.id || null;
          return tLineId === currentLineId;
        });
      }

      // If no approved templates locally, try sync from Meta
      if (approved.length === 0) {
        try {
          const syncRes = await fetch("/api/whatsapp/templates?action=sync");
          const syncData = await syncRes.json();
          if (syncRes.ok && syncData.templates) {
            let synced = syncData.templates.filter((t: any) => t.status === "approved");
            if (currentLineId) {
              synced = synced.filter((t: any) => {
                const tLineId = t.line_id || t.wa_phone_lines?.id || null;
                return tLineId === currentLineId;
              });
            }
            approved = synced;
          }
        } catch {
          // Sync failed, continue with whatever we have
        }
      }

      // Sort by most used per user — count how many times each template was sent by this user
      try {
        const { data: usageCounts } = await supabase
          .from("wa_messages")
          .select("template_name")
          .eq("sender_id", profile?.id)
          .eq("message_type", "template")
          .not("template_name", "is", null);

        if (usageCounts && usageCounts.length > 0) {
          const counts: Record<string, number> = {};
          for (const row of usageCounts) {
            if (row.template_name) {
              counts[row.template_name] = (counts[row.template_name] || 0) + 1;
            }
          }
          approved.sort((a: any, b: any) => {
            const countA = counts[a.name] || 0;
            const countB = counts[b.name] || 0;
            return countB - countA;
          });
        }
      } catch {
        // If usage count fails, keep default order
      }

      setAvailableTemplates(approved);
    } catch {
      setSendError("Error cargando plantillas");
      setTimeout(() => setSendError(null), 5000);
    }
    setLoadingTemplates(false);
  }

  function selectTemplate(template: any) {
    setSelectedTemplate(template);
    setTemplateHeaderMedia(null);
    // Extract variable placeholders from body_text like {{1}}, {{2}}
    const matches = template.body_text.match(/\{\{(\d+)\}\}/g) || [];
    const params: Record<string, string> = {};
    const uniqueVars = Array.from(new Set(matches));
    for (const m of uniqueVars) {
      const key = (m as string).replace(/[{}]/g, "");
      params[key] = template.sample_values?.[key] || "";
    }
    setTemplateParams(params);
  }

  async function handleTemplateHeaderUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingHeaderMedia(true);
    try {
      // Upload directly to Supabase Storage from browser (bypasses Vercel 4.5MB body limit)
      const safeName = file.name
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, "_")
        .replace(/[^a-zA-Z0-9._-]/g, "");
      const storagePath = `tenant/${tenantId}/wa-template-headers/${Date.now()}_${safeName}`;

      const { error: storageErr } = await supabase.storage
        .from("tenant-files")
        .upload(storagePath, file, { contentType: file.type || "application/octet-stream" });

      if (storageErr) {
        console.error("[ChatPanel] Template header upload error:", storageErr);
        setSendError("Error al subir archivo: " + (storageErr.message || "storage error"));
        setTimeout(() => setSendError(null), 5000);
        return;
      }

      const { data: urlData } = supabase.storage.from("tenant-files").getPublicUrl(storagePath);
      const publicUrl = urlData?.publicUrl;

      if (!publicUrl) {
        setSendError("Error al obtener URL del archivo subido");
        setTimeout(() => setSendError(null), 5000);
        return;
      }

      setTemplateHeaderMedia({
        url: publicUrl,
        filename: file.name,
      });
    } catch {
      setSendError("Error al subir archivo");
      setTimeout(() => setSendError(null), 5000);
    } finally {
      setUploadingHeaderMedia(false);
      e.target.value = "";
    }
  }

  async function handleSendTemplate() {
    if (!selectedTemplate || sending) return;
    setSending(true);
    setSendError(null);

    try {
      // Build WhatsApp API components format
      const paramKeys = Object.keys(templateParams).sort((a, b) => Number(a) - Number(b));
      const paramValues = paramKeys.map((k) => templateParams[k] || "");

      // Build template_components in Meta API format
      const templateComponents: any[] = [];

      // Header component for document/image/video templates
      const ht = selectedTemplate.header_type;
      if (ht === "document" || ht === "image" || ht === "video") {
        if (!templateHeaderMedia) {
          setSendError("Debes adjuntar un archivo para el header de esta plantilla");
          setSending(false);
          return;
        }
        const mediaParam: any = { type: ht };
        mediaParam[ht] = { link: templateHeaderMedia.url, ...(ht === "document" && { filename: templateHeaderMedia.filename }) };
        templateComponents.push({ type: "header", parameters: [mediaParam] });
      } else if (ht === "text" && selectedTemplate.header_content) {
        // Text headers with variables — check if header has {{1}} style vars
        const headerVarMatch = selectedTemplate.header_content.match(/\{\{(\d+)\}\}/g);
        if (headerVarMatch) {
          templateComponents.push({
            type: "header",
            parameters: headerVarMatch.map(() => ({ type: "text", text: selectedTemplate.header_content.replace(/\{\{\d+\}\}/g, "").trim() || selectedTemplate.header_content })),
          });
        }
      }

      if (paramValues.length > 0) {
        templateComponents.push({
          type: "body",
          parameters: paramValues.map((v) => ({ type: "text", text: v })),
        });
      }

      // Build preview text for message storage
      const previewText = Object.entries(templateParams).reduce(
        (text, [key, val]) => text.replace(`{{${key}}}`, val || `{{${key}}}`),
        selectedTemplate.body_text
      );

      const res = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_id: conversation.id,
          message_type: "template",
          template_name: selectedTemplate.name,
          template_language: selectedTemplate.language,
          template_components: templateComponents.length > 0 ? templateComponents : undefined,
          content: previewText,
          ...(templateHeaderMedia && { media_url: templateHeaderMedia.url, media_filename: templateHeaderMedia.filename }),
          ...(outboundLineId && { line_id: outboundLineId }),
        }),
      });

      if (res.ok) {
        setShowTemplatePicker(false);
        setSelectedTemplate(null);
        setTemplateParams({});
        setTemplateHeaderMedia(null);
        loadMessages();
        onConversationUpdate();
      } else {
        const data = await res.json().catch(() => ({}));
        setSendError(data.error || "Error al enviar plantilla");
        setTimeout(() => setSendError(null), 5000);
      }
    } catch {
      setSendError("Error de conexion");
      setTimeout(() => setSendError(null), 5000);
    } finally {
      setSending(false);
    }
  }

  // --- Assignment (multi-assign with optimistic UI) ---
  async function handleToggleAssignee(agentId: string) {
    setAssignError(null);

    // Build current set from DB data
    const currentIds = new Set<string>();
    if (conversation.assigned_to) currentIds.add(conversation.assigned_to);
    conversation.assignees?.forEach((a) => currentIds.add(a.profile_id));

    // Apply optimistic toggle
    const newIds = new Set(optimisticAssignees || currentIds);
    const wasAssigned = newIds.has(agentId);
    if (wasAssigned) {
      newIds.delete(agentId);
    } else {
      newIds.add(agentId);
    }
    setOptimisticAssignees(newIds);
    assignOpsInFlight.current++;

    try {
      if (wasAssigned) {
        // Remove from multi-assign table
        const { error } = await supabase
          .from("wa_conversation_assignees")
          .delete()
          .eq("conversation_id", conversation.id)
          .eq("profile_id", agentId);
        if (error) throw new Error(error.message);

        // If this was the primary, promote next or clear
        if (conversation.assigned_to === agentId) {
          const nextPrimary = Array.from(newIds)[0] || null;
          await supabase
            .from("wa_conversations")
            .update({ assigned_to: nextPrimary, status: nextPrimary ? "assigned" : "open" })
            .eq("id", conversation.id)
            .eq("tenant_id", tenantId);
        }
      } else {
        // Add assignee (upsert to avoid duplicate key errors)
        const { error } = await supabase
          .from("wa_conversation_assignees")
          .upsert({
            conversation_id: conversation.id,
            profile_id: agentId,
            assigned_by: profile.id,
          }, { onConflict: "conversation_id,profile_id" });
        if (error) throw new Error(error.message);

        // Sync primary into assignees table too (upsert ignores if exists)
        if (conversation.assigned_to && conversation.assigned_to !== agentId) {
          await supabase
            .from("wa_conversation_assignees")
            .upsert({
              conversation_id: conversation.id,
              profile_id: conversation.assigned_to,
              assigned_by: profile.id,
            }, { onConflict: "conversation_id,profile_id" });
        }

        // Set as primary if none
        if (!conversation.assigned_to) {
          await supabase
            .from("wa_conversations")
            .update({ assigned_to: agentId, status: "assigned" })
            .eq("id", conversation.id)
            .eq("tenant_id", tenantId);
        }
      }

      // Send notification to the newly assigned agent (not on removal, not to self)
      if (!wasAssigned && agentId !== profile.id) {
        fetch("/api/notifications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: agentId,
            type: "conversation_assigned",
            title: "Te han asignado una conversación",
            message: `${displayName} — asignado por ${profile.full_name || "un compañero"}`,
            link: `/comunicaciones?conversation=${conversation.id}`,
            entity_type: "wa_conversation",
            entity_id: conversation.id,
          }),
        }).catch((err) => console.error("[Notify] Error sending assignment notification:", err));
      }

      await onConversationUpdate();
    } catch (err: any) {
      console.error("[MultiAssign] Error:", err.message);
      setAssignError(err.message?.includes("does not exist")
        ? "Falta ejecutar migracion 124 en Supabase"
        : "Error al asignar: " + err.message
      );
    } finally {
      assignOpsInFlight.current--;
      if (assignOpsInFlight.current === 0) {
        setOptimisticAssignees(null);
      }
    }
  }

  // --- Label toggle on conversation (optimistic UI) ---
  async function handleToggleLabel(labelId: string) {
    // Build current set from optimistic state (if active) or server state
    const currentIds = new Set(conversation.labels?.map((l: any) => l.id) || []);
    const newIds = new Set(optimisticLabels || currentIds);
    const hadLabel = newIds.has(labelId);

    if (hadLabel) {
      newIds.delete(labelId);
    } else {
      newIds.add(labelId);
    }
    setOptimisticLabels(newIds);
    labelOpsInFlight.current++;

    try {
      if (hadLabel) {
        await supabase
          .from("wa_conversation_labels")
          .delete()
          .eq("conversation_id", conversation.id)
          .eq("label_id", labelId);
      } else {
        await supabase
          .from("wa_conversation_labels")
          .insert({ conversation_id: conversation.id, label_id: labelId });
      }
      await onConversationUpdate();
    } catch {
      // DB error — server data will reflect reality after reload
    } finally {
      labelOpsInFlight.current--;
      if (labelOpsInFlight.current === 0) {
        setOptimisticLabels(null);
      }
    }
  }

  async function handleSetStage(stageId: string | null, crmStageKey?: string) {
    if (linkedLeadId && crmStageKey !== undefined) {
      // If the user is moving the lead to "cerrado_perdido" from the chat header,
      // open the lost-reason modal (the API requires lost_reason for this stage).
      // Only applies to CRM funnel stages — project statuses have their own lifecycle.
      if (!usingProjectStatuses && crmStageKey === "cerrado_perdido") {
        if (linkedFunnelId) {
          try {
            const res = await fetch(`/api/crm/loss-reasons?funnel_id=${linkedFunnelId}`);
            if (res.ok) {
              const data = await res.json();
              const active = (data.loss_reasons || []).filter((r: CrmLossReason) => r.is_active);
              setFunnelLossReasons(active);
            } else {
              setFunnelLossReasons([]);
            }
          } catch {
            setFunnelLossReasons([]);
          }
        } else {
          setFunnelLossReasons([]);
        }
        setLostReason("");
        setLostNotes("");
        setShowLostForm(true);
        return;
      }

      try {
        if (usingProjectStatuses && linkedProyectoId) {
          // Update project status directly
          const { error } = await supabase
            .from("proyectos")
            .update({ status: crmStageKey })
            .eq("id", linkedProyectoId)
            .eq("tenant_id", tenantId);
          if (error) throw new Error(error.message);
        } else {
          // Sync to CRM lead stage
          const res = await fetch("/api/crm/leads", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: linkedLeadId, stage: crmStageKey }),
          });
          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || "Error actualizando etapa");
          }
        }
        setLeadStage(crmStageKey);
        // Store in conversation for quick reference
        await supabase
          .from("wa_conversations")
          .update({ lead_stage: crmStageKey })
          .eq("id", conversation.id)
          .eq("tenant_id", tenantId);
      } catch (e: any) {
        console.error("[Chat] Error updating stage:", e);
        toast({ title: "Error al cambiar etapa", description: e.message || "Inténtalo de nuevo", variant: "destructive" });
        return;
      }
    } else {
      const { error } = await supabase
        .from("wa_conversations")
        .update({ stage_id: stageId })
        .eq("id", conversation.id)
        .eq("tenant_id", tenantId);
      if (error) {
        console.error("[Chat] Error updating wa stage:", error);
        toast({ title: "Error al cambiar etapa", description: error.message, variant: "destructive" });
        return;
      }
    }
    onConversationUpdate();
  }

  // Cambiar el pipeline (funnel) del lead vinculado y refrescar las etapas
  async function handleSetLeadFunnel(funnelId: string) {
    if (!linkedLeadId) return;
    try {
      const res = await fetch("/api/crm/leads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: linkedLeadId, funnel_id: funnelId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Error actualizando pipeline");
      }
      setLinkedFunnelId(funnelId);
      // Recargar las etapas del nuevo pipeline (sólo si no estamos usando project_statuses)
      if (!usingProjectStatuses) {
        const funnelRes = await fetch("/api/crm/funnels");
        if (funnelRes.ok) {
          const { funnels } = await funnelRes.json();
          const target = (funnels || []).find((f: any) => f.id === funnelId);
          if (target?.stages) {
            setCrmStages(target.stages.filter((s: any) => !s.is_hidden).map((s: any) => ({
              key: s.key, label: s.label, color: s.color,
            })));
          }
        }
      }
      onConversationUpdate();
    } catch (e: any) {
      console.error("[Chat] Error updating lead pipeline:", e);
      toast({ title: "Error al cambiar pipeline", description: e.message || "Inténtalo de nuevo", variant: "destructive" });
    }
  }

  // Cambiar el comercial (assigned_to) del lead vinculado
  async function handleSetLeadCommercial(profileId: string | null) {
    if (!linkedLeadId) return;
    try {
      const res = await fetch("/api/crm/leads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: linkedLeadId, assigned_to: profileId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Error actualizando comercial");
      }
      setLeadAssignedTo(profileId);
      onConversationUpdate();
    } catch (e: any) {
      console.error("[Chat] Error updating lead commercial:", e);
      toast({ title: "Error al cambiar comercial", description: e.message || "Inténtalo de nuevo", variant: "destructive" });
    }
  }

  async function handleConfirmLost() {
    if (!linkedLeadId || !lostReason || savingLost) return;
    setSavingLost(true);
    try {
      const dynamicLabel = funnelLossReasons.find((r) => r.key === lostReason)?.label;
      const reasonLabel = dynamicLabel || LOST_REASONS.find((r) => r.key === lostReason)?.label || lostReason;
      const fullReason = lostNotes.trim() ? `${reasonLabel}: ${lostNotes.trim()}` : reasonLabel;

      const res = await fetch("/api/crm/leads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: linkedLeadId, stage: "cerrado_perdido", lost_reason: fullReason }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "No se pudo marcar como perdido");
      }

      setLeadStage("cerrado_perdido");
      // Mirror stage in the conversation AND archive it (status = resolved)
      await supabase
        .from("wa_conversations")
        .update({ lead_stage: "cerrado_perdido", status: "resolved" })
        .eq("id", conversation.id)
        .eq("tenant_id", tenantId);

      toast({ title: "Lead marcado como perdido", description: "La conversacion se ha archivado." });
      setShowLostForm(false);
      setLostReason("");
      setLostNotes("");
      onConversationUpdate();
    } catch (e: any) {
      console.error("[Chat] Error marking lost:", e);
      toast({ title: "Error al marcar como perdido", description: e.message || "Intentalo de nuevo", variant: "destructive" });
    } finally {
      setSavingLost(false);
    }
  }

  async function handleCloseConversation() {
    await supabase
      .from("wa_conversations")
      .update({ status: "resolved" })
      .eq("id", conversation.id)
      .eq("tenant_id", tenantId);
    onConversationUpdate();
    setShowQuickActions(false);
  }

  async function handleReopenConversation() {
    await supabase
      .from("wa_conversations")
      .update({ status: conversation.assigned_to ? "assigned" : "open" })
      .eq("id", conversation.id)
      .eq("tenant_id", tenantId);
    onConversationUpdate();
    setShowQuickActions(false);
  }

  async function handleMarkUnread() {
    await supabase
      .from("wa_conversations")
      .update({ unread_count: 1 })
      .eq("id", conversation.id)
      .eq("tenant_id", tenantId);
    onConversationUpdate();
    setShowQuickActions(false);
    // Deselect this conversation so it doesn't immediately re-mark as read
    if (typeof onBack === "function") onBack();
  }

  async function handleCorrectText() {
    if (!messageText.trim() || correcting) return;
    setCorrecting(true);
    try {
      const res = await fetch("/api/whatsapp/correct-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: messageText.trim() }),
      });
      if (res.ok) {
        const { corrected } = await res.json();
        if (corrected) setMessageText(corrected);
      }
    } catch {
      // silently fail
    } finally {
      setCorrecting(false);
      textareaRef.current?.focus();
    }
  }

  async function handleSuggestReply() {
    if (suggesting) return;
    setSuggesting(true);
    try {
      const res = await fetch("/api/whatsapp/suggest-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_id: conversation.id,
          hint: messageText.trim() || undefined,
        }),
      });
      if (res.ok) {
        const { suggestion } = await res.json();
        if (suggestion) setMessageText(suggestion);
      } else {
        const { error } = await res.json().catch(() => ({ error: "Error generando sugerencia" }));
        toast({ title: "No se pudo sugerir respuesta", description: error || "Intentalo de nuevo", variant: "destructive" });
      }
    } catch {
      toast({ title: "No se pudo sugerir respuesta", description: "Error de conexion", variant: "destructive" });
    } finally {
      setSuggesting(false);
      textareaRef.current?.focus();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (showMentions && mentionSuggestions.length > 0 && (e.key === "Tab" || e.key === "Enter")) {
      e.preventDefault();
      insertMention(mentionSuggestions[0]);
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleTextChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setMessageText(val);

    // @mention detection (only in internal notes)
    if (isInternalNote) {
      const cursorPos = e.target.selectionStart;
      const textBefore = val.substring(0, cursorPos);
      const atMatch = textBefore.match(/@([\w\u00C0-\u024F]*)$/);

      if (atMatch) {
        setShowMentions(true);
        setMentionQuery(atMatch[1]);
        setMentionStartIdx(cursorPos - atMatch[0].length);
      } else {
        setShowMentions(false);
        setMentionQuery("");
      }
    } else {
      setShowMentions(false);
    }
  }

  function insertMention(agent: any) {
    const before = messageText.substring(0, mentionStartIdx);
    const after = messageText.substring(textareaRef.current?.selectionStart || mentionStartIdx);
    const newText = `${before}@${agent.full_name} ${after}`;
    setMessageText(newText);
    setShowMentions(false);
    setMentionQuery("");
    textareaRef.current?.focus();
  }

  function selectQuickReply(qr: WaQuickReply) {
    setMessageText(qr.content);
    setShowQuickReplies(false);
    textareaRef.current?.focus();
  }

  // Window status
  const windowOpen = conversation.window_expires_at
    ? new Date(conversation.window_expires_at) > new Date()
    : false;

  // Group messages by date
  const groupedMessages = useMemo(() => groupMessagesByDate(messages), [messages]);

  // Gather all assignees (use optimistic state if available)
  const allAssigneeIds = optimisticAssignees || (() => {
    const ids = new Set<string>();
    if (conversation.assigned_to) ids.add(conversation.assigned_to);
    conversation.assignees?.forEach((a) => ids.add(a.profile_id));
    return ids;
  })();
  const assigneeList = agents.filter((a: any) => allAssigneeIds.has(a.id));

  // Último usuario interno que respondió al cliente — para el default del
  // selector de responsable. Recorremos los mensajes (en orden ascendente)
  // y nos quedamos con el sender_id más reciente con sender_type=agent y
  // direction=outbound. Excluimos notas internas (is_internal_note=true).
  const lastInternalUserId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m: any = messages[i];
      if (
        m.direction === "outbound" &&
        m.sender_type === "agent" &&
        m.sender_id &&
        !m.is_internal_note
      ) {
        return m.sender_id as string;
      }
    }
    return null;
  }, [messages]);

  // Gather conversation labels (use optimistic state if available)
  const convLabelIds = optimisticLabels || new Set(conversation.labels?.map((l: any) => l.id) || []);

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0 h-full overflow-hidden">
      {/* Chat header */}
      <div className="border-b border-gray-100 bg-white shrink-0 z-10">
        {/* Top row: contact + actions */}
        <div className="px-2 sm:px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            {/* Back button — mobile only */}
            {onBack && (
              <button onClick={onBack} className="md:hidden p-2 -ml-1 hover:bg-gray-100 active:bg-gray-200 rounded-lg text-gray-600 touch-manipulation">
                <ArrowLeft className="h-5 w-5" />
              </button>
            )}
            {/* Avatar */}
            {contact?.profile_picture_url ? (
              <img src={contact.profile_picture_url} alt="" className="w-10 h-10 rounded-full object-cover cursor-pointer" onClick={onToggleContactPanel} />
            ) : (
              <div
                className="w-10 h-10 rounded-full bg-gradient-to-br from-[#25D366] to-[#128C7E] flex items-center justify-center text-white font-semibold text-sm cursor-pointer"
                onClick={onToggleContactPanel}
              >
                {displayName
                  .split(" ")
                  .map((w) => w[0])
                  .join("")
                  .substring(0, 2)
                  .toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold text-gray-900">
                {displayName}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-0.5 sm:gap-1">
            {/* Window indicator — hidden on mobile for space */}
            <div className={cn(
              "hidden sm:block text-[10px] px-2 py-0.5 rounded-full font-medium mr-1 sm:mr-2",
              windowOpen
                ? "bg-green-50 text-green-600"
                : "bg-amber-50 text-amber-600"
            )}>
              {windowOpen ? "Ventana 24h" : "Solo templates"}
            </div>

            {/* Close/Reopen — hidden on mobile, in "..." menu instead */}
            {isClosed ? (
              <button
                onClick={handleReopenConversation}
                className="hidden sm:block p-2 hover:bg-green-50 rounded-lg transition-colors text-gray-500 hover:text-green-600"
                title="Reabrir conversacion"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
            ) : (
              <button
                onClick={handleCloseConversation}
                className="hidden sm:block p-2 hover:bg-gray-50 rounded-lg transition-colors text-gray-500 hover:text-orange-600"
                title="Cerrar conversacion"
              >
                <Archive className="h-4 w-4" />
              </button>
            )}

            {/* Phone call — opens CallPanel directly */}
            <button
              onClick={onToggleCallPanel}
              className="p-2 hover:bg-gray-50 rounded-lg transition-colors text-gray-500 hover:text-[#25D366]"
              title="Llamar"
            >
              <Phone className="h-4 w-4" />
            </button>
            <button onClick={onToggleContactPanel} className="p-2 hover:bg-gray-50 rounded-lg transition-colors text-gray-500">
              <User className="h-4 w-4" />
            </button>
            <div className="relative">
              <button
                onClick={() => setShowQuickActions(!showQuickActions)}
                className="p-2 hover:bg-gray-50 rounded-lg transition-colors text-gray-500"
              >
                <MoreVertical className="h-4 w-4" />
              </button>

              {showQuickActions && (
                <>
                  <div className="fixed inset-0 z-10 touch-manipulation" onClick={() => setShowQuickActions(false)} />
                  <div className="absolute right-0 top-full mt-1 w-56 bg-white rounded-xl shadow-lg border border-gray-100 py-1.5 z-20">
                    <button onClick={handleMarkUnread} className="w-full px-3 py-2 text-sm text-left hover:bg-gray-50 flex items-center gap-2 text-gray-600">
                      <EyeOff className="h-4 w-4" />
                      Marcar como no leido
                    </button>

                    {isClosed ? (
                      <button onClick={handleReopenConversation} className="w-full px-3 py-2 text-sm text-left hover:bg-gray-50 text-green-600 font-medium flex items-center gap-2">
                        <RotateCcw className="h-4 w-4" />
                        Reabrir conversacion
                      </button>
                    ) : (
                      <button onClick={handleCloseConversation} className="w-full px-3 py-2 text-sm text-left hover:bg-gray-50 text-orange-600 font-medium flex items-center gap-2">
                        <Archive className="h-4 w-4" />
                        Cerrar conversacion
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Info bar: assignees, stage, labels — overflow-visible when any dropdown is open so menus aren't clipped */}
        <div className={cn(
          "px-2 sm:px-4 pb-2 flex items-center gap-1.5 sm:gap-2",
          (showAssignDropdown || showStageDropdown || showLabelDropdown || showPipelineDropdown || showLeadStageDropdown || showLeadCommercialDropdown) ? "overflow-visible flex-wrap" : "overflow-x-auto scrollbar-hide"
        )}>
          {/* Selector de responsable: solo asignados. SLA NO se reinicia al cambiar. */}
          <ResponsibleSelect
            conversationId={conversation.id}
            agents={agents}
            assigneeIds={Array.from(allAssigneeIds)}
            currentResponsibleId={(conversation as any).responsible_user_id ?? null}
            lastInternalUserId={lastInternalUserId}
            onChanged={onConversationUpdate}
            disabled={isClosed}
          />

          {/* Assignees */}
          <div className="relative">
            <button
              onClick={() => {
                setShowAssignDropdown(!showAssignDropdown);
                setShowLabelDropdown(false);
                setShowStageDropdown(false);
                setShowPipelineDropdown(false);
                setShowLeadStageDropdown(false);
                setShowLeadCommercialDropdown(false);
              }}
              title="Personas asignadas a esta conversación (multi-asignación)"
              className="flex items-center gap-1 px-2 py-1 text-xs rounded-lg hover:bg-gray-50 transition-colors border border-gray-100"
            >
              {assigneeList.length > 0 ? (
                <>
                  <div className="flex -space-x-1.5">
                    {assigneeList.slice(0, 3).map((a: any) => (
                      <div
                        key={a.id}
                        className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center text-[8px] font-bold text-blue-600 border border-white"
                        title={a.full_name}
                      >
                        {a.full_name?.split(" ").map((w: string) => w[0]).join("").substring(0, 2).toUpperCase()}
                      </div>
                    ))}
                  </div>
                  <span className="text-gray-600">{assigneeList.length === 1 ? assigneeList[0].full_name : `${assigneeList.length} asignados`}</span>
                </>
              ) : (
                <>
                  <UserPlus className="h-3.5 w-3.5 text-gray-400" />
                  <span className="text-gray-400">Asignar</span>
                </>
              )}
              <ChevronDown className="h-3 w-3 text-gray-400" />
            </button>

            {showAssignDropdown && (
              <>
                <div className="fixed inset-0 z-10 touch-manipulation" onClick={() => { setShowAssignDropdown(false); setAssignSearch(""); }} />
                <div className="absolute left-0 top-full mt-1 w-56 bg-white rounded-xl shadow-lg border border-gray-100 py-1.5 z-20 max-h-72 flex flex-col">
                  <div className="px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                    Asignar a (multi-seleccion)
                  </div>
                  <div className="px-2 pb-1.5">
                    <input
                      autoFocus
                      value={assignSearch}
                      onChange={(e) => setAssignSearch(e.target.value)}
                      placeholder="Buscar por nombre..."
                      className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#25D366]/30 placeholder:text-gray-400"
                    />
                  </div>
                  <div className="overflow-y-auto flex-1">
                    {agents
                      .filter((a: any) => !assignSearch || normalizeText(a.full_name ?? "").includes(normalizeText(assignSearch)))
                      .map((a: any) => {
                        const isAssigned = allAssigneeIds.has(a.id);
                        return (
                          <button
                            key={a.id}
                            onClick={() => handleToggleAssignee(a.id)}
                            className={cn(
                              "w-full px-3 py-2 text-sm text-left hover:bg-gray-50 flex items-center gap-2",
                              isAssigned && "bg-blue-50"
                            )}
                          >
                            <div className={cn(
                              "w-4 h-4 rounded border flex items-center justify-center text-[10px]",
                              isAssigned ? "bg-blue-500 border-blue-500 text-white" : "border-gray-300"
                            )}>
                              {isAssigned && <CheckCheck className="h-3 w-3" />}
                            </div>
                            <span className={cn(isAssigned && "font-medium text-blue-700")}>{a.full_name}</span>
                          </button>
                        );
                      })}
                    {agents.filter((a: any) => !assignSearch || normalizeText(a.full_name ?? "").includes(normalizeText(assignSearch))).length === 0 && (
                      <p className="px-3 py-2 text-xs text-gray-400">Sin resultados</p>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Assign error */}
          {assignError && (
            <span className="text-[10px] px-2 py-1 rounded-lg font-medium bg-red-50 text-red-600 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              {assignError}
            </span>
          )}

          {/* Stage dropdown — CRM stages if linked to lead, otherwise wa_stages */}
          <div className="relative">
            <button
              onClick={() => {
                setShowStageDropdown(!showStageDropdown);
                setShowLabelDropdown(false);
                setShowAssignDropdown(false);
                setShowPipelineDropdown(false);
                setShowLeadStageDropdown(false);
                setShowLeadCommercialDropdown(false);
              }}
              title={linkedLeadId && crmStages.length > 0 ? (usingProjectStatuses ? "Etapa del proyecto vinculado" : "Etapa del lead en el pipeline") : "Etapa de la conversación"}
              className="flex items-center gap-1 px-2 py-1 text-xs rounded-lg hover:bg-gray-50 transition-colors border border-gray-100"
            >
              {linkedLeadId && crmStages.length > 0 ? (
                // Show CRM stage
                (() => {
                  const currentCrmStage = crmStages.find((s) => s.key === leadStage);
                  return currentCrmStage ? (
                    <>
                      <Circle className="h-3 w-3 fill-current" style={{ color: currentCrmStage.color.includes("bg-") ? undefined : currentCrmStage.color }} />
                      <span className="text-gray-700">{currentCrmStage.label}</span>
                    </>
                  ) : (
                    <>
                      <ArrowRight className="h-3.5 w-3.5 text-gray-400" />
                      <span className="text-gray-400">Etapa</span>
                    </>
                  );
                })()
              ) : conversation.stage ? (
                <>
                  <Circle className="h-3 w-3 fill-current" style={{ color: conversation.stage.color }} />
                  <span style={{ color: conversation.stage.color }}>{conversation.stage.name}</span>
                </>
              ) : (
                <>
                  <ArrowRight className="h-3.5 w-3.5 text-gray-400" />
                  <span className="text-gray-400">Etapa</span>
                </>
              )}
              <ChevronDown className="h-3 w-3 text-gray-400" />
            </button>

            {showStageDropdown && (
              <>
                <div className="fixed inset-0 z-10 touch-manipulation" onClick={() => setShowStageDropdown(false)} />
                <div className="absolute left-0 top-full mt-1 w-48 bg-white rounded-xl shadow-lg border border-gray-100 py-1.5 z-20 max-h-60 overflow-y-auto">
                  <div className="px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                    {linkedLeadId && crmStages.length > 0 ? (usingProjectStatuses ? "Etapa Proyecto" : "Etapa CRM") : "Etapa"}
                  </div>
                  {linkedLeadId && crmStages.length > 0 ? (
                    // CRM pipeline stages
                    crmStages.map((s) => (
                      <button
                        key={s.key}
                        onClick={() => { handleSetStage(null, s.key); setShowStageDropdown(false); }}
                        className={cn("w-full px-3 py-2 text-sm text-left hover:bg-gray-50 flex items-center gap-2", leadStage === s.key && "bg-blue-50 font-medium")}
                      >
                        <Circle className="h-3 w-3 fill-current" style={{ color: s.color.includes("bg-") ? "#6B7280" : s.color }} />
                        <span>{s.label}</span>
                      </button>
                    ))
                  ) : (
                    // Regular wa_stages
                    <>
                      <button
                        onClick={() => { handleSetStage(null); setShowStageDropdown(false); }}
                        className={cn("w-full px-3 py-2 text-sm text-left hover:bg-gray-50 flex items-center gap-2", !conversation.stage_id && "bg-gray-50 font-medium")}
                      >
                        <Circle className="h-3 w-3 text-gray-300" />
                        <span className="text-gray-500">Sin etapa</span>
                      </button>
                      {stages.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => { handleSetStage(s.id); setShowStageDropdown(false); }}
                          className={cn("w-full px-3 py-2 text-sm text-left hover:bg-gray-50 flex items-center gap-2", conversation.stage_id === s.id && "bg-blue-50 font-medium")}
                        >
                          <Circle className="h-3 w-3 fill-current" style={{ color: s.color }} />
                          <span>{s.name}</span>
                        </button>
                      ))}
                    </>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Label dropdown */}
          <div className="relative">
            <button
              onClick={() => {
                setShowLabelDropdown(!showLabelDropdown);
                setShowAssignDropdown(false);
                setShowStageDropdown(false);
                setShowPipelineDropdown(false);
                setShowLeadStageDropdown(false);
                setShowLeadCommercialDropdown(false);
              }}
              title="Etiquetas de esta conversación (clasificación libre, multi-selección)"
              className="flex items-center gap-1 px-2 py-1 text-xs rounded-lg hover:bg-gray-50 transition-colors border border-gray-100"
            >
              {convLabelIds.size > 0 ? (
                <>
                  <div className="flex -space-x-0.5">
                    {labels.filter((l) => convLabelIds.has(l.id)).slice(0, 3).map((l) => (
                      <Circle key={l.id} className="h-3 w-3 fill-current" style={{ color: l.color }} />
                    ))}
                  </div>
                  <span className="text-gray-600">
                    {convLabelIds.size === 1
                      ? labels.find((l) => convLabelIds.has(l.id))?.name || "1 etiqueta"
                      : `${convLabelIds.size} etiquetas`}
                  </span>
                </>
              ) : (
                <>
                  <Tag className="h-3.5 w-3.5 text-gray-400" />
                  <span className="text-gray-400">Etiqueta</span>
                </>
              )}
              <ChevronDown className="h-3 w-3 text-gray-400" />
            </button>

            {showLabelDropdown && (
              <>
                <div className="fixed inset-0 z-10 touch-manipulation" onClick={() => setShowLabelDropdown(false)} />
                <div className="absolute left-0 top-full mt-1 w-48 bg-white rounded-xl shadow-lg border border-gray-100 py-1.5 z-20 max-h-60 overflow-y-auto">
                  <div className="px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                    Etiquetas (multi-seleccion)
                  </div>
                  {labels.map((l) => {
                    const isActive = convLabelIds.has(l.id);
                    return (
                      <button
                        key={l.id}
                        onClick={(e) => { e.stopPropagation(); handleToggleLabel(l.id); }}
                        className={cn("w-full px-3 py-2 text-sm text-left hover:bg-gray-50 flex items-center gap-2", isActive && "bg-blue-50")}
                      >
                        <div className={cn(
                          "w-4 h-4 rounded border flex items-center justify-center text-[10px]",
                          isActive ? "bg-blue-500 border-blue-500 text-white" : "border-gray-300"
                        )}>
                          {isActive && <CheckCheck className="h-3 w-3" />}
                        </div>
                        <Circle className="h-3 w-3 fill-current flex-shrink-0" style={{ color: l.color }} />
                        <span className={cn(isActive && "font-medium")}>{l.name}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* === Campos del lead vinculado (Pipeline + Etapa lead agrupados como segmento) === */}
          {/* Wrapper de grupo: Pipeline → Etapa son la misma cosa visualmente
              (etapa pertenece al pipeline). El border-r-0 + rounded-r-none del
              primer botón y el rounded-l-none del segundo crean un button-group. */}
          <div className="flex items-center">
          {/* Pipeline del lead */}
          <div className="relative">
            <button
              disabled={!linkedLeadId}
              onClick={() => {
                if (!linkedLeadId) return;
                setShowPipelineDropdown(!showPipelineDropdown);
                setShowAssignDropdown(false);
                setShowStageDropdown(false);
                setShowLabelDropdown(false);
                setShowLeadStageDropdown(false);
                setShowLeadCommercialDropdown(false);
              }}
              title={linkedLeadId ? "Pipeline (embudo) del lead vinculado en CRM" : "Sin lead vinculado: crea o vincula un lead desde el panel del contacto para asignar pipeline"}
              className={cn(
                "flex items-center gap-1 px-2 py-1 text-xs rounded-l-lg rounded-r-none transition-colors border border-r-0 border-gray-100",
                linkedLeadId ? "hover:bg-gray-50" : "opacity-50 cursor-not-allowed"
              )}
            >
              <GitBranch className="h-3.5 w-3.5 text-gray-400" />
              {(() => {
                const currentFunnel = crmFunnels.find((f) => f.id === linkedFunnelId);
                return (
                  <span className={cn(currentFunnel ? "text-gray-700" : "text-gray-400")}>
                    {currentFunnel ? currentFunnel.name : "Pipeline"}
                  </span>
                );
              })()}
              <ChevronDown className="h-3 w-3 text-gray-400" />
            </button>

            {showPipelineDropdown && linkedLeadId && (
              <>
                <div className="fixed inset-0 z-10 touch-manipulation" onClick={() => setShowPipelineDropdown(false)} />
                <div className="absolute left-0 top-full mt-1 w-56 bg-white rounded-xl shadow-lg border border-gray-100 py-1.5 z-20 max-h-60 overflow-y-auto">
                  <div className="px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                    Pipeline del lead
                  </div>
                  {crmFunnels.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-gray-400">Sin pipelines disponibles</p>
                  ) : (
                    crmFunnels.map((f) => (
                      <button
                        key={f.id}
                        onClick={() => { handleSetLeadFunnel(f.id); setShowPipelineDropdown(false); }}
                        className={cn(
                          "w-full px-3 py-2 text-sm text-left hover:bg-gray-50 flex items-center gap-2",
                          linkedFunnelId === f.id && "bg-blue-50 font-medium"
                        )}
                      >
                        <GitBranch className="h-3 w-3 text-gray-400 flex-shrink-0" />
                        <span>{f.name}</span>
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
          </div>

          {/* Etapa del lead */}
          <div className="relative">
            <button
              disabled={!linkedLeadId}
              onClick={() => {
                if (!linkedLeadId) return;
                setShowLeadStageDropdown(!showLeadStageDropdown);
                setShowAssignDropdown(false);
                setShowStageDropdown(false);
                setShowLabelDropdown(false);
                setShowPipelineDropdown(false);
                setShowLeadCommercialDropdown(false);
              }}
              title={linkedLeadId ? (usingProjectStatuses ? "Etapa del proyecto vinculado" : "Etapa actual del lead dentro del pipeline seleccionado") : "Sin lead vinculado en CRM"}
              className={cn(
                "flex items-center gap-1 px-2 py-1 text-xs rounded-r-lg rounded-l-none transition-colors border border-gray-100",
                linkedLeadId ? "hover:bg-gray-50" : "opacity-50 cursor-not-allowed"
              )}
            >
              <Briefcase className="h-3.5 w-3.5 text-gray-400" />
              {(() => {
                const currentLeadStage = crmStages.find((s) => s.key === leadStage);
                return currentLeadStage ? (
                  <>
                    <Circle
                      className="h-3 w-3 fill-current"
                      style={{ color: currentLeadStage.color?.includes("bg-") ? "#6B7280" : currentLeadStage.color }}
                    />
                    <span className="text-gray-700">{currentLeadStage.label}</span>
                  </>
                ) : (
                  <span className="text-gray-400">Etapa lead</span>
                );
              })()}
              <ChevronDown className="h-3 w-3 text-gray-400" />
            </button>

            {showLeadStageDropdown && linkedLeadId && (
              <>
                <div className="fixed inset-0 z-10 touch-manipulation" onClick={() => setShowLeadStageDropdown(false)} />
                <div className="absolute left-0 top-full mt-1 w-56 bg-white rounded-xl shadow-lg border border-gray-100 py-1.5 z-20 max-h-60 overflow-y-auto">
                  <div className="px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                    {usingProjectStatuses ? "Etapa del proyecto" : "Etapa del lead"}
                  </div>
                  {crmStages.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-gray-400">Sin etapas configuradas</p>
                  ) : (
                    crmStages.map((s) => (
                      <button
                        key={s.key}
                        onClick={() => { handleSetStage(null, s.key); setShowLeadStageDropdown(false); }}
                        className={cn(
                          "w-full px-3 py-2 text-sm text-left hover:bg-gray-50 flex items-center gap-2",
                          leadStage === s.key && "bg-blue-50 font-medium"
                        )}
                      >
                        <Circle className="h-3 w-3 fill-current" style={{ color: s.color?.includes("bg-") ? "#6B7280" : s.color }} />
                        <span>{s.label}</span>
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
          </div>{/* /grupo Pipeline + Etapa lead */}

          {/* Comercial del lead */}
          <div className="relative">
            <button
              disabled={!linkedLeadId}
              onClick={() => {
                if (!linkedLeadId) return;
                setShowLeadCommercialDropdown(!showLeadCommercialDropdown);
                setShowAssignDropdown(false);
                setShowStageDropdown(false);
                setShowLabelDropdown(false);
                setShowPipelineDropdown(false);
                setShowLeadStageDropdown(false);
              }}
              title={linkedLeadId ? "Comercial (responsable) asignado al lead vinculado en CRM" : "Sin lead vinculado en CRM"}
              className={cn(
                "flex items-center gap-1 px-2 py-1 text-xs rounded-lg transition-colors border border-gray-100",
                linkedLeadId ? "hover:bg-gray-50" : "opacity-50 cursor-not-allowed"
              )}
            >
              <UserCog className="h-3.5 w-3.5 text-gray-400" />
              {(() => {
                const currentCommercial = leadAssignedTo
                  ? agents.find((a: any) => a.id === leadAssignedTo)
                  : null;
                return currentCommercial ? (
                  <>
                    <div
                      className="w-4 h-4 rounded-full bg-blue-100 flex items-center justify-center text-[8px] font-bold text-blue-600"
                      title={currentCommercial.full_name}
                    >
                      {currentCommercial.full_name?.split(" ").map((w: string) => w[0]).join("").substring(0, 2).toUpperCase()}
                    </div>
                    <span className="text-gray-700">{currentCommercial.full_name}</span>
                  </>
                ) : (
                  <span className="text-gray-400">Comercial</span>
                );
              })()}
              <ChevronDown className="h-3 w-3 text-gray-400" />
            </button>

            {showLeadCommercialDropdown && linkedLeadId && (
              <>
                <div className="fixed inset-0 z-10 touch-manipulation" onClick={() => { setShowLeadCommercialDropdown(false); setLeadCommercialSearch(""); }} />
                <div className="absolute left-0 top-full mt-1 w-56 bg-white rounded-xl shadow-lg border border-gray-100 py-1.5 z-20 max-h-72 flex flex-col">
                  <div className="px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                    Comercial del lead
                  </div>
                  <div className="px-2 pb-1.5">
                    <input
                      autoFocus
                      value={leadCommercialSearch}
                      onChange={(e) => setLeadCommercialSearch(e.target.value)}
                      placeholder="Buscar por nombre..."
                      className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#25D366]/30 placeholder:text-gray-400"
                    />
                  </div>
                  <div className="overflow-y-auto flex-1">
                    {/* Opción "Sin comercial" para desasignar */}
                    {!leadCommercialSearch && (
                      <button
                        onClick={() => { handleSetLeadCommercial(null); setShowLeadCommercialDropdown(false); }}
                        className={cn(
                          "w-full px-3 py-2 text-sm text-left hover:bg-gray-50 flex items-center gap-2",
                          !leadAssignedTo && "bg-gray-50 font-medium"
                        )}
                      >
                        <div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center">
                          <X className="h-3 w-3 text-gray-400" />
                        </div>
                        <span className="text-gray-500">Sin comercial</span>
                      </button>
                    )}
                    {agents
                      .filter((a: any) => !leadCommercialSearch || normalizeText(a.full_name ?? "").includes(normalizeText(leadCommercialSearch)))
                      .map((a: any) => {
                        const isCurrent = leadAssignedTo === a.id;
                        return (
                          <button
                            key={a.id}
                            onClick={() => { handleSetLeadCommercial(a.id); setShowLeadCommercialDropdown(false); }}
                            className={cn(
                              "w-full px-3 py-2 text-sm text-left hover:bg-gray-50 flex items-center gap-2",
                              isCurrent && "bg-blue-50"
                            )}
                          >
                            <div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center text-[8px] font-bold text-blue-600">
                              {a.full_name?.split(" ").map((w: string) => w[0]).join("").substring(0, 2).toUpperCase()}
                            </div>
                            <span className={cn(isCurrent && "font-medium text-blue-700")}>{a.full_name}</span>
                          </button>
                        );
                      })}
                    {agents.filter((a: any) => !leadCommercialSearch || normalizeText(a.full_name ?? "").includes(normalizeText(leadCommercialSearch))).length === 0 && (
                      <p className="px-3 py-2 text-xs text-gray-400">Sin resultados</p>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Team */}
          {conversation.team && (
            <span
              className="text-[11px] px-2 py-1 rounded-lg font-medium"
              style={{ color: conversation.team.color, backgroundColor: `${conversation.team.color}15` }}
            >
              {conversation.team.name}
            </span>
          )}

          {/* Closed badge */}
          {isClosed && (
            <span
              title="Conversación marcada como cerrada (resuelta). Reábrela desde el menú ⋮ para volver a recibir/enviar mensajes."
              className="text-[11px] px-2 py-1 rounded-lg font-medium bg-gray-100 text-gray-500 cursor-help"
            >
              Cerrada
            </span>
          )}
        </div>
      </div>

      {/* Messages area */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto px-3 sm:px-12 py-4 overscroll-contain min-h-0"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23e5ded8' fill-opacity='0.15'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          backgroundColor: "#efeae2",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {groupedMessages.map(({ date, msgs }) => (
          <div key={date}>
            {/* Date separator */}
            <div className="flex justify-center my-4">
              <span className="bg-white/90 backdrop-blur-sm text-gray-500 text-[11px] font-medium px-3 py-1 rounded-lg shadow-sm">
                {date}
              </span>
            </div>

            {msgs.map((msg) => {
              const msgLine = (msg as any).line_id ? allLines.find((l) => l.id === (msg as any).line_id) : null;
              return (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  currentUserId={profile?.id}
                  lineName={msgLine?.name || null}
                  lineColor={msgLine?.color || null}
                  contactName={displayName || null}
                  onReact={handleReaction}
                  onReply={(m) => { setReplyToMessage(m); textareaRef.current?.focus(); }}
                />
              );
            })}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick replies dropdown */}
      {showQuickReplies && quickReplies.length > 0 && (
        <div className="border-t border-gray-100 bg-white max-h-32 overflow-y-auto">
          {quickReplies
            .filter((qr) => qr.shortcut.includes(messageText.slice(1).toLowerCase()))
            .map((qr) => (
              <button
                key={qr.id}
                onClick={() => selectQuickReply(qr)}
                className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center gap-2 text-sm"
              >
                <span className="font-mono text-xs text-gray-400">/{qr.shortcut}</span>
                <span className="text-gray-600 truncate">{qr.title}</span>
              </button>
            ))}
        </div>
      )}

      {/* @Mention suggestions (internal notes) */}
      {showMentions && mentionSuggestions.length > 0 && (
        <div className="border-t border-amber-200 bg-amber-50 max-h-40 overflow-y-auto">
          <div className="px-3 py-1 text-[10px] text-amber-600 font-medium">Mencionar a:</div>
          {mentionSuggestions.slice(0, 8).map((agent: any) => (
            <button
              key={agent.id}
              onClick={() => insertMention(agent)}
              className="w-full px-4 py-2 text-left hover:bg-amber-100/50 flex items-center gap-2 text-sm"
            >
              <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-[9px] font-bold text-blue-600">
                {agent.full_name?.split(" ").map((w: string) => w[0]).join("").substring(0, 2).toUpperCase()}
              </div>
              <span className="text-gray-700">{agent.full_name}</span>
              <span className="text-[10px] text-gray-400 ml-auto">{agent.role}</span>
            </button>
          ))}
        </div>
      )}

      {/* Send error */}
      {sendError && (
        <div className="px-4 py-2 bg-red-50 border-t border-red-100 text-sm text-red-600 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {sendError}
          <button onClick={() => setSendError(null)} className="ml-auto text-red-400 hover:text-red-600">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Input area — shrink-0 prevents it being pushed off screen by keyboard */}
      <div className={cn(
        "border-t px-2 sm:px-4 py-2 sm:py-3 bg-[#f0f2f5] shrink-0",
        isInternalNote && "bg-amber-50 border-amber-200"
      )}>
        {isInternalNote && (
          <div className="flex items-center justify-between mb-2 text-amber-600 text-xs font-medium">
            <div className="flex items-center gap-1">
              <StickyNote className="h-3 w-3" />
              Nota interna — usa @nombre para mencionar
            </div>
            <button onClick={() => setIsInternalNote(false)}>
              <X className="h-3 w-3" />
            </button>
          </div>
        )}

        {/* Reply-to banner */}
        {replyToMessage && (
          <div className="flex items-center gap-2 mb-2 bg-white rounded-xl px-3 py-2 border border-gray-200">
            <div className="w-1 h-8 rounded-full bg-[#25D366] flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-semibold text-[#25D366]">
                {replyToMessage.direction === "outbound"
                  ? (replyToMessage.sender?.full_name || "Tu")
                  : displayName}
              </div>
              <p className="text-[11px] text-gray-500 truncate">
                {replyToMessage.message_type === "image" ? "📷 Foto"
                  : replyToMessage.message_type === "video" ? "🎥 Video"
                  : replyToMessage.message_type === "audio" ? "🎤 Audio"
                  : replyToMessage.message_type === "document" ? `📄 ${replyToMessage.media_filename || "Documento"}`
                  : replyToMessage.message_type === "location" ? "📍 Ubicacion"
                  : replyToMessage.content?.substring(0, 80) || "[mensaje]"}
              </p>
            </div>
            <button
              onClick={() => setReplyToMessage(null)}
              className="p-1 hover:bg-gray-100 rounded-full transition-colors text-gray-400"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Inline task creation form */}
        {showTaskForm && (
          <div className="mb-3 bg-indigo-50 border border-indigo-200 rounded-xl p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-indigo-700 flex items-center gap-1.5">
                <ClipboardList className="h-3.5 w-3.5" /> Nueva tarea
              </span>
              <button onClick={() => setShowTaskForm(false)} className="text-indigo-400 hover:text-indigo-600">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <input
              type="text"
              placeholder="Titulo de la tarea *"
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              className="w-full px-3 py-1.5 text-sm rounded-lg border border-indigo-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 mb-2"
              autoFocus
            />
            <div className="flex gap-2 mb-2">
              <div className="flex-1 relative">
                <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-indigo-400 pointer-events-none" />
                <input
                  type="date"
                  value={taskDate}
                  onChange={(e) => setTaskDate(e.target.value)}
                  className="w-full pl-7 pr-2 py-1.5 text-xs rounded-lg border border-indigo-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>
              <div className="w-24 relative">
                <Clock className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-indigo-400 pointer-events-none" />
                <input
                  type="time"
                  value={taskTime}
                  onChange={(e) => setTaskTime(e.target.value)}
                  className="w-full pl-7 pr-2 py-1.5 text-xs rounded-lg border border-indigo-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>
            </div>
            <div className="flex gap-2 mb-2">
              <div className="flex-1">
                <select
                  value={taskType}
                  onChange={(e) => setTaskType(e.target.value)}
                  className="w-full px-2 py-1.5 text-xs rounded-lg border border-indigo-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
                >
                  <option value="llamada">Llamada</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="enviar_documento">Enviar documento</option>
                  <option value="averiguar">Averiguar</option>
                  <option value="reunion_presencial">Reunion presencial</option>
                  <option value="reunion_videoconferencia">Videollamada</option>
                  <option value="otro">Otra</option>
                </select>
              </div>
              <div className="w-28">
                <select
                  value={taskPriority}
                  onChange={(e) => setTaskPriority(e.target.value)}
                  className="w-full px-2 py-1.5 text-xs rounded-lg border border-indigo-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
                >
                  <option value="baja">Baja</option>
                  <option value="media">Media</option>
                  <option value="alta">Alta</option>
                  <option value="urgente">Urgente</option>
                </select>
              </div>
            </div>
            <textarea
              placeholder="Descripcion (opcional)"
              value={taskDescription}
              onChange={(e) => setTaskDescription(e.target.value)}
              rows={2}
              className="w-full px-3 py-1.5 text-xs rounded-lg border border-indigo-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none mb-2"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowTaskForm(false)}
                className="px-3 py-1 text-xs text-indigo-600 hover:bg-indigo-100 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreateTask}
                disabled={!taskTitle.trim() || creatingTask}
                className="px-3 py-1 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1"
              >
                {creatingTask && <Loader2 className="h-3 w-3 animate-spin" />}
                Crear tarea
              </button>
            </div>
          </div>
        )}

        {/* Line indicator — admin can always change line, non-admin sees fixed badge */}
        {effectiveSendLine && !isInternalNote && (
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-[10px] text-gray-400">Enviar desde:</span>
            {userIsAdmin ? (
              // Admin → always show dropdown to pick any line
              <div className="relative">
                <button
                  onClick={() => setShowLineSelector(!showLineSelector)}
                  className="flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-full transition-colors hover:opacity-80"
                  style={{
                    color: effectiveSendLine.color || "#25D366",
                    backgroundColor: `${effectiveSendLine.color || "#25D366"}15`,
                  }}
                >
                  <Smartphone className="h-2.5 w-2.5" />
                  {effectiveSendLine.name || "Seleccionar"}
                  <ChevronDown className={cn("h-2.5 w-2.5 transition-transform", showLineSelector && "rotate-180")} />
                </button>
                {showLineSelector && (
                  <>
                    <div className="fixed inset-0 z-10 touch-manipulation" onClick={() => setShowLineSelector(false)} />
                    <div className="absolute bottom-full left-0 mb-1 bg-white rounded-xl shadow-lg border border-gray-100 py-1.5 z-20 w-64">
                      <div className="px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                        Enviar desde linea
                      </div>
                      {visibleLines.map((line) => {
                        const isActive = line.status === "active";
                        return (
                          <button
                            key={line.id}
                            onClick={() => { setSendLineId(line.id); setShowLineSelector(false); }}
                            disabled={!isActive}
                            className={cn(
                              "w-full px-3 py-2 text-xs text-left flex items-center gap-2",
                              isActive ? "hover:bg-gray-50" : "opacity-50 cursor-not-allowed",
                              effectiveSendLine.id === line.id && "bg-green-50 font-medium"
                            )}
                          >
                            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: line.color }} />
                            <span className="truncate">{line.name}</span>
                            <span className="text-[10px] text-gray-400 ml-auto flex-shrink-0">{line.phone_number}</span>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            ) : (
              // Non-admin → fixed badge showing their team's line (no dropdown)
              <span
                className="flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-full"
                style={{
                  color: effectiveSendLine.color || "#25D366",
                  backgroundColor: `${effectiveSendLine.color || "#25D366"}15`,
                }}
              >
                <Smartphone className="h-2.5 w-2.5" />
                {effectiveSendLine.name}
              </span>
            )}
          </div>
        )}

        <div className="flex items-end gap-2">
          {isRecording ? (
            /* --- Recording mode UI --- */
            <>
              <button
                onClick={cancelRecording}
                className="p-2.5 hover:bg-red-50 rounded-full transition-colors text-red-500"
                title="Cancelar grabacion"
              >
                <X className="h-5 w-5" />
              </button>

              <div className="flex-1 flex items-center gap-3 bg-white rounded-2xl px-4 py-2.5">
                <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                <span className="text-sm text-red-600 font-medium tabular-nums">
                  {formatRecordingTime(recordingDuration)}
                </span>
                <div className="flex-1 flex items-center gap-0.5">
                  {Array.from({ length: 20 }).map((_, i) => (
                    <div
                      key={i}
                      className="w-1 bg-red-400/60 rounded-full"
                      style={{
                        height: `${Math.max(4, Math.random() * 20)}px`,
                        animationDelay: `${i * 50}ms`,
                      }}
                    />
                  ))}
                </div>
              </div>

              <button
                onClick={stopRecording}
                disabled={sending}
                className="p-2.5 bg-[#25D366] hover:bg-[#128C7E] text-white rounded-full transition-colors disabled:opacity-50"
                title="Enviar nota de voz"
              >
                <Send className="h-5 w-5" />
              </button>
            </>
          ) : (
            /* --- Normal mode UI --- */
            <>
              {/* Attach button */}
              <div className="relative">
                <button
                  onClick={() => setShowAttachMenu(!showAttachMenu)}
                  className="p-2.5 hover:bg-white/50 rounded-full transition-colors text-gray-500"
                >
                  <Paperclip className="h-5 w-5" />
                </button>

                {showAttachMenu && (
                  <>
                    <div className="fixed inset-0 z-10 touch-manipulation" onClick={() => setShowAttachMenu(false)} />
                    <div className="absolute bottom-full left-0 mb-2 bg-white rounded-xl shadow-lg border border-gray-100 py-2 z-20 w-48">
                      {[
                        { icon: ImageIcon, label: "Foto o video", accept: "image/*,video/*", color: "text-purple-500" },
                        { icon: FileText, label: "Documento", accept: ".pdf,.doc,.docx,.xls,.xlsx", color: "text-blue-500" },
                        { icon: MapPin, label: "Ubicacion", accept: "", color: "text-green-500" },
                        { icon: LayoutTemplate, label: "Plantilla", accept: "", color: "text-orange-500" },
                      ].map(({ icon: Icon, label, accept, color }) => (
                        <button
                          key={label}
                          onClick={() => {
                            if (label === "Plantilla") {
                              openTemplatePicker();
                            } else if (label === "Ubicacion") {
                              if (!navigator.geolocation) {
                                setSendError("Tu navegador no soporta geolocalizacion");
                                setTimeout(() => setSendError(null), 5000);
                              } else {
                                navigator.geolocation.getCurrentPosition(
                                  async (pos) => {
                                    try {
                                      const res = await fetch("/api/whatsapp/send", {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({
                                          conversation_id: conversation.id,
                                          message_type: "location",
                                          location: {
                                            latitude: pos.coords.latitude,
                                            longitude: pos.coords.longitude,
                                          },
                                          ...(outboundLineId && { line_id: outboundLineId }),
                                        }),
                                      });
                                      if (!res.ok) {
                                        const err = await res.json().catch(() => ({}));
                                        setSendError(err.error || "Error al enviar ubicacion");
                                        setTimeout(() => setSendError(null), 5000);
                                      }
                                    } catch {
                                      setSendError("Error al enviar ubicacion");
                                      setTimeout(() => setSendError(null), 5000);
                                    }
                                  },
                                  (err) => {
                                    setSendError(err.code === 1 ? "Permiso de ubicacion denegado" : "No se pudo obtener la ubicacion");
                                    setTimeout(() => setSendError(null), 5000);
                                  },
                                  { enableHighAccuracy: true, timeout: 10000 }
                                );
                              }
                            } else if (accept) {
                              fileInputRef.current!.accept = accept;
                              fileInputRef.current!.click();
                            }
                            setShowAttachMenu(false);
                          }}
                          className="w-full px-3 py-2 text-sm text-left hover:bg-gray-50 flex items-center gap-3"
                        >
                          <Icon className={cn("h-4 w-4", color)} />
                          {label}
                        </button>
                      ))}

                      <div className="border-t border-gray-100 my-1" />

                      <button
                        onClick={() => { setShowTaskForm(true); setShowAttachMenu(false); }}
                        className="w-full px-3 py-2 text-sm text-left hover:bg-gray-50 flex items-center gap-3"
                      >
                        <ClipboardList className="h-4 w-4 text-indigo-500" />
                        Tarea
                      </button>
                      <button
                        onClick={() => { setIsInternalNote(true); setShowAttachMenu(false); textareaRef.current?.focus(); }}
                        className="w-full px-3 py-2 text-sm text-left hover:bg-gray-50 flex items-center gap-3"
                      >
                        <StickyNote className="h-4 w-4 text-amber-500" />
                        Nota interna
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* Text input */}
              <div className="flex-1 relative">
                {!windowOpen && !isInternalNote ? (
                  <div
                    className="w-full rounded-2xl px-4 py-2.5 bg-gray-100 border border-gray-200 flex items-center gap-2 cursor-pointer select-none"
                    onClick={() => openTemplatePicker()}
                    title="Enviar una plantilla aprobada"
                  >
                    <Clock className="h-4 w-4 text-gray-400 shrink-0" />
                    <span className="text-sm text-gray-400">
                      Ventana cerrada — usa una <span className="text-[#25D366] font-medium underline underline-offset-2">plantilla</span> para contestar
                    </span>
                  </div>
                ) : (
                  <textarea
                    ref={textareaRef}
                    value={messageText}
                    onChange={handleTextChange}
                    onKeyDown={handleKeyDown}
                    placeholder={isInternalNote ? "Escribe una nota interna... usa @nombre para mencionar" : "Escribe un mensaje..."}
                    rows={1}
                    className={cn(
                      "w-full resize-none rounded-2xl px-4 py-2.5 text-sm border-0 focus:outline-none focus:ring-2 focus:ring-[#25D366]/30 placeholder:text-gray-400",
                      isInternalNote ? "bg-amber-100/50" : "bg-white"
                    )}
                    style={{ maxHeight: "120px" }}
                  />
                )}
              </div>

              {/* Emoji picker button — hidden when window closed (unless internal note) */}
              {(windowOpen || isInternalNote) && (
                <div className="relative">
                  <button
                    onClick={() => { setReactionMessageId(null); setShowEmojiPicker(!showEmojiPicker); }}
                    className={cn(
                      "p-2 rounded-full transition-colors",
                      showEmojiPicker
                        ? "bg-[#25D366]/10 text-[#25D366]"
                        : "hover:bg-white/50 text-gray-400 hover:text-gray-600"
                    )}
                    title="Emojis"
                  >
                    <Smile className="h-5 w-5" />
                  </button>

                  {showEmojiPicker && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setShowEmojiPicker(false)} />
                      <EmojiPickerPopover
                        onSelect={handleEmojiSelect}
                        onClose={() => setShowEmojiPicker(false)}
                      />
                    </>
                  )}
                </div>
              )}

              {/* AI suggest reply — solo en chat real con cliente, no en notas internas */}
              {windowOpen && !isInternalNote && (
                <button
                  onClick={handleSuggestReply}
                  disabled={suggesting}
                  className="p-2 hover:bg-emerald-50 rounded-full transition-colors text-gray-400 hover:text-emerald-600 disabled:opacity-50"
                  title={messageText.trim()
                    ? "Sugerir respuesta con IA (usa lo escrito como pista)"
                    : "Sugerir respuesta con IA basada en la conversacion"}
                >
                  {suggesting ? (
                    <Loader2 className="h-4.5 w-4.5 animate-spin" />
                  ) : (
                    <MessageSquareReply className="h-4.5 w-4.5" />
                  )}
                </button>
              )}

              {/* AI correct + Send / Mic button — hidden when window closed (unless internal note) */}
              {(windowOpen || isInternalNote) && messageText.trim() && (
                <button
                  onClick={handleCorrectText}
                  disabled={correcting}
                  className="p-2 hover:bg-purple-50 rounded-full transition-colors text-gray-400 hover:text-purple-500 disabled:opacity-50"
                  title="Corregir texto con IA"
                >
                  {correcting ? (
                    <Loader2 className="h-4.5 w-4.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-4.5 w-4.5" />
                  )}
                </button>
              )}
              {(windowOpen || isInternalNote) && messageText.trim() ? (
                <button
                  onClick={handleSend}
                  disabled={sending}
                  className="p-2.5 bg-[#25D366] hover:bg-[#128C7E] text-white rounded-full transition-colors disabled:opacity-50"
                >
                  <Send className="h-5 w-5" />
                </button>
              ) : (windowOpen || isInternalNote) ? (
                <button
                  onClick={startRecording}
                  className="p-2.5 hover:bg-white/50 rounded-full transition-colors text-gray-500 hover:text-[#25D366]"
                  title="Grabar nota de voz"
                >
                  <Mic className="h-5 w-5" />
                </button>
              ) : null}
            </>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileUpload}
        />
      </div>

      {/* Template picker dialog */}
      <Dialog open={showTemplatePicker} onOpenChange={(open) => { setShowTemplatePicker(open); if (!open) { setSelectedTemplate(null); setTemplateHeaderMedia(null); } }}>
        <DialogContent className="sm:max-w-[500px] max-h-[80vh] flex flex-col p-0 gap-0">
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b bg-[#f0f2f5] rounded-t-lg">
            {selectedTemplate && (
              <button onClick={() => setSelectedTemplate(null)} className="p-1 hover:bg-gray-200 rounded-full">
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <LayoutTemplate className="h-5 w-5 text-orange-500" />
            <h3 className="font-semibold text-sm">{selectedTemplate ? "Configurar y enviar" : "Seleccionar plantilla"}</h3>
          </div>

          {/* Error banner */}
          {sendError && (
            <div className="mx-4 mt-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center gap-2">
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
              {sendError}
            </div>
          )}

          {!selectedTemplate ? (
            <div className="flex-1 overflow-y-auto min-h-[200px]">
              {loadingTemplates ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                </div>
              ) : availableTemplates.length === 0 ? (
                <div className="text-center py-8 text-sm text-gray-500">
                  <LayoutTemplate className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                  <p className="font-medium">No hay plantillas aprobadas</p>
                  <p className="text-xs mt-1">Crea plantillas desde Plantillas WhatsApp y envialas a Meta</p>
                </div>
              ) : (
                <>
                <div className="sticky top-0 bg-white px-4 pt-3 pb-2 border-b z-10">
                  <input
                    type="text"
                    placeholder="Buscar plantilla..."
                    className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#25D366]/50 focus:border-[#25D366]"
                    onChange={(e) => {
                      const search = e.target.value.toLowerCase();
                      const list = document.querySelectorAll('[data-template-item]');
                      list.forEach((el) => {
                        const name = el.getAttribute('data-template-name') || '';
                        (el as HTMLElement).style.display = name.includes(search) ? '' : 'none';
                      });
                    }}
                    autoFocus
                  />
                </div>
                <div className="p-4 space-y-2">
                {availableTemplates.map((t) => (
                  <button
                    key={t.id}
                    data-template-item
                    data-template-name={t.name.toLowerCase()}
                    onClick={() => selectTemplate(t)}
                    className="w-full text-left p-3 border rounded-lg hover:bg-gray-50 hover:border-[#25D366]/40 transition-colors"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm">{t.name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700">{t.language}</span>
                    </div>
                    <p className="text-xs text-gray-500 line-clamp-2">{t.body_text}</p>
                  </button>
                ))}
                </div>
                </>
              )}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Template name */}
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-700">{selectedTemplate.name}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700">{selectedTemplate.language}</span>
              </div>

              {/* Header media upload for document/image/video templates */}
              {(selectedTemplate.header_type === "document" || selectedTemplate.header_type === "image" || selectedTemplate.header_type === "video") && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                    {selectedTemplate.header_type === "document" ? "Documento adjunto" : selectedTemplate.header_type === "image" ? "Imagen de cabecera" : "Video de cabecera"}
                  </p>
                  {templateHeaderMedia ? (
                    <div className="flex items-center gap-2 p-2 rounded-lg border border-green-200 bg-green-50">
                      <FileText className="h-4 w-4 text-green-600 shrink-0" />
                      <span className="text-xs text-green-800 truncate flex-1">{templateHeaderMedia.filename}</span>
                      <button onClick={() => setTemplateHeaderMedia(null)} className="text-gray-400 hover:text-gray-600">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <label className="flex items-center justify-center gap-2 p-3 rounded-lg border-2 border-dashed border-gray-300 hover:border-[#25D366] cursor-pointer transition-colors">
                      {uploadingHeaderMedia ? (
                        <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                      ) : (
                        <Paperclip className="h-4 w-4 text-gray-400" />
                      )}
                      <span className="text-xs text-gray-500">
                        {uploadingHeaderMedia ? "Subiendo..." : "Haz clic para adjuntar archivo"}
                      </span>
                      <input
                        type="file"
                        className="hidden"
                        accept={selectedTemplate.header_type === "document" ? ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt" : selectedTemplate.header_type === "image" ? "image/*" : "video/*"}
                        onChange={handleTemplateHeaderUpload}
                        disabled={uploadingHeaderMedia}
                      />
                    </label>
                  )}
                </div>
              )}

              {/* Editable message preview */}
              <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
                {selectedTemplate.header_type === "text" && selectedTemplate.header_content && (
                  <div className="px-3 pt-3 pb-1">
                    <p className="font-bold text-sm text-gray-900">{selectedTemplate.header_content}</p>
                  </div>
                )}
                <div className="px-3 py-2">
                  <textarea
                    readOnly
                    value={Object.entries(templateParams).reduce(
                      (text, [key, val]) => text.replace(`{{${key}}}`, val || `{{${key}}}`),
                      selectedTemplate.body_text
                    )}
                    className="w-full text-[13px] text-gray-800 bg-transparent resize-none focus:outline-none cursor-default"
                    rows={Math.min(8, Math.max(3, selectedTemplate.body_text.split("\n").length + 1))}
                  />
                </div>
                {selectedTemplate.footer_text && (
                  <div className="px-3 pb-2">
                    <p className="text-[11px] text-gray-400">{selectedTemplate.footer_text}</p>
                  </div>
                )}
                {selectedTemplate.buttons?.length > 0 && (
                  <div className="border-t border-gray-100 px-3 py-2 space-y-1">
                    {selectedTemplate.buttons.map((b: any, i: number) => (
                      <div key={i} className="text-center text-xs text-blue-600 font-medium py-1">{b.text}</div>
                    ))}
                  </div>
                )}
              </div>

              {/* Variable params — improved layout */}
              {Object.keys(templateParams).length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Variables del mensaje</p>
                  {Object.entries(templateParams).map(([key, val]) => (
                    <div key={key} className="space-y-1">
                      <label className="text-xs text-gray-500 font-medium">Variable {`{{${key}}}`}</label>
                      <input
                        type="text"
                        value={val}
                        onChange={(e) => setTemplateParams((prev) => ({ ...prev, [key]: e.target.value }))}
                        placeholder={`Escribe el valor para {{${key}}}...`}
                        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#25D366]/30 focus:border-[#25D366]/50"
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* Send button */}
              <button
                onClick={handleSendTemplate}
                disabled={sending}
                className="w-full py-2.5 bg-[#25D366] hover:bg-[#128C7E] text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Send className="h-4 w-4" />
                {sending ? "Enviando..." : "Enviar plantilla"}
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Lost-reason dialog — triggered when picking "Cerrado perdido" from the stage dropdown */}
      <Dialog open={showLostForm} onOpenChange={(open) => { if (!savingLost) setShowLostForm(open); }}>
        <DialogContent className="max-w-md" onInteractOutside={(e) => { if (savingLost) e.preventDefault(); }}>
          <DialogHeader>
            <DialogTitle className="text-red-600">Marcar lead como perdido</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-gray-500">
              Al confirmar, el lead pasara a <span className="font-medium">Cerrado perdido</span> en el CRM y esta conversacion se archivara automaticamente.
            </p>
            <div>
              <label className="block text-sm font-medium mb-2">Motivo de perdida *</label>
              <select
                value={lostReason}
                onChange={(e) => setLostReason(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500/50"
              >
                <option value="">Selecciona un motivo...</option>
                {(funnelLossReasons.length > 0 ? funnelLossReasons : LOST_REASONS).map((r) => (
                  <option key={r.key} value={r.key}>{r.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Notas adicionales</label>
              <textarea
                placeholder="Detalle opcional sobre por que se perdio..."
                value={lostNotes}
                onChange={(e) => setLostNotes(e.target.value)}
                rows={3}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500/50"
              />
            </div>
            <div className="flex gap-2 justify-end pt-1">
              <button
                type="button"
                onClick={() => setShowLostForm(false)}
                disabled={savingLost}
                className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmLost}
                disabled={!lostReason || savingLost}
                className="px-3 py-1.5 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
              >
                {savingLost && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Confirmar perdido y archivar
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function groupMessagesByDate(messages: WaMessage[]) {
  const groups: { date: string; msgs: WaMessage[] }[] = [];
  let currentDate = "";

  for (const msg of messages) {
    const date = new Date(msg.created_at).toLocaleDateString("es-ES", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
    const capitalizedDate = date.charAt(0).toUpperCase() + date.slice(1);

    if (capitalizedDate !== currentDate) {
      currentDate = capitalizedDate;
      groups.push({ date: capitalizedDate, msgs: [] });
    }
    groups[groups.length - 1].msgs.push(msg);
  }

  return groups;
}

// --- Emoji Picker Popover ---
const EMOJI_CATEGORIES: { label: string; emojis: string[] }[] = [
  {
    label: "Frecuentes",
    emojis: ["👍", "❤️", "😂", "😍", "😢", "🙏", "🎉", "🔥", "👏", "😊", "😘", "😮", "🤔", "😱", "👌", "💪"],
  },
  {
    label: "Caras",
    emojis: ["😀", "😃", "😄", "😁", "😅", "🤣", "😂", "🙂", "🙃", "😉", "😊", "😇", "🥰", "😍", "🤩", "😘", "😗", "☺️", "😚", "😙", "🥲", "😋", "😛", "😜", "🤪", "😝", "🤑", "🤗", "🤭", "🤫", "🤔", "🤐", "🤨", "😐", "😑", "😶", "😏", "😒", "🙄", "😬", "🤥", "😌", "😔", "😪", "🤤", "😴", "😷", "🤒", "🤕", "🤢", "🤮", "🤧", "🥵", "🥶", "🥴", "😵", "🤯", "🤠", "🥳", "🥸", "😎", "🤓", "🧐", "😕", "😟", "🙁", "☹️", "😮", "😯", "😲", "😳", "🥺", "😦", "😧", "😨", "😰", "😥", "😢", "😭", "😱", "😖", "😣", "😞", "😓", "😩", "😫"],
  },
  {
    label: "Gestos",
    emojis: ["👍", "👎", "👊", "✊", "🤛", "🤜", "👏", "🙌", "👐", "🤲", "🤝", "🙏", "✍️", "💅", "🤳", "💪", "🦵", "🦶", "👂", "👃", "✌️", "🤞", "🤟", "🤘", "👌", "🤌", "🤏", "👈", "👉", "👆", "👇", "☝️", "👋", "🤚", "🖐️", "✋", "🖖"],
  },
  {
    label: "Corazones",
    emojis: ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🩶", "🤍", "🤎", "💘", "💝", "💖", "💗", "💓", "💞", "💕", "💌", "💟", "❣️", "❤️‍🔥", "❤️‍🩹"],
  },
  {
    label: "Objetos",
    emojis: ["🔥", "⭐", "🌟", "✨", "💥", "🎉", "🎊", "🏆", "🏅", "🥇", "🥈", "🥉", "⚽", "🏀", "🎵", "🎶", "🎸", "🎤", "📷", "📸", "☕", "🍺", "🍻", "🎂", "🎁", "📩", "📞", "💻", "💰", "💳"],
  },
];

function EmojiPickerPopover({ onSelect, onClose }: { onSelect: (emoji: string) => void; onClose: () => void }) {
  const [activeCategory, setActiveCategory] = useState(0);
  const [search, setSearch] = useState("");

  // Flatten all emojis for search (simple - just show all when searching)
  const allEmojis = EMOJI_CATEGORIES.flatMap((c) => c.emojis);

  return (
    <div className="absolute bottom-full right-0 mb-2 w-72 bg-white rounded-xl shadow-xl border border-gray-200 z-30 animate-in fade-in slide-in-from-bottom-2 duration-150">
      {/* Search */}
      <div className="p-2 border-b border-gray-100">
        <input
          type="text"
          placeholder="Buscar emoji..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-3 py-1.5 text-sm bg-gray-50 rounded-lg border-0 focus:outline-none focus:ring-1 focus:ring-[#25D366]/30 placeholder:text-gray-400"
          autoFocus
        />
      </div>

      {/* Category tabs */}
      {!search && (
        <div className="flex border-b border-gray-100 px-1">
          {EMOJI_CATEGORIES.map((cat, i) => (
            <button
              key={cat.label}
              onClick={() => setActiveCategory(i)}
              className={cn(
                "flex-1 py-1.5 text-[10px] font-medium transition-colors truncate px-0.5",
                activeCategory === i
                  ? "text-[#25D366] border-b-2 border-[#25D366]"
                  : "text-gray-400 hover:text-gray-600"
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>
      )}

      {/* Emoji grid */}
      <div className="p-2 h-48 overflow-y-auto">
        <div className="grid grid-cols-8 gap-0.5">
          {(search
            ? allEmojis
            : EMOJI_CATEGORIES[activeCategory].emojis
          ).map((emoji, i) => (
            <button
              key={`${emoji}-${i}`}
              onClick={() => onSelect(emoji)}
              className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 transition-colors text-xl hover:scale-110 active:scale-95"
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
