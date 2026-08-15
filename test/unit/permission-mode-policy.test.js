#!/usr/bin/env node
/**
 * Unit — lib/domain/policy/permission-mode-policy (ENH-466, v2.1.37)
 *
 * The whole point of putting this policy in one pure module was that the table
 * could be asserted EXHAUSTIVELY rather than sampled. Ten call sites with an
 * inline condition each would have been checked by whichever combinations someone
 * happened to write a test for; a 6-mode x 3-grade table has 18 cells and every
 * one of them is asserted below, plus the "field absent" column that older Claude
 * Code builds produce.
 *
 * The assertion that matters most is the negative one: no mode may suppress a
 * `critical` or `policy` decision. If a future change makes `bypassPermissions`
 * relax a refusal, the loop below fails on the cell that did it and names it.
 */
'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const policy = require(path.join(PROJECT_ROOT, 'lib/domain/policy/permission-mode-policy'));

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name} — ${e.message}`);
  }
}

console.log('\n=== permission-mode-policy.test.js ===\n');

// ─── The six documented modes ──────────────────────────────────────────────
//
// Measured, not copied from the docs: a hook that dumped its stdin was run once
// per mode on CC v2.1.231 and each returned its own name verbatim. `auto` is the
// exception — it needs account eligibility this project does not have, so it is
// here on documentation alone, which is exactly why it is NOT in the suppressing
// set.
const MODES = ['default', 'plan', 'acceptEdits', 'auto', 'dontAsk', 'bypassPermissions'];
const GRADES = ['critical', 'policy', 'ask'];
const SUPPRESSING = ['acceptEdits', 'dontAsk', 'bypassPermissions'];

test('PM-01 PERMISSION_MODES lists exactly the six documented values', () => {
  assert.deepEqual([...policy.PERMISSION_MODES].sort(), [...MODES].sort());
});

test('PM-02 DECISION_GRADES lists exactly the three grades', () => {
  assert.deepEqual([...policy.DECISION_GRADES].sort(), [...GRADES].sort());
});

test('PM-03 ASK_SUPPRESSING_MODES is the agreed set (maintainer decision D2)', () => {
  assert.deepEqual([...policy.ASK_SUPPRESSING_MODES].sort(), [...SUPPRESSING].sort());
});

test('PM-04 the exported constants are frozen', () => {
  for (const name of ['PERMISSION_MODES', 'DECISION_GRADES', 'ASK_SUPPRESSING_MODES']) {
    assert.ok(Object.isFrozen(policy[name]), `${name} is not frozen`);
  }
});

// ─── The full table: 6 modes x 3 grades ────────────────────────────────────

for (const mode of MODES) {
  for (const grade of GRADES) {
    const shouldEmit = grade !== 'ask' || !SUPPRESSING.includes(mode);
    test(`PM-10 ${grade} in ${mode} -> ${shouldEmit ? 'emit' : 'suppress'}`, () => {
      const v = policy.resolve({ mode, grade });
      assert.equal(v.emit, shouldEmit);
      assert.equal(v.mode, mode);
      assert.equal(v.grade, grade);
      assert.ok(typeof v.reason === 'string' && v.reason.length > 0, 'verdict carries no reason');
    });
  }
}

test('PM-11 NEGATIVE CONTROL: no mode suppresses critical or policy', () => {
  const leaks = [];
  for (const mode of MODES.concat(['manual', 'nonsense', '', undefined, null, 42])) {
    for (const grade of ['critical', 'policy']) {
      if (policy.resolve({ mode, grade }).emit !== true) leaks.push(`${grade}/${String(mode)}`);
    }
  }
  assert.deepEqual(leaks, [],
    `a refusal was suppressed — the one thing this policy must never do: ${leaks.join(', ')}`);
});

// ─── Absent / unknown input keeps today's behaviour (FR-5) ─────────────────

test('PM-20 an absent permission_mode resolves to default', () => {
  assert.equal(policy.normalizeMode(undefined), 'default');
  assert.equal(policy.normalizeMode(null), 'default');
});

test('PM-21 an unrecognized value resolves to default rather than throwing', () => {
  for (const raw of ['', '   ', 'BYPASSPERMISSIONS', 'bypass', 'yolo', 0, {}, [], true]) {
    assert.equal(policy.normalizeMode(raw), 'default', `normalizeMode(${JSON.stringify(raw)})`);
  }
});

test('PM-22 "manual" is the CLI alias for default (CC v2.1.200+)', () => {
  assert.equal(policy.normalizeMode('manual'), 'default');
  assert.equal(policy.isAskSuppressed('manual'), false);
});

test('PM-23 surrounding whitespace does not change the mode', () => {
  assert.equal(policy.normalizeMode('  bypassPermissions  '), 'bypassPermissions');
});

test('PM-24 an ask is emitted when the mode is unknown — absence is never a relaxation', () => {
  assert.equal(policy.resolve({ mode: undefined, grade: 'ask' }).emit, true);
  assert.equal(policy.isAskSuppressed(undefined), false);
});

// ─── Defensive shapes ──────────────────────────────────────────────────────

test('PM-30 an unrecognized grade is treated as critical, i.e. emitted', () => {
  assert.equal(policy.resolve({ mode: 'bypassPermissions', grade: 'whatever' }).emit, true);
  assert.equal(policy.resolve({ mode: 'bypassPermissions', grade: undefined }).emit, true);
});

test('PM-31 resolve() tolerates a non-object argument', () => {
  for (const bad of [undefined, null, 'ask', 7]) {
    assert.equal(policy.resolve(bad).emit, true, `resolve(${JSON.stringify(bad)}) must fail safe`);
  }
});

test('PM-32 isAskSuppressed agrees with resolve() for every mode', () => {
  for (const mode of MODES) {
    assert.equal(
      policy.isAskSuppressed(mode),
      policy.resolve({ mode, grade: 'ask' }).emit === false,
      `disagreement on ${mode}`
    );
  }
});

// ─── Purity: this module sits in the domain layer ──────────────────────────

test('PM-40 the module requires nothing — no FS, no network, no child_process', () => {
  const fs = require('node:fs');
  const src = fs.readFileSync(
    path.join(PROJECT_ROOT, 'lib/domain/policy/permission-mode-policy.js'), 'utf8'
  );
  const requires = src.match(/require\s*\(/g) || [];
  assert.equal(requires.length, 0,
    `domain policy must have no dependencies, found ${requires.length} require() call(s)`);
});

console.log(`\n--- Results: ${passed}/${passed + failed} passed, ${failed} failed ---`);
if (failed > 0) process.exit(1);
