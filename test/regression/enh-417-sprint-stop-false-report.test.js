#!/usr/bin/env node
/*
 * ENH-417 regression — the sprint Stop hook must never report a completion
 * that did not happen (bkit v2.1.33).
 *
 * Observed 2026-08-08. Running `/sprint master-plan v2133-defect-response`
 * printed, verbatim:
 *
 *     ✅ Sprint "v2133-defect-response" — report → archived
 *
 * with an executive-summary body belonging to `final-qa-i18n-docs-sync`, a
 * sprint last touched two months earlier. `.bkit/state/sprints/v2133-defect-
 * response.json` did not exist; nothing had been archived. Three independent
 * causes had to line up, and each is locked below:
 *
 *   1. `sprint-skill-stop.js` corrected the loaded sprint into the report but
 *      not the id in the header, because the guard read `if (sprint &&
 *      !sprintId)`. With an id already resolved from the marker, the header
 *      kept the requested id while the body came from the fallback sprint.
 *   2. `master-plan` was missing from READONLY_ACTIONS, so a command that
 *      advances no sprint reached the "a sprint operation just completed"
 *      fallback at all.
 *   3. `advancePhase` wrote `phase: 'archived'` without touching `status`, so
 *      finished sprints stayed `status: 'active'` and `latestActiveSprint()`
 *      kept returning them. 6 of 7 state files were in that shape.
 *
 * This belongs to the same family as ENH-411 (a red suite reporting green) and
 * ENH-412 (a NaN match rate making the quality gate undecidable): machinery
 * that reports success it has not verified.
 *
 * module: test/regression/enh-417-sprint-stop-false-report
 *
 * @version 2.1.33
 * @since   2.1.33
 */

'use strict';

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const STOP_HOOK = path.join(PROJECT_ROOT, 'scripts', 'sprint-skill-stop.js');
const ADVANCE = path.join(PROJECT_ROOT, 'lib', 'application', 'sprint-lifecycle', 'advance-phase.usecase.js');
const ARCHIVE = path.join(PROJECT_ROOT, 'lib', 'application', 'sprint-lifecycle', 'archive-sprint.usecase.js');
const SPRINT_STATE_DIR = path.join(PROJECT_ROOT, '.bkit', 'state', 'sprints');

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

console.log('=== ENH-417: sprint Stop must not report a false completion ===\n');

const stopSrc = fs.readFileSync(STOP_HOOK, 'utf8');
// Strip comments before pattern-matching. The fix's own explanatory comment
// quotes the old guard verbatim, and matching that text would keep this
// assertion permanently red for describing the bug it prevents.
const stopCode = stopSrc.split('\n')
  .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
  .join('\n');

// --- Cause 1: the header id must follow the sprint actually loaded ---
assert('E417-01', !/if\s*\(\s*sprint\s*&&\s*!sprintId\s*\)/.test(stopCode),
  'the `if (sprint && !sprintId)` guard is back — a fallback sprint would again be rendered under the requested id');

assert('E417-02', /fallbackMismatch/.test(stopCode),
  'no fallbackMismatch detection — the hook cannot tell that it loaded a different sprint than the one asked for');

assert('E417-03', /shouldSurface\s*=[^;]*!\s*fallbackMismatch/.test(stopCode),
  'shouldSurface does not exclude the mismatch case — one sprint\'s summary could still answer a question about another');

// --- Cause 2: master-plan advances no sprint, so it must not reach the fallback ---
const readonlyMatch = stopCode.match(/const\s+READONLY_ACTIONS\s*=\s*\[([^\]]*)\]/);
assert('E417-04', !!readonlyMatch && /'master-plan'/.test(readonlyMatch[1]),
  'master-plan is not in READONLY_ACTIONS — it creates a plan without advancing any sprint, so it must never trigger the "a sprint operation just completed" fallback');

// --- Cause 3: reaching phase 'archived' must also settle status ---
const advanceSrc = fs.readFileSync(ADVANCE, 'utf8');
assert('E417-05', /status:\s*toPhase\s*===\s*'archived'/.test(advanceSrc),
  'advancePhase does not settle status when entering the archived phase — sprints would again linger as status:"active" and be resurrected by latestActiveSprint()');

const archiveSrc = fs.readFileSync(ARCHIVE, 'utf8');
assert('E417-06', /status:\s*'archived'/.test(archiveSrc),
  'archiveSprint no longer sets status: archived');

// --- Data invariant: no state file may sit at phase archived with a live status ---
if (fs.existsSync(SPRINT_STATE_DIR)) {
  const stale = [];
  for (const f of fs.readdirSync(SPRINT_STATE_DIR).filter((x) => x.endsWith('.json'))) {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(SPRINT_STATE_DIR, f), 'utf8'));
      if (j.phase === 'archived' && j.status !== 'archived') stale.push(j.id || f);
    } catch (_e) { /* a corrupt state file is out of scope for this assertion */ }
  }
  assert('E417-07', stale.length === 0,
    `sprint state files at phase "archived" but not status "archived": ${stale.join(', ')} — latestActiveSprint() would select them`);
} else {
  // No sprints on disk is a legitimate state (fresh clone); nothing to verify.
  assert('E417-07', true, '');
}

// --- Summary ---
const total = pass + fail;
console.log(`\nResults: ${pass}/${total} passed, ${fail} failed`);
if (failures.length > 0) {
  console.log('Failures:');
  failures.forEach((f) => console.log(`  - ${f.id}: ${f.message}`));
}
process.exit(fail > 0 ? 1 : 0);
