/**
 * preflight.js — SessionStart preflight checks (FR-α4 + FR-α5)
 *
 * Two warnings rendered into additionalContext, in order:
 *   1. Agent Teams env (FR-α4): warns when CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS != "1"
 *   2. CC version (FR-α5):     warns when current CC < recommended (or < min)
 *
 * Fail-open: any internal error returns an empty section. The hook never blocks
 * the user's session because of preflight checks.
 *
 * @module hooks/startup/preflight
 * @version 2.1.11
 * @since 2.1.11
 */

const { debugLog } = require('../../lib/core/debug');

const AGENT_TEAMS_ENV = 'CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS';

/**
 * Inspect the Agent Teams env var.
 *
 * @returns {{active: boolean, warning: string | null}}
 */
function checkAgentTeamsEnv() {
  const active = process.env[AGENT_TEAMS_ENV] === '1';
  if (active) return { active: true, warning: null };
  return {
    active: false,
    warning: `Agent Teams inactive — set ${AGENT_TEAMS_ENV}=1 to enable cto-lead / pm-lead / qa-lead orchestration.`,
  };
}

/**
 * Render a CC version-check report into a single human-readable warning string,
 * or null when no warning should surface.
 *
 * ENH-437 (v2.1.37): a version at or above the recommendation can now still
 * warrant a warning, when bkit has measured something about that release (see
 * KNOWN_ISSUES in cc-version-checker). Those read differently from a
 * too-old-version warning — the user is not behind, so telling them to upgrade
 * would be wrong — so they get their own sentence naming the issue and the
 * mitigation instead of the inactive-feature list, which is empty up there
 * anyway.
 *
 * @param {object} report from cc-version-checker.checkCCVersion()
 * @returns {string | null}
 */
function renderCCVersionWarning(report) {
  if (!report || report.skipped) return null;
  if (!report.current) return null;

  const knownIssues = report.knownIssues || [];

  if (report.severity === 'error') {
    const featureList = (report.inactive || []).join(', ') || 'none';
    return `CC v${report.min}+ required — current v${report.current}. Inactive features: ${featureList}.`;
  }

  // Behind the recommendation: the upgrade advice is the useful part.
  if (report.severity === 'warn' && report.recommended
      && compareCcVersions(report.current, report.recommended) < 0) {
    const featureList = (report.inactive || []).join(', ') || 'none';
    return `CC v${report.recommended}+ recommended — current v${report.current}. Inactive features: ${featureList}.`;
  }

  if (knownIssues.length > 0) {
    const summaries = knownIssues.map((i) => i.summary).join('; ');
    return `CC v${report.current}: ${summaries}. bkit recommends v${report.recommended}; `
      + `run \`/bkit\` or see docs/06-guide/cc-compatibility.guide.md for the mitigation.`;
  }

  return null;
}

/**
 * Version comparison for the render path only. Delegates to the checker so the
 * two can never disagree about ordering, and degrades to 0 (treat as equal) if
 * the module cannot be loaded — this renderer must never throw into SessionStart.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function compareCcVersions(a, b) {
  try {
    return require('../../lib/infra/cc-version-checker').compareVersion(a, b);
  } catch {
    return 0;
  }
}

/**
 * Run all preflight checks and return a single ready-to-prepend section, or
 * an empty string when nothing needs to be surfaced.
 *
 * @returns {string} additionalContext fragment (may be empty)
 */
function run() {
  const lines = [];

  try {
    const teams = checkAgentTeamsEnv();
    if (teams.warning) lines.push(`⚠️ ${teams.warning}`);
  } catch (e) {
    debugLog('SessionStart', 'preflight Agent Teams check failed', { error: e.message });
  }

  try {
    const { checkCCVersion } = require('../../lib/infra/cc-version-checker');
    const warning = renderCCVersionWarning(checkCCVersion());
    if (warning) lines.push(`⚠️ ${warning}`);
  } catch (e) {
    debugLog('SessionStart', 'preflight CC version check failed', { error: e.message });
  }

  try {
    const warning = renderHookFailureWarning();
    if (warning) lines.push(`⚠️ ${warning}`);
  } catch (e) {
    debugLog('SessionStart', 'preflight hook-failure check failed', { error: e.message });
  }

  if (lines.length === 0) return '';
  return ['', '## Preflight', ...lines, ''].join('\n');
}

/**
 * Surface hooks that failed, so a broken hook stops looking like a working one.
 *
 * v2.1.34 (R9). bkit's hook layer holds 333 catch blocks, 188 of which swallow
 * without a trace, and the crash recorder in lib/core/io.js now writes what they
 * hide into the dispatch ledger. Recording it is only half the fix: a record
 * nobody reads is the same silence in a different file. This is where it becomes
 * something the user actually sees.
 *
 * Deliberately quiet — one line, only when there is something to say, naming the
 * events rather than dumping stack traces.
 *
 * @param {string} [root] - project root; defaults to the ledger's own resolution
 * @returns {string} warning text, or '' when every hook is healthy
 */
function renderHookFailureWarning(root) {
  const { readFailures } = require('../../lib/core/hook-dispatch');
  const failures = readFailures(root);
  if (!failures.length) return '';

  const byEvent = new Map();
  for (const f of failures) {
    byEvent.set(f.event, (byEvent.get(f.event) || 0) + 1);
  }
  const summary = [...byEvent.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([event, n]) => `${event}×${n}`)
    .join(', ');

  return `bkit hooks reported ${failures.length} failure(s) — ${summary}. `
    + `See .bkit/runtime/hook-dispatch.ndjson; run with BKIT_DEBUG=1 for detail.`;
}

module.exports = {
  run,
  checkAgentTeamsEnv,
  renderCCVersionWarning,
  renderHookFailureWarning,
  AGENT_TEAMS_ENV,
};
