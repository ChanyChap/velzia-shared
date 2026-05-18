#!/usr/bin/env node
// Sincroniza el código del chat desde rt.sig hacia @velzia/shared.
// Copia componentes UI + chat + comunicaciones + hooks + libs auxiliares
// y reescribe imports `@/...` a paths relativos del paquete shared o al
// punto de inyección `../../lib/supabase-client` (factory pattern).
//
// Uso: node scripts/sync-from-rtsig.mjs <ruta-absoluta-rtsig>

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RTSIG = process.argv[2];
if (!RTSIG || !fs.existsSync(RTSIG)) {
  console.error("Uso: node scripts/sync-from-rtsig.mjs <ruta-absoluta-rtsig>");
  process.exit(1);
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC_OUT = path.join(ROOT, "src");

// Lista de archivos a copiar: [origenRelativoRtSig, destinoRelativoSharedSrc]
const FILES = [
  // shadcn/ui
  ["src/components/ui/avatar.tsx", "components/ui/avatar.tsx"],
  ["src/components/ui/badge.tsx", "components/ui/badge.tsx"],
  ["src/components/ui/button.tsx", "components/ui/button.tsx"],
  ["src/components/ui/dialog.tsx", "components/ui/dialog.tsx"],
  ["src/components/ui/dropdown-menu.tsx", "components/ui/dropdown-menu.tsx"],
  ["src/components/ui/input.tsx", "components/ui/input.tsx"],
  ["src/components/ui/label.tsx", "components/ui/label.tsx"],
  ["src/components/ui/popover.tsx", "components/ui/popover.tsx"],
  ["src/components/ui/select.tsx", "components/ui/select.tsx"],
  ["src/components/ui/sheet.tsx", "components/ui/sheet.tsx"],
  ["src/components/ui/switch.tsx", "components/ui/switch.tsx"],
  ["src/components/ui/tabs.tsx", "components/ui/tabs.tsx"],
  ["src/components/ui/textarea.tsx", "components/ui/textarea.tsx"],
  ["src/components/ui/tooltip.tsx", "components/ui/tooltip.tsx"],
  ["src/components/ui/toast.tsx", "components/ui/toast.tsx"],
  ["src/components/ui/toaster.tsx", "components/ui/toaster.tsx"],
  ["src/components/ui/scroll-area.tsx", "components/ui/scroll-area.tsx"],
  ["src/components/ui/separator.tsx", "components/ui/separator.tsx"],
  // Chat (toda la carpeta)
  ["src/components/chat/chat-attachment-preview.tsx", "components/chat/chat-attachment-preview.tsx"],
  ["src/components/chat/chat-attachments-panel.tsx", "components/chat/chat-attachments-panel.tsx"],
  ["src/components/chat/chat-bell.tsx", "components/chat/chat-bell.tsx"],
  ["src/components/chat/chat-bubble-button.tsx", "components/chat/chat-bubble-button.tsx"],
  ["src/components/chat/chat-config-panel.tsx", "components/chat/chat-config-panel.tsx"],
  ["src/components/chat/chat-create-task-modal.tsx", "components/chat/chat-create-task-modal.tsx"],
  ["src/components/chat/chat-document-detection-alert.tsx", "components/chat/chat-document-detection-alert.tsx"],
  ["src/components/chat/chat-floating-button.tsx", "components/chat/chat-floating-button.tsx"],
  ["src/components/chat/chat-floating-drawer.tsx", "components/chat/chat-floating-drawer.tsx"],
  ["src/components/chat/chat-input.tsx", "components/chat/chat-input.tsx"],
  ["src/components/chat/chat-message-bubble.tsx", "components/chat/chat-message-bubble.tsx"],
  ["src/components/chat/chat-message-list.tsx", "components/chat/chat-message-list.tsx"],
  ["src/components/chat/chat-new-message-trigger.tsx", "components/chat/chat-new-message-trigger.tsx"],
  ["src/components/chat/chat-notifications-sheet.tsx", "components/chat/chat-notifications-sheet.tsx"],
  ["src/components/chat/chat-search-panel.tsx", "components/chat/chat-search-panel.tsx"],
  ["src/components/chat/chat-tabs.tsx", "components/chat/chat-tabs.tsx"],
  ["src/components/chat/chat-tip-banner.tsx", "components/chat/chat-tip-banner.tsx"],
  ["src/components/chat/mention-autocomplete.tsx", "components/chat/mention-autocomplete.tsx"],
  ["src/components/chat/project-chat-panel.tsx", "components/chat/project-chat-panel.tsx"],
  ["src/components/chat/types.ts", "components/chat/types.ts"],
  ["src/components/chat/use-sla-countdown.ts", "components/chat/use-sla-countdown.ts"],
  // Comunicaciones aux
  ["src/components/comunicaciones/chat-panel.tsx", "components/comunicaciones/chat-panel.tsx"],
  ["src/components/comunicaciones/message-bubble.tsx", "components/comunicaciones/message-bubble.tsx"],
  ["src/components/comunicaciones/responsible-select.tsx", "components/comunicaciones/responsible-select.tsx"],
  ["src/components/comunicaciones/task-bubble.tsx", "components/comunicaciones/task-bubble.tsx"],
  // Hooks
  ["src/hooks/use-chat-unread-count.ts", "hooks/use-chat-unread-count.ts"],
  ["src/hooks/use-toast.ts", "hooks/use-toast.ts"],
  // Libs auxiliares
  ["src/lib/whatsapp/line-permissions.ts", "lib/whatsapp/line-permissions.ts"],
  ["src/lib/whatsapp/types.ts", "lib/whatsapp/types.ts"],
];

// Mapas de reescritura: `@/lib/...` → ruta relativa al archivo destino.
// El cliente Supabase NO se importa directo: el shared expone una factory
// que cada app consumidora inicializa al boot con setSupabaseClientFactory().
function rewriteImports(content, destAbsPath) {
  const destDir = path.dirname(destAbsPath);
  const fromDestTo = (relFromSrc) => {
    const abs = path.join(SRC_OUT, relFromSrc);
    let rel = path.relative(destDir, abs).replace(/\\/g, "/");
    if (!rel.startsWith(".")) rel = "./" + rel;
    return rel;
  };

  // 1) @/lib/supabase/client → ../../lib/supabase-client (factory pattern)
  content = content.replace(/from\s+["']@\/lib\/supabase\/client["']/g, () => `from "${fromDestTo("lib/supabase-client")}"`);
  // 2) @/lib/utils → ../../lib/utils
  content = content.replace(/from\s+["']@\/lib\/utils["']/g, () => `from "${fromDestTo("lib/utils")}"`);
  // 3) @/lib/whatsapp/X → ../../lib/whatsapp/X
  content = content.replace(/from\s+["']@\/lib\/whatsapp\/([^"']+)["']/g, (_, m) => `from "${fromDestTo("lib/whatsapp/" + m)}"`);
  // 4) @/lib/crm → ../../lib/crm
  content = content.replace(/from\s+["']@\/lib\/crm["']/g, () => `from "${fromDestTo("lib/crm")}"`);
  // 5) @/lib/types → ../../lib/types
  content = content.replace(/from\s+["']@\/lib\/types["']/g, () => `from "${fromDestTo("lib/types")}"`);
  // 6) @/components/ui/X → ruta relativa
  content = content.replace(/from\s+["']@\/components\/ui\/([^"']+)["']/g, (_, m) => `from "${fromDestTo("components/ui/" + m)}"`);
  // 7) @/components/comunicaciones/X → ruta relativa
  content = content.replace(/from\s+["']@\/components\/comunicaciones\/([^"']+)["']/g, (_, m) => `from "${fromDestTo("components/comunicaciones/" + m)}"`);
  // 8) @/components/chat/X → ruta relativa (raro pero defensivo)
  content = content.replace(/from\s+["']@\/components\/chat\/([^"']+)["']/g, (_, m) => `from "${fromDestTo("components/chat/" + m)}"`);
  // 9) @/hooks/X → ruta relativa
  content = content.replace(/from\s+["']@\/hooks\/([^"']+)["']/g, (_, m) => `from "${fromDestTo("hooks/" + m)}"`);

  return content;
}

let copied = 0;
let missing = 0;
for (const [srcRel, dstRel] of FILES) {
  const srcAbs = path.join(RTSIG, srcRel);
  const dstAbs = path.join(SRC_OUT, dstRel);
  if (!fs.existsSync(srcAbs)) {
    console.warn(`  [MISSING] ${srcRel}`);
    missing++;
    continue;
  }
  const raw = fs.readFileSync(srcAbs, "utf8");
  const rewritten = rewriteImports(raw, dstAbs);
  fs.mkdirSync(path.dirname(dstAbs), { recursive: true });
  fs.writeFileSync(dstAbs, rewritten, "utf8");
  copied++;
}

console.log(`\n${copied} archivos copiados, ${missing} no encontrados.`);
