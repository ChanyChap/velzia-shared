import type { CriticalPathInfo, TaskRow } from './types';

export function isRowCritical(row: TaskRow, cp: CriticalPathInfo): boolean {
  if (row.kind !== 'activity' || !row.activityId) return false;
  return cp.activityIds.has(row.activityId);
}

export function isEdgeCritical(
  fromActivityId: string | null | undefined,
  toActivityId: string | null | undefined,
  cp: CriticalPathInfo,
): boolean {
  if (!fromActivityId || !toActivityId) return false;
  return cp.activityIds.has(fromActivityId) && cp.activityIds.has(toActivityId);
}
