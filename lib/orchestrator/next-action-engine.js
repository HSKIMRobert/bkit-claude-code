/**
 * Next Action Engine — unified Next-Action hint generator for Stop-family hooks.
 *
 * Sprint 7c (v2.1.10): Stop/SubagentStop/SessionEnd의 모든 경로에서 사용자에게
 * "다음 단계 `/pdca X`"를 제안하는 표준 포맷 생성.
 *
 * 기존에는 scripts/pdca-skill-stop.js 만 Next Action 완비. unified-stop.js 기본
 * 경로와 session-end-handler.js, subagent-stop-handler.js는 Next Action 부재.
 * 본 모듈은 그 gap을 일관된 hint 생성기로 메움.
 *
 * Design Ref: bkit-v2110-orchestration-integrity.design.md §3.3.5
 * Plan SC: G-J-05/06/07
 *
 * @module lib/orchestrator/next-action-engine
 *
 * @version 2.1.12
 */

const PHASE_NEXT_SKILL = Object.freeze({
  pm: (f) => `/pdca plan ${f || ''}`.trim(),
  plan: (f) => `/pdca design ${f || ''}`.trim(),
  design: (f) => `/pdca do ${f || ''}`.trim(),
  do: (f) => `/pdca analyze ${f || ''}`.trim(),
  check: (f) => `/pdca iterate ${f || ''}`.trim(),
  act: (f) => `/pdca analyze ${f || ''}`.trim(),
  qa: (f) => `/pdca report ${f || ''}`.trim(),
  report: (f) => `/pdca archive ${f || ''}`.trim(),
  archived: () => null,
});

// v2.1.13 Sprint Management: Sprint 8-phase next-action table (관점 1-1 A4).
// Sprint phase enum: prd → plan → design → do → iterate → qa → report → archived.
const SPRINT_PHASE_NEXT_SKILL = Object.freeze({
  prd: (id) => `/sprint phase ${id || ''} --to plan`.trim(),
  plan: (id) => `/sprint phase ${id || ''} --to design`.trim(),
  design: (id) => `/sprint phase ${id || ''} --to do`.trim(),
  do: (id) => `/sprint phase ${id || ''} --to iterate`.trim(),
  iterate: (id) => `/sprint phase ${id || ''} --to qa`.trim(),
  qa: (id) => `/sprint phase ${id || ''} --to report`.trim(),
  report: (id) => `/sprint archive ${id || ''}`.trim(),
  archived: () => null,
});

/**
 * Generate a phase-based next command string.
 *
 * v2.1.13: When ctx.sprintId is provided, route to SPRINT_PHASE_NEXT_SKILL
 * (8-phase) instead of PDCA's PHASE_NEXT_SKILL (9-phase). Phase enums overlap
 * on plan/design/do/qa/report but differ on prd/iterate/archived vs pm/check/
 * act/archive — caller must specify intent via sprintId presence.
 *
 * @param {string} phase
 * @param {string} [feature]      PDCA feature id (default mode)
 * @param {object} [opts]
 * @param {string} [opts.sprintId] Sprint id — when present, use Sprint table
 * @returns {string|null}
 */
/**
 * The phase of the primary feature on a PDCA status object.
 *
 * v2.1.34. Callers here read `status.currentPhase` — a v1 schema key the v3
 * migration removed. It does not throw, it is `undefined`, so every
 * `if (phase && feature)` below was permanently false and the hint each one
 * guards was never produced. In each case the very next line read
 * `primaryFeature` correctly, which is how the pair survived review: one half
 * of it worked.
 *
 * @param {{primaryFeature?: string, features?: Object}|null|undefined} status
 * @returns {string|null}
 */
function phaseOf(status) {
  const feature = status && status.primaryFeature;
  if (!feature) return null;
  const entry = status.features && status.features[feature];
  return (entry && entry.phase) || null;
}

function generatePhaseNext(phase, feature, opts) {
  if (opts && typeof opts.sprintId === 'string' && opts.sprintId.length > 0) {
    const gen = SPRINT_PHASE_NEXT_SKILL[phase];
    if (typeof gen !== 'function') return null;
    return gen(opts.sprintId) || null;
  }
  const gen = PHASE_NEXT_SKILL[phase];
  if (typeof gen !== 'function') return null;
  return gen(feature) || null;
}

/**
 * Build a single-line user-facing suggestion message.
 * @param {object} ctx  { activeSkill?, activeAgent?, pdcaStatus?, advanceMode? }
 * @returns {string|null}
 */
function generateGeneric(ctx = {}) {
  /*
   * v2.1.13: Sprint context takes precedence when sprintStatus is set.
   *
   * v2.1.34 note — NOTHING SETS IT. `ctx.sprintStatus` has no producer anywhere
   * in the repository: the four callers of this module
   * (scripts/unified-stop.js, session-end-handler.js, subagent-stop-handler.js,
   * user-prompt-handler.js) pass `pdcaStatus` and never a sprint. The branch is
   * unreachable, and its field names disagree with the sprint entity besides —
   * that carries `phase` and `id`, not `currentPhase` and `sprintId`.
   *
   * Left in place rather than deleted or quietly "fixed": wiring a caller is a
   * feature decision, and renaming the fields would make dead code look alive
   * without making it run. `test/contract/state-schema-keys.test.js` records
   * that this is known, so it cannot be mistaken for working behaviour.
   *
   * A sprint phase is not a PDCA phase, so it routes via the SPRINT table.
   */
  if (ctx.sprintStatus && ctx.sprintStatus.currentPhase && ctx.sprintStatus.sprintId) {
    const cmd = generatePhaseNext(
      ctx.sprintStatus.currentPhase,
      null,
      { sprintId: ctx.sprintStatus.sprintId }
    );
    if (cmd) {
      const mode = ctx.advanceMode || 'soft';
      const marker = mode === 'auto' ? '[AUTO]' : mode === 'gate' ? '[GATE]' : '[SUGGEST]';
      return `${marker} Next sprint action: ${cmd}`;
    }
  }
  const phase = phaseOf(ctx.pdcaStatus);
  const feature = ctx.pdcaStatus && ctx.pdcaStatus.primaryFeature;
  if (phase && feature) {
    const cmd = generatePhaseNext(phase, feature);
    if (cmd) {
      const mode = ctx.advanceMode || 'soft';
      const marker = mode === 'auto' ? '[AUTO]' : mode === 'gate' ? '[GATE]' : '[SUGGEST]';
      return `${marker} Next action: ${cmd}`;
    }
  }
  if (ctx.activeSkill === 'pdca' || ctx.activeSkill === 'bkit:pdca') {
    return '[SUGGEST] Continue PDCA cycle: /pdca next  |  /pdca status';
  }
  if (ctx.activeSkill === 'sprint' || ctx.activeSkill === 'bkit:sprint') {
    return '[SUGGEST] Continue sprint cycle: /sprint status  |  /sprint list';
  }
  return null;
}

/**
 * Build a SessionEnd-specific next-action hint.
 * @param {object} ctx
 * @returns {string|null}
 */
function generateSessionEnd(ctx = {}) {
  const phase = phaseOf(ctx.pdcaStatus);
  const feature = ctx.pdcaStatus && ctx.pdcaStatus.primaryFeature;
  if (phase && feature) {
    return `[RESUME] When resuming, continue with: ${generatePhaseNext(phase, feature) || '/pdca status'}`;
  }
  return '[RESUME] Tip: use /pdca status on resume to see any in-progress feature.';
}

/**
 * Build a SubagentStop next-action hint.
 * @param {object} ctx
 * @returns {string|null}
 */
function generateSubagentStop(ctx = {}) {
  const { agentName, status, pdcaStatus } = ctx;
  const phase = phaseOf(pdcaStatus);
  const feature = pdcaStatus && pdcaStatus.primaryFeature;
  if (status === 'failed') {
    return `[SUGGEST] Sub-agent ${agentName || 'unknown'} failed. Check /pdca status, then /pdca iterate ${feature || ''}`.trim();
  }
  if (phase && feature) {
    const cmd = generatePhaseNext(phase, feature);
    if (cmd) return `[SUGGEST] Sub-agent ${agentName || 'unknown'} completed. Next: ${cmd}`;
  }
  return null;
}

/**
 * Structured suggestions array for user-prompt-handler's hookSpecificOutput.
 * Consumers may render these as chips/buttons in clients that support them.
 * @param {object[]} routed  IntentRouter output
 * @returns {object[]}
 */
function toStructuredSuggestions(routed) {
  if (!Array.isArray(routed)) return [];
  return routed
    .filter((r) => r && r.name)
    .map((r) => ({
      type: r.type || 'skill',
      name: r.name,
      args: r.args || null,
      confidence: typeof r.confidence === 'number' ? r.confidence : null,
      rationale: r.rationale || null,
    }));
}

module.exports = {
  PHASE_NEXT_SKILL,
  SPRINT_PHASE_NEXT_SKILL, // v2.1.13
  generatePhaseNext,
  generateGeneric,
  generateSessionEnd,
  generateSubagentStop,
  toStructuredSuggestions,
};
