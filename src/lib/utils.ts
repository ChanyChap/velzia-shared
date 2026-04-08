import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
  }).format(amount);
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(date));
}

export function formatDateTime(date: string | Date): string {
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

export function generateOrderNumber(sequence: number): string {
  const year = new Date().getFullYear();
  return `OF-${year}-${String(sequence).padStart(4, "0")}`;
}

export function generateProjectNumber(sequence: number): string {
  const year = new Date().getFullYear();
  return `PRY-${year}-${String(sequence).padStart(4, "0")}`;
}

export function generateQRPayload(
  tenantId: string,
  orderNumber: string,
  itemIndex: number,
  hash: string
): string {
  return `FAB|${tenantId}|${orderNumber}|${String(itemIndex).padStart(3, "0")}|${hash}`;
}

export function parseQRPayload(payload: string) {
  const parts = payload.split("|");
  if (parts.length !== 5 || parts[0] !== "FAB") return null;
  return {
    tenantId: parts[1],
    orderNumber: parts[2],
    itemIndex: parseInt(parts[3], 10),
    hash: parts[4],
  };
}

export function generateVisitNumber(sequence: number): string {
  const year = new Date().getFullYear();
  return `PT-${year}-${String(sequence).padStart(4, "0")}`;
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
