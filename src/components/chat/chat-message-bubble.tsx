"use client";

import { useState } from "react";
import {
  Reply,
  Pencil,
  Trash2,
  Check,
  X,
  AlertTriangle,
  Clock,
  CheckCircle2,
  PlusCircle,
  ListTodo,
  CalendarPlus,
  CircleSlash,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";
import { cn } from "../../lib/utils";
import { ChatAttachmentPreview } from "./chat-attachment-preview";
import { formatCountdown } from "./use-sla-countdown";
import type { SlaCountdownInfo } from "./use-sla-countdown";
import type { ChatMessage } from "./types";

interface ChatMessageBubbleProps {
  message: ChatMessage;
  isOwn: boolean;
  currentUserId?: string;
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
  // Llamado al pulsar "Conversación terminada" — zanja el hilo entero para
  // el usuario actual (el panel padre refresca la lista y cierra SLAs).
  onEndThread?: (messageId: string) => void;
  // Si el currentUser ya respondió a este mensaje, id del reply. La lista
  // padre lo calcula del array completo de mensajes. La burbuja lo usa
  // para mostrar el badge "Respondido" y para ocultar "Marcar como hecho".
  myReplyId?: string | null;
  // Hace scroll suave al reply mío cuando el usuario pulsa el badge
  // "Respondido". La lista padre conoce los refs DOM.
  onScrollToMyReply?: (originalMessageId: string) => void;
  slaCountdown?: SlaCountdownInfo;
  // Marca el primer mensaje renderizado del chat: la lista lo usa para
  // colocar los data-testid del qa_flow (msg-reply-icon-first, msg-read-
  // avatars-first) sin tener que mirar índices/DOM en los tests.
  isFirst?: boolean;
}

// Paleta fija de colores para los avatares apilados de "leído". Elegir el
// color por hash estable del user_id mantiene cada persona con el mismo
// color a lo largo del chat aunque entre/salga del read_by de varios
// mensajes (no se reorganiza por orden de lectura).
const READ_AVATAR_COLORS = [
  "bg-pink-500",
  "bg-indigo-500",
  "bg-blue-600",
  "bg-teal-500",
  "bg-amber-500",
  "bg-emerald-500",
  "bg-fuchsia-500",
  "bg-orange-500",
];
function hashColorIndex(userId: string): number {
  let h = 0;
  for (let i = 0; i < userId.length; i++) {
    h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  }
  return h % READ_AVATAR_COLORS.length;
}

function formatReadAtDetail(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  const time = date.toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  });
  if (sameDay) return `Hoy ${time}`;
  const ymd = date.toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
  });
  return `${ymd} ${time}`;
}

interface ReadAvatarsProps {
  readBy: NonNullable<ChatMessage["read_by"]>;
  testId?: string;
}

// Avatares apilados (máx 3 visibles) + contador "+N" + popover con la tabla
// "Persona / Visto". Sustituye al bloque inline "Leído: Yaiza 6 may 07:50…"
// que ocupaba dos líneas y se hacía ilegible cuando había >2 lectores.
function ReadAvatars({ readBy, testId }: ReadAvatarsProps) {
  if (readBy.length === 0) return null;
  const visible = readBy.slice(0, 3);
  const rest = readBy.length - visible.length;

  return (
    <Popover>
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button
                type="button"
                data-testid={testId}
                aria-label={`Visto por ${readBy.length} ${readBy.length === 1 ? "persona" : "personas"}`}
                className="inline-flex items-center cursor-pointer align-middle"
              >
                {visible.map((r, idx) => (
                  <span
                    key={r.user_id}
                    className={cn(
                      "inline-grid place-items-center text-white text-[8px] font-semibold",
                      "w-[18px] h-[18px] rounded-full border-[1.5px] border-background",
                      READ_AVATAR_COLORS[hashColorIndex(r.user_id)],
                      idx > 0 && "-ml-1.5"
                    )}
                  >
                    {getInitials(r.full_name)}
                  </span>
                ))}
                <span className="ml-1 text-[9px] font-semibold text-muted-foreground">
                  {rest > 0 ? `+${rest}` : `${readBy.length} ${readBy.length === 1 ? "visto" : "vistos"}`}
                </span>
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="top">
            Click para ver quién y cuándo ha leído este mensaje
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <PopoverContent
        side="top"
        align="end"
        className="w-auto min-w-[220px] p-0"
        data-testid="msg-read-popover"
      >
        <div className="px-3 py-2 border-b">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Lectores
          </p>
        </div>
        <table className="w-full text-xs">
          <thead className="bg-muted/40">
            <tr>
              <th className="text-left font-medium px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                Persona
              </th>
              <th className="text-right font-medium px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                Visto
              </th>
            </tr>
          </thead>
          <tbody>
            {readBy.map((r) => (
              <tr key={r.user_id} className="border-t">
                <td className="px-3 py-1.5">
                  <span className="inline-flex items-center gap-2">
                    <span
                      className={cn(
                        "inline-grid place-items-center text-white text-[8px] font-semibold w-4 h-4 rounded-full",
                        READ_AVATAR_COLORS[hashColorIndex(r.user_id)]
                      )}
                    >
                      {getInitials(r.full_name)}
                    </span>
                    {r.full_name}
                  </span>
                </td>
                <td className="px-3 py-1.5 text-right text-muted-foreground tabular-nums">
                  {formatReadAtDetail(r.read_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </PopoverContent>
    </Popover>
  );
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Delta compacto entre el mensaje original y la respuesta. Lo mostramos al
// lado de la hora ("09:37 · 12 min después") para que el equipo vea de un
// vistazo cuánto se tardó en contestar — útil para detectar respuestas
// rápidas vs. mensajes que se quedaron días sin atender.
function formatReplyDelta(fromIso: string, toIso: string): string | null {
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  const diffMs = to - from;
  if (!Number.isFinite(diffMs) || diffMs <= 0) return null;

  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "menos de 1 min después";
  if (minutes < 60) return `${minutes} min después`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h después`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} d después`;

  const months = Math.floor(days / 30);
  return `${months} mes${months === 1 ? "" : "es"} después`;
}

function getFirstName(name: string): string {
  return name.trim().split(" ")[0] || name;
}

function SlaCountdownBadge({ sla, isOwn }: { sla: SlaCountdownInfo; isOwn?: boolean }) {
  if (sla.isBreached) {
    // Remitente ve badge amarillo/naranja; destinatario ve badge rojo
    if (isOwn) {
      return (
        <div className="flex flex-col items-center gap-0.5 rounded-lg bg-amber-50 border border-amber-300 px-2.5 py-1.5">
          <Clock className="h-4 w-4 text-amber-600" />
          <span className="text-[11px] font-bold text-amber-700 uppercase tracking-wide">
            Sin respuesta
          </span>
          {sla.isEscalated && (
            <span className="text-[9px] font-medium text-orange-600 leading-tight">
              Notificado
            </span>
          )}
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center gap-0.5 rounded-lg bg-red-50 border border-red-200 px-2.5 py-1.5 animate-sla-blink">
        <AlertTriangle className="h-4 w-4 text-red-600" />
        <span className="text-[11px] font-bold text-red-700 uppercase tracking-wide">
          SLA superado
        </span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-0.5 rounded-lg border px-2.5 py-1.5",
        sla.isWarning
          ? "bg-orange-50 border-orange-300 animate-sla-blink"
          : "bg-amber-50 border-amber-200"
      )}
    >
      <Clock
        className={cn(
          "h-3.5 w-3.5",
          sla.isWarning ? "text-orange-600" : "text-amber-600"
        )}
      />
      <span
        className={cn(
          "text-xs font-mono font-bold tabular-nums",
          sla.isWarning ? "text-orange-700" : "text-amber-700"
        )}
      >
        {formatCountdown(sla.remainingSeconds)}
      </span>
    </div>
  );
}

export function ChatMessageBubble({
  message,
  isOwn,
  currentUserId,
  onEdit,
  onDelete,
  onReply,
  onClaimTask,
  onToggleTask,
  onQuickComplete,
  onCreateTaskFromMessage,
  onEndThread,
  myReplyId,
  onScrollToMyReply,
  slaCountdown,
  isFirst,
}: ChatMessageBubbleProps) {
  const iAlreadyReplied = !!myReplyId;
  const [showActions, setShowActions] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [editPriority, setEditPriority] = useState<"normal" | "urgente" | "tarea">(message.priority || "normal");

  if (message.deleted_at) {
    return (
      <div
        className={cn("flex mb-3", isOwn ? "justify-end" : "justify-start")}
      >
        <div className="px-3 py-2 rounded-lg bg-muted/30 max-w-[80%]">
          <p className="text-sm text-muted-foreground italic">
            Mensaje eliminado
          </p>
        </div>
      </div>
    );
  }

  const handleSaveEdit = () => {
    const trimmed = editContent.trim();
    if (trimmed && (trimmed !== message.content || editPriority !== message.priority)) {
      onEdit(message.id, trimmed, editPriority);
    }
    setIsEditing(false);
    setEditContent(message.content);
    setEditPriority(message.priority || "normal");
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditContent(message.content);
    setEditPriority(message.priority || "normal");
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSaveEdit();
    }
    if (e.key === "Escape") {
      handleCancelEdit();
    }
  };

  const isUrgent = message.priority === "urgente";
  const isTask = message.priority === "tarea";
  const hasSlaCountdown = !!slaCountdown;
  const taskMentions = message.mentions?.filter((mention) => !!mention.task_status) || [];
  const myMention = currentUserId
    ? taskMentions.find((mention) => mention.mentioned_user_id === currentUserId)
    : null;
  // ¿Estoy yo entre las @ menciones de este mensaje? Cubre TODAS las
  // menciones (con o sin task_status). Lo usa el filtro de "Marcar como
  // hecho": solo el destinatario explícito puede marcar como hecho —
  // no todo el equipo del proyecto que ve el mensaje pasando por el chat
  // (Chany 18 may 2026: "No me debería permitir a mi marcar como hecho un
  // mensaje dirigido a Florencia Cabuli. Solo a ella.").
  const isMentionedToMe = !!currentUserId
    && (message.mentions?.some((m) => m.mentioned_user_id === currentUserId) ?? false);
  const canClaimTask =
    !!currentUserId &&
    (message.priority === "urgente" || message.priority === "tarea") &&
    !myMention;
  const canToggleAsSender =
    !!currentUserId &&
    currentUserId === message.sender_id &&
    taskMentions.length > 0;
  const canToggleAsMentioned = !!myMention;
  const allMentionsDone =
    taskMentions.length > 0 &&
    taskMentions.every((mention) => mention.task_status === "realizada");
  const toggleTargetMentionId = canToggleAsSender
    ? taskMentions[0]?.id
    : myMention?.id;
  const nextTaskStatus: "pendiente" | "realizada" = allMentionsDone
    ? "pendiente"
    : "realizada";
  const canToggleTask =
    !!toggleTargetMentionId && (canToggleAsSender || canToggleAsMentioned);
  const showTaskCard = message.priority === "urgente" || message.priority === "tarea";
  const hasTaskMentions = taskMentions.length > 0;
  const readReceipts = message.read_by || [];
  const mentionedReadReceipts = readReceipts.filter((receipt) =>
    taskMentions.some((mention) => mention.mentioned_user_id === receipt.user_id)
  );
  const cardStatusLabel = hasTaskMentions
    ? allMentionsDone
      ? "Realizada"
      : "Pendiente"
    : readReceipts.length > 0
      ? "Recibido"
      : "Sin confirmar";
  const cardStatusClassName = hasTaskMentions
    ? allMentionsDone
      ? "border-green-300 bg-green-100 text-green-700"
      : "border-amber-300 bg-white text-amber-700"
    : readReceipts.length > 0
      ? "border-blue-300 bg-blue-100 text-blue-700"
      : "border-slate-300 bg-white text-slate-600";
  const taskActionLabel = nextTaskStatus === "realizada"
    ? canToggleAsSender
      ? "Marcar toda la tarea como realizada"
      : "Marcar mi tarea como realizada"
    : canToggleAsSender
      ? "Volver toda la tarea a pendiente"
      : "Volver mi tarea a pendiente";
  const claimActionLabel = isOwn
    ? "Guardármela como tarea"
    : isTask
      ? "Añadir a mis tareas"
      : "Añadírmela a mis tareas";

  return (
    <div
      className={cn("flex mb-3 group", isOwn ? "justify-end" : "justify-start")}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* SLA countdown badge - left side for own messages (hidden for urgente/tarea) */}
      {isOwn && hasSlaCountdown && !isUrgent && !isTask && (
        <div className="flex items-center shrink-0 mr-2 self-center">
          <SlaCountdownBadge sla={slaCountdown} isOwn />
        </div>
      )}

      {/* Avatar for others */}
      {!isOwn && (
        <Avatar className="h-8 w-8 mr-2 mt-1 shrink-0">
          {message.sender.avatar_url && (
            <AvatarImage src={message.sender.avatar_url} />
          )}
          <AvatarFallback className="text-xs">
            {getInitials(message.sender.full_name)}
          </AvatarFallback>
        </Avatar>
      )}

      <div className={cn("flex flex-col max-w-[75%]", isOwn && "items-end")}>
        {/* Name + role for others */}
        {!isOwn && (
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-xs font-medium text-foreground">
              {message.sender.full_name}
            </span>
            <Badge
              variant="secondary"
              className="text-[10px] px-1.5 py-0 h-4"
            >
              {message.sender.role}
            </Badge>
          </div>
        )}

        <div className="relative flex items-start gap-1">
          {/* Hover actions - left side for own messages */}
          {isOwn && showActions && !isEditing && (
            <TooltipProvider delayDuration={300}>
              <div className="flex items-center gap-0.5 shrink-0 self-center">
                {onCreateTaskFromMessage && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-blue-600"
                    onClick={() => onCreateTaskFromMessage(message)}
                    title="Guardar como tarea"
                  >
                    <CalendarPlus className="h-3.5 w-3.5" />
                  </Button>
                )}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                      onClick={() => onReply(message)}
                      data-testid={isFirst ? "msg-reply-icon-first" : undefined}
                      aria-label="Responder"
                    >
                      <Reply className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Responder</TooltipContent>
                </Tooltip>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setIsEditing(true);
                    setEditContent(message.content);
                    setEditPriority(message.priority || "normal");
                  }}
                  title="Editar"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                  onClick={() => onDelete(message.id)}
                  title="Eliminar"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </TooltipProvider>
          )}

          {/* Message bubble */}
          {/* SLA vencido: si el mensaje me menciona a mí (no es mío) y su SLA
              está superado, pintamos fondo rojo muy translúcido + borde rojo
              oscuro + parpadeo. Sobrescribe el bg-muted normal para que se
              vea de un vistazo qué mensajes están "en rojo" sin tener que
              mirar el badge lateral. */}
          {(() => {
            const slaOverdueForMe = !isOwn && !!slaCountdown?.isBreached;
            return (
              <div
                className={cn(
                  "rounded-lg px-3 py-2 text-sm",
                  slaOverdueForMe
                    ? "bg-red-500/15 border-2 border-red-800 animate-sla-blink text-foreground"
                    : isOwn
                      ? "bg-blue-50 text-foreground"
                      : "bg-muted text-foreground",
                  !slaOverdueForMe && isUrgent && "border-l-[3px] border-l-orange-400",
                  !slaOverdueForMe && isTask && "border-l-[3px] border-l-blue-400"
                )}
              >
            {/* Reply quote */}
            {message.reply_to && (
              <div className="border-l-2 border-primary/40 pl-2 mb-1.5 text-xs text-muted-foreground">
                <span className="font-medium">
                  {message.reply_to.sender_name}
                </span>
                <p className="truncate max-w-[250px]">
                  {message.reply_to.content}
                </p>
              </div>
            )}

            {/* Content or edit form */}
            {isEditing ? (
              <div className="flex flex-col gap-1">
                <Textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  onKeyDown={handleEditKeyDown}
                  className="min-h-[40px] text-sm resize-none"
                  autoFocus
                />
                <div className="flex items-center gap-1 justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "h-6 px-2",
                      editPriority === "urgente" && "bg-orange-100 text-orange-600",
                      editPriority === "tarea" && "bg-blue-100 text-blue-600"
                    )}
                    onClick={() => setEditPriority((p) => p === "normal" ? "urgente" : p === "urgente" ? "tarea" : "normal")}
                    title={editPriority === "normal" ? "Normal" : editPriority === "urgente" ? "Urgente" : "Tarea"}
                  >
                    {editPriority === "urgente" ? (
                      <AlertTriangle className="h-3 w-3 mr-1 text-orange-600" />
                    ) : editPriority === "tarea" ? (
                      <ListTodo className="h-3 w-3 mr-1 text-blue-600" />
                    ) : (
                      <AlertTriangle className="h-3 w-3 mr-1 text-muted-foreground" />
                    )}
                    {editPriority === "urgente" ? "Urgente" : editPriority === "tarea" ? "Tarea" : "Normal"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2"
                    onClick={handleCancelEdit}
                  >
                    <X className="h-3 w-3 mr-1" />
                    Cancelar
                  </Button>
                  <Button
                    size="sm"
                    className="h-6 px-2"
                    onClick={handleSaveEdit}
                  >
                    <Check className="h-3 w-3 mr-1" />
                    Guardar
                  </Button>
                </div>
              </div>
            ) : (
              <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">
                {message.content}
              </p>
            )}

            {/* Attachments */}
            <ChatAttachmentPreview attachments={message.attachments} />

            {/* Timestamp + priority + edited + read receipts */}
            <div
              className={cn(
                "flex items-center gap-1 mt-1 flex-wrap",
                isOwn ? "justify-end" : "justify-start"
              )}
            >
              <span className="text-[10px] text-muted-foreground">
                {formatTime(message.created_at)}
              </span>
              {message.reply_to?.created_at && (() => {
                const delta = formatReplyDelta(
                  message.reply_to.created_at,
                  message.created_at
                );
                return delta ? (
                  <span
                    className="text-[10px] text-muted-foreground"
                    title={`Respondido ${delta} de "${message.reply_to.sender_name}"`}
                  >
                    · {delta}
                  </span>
                ) : null;
              })()}
              {message.priority === "urgente" && (
                <span className="text-[10px] font-semibold text-white bg-orange-500 rounded px-1 py-0.5 leading-none uppercase">
                  Urgente
                </span>
              )}
              {message.priority === "tarea" && (
                <span className="text-[10px] font-semibold text-white bg-blue-500 rounded px-1 py-0.5 leading-none uppercase">
                  Tarea
                </span>
              )}
              {message.edited_at && (
                <span className="text-[10px] text-muted-foreground italic">
                  (editado)
                </span>
              )}
              {message.read_by && message.read_by.length > 0 && (
                <ReadAvatars
                  readBy={message.read_by}
                  testId={isFirst ? "msg-read-avatars-first" : undefined}
                />
              )}
            </div>
            {/* Compact task mentions for urgent/task messages */}
            {showTaskCard && hasTaskMentions && (
              <div className="flex flex-wrap items-center gap-1 mt-1">
                {taskMentions.map((mention) => (
                  <span
                    key={mention.id}
                    className={cn(
                      "inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded",
                      mention.task_status === "realizada"
                        ? "text-green-700 bg-green-50"
                        : "text-amber-700 bg-amber-50"
                    )}
                  >
                    {mention.task_status === "realizada" ? (
                      <Check className="h-2.5 w-2.5" />
                    ) : (
                      <Clock className="h-2.5 w-2.5" />
                    )}
                    {getFirstName(mention.mentioned_user_name || "Usuario")}
                  </span>
                ))}
                {canClaimTask && (
                  <button
                    onClick={() => onClaimTask?.(message.id)}
                    className="inline-flex items-center gap-0.5 text-[10px] text-blue-600 hover:text-blue-700 px-1.5 py-0.5 rounded hover:bg-blue-50 transition-colors"
                  >
                    <PlusCircle className="h-2.5 w-2.5" />
                    Unirme
                  </button>
                )}
                {canToggleTask && toggleTargetMentionId && (
                  <button
                    onClick={() =>
                      onToggleTask?.(
                        toggleTargetMentionId,
                        message.id,
                        nextTaskStatus
                      )
                    }
                    className={cn(
                      "inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded transition-colors",
                      nextTaskStatus === "realizada"
                        ? "text-green-600 hover:bg-green-50"
                        : "text-amber-600 hover:bg-amber-50"
                    )}
                  >
                    {nextTaskStatus === "realizada" ? (
                      <Check className="h-2.5 w-2.5" />
                    ) : (
                      <Clock className="h-2.5 w-2.5" />
                    )}
                    {nextTaskStatus === "realizada" ? "Hecha" : "Pendiente"}
                  </button>
                )}
              </div>
            )}
            {/* Claim button for urgent/task messages without mentions yet */}
            {showTaskCard && !hasTaskMentions && canClaimTask && (
              <div className="mt-1">
                <button
                  onClick={() => onClaimTask?.(message.id)}
                  className="inline-flex items-center gap-1 text-[10px] font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded px-1.5 py-0.5 transition-colors"
                >
                  <PlusCircle className="h-2.5 w-2.5" />
                  {claimActionLabel}
                </button>
              </div>
            )}
            {/* Badge "Respondido" — petición Chany 18 may 2026. Sale en
                CUALQUIER mensaje que NO sea mío y al que yo ya le haya
                contestado con un reply. Click → scroll suave a mi reply.
                Si está visible, ocultamos "Marcar como hecho" y "Conv.
                terminada" porque ya está despachado por reply. */}
            {iAlreadyReplied && !isOwn && (
              <div className="mt-1.5">
                <button
                  onClick={() =>
                    onScrollToMyReply && onScrollToMyReply(message.id)
                  }
                  title="Ya respondiste a este mensaje. Haz click para ir a tu respuesta."
                  className="inline-flex items-center gap-1 text-xs font-medium rounded-md px-2.5 py-1 transition-colors border text-green-700 bg-green-50 border-green-200 hover:bg-green-100"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Respondido
                </button>
              </div>
            )}
            {/* Botón "Conversación terminada" — petición Chany 18 may 2026.
                Sale en cualquier mensaje que sea una respuesta (tiene reply_to)
                y que YO he recibido y aún tiene SLA corriendo hacia mí. Cierra
                de un click todas las mentions pendientes del hilo entero. NO
                aparece si ya respondí con un reply — ese acto ya cierra el SLA. */}
            {message.reply_to && !isOwn && hasSlaCountdown && !iAlreadyReplied && onEndThread && (
              <div className="mt-1.5">
                <button
                  onClick={() => onEndThread(message.id)}
                  title="Marcar este hilo como terminado para mí. Deja de correr el SLA."
                  className="inline-flex items-center gap-1 text-xs font-medium rounded-md px-2.5 py-1 transition-colors border text-slate-700 bg-slate-50 border-slate-200 hover:bg-slate-100"
                >
                  <CircleSlash className="h-3.5 w-3.5" />
                  Conversación terminada
                </button>
              </div>
            )}
            {/* Quick complete button — visible para los mensajes
                urgente/tarea que ME DIRIGIERON A MÍ (isMentionedToMe).
                NO aparece para quien solo está mirando el chat pero no es
                destinatario — p.ej. Chany no debe poder marcar como hecho
                un mensaje dirigido a Florencia Cabuli (Chany 18 may 2026).
                Tampoco aparece si yo ya respondí con un reply explícito —
                ese acto ya cierra la tarea. */}
            {showTaskCard && !isOwn && isMentionedToMe && !iAlreadyReplied && onQuickComplete && (
              <div className="mt-1.5">
                <button
                  onClick={() => onQuickComplete(message.id)}
                  className={cn(
                    "inline-flex items-center gap-1 text-xs font-medium rounded-md px-2.5 py-1 transition-colors border",
                    myMention?.task_status === "realizada"
                      ? "text-green-700 bg-green-50 border-green-200 hover:bg-green-100"
                      : "text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100"
                  )}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {myMention?.task_status === "realizada" ? "Hecho" : "Marcar como hecho"}
                </button>
              </div>
            )}
            {/* El detalle "Leído: <nombres + horas>" se eliminó: ahora vive
                en el popover de <ReadAvatars> dentro del meta-row. Mantenemos
                un solo punto de verdad para los lectores y la burbuja queda
                visualmente más limpia (decisión sesión 20260512-163220). */}
              </div>
            );
          })()}

          {/* Hover actions - right side for other's messages */}
          {!isOwn && showActions && (
            <TooltipProvider delayDuration={300}>
              <div className="flex items-center gap-0.5 shrink-0 self-center">
                {onCreateTaskFromMessage && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-blue-600"
                    onClick={() => onCreateTaskFromMessage(message)}
                    title="Guardar como tarea"
                  >
                    <CalendarPlus className="h-3.5 w-3.5" />
                  </Button>
                )}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                      onClick={() => onReply(message)}
                      data-testid={isFirst ? "msg-reply-icon-first" : undefined}
                      aria-label="Responder"
                    >
                      <Reply className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Responder</TooltipContent>
                </Tooltip>
              </div>
            </TooltipProvider>
          )}
        </div>
      </div>

      {/* SLA countdown badge - right side for other's messages (hidden for urgente/tarea) */}
      {!isOwn && hasSlaCountdown && !isUrgent && !isTask && (
        <div className="flex items-center shrink-0 ml-2 self-center">
          <SlaCountdownBadge sla={slaCountdown} />
        </div>
      )}
    </div>
  );
}
