// CPM (Critical Path Method) — forward + backward pass sobre actividades EDT.
// Algoritmo puro, sin React. Trabaja con días enteros (lag y duración).
// Soporta los 4 tipos de dependencia (FS / SS / FF / SF) y `lag_days` (puede ser negativo).

export type CpmDependencyType = 'FS' | 'SS' | 'FF' | 'SF';

export interface CpmActivity {
  id: string;
  days: number;
  isMilestone?: boolean;
}

// naturaleza PMBOK de la dependencia: obligatoria (hard logic) o discrecional
// (soft logic). Solo las obligatorias pueden marcar camino crítico; las
// discrecionales SÍ siguen empujando las fechas (forward/backward pass) pero
// NO marcan crítico. Por defecto 'mandatory' (retrocompat con datos viejos).
export type CpmDependencyNature = 'mandatory' | 'discretionary';

export interface CpmDependency {
  fromActivityId: string;
  toActivityId: string;
  type: CpmDependencyType;
  lagDays: number;
  nature?: CpmDependencyNature;
  // Dependencia ESTRUCTURAL (pre-actividad): se modela como FS con lag negativo
  // grande (= lead), pero NO debe restringir ni arrastrar a la madre — su
  // posición se deriva aparte en use-gantt-data. El CPM la excluye del cálculo
  // de earlyStart, del forzado FF/SF y del marcado de crítico, y NUNCA dispara
  // el reanclado global por lag negativo. Default false (deps reales).
  structural?: boolean;
}

export interface CpmActivitySchedule {
  id: string;
  earlyStart: number;
  earlyFinish: number;
  lateStart: number;
  lateFinish: number;
  totalFloat: number;
  isCritical: boolean;
  // Posición de RENDER (offset de inicio con el que se DIBUJA la barra). Por
  // defecto = earlyStart (ASAP). Para una actividad "flotante" — que solo
  // ALIMENTA a otras y no está anclada por ninguna predecesora real (típicamente
  // "pedir/recibir material") — vale su posición JUST-IN-TIME: lo más tarde
  // posible sin retrasar a su sucesora, así se pega justo antes de la actividad
  // que la consume en vez de quedarse al inicio del proyecto (Chany 1 jun).
  renderStart: number;
}

export interface CpmResult {
  schedule: Map<string, CpmActivitySchedule>;
  totalDuration: number;
  criticalActivityIds: Set<string>;
  cycleActivityIds: string[];
  hasCycle: boolean;
}

// Tolerancia para floats — los cálculos son enteros (días), pero la lógica
// permite `lag_days` no enteros si en algún momento se admiten horas.
const FLOAT_EPSILON = 1e-6;

function topologicalSort(
  activities: CpmActivity[],
  dependencies: CpmDependency[],
): { order: string[]; cycleNodes: string[] } {
  const indegree = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const a of activities) {
    indegree.set(a.id, 0);
    adj.set(a.id, []);
  }
  for (const d of dependencies) {
    if (!indegree.has(d.toActivityId) || !indegree.has(d.fromActivityId)) continue;
    indegree.set(d.toActivityId, (indegree.get(d.toActivityId) ?? 0) + 1);
    adj.get(d.fromActivityId)!.push(d.toActivityId);
  }

  const queue: string[] = [];
  indegree.forEach((deg, id) => {
    if (deg === 0) queue.push(id);
  });

  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const next of adj.get(id) ?? []) {
      const deg = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, deg);
      if (deg === 0) queue.push(next);
    }
  }

  const cycleNodes: string[] = [];
  if (order.length < activities.length) {
    indegree.forEach((deg, id) => {
      if (deg > 0) cycleNodes.push(id);
    });
  }

  return { order, cycleNodes };
}

export function computeCpm(
  activities: CpmActivity[],
  dependencies: CpmDependency[],
): CpmResult {
  const actById = new Map(activities.map(a => [a.id, a]));
  const { order, cycleNodes } = topologicalSort(activities, dependencies);

  const depsByTo = new Map<string, CpmDependency[]>();
  const depsByFrom = new Map<string, CpmDependency[]>();
  for (const d of dependencies) {
    if (!actById.has(d.fromActivityId) || !actById.has(d.toActivityId)) continue;
    const a = depsByTo.get(d.toActivityId) || [];
    a.push(d);
    depsByTo.set(d.toActivityId, a);
    const b = depsByFrom.get(d.fromActivityId) || [];
    b.push(d);
    depsByFrom.set(d.fromActivityId, b);
  }

  const ES = new Map<string, number>();
  const EF = new Map<string, number>();

  // Si hay ciclo, las actividades en el ciclo no están en `order` — se les
  // asigna ES=0 / EF=days para no romper el render visual.
  const orderedIds = new Set(order);
  for (const a of activities) {
    if (!orderedIds.has(a.id)) {
      ES.set(a.id, 0);
      EF.set(a.id, Math.max(0, a.days));
    }
  }

  for (const id of order) {
    const act = actById.get(id);
    if (!act) continue;
    const duration = Math.max(0, act.days);
    // esConstraint = mayor cota inferior que imponen las dependencias REALES
    // (FS/SS). null = la actividad no tiene predecesoras reales → arranca en el
    // inicio del proyecto (0). Si tiene predecesoras, se respeta su cota AUNQUE
    // sea negativa (lag negativo que adelanta a la sucesora): NO se clampa a 0
    // por actividad — el reanclado global de más abajo desplaza todo para que el
    // mínimo sea 0. Las dependencias estructurales (pre-actividades) se ignoran
    // aquí: no restringen a la madre (su posición se calcula aparte), así un lead
    // grande (lag muy negativo) no la arrastra ni dispara reanclado.
    let esConstraint: number | null = null;
    let efForced: number | null = null;
    const incoming = depsByTo.get(id) ?? [];
    for (const dep of incoming) {
      if (dep.structural) continue;
      const predEs = ES.get(dep.fromActivityId);
      const predEf = EF.get(dep.fromActivityId);
      if (predEs == null || predEf == null) continue;
      const lag = dep.lagDays ?? 0;
      switch (dep.type) {
        case 'FS': {
          const c = predEf + lag;
          if (esConstraint == null || c > esConstraint) esConstraint = c;
          break;
        }
        case 'SS': {
          const c = predEs + lag;
          if (esConstraint == null || c > esConstraint) esConstraint = c;
          break;
        }
        case 'FF': {
          const requiredEf = predEf + lag;
          if (efForced == null || requiredEf > efForced) efForced = requiredEf;
          break;
        }
        case 'SF': {
          const requiredEf = predEs + lag;
          if (efForced == null || requiredEf > efForced) efForced = requiredEf;
          break;
        }
      }
    }

    // Posicionamiento según las restricciones entrantes:
    //  - Con cota FS/SS (esConstraint): se posiciona por su inicio; una FF/SF
    //    solo puede EMPUJAR el fin más tarde (cota inferior de fin).
    //  - SOLO con FF/SF (sin FS/SS): se ANCLA el fin EXACTAMENTE a esa
    //    restricción, aunque caiga ANTES de su posición ASAP. Antes esto se
    //    ignoraba (la FF/SF solo empujaba más tarde), así que una actividad
    //    atada por SF a la que se le pide terminar antes que su posición natural
    //    se quedaba al inicio del proyecto en vez de alinearse con su
    //    predecesora (Chany 1 jun — "Calcular ... debe terminar 1 día antes de
    //    que empiece Eléctricos"). El reanclado global posterior sube todo si el
    //    inicio queda negativo.
    //  - Sin predecesoras reales → inicio del proyecto (0).
    let earlyStart: number;
    let earlyFinish: number;
    if (esConstraint != null) {
      earlyStart = esConstraint;
      earlyFinish = earlyStart + duration;
      if (efForced != null && efForced > earlyFinish) {
        earlyFinish = efForced;
        earlyStart = earlyFinish - duration;
      }
    } else if (efForced != null) {
      earlyFinish = efForced;
      earlyStart = earlyFinish - duration;
    } else {
      earlyStart = 0;
      earlyFinish = duration;
    }

    ES.set(id, earlyStart);
    EF.set(id, earlyFinish);
  }

  // Reanclado global: si alguna actividad quedó con earlyStart < 0 (lag negativo
  // que la adelanta antes del ancla), desplazamos TODO el cronograma para que el
  // inicio más temprano sea 0 (= ANCHOR_DATE). Así una sucesora con lag -x ocurre
  // antes que su predecesora sin salirse por la izquierda del eje, y todas las
  // posiciones relativas (incluida la del lag negativo) se preservan. Sin lags
  // negativos minES=0 y no hay desplazamiento (sin regresión).
  let minES = 0;
  ES.forEach(v => { if (v < minES) minES = v; });
  if (minES < 0) {
    const shift = -minES;
    ES.forEach((v, k) => ES.set(k, v + shift));
    EF.forEach((v, k) => EF.set(k, v + shift));
  }

  let projectFinish = 0;
  EF.forEach(v => {
    if (v > projectFinish) projectFinish = v;
  });

  const LS = new Map<string, number>();
  const LF = new Map<string, number>();
  for (const a of activities) {
    LS.set(a.id, Number.POSITIVE_INFINITY);
    LF.set(a.id, Number.POSITIVE_INFINITY);
  }

  for (let i = order.length - 1; i >= 0; i--) {
    const id = order[i];
    const act = actById.get(id);
    if (!act) continue;
    const duration = Math.max(0, act.days);
    const outgoing = depsByFrom.get(id) ?? [];

    let lateFinish: number;
    if (outgoing.length === 0) {
      lateFinish = projectFinish;
    } else {
      lateFinish = Number.POSITIVE_INFINITY;
      for (const dep of outgoing) {
        const succLs = LS.get(dep.toActivityId);
        const succLf = LF.get(dep.toActivityId);
        if (succLs == null || succLf == null) continue;
        const lag = dep.lagDays ?? 0;
        let candidate: number;
        switch (dep.type) {
          case 'FS':
            candidate = succLs - lag;
            break;
          case 'SS':
            candidate = succLs - lag + duration;
            break;
          case 'FF':
            candidate = succLf - lag;
            break;
          case 'SF':
            candidate = succLf - lag + duration;
            break;
        }
        if (candidate < lateFinish) lateFinish = candidate;
      }
    }

    const lateStart = lateFinish - duration;
    LS.set(id, lateStart);
    LF.set(id, lateFinish);
  }

  for (const id of cycleNodes) {
    LS.set(id, ES.get(id) ?? 0);
    LF.set(id, EF.get(id) ?? 0);
  }

  // ── Pase JIT (As-Late-As-Possible) para tareas de aprovisionamiento ──
  // Por defecto la barra se dibuja en su earlyStart (ASAP). Pero una actividad
  // "flotante" — que SOLO alimenta a otras (tiene sucesoras reales) y NO está
  // anclada por ninguna predecesora real (o todas sus predecesoras reales son a
  // su vez flotantes) — se coloca lo más tarde posible sin retrasar a su
  // sucesora: así "pedir/recibir material" se pega justo antes de la actividad
  // que lo consume, en vez de quedarse al inicio del proyecto. Excluye las deps
  // estructurales (pre-actividades). Chany 1 jun.
  const realInOf = (id: string) => (depsByTo.get(id) ?? []).filter(d => !d.structural);
  const realOutOf = (id: string) => (depsByFrom.get(id) ?? []).filter(d => !d.structural);
  const floatOf = (id: string) => (LS.get(id) ?? 0) - (ES.get(id) ?? 0);
  // Una actividad es "flotante" (candidata a JIT) SOLO si:
  //   (1) alimenta a alguna sucesora real (tiene salida),
  //   (2) tiene HOLGURA (>0): NO está en el camino crítico ni es un ancla que
  //       arrastra a su sucesora (si fuera vinculante, holgura=0 → ASAP), y
  //   (3) todas sus predecesoras reales son a su vez flotantes (o no tiene
  //       predecesoras): así una cadena de aprovisionamiento entera (pedir →
  //       recibir) se pega junta justo antes de su consumo, pero una actividad
  //       anclada por una predecesora crítica (p.ej. "Desescombro") NO se mueve.
  // Sin la condición de holgura, CUALQUIER fuente (incluida Desescombro) se
  // tomaría como flotante y arrastraría todo a tarde. Se calcula en orden
  // topológico (predecesoras antes que sucesoras). Chany 1 jun.
  const floating = new Map<string, boolean>();
  for (const id of order) {
    const outs = realOutOf(id);
    let f = outs.length > 0 && floatOf(id) > FLOAT_EPSILON;
    if (f) {
      const ins = realInOf(id);
      if (ins.length > 0) {
        // La flotabilidad (JIT) SOLO se propaga por cadenas FS de
        // aprovisionamiento (pedir →FS→ recibir →FS→ instalar). Una dependencia
        // SS/FF/SF es un ANCLA explícita que el usuario puso a propósito
        // (p.ej. "Calcular material" SS+1 sobre "Desescombro" = empieza 1 día
        // después de empezar el desescombro): esa actividad NO debe flotar al
        // final, se dibuja en su earlyStart (la posición anclada). Además, todas
        // sus predecesoras (FS) deben ser a su vez flotantes para que la cadena
        // entera se pegue junta justo antes de su consumo. (Chany 2 jun)
        f = ins.every(d => d.type === 'FS' && floating.get(d.fromActivityId) === true);
      }
    }
    floating.set(id, f);
  }
  // renderStart por defecto = earlyStart; las flotantes se recolocan JIT en orden
  // topológico INVERSO (sucesoras ya tienen su renderStart calculado).
  const RS = new Map<string, number>(ES);
  for (let i = order.length - 1; i >= 0; i--) {
    const id = order[i];
    if (!floating.get(id)) continue;
    const act = actById.get(id);
    if (!act) continue;
    const dur = Math.max(0, act.days);
    let latest = Number.POSITIVE_INFINITY;
    for (const dep of realOutOf(id)) {
      const sRS = RS.get(dep.toActivityId);
      const sAct = actById.get(dep.toActivityId);
      if (sRS == null || !sAct) continue;
      const sDur = Math.max(0, sAct.days);
      const sRF = sRS + sDur;
      const lag = dep.lagDays ?? 0;
      let start: number;
      switch (dep.type) {
        case 'FS': start = sRS - lag - dur; break;
        case 'SS': start = sRS - lag; break;
        case 'FF': start = sRF - lag - dur; break;
        case 'SF': start = sRF - lag; break;
      }
      if (start < latest) latest = start;
    }
    // No la adelantamos antes de su earlyStart (ASAP / inicio de proyecto).
    if (latest !== Number.POSITIVE_INFINITY) {
      RS.set(id, Math.max(ES.get(id) ?? 0, latest));
    }
  }

  const schedule = new Map<string, CpmActivitySchedule>();
  // Primero calculamos holgura cero (zero-float) con TODAS las dependencias —
  // así las fechas se mantienen aunque haya discrecionales. El marcado de
  // crítico se decide después, solo sobre aristas obligatorias y vinculantes.
  const zeroFloat = new Set<string>();
  for (const a of activities) {
    const es = ES.get(a.id) ?? 0;
    const ef = EF.get(a.id) ?? 0;
    const ls = LS.get(a.id) ?? 0;
    const lf = LF.get(a.id) ?? 0;
    const totalFloat = ls - es;
    const isZero = Math.abs(totalFloat) < FLOAT_EPSILON && !cycleNodes.includes(a.id);
    if (isZero) zeroFloat.add(a.id);
    schedule.set(a.id, {
      id: a.id,
      earlyStart: es,
      earlyFinish: ef,
      lateStart: ls,
      lateFinish: lf,
      totalFloat,
      isCritical: false,
      renderStart: RS.get(a.id) ?? es,
    });
  }

  // Qué actividades tienen alguna dependencia entrante/saliente válida.
  const hasInDep = new Set<string>();
  const hasOutDep = new Set<string>();
  for (const d of dependencies) {
    if (!actById.has(d.fromActivityId) || !actById.has(d.toActivityId)) continue;
    hasOutDep.add(d.fromActivityId);
    hasInDep.add(d.toActivityId);
  }

  // Marcado de crítico: una arista P→S marca crítico solo si es OBLIGATORIA,
  // ambos extremos son zero-float y la arista es "vinculante" (es la que
  // determina ES/EF del sucesor). Las discrecionales nunca marcan.
  const criticalActivityIds = new Set<string>();
  for (const d of dependencies) {
    if ((d.nature ?? 'mandatory') !== 'mandatory') continue;
    if (d.structural) continue; // pre-actividad: nunca marca crítico
    const P = d.fromActivityId;
    const S = d.toActivityId;
    if (!zeroFloat.has(P) || !zeroFloat.has(S)) continue;
    const esP = ES.get(P) ?? 0;
    const efP = EF.get(P) ?? 0;
    const esS = ES.get(S) ?? 0;
    const efS = EF.get(S) ?? 0;
    const lag = d.lagDays ?? 0;
    let binding = false;
    switch (d.type) {
      case 'FS': binding = Math.abs((efP + lag) - esS) < FLOAT_EPSILON; break;
      case 'SS': binding = Math.abs((esP + lag) - esS) < FLOAT_EPSILON; break;
      case 'FF': binding = Math.abs((efP + lag) - efS) < FLOAT_EPSILON; break;
      case 'SF': binding = Math.abs((esP + lag) - efS) < FLOAT_EPSILON; break;
    }
    if (binding) {
      criticalActivityIds.add(P);
      criticalActivityIds.add(S);
    }
  }
  // Actividades zero-float aisladas (sin ninguna dependencia) — clásico CPM.
  for (const id of Array.from(zeroFloat)) {
    if (!hasInDep.has(id) && !hasOutDep.has(id)) criticalActivityIds.add(id);
  }
  // Reflejar el marcado en el schedule.
  for (const id of Array.from(criticalActivityIds)) {
    const s = schedule.get(id);
    if (s) s.isCritical = true;
  }

  return {
    schedule,
    totalDuration: projectFinish,
    criticalActivityIds,
    cycleActivityIds: cycleNodes,
    hasCycle: cycleNodes.length > 0,
  };
}
