// Constantes de CRM compartidas — sólo las que usa el chat (LOST_REASONS).
// Mantener el shape `{ key, label }` para no romper el chat-panel copiado.

export const LOST_REASONS = [
  { key: "precio", label: "Precio alto" },
  { key: "competencia", label: "Eligio competencia" },
  { key: "no_contesta", label: "No contesta / No responde" },
  { key: "cambio_idea", label: "Cambio de idea" },
  { key: "sin_presupuesto", label: "Fuera de presupuesto" },
  { key: "timing", label: "Timing / Aplazado" },
  { key: "otro", label: "Otro" },
] as const;

export function getLostReasonLabel(key: string): string {
  return LOST_REASONS.find((r) => r.key === key)?.label || key;
}
