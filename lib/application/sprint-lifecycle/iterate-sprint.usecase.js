/**
 * iterate-sprint.usecase.js — Sprint iterate-phase matchRate 100% loop (v2.1.13 Sprint 2).
 *
 * Sequential (ENH-292) gap-detect → auto-fix → re-measure cycle until either
 *   - matchRate >= sprint.config.matchRateTarget (default 100), OR
 *   - iteration count >= sprint.config.maxIterations (default 5)
 *
 * When the loop exits below `matchRateMinAcceptable` (default 90) the result
 * is marked `blocked: true` so callers (start-sprint orchestrator + Stop hook)
 * can fire ITERATION_EXHAUSTED auto-pause.
 *
 * Pure use case — gap-detector / auto-fixer are injected via deps.
 *
 * Design Ref: docs/02-design/features/v2113-sprint-2-application.design.md §6
 * Master Plan Ref: docs/01-plan/features/sprint-management.master-plan.md §11.3 (ITERATION_EXHAUSTED)
 *
 * @module lib/application/sprint-lifecycle/iterate-sprint.usecase
 * @version 2.1.13
 * @since 2.1.13
 */

const { cloneSprint } = require('../../domain/sprint');

/*
 * v2.1.34: the default detector reports NO measurement, not a perfect one.
 *
 * This returned `{ matchRate: 100, gaps: [] }`, which is the second of two
 * layers that turned "nobody measured anything" into "everything matches".
 * With an empty project, no design document and no implementation, the iterate
 * phase produced `M1_matchRate: { current: 100, threshold: 90, passed: true }`.
 *
 * A use case cannot measure a code base by itself — that is what the injected
 * detector is for — so the honest default is the absence of a measurement.
 */
function defaultGapDetector(_sprint) {
  return Promise.resolve({
    matchRate: null,
    measured: false,
    gaps: [{
      id: 'no_gap_detector',
      severity: 'high',
      description: 'No gapDetector was injected, so design-vs-implementation was never compared.',
    }],
  });
}

/**
 * Did this result come from a comparison that actually ran?
 *
 * Treats a legacy result with no `measured` field as measured when it carries a
 * usable number, so an injected detector written before v2.1.34 keeps working.
 *
 * @param {{matchRate?: unknown, measured?: unknown}|null|undefined} m
 * @returns {boolean}
 */
function isMeasured(m) {
  if (!m) return false;
  if (m.measured === false) return false;
  return typeof m.matchRate === 'number' && Number.isFinite(m.matchRate);
}

function defaultAutoFixer(_sprint, _gaps) {
  return Promise.resolve({ fixedTaskIds: [] });
}

/**
 * @typedef {Object} IterateSprintResult
 * @property {boolean} ok
 * @property {import('../../domain/sprint/entity').Sprint} sprint
 * @property {number|null} finalMatchRate - null when nothing was measured, which
 *   is distinct from a measured 0: one means "we looked and found no match", the
 *   other means "no comparison ran". Callers already guard on `typeof === 'number'`.
 * @property {boolean} measured - false when no gap detection ran at all
 * @property {number} iterations
 * @property {boolean} blocked
 * @property {Array<{ iteration: number, matchRate: number|null, fixedTaskIds: string[], durationMs: number|null }>} history
 */

/**
 * Iterate a sprint until matchRate target or maxIterations reached.
 *
 * @param {import('../../domain/sprint/entity').Sprint} sprint - in 'iterate' phase
 * @param {{ gapDetector?: function, autoFixer?: function, eventEmitter?: function, clock?: () => number }} [deps]
 * @returns {Promise<IterateSprintResult>}
 */
async function iterateSprint(sprint, deps) {
  const target = (sprint && sprint.config && sprint.config.matchRateTarget) || 100;
  const maxIter = (sprint && sprint.config && sprint.config.maxIterations) || 5;
  const minOk = (sprint && sprint.config && sprint.config.matchRateMinAcceptable) || 90;
  const gapDetector = (deps && typeof deps.gapDetector === 'function')
    ? deps.gapDetector : defaultGapDetector;
  const autoFixer = (deps && typeof deps.autoFixer === 'function')
    ? deps.autoFixer : defaultAutoFixer;
  const clock = (deps && typeof deps.clock === 'function') ? deps.clock : () => Date.now();

  let working = sprint;
  const historyAppend = [...(working.iterateHistory || [])];

  let measurement = await gapDetector(working);

  /*
   * An unmeasured rate is not a failing rate and not a passing one — it is the
   * absence of evidence, and the loop below cannot improve it. Auto-fixing
   * against gaps nobody detected would burn maxIterations of agent work and
   * still end with nothing measured, so this exits immediately and reports the
   * condition instead.
   */
  if (!isMeasured(measurement)) {
    const prevKpiU = (working && working.kpi) || {};
    const prevGatesU = (working && working.qualityGates) || {};
    const prevM1U = prevGatesU.M1_matchRate || { current: null, threshold: 90, passed: null };
    const thresholdU = prevM1U.threshold || 90;
    const updatedU = cloneSprint(working, {
      iterateHistory: historyAppend,
      kpi: { ...prevKpiU, matchRate: null },
      qualityGates: {
        ...prevGatesU,
        M1_matchRate: {
          current: null,
          threshold: thresholdU,
          /*
           * `false`, not `null`. Only `passed === false` fires QUALITY_GATE_FAIL
           * (auto-pause.js) and blocks a phase transition (advance-phase.usecase.js);
           * `null` reads as "not applicable" and lets the sprint sail past the one
           * gate it exists to enforce. Iterate ran and could not certify the code,
           * so the gate has not been met.
           */
          passed: false,
          measured: false,
          reason: 'unmeasured — no gap detection ran; match rate is unknown, not passing',
        },
      },
    });
    return {
      ok: true,
      sprint: updatedU,
      finalMatchRate: null,
      measured: false,
      iterations: 0,
      blocked: true,
      history: historyAppend,
      gaps: (measurement && measurement.gaps) || [],
    };
  }

  let currentMatchRate = measurement.matchRate;

  let iter = 0;
  while (currentMatchRate < target && iter < maxIter) {
    const iterStart = clock();
    const fix = await autoFixer(working, (measurement && measurement.gaps) || []);
    const fixedTaskIds = (fix && Array.isArray(fix.fixedTaskIds)) ? [...fix.fixedTaskIds] : [];
    const remeasure = await gapDetector(working);
    // A re-measure that produced nothing must not silently inherit the previous
    // iteration's number — that would report a stale score as if it were fresh.
    const newRate = isMeasured(remeasure) ? remeasure.matchRate : null;
    iter += 1;
    historyAppend.push({
      iteration: iter,
      matchRate: newRate,
      fixedTaskIds,
      durationMs: clock() - iterStart,
    });
    measurement = remeasure;
    if (newRate === null) {
      currentMatchRate = null;
      break;
    }
    currentMatchRate = newRate;
  }

  if (currentMatchRate === null) {
    const prevKpiB = (working && working.kpi) || {};
    const prevGatesB = (working && working.qualityGates) || {};
    const prevM1B = prevGatesB.M1_matchRate || { current: null, threshold: 90, passed: null };
    const updatedB = cloneSprint(working, {
      iterateHistory: historyAppend,
      kpi: {
        ...prevKpiB,
        matchRate: null,
        cumulativeIterations: (prevKpiB.cumulativeIterations || 0) + iter,
      },
      qualityGates: {
        ...prevGatesB,
        M1_matchRate: {
          current: null,
          threshold: prevM1B.threshold || 90,
          passed: false,
          measured: false,
          reason: 'unmeasured — a re-measurement during iterate produced no match rate',
        },
      },
    });
    return {
      ok: true,
      sprint: updatedB,
      finalMatchRate: null,
      measured: false,
      iterations: iter,
      blocked: true,
      history: historyAppend,
      gaps: (measurement && measurement.gaps) || [],
    };
  }

  const blocked = (currentMatchRate < minOk) && (iter >= maxIter);

  const prevKpi = (working && working.kpi) || {};
  const prevGates = (working && working.qualityGates) || {};
  const prevM1 = prevGates.M1_matchRate || { current: null, threshold: 90, passed: null };

  const updated = cloneSprint(working, {
    iterateHistory: historyAppend,
    kpi: {
      ...prevKpi,
      matchRate: currentMatchRate,
      cumulativeIterations: (prevKpi.cumulativeIterations || 0) + iter,
    },
    qualityGates: {
      ...prevGates,
      M1_matchRate: {
        current: currentMatchRate,
        threshold: prevM1.threshold || 90,
        passed: currentMatchRate >= (prevM1.threshold || 90),
        measured: true,
      },
    },
  });

  return {
    ok: true,
    sprint: updated,
    finalMatchRate: currentMatchRate,
    measured: true,
    iterations: iter,
    blocked,
    history: historyAppend,
  };
}

module.exports = {
  iterateSprint,
};
