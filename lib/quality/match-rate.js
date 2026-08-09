/**
 * Match Rate — three states, not two (v2.1.34)
 *
 * A design-implementation match rate is `pass`, `fail`, or **`unmeasured`**.
 * Collapsing the third into either of the first two is the defect this release
 * exists to remove, and it reappeared the moment the sprint adapter started
 * returning `null` instead of a fabricated `100`:
 *
 *   scripts/unified-stop.js       `matchRate >= 90 ? 'gate_pass' : 'gate_fail'`
 *                                 recorded a trust-lowering FAILURE for a
 *                                 measurement that never ran.
 *   lib/pdca/automation.js        `ctx.matchRate < 90` is true for null, so an
 *                                 unmeasured feature was routed to auto-repair
 *                                 with "Check below threshold".
 *   lib/quality/gate-manager.js   a missing metric made the condition simply
 *                                 unsatisfied, so the report-phase hard-fail
 *                                 rule never fired and the gate passed —
 *                                 fail-open, in the opposite direction.
 *
 * All three are the same mistake: `null` compared against a number silently
 * picks a side. This module makes the choice explicit at every call site.
 *
 * @module lib/quality/match-rate
 * @version 2.1.34
 * @since 2.1.34
 */

'use strict';

/** @typedef {'pass'|'fail'|'unmeasured'} MatchRateVerdict */

/**
 * Did a measurement actually produce this number?
 *
 * `null`, `undefined`, `NaN` and `Infinity` all mean "no measurement". NaN is
 * the dangerous one: `typeof NaN === 'number'` is true, and both `NaN >= 90`
 * and `NaN < 90` are false, so a NaN makes a gate undecidable rather than
 * failing it.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isMeasured(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Grade a match rate into one of three verdicts.
 *
 * @param {unknown} value
 * @param {number} [threshold=90]
 * @returns {MatchRateVerdict}
 */
function classify(value, threshold = 90) {
  if (!isMeasured(value)) return 'unmeasured';
  return value >= threshold ? 'pass' : 'fail';
}

/**
 * Should the workflow be allowed to advance on this match rate?
 *
 * `unmeasured` blocks. bkit cannot certify code it never compared, and treating
 * absence of evidence as permission is exactly how `/sprint iterate` came to
 * report a perfect score for a feature that did not exist.
 *
 * @param {unknown} value
 * @param {number} [threshold=90]
 * @returns {boolean}
 */
function allowsAdvance(value, threshold = 90) {
  return classify(value, threshold) === 'pass';
}

/**
 * Is this a MEASURED failure — as opposed to no measurement at all?
 *
 * Use this wherever a low rate triggers a consequence the user pays for:
 * auto-repair cycles, a trust-score penalty, a gate-fail report. An unmeasured
 * rate earns none of those, because nothing was found wanting.
 *
 * @param {unknown} value
 * @param {number} [threshold=90]
 * @returns {boolean}
 */
function isMeasuredFailure(value, threshold = 90) {
  return classify(value, threshold) === 'fail';
}

/**
 * Render for a human, without inventing a number.
 *
 * @param {unknown} value
 * @returns {string}
 */
function format(value) {
  return isMeasured(value) ? `${value}%` : 'not measured';
}

module.exports = {
  isMeasured,
  classify,
  allowsAdvance,
  isMeasuredFailure,
  format,
};
