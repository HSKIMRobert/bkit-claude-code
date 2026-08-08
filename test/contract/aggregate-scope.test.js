#!/usr/bin/env node
/*
 * L1 — Aggregator Scope Test
 *
 * Verifies qa-aggregate.js correctly integrates tests/qa/ directory and
 * separates expected failures from regression failures.
 *
 * Design Ref: bkit-v2110-gap-closure.design.md §3.1.2 T6
 * Plan SC: G-Q1 (tests/qa 집계 누락 해소) + G-Q2 (expected failure 분리)
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const AGG_PATH = path.join(PROJECT_ROOT, 'test', 'contract', 'scripts', 'qa-aggregate.js');

let pass = 0;
let fail = 0;

function assert(cond, msg) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${msg}`);
  } else {
    fail++;
    console.error(`  ✗ ${msg}`);
  }
}

console.log('=== Aggregator Scope Test (v2.1.10 G-Q1/G-Q2) ===');

// 1. qa-aggregate.js file exists and is readable
assert(fs.existsSync(AGG_PATH), 'qa-aggregate.js exists');
const src = fs.readFileSync(AGG_PATH, 'utf8');

// 2. tests/qa is covered by the aggregator.
//
// v2.1.33: this used to grep the source for the literals `'tests'`/`'qa'` and
// `qa-legacy`. TEST_DIRS is no longer a hand-written array — it is discovered at
// runtime, because naming directories by hand is exactly what left 143 test
// files (including all of test/security) outside CI until v2.1.33. Asserting
// the literal would now fail while coverage is strictly better, so assert the
// property that actually matters: the legacy QA directory is among the
// discovered directories.
const { TEST_DIRS } = require('./scripts/qa-aggregate');
assert(Array.isArray(TEST_DIRS) && TEST_DIRS.length > 0,
  'qa-aggregate exports a non-empty TEST_DIRS');
assert(
  TEST_DIRS.some((d) => d.dir.replace(/\\/g, '/').endsWith('tests/qa')),
  'tests/qa/ directory integrated in TEST_DIRS'
);
assert(
  TEST_DIRS.some((d) => d.dir.replace(/\\/g, '/').endsWith('tests/qa') && d.label === 'qa-legacy'),
  'qa-legacy label defined for tests/qa'
);

// 3. EXPECTED_FAILURES constant exists
assert(/EXPECTED_FAILURES/.test(src), 'EXPECTED_FAILURES constant defined');

// 4. Separate counter for expected failures
assert(/expectedFail/.test(src), 'expectedFail tracked separately in totals');

// 5. Output includes Expected Failures line
assert(/Expected Failures:/.test(src), 'Output prints Expected Failures line');

// 6. Is Expected check
assert(/isExpectedFailure/.test(src), 'isExpectedFailure flag applied per-file');

// 7. PROJECT_ROOT calculation unchanged
assert(/path\.resolve\(__dirname, '\.\.', '\.\.', '\.\.'\)/.test(src), 'PROJECT_ROOT path unchanged');

// Summary
const total = pass + fail;
console.log(`\nTests: ${pass}/${total} PASSED, ${fail} FAILED, 0 SKIPPED`);
process.exit(fail > 0 ? 1 : 0);
