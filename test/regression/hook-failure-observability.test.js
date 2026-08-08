#!/usr/bin/env node
'use strict';

/*
 * hook-failure-observability.test.js — v2.1.34 (R9)
 *
 * A hook that fails silently is indistinguishable from a hook that works.
 *
 * bkit's hook layer holds 333 catch blocks and 188 of them swallow without a
 * trace. Most are legitimately best-effort — a hook must not take down the
 * user's session because bookkeeping failed — but a layer where every failure
 * is silent is how eight shipped features stayed dead across releases while
 * 6,398 assertions stayed green.
 *
 * Rewriting 188 call sites would be churn with its own risk. Instead the
 * failure is recorded centrally and surfaced once, and this locks the three
 * properties that make that worth anything:
 *
 *   HFO-1  a crash is RECORDED
 *   HFO-2  a crash still behaves exactly as before (observation, not control)
 *   HFO-3  what was recorded is SHOWN to the user at the next session start
 *
 * HFO-3 is the one that matters most. A record nobody reads is the same silence
 * in a different file.
 */

const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

let pass = 0;
const failures = [];
function test(name, fn) {
  try { fn(); pass++; } catch (e) { failures.push(`${name}: ${e.message}`); }
}

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'bkit-hfo-'));

// A handler shaped like a real one: read stdin through the shared reader, then
// fail the way an unguarded bug would.
const crasher = path.join(work, 'crasher.js');
fs.writeFileSync(
  crasher,
  `const { readStdinSync } = require(${JSON.stringify(path.join(PROJECT_ROOT, 'lib/core/io'))});\n`
  + 'readStdinSync();\n'
  + "setTimeout(() => { throw new Error('deliberate hook crash'); }, 0);\n"
);

const run = spawnSync('node', [crasher], {
  input: JSON.stringify({
    session_id: 'hfo', cwd: work, hook_event_name: 'PostToolUse', tool_name: 'Edit',
  }),
  encoding: 'utf8',
  timeout: 30000,
  cwd: work,
  env: { ...process.env, CLAUDE_PROJECT_DIR: work },
});

const { readFailures, readDispatch } = require(path.join(PROJECT_ROOT, 'lib/core/hook-dispatch'));

test('HFO-1 a hook crash is recorded in the dispatch ledger', () => {
  const recorded = readFailures(work);
  assert.ok(recorded.length > 0, 'nothing was recorded — the failure is invisible again');
  assert.ok(
    recorded.some((f) => f.status === 'threw' && /deliberate hook crash/.test(f.detail)),
    `the record does not name the error: ${JSON.stringify(recorded.slice(0, 2))}`
  );
});

test('HFO-1b the dispatch itself is still recorded alongside the failure', () => {
  const events = Object.keys(readDispatch(work).events || {});
  assert.ok(
    events.includes('PostToolUse'),
    `dispatch record missing; saw [${events.join(', ')}]`
  );
});

test('HFO-2 recording does not change what a crash does', () => {
  assert.strictEqual(
    run.status,
    1,
    'an uncaught exception must still be fatal — this is observation, not control flow. '
      + 'Swallowing the crash to record it would trade one silence for another.'
  );
});

test('HFO-3 the next session start tells the user about it', () => {
  const preflight = require(path.join(PROJECT_ROOT, 'hooks/startup/preflight'));
  const warning = preflight.renderHookFailureWarning(work);
  assert.ok(warning, 'no warning rendered — the record would never reach a human');
  assert.match(warning, /PostToolUse/, `warning does not name the failing event: ${warning}`);
  assert.match(warning, /hook-dispatch\.ndjson/, 'warning does not say where to look');
});

test('HFO-4 a healthy project produces no warning', () => {
  const clean = fs.mkdtempSync(path.join(os.tmpdir(), 'bkit-hfo-clean-'));
  try {
    const preflight = require(path.join(PROJECT_ROOT, 'hooks/startup/preflight'));
    assert.strictEqual(
      preflight.renderHookFailureWarning(clean),
      '',
      'a clean project must stay quiet — a warning that always fires is noise, '
        + 'and noise is how the previous reachability monitor lost its credibility'
    );
  } finally {
    fs.rmSync(clean, { recursive: true, force: true });
  }
});

try { fs.rmSync(work, { recursive: true, force: true }); } catch (_) { /* best-effort */ }

if (failures.length > 0) {
  console.error(`\n✗ hook-failure-observability: ${failures.length} failing assertion(s)`);
  for (const f of failures) console.error(`    ✗ ${f}`);
  console.error(`\npass:${pass} fail:${failures.length} skip:0`);
  process.exit(1);
}
console.log(`✓ hook-failure-observability — pass:${pass} fail:0 skip:0`);
