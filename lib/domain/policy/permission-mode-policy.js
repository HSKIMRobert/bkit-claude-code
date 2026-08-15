/**
 * Permission-mode policy — may a decision be emitted, given the host's mode?
 *
 * Design Ref: v2137-permission-mode.design.en.md §2.2
 * Plan SC: FR-2, FR-3, FR-4, FR-5 (ENH-466)
 *
 * WHY THIS EXISTS
 *
 * Claude Code sends `permission_mode` on every hook event. Through v2.1.36 bkit
 * read it in zero places — `grep -rn "permission_mode" scripts lib hooks` came
 * back empty — so all ten of bkit's decision surfaces behaved identically
 * whether the user had asked for maximum oversight or had explicitly turned
 * confirmation off with `--dangerously-skip-permissions`.
 *
 * That is not a Claude Code defect. PreToolUse hooks run BEFORE the permission
 * prompt, so a hook decision is not something `bypassPermissions` can bypass;
 * the host is behaving exactly as documented. bkit was the component ignoring
 * stated intent, and it reinstated a confirmation step the user had disabled.
 * Measured on CC v2.1.231: a minimal hook returning `ask`, with no bkit present,
 * stopped a bare `echo` under `--dangerously-skip-permissions`.
 *
 * The cost is not annoyance. A PreToolUse question needs a human answer, and an
 * unattended run has nobody to give one, so the agent STALLS rather than fails —
 * external issue #148 recorded ~15 minutes of dead time per incident, twice in
 * one sprint, noticed only because an idle-stall monitor happened to be attached.
 *
 * WHAT IS AND IS NOT RELAXED
 *
 * The boundary is the decision's GRADE, never the mode alone. A question may be
 * skipped; a refusal may not. `critical` covers shapes that are dangerous no
 * matter who is watching, and `policy` covers the user's own written rules and
 * path-security boundaries — neither is reachable by any mode. Claude Code makes
 * the same distinction: even in `bypassPermissions` it keeps a circuit breaker on
 * removals targeting `/` and `~`. bkit has no reason to be looser than its host.
 *
 * This module adds no off-switch. ADR 0016 and IV-09 still hold: the Destructive
 * Detector cannot be disabled at runtime, and nothing here changes that.
 *
 * Pure domain function — no FS, no network, no child_process.
 *
 * @module lib/domain/policy/permission-mode-policy
 *
 * @version 2.1.37
 * @since 2.1.37
 */

/**
 * The permission modes Claude Code documents and delivers.
 *
 * Verified by measurement rather than by reading: a hook that dumps its stdin was
 * run headless once per mode on CC v2.1.231, and each returned its own name
 * verbatim. `--dangerously-skip-permissions` produces `bypassPermissions`.
 *
 * `auto` is in this list on the strength of the documentation only — it requires
 * account eligibility this project could not obtain, so it was never observed on
 * the wire. That gap is why it is treated conservatively below.
 *
 * @type {readonly string[]}
 */
const PERMISSION_MODES = Object.freeze([
  'default',
  'plan',
  'acceptEdits',
  'auto',
  'dontAsk',
  'bypassPermissions',
]);

/**
 * Decision grades. A property of the finding, not of the mode.
 *
 * @type {readonly string[]}
 */
const DECISION_GRADES = Object.freeze(['critical', 'policy', 'ask']);

/**
 * The modes in which raising a confirmation reaches nobody.
 *
 * - `bypassPermissions` — the user disabled permission prompts outright. This is
 *   the case that was reported.
 * - `dontAsk` — documented as auto-denying every call that would otherwise
 *   prompt. A bkit `ask` here is not a question; it is a refusal with no recourse,
 *   which is the opposite of what the ask tier was built for (v2.1.34 D9).
 * - `acceptEdits` — maintainer decision D2. Note that suppressing bkit's question
 *   does not leave the call unsupervised: `acceptEdits` auto-approves file edits
 *   and common filesystem commands only, and Claude Code still applies its own
 *   prompt policy to everything else. bkit stops adding a second question on top
 *   of the host's, and nothing more.
 *
 * `auto` is deliberately absent. It was not measurable here, and the classifier
 * that reviews commands in that mode implies someone chose supervision rather
 * than the absence of it. Guessing in the permissive direction on an unmeasured
 * mode is how a guard quietly stops guarding.
 *
 * @type {readonly string[]}
 */
const ASK_SUPPRESSING_MODES = Object.freeze([
  'acceptEdits',
  'dontAsk',
  'bypassPermissions',
]);

/**
 * Normalize whatever the host sent into a mode this module can reason about.
 *
 * Absent or unrecognized input resolves to `default`, which emits everything —
 * the behaviour bkit had before this module existed. That matters beyond
 * tidiness: bkit's runtime floor is CC 2.1.78, and this project could not
 * establish when `permission_mode` was introduced. A binary probe found the field
 * in v2.1.227/228/231 but also found no occurrence of the control marker
 * `hook_event_name` in v2.1.226, whose payload is packed differently — so the
 * probe says nothing at all about older builds and no floor may be claimed from
 * it. Treating absence as "unknown, change nothing" is the same fail-safe already
 * used for `background_tasks` in lib/core/io.js.
 *
 * `manual` is accepted as an alias for `default`: Claude Code renames the mode to
 * "Manual" in its UI from v2.1.200 and accepts `manual` wherever the value is
 * typed, while the config value hooks receive stays `default`. Mapping it costs
 * one line and removes a way for a future rename to silently disable this policy.
 *
 * @param {unknown} raw - value of `permission_mode` from the hook payload
 * @returns {string} one of PERMISSION_MODES
 */
function normalizeMode(raw) {
  if (typeof raw !== 'string') return 'default';
  const trimmed = raw.trim();
  if (trimmed === 'manual') return 'default';
  return PERMISSION_MODES.includes(trimmed) ? trimmed : 'default';
}

/**
 * Decide whether a decision of this grade may be emitted in this mode.
 *
 * An unrecognized grade resolves to `critical`, i.e. it is emitted. A caller that
 * mislabels a finding should end up over-reporting, never under-reporting — the
 * failure direction has to be the safe one, because this function is the last
 * thing standing between a guard and silence.
 *
 * @param {{ mode?: unknown, grade?: unknown }} input
 * @returns {{ emit: boolean, mode: string, grade: string, reason: string }}
 */
function resolve(input) {
  const source = (input && typeof input === 'object') ? input : {};
  const mode = normalizeMode(source.mode);
  const grade = DECISION_GRADES.includes(source.grade) ? source.grade : 'critical';

  if (grade !== 'ask') {
    return {
      emit: true,
      mode,
      grade,
      reason: `${grade} decisions are emitted in every permission mode`,
    };
  }

  if (ASK_SUPPRESSING_MODES.includes(mode)) {
    return {
      emit: false,
      mode,
      grade,
      reason: `permission_mode is "${mode}", in which a confirmation request reaches nobody`,
    };
  }

  return {
    emit: true,
    mode,
    grade,
    reason: `permission_mode is "${mode}", in which a confirmation request can still be answered`,
  };
}

/**
 * Convenience predicate for the common case.
 *
 * @param {unknown} rawMode - value of `permission_mode` from the hook payload
 * @returns {boolean} true when an ask-grade decision would reach nobody
 */
function isAskSuppressed(rawMode) {
  return resolve({ mode: rawMode, grade: 'ask' }).emit === false;
}

module.exports = {
  PERMISSION_MODES,
  DECISION_GRADES,
  ASK_SUPPRESSING_MODES,
  normalizeMode,
  resolve,
  isAskSuppressed,
};
