"use client";

// Select de "responsable actual" en la cabecera de una conversación.
//
// - Opciones: SOLO los usuarios "asignados" a la conversación (multiselect Asignar a).
// - Valor por defecto (cuando responsible_user_id está vacío en BD):
//     1) último usuario interno que respondió al cliente (lastInternalUserId),
//     2) si nadie respondió, el primero del listado de asignados.
//   Este default es de presentación — al hacer click y seleccionar persiste.
// - El cronómetro del SLA NO se reinicia al cambiar el responsable
//   (la API no toca last_client_message_at / last_internal_response_at).
//
// Persistencia: PATCH /api/comunicaciones/conversations/[id]/responsible
// con body { responsible_user_id: uuid | null }.

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, UserCog, Loader2 } from "lucide-react";
import { cn } from "../../lib/utils";
import { useToast } from "../../hooks/use-toast";

interface AgentMinimal {
  id: string;
  full_name: string | null;
  avatar_url?: string | null;
  role?: string | null;
}

interface ResponsibleSelectProps {
  conversationId: string;
  // Lista completa de agentes del tenant (ya está cargada en page.tsx)
  agents: AgentMinimal[];
  // IDs de usuarios chequeados en el multiselect "Asignar a" (assignees + assigned_to fundidos)
  assigneeIds: string[];
  // Responsable explícito guardado en BD (puede ser null si nunca se ha tocado)
  currentResponsibleId: string | null;
  // ID del último usuario interno que respondió al cliente (para el default)
  lastInternalUserId: string | null;
  // Callback para refrescar la conversación después de cambiar
  onChanged: () => void;
  // Permite ocultar/desactivar el select si la conversación está cerrada
  disabled?: boolean;
}

function initials(name: string | null): string {
  if (!name) return "??";
  return name
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .substring(0, 2)
    .toUpperCase();
}

// Etiquetas amables de rol (las que se ven en el dropdown)
const ROLE_LABEL: Record<string, string> = {
  admin_empresa: "Administrador",
  director_comercial: "Director comercial",
  comercial: "Comercial",
  direccion_operaciones: "Dirección operaciones",
  jefe_obra: "Jefe de obra",
  pms: "PMS",
  pmj: "PMJ",
  arquitecto: "Arquitecto",
  interiorista: "Interiorista",
  administracion: "Administración",
  postventa: "Postventa",
  logistica: "Logística",
  marketing: "Marketing",
  recursos_humanos: "RRHH",
  jefe_produccion: "Jefe de producción",
  operario_planta: "Operario planta",
  office: "Office",
};

function prettyRole(role: string | null | undefined): string {
  if (!role) return "";
  return ROLE_LABEL[role] || role;
}

export function ResponsibleSelect({
  conversationId,
  agents,
  assigneeIds,
  currentResponsibleId,
  lastInternalUserId,
  onChanged,
  disabled,
}: ResponsibleSelectProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  // Optimistic local state — refleja el cambio antes de que el padre recargue.
  const [optimisticId, setOptimisticId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Cerrar el popover al click fuera
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  // Resetear el optimistic cuando llega un nuevo currentResponsibleId
  // (eso significa que el padre ya tiene el dato real).
  useEffect(() => {
    setOptimisticId(null);
  }, [currentResponsibleId, conversationId]);

  // Construir el listado de opciones (solo asignados, dedup).
  const options = useMemo(() => {
    const seen = new Set<string>();
    const result: AgentMinimal[] = [];
    for (const id of assigneeIds) {
      if (seen.has(id)) continue;
      seen.add(id);
      const a = agents.find((x) => x.id === id);
      if (a) result.push(a);
    }
    return result;
  }, [agents, assigneeIds]);

  // Resolver el "responsable mostrado":
  // 1) optimistic (en curso)
  // 2) currentResponsibleId (BD)
  // 3) default: último que respondió al cliente (si está entre los asignados)
  // 4) default: primer asignado
  const displayedId =
    optimisticId
    ?? currentResponsibleId
    ?? (lastInternalUserId && assigneeIds.includes(lastInternalUserId) ? lastInternalUserId : null)
    ?? (options[0]?.id ?? null);

  const displayed = displayedId ? options.find((o) => o.id === displayedId) || agents.find((a) => a.id === displayedId) : null;

  // Si no hay asignados todavía, mostramos un estado guía.
  if (options.length === 0) {
    return (
      <div
        data-testid="responsible-select-empty"
        className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-xs"
        title="Para fijar un responsable, asigna primero usuarios desde 'Asignar a'"
      >
        <UserCog className="h-3.5 w-3.5" />
        <span>Selecciona usuarios en &quot;Asignar a&quot;</span>
      </div>
    );
  }

  async function persist(newId: string) {
    if (newId === displayedId) {
      setOpen(false);
      return;
    }
    setSaving(true);
    setOptimisticId(newId);
    try {
      const res = await fetch(`/api/comunicaciones/conversations/${conversationId}/responsible`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ responsible_user_id: newId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "No se pudo cambiar el responsable");
      }
      toast({ title: "Responsable actualizado" });
      onChanged();
    } catch (err: any) {
      setOptimisticId(null);
      toast({
        title: "Error al cambiar responsable",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        type="button"
        data-testid="responsible-select"
        title="Responsable actual de la comunicación"
        aria-label="Responsable actual de la comunicación"
        disabled={disabled || saving}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex items-center gap-1.5 px-2 py-1 rounded-full",
          "bg-violet-50 border border-violet-200 text-violet-900 text-xs",
          "hover:bg-violet-100 transition-colors",
          (disabled || saving) && "opacity-60 cursor-not-allowed",
        )}
      >
        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-violet-600 text-white text-[10px] font-semibold">
          {displayed ? initials(displayed.full_name) : "??"}
        </span>
        <span className="font-medium max-w-[180px] truncate">
          {displayed?.full_name || "Sin responsable"}
        </span>
        {saving ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <ChevronDown className="h-3 w-3 opacity-70" />
        )}
      </button>

      {open && (
        <div
          data-testid="responsible-popover"
          className="absolute left-0 top-full mt-1 z-50 w-72 bg-white rounded-xl shadow-lg border border-gray-100 py-2"
          role="listbox"
        >
          <div className="px-3 pb-1.5 border-b border-gray-100">
            <div className="text-xs font-semibold text-gray-900">Responsable actual</div>
            <div className="text-[11px] text-gray-500 mt-0.5">
              Solo aparecen los usuarios asignados a esta conversación ({options.length}).
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            {options.map((opt) => {
              const isSelected = opt.id === displayedId;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => persist(opt.id)}
                  disabled={saving}
                  className={cn(
                    "w-full px-3 py-2 flex items-center gap-2 text-left text-sm hover:bg-violet-50 transition-colors",
                    isSelected && "bg-violet-50",
                  )}
                >
                  <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-violet-600 text-white text-[10px] font-semibold shrink-0">
                    {initials(opt.full_name)}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-gray-900 truncate">{opt.full_name || "Sin nombre"}</span>
                    {opt.role && (
                      <span className="block text-[11px] text-gray-500 truncate">{prettyRole(opt.role)}</span>
                    )}
                  </span>
                  {isSelected && (
                    <span className="text-violet-700 text-sm shrink-0" aria-hidden="true">✓</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
