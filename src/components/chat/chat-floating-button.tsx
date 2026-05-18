"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { MessageCircle } from "lucide-react";
import { Button } from "../ui/button";
import { cn } from "../../lib/utils";

interface ChatFloatingButtonProps {
  projectId: string;
  projectName?: string;
  onClick: () => void;
  unreadCount: number;
}

// La posición se guarda como distancia a los bordes derecho e inferior para que
// la burbuja se mantenga "pegada" a la esquina más cercana cuando el usuario
// redimensiona la ventana o gira el móvil.
type StoredPosition = { right: number; bottom: number };

const STORAGE_KEY = "chat-bubble-position";
const EDGE_PADDING = 8;
const DRAG_THRESHOLD_PX = 5;

function readStoredPosition(): StoredPosition | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredPosition>;
    if (typeof parsed?.right !== "number" || typeof parsed?.bottom !== "number") {
      return null;
    }
    return { right: parsed.right, bottom: parsed.bottom };
  } catch {
    return null;
  }
}

function clampToViewport(pos: StoredPosition, size: { w: number; h: number }): StoredPosition {
  if (typeof window === "undefined") return pos;
  const maxRight = Math.max(EDGE_PADDING, window.innerWidth - size.w - EDGE_PADDING);
  const maxBottom = Math.max(EDGE_PADDING, window.innerHeight - size.h - EDGE_PADDING);
  return {
    right: Math.min(Math.max(pos.right, EDGE_PADDING), maxRight),
    bottom: Math.min(Math.max(pos.bottom, EDGE_PADDING), maxBottom),
  };
}

export function ChatFloatingButton({
  projectId: _projectId,
  projectName,
  onClick,
  unreadCount,
}: ChatFloatingButtonProps) {
  const [pulse, setPulse] = useState(false);
  const [position, setPosition] = useState<StoredPosition | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  // Mantenemos el estado del drag en refs para no re-renderizar a cada movimiento.
  const dragStateRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    grabOffsetX: number;
    grabOffsetY: number;
    moved: boolean;
  } | null>(null);

  // Cargamos la posición persistida en cliente (evita hydration mismatch).
  useEffect(() => {
    const stored = readStoredPosition();
    if (stored) setPosition(stored);
  }, []);

  // Si cambia el tamaño de ventana, reencajamos la burbuja para que no quede fuera.
  useEffect(() => {
    if (!position) return;
    const handleResize = () => {
      const el = buttonRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setPosition((prev) => (prev ? clampToViewport(prev, { w: rect.width, h: rect.height }) : prev));
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [position]);

  // Pulse animation on new messages
  useEffect(() => {
    if (unreadCount > 0) {
      setPulse(true);
      const timer = setTimeout(() => setPulse(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [unreadCount]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    // Solo arrastramos con botón principal o touch/pen; ignoramos click derecho.
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const el = buttonRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    dragStateRef.current = {
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      grabOffsetX: e.clientX - rect.left,
      grabOffsetY: e.clientY - rect.top,
      moved: false,
    };
    el.setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const dx = e.clientX - drag.startClientX;
    const dy = e.clientY - drag.startClientY;
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;

    if (!drag.moved) {
      drag.moved = true;
      setIsDragging(true);
    }

    const el = buttonRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const newLeft = e.clientX - drag.grabOffsetX;
    const newTop = e.clientY - drag.grabOffsetY;
    const next = clampToViewport(
      {
        right: window.innerWidth - newLeft - rect.width,
        bottom: window.innerHeight - newTop - rect.height,
      },
      { w: rect.width, h: rect.height }
    );
    setPosition(next);
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const moved = drag.moved;
    dragStateRef.current = null;
    const el = buttonRef.current;
    if (el?.hasPointerCapture(e.pointerId)) {
      el.releasePointerCapture(e.pointerId);
    }
    if (moved) {
      setIsDragging(false);
      // Persistimos la posición final; usamos el estado actual leído del DOM
      // por si el último move quedó por debajo del threshold.
      setPosition((prev) => {
        if (!prev) return prev;
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prev));
        } catch {
          // Si el almacenamiento está lleno o bloqueado, ignoramos; la posición
          // se mantendrá en memoria durante la sesión.
        }
        return prev;
      });
    }
  }, []);

  const handleClick = useCallback(() => {
    // Si el último gesto fue un drag, no abrimos el chat.
    if (dragStateRef.current?.moved) return;
    if (isDragging) return;
    onClick();
  }, [isDragging, onClick]);

  const tooltip = projectName
    ? `Chat del proyecto: ${projectName} · arrastra para mover`
    : "Chat del proyecto · arrastra para mover";

  // Si hay posición guardada, usamos style inline; si no, las clases por defecto
  // dejan la burbuja en la esquina inferior derecha como siempre.
  const useCustomPosition = position !== null;
  const inlineStyle = useCustomPosition
    ? { right: `${position!.right}px`, bottom: `${position!.bottom}px`, left: "auto", top: "auto" }
    : undefined;

  return (
    <Button
      ref={buttonRef}
      size="lg"
      title={tooltip}
      aria-label={tooltip}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={inlineStyle}
      className={cn(
        // Base: fixed, shadow, pulse on new messages
        "fixed z-50 shadow-lg transition-transform",
        // Posición por defecto cuando no hay valor guardado.
        !useCustomPosition && "bottom-6 right-6",
        // Mobile: circle with icon only
        "h-14 w-14 rounded-full p-0",
        // Desktop (sm+): pill with icon + label so users understand what this button is
        "sm:h-12 sm:w-auto sm:rounded-full sm:px-5 sm:gap-2",
        // touch-none evita que el navegador móvil interprete el drag como scroll.
        "touch-none select-none",
        isDragging ? "cursor-grabbing opacity-90 scale-105" : "cursor-grab hover:scale-105",
        pulse && !isDragging && "animate-pulse"
      )}
      onClick={handleClick}
    >
      <MessageCircle className="h-6 w-6 sm:h-5 sm:w-5 shrink-0 pointer-events-none" />
      <span className="hidden sm:inline text-sm font-medium pointer-events-none">
        Chat del proyecto
      </span>

      {/* Unread badge */}
      {unreadCount > 0 && (
        <span
          className={cn(
            "absolute -top-1 -right-1 flex items-center justify-center",
            "min-w-[20px] h-5 px-1 rounded-full",
            "bg-destructive text-destructive-foreground text-xs font-bold",
            "border-2 border-background pointer-events-none"
          )}
        >
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}
    </Button>
  );
}
