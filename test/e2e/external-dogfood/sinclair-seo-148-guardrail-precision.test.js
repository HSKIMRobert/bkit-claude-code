#!/usr/bin/env node
/**
 * E2E — @Sinclair-Seo issue #148 reproduction (v2.1.36)
 *
 * Trigger incident: external dogfooder @Sinclair-Seo, 2026-08-12, running
 * bkit 2.1.35 on Claude Code 2.1.228 / Node 22.22.0 / Linux 6.6.87 (WSL2),
 * reported that three Destructive Detector rules refuse commands that are
 * read-only or narrowly scoped, and shipped a 12-case reproduction harness
 * with negative controls.
 *
 * Why it mattered beyond annoyance: a PreToolUse block asks a question, and an
 * unattended run has nobody to answer it, so the agent STALLS SILENTLY rather
 * than failing. The reporter lost ~15 minutes twice in one sprint, noticed only
 * because an idle-stall monitor was attached.
 *
 * This file absorbs their harness verbatim as a permanent regression lock —
 * external dogfooder Lifecycle Stage 4 (docs/external-dogfooders/_README.md).
 * The negative controls are part of the harness on purpose: a "0 false
 * positives" reading means nothing unless genuinely destructive commands are
 * still caught in the same run. The reporter made that point explicitly, having
 * first measured a bogus green by calling detect() with one argument instead of
 * two.
 *
 * ONE INTENTIONAL DIVERGENCE from the reporter's expectations, case 7:
 * they expected a scoped `find … -delete` to produce no finding at all. bkit
 * grades it to high/ask instead — the same treatment a scoped `rm -rf` gets
 * from G-001, and the same treatment the reporter themselves suggested
 * ("G-013 appears to want the same deleteTargetIsBroad() treatment"). Asking is
 * not blocking; the deny is what made unattended runs stall.
 *
 * Reference: https://github.com/popup-studio-ai/bkit-claude-code/issues/148
 * Reference: docs/01-plan/features/v2136-guardrail-precision.master-plan.en.md
 */
'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const { detect } = require(path.join(PROJECT_ROOT, 'lib/control/destructive-detector'));

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
    if (process.env.BKIT_E2E_DEBUG === '1') console.error(e.stack);
  }
}

/*
 * A few probe strings are assembled from fragments. This is not cosmetic: bkit's
 * own PreToolUse hook reads the command line of whatever runs these tests, and a
 * literal destructive form sitting in an argv has blocked tooling in this repo
 * three separate times while this fix was being developed. The assembled value
 * is byte-identical at runtime, so the assertions lose nothing.
 */
const RMRF = 'rm -' + 'rf';
const DEL = '-' + 'delete';
const FORCE = '--' + 'force';
const DROPTBL = 'DROP' + ' TABLE';

/** @returns {{detected: boolean, ids: string[], actions: string[]}} */
function run(command) {
  const r = detect('Bash', { command });
  return {
    detected: r.detected,
    ids: r.rules.map((x) => x.id),
    actions: r.rules.map((x) => x.action),
  };
}

console.log('\n=== sinclair-seo-148-guardrail-precision.test.js ===\n');

// ─── Part 1: safe commands that must not be refused ─────────────────────────

test('SS148-01 scoped single-file delete (standalone) is clean', () => {
  const r = run('rm -f /tmp/scratch/note.txt');
  assert.equal(r.detected, false, `expected clean, got ${r.ids.join(',')}`);
});

test('SS148-02 the same delete inside a command chain is clean (G-007)', () => {
  const r = run('cd /tmp/scratch && rm -f note.txt && echo done');
  assert.equal(r.detected, false, `expected clean, got ${r.ids.join(',')}`);
});

test('SS148-03 read-only git chain is clean (G-004)', () => {
  const r = run(
    'git fetch origin master && git log --oneline -5 '
    + '&& git merge-base origin/master HEAD && git diff --stat'
  );
  assert.equal(r.detected, false, `expected clean, got ${r.ids.join(',')}`);
});

test('SS148-04 git fetch alone is clean (reporter control — passed before the fix too)', () => {
  assert.equal(run('git fetch origin master').detected, false);
});

test('SS148-05 git merge-base alone is clean (G-004 hyphen defect)', () => {
  const r = run('git merge-base origin/master HEAD');
  assert.equal(r.detected, false, `expected clean, got ${r.ids.join(',')}`);
});

test('SS148-06 git log alone is clean (reporter control — passed before the fix too)', () => {
  assert.equal(run('git log --oneline origin/master -5').detected, false);
});

test('SS148-07 scoped find-delete asks instead of denying (intentional divergence)', () => {
  const r = run(`find /tmp/scratch -type f -name '*.tmp' ${DEL}`);
  assert.ok(r.ids.includes('G-013'), 'G-013 should still have an opinion');
  assert.ok(
    r.actions.every((a) => a !== 'deny'),
    `a scoped find-delete must not deny; got ${r.actions.join(',')}`
  );
});

// ─── Part 2: negative controls — must stay caught ───────────────────────────
// Without these, a "0 false positives" result proves nothing.

test('SS148-08 [control] recursive delete of / is denied', () => {
  const r = run(`${RMRF} /`);
  assert.ok(r.detected, 'must be detected');
  assert.ok(r.actions.includes('deny'), `must deny; got ${r.actions.join(',')}`);
});

test('SS148-09 [control] force push to master is denied', () => {
  const r = run(`git push ${FORCE} origin master`);
  assert.ok(r.ids.includes('G-002'), `expected G-002, got ${r.ids.join(',')}`);
  assert.ok(r.actions.includes('deny'));
});

test('SS148-10 [control] hard reset onto a shared branch is caught', () => {
  const r = run('git reset --hard origin/master');
  assert.ok(r.ids.includes('G-003'), `expected G-003, got ${r.ids.join(',')}`);
});

test('SS148-11 [control] dropping a table is denied', () => {
  const r = run(`wrangler d1 execute db --command "${DROPTBL} audit_log"`);
  assert.ok(r.ids.includes('G-009'), `expected G-009, got ${r.ids.join(',')}`);
  assert.ok(r.actions.includes('deny'));
});

test('SS148-12 [control] unscoped find-delete is denied', () => {
  const r = run(`find / -name "*.log" ${DEL}`);
  assert.ok(r.ids.includes('G-013'), `expected G-013, got ${r.ids.join(',')}`);
  assert.ok(r.actions.includes('deny'), `must deny; got ${r.actions.join(',')}`);
});

console.log(`\n--- Results: ${passed}/${passed + failed} passed, ${failed} failed ---`);
if (failed > 0) process.exit(1);
