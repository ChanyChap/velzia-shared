"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Send, Paperclip, X, FileIcon, AlertTriangle, ListTodo } from "lucide-react";
import { Button } from "../ui/button";
import { cn } from "../../lib/utils";
import { useToast } from "../../hooks/use-toast";
import { MentionAutocomplete } from "./mention-autocomplete";
import { ChatDocumentDetectionAlert } from "./chat-document-detection-alert";
import type { ChatMessage, TeamMember, ChatAttachment, DocumentDetection } from "./types";
import { chatFetch } from "../../lib/chat-api-base";

interface ChatInputProps {
  onSend: (
    content: string,
    attachments?: ChatAttachment[],
    replyTo?: string,
    priority?: "normal" | "urgente" | "tarea"
  ) => Promise<void> | void;
  replyTo?: ChatMessage | null;
  onCancelReply: () => void;
  channelId: string;
  tenantMembers: TeamMember[];
  projectId?: string;
  // Auto-foco al montar: lo activa el panel cuando el composer pasa de oculto
  // a visible (click en "Nuevo mensaje" o en el icono Responder de un mensaje)
  // para que el usuario no tenga que dar un segundo clic dentro del textarea.
  autoFocus?: boolean;
  // Cierra el composer entero, no solo el preview de reply. Si está definido,
  // se muestra el botón "Cerrar" y se ata la tecla Esc al cierre total.
  onClose?: () => void;
}

export function ChatInput({
  onSend,
  replyTo,
  onCancelReply,
  channelId,
  tenantMembers,
  projectId,
  autoFocus,
  onClose,
}: ChatInputProps) {
  const [content, setContent] = useState("");
  const [priority, setPriority] = useState<"normal" | "urgente" | "tarea">("normal");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionPosition, setMentionPosition] = useState({ top: 0, left: 0 });
  const [detection, setDetection] = useState<DocumentDetection | null>(null);
  const [sending, setSending] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Marca si ya se hizo (o se descartó) el auto-seed de "@" en el primer
  // mount del composer con autoFocus. Sin esto, cuando el usuario responde
  // y handleSend llama a onCancelReply(), el replyTo pasa de truthy a null
  // y el useEffect se re-ejecuta sembrando "@" — bug reportado por Chany
  // 18 may 2026 ("Cuando pincho en Responder y pulso Enter, me abre el @
  // para mencionar"). Cada vez que el composer se desmonta y vuelve a
  // montarse (p.ej. click "Nuevo mensaje") el ref se reinicia a false y
  // el seed vuelve a aplicarse.
  const didInitialSeedRef = useRef(false);
  const { toast } = useToast();

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    const maxHeight = 4 * 24; // ~4 rows
    ta.style.height = `${Math.min(ta.scrollHeight, maxHeight)}px`;
  }, [content]);

  // Foco automático al montar el composer. Lo activamos vía setTimeout porque
  // si el composer aparece dentro del mismo tick que un click (p.ej. icono
  // Responder), el navegador devuelve el foco al elemento clicado y se pierde
  // el focus inicial del textarea.
  //
  // Además: si es "Nuevo mensaje" (no es respuesta a otro mensaje) y el
  // textarea está vacío, sembramos "@" y abrimos el menú de menciones para
  // obligar a dirigirse a alguien concreto. En respuestas el destinatario
  // ya es implícito por el reply_to, así que no auto-inyectamos nada.
  useEffect(() => {
    if (!autoFocus) return;
    const isFirstRun = !didInitialSeedRef.current;
    const id = window.setTimeout(() => {
      const ta = textareaRef.current;
      if (!ta) return;
      ta.focus();
      // Solo sembramos "@" en la primera ejecución del effect tras el
      // mount, y solo si el composer arrancó como "Nuevo mensaje" (sin
      // replyTo) y vacío. Reactivaciones posteriores del effect (p.ej.
      // replyTo cambia a null tras onCancelReply del envío) NO siembran.
      if (isFirstRun && !replyTo && content.length === 0) {
        setContent("@");
        setMentionQuery("");
        setMentionPosition({ top: 40, left: 0 });
        // Colocar caret tras el @ — algunos navegadores lo dejan al inicio
        // cuando el value cambia de "" a "@" en el mismo tick.
        window.requestAnimationFrame(() => {
          ta.setSelectionRange(1, 1);
        });
      }
      didInitialSeedRef.current = true;
    }, 0);
    return () => window.clearTimeout(id);
    // Solo dependemos de autoFocus + replyTo: content cambia con cada tecla
    // y no queremos re-sembrar el @ después de que el usuario empiece a
    // escribir o haya borrado la mención.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFocus, replyTo]);

  const handleSend = useCallback(async () => {
    const trimmed = content.trim();
    if (!trimmed && pendingFiles.length === 0) return;
    if (sending) return;

    // Regla obligatoria (Chany 18 may 2026): en mensajes "nuevos" (sin
    // reply_to) hay que dirigirse SIEMPRE a alguien. Si no se ha mencionado
    // a una persona o a @equipo, bloqueamos el envío y mostramos el toast
    // con el texto exacto que pidió Chany. En respuestas (replyTo) no se
    // aplica: el destinatario ya es implícito porque estás respondiendo a
    // alguien concreto.
    if (!replyTo) {
      const hasEquipoMention = /@equipo\b/i.test(trimmed);
      const hasPersonMention = tenantMembers.some((m) => {
        if (m.id === "__equipo__") return false;
        const fullName = m.full_name?.trim();
        if (!fullName) return false;
        // Coincidencia exacta del @<nombre completo>. Se usa el mismo
        // formato que inserta MentionAutocomplete (`@${full_name} `).
        return trimmed.includes(`@${fullName}`);
      });
      if (!hasEquipoMention && !hasPersonMention) {
        toast({
          title: "Tienes que mencionar a alguien",
          description:
            "Para pedir algo tienes que hacerlo a una sola persona y para notificar algo a todo el mundo debes mencionar a @equipo.",
          variant: "destructive",
          duration: 8000,
        });
        // Sembrar el "@" para abrir el menú de menciones si no estuviera
        // ya — facilita corregir sin pensar en sintaxis.
        if (!trimmed.includes("@")) {
          setContent(`${content}@`);
          setMentionQuery("");
          setMentionPosition({ top: 40, left: 0 });
          window.requestAnimationFrame(() => {
            const ta = textareaRef.current;
            if (ta) {
              ta.focus();
              const pos = ta.value.length;
              ta.setSelectionRange(pos, pos);
            }
          });
        }
        return;
      }
    }

    setSending(true);

    let attachments: ChatAttachment[] = [];

    if (pendingFiles.length > 0) {
      setUploading(true);
      try {
        const formData = new FormData();
        pendingFiles.forEach((file) => formData.append("files", file));

        const res = await chatFetch(`/api/chat/channels/${channelId}/upload`, {
          method: "POST",
          body: formData,
        });

        if (!res.ok) throw new Error("Error al subir archivos");

        const data = await res.json();
        attachments = data.attachments || [];

        if (data.detection) {
          setDetection(data.detection);
        }
      } catch {
        toast({
          title: "Error",
          description: "No se pudieron subir los archivos",
          variant: "destructive",
        });
        setUploading(false);
        return;
      }
      setUploading(false);
    }

    // Clear input immediately for instant feedback
    const savedContent = trimmed;
    const savedAttachments = attachments.length > 0 ? attachments : undefined;
    const savedReplyToId = replyTo?.id;
    const savedPriority = priority;

    setContent("");
    setPendingFiles([]);
    setPriority("normal");
    onCancelReply();
    textareaRef.current?.focus();

    try {
      await onSend(savedContent, savedAttachments, savedReplyToId, savedPriority);
    } catch {
      // Restore content on error so user can retry
      setContent(savedContent);
    } finally {
      setSending(false);
    }
  }, [content, pendingFiles, channelId, onSend, replyTo, onCancelReply, toast, sending, priority, tenantMembers]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (mentionQuery !== null) return; // Let MentionAutocomplete handle it

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    // Esc cierra el composer entero (cuando hay onClose). Si no hay onClose
    // mantenemos el comportamiento anterior (solo cancela el reply preview).
    if (e.key === "Escape") {
      e.preventDefault();
      if (onClose) {
        onClose();
      } else if (replyTo) {
        onCancelReply();
      }
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setContent(value);

    // Detect @ mention
    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = value.slice(0, cursorPos);
    const atMatch = textBeforeCursor.match(/@(\w*)$/);

    if (atMatch) {
      setMentionQuery(atMatch[1]);
      // Position above textarea
      setMentionPosition({ top: 40, left: 0 });
    } else {
      setMentionQuery(null);
    }
  };

  const handleMentionSelect = (member: TeamMember) => {
    const cursorPos = textareaRef.current?.selectionStart || 0;
    const textBeforeCursor = content.slice(0, cursorPos);
    const atIndex = textBeforeCursor.lastIndexOf("@");
    const before = content.slice(0, atIndex);
    const after = content.slice(cursorPos);
    setContent(`${before}@${member.full_name} ${after}`);
    setMentionQuery(null);
    textareaRef.current?.focus();

    // Aviso al usar @equipo: notificar a todo el equipo es ruidoso y diluye
    // la responsabilidad. Si hay que pedirle algo concreto a alguien hay que
    // mencionarle a esa persona para que sepa que la acción es suya.
    if (member.id === "__equipo__") {
      toast({
        title: "¿Vas a notificar algo a todo el equipo?",
        description:
          "Menciona a @equipo solo para avisos generales que todo el mundo deba conocer. Si vas a pedir algo concreto, menciona directamente a la persona responsable (@su-nombre) para que sepa que la acción es suya.",
        duration: 8000,
      });
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setPendingFiles((prev) => [...prev, ...files]);
    e.target.value = "";
  };

  const removeFile = (index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  };

  // Drag & drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };
  const handleDragLeave = () => setIsDragOver(false);
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    setPendingFiles((prev) => [...prev, ...files]);
  };

  return (
    <div className="border-t bg-background" data-testid="chat-composer">
      {/* Document detection alert */}
      {detection && projectId && (
        <div className="px-3 pt-2">
          <ChatDocumentDetectionAlert
            detection={detection}
            projectId={projectId}
            onDismiss={() => setDetection(null)}
          />
        </div>
      )}

      {/* Reply-to preview */}
      {replyTo && (
        <div className="flex items-center gap-2 px-4 py-2 bg-muted/50 border-b text-sm">
          <div className="flex-1 min-w-0">
            <span className="text-xs text-muted-foreground">
              Respondiendo a{" "}
              <strong>{replyTo.sender.full_name}</strong>
            </span>
            <p className="text-xs text-muted-foreground truncate">
              {replyTo.content}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={onCancelReply}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* Pending files */}
      {pendingFiles.length > 0 && (
        <div className="flex flex-wrap gap-2 px-4 py-2 border-b">
          {pendingFiles.map((file, i) => (
            <div
              key={i}
              className="flex items-center gap-1.5 text-xs bg-muted rounded-md px-2 py-1"
            >
              <FileIcon className="h-3 w-3 text-muted-foreground" />
              <span className="truncate max-w-[120px]">{file.name}</span>
              <button
                className="text-muted-foreground hover:text-foreground"
                onClick={() => removeFile(i)}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input area */}
      <div
        className={cn(
          "relative flex items-end gap-2 px-3 py-2",
          isDragOver && "bg-primary/5 ring-2 ring-primary/20 ring-inset"
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Mention autocomplete */}
        {mentionQuery !== null && (
          <MentionAutocomplete
            query={mentionQuery}
            members={tenantMembers}
            onSelect={handleMentionSelect}
            position={mentionPosition}
            onClose={() => setMentionQuery(null)}
          />
        )}

        {/* File upload button */}
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 shrink-0 self-end"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          <Paperclip className="h-4 w-4" />
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileSelect}
        />

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={content}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Escribe un mensaje... (@mencionar)"
          rows={1}
          data-testid="chat-composer-textarea"
          className={cn(
            "flex-1 resize-none bg-transparent text-sm",
            "border-0 outline-none ring-0 focus:ring-0",
            "placeholder:text-muted-foreground",
            "min-h-[36px] max-h-[96px] py-2"
          )}
          disabled={uploading}
        />

        {/* Priority: Urgente */}
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "h-8 w-8 p-0 shrink-0 self-end",
            priority === "urgente" && "bg-orange-100 hover:bg-orange-200 text-orange-600"
          )}
          onClick={() => setPriority((p) => (p === "urgente" ? "normal" : "urgente"))}
          title={priority === "urgente" ? "Quitar urgente" : "Marcar como urgente"}
        >
          <AlertTriangle
            className={cn(
              "h-4 w-4",
              priority === "urgente" ? "text-orange-600" : "text-muted-foreground"
            )}
          />
        </Button>

        {/* Priority: Tarea */}
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "h-8 w-8 p-0 shrink-0 self-end",
            priority === "tarea" && "bg-blue-100 hover:bg-blue-200 text-blue-600"
          )}
          onClick={() => setPriority((p) => (p === "tarea" ? "normal" : "tarea"))}
          title={priority === "tarea" ? "Quitar tarea" : "Enviar como tarea"}
        >
          <ListTodo
            className={cn(
              "h-4 w-4",
              priority === "tarea" ? "text-blue-600" : "text-muted-foreground"
            )}
          />
        </Button>

        {/* Send button */}
        <Button
          size="sm"
          className="h-8 w-8 p-0 shrink-0 self-end"
          onClick={handleSend}
          disabled={uploading || sending || (!content.trim() && pendingFiles.length === 0)}
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>

      {isDragOver && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 pointer-events-none rounded-md">
          <p className="text-sm text-muted-foreground font-medium">
            Suelta los archivos aqui
          </p>
        </div>
      )}

      {/* Fila de cierre: solo aparece cuando el composer puede colapsarse
          (el panel le pasa onClose). En la vista de "composer siempre visible"
          (legado, otras pantallas) no se muestra para no romper la UI previa. */}
      {onClose && (
        <div className="px-4 pb-2 text-[10px] text-muted-foreground flex items-center justify-between">
          <span>Pulsa Esc para cancelar</span>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            Cerrar
          </button>
        </div>
      )}
    </div>
  );
}
