'use strict';

/**
 * gap-detector.adapter.js — Sprint 2 deps.gapDetector production scaffold (v2.1.13 Sprint 5).
 *
 * Returns a function matching Sprint 2 iterate-sprint.usecase.js deps interface:
 *   async function gapDetector(sprint) -> { matchRate: number, gaps: Array }
 *
 * Three-tier strategy:
 *   1. No-op baseline (no agentTaskRunner injected): returns 100% matchRate.
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
 * @property {number} matchRate     - 0-100
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

function createGapDetector(opts) {
  const o = opts || {};

  if (typeof o.agentTaskRunner !== 'function') {
    return async function gapDetectorNoop(_sprint) {
      return { matchRate: 100, gaps: [] };
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
      return {
        matchRate: 0,
        gaps: [{ id: 'runner_error', severity: 'high', description: String(e && e.message ? e.message : e) }],
      };
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
  if (!result || typeof result.output !== 'string') {
    return {
      matchRate: 0,
      gaps: [{ id: 'no_output', severity: 'high', description: 'empty agent output' }],
    };
  }
  // Balanced-brace extraction (handles nested objects/arrays in JSON correctly)
  const block = extractBalancedJson(result.output);
  if (!block) {
    return {
      matchRate: 0,
      gaps: [{ id: 'parse_fail', severity: 'high', description: 'no JSON in output' }],
    };
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
      gaps: Array.isArray(parsed.gaps) ? parsed.gaps : [],
    };
  } catch (e) {
    return {
      matchRate: 0,
      gaps: [{ id: 'json_invalid', severity: 'high', description: 'JSON parse fail: ' + e.message }],
    };
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
