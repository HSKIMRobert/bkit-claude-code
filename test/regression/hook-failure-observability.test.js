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
 *   HFO-5  a crash BEFORE the first stdin read is recorded too
 *   HFO-6  an unparseable payload is recorded as `degraded`
 *   HFO-8  the warning ages out rather than becoming permanent furniture
 *
 * HFO-3 is the one that matters most. A record nobody reads is the same silence
 * in a different file. HFO-8 is its counterweight: a warning that never clears
 * is a record nobody reads either, for the opposite reason.
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

test('HFO-5 a crash BEFORE any stdin read is still recorded', () => {
  /*
   * The recorder used to be armed inside `withDispatchRecord`, which runs only
   * after a handler has already called `readStdinSync()`. Everything earlier
   * was unobservable: a `require` that throws, a syntax error in a lib module,
   * a throw inside the reader itself. Those are exactly the failures that kill
   * a hook outright and leave nothing behind — and they are the ones a "hook
   * failure observability" feature most needs to catch.
   *
   * Arming happens at module load of lib/core/io now, so requiring it is enough.
   */
  const early = fs.mkdtempSync(path.join(os.tmpdir(), 'bkit-hfo-early-'));
  try {
    const script = path.join(early, 'early.js');
    fs.writeFileSync(
      script,
      `require(${JSON.stringify(path.join(PROJECT_ROOT, 'lib/core/io'))});\n`
      + "throw new Error('threw before reading stdin');\n"
    );
    const r = spawnSync('node', [script], {
      encoding: 'utf8', timeout: 30000, cwd: early,
      env: { ...process.env, CLAUDE_PROJECT_DIR: early, CLAUDE_HOOK_EVENT: 'PreToolUse' },
    });
    assert.strictEqual(r.status, 1, 'the crash must still be fatal');

    const recorded = readFailures(early, { windowMs: null });
    assert.ok(
      recorded.some((f) => /threw before reading stdin/.test(f.detail)),
      'a crash that happened before the first stdin read left no trace — '
        + `recorded: ${JSON.stringify(recorded.slice(0, 2))}`
    );
  } finally {
    fs.rmSync(early, { recursive: true, force: true });
  }
});

test('HFO-6 an unparseable payload is recorded as degraded, not as success', () => {
  /*
   * The most dangerous silent state in the layer. `readStdinSync` returns `{}`
   * when the envelope will not parse — correctly, since a hook must not take
   * down the session over a malformed payload — but every guard downstream then
   * inspects an empty object, finds no command and no file path, and ALLOWS.
   * The hook exits 0 having enforced nothing, and until v2.1.34 it left no
   * trace whatsoever.
   */
  const degraded = fs.mkdtempSync(path.join(os.tmpdir(), 'bkit-hfo-degraded-'));
  try {
    const script = path.join(degraded, 'reader.js');
    fs.writeFileSync(
      script,
      `const { readStdinSync } = require(${JSON.stringify(path.join(PROJECT_ROOT, 'lib/core/io'))});\n`
      + 'const p = readStdinSync();\n'
      + "process.stdout.write(JSON.stringify(p));\n"
    );
    const r = spawnSync('node', [script], {
      input: '{"hook_event_name": "PreToolUse", "tool_inp',  // truncated on purpose
      encoding: 'utf8', timeout: 30000, cwd: degraded,
      env: { ...process.env, CLAUDE_PROJECT_DIR: degraded, CLAUDE_HOOK_EVENT: 'PreToolUse' },
    });
    assert.strictEqual(r.stdout.trim(), '{}', 'the reader must still degrade to {} rather than throw');

    const recorded = readFailures(degraded, { windowMs: null });
    assert.ok(
      recorded.some((f) => f.status === 'degraded'),
      'a hook ran with an empty payload and enforced nothing, and nothing recorded it — '
        + `recorded: ${JSON.stringify(recorded.slice(0, 2))}`
    );
  } finally {
    fs.rmSync(degraded, { recursive: true, force: true });
  }
});

test('HFO-7 an empty stdin is NOT recorded as a degradation', () => {
  // Direct invocation — a test, a CLI run — is not a failure. Recording it
  // would fill the ledger with noise from the tooling and bury real signal.
  const quiet = fs.mkdtempSync(path.join(os.tmpdir(), 'bkit-hfo-quiet-'));
  try {
    const script = path.join(quiet, 'reader.js');
    fs.writeFileSync(
      script,
      `const { readStdinSync } = require(${JSON.stringify(path.join(PROJECT_ROOT, 'lib/core/io'))});\n`
      + 'readStdinSync();\n'
    );
    spawnSync('node', [script], {
      input: '', encoding: 'utf8', timeout: 30000, cwd: quiet,
      env: { ...process.env, CLAUDE_PROJECT_DIR: quiet },
    });
    assert.deepStrictEqual(
      readFailures(quiet, { windowMs: null }), [],
      'an empty stdin was recorded as a degradation — every test run would add noise'
    );
  } finally {
    fs.rmSync(quiet, { recursive: true, force: true });
  }
});

test('HFO-8 the startup warning ages out instead of becoming permanent', () => {
  /*
   * The ledger is append-only and has no notion of "fixed". Without a window,
   * one failure means every session from then on opens with a warning about it,
   * which trains the user to skip the line — turning the fix for silent failure
   * into a different flavour of silent failure.
   */
  const { FAILURE_WINDOW_MS } = require(path.join(PROJECT_ROOT, 'lib/core/hook-dispatch'));
  assert.ok(
    typeof FAILURE_WINDOW_MS === 'number' && FAILURE_WINDOW_MS > 0,
    'there is no recency window — the startup warning is permanent'
  );

  const aged = fs.mkdtempSync(path.join(os.tmpdir(), 'bkit-hfo-aged-'));
  try {
    const dir = path.join(aged, '.bkit', 'runtime');
    fs.mkdirSync(dir, { recursive: true });
    const old = new Date(Date.now() - FAILURE_WINDOW_MS - 60000).toISOString();
    fs.writeFileSync(
      path.join(dir, 'hook-dispatch.ndjson'),
      JSON.stringify({ event: 'Stop', status: 'threw', detail: 'ancient', at: old }) + '\n'
    );
    const preflight = require(path.join(PROJECT_ROOT, 'hooks/startup/preflight'));
    assert.strictEqual(
      preflight.renderHookFailureWarning(aged), '',
      'a failure older than the window still warns — the line never clears'
    );
    assert.strictEqual(
      readFailures(aged, { windowMs: null }).length, 1,
      'the record itself must survive; only the WARNING ages out'
    );
  } finally {
    fs.rmSync(aged, { recursive: true, force: true });
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
