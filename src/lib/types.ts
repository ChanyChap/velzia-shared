// Tipos compartidos referenciados por el chat. Subset de src/lib/types.ts
// de rt.sig — solo lo que necesita el chat para no arrastrar todo el
// dominio de rt.sig al paquete shared.

// CRM Loss Reason — fila de la tabla `crm_loss_reasons` configurable por funnel.
// La firma debe ser idéntica a la de rt.sig porque el chat-panel renderiza
// `reason.key`, `reason.label`, `reason.is_active`.
export interface CrmLossReason {
  id: string;
  tenant_id: string;
  funnel_id: string;
  key: string;
  label: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
