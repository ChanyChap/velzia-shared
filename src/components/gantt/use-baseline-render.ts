'use client';

import { useEffect, useState } from 'react';
import { addDays } from 'date-fns';
import { ANCHOR_DATE } from './constants';
import { computeCpm, type CpmActivity, type CpmDependency } from './cpm-engine';
import type { BaselineRecord, BaselineSnapshot } from './use-baselines';

export interface BaselineBar {
  activityId: string;
  startDate: Date;
  days: number;
  isMilestone: boolean;
}

interface UseBaselineRenderInput {
  baselineId: string | null;
  fetchBaseline: (id: string) => Promise<BaselineRecord | null>;
}

interface UseBaselineRenderResult {
  baseline: BaselineRecord | null;
  bars: Map<string, BaselineBar>;
  loading: boolean;
}

function computeScheduleFromSnapshot(snapshot: BaselineSnapshot) {
  if (snapshot.schedule) {
    return new Map(
      Object.entries(snapshot.schedule).map(([id, s]) => [id, { es: s.earlyStart, ef: s.earlyFinish }]),
    );
  }
  const cpmActs: CpmActivity[] = snapshot.activities.map(a => ({
    id: a.id,
    days: a.is_milestone ? 0 : Math.max(0, a.days || 0),
    isMilestone: a.is_milestone,
  }));
  const cpmDeps: CpmDependency[] = [];
  for (const d of snapshot.dependencies) {
    cpmDeps.push({
      fromActivityId: d.predecessor_activity_id,
      toActivityId: d.activity_id,
      type: d.dependency_type,
      lagDays: d.lag_days,
    });
  }
  for (const a of snapshot.activities) {
    if (a.is_pre_activity && a.parent_activity_id) {
      cpmDeps.push({
        fromActivityId: a.id,
        toActivityId: a.parent_activity_id,
        type: 'FS',
        lagDays: -Math.max(0, a.lead_days || 0),
      });
    }
  }
  const result = computeCpm(cpmActs, cpmDeps);
  const map = new Map<string, { es: number; ef: number }>();
  result.schedule.forEach((s, id) => {
    map.set(id, { es: s.earlyStart, ef: s.earlyFinish });
  });
  return map;
}

export function useBaselineRender(input: UseBaselineRenderInput): UseBaselineRenderResult {
  const { baselineId, fetchBaseline } = input;
  const [baseline, setBaseline] = useState<BaselineRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [bars, setBars] = useState<Map<string, BaselineBar>>(new Map());

  useEffect(() => {
    if (!baselineId) {
      setBaseline(null);
      setBars(new Map());
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchBaseline(baselineId)
      .then(rec => {
        if (cancelled) return;
        setBaseline(rec);
        if (!rec) {
          setBars(new Map());
          return;
        }
        const sched = computeScheduleFromSnapshot(rec.snapshot);
        const nextBars = new Map<string, BaselineBar>();
        for (const act of rec.snapshot.activities) {
          const s = sched.get(act.id);
          if (!s) continue;
          let startDate: Date;
          let days: number;
          if (act.is_pre_activity && act.parent_activity_id) {
            const parentSched = sched.get(act.parent_activity_id);
            const lead = Math.max(0, act.lead_days || 0);
            startDate = parentSched
              ? addDays(ANCHOR_DATE, Math.round(parentSched.es - lead))
              : addDays(ANCHOR_DATE, Math.round(s.es));
            days = act.is_milestone ? 0 : Math.max(0, act.days || 0);
          } else {
            startDate = addDays(ANCHOR_DATE, Math.round(s.es));
            days = act.is_milestone ? 0 : Math.max(0, act.days || 0);
          }
          nextBars.set(act.id, {
            activityId: act.id,
            startDate,
            days,
            isMilestone: !!act.is_milestone || days === 0,
          });
        }
        setBars(nextBars);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [baselineId, fetchBaseline]);

  return { baseline, bars, loading };
}
