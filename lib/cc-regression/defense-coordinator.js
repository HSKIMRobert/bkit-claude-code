/**
 * Defense Coordinator — run active Guards against a PreToolUse context.
 *
 * Design Ref: bkit-v2110-integrated-enhancement.design.md §3.2.2
 * Plan SC: bkit never blocks regressions — attribution only.
 *
 * @module lib/cc-regression/defense-coordinator
 *
 * @version 2.1.12
 */

const enh262 = require('../domain/guards/enh-262-hooks-combo');
const enh263 = require('../domain/guards/enh-263-claude-write');
const enh254 = require('../domain/guards/enh-254-fork-precondition');
const { formatAttribution } = require('./attribution-formatter');

/**
 * Run all non-bypassed Guards against a unified context object.
 * Returns a list of attribution lines (never blocks).
 *
 * @param {Object} ctx - PreToolUse context (tool, envOverrides, permissionDecision, filePath, ...)
 * @returns {{ attributions: string[], metas: Object[] }}
 */
function checkCCRegression(ctx) {
  if (process.env.BKIT_CC_REGRESSION_BYPASS === '1') {
    return { attributions: [], metas: [] };
  }
  // null/non-object ctx guard: every Guard returns {hit:false} for non-objects
  // but we also short-circuit here to avoid touching properties.
  if (!ctx || typeof ctx !== 'object') {
    return { attributions: [], metas: [] };
  }

  const results = [];

  /*
   * ENH-471 (v2.1.37) — apply the lifecycle these guards already declare.
   *
   * Both ENH-262 and ENH-263 export `removeWhen(ccVersion)`, returning true from
   * CC v2.1.118 — the release each expected its regression to be fixed in. Until
   * now nothing called it, so on a current runtime (measured: v2.1.231) these
   * guards were still watching for regressions fixed 113 releases earlier. A
   * retirement predicate that nobody evaluates is a comment with a function
   * signature.
   *
   * This matters more from this release on. ENH-263's first condition is
   * `if (!ctx.bypassPermissions)`, and the flag was fed from a payload field CC
   * has never sent, so the guard could not fire at all. ENH-469 corrects that
   * source. Without this retirement check, correcting one dead thing would have
   * switched on another: attribution text blaming a CC regression that no longer
   * exists, which is worse than silence because it points the user at the wrong
   * component.
   *
   * The version arrives on the context rather than being detected here. This
   * module stays free of FS and subprocess work: `cc-version-checker.getCurrent()`
   * spawns `claude --version` with a 500 ms timeout, and a PreToolUse hook has a
   * 5 s budget for everything it does — spending a tenth of it to decide whether
   * to skip two pure predicates would be a poor trade. The hook scripts read the
   * cached version instead (see `readCachedVersion`).
   *
   * Unknown version → no guard is retired, which preserves today's behaviour.
   */
  const ccVersion = typeof ctx.ccVersion === 'string' ? ctx.ccVersion : null;
  const retired = (guard) => {
    try {
      return typeof guard.removeWhen === 'function' && ccVersion
        ? guard.removeWhen(ccVersion) === true
        : false;
    } catch (_) {
      return false; // a broken predicate must not silence a live guard
    }
  };

  // ENH-262 (Bash + dangerouslyDisableSandbox + allow)
  if (!retired(enh262)) {
    const r262 = enh262.check(ctx);
    if (r262.hit && r262.meta) results.push(r262.meta);
  }

  // ENH-263 (.claude/ write + bypassPermissions + allow)
  if (!retired(enh263)) {
    const r263 = enh263.check(ctx);
    if (r263.hit && r263.meta) results.push(r263.meta);
  }

  // Sprint 4.5: ENH-254 (fork precondition — Windows + disable-model-invocation, or missing FORK_SUBAGENT env)
  const r254 = enh254.check({
    skill: ctx.skill,
    context: ctx.context,
    platform: ctx.platform || process.platform,
    forkSubagentEnv: ctx.forkSubagentEnv,
    disableModelInvocation: ctx.disableModelInvocation,
  });
  if (r254.hit && r254.meta) results.push(r254.meta);

  return {
    metas: results,
    attributions: results.map((m) => formatAttribution(m)),
  };
}

/**
 * Emit attribution lines to stderr (used by pre-write.js).
 * @param {Object[]} metas
 */
function emitAttribution(metas) {
  if (!Array.isArray(metas) || metas.length === 0) return;
  for (const meta of metas) {
    // eslint-disable-next-line no-console
    console.warn(formatAttribution(meta));
  }
}

module.exports = { checkCCRegression, emitAttribution };
