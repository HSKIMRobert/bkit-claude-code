#!/usr/bin/env node
/*
 * ENH-410 regression — a block must tell the model WHY (bkit v2.1.33).
 *
 * `scripts/unified-bash-pre.js` called `outputBlock('deny', reason, 'PreToolUse')`
 * against `function outputBlock(reason)` — a one-parameter function
 * (lib/core/io.js:346). JavaScript bound `reason` to the literal `'deny'` and
 * silently dropped the rest, so the carefully built explanation (directive text,
 * rule, source, matched pattern) never left the hook. What the model actually
 * received, verified by execution, was:
 *
 *     {"decision":"block","reason":"deny"}
 *
 * This is the Memory Enforcer path — bkit differentiation #1. The consequence is
 * not cosmetic: with no stated cause, retrying the same command is the model's
 * rational move, and CC's auto mode pauses after 3 consecutive blocks and aborts
 * outright in headless `-p` runs (code.claude.com/docs/en/permission-modes.md:332-334).
 *
 * Why a behavioural test: the existing guard,
 * `test/integration/hook-wiring.test.js` HW-014, is a source-text regex
 *   /(?:block|deny|getBlockMessage|outputBlock|outputAllow)/
 * which cannot detect argument count, reachability, or emitted JSON shape — and
 * matched the very literal `'deny'` the bug produced. It passed throughout.
 * These assertions run the emitters and read what comes out.
 *
 * module: test/regression/enh-410-block-reason-contract
 *
 * @version 2.1.33
 * @since   2.1.33
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const IO_PATH = path.join(PROJECT_ROOT, 'lib', 'core', 'io.js');
const BASH_PRE = path.join(PROJECT_ROOT, 'scripts', 'unified-bash-pre.js');

let pass = 0;
let fail = 0;
const failures = [];

function assert(id, condition, message) {
  if (condition) {
    pass++;
    console.log(`  PASS: ${id}`);
  } else {
    fail++;
    failures.push({ id, message });
    console.error(`  FAIL: ${id} - ${message}`);
  }
}

/** Run a snippet in a child process and parse the single JSON line it prints. */
function emit(snippet) {
  const out = execFileSync(process.execPath, ['-e', snippet], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
  });
  return JSON.parse(out.trim().split('\n').filter(Boolean).pop());
}

console.log('=== ENH-410: a block must carry its reason ===\n');

// --- E410-01: outputBlock's arity is the contract every caller must respect ---
const ioSrc = fs.readFileSync(IO_PATH, 'utf8');
const sig = ioSrc.match(/function\s+outputBlock\s*\(([^)]*)\)/);
assert('E410-01', !!sig,
  'outputBlock is no longer declared as a function — callers cannot be checked');
const arity = sig ? sig[1].split(',').filter((s) => s.trim()).length : -1;
assert('E410-02', arity === 1,
  `outputBlock takes ${arity} parameter(s); this test and every call site assume 1. If the signature widened deliberately, update both.`);

// --- E410-03: nobody may call outputBlock with more arguments than it accepts ---
const OVERCALL = /\boutputBlock\s*\(\s*[^)]*?,[^)]*?\)/;
for (const rel of ['scripts/unified-bash-pre.js', 'scripts/pre-write.js']) {
  const src = fs.readFileSync(path.join(PROJECT_ROOT, rel), 'utf8');
  const code = src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  assert(`E410-03:${path.basename(rel)}`, !OVERCALL.test(code),
    `${rel} passes multiple arguments to the one-parameter outputBlock — the extras are silently discarded, which is exactly the v2.1.32 defect`);
}

// --- E410-04: the emitted block actually carries the reason ---
const REASON = 'bkit Memory Enforcer: directive "no force push" denied this command (rule: forbid, source: CLAUDE.md).';
const blocked = emit(
  `const io=require('./lib/core/io');`
  + `io.outputBlockWithContext(${JSON.stringify(REASON)}, ['Narrow the command', 'Edit CLAUDE.md'], 'PreToolUse');`,
);
assert('E410-04', blocked.decision === 'block',
  `expected decision "block", got ${JSON.stringify(blocked.decision)}`);
assert('E410-05', blocked.reason === REASON,
  `the reason must survive to the model verbatim; got ${JSON.stringify(blocked.reason)}`);
assert('E410-06', blocked.reason !== 'deny',
  'the emitted reason is the literal "deny" — the arity bug is back');

// --- E410-07: alternatives reach the model, so a block is not a dead end ---
const ctx = blocked.hookSpecificOutput && blocked.hookSpecificOutput.additionalContext;
assert('E410-07', typeof ctx === 'string' && ctx.includes('Narrow the command') && ctx.includes('Edit CLAUDE.md'),
  `alternatives must appear in additionalContext so the model has a recovery path; got ${JSON.stringify(ctx)}`);
assert('E410-08', blocked.hookSpecificOutput && blocked.hookSpecificOutput.hookEventName === 'PreToolUse',
  'hookEventName must be preserved — it was one of the arguments the arity bug discarded');

// --- E410-09: the Memory Enforcer site uses the context-carrying emitter ---
const bashPreCode = fs.readFileSync(BASH_PRE, 'utf8')
  .split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
assert('E410-09', /outputBlockWithContext\(\s*reason\s*,\s*alternatives\s*,\s*'PreToolUse'\s*\)/.test(bashPreCode),
  'the Memory Enforcer deny path must call outputBlockWithContext(reason, alternatives, hookEvent)');

// --- Summary ---
const total = pass + fail;
console.log(`\nResults: ${pass}/${total} passed, ${fail} failed`);
if (failures.length > 0) {
  console.log('Failures:');
  failures.forEach((f) => console.log(`  - ${f.id}: ${f.message}`));
}
process.exit(fail > 0 ? 1 : 0);
