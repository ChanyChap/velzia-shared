'use client';

import { useCallback, useEffect, useState } from 'react';

export interface BaselineSummary {
  id: string;
  name: string;
  notes: string | null;
  created_at: string;
  total_duration_days: number;
}

export interface BaselineSnapshot {
  activities: Array<{
    id: string;
    name: string;
    days: number;
    is_milestone: boolean;
    is_pre_activity: boolean;
    parent_activity_id: string | null;
    lead_days: number;
    work_package_id: string;
    sort_order: number;
  }>;
  dependencies: Array<{
    id: string;
    activity_id: string;
    predecessor_activity_id: string;
    dependency_type: 'FS' | 'SS' | 'FF' | 'SF';
    lag_days: number;
  }>;
  schedule?: Record<string, { earlyStart: number; earlyFinish: number }>;
}

export interface BaselineRecord extends BaselineSummary {
  snapshot: BaselineSnapshot;
}

export function useBaselines(templateId: string) {
  const [baselines, setBaselines] = useState<BaselineSummary[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/edt-templates/${templateId}/baselines`);
      if (!res.ok) return;
      const json = await res.json();
      setBaselines(Array.isArray(json?.baselines) ? json.baselines : []);
    } finally {
      setLoading(false);
    }
  }, [templateId]);

  useEffect(() => {
    load();
  }, [load]);

  const create = useCallback(
    async (input: { name: string; notes?: string; snapshot: BaselineSnapshot; totalDurationDays: number }) => {
      const res = await fetch(`/api/edt-templates/${templateId}/baselines`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || 'Error al guardar baseline');
      }
      await load();
    },
    [templateId, load],
  );

  const remove = useCallback(
    async (baselineId: string) => {
      const res = await fetch(`/api/edt-templates/${templateId}/baselines/${baselineId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || 'Error al borrar baseline');
      }
      await load();
    },
    [templateId, load],
  );

  const fetchOne = useCallback(
    async (baselineId: string): Promise<BaselineRecord | null> => {
      const res = await fetch(`/api/edt-templates/${templateId}/baselines/${baselineId}`);
      if (!res.ok) return null;
      const json = await res.json();
      return json as BaselineRecord;
    },
    [templateId],
  );

  return { baselines, loading, reload: load, create, remove, fetchOne };
}
