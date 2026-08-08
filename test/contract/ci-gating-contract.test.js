#!/usr/bin/env node
/*
 * CI Gating Contract (ENH-411, bkit v2.1.33)
 *
 * Locks the property that actually matters: **a failing test must be able to
 * turn CI red.** Before v2.1.33 it could not, for three independent reasons
 * that each sufficed on their own:
 *
 *   1. `qa-aggregate.js` contained zero `process.exit` calls, so the
 *      aggregator returned 0 no matter how many assertions failed.
 *   2. The workflow ran it as `node ... | tail -10` with no explicit `shell:`.
 *      GitHub Actions then uses `bash -e` WITHOUT pipefail, so the pipeline's
 *      status came from `tail` (always 0).
 *   3. The plugin-schema release gate carried `continue-on-error: true` while
 *      its own comment had promised strict mode since v2.1.21.
 *
 * A note on scope, so nobody re-litigates it later: individual test files that
 * exit 0 on failure are NOT a gating hole. Both runners (`qa-aggregate.js` and
 * `test/run-all.js`) parse stdout for PASS/FAIL counts and gate on the parsed
 * totals, and `test/run-all.js` ends with `process.exit(totalFailed > 0 ...)`.
 * What does matter is that any test file the workflow invokes *directly* — as
 * its own step, with no runner in between — signals failure through its exit
 * code, because that is the only channel GitHub Actions reads for that step.
 * That is what CG-01 asserts.
 *
 * module: test/contract/ci-gating-contract
 *
 * @version 2.1.33
 * @since   2.1.33
 */

'use strict';

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const WORKFLOW_DIR = path.join(PROJECT_ROOT, '.github', 'workflows');
const AGGREGATE = path.join(PROJECT_ROOT, 'test', 'contract', 'scripts', 'qa-aggregate.js');

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

function workflowFiles() {
  if (!fs.existsSync(WORKFLOW_DIR)) return [];
  return fs.readdirSync(WORKFLOW_DIR)
    .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
    .map((f) => path.join(WORKFLOW_DIR, f));
}

/**
 * Every `run:` line that invokes a test file directly, i.e. `node <path>.test.js`.
 * Runner scripts are deliberately excluded — they gate on parsed totals, not on
 * the exit code of any single file.
 */
function directlyInvokedTestFiles() {
  const found = new Set();
  for (const wf of workflowFiles()) {
    const text = fs.readFileSync(wf, 'utf8');
    const re = /run:\s*node\s+"?([^\s"|;&]+\.test\.js)"?/g;
    let m;
    while ((m = re.exec(text)) !== null) found.add(m[1]);
  }
  return [...found];
}

console.log('=== CI Gating Contract (ENH-411) ===\n');

// --- CG-01: every directly-invoked test file signals failure via exit code ---
const direct = directlyInvokedTestFiles();
assert('CG-00', direct.length > 0,
  'expected the workflow to invoke at least one test file directly');

for (const rel of direct) {
  const abs = path.join(PROJECT_ROOT, rel);
  if (!fs.existsSync(abs)) {
    assert(`CG-01:${rel}`, false, `workflow references a missing file: ${rel}`);
    continue;
  }
  const src = fs.readFileSync(abs, 'utf8');
  // Accept any exit form — literal, ternary, or process.exitCode assignment.
  const gates = /process\.exit(?:Code)?\s*[=(]/.test(src);
  assert(`CG-01:${path.basename(rel)}`, gates,
    `${rel} is a direct CI step but never sets a non-zero exit — its failures would be invisible to GitHub Actions`);
}

// --- CG-02: the aggregator itself can fail ---
const aggSrc = fs.readFileSync(AGGREGATE, 'utf8');
assert('CG-02', /process\.exit(?:Code)?\s*[=(]/.test(aggSrc),
  'qa-aggregate.js has no exit call — a failing suite would return 0 (the v2.1.32 defect)');
assert('CG-03', /total\.fail\s*\+\s*total\.errors|total\.errors\s*\+\s*total\.fail/.test(aggSrc),
  'qa-aggregate.js must gate on errors as well as failures — an errored file has an unknown result, and unknown must not read as success');

// --- CG-04: any piped run: step must preserve the exit code ---
for (const wf of workflowFiles()) {
  const text = fs.readFileSync(wf, 'utf8');
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    if (!/^\s*run:\s*.*\|\s*\w/.test(line)) return;
    // Look back a few lines for an explicit `shell:` on the same step.
    const window = lines.slice(Math.max(0, i - 6), i + 1).join('\n');
    const explicitShell = /^\s*shell:\s*bash/m.test(window)
      || /set\s+-o\s+pipefail/.test(window);
    assert(`CG-04:${path.basename(wf)}:${i + 1}`, explicitShell,
      `piped run: step without an explicit "shell: bash" — GitHub Actions defaults to "bash -e" without pipefail, so the pipeline reports the LAST command's status and a failing left-hand side is swallowed`);
  });
}

// --- CG-05: release-gate steps must not be advisory ---
for (const wf of workflowFiles()) {
  const text = fs.readFileSync(wf, 'utf8');
  // Only real settings count. These workflows carry historical notes such as
  // "v2.1.20: advisory only (continue-on-error: true)" that describe a past
  // state, and matching those would make this assertion permanently red.
  const advisory = text.split('\n').some(
    (line) => !/^\s*#/.test(line) && /continue-on-error:\s*true/.test(line),
  );
  assert(`CG-05:${path.basename(wf)}`, !advisory,
    'continue-on-error: true makes a step decorative. If a step is genuinely advisory, delete it or move it to a non-gating workflow rather than leaving a gate that verifies nothing');
}

// --- Summary ---
const total = pass + fail;
console.log(`\nResults: ${pass}/${total} passed, ${fail} failed`);
if (failures.length > 0) {
  console.log('Failures:');
  failures.forEach((f) => console.log(`  - ${f.id}: ${f.message}`));
}
process.exit(fail > 0 ? 1 : 0);
