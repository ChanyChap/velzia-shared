/**
 * Formatea una duración en días (puede ser fraccionaria) eligiendo
 * automáticamente la unidad para evitar decimales. Se usa en las cápsulas del
 * Gantt, la tabla izquierda (task-list) y el modal de actividad.
 *
 * Convención: 1 día laborable = 8 horas; 1 hora = 60 minutos.
 *
 * Reglas (Chany 29 may): mostrar d (días), h (horas) y m (minutos) combinando
 * lo justo para que no aparezcan decimales. Ejemplos:
 *   - 0          → "0"
 *   - 1          → "1d"
 *   - 0.5h (=0.0625 d) → "30m"   (antes se veía "0.5h")
 *   - 1.5 d      → "1d 4h"
 *   - 0.125 d    → "1h"
 *   - 0.0104 d   → "5m"
 * Soporta negativos (para lags): "-2h", "-1d 30m".
 */
export const HOURS_PER_DAY = 8;
const MIN_PER_HOUR = 60;
const MIN_PER_DAY = HOURS_PER_DAY * MIN_PER_HOUR; // 480

export function formatDurationShort(days: number): string {
  if (!Number.isFinite(days) || days === 0) return '0';
  const sign = days < 0 ? '-' : '';
  let totalMin = Math.round(Math.abs(days) * MIN_PER_DAY);
  if (totalMin === 0) return '0';
  const d = Math.floor(totalMin / MIN_PER_DAY);
  totalMin -= d * MIN_PER_DAY;
  const h = Math.floor(totalMin / MIN_PER_HOUR);
  totalMin -= h * MIN_PER_HOUR;
  const m = totalMin;
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  return sign + (parts.join(' ') || '0');
}

// Unidad de duración editable en inputs (d/h/m).
export type DurationUnit = 'd' | 'h' | 'm';

// Convierte un valor expresado en la unidad indicada a días (interno).
export function unitToDays(value: number, unit: DurationUnit): number {
  if (unit === 'h') return value / HOURS_PER_DAY;
  if (unit === 'm') return value / MIN_PER_DAY;
  return value;
}

// Convierte días a valor en la unidad indicada (para precargar inputs).
export function daysToUnit(days: number, unit: DurationUnit): number {
  // Redondeo a 3 decimales (no 2) para no perder precisión al precargar inputs.
  if (unit === 'h') return Math.round(days * HOURS_PER_DAY * 1000) / 1000;
  if (unit === 'm') return Math.round(days * MIN_PER_DAY);
  return Math.round(days * 1000) / 1000;
}

// Elige la unidad más natural para una duración en días, evitando decimales:
// si es múltiplo de día → 'd'; si es múltiplo de hora → 'h'; si no → 'm'.
export function pickNaturalUnit(days: number): DurationUnit {
  if (!Number.isFinite(days) || days <= 0) return 'd';
  const totalMin = Math.round(days * MIN_PER_DAY);
  if (totalMin % MIN_PER_DAY === 0) return 'd';
  if (totalMin % MIN_PER_HOUR === 0) return 'h';
  return 'm';
}
