'use client';

import { useCallback, useEffect, useState } from 'react';
import { LOCAL_STORAGE_COLLAPSE_KEY } from './constants';

export function useCollapseState(templateId: string) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(LOCAL_STORAGE_COLLAPSE_KEY(templateId));
      if (raw) {
        const arr = JSON.parse(raw) as string[];
        if (Array.isArray(arr)) setCollapsed(new Set(arr));
      }
    } catch {
      /* ignore */
    }
  }, [templateId]);

  const persist = useCallback(
    (next: Set<string>) => {
      if (typeof window === 'undefined') return;
      try {
        window.localStorage.setItem(
          LOCAL_STORAGE_COLLAPSE_KEY(templateId),
          JSON.stringify(Array.from(next)),
        );
      } catch {
        /* ignore */
      }
    },
    [templateId],
  );

  const toggle = useCallback(
    (id: string) => {
      setCollapsed(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const expandAll = useCallback(() => {
    setCollapsed(prev => {
      if (prev.size === 0) return prev;
      const next = new Set<string>();
      persist(next);
      return next;
    });
  }, [persist]);

  const collapseAll = useCallback(
    (ids: string[]) => {
      const next = new Set(ids);
      persist(next);
      setCollapsed(next);
    },
    [persist],
  );

  return { collapsed, toggle, expandAll, collapseAll };
}
