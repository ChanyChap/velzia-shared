#!/usr/bin/env node
// Reescribe `fetch("/api/chat/...")` → `chatFetch("/api/chat/...")` en los
// archivos del chat del shared, y añade el import al principio del archivo
// si no existe.
//
// Idempotente: si ya está reescrito, no toca nada.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src");

const TARGETS = [
  "hooks/use-chat-unread-count.ts",
  "components/chat/chat-attachments-panel.tsx",
  "components/chat/chat-bell.tsx",
  "components/chat/chat-config-panel.tsx",
  "components/chat/chat-input.tsx",
  "components/chat/chat-tabs.tsx",
  "components/chat/project-chat-panel.tsx",
  "components/chat/use-sla-countdown.ts",
];

// Patrón: `fetch(` seguido (con espacios/saltos opcionales) de comilla y
// `/api/chat`. Sólo cambia el identificador `fetch` por `chatFetch`.
const FETCH_RE = /\bfetch\s*\(\s*([`"'])\/api\/chat/g;

function rewrite(content, fileRel) {
  const original = content;
  content = content.replace(FETCH_RE, (_m, quote) => `chatFetch(${quote}/api/chat`);
  if (content === original) return content;

  // Añadir import al primer hueco tras la última línea de imports existentes.
  if (!/from\s+["'][^"']*chat-api-base["']/.test(content)) {
    // ¿Está en hooks/ o en components/chat/?
    const importPath = fileRel.startsWith("hooks/")
      ? "../lib/chat-api-base"
      : "../../lib/chat-api-base";
    // Detecta la última línea `import ... from ...;` y añade después.
    const lines = content.split("\n");
    let lastImportIdx = -1;
    for (let i = 0; i < Math.min(lines.length, 60); i++) {
      if (/^import\b/.test(lines[i].trim())) lastImportIdx = i;
    }
    const importLine = `import { chatFetch } from "${importPath}";`;
    if (lastImportIdx >= 0) {
      lines.splice(lastImportIdx + 1, 0, importLine);
    } else {
      lines.unshift(importLine);
    }
    content = lines.join("\n");
  }

  return content;
}

let changed = 0;
for (const rel of TARGETS) {
  const abs = path.join(SRC, rel);
  if (!fs.existsSync(abs)) {
    console.warn(`  [MISSING] ${rel}`);
    continue;
  }
  const before = fs.readFileSync(abs, "utf8");
  const after = rewrite(before, rel);
  if (before === after) {
    console.log(`  [skip] ${rel} (sin matches o ya reescrito)`);
    continue;
  }
  fs.writeFileSync(abs, after, "utf8");
  changed++;
  console.log(`  [ok] ${rel}`);
}
console.log(`\n${changed} archivos modificados.`);
