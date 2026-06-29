// @velzia/shared — superficie pública del paquete.
// Imports en apps consumidoras: `import { ChatBubbleButton } from "@velzia/shared"`.
//
// El cliente Supabase se inyecta una sola vez al boot de la app:
//   import { setSupabaseClientFactory } from "@velzia/shared";
//   setSupabaseClientFactory(() => createBrowserClient(URL, KEY));

// ── Chat: superficie pública ─────────────────────────────────────────────
export { ChatBubbleButton } from "./components/chat/chat-bubble-button";
export { ChatFloatingButton } from "./components/chat/chat-floating-button";
export { ChatFloatingDrawer } from "./components/chat/chat-floating-drawer";
export { ChatNotificationsSheet } from "./components/chat/chat-notifications-sheet";
export { ProjectChatPanel } from "./components/chat/project-chat-panel";
export { ChatBell } from "./components/chat/chat-bell";

// ── Hooks ────────────────────────────────────────────────────────────────
export {
  useChatUnreadDigest,
  useChatUnreadCount,
} from "./hooks/use-chat-unread-count";
export type { ChatUnreadDigest } from "./hooks/use-chat-unread-count";
export { useToast, toast } from "./hooks/use-toast";

// ── Tipos del chat ───────────────────────────────────────────────────────
export type {
  ChatMessage,
  ChatAttachment,
  TeamMember,
  DocumentDetection,
  ChatSlaConfig,
} from "./components/chat/types";

// ── Gantt / Cronograma compartido ────────────────────────────────────────
// Componente único del cronograma editable (antes "TareasGanttView" de rt.sig).
// La persistencia se inyecta mediante GanttDataPort; cada app (rt.sig, VelziaCAD)
// mapea sus entidades a GanttTask/GanttGroup/GanttDep y provee el puerto.
export { ScheduleGantt } from "./components/gantt/schedule-gantt";
export type { ScheduleGanttProps } from "./components/gantt/schedule-gantt";
export type {
  GanttTask,
  GanttGroup,
  GanttDep,
  GanttDependency,
  GanttDataPort,
  GanttBaselinePort,
  BaselineSummary,
  BaselineBar,
  DependencyType,
  TaskRow,
  ViewMode,
} from "./components/gantt/types";
// Calendario laboral del Gantt: para construir el WorkingCalendar (jornada +
// festivos) que activa las sub-líneas de hora y las bandas de no-laborables.
export { buildWorkingCalendar } from "./components/gantt/working-calendar";
export type {
  WorkingCalendar,
  WorkingCalendarRaw,
  RawWorkScheduleDay,
} from "./components/gantt/working-calendar";

// ── Inicialización del cliente Supabase ──────────────────────────────────
export { setSupabaseClientFactory } from "./lib/supabase-client";

// ── Utilidades ───────────────────────────────────────────────────────────
export {
  cn,
  normalizeText,
  formatCurrency,
  formatDate,
  formatDateTime,
} from "./lib/utils";

// ── shadcn/ui base ───────────────────────────────────────────────────────
export { Button, buttonVariants } from "./components/ui/button";
export { Badge, badgeVariants } from "./components/ui/badge";
export { Input } from "./components/ui/input";
export { Label } from "./components/ui/label";
export { Textarea } from "./components/ui/textarea";
export { Switch } from "./components/ui/switch";
export { Separator } from "./components/ui/separator";
export { ScrollArea, ScrollBar } from "./components/ui/scroll-area";
export {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "./components/ui/avatar";
export {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./components/ui/dialog";
export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./components/ui/sheet";
export {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "./components/ui/tabs";
export {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./components/ui/tooltip";
export {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "./components/ui/popover";
export {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./components/ui/dropdown-menu";
export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "./components/ui/select";
export { Toaster } from "./components/ui/toaster";
export {
  AlertDialog,
  AlertDialogPortal,
  AlertDialogOverlay,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "./components/ui/alert-dialog";
export {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
} from "./components/ui/command";
