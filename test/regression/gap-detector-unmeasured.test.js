#!/usr/bin/env node
'use strict';

/*
 * gap-detector-unmeasured.test.js — v2.1.34
 *
 * `scripts/gap-detector-stop.js` extracted the match rate with
 *
 *     let matchRate = match ? parseInt(match[2], 10) : 0;
 *
 * so a gap analysis that reported no percentage at all was recorded as a
 * measured 0%. That fabricated number then travelled everywhere the real one
 * would:
 *
 *   - into `.bkit/state/pdca-status.json` as the feature's match rate
 *   - into the M1 and M4 metric series as a data point
 *   - into a generated `docs/03-analysis/<feature>.analysis.md` headed
 *     "Match Rate: 0%"
 *   - into the audit trail as `gate_failed`
 *   - into the state machine as an `ITERATE` transition
 *   - and into the guidance shown to the user, which fell past every threshold
 *     into the "below 70%" branch and urged auto-improvement
 *
 * Observed during v2.1.34: this hook wrote a 0% analysis document for a feature
 * whose state had deliberately been set to `matchRate: null, measured: false` —
 * the release's own record, contradicted by its own tooling.
 *
 * A fabricated 0 is in one way worse than the fabricated 100 this release also
 * removed: it looks like diligence. A reader concludes the comparison ran and
 * found nothing matching, and starts rewriting code against a measurement that
 * was never taken. Iterations get spent, and the iteration limit is reached, on
 * the strength of a parse failure.
 */

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');
const HOOK = path.join(ROOT, 'scripts', 'gap-detector-stop.js');

let pass = 0;
const failures = [];
function test(name, fn) {
  try { fn(); pass++; } catch (e) { failures.push(`${name}: ${e.message}`); }
}

/**
 * Run the hook against an isolated project root and return its Stop surface.
 * @param {string} agentOutput - what the gap-detector agent "said"
 * @returns {{reason: string, root: string}}
 */
function run(agentOutput) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bkit-gdu-'));
  const res = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({
      hook_event_name: 'Stop',
      session_id: 'gdu',
      agentOutput,
      transcript: agentOutput,
    }),
    encoding: 'utf8',
    timeout: 30000,
    cwd: root,
    env: { ...process.env, CLAUDE_PROJECT_DIR: root, BKIT_HOOK_DISPATCH_RECORD: '0' },
  });
  let reason = '';
  try { reason = JSON.parse((res.stdout || '').trim()).reason || ''; } catch (_) { /* none */ }
  return { reason, root, raw: res.stdout || '' };
}

test('GDU-1 an analysis with no percentage reports "not measured", not 0%', () => {
  const { reason, root, raw } = run('gap analysis for feature: demo finished');
  try {
    assert.ok(reason, `no Stop surface was emitted: ${raw.slice(0, 200)}`);
    assert.doesNotMatch(
      reason, /Match rate: 0%|0% match/,
      'a parse failure was reported to the user as a measured 0% — the number is invented'
    );
    assert.match(
      reason, /No match rate was measured|no match rate/i,
      `the surface does not say the measurement is missing: ${reason.slice(0, 200)}`
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('GDU-2 an unmeasured run does not push the user toward auto-improvement', () => {
  /*
   * With the fabricated 0, `matchRate >= threshold` and `matchRate >= 70` were
   * both false, so the guidance landed in the lowest branch: "Significant
   * design-implementation gap detected", recommending /pdca-iterate. The user
   * was told what a comparison found, by a comparison that never ran.
   */
  const { reason, root } = run('gap analysis for feature: demo finished');
  try {
    assert.doesNotMatch(
      reason, /Significant design-implementation gap detected/,
      'an unmeasured run still claims a significant gap was DETECTED'
    );
    assert.match(
      reason, /Re-run the gap analysis/i,
      'the guidance does not ask for the step that is actually missing — the measurement'
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('GDU-3 an unmeasured run does not consume an iteration', () => {
  const { reason, root } = run('gap analysis for feature: demo finished');
  try {
    assert.match(
      reason, /unchanged/i,
      'the iteration counter is not stated as unchanged; an unmeasured run that '
        + 'consumes iterations exhausts the budget on parse failures'
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('GDU-4 a real measurement still flows through unchanged', () => {
  // The counterweight. Making the unmeasured path honest is worthless if it
  // also swallows genuine results.
  const { reason, root } = run('Match Rate: 93% for feature: demo');
  try {
    assert.match(
      reason, /Match rate: 93%/,
      `a measured rate was lost: ${reason.slice(0, 200)}`
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('GDU-5 a measured failure is still reported as a failure', () => {
  const { reason, root } = run('Match Rate: 41% for feature: demo');
  try {
    assert.match(reason, /41%/, 'the measured rate is missing');
    assert.match(
      reason, /gap|iterate/i,
      'a genuinely low measured rate no longer recommends improvement'
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('GDU-6 no metric is recorded for an unmeasured run', () => {
  /*
   * A metric series with a gap in it is honest. One padded with fabricated
   * zeroes is not, and once written the padding is indistinguishable from real
   * data — every trend line computed from it is wrong, quietly.
   */
  const { root } = run('gap analysis for feature: demo finished');
  try {
    const metricsDir = path.join(root, '.bkit', 'runtime');
    let recorded = '';
    if (fs.existsSync(metricsDir)) {
      for (const f of fs.readdirSync(metricsDir)) {
        if (/metric/i.test(f)) recorded += fs.readFileSync(path.join(metricsDir, f), 'utf8');
      }
    }
    assert.doesNotMatch(
      recorded, /"M1"[^}]*"value"\s*:\s*0\b/,
      'an M1 data point of 0 was recorded from a run that measured nothing'
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

if (failures.length > 0) {
  console.error(`\n✗ gap-detector-unmeasured: ${failures.length} failing assertion(s)`);
  for (const f of failures) console.error(`    ✗ ${f}`);
  console.error(`\npass:${pass} fail:${failures.length} skip:0`);
  process.exit(1);
}
console.log(`✓ gap-detector-unmeasured — pass:${pass} fail:0 skip:0`);
