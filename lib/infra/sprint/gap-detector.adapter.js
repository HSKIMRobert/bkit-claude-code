'use strict';

const forkModeAdvisory = require('../../domain/policy/fork-mode-advisory');

/**
 * gap-detector.adapter.js — Sprint 2 deps.gapDetector production scaffold (v2.1.13 Sprint 5).
 *
 * Returns a function matching Sprint 2 iterate-sprint.usecase.js deps interface:
 *   async function gapDetector(sprint) -> { matchRate: number, gaps: Array }
 *
 * Three-tier strategy:
 *   1. Unwired baseline (no agentTaskRunner injected): reports NO measurement
 *      (matchRate null, measured false) — never a passing score.
 *   2. Real scaffold (agentTaskRunner injected): invokes agents/gap-detector.md via Task tool.
 *
 * Integration point (Sprint 6 or v2.1.14):
 *   Wire `agentTaskRunner` so it calls the actual Claude Code Task tool with
 *   subagent_type 'gap-detector'. Until then, default no-op preserves
 *   sprint iteration loop without false gap reports.
 *
 * Sprint 5 use case (consumer):
 *
 *   const infra = require('lib/infra/sprint');
 *   const gapDetector = infra.createGapDetector({ projectRoot });
 *   const lifecycle = require('lib/application/sprint-lifecycle');
 *   await lifecycle.iterateSprint(sprint, { gapDetector });
 *
 * @module lib/infra/sprint/gap-detector.adapter
 * @version 2.1.13
 * @since 2.1.13
 */

/**
 * @typedef {Object} GapDetectorOpts
 * @property {string} projectRoot
 * @property {(req:{subagent_type:string, prompt:string}) => Promise<{output:string}>} [agentTaskRunner]
 * @property {() => number} [clock]
 */

/**
 * @typedef {Object} GapResult
 * @property {number|null} matchRate - 0-100, or null when nothing was measured
 * @property {boolean} measured      - false only when no comparison ran at all
 * @property {Array<{id:string, severity:string, description:string}>} gaps
 */

/**
 * Factory — produces a function matching deps.gapDetector signature.
 *
 * @param {GapDetectorOpts} [opts]
 * @returns {(sprint:object) => Promise<GapResult>}
 */
/**
 * Coerce an agent-reported match rate into a usable 0..100 number (ENH-412).
 *
 * Anything that is not a finite number — NaN, Infinity, a string, undefined —
 * means the run did not produce a measurement, which is 0, not a pass.
 * Finite values are clamped into range so an implausible figure cannot clear a
 * threshold it never earned.
 *
 * @param {unknown} value
 * @returns {number} 0..100
 */
function toMatchRate(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}

/**
 * The result returned when no measurement could be taken at all.
 *
 * v2.1.34: this used to be `{ matchRate: 100, gaps: [] }`. An absent runner is
 * the one condition under which bkit knows *nothing* about the code, and it
 * reported a perfect score — reproduced in an empty directory, with no design
 * document and no implementation, where `/sprint iterate` returned
 * `M1_matchRate: { current: 100, passed: true }`. The product's headline gate
 * certified a feature that did not exist.
 *
 * `matchRate: null` + `measured: false` is the honest encoding: not a score of
 * zero (which would claim we looked and found nothing matching), but the
 * absence of a measurement. `measure-router.js` already failed closed on this
 * exact missing dependency with `no_agent_runner`; this aligns the two paths.
 *
 * ENH-476 (v2.1.37) widened this from the missing-runner case to every case
 * where nothing usable came back. Those paths returned `matchRate: 0,
 * measured: true`, which is two claims, and both were wrong: that a comparison
 * ran, and that it found a 0% match. It also had a cost beyond the wrong number.
 * `isMeasured()` in iterate-sprint.usecase.js accepts any finite matchRate, so 0
 * looked like a real measurement and the iterate loop ran auto-fix up to
 * maxIterations against a "gap" list whose single entry was `parse_fail` —
 * exactly the waste the use case's own comment warns about ("auto-fixing against
 * gaps nobody detected would burn maxIterations of agent work and still end with
 * nothing measured"). Reported honestly, that branch exits at once and still
 * fails the gate: `M1_matchRate.passed` is set to `false`, not `null`, so
 * QUALITY_GATE_FAIL fires and the phase stays blocked.
 *
 * A parsed number that is merely implausible is NOT routed here. That is
 * ENH-412's territory and its ruling stands: a comparison did run, so an
 * unusable figure reads as 0, the failing end, never as a pass.
 *
 * @param {string} id - gap id identifying which way it failed
 * @param {string} reason
 * @returns {GapResult}
 */
function unmeasured(id, reason) {
  return {
    matchRate: null,
    measured: false,
    gaps: [{ id: id, severity: 'high', description: reason }],
  };
}

/**
 * ENH-475 (v2.1.37) — see lib/domain/policy/fork-mode-advisory.js for why an
 * empty subagent result is reported with fork mode named as a lead rather than
 * as "no JSON in output". The environment is passed explicitly so the policy
 * stays pure.
 *
 * @param {string} base
 * @returns {string}
 */
function withForkModeHint(base) {
  return forkModeAdvisory.withForkModeHint(base, process.env);
}

function createGapDetector(opts) {
  const o = opts || {};

  if (typeof o.agentTaskRunner !== 'function') {
    return async function gapDetectorUnwired(_sprint) {
      return unmeasured(
        'no_agent_runner',
        'No agentTaskRunner was injected, so no design-vs-implementation ' +
          'comparison ran. Match rate is unknown, not 100. The subprocess CLI ' +
          'path cannot reach the Task tool; a composition root in the main ' +
          'session must supply the runner via createTaskToolRunner().'
      );
    };
  }

  return async function gapDetectorReal(sprint) {
    const phaseInfo = sprint && sprint.phase ? sprint.phase : 'unknown';
    const sprintId = sprint && sprint.id ? sprint.id : 'unknown';
    const prompt = [
      'Detect gaps in sprint ' + sprintId + ' at phase ' + phaseInfo + '.',
      'Compare design/plan vs current implementation.',
      'Return JSON: { "matchRate": <0-100>, "gaps": [{"id":"...","severity":"low|medium|high","description":"..."}] }',
    ].join('\n');

    try {
      const result = await o.agentTaskRunner({
        subagent_type: 'gap-detector',
        prompt: prompt,
      });
      return parseGapDetectorOutput(result);
    } catch (e) {
      return unmeasured(
        'runner_error',
        'The gap-detector subagent could not be run, so nothing was compared: '
          + String(e && e.message ? e.message : e)
      );
    }
  };
}

/**
 * Parse gap-detector agent output (best-effort JSON extraction).
 *
 * @param {{output?:string}} result
 * @returns {GapResult}
 */
function parseGapDetectorOutput(result) {
  if (!result || typeof result.output !== 'string' || result.output.trim() === '') {
    return unmeasured('no_output', withForkModeHint(
      'The gap-detector subagent returned no output, so nothing was compared.'));
  }
  // Balanced-brace extraction (handles nested objects/arrays in JSON correctly)
  const block = extractBalancedJson(result.output);
  if (!block) {
    return unmeasured('parse_fail', withForkModeHint(
      'The gap-detector subagent returned output containing no JSON object, so no '
      + 'match rate could be read and nothing was compared.'));
  }
  try {
    const parsed = JSON.parse(block);
    return {
      /*
       * ENH-412 (v2.1.33): a match rate that is not a usable number is 0.
       *
       * This read `typeof parsed.matchRate === 'number'`, which admits NaN,
       * Infinity and out-of-range values, because `typeof NaN === 'number'` is
       * true. NaN is the dangerous one: it does not fail the gate, it makes the
       * gate undecidable. Both `matchRate >= 90` and `matchRate < 90` evaluate
       * false, so a workflow that branches on either comparison falls through
       * every check. This value drives the iterate loop's exit condition,
       * `kpi.matchRate`, and `qualityGates.M1_matchRate.passed` — the gate bkit
       * is built around.
       *
       * A gap-detector run that cannot report a number has not measured
       * anything, and "not measured" must read as 0 (the failing end), never as
       * a pass. Values above 100 are clamped rather than trusted: a
       * hallucinated 999 would otherwise clear every threshold at once.
       */
      matchRate: toMatchRate(parsed.matchRate),
      measured: true,
      gaps: Array.isArray(parsed.gaps) ? parsed.gaps : [],
    };
  } catch (e) {
    return unmeasured('json_invalid',
      'The gap-detector subagent returned a JSON-shaped block that does not parse, '
      + 'so no match rate could be read and nothing was compared: ' + e.message);
  }
}

/**
 * Extract the first balanced JSON object from a string (string-aware).
 * Walks through the input, tracking brace depth and respecting string boundaries.
 *
 * @param {string} text
 * @returns {string|null} - The matched JSON substring, or null if no balanced object found.
 */
function extractBalancedJson(text) {
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (escape) { escape = false; continue; }
    if (c === '\\' && inString) { escape = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

module.exports = {
  createGapDetector: createGapDetector,
  parseGapDetectorOutput: parseGapDetectorOutput,
};
