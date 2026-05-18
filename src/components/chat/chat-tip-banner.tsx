"use client";

import { useEffect, useState } from "react";
import { Lightbulb, X } from "lucide-react";
import { Button } from "../ui/button";

const STORAGE_KEY = "chat-tip-mencion-individual-dismissed-at";
// El tip se vuelve a mostrar pasados 15 días desde el último dismiss para que
// no se olvide la regla aunque el usuario lo haya cerrado en su día.
const RESHOW_AFTER_MS = 15 * 24 * 60 * 60 * 1000;

// Banner informativo dentro del chat del proyecto.
// Recuerda al usuario que pedir a una sola persona aumenta la tasa de respuesta.
// Se oculta al pulsar la X; reaparece automáticamente cada 15 días.
export function ChatTipBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      setVisible(true);
      return;
    }
    const dismissedAt = Number(raw);
    if (!Number.isFinite(dismissedAt)) {
      // Valor corrupto (incluye el "1" del esquema antiguo): tratamos como
      // recién dismissado para no bombardear al usuario, pero refrescamos a ms.
      window.localStorage.setItem(STORAGE_KEY, String(Date.now()));
      setVisible(false);
      return;
    }
    const elapsed = Date.now() - dismissedAt;
    setVisible(elapsed >= RESHOW_AFTER_MS);
  }, []);

  if (!visible) return null;

  const handleDismiss = () => {
    setVisible(false);
    try {
      window.localStorage.setItem(STORAGE_KEY, String(Date.now()));
    } catch {
      // localStorage puede fallar en modo privado: no bloquea al usuario.
    }
  };

  return (
    <div
      role="note"
      aria-label="Consejo sobre menciones en el chat"
      className="mx-3 mt-3 mb-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 shadow-sm"
    >
      <div className="flex items-start gap-2.5">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
          <Lightbulb className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">
            Consejo para que te respondan
          </p>
          <p className="text-sm font-semibold leading-snug text-amber-900">
            Cuando necesites algo, pídelo a una sola persona.
          </p>
          <p className="text-xs leading-snug text-amber-900/90">
            Evita pedir algo a más de una persona o a{" "}
            <span className="font-mono font-semibold">@equipo</span>. Cuando se lo
            pides a varias personas, hay un{" "}
            <span className="font-semibold">79 % menos de posibilidades</span> de
            que te respondan.
          </p>
          <p className="text-xs leading-snug text-amber-900/80">
            Menciona a más de una persona solo para{" "}
            <span className="font-semibold">notificar</span>, no para pedir.
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleDismiss}
          aria-label="Ocultar consejo"
          title="Ocultar consejo"
          className="h-6 w-6 shrink-0 p-0 text-amber-700 hover:bg-amber-100 hover:text-amber-900"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
