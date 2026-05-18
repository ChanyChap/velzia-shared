"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { Loader2, Search, ChevronRight, Inbox, AlertTriangle, ListTodo, Check, MessageSquare } from "lucide-react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { ProjectChatPanel } from "./project-chat-panel";
import { cn } from "../../lib/utils";
import { createClient } from "../../lib/supabase-client";
import { useChatUnreadDigest } from "../../hooks/use-chat-unread-count";

interface TeamSummary {
  id: string;
  name: string;
  description?: string | null;
  color?: string | null;
  channel_id: string | null;
  last_message_at?: string | null;
  last_message_preview?: string | null;
}

interface ProyectoSummary {
  id: string;
  name: string;
  client_name?: string | null;
}

type TabKey = "unread" | "outbound" | "proyecto" | "equipo" | "whatsapp";

interface ChatTabsProps {
  defaultTab?: TabKey;
  activeProjectId?: string | null;
  activeProjectName?: string | null;
  // Si la modal está embebida en un drawer (desktop), el wrapper la cierra.
  // Si es una página fullscreen (mobile), onClose puede ser undefined.
  onClose?: () => void;
}

// Componente compartido entre rt.sig (drawer flotante desde la burbuja del
// header) y VelziaOnSite (página fullscreen). Sincroniza la pestaña activa,
// el proyecto seleccionado y el equipo seleccionado con la URL (?tab=...,
// ?project_id=..., ?team_id=...) para que el back del navegador funcione
// y los enlaces compartidos abran exactamente la misma vista.
export function ChatTabs({
  defaultTab = "proyecto",
  activeProjectId,
  activeProjectName,
  onClose,
}: ChatTabsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const { mentionsCount, outboundCount, whatsappCount, slaBreached } =
    useChatUnreadDigest();

  const rawTab = search.get("tab");
  const tab: TabKey =
    rawTab === "unread" ||
    rawTab === "outbound" ||
    rawTab === "equipo" ||
    rawTab === "proyecto" ||
    rawTab === "whatsapp"
      ? rawTab
      : defaultTab;
  const projectIdFromUrl = search.get("project_id");
  const teamIdFromUrl = search.get("team_id");

  const selectedProjectId = projectIdFromUrl || activeProjectId || null;

  const setQueryParam = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(search.toString());
      if (value) params.set(key, value);
      else params.delete(key);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, search]
  );

  const switchTab = useCallback(
    (next: TabKey) => {
      const params = new URLSearchParams(search.toString());
      params.set("tab", next);
      if (next === "proyecto") params.delete("team_id");
      if (next === "equipo") params.delete("project_id");
      if (next === "unread" || next === "outbound" || next === "whatsapp") {
        params.delete("project_id");
        params.delete("team_id");
      }
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, search]
  );

  return (
    <div className="flex flex-col h-full bg-background">
      <header className="sticky top-0 z-20 bg-background border-b px-3 pt-3 pb-2">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-base font-semibold">Chat</h1>
        </div>
        <div className="grid grid-cols-5 gap-1 bg-muted rounded-lg p-1">
          <TabButton
            label="Sin responder por mí"
            active={tab === "unread"}
            onClick={() => switchTab("unread")}
            badge={mentionsCount}
            badgeColor={slaBreached ? "red-pulse" : "red"}
          />
          <TabButton
            label="Sin responderme"
            active={tab === "outbound"}
            onClick={() => switchTab("outbound")}
            badge={outboundCount}
            badgeColor="orange"
          />
          <TabButton
            label="Proyecto"
            active={tab === "proyecto"}
            onClick={() => switchTab("proyecto")}
          />
          <TabButton
            label="Mis equipos"
            active={tab === "equipo"}
            onClick={() => switchTab("equipo")}
          />
          <TabButton
            label="WhatsApp clientes"
            active={tab === "whatsapp"}
            onClick={() => switchTab("whatsapp")}
            badge={whatsappCount}
            badgeColor="green"
          />
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === "unread" && <UnreadTab />}
        {tab === "outbound" && <OutboundTab />}
        {tab === "proyecto" && (
          <ProjectTab
            selectedProjectId={selectedProjectId}
            urlProjectId={projectIdFromUrl}
            activeProjectName={activeProjectName ?? undefined}
            onChooseProject={(id) => setQueryParam("project_id", id)}
          />
        )}
        {tab === "equipo" && (
          <TeamsTab
            selectedTeamId={teamIdFromUrl}
            onChooseTeam={(id) => setQueryParam("team_id", id)}
          />
        )}
        {tab === "whatsapp" && <WhatsappTab onClose={onClose} />}
      </div>
    </div>
  );
}

function TabButton({
  label,
  active,
  onClick,
  badge,
  badgeColor = "red",
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  badge?: number;
  badgeColor?: "red" | "red-pulse" | "orange" | "green";
}) {
  const showBadge = typeof badge === "number" && badge > 0;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative min-h-[42px] py-1 px-1.5 rounded-md text-[11px] font-medium leading-tight transition-colors flex items-center justify-center text-center break-words",
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      <span className="line-clamp-2">{label}</span>
      {showBadge && (
        <span
          className={cn(
            "absolute -top-1 -right-1 inline-grid place-items-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold leading-none text-white shadow-sm",
            badgeColor === "red" && "bg-red-500",
            badgeColor === "red-pulse" &&
              "bg-red-500 animate-pulse ring-2 ring-red-300",
            badgeColor === "orange" && "bg-orange-500",
            badgeColor === "green" && "bg-green-500"
          )}
        >
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </button>
  );
}

// --- Tab "Sin responder por mí" ----------------------------------------
// Lista las menciones pendientes (responded_at IS NULL) del usuario actual.
// Una mención solo se marca como "respondida" cuando el usuario envía un
// reply explícito (reply_to_id) al mensaje que la contenía. Enviar un
// mensaje cualquiera al canal NO la cierra (antes sí, y vaciaba la bandeja
// aunque no se hubiese contestado nada).
//
// Usa el endpoint /api/chat/unread-messages — mismo contrato que Flor en
// VelziaOnSite para que ambas apps puedan compartir la UI sin divergir.
//
// Click en un item navega al canal (project_id o team_id), cambia la tab
// y deja un hash #msg-<id> para que la lista se ancle al mensaje exacto.

interface UnreadMessageItem {
  mention_id: string;
  id: string;
  channel_id: string;
  channel_type: "project" | "team";
  project_id: string | null;
  project_name: string | null;
  team_id: string | null;
  team_name: string | null;
  sender_id: string;
  sender_name: string;
  sender_avatar: string | null;
  preview: string;
  has_attachments: boolean;
  priority: string;
  created_at: string;
  sla_breached: boolean;
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "ahora";
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `hace ${d} d`;
  return new Date(iso).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
  });
}

function UnreadTab() {
  const [items, setItems] = useState<UnreadMessageItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  useEffect(() => {
    let cancelled = false;
    fetch("/api/chat/unread-messages")
      .then((r) => (r.ok ? r.json() : { messages: [] }))
      .then((d) => {
        if (!cancelled) setItems(d.messages || []);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Marca una mención como respondida desde la propia bandeja, sin abrir el
  // chat. Útil cuando el usuario ya respondió por otro canal (llamada, in
  // person) y solo quiere limpiar la fila.
  const markAsResponded = useCallback(
    async (mentionId: string, e: ReactMouseEvent) => {
      e.stopPropagation();
      if (marking) return;
      setMarking(mentionId);
      try {
        const res = await fetch(`/api/chat/mentions/${mentionId}/mark-responded`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reopen: false }),
        });
        if (res.ok) {
          setItems((prev) =>
            prev ? prev.filter((it) => it.mention_id !== mentionId) : prev
          );
        }
      } finally {
        setMarking(null);
      }
    },
    [marking]
  );

  const openMention = useCallback(
    (m: UnreadMessageItem) => {
      const params = new URLSearchParams(search.toString());
      if (m.channel_type === "project" && m.project_id) {
        params.set("tab", "proyecto");
        params.set("project_id", m.project_id);
        params.delete("team_id");
      } else if (m.channel_type === "team" && m.team_id) {
        params.set("tab", "equipo");
        params.set("team_id", m.team_id);
        params.delete("project_id");
      }
      router.replace(`${pathname}?${params.toString()}#msg-${m.id}`, {
        scroll: false,
      });
    },
    [router, pathname, search]
  );

  if (loading) {
    return (
      <div className="h-full grid place-items-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!items || items.length === 0) {
    return (
      <div className="h-full grid place-items-center p-8 text-center">
        <div className="max-w-sm">
          <div className="w-12 h-12 rounded-full bg-muted mx-auto mb-3 grid place-items-center">
            <Inbox className="h-5 w-5 text-muted-foreground" />
          </div>
          <h2 className="text-base font-semibold mb-1">
            No tienes mensajes sin responder
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Aquí aparecen los mensajes en los que te han mencionado (con @tu
            nombre o @equipo) y aún no has contestado con un reply. ¡Estás al
            día!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-3">
      <ul className="space-y-2">
        {items.map((m) => {
          const channelLabel = m.channel_type === "team" ? "Equipo" : "Proyecto";
          const contextName = m.channel_type === "team"
            ? (m.team_name || "Equipo")
            : (m.project_name || "Proyecto");
          return (
            <li key={m.mention_id}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => openMention(m)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openMention(m);
                  }
                }}
                className={cn(
                  "w-full text-left rounded-xl border bg-card p-3 hover:bg-accent transition-colors cursor-pointer",
                  m.priority === "urgente" && "border-l-[3px] border-l-orange-400",
                  m.priority === "tarea" && "border-l-[3px] border-l-blue-400",
                  // SLA superado: borde rojo + fondo rojo claro para alertar.
                  m.sla_breached && "border-red-300 bg-red-50/40"
                )}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">
                      {channelLabel}
                    </span>
                    <span className="text-xs font-medium truncate">
                      {contextName}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {m.priority === "urgente" && (
                      <AlertTriangle className="h-3 w-3 text-orange-500" />
                    )}
                    {m.priority === "tarea" && (
                      <ListTodo className="h-3 w-3 text-blue-500" />
                    )}
                    {m.sla_breached && (
                      <span className="text-[9px] uppercase font-bold text-red-600 bg-red-100 rounded px-1 py-0.5 leading-none">
                        SLA
                      </span>
                    )}
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      {formatRelativeTime(m.created_at)}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mb-1">
                  <strong className="font-medium text-foreground">
                    {m.sender_name}
                  </strong>{" "}
                  te mencionó:
                </p>
                <p className="text-sm line-clamp-2 mb-2">
                  {m.preview || (m.has_attachments ? "[adjuntos]" : "")}
                </p>
                <div className="flex items-center justify-end">
                  <button
                    type="button"
                    onClick={(e) => markAsResponded(m.mention_id, e)}
                    disabled={marking === m.mention_id}
                    title="Marcar como respondida (sin abrir el chat). Útil si ya contestaste por otro canal."
                    className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground border rounded-md px-2 py-1 hover:bg-background transition-colors disabled:opacity-50"
                  >
                    {marking === m.mention_id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Check className="h-3 w-3" />
                    )}
                    Marcar como respondida
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// --- Tab "Sin responderme" (outbound) ----------------------------------
// Perspectiva inversa: lista los mensajes que YO envié mencionando a alguien
// y que esa persona aún no me ha respondido. Usa /api/chat/outbound-unread-messages.
// Click navega al canal correspondiente. No tiene botón "Marcar como
// respondida" porque depende del destinatario, no de mí.

interface OutboundUnreadItem {
  mention_id: string;
  id: string;
  channel_id: string;
  channel_type: "project" | "team";
  project_id: string | null;
  project_name: string | null;
  team_id: string | null;
  team_name: string | null;
  recipient_id: string;
  recipient_name: string;
  recipient_avatar: string | null;
  preview: string;
  has_attachments: boolean;
  priority: string;
  created_at: string;
  sla_breached: boolean;
}

function OutboundTab() {
  const [items, setItems] = useState<OutboundUnreadItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  useEffect(() => {
    let cancelled = false;
    fetch("/api/chat/outbound-unread-messages")
      .then((r) => (r.ok ? r.json() : { messages: [] }))
      .then((d) => {
        if (!cancelled) setItems(d.messages || []);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const openItem = useCallback(
    (m: OutboundUnreadItem) => {
      const params = new URLSearchParams(search.toString());
      if (m.channel_type === "project" && m.project_id) {
        params.set("tab", "proyecto");
        params.set("project_id", m.project_id);
        params.delete("team_id");
      } else if (m.channel_type === "team" && m.team_id) {
        params.set("tab", "equipo");
        params.set("team_id", m.team_id);
        params.delete("project_id");
      }
      router.replace(`${pathname}?${params.toString()}#msg-${m.id}`, {
        scroll: false,
      });
    },
    [router, pathname, search]
  );

  if (loading) {
    return (
      <div className="h-full grid place-items-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!items || items.length === 0) {
    return (
      <div className="h-full grid place-items-center p-8 text-center">
        <div className="max-w-sm">
          <div className="w-12 h-12 rounded-full bg-muted mx-auto mb-3 grid place-items-center">
            <Inbox className="h-5 w-5 text-muted-foreground" />
          </div>
          <h2 className="text-base font-semibold mb-1">
            Nadie te debe respuesta
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Aquí aparecen los mensajes en los que mencionaste a alguien
            (@nombre o @equipo) y aún no te ha respondido con un reply.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-3">
      <ul className="space-y-2">
        {items.map((m) => {
          const channelLabel = m.channel_type === "team" ? "Equipo" : "Proyecto";
          const contextName = m.channel_type === "team"
            ? (m.team_name || "Equipo")
            : (m.project_name || "Proyecto");
          return (
            <li key={m.mention_id}>
              <button
                type="button"
                onClick={() => openItem(m)}
                className={cn(
                  "w-full text-left rounded-xl border bg-card p-3 hover:bg-accent transition-colors",
                  m.priority === "urgente" && "border-l-[3px] border-l-orange-400",
                  m.priority === "tarea" && "border-l-[3px] border-l-blue-400",
                  m.sla_breached && "border-red-300 bg-red-50/40"
                )}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">
                      {channelLabel}
                    </span>
                    <span className="text-xs font-medium truncate">
                      {contextName}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {m.priority === "urgente" && (
                      <AlertTriangle className="h-3 w-3 text-orange-500" />
                    )}
                    {m.priority === "tarea" && (
                      <ListTodo className="h-3 w-3 text-blue-500" />
                    )}
                    {m.sla_breached && (
                      <span className="text-[9px] uppercase font-bold text-red-600 bg-red-100 rounded px-1 py-0.5 leading-none">
                        SLA
                      </span>
                    )}
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      {formatRelativeTime(m.created_at)}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mb-1">
                  Esperas respuesta de{" "}
                  <strong className="font-medium text-foreground">
                    {m.recipient_name}
                  </strong>
                  :
                </p>
                <p className="text-sm line-clamp-2">
                  {m.preview || (m.has_attachments ? "[adjuntos]" : "")}
                </p>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// --- Tab "Proyecto" -----------------------------------------------------

function ProjectTab({
  selectedProjectId,
  urlProjectId,
  activeProjectName,
  onChooseProject,
}: {
  selectedProjectId: string | null;
  urlProjectId: string | null;
  activeProjectName?: string;
  onChooseProject: (id: string | null) => void;
}) {
  const [projectName, setProjectName] = useState<string | undefined>(
    urlProjectId ? undefined : activeProjectName
  );

  if (!selectedProjectId) {
    return (
      <ProjectSelector
        onPick={(p) => {
          setProjectName(p.name);
          onChooseProject(p.id);
        }}
      />
    );
  }

  return (
    <div className="h-full flex flex-col">
      {urlProjectId && urlProjectId !== selectedProjectId && (
        <div className="bg-orange-50 border-b border-orange-200 px-3 py-2 text-xs text-orange-900 flex items-center justify-between gap-2">
          <span className="truncate">
            Estás viendo el chat de{" "}
            <strong>{projectName || "otro proyecto"}</strong>
          </span>
          <button
            onClick={() => onChooseProject(null)}
            className="text-orange-700 font-semibold hover:underline shrink-0"
          >
            Cambiar
          </button>
        </div>
      )}
      <div className="flex-1 min-h-0">
        <ProjectChatPanel
          key={`proj-${selectedProjectId}`}
          scope="project"
          projectId={selectedProjectId}
          projectName={projectName}
        />
      </div>
    </div>
  );
}

// Suma menciones pendientes por proyecto / equipo: agrupa las filas de
// /api/chat/unread-messages (mismas que alimentan "Sin responder por mí")
// por project_id o team_id. Lo usan ProjectSelector y TeamsTab para
// pintar el badge al lado de cada proyecto/equipo y poder ordenar los
// que tienen mensajes pendientes arriba.
async function fetchUnreadByContext(): Promise<{
  byProject: Map<string, number>;
  byTeam: Map<string, number>;
}> {
  const byProject = new Map<string, number>();
  const byTeam = new Map<string, number>();
  try {
    const res = await fetch("/api/chat/unread-messages", { cache: "no-store" });
    if (!res.ok) return { byProject, byTeam };
    const data = await res.json();
    const messages: Array<{
      project_id: string | null;
      team_id: string | null;
      channel_type: "project" | "team";
    }> = data?.messages || [];
    for (const m of messages) {
      if (m.channel_type === "project" && m.project_id) {
        byProject.set(m.project_id, (byProject.get(m.project_id) || 0) + 1);
      } else if (m.channel_type === "team" && m.team_id) {
        byTeam.set(m.team_id, (byTeam.get(m.team_id) || 0) + 1);
      }
    }
  } catch {
    // silencioso: si falla, el selector funciona igual sin badges
  }
  return { byProject, byTeam };
}

function ProjectSelector({
  onPick,
}: {
  onPick: (p: ProyectoSummary) => void;
}) {
  const [proyectos, setProyectos] = useState<ProyectoSummary[]>([]);
  const [unreadByProject, setUnreadByProject] = useState<Map<string, number>>(
    new Map()
  );
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/proyectos/list")
        .then((r) => (r.ok ? r.json() : { proyectos: [] }))
        .catch(() => ({ proyectos: [] })),
      fetchUnreadByContext(),
    ])
      .then(([proyectosData, unread]) => {
        if (cancelled) return;
        setProyectos(proyectosData.proyectos || []);
        setUnreadByProject(unread.byProject);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const base = term
      ? proyectos.filter(
          (p) =>
            p.name.toLowerCase().includes(term) ||
            (p.client_name || "").toLowerCase().includes(term)
        )
      : proyectos;
    // Proyectos con menciones pendientes arriba, luego por nombre. No mezclo
    // el orden original (que viene del API) cuando ambos tienen 0 menciones
    // para no romper expectativas de listado.
    return [...base].sort((a, b) => {
      const ua = unreadByProject.get(a.id) || 0;
      const ub = unreadByProject.get(b.id) || 0;
      if (ua === ub) return 0;
      return ub - ua;
    });
  }, [proyectos, q, unreadByProject]);

  return (
    <div className="h-full flex flex-col p-3 gap-3">
      <div>
        <h2 className="text-base font-semibold mb-1">
          Elige un proyecto para abrir su chat
        </h2>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Puedes escribir y responder en cualquier proyecto en el que seas
          miembro.
        </p>
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar proyecto o cliente…"
          className="w-full h-10 pl-9 pr-3 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto -mx-3 px-3">
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            {q ? `No hay proyectos que coincidan con «${q}».` : "No tienes proyectos asignados."}
          </p>
        ) : (
          <ul className="divide-y border rounded-xl bg-card">
            {filtered.map((p) => {
              const unread = unreadByProject.get(p.id) || 0;
              return (
                <li key={p.id}>
                  <button
                    onClick={() => onPick(p)}
                    className="w-full text-left flex items-center gap-3 px-3 py-3 hover:bg-accent transition-colors"
                  >
                    <div className="w-9 h-9 rounded-xl bg-orange-100 text-orange-700 grid place-items-center font-bold text-xs shrink-0">
                      {(p.name[0] || "?").toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{p.name}</p>
                      {p.client_name && (
                        <p className="text-[11px] text-muted-foreground truncate">
                          {p.client_name}
                        </p>
                      )}
                    </div>
                    {unread > 0 && (
                      <span
                        className="shrink-0 inline-grid place-items-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-bold leading-none text-white bg-red-500"
                        title={`${unread} mensaje${unread === 1 ? "" : "s"} sin responder`}
                      >
                        {unread > 99 ? "99+" : unread}
                      </span>
                    )}
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

// --- Tab "Mis equipos" --------------------------------------------------

function TeamsTab({
  selectedTeamId,
  onChooseTeam,
}: {
  selectedTeamId: string | null;
  onChooseTeam: (id: string | null) => void;
}) {
  const [teams, setTeams] = useState<TeamSummary[]>([]);
  const [unreadByTeam, setUnreadByTeam] = useState<Map<string, number>>(
    new Map()
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/chat/teams")
        .then((r) => (r.ok ? r.json() : { teams: [] }))
        .catch(() => ({ teams: [] })),
      fetchUnreadByContext(),
    ])
      .then(([teamsData, unread]) => {
        if (cancelled) return;
        const list: TeamSummary[] = teamsData.teams || [];
        setTeams(list);
        setUnreadByTeam(unread.byTeam);
        // Auto-entrada si pertenece a EXACTAMENTE un equipo
        if (!selectedTeamId && list.length === 1) {
          onChooseTeam(list[0].id);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // onChooseTeam es estable por router replace; no lo metemos para no
    // re-disparar fetches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div className="h-full grid place-items-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (teams.length === 0) {
    return (
      <div className="h-full grid place-items-center p-8 text-center">
        <div className="max-w-sm">
          <div className="w-12 h-12 rounded-full bg-muted mx-auto mb-3 grid place-items-center text-2xl">
            👥
          </div>
          <h2 className="text-base font-semibold mb-1">
            No perteneces a ningún equipo
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Pídele a un administrador que te añada a un equipo desde la
            sección de RRHH.
          </p>
        </div>
      </div>
    );
  }

  // effectiveTeamId: cuando el usuario pertenece a UN solo equipo, usamos
  // ese team directamente sin esperar a que la URL propague el ?team_id=.
  // Sin esto, entre setTeams([single]) y la propagación de router.replace,
  // React renderiza brevemente el selector con 1 opción → "el equipo aparece
  // y desaparece" (bug reportado por Chany 2026-05-14).
  const effectiveTeamId = selectedTeamId || (teams.length === 1 ? teams[0].id : null);

  if (effectiveTeamId) {
    const team = teams.find((t) => t.id === effectiveTeamId);
    if (!team) {
      return (
        <div className="h-full grid place-items-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      );
    }
    return (
      <div className="h-full flex flex-col">
        {teams.length > 1 && (
          <div className="bg-orange-50 border-b border-orange-200 px-3 py-2 text-xs text-orange-900 flex items-center justify-between gap-2">
            <span className="truncate">
              Equipo activo: <strong>{team.name}</strong>
            </span>
            <button
              onClick={() => onChooseTeam(null)}
              className="text-orange-700 font-semibold hover:underline shrink-0"
            >
              Cambiar
            </button>
          </div>
        )}
        <div className="flex-1 min-h-0">
          <ProjectChatPanel
            key={`team-${effectiveTeamId}`}
            scope="team"
            teamId={effectiveTeamId}
            projectName={team.name}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-3 gap-3">
      <div>
        <h2 className="text-base font-semibold mb-1">¿A qué equipo escribes?</h2>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Perteneces a varios equipos. Elige uno para abrir su chat.
        </p>
      </div>
      <div className="grid gap-2 overflow-y-auto">
        {[...teams]
          .sort((a, b) => {
            const ua = unreadByTeam.get(a.id) || 0;
            const ub = unreadByTeam.get(b.id) || 0;
            if (ua === ub) return 0;
            return ub - ua;
          })
          .map((t) => {
            const unread = unreadByTeam.get(t.id) || 0;
            return (
              <button
                key={t.id}
                onClick={() => onChooseTeam(t.id)}
                className="w-full text-left flex items-center gap-3 px-3 py-3 rounded-xl border bg-card hover:bg-accent transition-colors"
              >
                <div
                  className="w-10 h-10 rounded-xl grid place-items-center font-bold text-sm shrink-0 text-white"
                  style={{ background: t.color || "#0ea5e9" }}
                >
                  {(t.name[0] || "?").toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{t.name}</p>
                  {t.description && (
                    <p className="text-[11px] text-muted-foreground truncate">
                      {t.description}
                    </p>
                  )}
                </div>
                {unread > 0 && (
                  <span
                    className="shrink-0 inline-grid place-items-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-bold leading-none text-white bg-red-500"
                    title={`${unread} mensaje${unread === 1 ? "" : "s"} sin responder`}
                  >
                    {unread > 99 ? "99+" : unread}
                  </span>
                )}
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </button>
            );
          })}
      </div>
    </div>
  );
}

// --- Tab "WhatsApp clientes" -------------------------------------------
// Lista conversaciones de WhatsApp asignadas al usuario (assigned_to=me)
// donde el cliente ha escrito y aún no he respondido (unread_count > 0 o
// last_message_direction='inbound'). Click → /comunicaciones?conversation=X
// (deep-link existente en comunicaciones/page.tsx que ya selecciona la
// conversación al cargar). Optimistic: al click pone unread_count=0 en BD.

interface WaUnreadItem {
  id: string;
  contact_name: string;
  contact_phone: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_message_direction: string | null;
  unread_count: number;
}

function WhatsappTab({ onClose }: { onClose?: () => void }) {
  const router = useRouter();
  const [items, setItems] = useState<WaUnreadItem[] | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchItems = useCallback(async () => {
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) {
      setItems([]);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("wa_conversations")
      .select(`
        id,
        last_message_at,
        last_message_preview,
        last_message_direction,
        unread_count,
        wa_contacts!inner ( name, phone )
      `)
      .eq("assigned_to", userId)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(30);

    if (error || !data) {
      setItems([]);
      setLoading(false);
      return;
    }

    const mapped: WaUnreadItem[] = data.map((conv: Record<string, unknown>) => {
      const contact = conv.wa_contacts as Record<string, unknown> | null;
      return {
        id: conv.id as string,
        contact_name:
          (contact?.name as string) ||
          (contact?.phone as string) ||
          "Contacto sin nombre",
        contact_phone: (contact?.phone as string) || "",
        last_message_at: conv.last_message_at as string | null,
        last_message_preview: conv.last_message_preview as string | null,
        last_message_direction: conv.last_message_direction as string | null,
        unread_count: (conv.unread_count as number) || 0,
      };
    });

    const pending = mapped.filter(
      (it) => it.unread_count > 0 || it.last_message_direction === "inbound"
    );
    pending.sort((a, b) => {
      if (a.unread_count > 0 && b.unread_count === 0) return -1;
      if (a.unread_count === 0 && b.unread_count > 0) return 1;
      if (!a.last_message_at) return 1;
      if (!b.last_message_at) return -1;
      return (
        new Date(b.last_message_at).getTime() -
        new Date(a.last_message_at).getTime()
      );
    });

    setItems(pending);
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchItems().catch(() => {
      if (!cancelled) {
        setItems([]);
        setLoading(false);
      }
    });
    const supabase = createClient();
    const channel = supabase
      .channel(`wa-tab-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "wa_conversations" },
        () => {
          if (!cancelled) fetchItems();
        }
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [fetchItems]);

  const openConversation = useCallback(
    async (item: WaUnreadItem) => {
      if (item.unread_count > 0) {
        setItems((prev) =>
          prev
            ? prev.map((it) =>
                it.id === item.id ? { ...it, unread_count: 0 } : it
              )
            : prev
        );
        const supabase = createClient();
        supabase
          .from("wa_conversations")
          .update({ unread_count: 0 })
          .eq("id", item.id)
          .then(() => {});
      }
      onClose?.();
      router.push(`/comunicaciones?conversation=${item.id}`);
    },
    [router, onClose]
  );

  if (loading) {
    return (
      <div className="h-full grid place-items-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!items || items.length === 0) {
    return (
      <div className="h-full grid place-items-center p-8 text-center">
        <div className="max-w-sm">
          <div className="w-12 h-12 rounded-full bg-muted mx-auto mb-3 grid place-items-center">
            <MessageSquare className="h-5 w-5 text-muted-foreground" />
          </div>
          <h2 className="text-base font-semibold mb-1">
            No tienes conversaciones de WhatsApp pendientes
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Aquí aparecen las conversaciones de WhatsApp con clientes que
            tienes asignadas y en las que el cliente está esperando tu
            respuesta. Para ver todas tus conversaciones (incluso las
            respondidas) ve a la sección de Comunicaciones.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-3">
      <ul className="space-y-2">
        {items.map((m) => (
          <li key={m.id}>
            <button
              type="button"
              onClick={() => openConversation(m)}
              className={cn(
                "w-full text-left rounded-xl border bg-card p-3 hover:bg-accent transition-colors",
                m.unread_count > 0 && "border-l-[3px] border-l-green-500"
              )}
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">
                    WhatsApp
                  </span>
                  <span className="text-xs font-medium truncate">
                    {m.contact_name}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {m.unread_count > 0 && (
                    <span className="text-[10px] font-bold bg-green-500 text-white rounded-full px-1.5 py-0.5 leading-none min-w-[18px] text-center">
                      {m.unread_count > 99 ? "99+" : m.unread_count}
                    </span>
                  )}
                  {m.last_message_at && (
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      {formatRelativeTime(m.last_message_at)}
                    </span>
                  )}
                </div>
              </div>
              <p className="text-sm line-clamp-2 text-muted-foreground">
                {m.last_message_preview || "(sin contenido)"}
              </p>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
