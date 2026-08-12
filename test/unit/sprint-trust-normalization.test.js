#!/usr/bin/env node
/**
 * F3 Unit Test — normalizeTrustLevel precedence + `--trust` alias (v2.1.18 #102).
 *
 * Validates that `args.trust` (CLI `--trust L3` natural mapping per skill
 * docs §10.2) is honored alongside `args.trustLevel` and
 * `args.trustLevelAtStart`, with the documented precedence:
 *
 *     trustLevel > trust > trustLevelAtStart > configured default
 *
 * v2.1.36 — this test no longer reads the function's SOURCE.
 *
 * It used to spawn a child process, regex the body of `normalizeTrustLevel` out
 * of the shipped file, supply its own `DEFAULT_TRUST_LEVEL = 'L3'` and
 * `VALID_TRUST_LEVELS`, and eval the fragment. Two things followed from that:
 *
 *   1. It broke the moment the function called a helper — the extraction takes
 *      one function body, so `configuredDefaultTrustLevel is not defined` came
 *      out of a fragment that runs nowhere in production.
 *   2. More importantly, the stub said `'L3'` while the real constant has been
 *      `'L2'` since v2.1.19 (Safe Defaults, master plan §3.2). The test asserted
 *      a default the code stopped producing seventeen releases ago, and passed,
 *      because it was checking its own stub rather than the module.
 *
 * `normalizeTrustLevel` is exported. Requiring it tests what ships.
 *
 * Plan SC: F3 — normalize unification
 * Design Ref: docs/02-design/features/v2118-sprint-trust-ux-fix.design.md §4.3
 *
 * @module test/unit/sprint-trust-normalization.test
 */

'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const shared = require(path.join(PROJECT_ROOT, 'scripts/lib/sprint-handler-shared.js'));

const { normalizeTrustLevel, DEFAULT_TRUST_LEVEL } = shared;

/** @param {Object|null} args @returns {string} */
const normalize = (args) => normalizeTrustLevel(args);

let pass = 0;
let fail = 0;
const fails = [];

function test(name, fn) {
  try {
    fn();
    pass++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    fail++;
    fails.push({ name, err });
    console.log(`  ✗ ${name}`);
    console.log(`    ${err.message}`);
  }
}

console.log('F3 Unit — normalizeTrustLevel precedence chain (v2.1.18 #102)\n');

test('Case A: args.trustLevel only', () => {
  assert.strictEqual(normalize({ trustLevel: 'L3' }), 'L3');
});
test('Case B (★ F3 fix target): args.trust only — was silently ignored', () => {
  assert.strictEqual(normalize({ trust: 'L3' }), 'L3');
});
test('Case C: args.trustLevelAtStart only', () => {
  assert.strictEqual(normalize({ trustLevelAtStart: 'L3' }), 'L3');
});
test('Case D: precedence trustLevel > trust', () => {
  assert.strictEqual(normalize({ trust: 'L2', trustLevel: 'L3' }), 'L3');
});
test('Case E: an invalid value falls back to the shipped default', () => {
  // Asserted against the real constant, not a literal. The old test hardcoded
  // 'L3' and kept passing after v2.1.19 lowered it to 'L2', because it never
  // read the constant it claimed to be checking.
  assert.strictEqual(DEFAULT_TRUST_LEVEL, 'L2', 'Safe Defaults: the built-in default is L2 since v2.1.19');
  assert.strictEqual(normalize({ trust: 'invalid' }), DEFAULT_TRUST_LEVEL);
  assert.strictEqual(normalize(null), DEFAULT_TRUST_LEVEL);
  assert.strictEqual(normalize({}), DEFAULT_TRUST_LEVEL);
});
test('Case F: case-insensitive', () => {
  assert.strictEqual(normalize({ trust: 'l2' }), 'L2');
  assert.strictEqual(normalize({ trust: 'l4' }), 'L4');
});
test('Case G (★ CTO §F protection): existing --trustLevel user precedence preserved', () => {
  // Triple-source: trustLevel wins, trust + trustLevelAtStart ignored (regression-protect)
  assert.strictEqual(normalize({ trustLevel: 'L4', trust: 'L1', trustLevelAtStart: 'L0' }), 'L4');
});
test('Case H (v2.1.36): the configured default is what the file ships', () => {
  // ENH-454 wired `sprint.defaultTrustLevel`, which had shipped in
  // bkit.config.json with nothing reading it. Assert the resolver reads the
  // file rather than the constant, without pinning a literal here.
  const configured = shared.configuredDefaultTrustLevel();
  assert.ok(['L0', 'L1', 'L2', 'L3', 'L4'].includes(configured), `got ${configured}`);
  assert.strictEqual(normalize({}), configured);
});

console.log(`\nResults: ${pass} pass / ${fail} fail`);
if (fail > 0) {
  console.log('\nFailures:');
  for (const f of fails) console.log(`  ${f.name}: ${f.err.message}`);
  process.exit(1);
}
process.exit(0);
