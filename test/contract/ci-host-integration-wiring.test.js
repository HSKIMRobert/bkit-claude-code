#!/usr/bin/env node
'use strict';

/*
 * ci-host-integration-wiring.test.js — v2.1.34
 *
 * Guards the wiring that makes L6 host-integration enforceable.
 *
 * ## History, because it is the point
 *
 * The first version of this file guarded a CI step that ran the live
 * host-integration test with `BKIT_HOST_INTEGRATION=1`. That step could never
 * do anything: the runner has no Claude Code CLI and no credentials, so it
 * always took the skip path — while this test reported it green, because the
 * FLAG was set. It verified YAML text, not that a live session had ever run.
 *
 * That is precisely the `validate-plugin --strict` / `continue-on-error: true`
 * shape this release cites as its cautionary tale, recreated by the very test
 * written to prevent it. Installing a CLI and injecting an API key into CI was
 * considered and declined.
 *
 * ## What is enforced now
 *
 * A live run records its evidence into `last-live-run.json`, stamped with the
 * hash of the `hooks.json` it ran against. CI asserts that evidence still
 * matches what is shipped — which needs no CLI, no key, and no network, and
 * which turns red the moment `hooks.json` changes without a fresh run.
 *
 * This file checks that chain is present and cannot fail open.
 */

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const WORKFLOW = path.join(PROJECT_ROOT, '.github', 'workflows', 'contract-check.yml');
const FRESHNESS_TEST = 'test/contract/host-integration/live-run-freshness.test.js';
const ARTIFACT = 'test/contract/host-integration/last-live-run.json';

let pass = 0;
const failures = [];
function test(name, fn) {
  try { fn(); pass++; } catch (e) { failures.push(`${name}: ${e.message}`); }
}

test('CHW-1 the CI workflow exists', () => {
  assert.ok(fs.existsSync(WORKFLOW), `${WORKFLOW} is missing`);
});

const yaml = fs.existsSync(WORKFLOW) ? fs.readFileSync(WORKFLOW, 'utf8') : '';

test('CHW-2 CI runs the live-run freshness check', () => {
  assert.ok(
    yaml.includes(FRESHNESS_TEST),
    `no CI step runs ${FRESHNESS_TEST} — nothing would notice hooks.json changing `
      + 'without fresh evidence, and the L6 layer would be decorative again'
  );
});

test('CHW-3 the freshness check runs without credentials', () => {
  // The whole point is that this step needs nothing but the repository. If it
  // ever grows an env block referencing a secret, the gate has quietly become
  // conditional on infrastructure that CI does not have.
  const idx = yaml.indexOf(FRESHNESS_TEST);
  const stepStart = yaml.lastIndexOf('- name:', idx);
  const next = yaml.indexOf('- name:', idx);
  const step = yaml.slice(stepStart === -1 ? 0 : stepStart, next === -1 ? yaml.length : next);
  assert.ok(
    !/secrets\./.test(step) && !/ANTHROPIC_API_KEY/.test(step),
    'the freshness step must not depend on a secret — it exists precisely because CI has none'
  );
});

test('CHW-4 the committed evidence artifact exists', () => {
  assert.ok(
    fs.existsSync(path.join(PROJECT_ROOT, ARTIFACT)),
    `${ARTIFACT} is missing. Produce it with `
      + '`node test/qa-harness-full-live.js --layer hooks --record` and commit it.'
  );
});

test('CHW-5 the live test still honours its opt-in flag', () => {
  const src = fs.readFileSync(
    path.join(PROJECT_ROOT, 'test/contract/host-integration/hook-dispatch.test.js'),
    'utf8'
  );
  assert.ok(
    src.includes('BKIT_HOST_INTEGRATION'),
    'the live test no longer reads BKIT_HOST_INTEGRATION — it would then spawn real '
      + 'sessions inside the offline aggregate, which is slow and flaky under its own concurrency'
  );
});

test('CHW-6 no CI step silently tolerates its own failure', () => {
  // `continue-on-error: true` is how validate-plugin --strict verified nothing
  // for eleven releases.
  //
  // Comment lines are excluded on purpose. The workflow documents that history
  // in prose, and matching prose as if it were configuration is the same
  // mistake as reading a heredoc body as a command line — it reports a finding
  // that is really just a sentence.
  const offenders = yaml
    .split('\n')
    .map((line, i) => [i + 1, line])
    .filter(([, line]) => !/^\s*#/.test(line))
    .filter(([, line]) => /continue-on-error:\s*true/.test(line));
  assert.deepStrictEqual(
    offenders.map(([i]) => i),
    [],
    `continue-on-error: true at line(s) ${offenders.map(([i]) => i).join(', ')} — `
      + 'a step that cannot fail is not a gate'
  );
});

test('CHW-7 CI does not claim to run a live session', () => {
  /*
   * An honesty check on the wiring's own description. bkit spent eleven
   * releases with a comment promising a strict gate that was not strict; the
   * fix is not only to correct the wiring but to stop the file from asserting
   * something it does not do.
   */
  const idx = yaml.indexOf(FRESHNESS_TEST);
  const stepStart = yaml.lastIndexOf('- name:', idx);
  const step = yaml.slice(stepStart === -1 ? 0 : stepStart, idx);
  assert.ok(
    !/runs a live session|live Claude Code session in CI/i.test(step),
    'the step description claims CI runs a live session; it verifies recorded evidence instead'
  );
});

if (failures.length > 0) {
  console.error(`\n✗ ci-host-integration-wiring: ${failures.length} failing assertion(s)`);
  for (const f of failures) console.error(`    ✗ ${f}`);
  console.error(`\npass:${pass} fail:${failures.length} skip:0`);
  process.exit(1);
}
console.log(`✓ ci-host-integration-wiring — pass:${pass} fail:0 skip:0`);
