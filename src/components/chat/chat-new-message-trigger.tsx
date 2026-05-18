"use client";

import { Plus, Reply } from "lucide-react";
import { cn } from "../../lib/utils";

interface ChatNewMessageTriggerProps {
  onClick: () => void;
}

// Trigger discreto que reemplaza al textbox cuando el composer está cerrado.
// La idea (decidida con Chany en la sesión 20260512-163220): al abrir el chat
// no se ve un textbox vacío; en su lugar un botón "Nuevo mensaje" y un hint
// que enseña al usuario que para responder hay que pulsar el icono de la
// burbuja. Así evitamos que la gente escriba un mensaje suelto cuando lo que
// quiere es responder, y mantenemos el panel más limpio visualmente.
export function ChatNewMessageTrigger({ onClick }: ChatNewMessageTriggerProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid="chat-new-message-trigger"
      className={cn(
        "w-full border-t bg-muted/30 hover:bg-muted/60 transition-colors",
        "px-4 py-3 flex flex-col items-stretch gap-1.5 cursor-pointer",
        "text-left"
      )}
    >
      <span className="flex items-center justify-center gap-2 text-primary font-semibold text-sm">
        <Plus className="h-4 w-4" />
        Nuevo mensaje
      </span>
      <span
        data-testid="chat-new-message-hint"
        className="text-[10.5px] text-muted-foreground text-center leading-snug"
      >
        Para responder a un mensaje pulsa en su icono{" "}
        <span
          aria-hidden="true"
          className="inline-flex align-[-3px] mx-0.5 w-4 h-4 items-center justify-center rounded border bg-background text-muted-foreground"
        >
          <Reply className="h-2.5 w-2.5" />
        </span>
      </span>
    </button>
  );
}
