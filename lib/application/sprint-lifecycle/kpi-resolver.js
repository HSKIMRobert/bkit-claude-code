'use strict';

/**
 * lib/application/sprint-lifecycle/kpi-resolver.js — v2.1.19 S3 F3-4 (closes #105)
 *
 * Pure compute resolver for the KPI Snapshot. Implements the
 *   qualityGates > featureMap > kpi
 * precedence chain (ADR S3-004). Used by both generateReport and
 * /sprint status — single source of truth.
 *
 * Master plan ref: docs/01-plan/features/v2119-bkit-quality-maturation.master-plan.md
 * pruge Issue ref: #105 (generateReport KPI inconsistency)
 *
 * @module application/sprint-lifecycle/kpi-resolver
 * @version 2.1.18
 */

/**
 * The value a present gate reports, honouring an explicit "not measured".
 *
 * `measured: false` alongside a non-null `current` is a stale number that a
 * later writer failed to clear. Reading `current` there would resurrect it —
 * the same fall-through this function exists to prevent, one field over. The
 * flag wins when it is present and false.
 *
 * @param {{current?: unknown, measured?: unknown}} gate
 * @returns {number|null}
 */
function gateValue(gate) {
  if (!gate || gate.measured === false) return null;
  return gate.current ?? null;
}

/**
 * Resolve KPI Snapshot fields from a sprint state, applying precedence:
 *   qualityGates > featureMap > kpi (legacy)
 *
 * @param {object} sprint - Sprint state object (from .bkit/state/sprints/<id>.json)
 * @returns {object|null}
 */
function resolveKpi(sprint) {
  if (!sprint || typeof sprint !== 'object') return null;
  const qg = sprint.qualityGates || {};
  const fm = sprint.featureMap || {};
  const kpi = sprint.kpi || {};

  const featuresArray = Object.values(fm);
  const completedFromFeatureMap = featuresArray.filter(f => f && f.completion).length;

  return {
    /*
     * v2.1.34 — "the gate is absent" and "the gate says nothing was measured"
     * are different facts, and pickFirst collapsed them.
     *
     * Once an unmeasured gate began recording  (rather than the
     * fabricated 100 it used to record), this line started falling through to
     *  — the legacy mirror — and resurrecting whatever stale
     * number was last written there. The release that made the gate fail closed
     * would have re-opened it one layer up.
     *
     * A gate object that exists is authoritative, including when what it says
     * is "not measured". Only a MISSING gate falls back to the legacy field.
     */
    matchRate: qg.M1_matchRate
      ? gateValue(qg.M1_matchRate)
      : pickFirst(kpi.matchRate, null),
    criticalIssues: pickFirst(qg.M3_criticalIssueCount && qg.M3_criticalIssueCount.current, kpi.criticalIssues, 0),
    // Same rule as matchRate above: a present gate speaks for itself.
    dataFlowIntegrity: qg.S1_dataFlowIntegrity
      ? gateValue(qg.S1_dataFlowIntegrity)
      : pickFirst(kpi.dataFlowIntegrity, null),
    featuresCompleted: (completedFromFeatureMap > 0 || featuresArray.length > 0) ? completedFromFeatureMap : (kpi.featuresCompleted || 0),
    featuresTotal: (sprint.features || []).length,
    cumulativeIterations: (sprint.iterateHistory || []).length || kpi.cumulativeIterations || 0,
    cumulativeTokens: kpi.cumulativeTokens || 0,
    qaPassRate: pickFirst(kpi.qaPassRate, null), // no qualityGates field for this yet
  };
}

/**
 * Detect divergences between sprint.kpi (legacy) and sprint.qualityGates (SoT).
 * Emits no audit — caller (generateReport) handles emission.
 *
 * @param {object} sprint
 * @returns {Array<{field: string, kpi: any, qualityGates: any}>}
 */
function detectDivergences(sprint) {
  if (!sprint || typeof sprint !== 'object') return [];
  const qg = sprint.qualityGates || {};
  const kpi = sprint.kpi || {};
  const divergences = [];

  const pairs = [
    ['matchRate', kpi.matchRate, qg.M1_matchRate && qg.M1_matchRate.current],
    ['criticalIssues', kpi.criticalIssues, qg.M3_criticalIssueCount && qg.M3_criticalIssueCount.current],
    ['dataFlowIntegrity', kpi.dataFlowIntegrity, qg.S1_dataFlowIntegrity && qg.S1_dataFlowIntegrity.current],
  ];
  for (const [field, kpiVal, qgVal] of pairs) {
    if (kpiVal != null && qgVal != null && kpiVal !== qgVal) {
      divergences.push({ field, kpi: kpiVal, qualityGates: qgVal });
    }
  }
  return divergences;
}

function pickFirst(...vals) {
  for (const v of vals) {
    if (v !== null && v !== undefined) return v;
  }
  return null;
}

module.exports = { resolveKpi, detectDivergences };
