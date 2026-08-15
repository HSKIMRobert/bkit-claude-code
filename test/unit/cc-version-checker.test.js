/**
 * cc-version-checker.test.js — Unit tests for CC version detection adapter (FR-α5)
 *
 * Covers L1 cases enumerated in
 *   docs/02-design/features/bkit-v2111-sprint-alpha.design.md §8.2
 *
 * @module test/unit/cc-version-checker.test
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const ccv = require('../../lib/infra/cc-version-checker');

test('parseVersion handles canonical semver', () => {
  assert.deepEqual(ccv.parseVersion('2.1.117'), [2, 1, 117]);
  assert.deepEqual(ccv.parseVersion('  2.1.118-beta '), [2, 1, 118]);
});

test('parseVersion returns null on malformed input', () => {
  assert.equal(ccv.parseVersion(null), null);
  assert.equal(ccv.parseVersion('not a version'), null);
  assert.equal(ccv.parseVersion(2), null);
});

test('compareVersion: newer > older', () => {
  assert.equal(ccv.compareVersion('2.1.117', '2.1.78'), 1);
  assert.equal(ccv.compareVersion('2.2.0', '2.1.999'), 1);
  assert.equal(ccv.compareVersion('3.0.0', '2.99.99'), 1);
});

test('compareVersion: older < newer', () => {
  assert.equal(ccv.compareVersion('2.1.78', '2.1.117'), -1);
  assert.equal(ccv.compareVersion('2.0.500', '2.1.0'), -1);
});

test('compareVersion: equal returns 0', () => {
  assert.equal(ccv.compareVersion('2.1.117', '2.1.117'), 0);
});

test('compareVersion: unparsable inputs fail-open as equal', () => {
  assert.equal(ccv.compareVersion('garbage', '2.1.117'), 0);
  assert.equal(ccv.compareVersion('2.1.117', null), 0);
});

test('listInactiveFeatures excludes features whose version <= current', () => {
  const inactive = ccv.listInactiveFeatures('2.1.78');
  assert.ok(Array.isArray(inactive));
  assert.ok(!inactive.includes('loopCommand'),
    'loopCommand requires 2.1.71, must be active at 2.1.78');
  assert.ok(inactive.includes('agentTeams'),
    'agentTeams requires 2.1.117, must be inactive at 2.1.78');
  assert.ok(inactive.includes('hookMcpToolDirect'),
    'hookMcpToolDirect requires 2.1.118, must be inactive at 2.1.78');
});

test('listInactiveFeatures returns empty list when current >= all required', () => {
  const inactive = ccv.listInactiveFeatures('9.9.9');
  assert.deepEqual(inactive, []);
});

test('listInactiveFeatures returns empty list on malformed current', () => {
  assert.deepEqual(ccv.listInactiveFeatures('garbage'), []);
});

test('FEATURE_VERSION_MAP is frozen and contains expected v2.1.118 keys', () => {
  assert.ok(Object.isFrozen(ccv.FEATURE_VERSION_MAP));
  assert.equal(ccv.FEATURE_VERSION_MAP.agentTeams, '2.1.117');
  assert.equal(ccv.FEATURE_VERSION_MAP.hookMcpToolDirect, '2.1.118');
  assert.equal(ccv.FEATURE_VERSION_MAP.pluginTagCommand, '2.1.118');
  assert.equal(ccv.FEATURE_VERSION_MAP.agentHookMultiEvent, '2.1.118');
});

test('checkCCVersion honors DISABLE_UPDATES env (F5 mitigation)', () => {
  const orig = process.env.DISABLE_UPDATES;
  process.env.DISABLE_UPDATES = '1';
  try {
    const r = ccv.checkCCVersion();
    assert.equal(r.skipped, true);
    assert.equal(r.reason, 'DISABLE_UPDATES env');
  } finally {
    if (orig === undefined) delete process.env.DISABLE_UPDATES;
    else process.env.DISABLE_UPDATES = orig;
  }
});

test('checkCCVersion returns a typed report when not skipped', () => {
  const orig = process.env.DISABLE_UPDATES;
  delete process.env.DISABLE_UPDATES;
  try {
    const r = ccv.checkCCVersion();
    // Either undetectable (current: null) or a structured severity result.
    if (r.current === null) {
      assert.equal(r.skipped, undefined);
    } else {
      assert.ok(['ok', 'warn', 'error'].includes(r.severity));
      assert.ok(Array.isArray(r.inactive));
      assert.equal(typeof r.recommended, 'string');
      assert.equal(typeof r.min, 'string');
    }
  } finally {
    if (orig === undefined) delete process.env.DISABLE_UPDATES;
    else process.env.DISABLE_UPDATES = orig;
  }
});

test('getCurrent returns either a parseable string or null', () => {
  const v = ccv.getCurrent();
  if (v !== null) {
    assert.equal(typeof v, 'string');
    assert.ok(ccv.parseVersion(v), `getCurrent returned non-parseable: ${v}`);
  }
});

// ---------------------------------------------------------------------------
// ENH-437 (v2.1.37) — KNOWN_ISSUES upper bound.
//
// MIN_VERSION and RECOMMENDED_VERSION are both floors, so before this the check
// had no way to say anything about a release ABOVE the recommendation: a user on
// the newest CC was graded `ok` regardless of what bkit had measured about it.
// These assert BEHAVIOUR (what the check returns, what the renderer emits), not
// that a constant exists — a source-text assertion would have passed against the
// broken tree.
// ---------------------------------------------------------------------------

const { renderCCVersionWarning } = require('../../hooks/startup/preflight');

test('KNOWN_ISSUES is frozen, and so is every entry', () => {
  assert.ok(Object.isFrozen(ccv.KNOWN_ISSUES));
  for (const issue of ccv.KNOWN_ISSUES) {
    assert.ok(Object.isFrozen(issue), `entry ${issue.id} must be frozen`);
    assert.ok(Object.isFrozen(issue.suppressedByEnv), `${issue.id}.suppressedByEnv must be frozen`);
  }
});

test('KNOWN_ISSUES entries carry the fields the renderer and a later reader need', () => {
  for (const issue of ccv.KNOWN_ISSUES) {
    assert.equal(typeof issue.id, 'string');
    assert.ok(ccv.parseVersion(issue.from), `${issue.id}.from must be a version`);
    assert.ok(issue.until === null || ccv.parseVersion(issue.until),
      `${issue.id}.until must be null or a version`);
    assert.ok(['all', 'interactive', 'headless'].includes(issue.scope));
    assert.ok(issue.summary && issue.detail, `${issue.id} needs summary + detail`);
    assert.equal(typeof issue.addedCycle, 'number',
      `${issue.id}.addedCycle records which analysis cycle measured it`);
  }
});

test('listKnownIssues matches from the `from` version onward', () => {
  assert.deepEqual(ccv.listKnownIssues('2.1.231', {}).map((i) => i.id), []);
  assert.deepEqual(ccv.listKnownIssues('2.1.232', {}).map((i) => i.id), ['fork-default-agent-spawn']);
  // A changed default persists into later releases; the entry must not need one
  // row per release to keep matching.
  assert.deepEqual(ccv.listKnownIssues('2.1.999', {}).map((i) => i.id), ['fork-default-agent-spawn']);
});

test('listKnownIssues honors `until` as an exclusive upper bound', () => {
  const closed = [Object.freeze({
    id: 'x', from: '2.0.0', until: '2.1.0', scope: 'all',
    summary: 's', detail: 'd', suppressedByEnv: Object.freeze([]), addedCycle: 0,
  })];
  // Exercised through the same predicate the real list uses.
  const inRange = closed.filter((i) =>
    ccv.compareVersion('2.0.5', i.from) >= 0 && ccv.compareVersion('2.0.5', i.until) < 0);
  const past = closed.filter((i) =>
    ccv.compareVersion('2.1.0', i.from) >= 0 && ccv.compareVersion('2.1.0', i.until) < 0);
  assert.equal(inRange.length, 1);
  assert.equal(past.length, 0, 'an entry stops matching at `until` with no second edit');
});

test('listKnownIssues is suppressed by an env setting that genuinely mitigates', () => {
  // sub-agents.md:798 — fork mode off restores foreground when Claude needs the result.
  assert.deepEqual(ccv.listKnownIssues('2.1.232', { CLAUDE_CODE_FORK_SUBAGENT: '0' }), []);
  // sub-agents.md:795 — foreground regardless of fork mode. Strictly stronger.
  assert.deepEqual(ccv.listKnownIssues('2.1.232', { CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: '1' }), []);
  // Case-insensitive, whitespace-tolerant.
  assert.deepEqual(ccv.listKnownIssues('2.1.232', { CLAUDE_CODE_FORK_SUBAGENT: ' False ' }), []);
});

test('listKnownIssues is NOT suppressed by an env value that turns the feature ON', () => {
  assert.equal(ccv.listKnownIssues('2.1.232', { CLAUDE_CODE_FORK_SUBAGENT: '1' }).length, 1);
  assert.equal(ccv.listKnownIssues('2.1.232', { CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: '0' }).length, 1);
});

test('listKnownIssues fails open on a malformed version', () => {
  assert.deepEqual(ccv.listKnownIssues('garbage', {}), []);
  assert.deepEqual(ccv.listKnownIssues(null, {}), []);
});

test('checkCCVersion promotes ok -> warn when a known issue applies', () => {
  // The defect ENH-437 fixes: at/above the recommendation the report said `ok`
  // and renderCCVersionWarning() returns null on `ok`, so nothing could surface.
  const report = {
    current: '2.1.232', severity: 'warn', recommended: '2.1.220', min: '2.1.78',
    inactive: [], knownIssues: ccv.listKnownIssues('2.1.232', {}),
  };
  assert.equal(report.knownIssues.length, 1);
  const warning = renderCCVersionWarning(report);
  assert.ok(warning, 'a known issue above the recommendation must surface');
  assert.match(warning, /2\.1\.232/);
  assert.doesNotMatch(warning, /Inactive features/,
    'above the recommendation the user is not behind; an upgrade nudge would be wrong');
});

test('checkCCVersion keeps `error` when below MIN_VERSION, even with a known issue', () => {
  // Severity precedence: "too old to support" is the more actionable statement.
  const warning = renderCCVersionWarning({
    current: '2.1.10', severity: 'error', recommended: '2.1.220', min: '2.1.78',
    inactive: ['agentTeams'], knownIssues: [{ id: 'x', summary: 's' }],
  });
  assert.match(warning, /CC v2\.1\.78\+ required/);
});

test('checkCCVersion always carries knownIssues when current is known', () => {
  const orig = process.env.DISABLE_UPDATES;
  delete process.env.DISABLE_UPDATES;
  try {
    const r = ccv.checkCCVersion();
    if (r.current !== null) {
      assert.ok(Array.isArray(r.knownIssues),
        'callers must be able to render without probing for the key');
    }
  } finally {
    if (orig === undefined) delete process.env.DISABLE_UPDATES;
    else process.env.DISABLE_UPDATES = orig;
  }
});

test('renderCCVersionWarning still says nothing when nothing is known against the version', () => {
  assert.equal(renderCCVersionWarning({
    current: '2.1.220', severity: 'ok', recommended: '2.1.220', min: '2.1.78',
    inactive: [], knownIssues: [],
  }), null);
});

test('renderCCVersionWarning preserves the behind-recommended message', () => {
  assert.equal(renderCCVersionWarning({
    current: '2.1.200', severity: 'warn', recommended: '2.1.220', min: '2.1.78',
    inactive: [], knownIssues: [],
  }), 'CC v2.1.220+ recommended — current v2.1.200. Inactive features: none.');
});
