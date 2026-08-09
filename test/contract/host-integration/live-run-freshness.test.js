#!/usr/bin/env node
'use strict';

/*
 * live-run-freshness.test.js — v2.1.34
 *
 * Makes the L6 host-integration layer enforceable on a runner that has no
 * Claude Code CLI and no credentials.
 *
 * ## The problem this solves
 *
 * The L6 test drives a real `claude -p --plugin-dir` session. CI runs on a
 * stock `ubuntu-latest` with no CLI installed and no API key, so that step
 * always takes its skip path — while `ci-host-integration-wiring.test.js`
 * reported it green because the opt-in FLAG was set. A gate that is green while
 * verifying nothing is exactly the `validate-plugin --strict` /
 * `continue-on-error: true` pattern this release cites as its cautionary tale,
 * recreated one level up. Installing the CLI and injecting a key into CI was
 * considered and declined.
 *
 * ## What is enforced instead
 *
 * A live run writes an artifact recording which hook events it observed, and
 * the hash of the `hooks.json` it observed them against. This test — which
 * needs nothing but the repository — asserts that the artifact still describes
 * the configuration being shipped.
 *
 * The consequence is the property that actually matters: **you cannot change
 * `hooks.json` and ship it without re-running the live harness.** Editing a
 * matcher, a timeout, or an event turns CI red until someone produces fresh
 * evidence. That is enforcement, from a committed fact rather than from a step
 * that quietly skips.
 *
 * ## What it does NOT claim
 *
 * It does not prove the hooks fire *now*. It proves that a human ran the live
 * harness against *this* configuration and recorded the result. The honest
 * framing is "verified evidence, re-verified on change" — not "CI runs a live
 * session".
 *
 * Regenerate with:  node test/qa-harness-full-live.js --layer hooks --record
 */

const assert = require('node:assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const ARTIFACT = path.join(__dirname, 'last-live-run.json');
const HOOKS_JSON = path.join(PROJECT_ROOT, 'hooks', 'hooks.json');

let pass = 0;
const failures = [];
function test(name, fn) {
  try { fn(); pass++; } catch (e) { failures.push(`${name}: ${e.message}`); }
}

/** Hash of the shipped hook configuration, normalised for line endings. */
function hooksHash() {
  const raw = fs.readFileSync(HOOKS_JSON, 'utf8').replace(/\r\n/g, '\n');
  return crypto.createHash('sha256').update(raw).digest('hex');
}

test('LRF-1 a live-run artifact is committed', () => {
  assert.ok(
    fs.existsSync(ARTIFACT),
    `${path.relative(PROJECT_ROOT, ARTIFACT)} is missing. Run `
      + '`node test/qa-harness-full-live.js --layer hooks --record` and commit the result.'
  );
});

if (!fs.existsSync(ARTIFACT)) {
  console.error(`\n✗ live-run-freshness: ${failures.length} failing assertion(s)`);
  for (const f of failures) console.error(`    ✗ ${f}`);
  console.error(`\npass:${pass} fail:${failures.length} skip:0`);
  process.exit(1);
}

const artifact = JSON.parse(fs.readFileSync(ARTIFACT, 'utf8'));

test('LRF-2 the artifact records the configuration it was produced against', () => {
  assert.ok(typeof artifact.hooksJsonSha256 === 'string' && artifact.hooksJsonSha256.length === 64,
    'artifact has no hooksJsonSha256');
  assert.ok(typeof artifact.recordedAt === 'string', 'artifact has no recordedAt');
  assert.ok(typeof artifact.claudeVersion === 'string', 'artifact does not name the runtime it ran against');
});

test('LRF-3 hooks.json has not changed since the last live run', () => {
  const current = hooksHash();
  assert.strictEqual(
    artifact.hooksJsonSha256,
    current,
    'hooks/hooks.json changed after the last recorded live run. The evidence that '
      + 'these hooks dispatch no longer describes what is being shipped. Re-run '
      + '`node test/qa-harness-full-live.js --layer hooks --record` and commit the artifact.'
  );
});

test('LRF-4 the run observed the always-on events dispatching', () => {
  const observed = Array.isArray(artifact.observedEvents) ? artifact.observedEvents : [];
  const required = ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Stop'];
  const missing = required.filter((e) => !observed.includes(e));
  assert.deepStrictEqual(
    missing,
    [],
    `the recorded run did not observe: ${missing.join(', ')} (observed: ${observed.join(', ') || 'none'})`
  );
});

test('LRF-5 the run observed PostToolUse for both Write and Edit', () => {
  const tools = (artifact.postToolUseTools || []);
  for (const tool of ['Write', 'Edit']) {
    assert.ok(
      tools.includes(tool),
      `PostToolUse was not observed with ${tool} (observed: ${tools.join(', ') || 'none'}). `
        + 'Through v2.1.33 the matcher was "Write" alone, so this is the regression lock.'
    );
  }
});

test('LRF-6 every registered event is either observed or listed as unverified', () => {
  const hooksJson = JSON.parse(fs.readFileSync(HOOKS_JSON, 'utf8'));
  const registered = Object.keys(hooksJson.hooks || {});
  const observed = artifact.observedEvents || [];
  const unverified = artifact.unverifiedEvents || {};
  const unaccounted = registered.filter((e) => !observed.includes(e) && !(e in unverified));
  assert.deepStrictEqual(
    unaccounted,
    [],
    `registered but neither observed nor declared unverified: ${unaccounted.join(', ')}. `
      + 'Every event must be one or the other — silence is how a dead hook survives.'
  );
});

test('LRF-7 each unverified event states a SPECIFIC reason', () => {
  /*
   * A length check is not a reason check. The recorder can always emit
   * boilerplate long enough to clear a character floor, which would let a hook
   * that silently stopped dispatching be filed away as "not observed" and go
   * green — the exact laundering this whole layer exists to prevent.
   *
   * So the placeholder the recorder writes when it has nothing to say is
   * rejected by name, and a reason must actually describe a condition.
   */
  const unverified = artifact.unverifiedEvents || {};
  const PLACEHOLDER = /no trigger produced it and no reason was recorded/i;

  const weak = Object.entries(unverified)
    .filter(([, reason]) => typeof reason !== 'string'
      || reason.trim().length < 30
      || PLACEHOLDER.test(reason))
    .map(([event]) => event);

  assert.deepStrictEqual(
    weak,
    [],
    `these events are recorded as unverified without a specific reason: ${weak.join(', ')}. `
      + 'Either state the condition that prevents the event from firing, or treat it as a '
      + 'hook that no longer dispatches.'
  );
});

test('LRF-8 the observed set has not shrunk since the last recording', () => {
  /*
   * Guards the direction the freshness hash cannot: hooks.json unchanged, but a
   * hook stops dispatching for some other reason (a handler that now throws at
   * load, a Claude Code change). Re-recording would quietly move the event into
   * `unverifiedEvents` and stay green; this floor makes that a failure.
   */
  const observed = artifact.observedEvents || [];
  const FLOOR = [
    // Fire in any ordinary session.
    'SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse',
    'Stop', 'SessionEnd', 'SubagentStart', 'SubagentStop', 'InstructionsLoaded',
    /*
     * v2.1.34 — added once the harness's deliberate triggers were shown to work.
     *
     * These five needed a specific condition and were previously filed as
     * "unverified", which is how five live hooks sat in the excused column. The
     * triggers that produce them are in `test/qa-harness-full-live.js`:
     * TaskCreate + TaskUpdate for the task pair, twelve chunked reads under
     * --autocompact 100k for the compaction pair, and a command that does not
     * exist for the tool failure. Having been observed once, an absence now
     * needs explaining rather than accepting.
     */
    'TaskCreated', 'TaskCompleted', 'PreCompact', 'PostCompact', 'PostToolUseFailure',
  ];
  const lost = FLOOR.filter((e) => !observed.includes(e));
  assert.deepStrictEqual(
    lost,
    [],
    `these events were observed dispatching in a previous recording and are not in this one: `
      + `${lost.join(', ')}. Moving a known-live event into "unverified" is how a dead hook `
      + 'gets laundered into an accepted absence.'
  );
});

if (failures.length > 0) {
  console.error(`\n✗ live-run-freshness: ${failures.length} failing assertion(s)`);
  for (const f of failures) console.error(`    ✗ ${f}`);
  console.error(`\npass:${pass} fail:${failures.length} skip:0`);
  process.exit(1);
}
console.log(`✓ live-run-freshness — pass:${pass} fail:0 skip:0`);
