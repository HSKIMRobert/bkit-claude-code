'use strict';

/**
 * fork-mode-advisory.js — name fork mode when it is the likely reason a
 * subagent came back with nothing.
 *
 * ENH-475 (v2.1.37).
 *
 * Claude Code v2.1.232 turns fork mode on by default in interactive sessions.
 * Two consequences land on bkit at once (code.claude.com/docs/en/sub-agents,
 * "Turn fork mode on or off"):
 *
 *   - "Claude Code also removes the Agent tool's `run_in_background` parameter,
 *     so Claude can't ask for the foreground." (:1064)
 *   - "A background subagent's results reach Claude as a completion notification
 *     in a later turn." (:802)
 *
 * bkit's five sprint spawn sites all await a subagent result inside the turn
 * that spawned it. Under fork mode that await returns before the agent has
 * finished, so what reaches the parser is empty — and every one of those sites
 * reported the symptom ("no JSON in output", "empty agent output"), which sends
 * the reader hunting for a formatting bug in an agent that never spoke.
 *
 * This is phrased as a lead, not a diagnosis, and that distinction is load-
 * bearing: bkit cannot observe whether fork mode is on. No hook payload field
 * carries it (see lib/domain/ports/cc-payload.port.js for the measured key set),
 * and the flag Claude Code uses internally is not exposed. Asserting a cause we
 * cannot check would be the same class of mistake as the symptom-only message it
 * replaces.
 *
 * What CAN be checked is whether the user has already turned it off. Both
 * mitigations below are documented Claude Code behaviour, not inference:
 *
 *   - CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1 — foreground "in every kind of
 *     session and whether or not fork mode is on" (sub-agents.md:795)
 *   - CLAUDE_CODE_FORK_SUBAGENT=0 — fork mode off, so Claude "runs the subagent
 *     ... in the foreground when it needs the result before continuing" (:798)
 *
 * When either is set, the hint is suppressed: fork mode is not the answer, and
 * offering it would send the reader down a dead end.
 *
 * Pure — the environment is a parameter, never read from `process` here, so this
 * stays in the domain layer and stays testable without env mutation.
 *
 * @module lib/domain/policy/fork-mode-advisory
 * @version 2.1.37
 * @since 2.1.37
 */

/**
 * Environment settings that genuinely remove the fork-mode effect.
 * Each is traceable to a documented Claude Code behaviour; do not add a value
 * here that has not been read out of the docs or measured.
 */
const MITIGATIONS = Object.freeze([
  Object.freeze({ name: 'CLAUDE_CODE_FORK_SUBAGENT', values: Object.freeze(['0', 'false']) }),
  Object.freeze({ name: 'CLAUDE_CODE_DISABLE_BACKGROUND_TASKS', values: Object.freeze(['1', 'true']) }),
]);

/** The first Claude Code version whose interactive default turns fork mode on. */
const FORK_DEFAULT_FROM = '2.1.232';

/**
 * Is a mitigation already in effect?
 *
 * @param {Record<string, string|undefined>} [env]
 * @returns {boolean}
 */
function forkModeMitigated(env) {
  const source = env || {};
  for (const gate of MITIGATIONS) {
    const actual = source[gate.name];
    if (actual !== undefined && gate.values.includes(String(actual).trim().toLowerCase())) {
      return true;
    }
  }
  return false;
}

/**
 * Append the fork-mode lead to a factual message, unless already mitigated.
 *
 * The caller supplies the factual half — what bkit observed — and this adds the
 * likely upstream reason and the remedy. Callers that describe a DIFFERENT
 * failure shape (a runner that threw, a dependency that was never injected)
 * must not use this: fork mode produces empty output, not an exception, and
 * attaching the lead there would be a guess dressed as a diagnosis.
 *
 * @param {string} base - what actually happened, stated plainly
 * @param {Record<string, string|undefined>} [env] - defaults to no mitigation
 * @returns {string}
 */
function withForkModeHint(base, env) {
  if (forkModeMitigated(env)) return base;
  return base
    + ` If this session is running on Claude Code v${FORK_DEFAULT_FROM} or later,`
    + ' fork mode is on by default and subagents report back in a later turn'
    + ' rather than within the turn that spawned them, which arrives here as'
    + ' empty output. Set CLAUDE_CODE_FORK_SUBAGENT=0 to run this subagent in'
    + ' the foreground.';
}

module.exports = {
  FORK_DEFAULT_FROM,
  MITIGATIONS,
  forkModeMitigated,
  withForkModeHint,
};
