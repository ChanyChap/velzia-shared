"use client";

import { useState, useRef, useEffect } from "react";
import {
  Check, CheckCheck, Clock, AlertCircle, FileText, MapPin,
  Play, Pause, Download, Phone as PhoneIcon, StickyNote, Image as ImageIcon,
  Video, Mic, SmilePlus, Bell, Bot as BotIcon, Reply,
} from "lucide-react";
import { cn } from "../../lib/utils";
import type { WaMessage } from "../../lib/whatsapp/types";
import { TaskBubble } from "./task-bubble";

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

/** Convert URLs in text to clickable links */
function linkifyText(text: string): React.ReactNode[] {
  const urlRegex = /(https?:\/\/[^\s<>"{}|\\^`[\]]+)/g;
  const parts = text.split(urlRegex);
  return parts.map((part, i) => {
    if (urlRegex.test(part)) {
      // Reset lastIndex since we're reusing the regex
      urlRegex.lastIndex = 0;
      return (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 underline hover:text-blue-800 break-all"
          onClick={(e) => e.stopPropagation()}
        >
          {part}
        </a>
      );
    }
    return part;
  });
}

interface MessageBubbleProps {
  message: WaMessage;
  currentUserId: string;
  lineName?: string | null;
  lineColor?: string | null;
  contactName?: string | null;
  onReact?: (messageId: string, emoji: string) => void;
  onReply?: (message: WaMessage) => void;
}

function AudioPlayer({ mediaUrl }: { mediaUrl?: string | null }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const audioSrc = mediaUrl
    ? mediaUrl.startsWith("http")
      ? mediaUrl
      : `/api/whatsapp/media?media_id=${mediaUrl}`
    : "";

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onLoaded = () => { if (audio.duration && isFinite(audio.duration)) setDuration(audio.duration); };
    const onEnded = () => { setIsPlaying(false); setCurrentTime(0); };

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoaded);
    audio.addEventListener("durationchange", onLoaded);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("durationchange", onLoaded);
      audio.removeEventListener("ended", onEnded);
    };
  }, []);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio || !audioSrc) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play().catch(() => {});
      setIsPlaying(true);
    }
  }

  function handleSeek(e: React.MouseEvent<HTMLDivElement>) {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * duration;
    setCurrentTime(audio.currentTime);
  }

  function formatTime(s: number) {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="flex items-center gap-2 min-w-[200px] py-1">
      <audio ref={audioRef} src={audioSrc} preload="metadata" />
      <button
        onClick={togglePlay}
        className="w-8 h-8 bg-[#25D366] rounded-full flex items-center justify-center text-white flex-shrink-0 hover:bg-[#128C7E] transition-colors"
      >
        {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
      </button>
      <div className="flex-1">
        <div
          className="h-1.5 bg-gray-200 rounded-full overflow-hidden cursor-pointer"
          onClick={handleSeek}
        >
          <div
            className="h-full bg-[#25D366] rounded-full transition-all duration-100"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="text-[10px] text-gray-400 mt-0.5 block tabular-nums">
          {isPlaying || currentTime > 0 ? formatTime(currentTime) : duration > 0 ? formatTime(duration) : "0:00"}
        </span>
      </div>
      <Mic className="h-4 w-4 text-gray-400" />
    </div>
  );
}

export function MessageBubble({ message, currentUserId: _currentUserId, lineName, lineColor, contactName, onReact, onReply }: MessageBubbleProps) {
  const isOutbound = message.direction === "outbound";
  const isNote = message.is_internal_note || message.message_type === "note";
  const isSystem = message.sender_type === "system" && !isNote && message.message_type !== "template";
  const isCallLog = message.message_type === "call_log";
  const [showReactions, setShowReactions] = useState(false);

  // System messages (centered)
  if (isSystem || isCallLog) {
    return (
      <div className="flex justify-center my-2">
        <div className={cn(
          "text-[11px] px-3 py-1.5 rounded-lg max-w-xs text-center",
          isCallLog
            ? "bg-blue-50 text-blue-600 flex items-center gap-1.5"
            : "bg-white/90 backdrop-blur-sm text-gray-500 shadow-sm"
        )}>
          {isCallLog && <PhoneIcon className="h-3 w-3" />}
          {message.content}
        </div>
      </div>
    );
  }

  // Task note (indigo card with completion button)
  if (isNote && (message.metadata as any)?.team_task_id) {
    return <TaskBubble message={message as any} />;
  }

  // Internal note (yellow)
  if (isNote) {
    return (
      <div className="flex justify-end my-1.5">
        <div className="max-w-[65%] bg-amber-100 border border-amber-200 rounded-xl rounded-tr-sm px-3 py-2 shadow-sm">
          <div className="flex items-center gap-1 text-[10px] text-amber-600 mb-1 font-medium">
            <StickyNote className="h-3 w-3" />
            Nota interna {message.sender?.full_name && `- ${message.sender.full_name}`}
          </div>
          <p className="text-sm text-amber-900 whitespace-pre-wrap break-words">{linkifyText(message.content || "")}</p>
          <div className="text-right mt-1">
            <span className="text-[10px] text-amber-500">
              {formatTime(message.created_at)}
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex my-1 group", isOutbound ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[65%] rounded-xl px-3 py-2 shadow-sm relative",
          isOutbound
            ? "bg-[#d9fdd3] rounded-tr-sm"
            : "bg-white rounded-tl-sm"
        )}
        onMouseEnter={() => setShowReactions(true)}
        onMouseLeave={() => setShowReactions(false)}
      >
        {/* Quick reaction bar + reply button — appears on hover */}
        {showReactions && (onReact || onReply) && (
          <div
            className={cn(
              "absolute -top-9 z-20 flex items-center gap-0.5 bg-white rounded-full shadow-lg border border-gray-100 px-1.5 py-1 animate-in fade-in zoom-in-95 duration-150",
              isOutbound ? "right-0" : "left-0"
            )}
          >
            {onReply && (
              <button
                onClick={() => {
                  onReply(message);
                  setShowReactions(false);
                }}
                className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600"
                title="Responder"
              >
                <Reply className="h-4 w-4" />
              </button>
            )}
            {onReact && QUICK_REACTIONS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => {
                  onReact(message.id, emoji);
                  setShowReactions(false);
                }}
                className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors text-lg hover:scale-125 active:scale-95"
                title={`Reaccionar con ${emoji}`}
              >
                {emoji}
              </button>
            ))}
            {onReact && (
              <button
                onClick={() => {
                  onReact(message.id, "__picker__");
                  setShowReactions(false);
                }}
                className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600"
                title="Mas emojis"
              >
                <SmilePlus className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
          {/* Contact name + line indicator for inbound messages */}
          {!isOutbound && (contactName || lineName) && (
            <div className="text-[10px] font-medium mb-0.5 flex items-center gap-1.5">
              {contactName && (
                <span className="font-semibold text-gray-700">{contactName}</span>
              )}
              {lineName && (
                <span className="flex items-center gap-0.5 text-gray-400">
                  <span
                    className="inline-block w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: lineColor || "#25D366" }}
                  />
                  {lineName}
                </span>
              )}
            </div>
          )}

          {/* Sender name (for agent messages or bot/Laura) */}
          {isOutbound && message.sender_type === "agent" && message.sender?.full_name && (
            <div className="text-[11px] font-semibold text-[#1FA855] mb-0.5">
              {message.sender.full_name}
            </div>
          )}
          {isOutbound && message.sender_type === "bot" && (
            <div className="text-[11px] font-semibold text-[#7C3AED] mb-0.5 flex items-center gap-1">
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>
              Laura IA
            </div>
          )}

          {/* Quoted message preview (reply-to) */}
          {message.quoted_message && (
            <div className={cn(
              "rounded-lg px-2.5 py-1.5 mb-1.5 border-l-[3px] cursor-pointer",
              message.quoted_message.direction === "outbound"
                ? "bg-[#d1f4cc]/60 border-l-[#25D366]"
                : "bg-white/60 border-l-[#6B7280]"
            )}>
              <div className="text-[10px] font-semibold mb-0.5" style={{ color: message.quoted_message.direction === "outbound" ? "#25D366" : "#6B7280" }}>
                {message.quoted_message.direction === "outbound"
                  ? (message.quoted_message.sender?.full_name || "Tu")
                  : (contactName || "Contacto")}
              </div>
              <p className="text-[11px] text-gray-600 line-clamp-2 whitespace-pre-wrap break-words">
                {message.quoted_message.message_type === "image" ? "📷 Foto"
                  : message.quoted_message.message_type === "video" ? "🎥 Video"
                  : message.quoted_message.message_type === "audio" ? "🎤 Audio"
                  : message.quoted_message.message_type === "document" ? `📄 ${message.quoted_message.media_filename || "Documento"}`
                  : message.quoted_message.message_type === "location" ? "📍 Ubicacion"
                  : message.quoted_message.content || "[mensaje]"}
              </p>
            </div>
          )}

          {/* Media content */}
          {message.message_type === "image" && (
            <div className="mb-1.5 -mx-1 -mt-0.5">
              <div className="bg-gray-100 rounded-lg overflow-hidden">
                {message.media_url ? (
                  <img
                    src={message.media_url.startsWith("http") ? message.media_url : `/api/whatsapp/media?media_id=${message.media_url}`}
                    alt=""
                    className="max-w-full rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-48 flex items-center justify-center text-gray-400">
                    <ImageIcon className="h-8 w-8" />
                  </div>
                )}
              </div>
            </div>
          )}

          {message.message_type === "video" && (
            <div className="mb-1.5 -mx-1 -mt-0.5">
              {message.media_url ? (
                <video
                  src={message.media_url.startsWith("http") ? message.media_url : `/api/whatsapp/media?media_id=${message.media_url}`}
                  controls
                  preload="metadata"
                  className="max-w-full rounded-lg bg-gray-900"
                  style={{ maxHeight: "320px" }}
                />
              ) : (
                <div className="bg-gray-900 rounded-lg overflow-hidden h-48 flex items-center justify-center">
                  <Video className="h-8 w-8 text-gray-500" />
                </div>
              )}
            </div>
          )}

          {message.message_type === "audio" && (
            <AudioPlayer mediaUrl={message.media_url} />
          )}

          {message.message_type === "document" && (
            <a
              href={
                message.media_url
                  ? message.media_url.startsWith("http")
                    ? message.media_url
                    : `/api/whatsapp/media?media_id=${message.media_url}`
                  : "#"
              }
              target="_blank"
              rel="noopener noreferrer"
              download={message.media_filename || "documento"}
              className="flex items-center gap-3 bg-white/50 rounded-lg p-2.5 mb-1.5 min-w-[200px] border border-gray-100 hover:bg-white/80 transition-colors cursor-pointer"
            >
              <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0">
                <FileText className="h-5 w-5 text-blue-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">
                  {message.media_filename || "Documento"}
                </p>
                <p className="text-[10px] text-gray-400">
                  {message.media_mime_type || "Archivo"}
                </p>
              </div>
              <Download className="h-4 w-4 text-gray-400 hover:text-gray-600" />
            </a>
          )}

          {message.message_type === "location" && (
            <div className="mb-1.5 -mx-1 -mt-0.5">
              <div className="bg-green-50 rounded-lg p-3 flex items-center gap-2">
                <MapPin className="h-5 w-5 text-green-600 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">
                    {message.location_data?.name || "Ubicacion"}
                  </p>
                  {message.location_data?.address && (
                    <p className="text-xs text-gray-500 truncate">{message.location_data.address}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {message.message_type === "template" && (() => {
            const isReminder = message.content?.startsWith("[Recordatorio]") || (message.metadata as any)?.automation === "meeting_reminder";
            const displayContent = message.content?.replace(/^\[Recordatorio\]\s*/, "") || "";

            if (isReminder) {
              return (
                <div className="mb-1">
                  <div className="flex items-center gap-1.5 mb-2">
                    <div className="w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                      <Bell className="h-3 w-3 text-amber-600" />
                    </div>
                    <span className="text-[10px] font-semibold text-amber-600 uppercase tracking-wide">Recordatorio automático</span>
                  </div>
                  <div className="bg-amber-50/60 border border-amber-100 rounded-lg p-2.5">
                    <p className="text-[13px] text-gray-800 whitespace-pre-wrap break-words leading-relaxed">
                      {linkifyText(displayContent)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 mt-1.5">
                    <BotIcon className="h-3 w-3 text-gray-300" />
                    <span className="text-[10px] text-gray-400">Enviado automáticamente vía WhatsApp</span>
                  </div>
                </div>
              );
            }

            return (
              <div className="mb-1 px-1">
                <div className="text-[10px] bg-blue-50 text-blue-500 rounded px-1.5 py-0.5 inline-block mb-1">
                  Plantilla: {message.template_name}
                </div>
                {message.media_url && (
                  <a
                    href={message.media_url.startsWith("http") ? message.media_url : `/api/whatsapp/media?media_id=${message.media_url}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    download={message.media_filename || "documento"}
                    className="flex items-center gap-3 bg-white/50 rounded-lg p-2.5 mt-1 min-w-[200px] border border-gray-100 hover:bg-white/80 transition-colors cursor-pointer"
                  >
                    <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0">
                      <FileText className="h-5 w-5 text-blue-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-800 truncate">{message.media_filename || "Documento adjunto"}</p>
                      <p className="text-[10px] text-gray-400">PDF</p>
                    </div>
                  </a>
                )}
              </div>
            );
          })()}

          {/* Shared contacts — card style with actions */}
          {message.message_type === "contacts" && message.content && (
            <div className="mb-1 space-y-2">
              {message.content.split("\n").map((line, i) => {
                const [name, phone] = line.includes(": ") ? line.split(": ", 2) : [line, null];
                const cleanPhone = phone?.replace(/[^0-9+]/g, "") || "";
                return (
                  <div key={i} className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm">
                    <div className="flex items-center gap-3 mb-2.5">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-sm font-bold text-white shadow-sm">
                        {name.split(" ").map(w => w[0]).join("").substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="text-[14px] font-semibold text-gray-900">{name}</div>
                        {phone && <div className="text-[12px] text-gray-500">{phone}</div>}
                      </div>
                    </div>
                    {phone && (
                      <div className="flex gap-2 pt-1 border-t border-gray-100">
                        <a
                          href={`/crm?new_lead=true&name=${encodeURIComponent(name)}&phone=${encodeURIComponent(cleanPhone)}`}
                          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11px] font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors"
                        >
                          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
                          Añadir a Lead
                        </a>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Text content */}
          {message.content && message.message_type !== "contacts" && (message.message_type === "text" || message.content) && (
            <p className="text-[13.5px] text-gray-900 whitespace-pre-wrap break-words leading-[1.35]">
              {linkifyText(message.content)}
            </p>
          )}

          {/* Reaction */}
          {message.reaction_emoji && (
            <div className="absolute -bottom-3 left-2 bg-white rounded-full px-1.5 py-0.5 shadow-sm border border-gray-100 text-sm">
              {message.reaction_emoji}
            </div>
          )}

          {/* Time & status */}
          <div className="flex items-center justify-end gap-1 mt-0.5 -mb-0.5">
            <span className="text-[10px] text-gray-400">{formatTime(message.created_at)}</span>
            {isOutbound && <MessageStatusIcon status={message.status} errorMessage={message.error_message} />}
          </div>

          {/* Error message detail */}
          {message.status === "failed" && (
            <div className="mt-1 text-[10px] text-red-500 bg-red-50 rounded px-2 py-1 max-w-full">
              {message.error_message || "Error al enviar"}
              {message.error_message && (
                <span className="block text-red-400 mt-0.5">
                  {getErrorHint(message.error_message)}
                </span>
              )}
            </div>
          )}
      </div>
    </div>
  );
}

/** Traduce errores de Meta a pistas útiles para el usuario */
function getErrorHint(errorMessage: string): string {
  const lower = errorMessage.toLowerCase();
  if (lower.includes("undeliverable") || lower.includes("131026"))
    return "Posible causa: este número no tiene WhatsApp o nos ha bloqueado";
  if (lower.includes("re-engagement") || lower.includes("131047"))
    return "Han pasado más de 24h — solo se pueden enviar plantillas";
  if (lower.includes("rate") || lower.includes("limit") || lower.includes("131056"))
    return "Demasiados mensajes enviados — espera unos minutos";
  if (lower.includes("template") || lower.includes("132000"))
    return "Problema con la plantilla — revisa que esté aprobada en Meta";
  if (lower.includes("media") || lower.includes("131053"))
    return "No se pudo descargar el archivo multimedia";
  if (lower.includes("spam") || lower.includes("131031"))
    return "Meta detectó este mensaje como posible spam";
  if (lower.includes("blocked") || lower.includes("131030"))
    return "El contacto ha bloqueado este número de WhatsApp";
  if (lower.includes("capability") || lower.includes("131051"))
    return "Este tipo de mensaje no es compatible con el destinatario";
  return "";
}

function MessageStatusIcon({ status, errorMessage }: { status: string; errorMessage?: string | null }) {
  switch (status) {
    case "pending":
      return <Clock className="h-3 w-3 text-gray-400" />;
    case "sent":
      return <Check className="h-3 w-3 text-gray-400" />;
    case "delivered":
      return <CheckCheck className="h-3 w-3 text-gray-400" />;
    case "read":
      return <CheckCheck className="h-3 w-3 text-[#53BDEB]" />;
    case "failed":
      return (
        <span title={errorMessage || "Error al enviar"}>
          <AlertCircle className="h-3 w-3 text-red-500" />
        </span>
      );
    default:
      return null;
  }
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  });
}
