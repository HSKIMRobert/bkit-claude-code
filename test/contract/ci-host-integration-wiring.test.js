#!/usr/bin/env node
'use strict';

/*
 * ci-host-integration-wiring.test.js — v2.1.34
 *
 * The host-integration layer only runs when `BKIT_HOST_INTEGRATION=1` is set,
 * because each of its cases starts a real Claude Code session and the offline
 * aggregate walks every `*.test.js`. That opt-in has an obvious failure mode:
 * nobody opts in, and the layer that exists to prove hooks are reachable
 * quietly becomes unreachable itself.
 *
 * bkit has been here before. `validate-plugin.js --strict` carried
 * `continue-on-error: true` for eleven minor releases while its comment claimed
 * the advisory window had closed, so the gate verified nothing. A guard is only
 * as real as the wiring that invokes it.
 *
 * This file is that wiring's guard. It fails if the CI step disappears, stops
 * setting the flag, or stops pointing at the test.
 */

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const WORKFLOW = path.join(PROJECT_ROOT, '.github', 'workflows', 'contract-check.yml');
const HOST_TEST = 'test/contract/host-integration/hook-dispatch.test.js';

let pass = 0;
const failures = [];
function test(name, fn) {
  try { fn(); pass++; } catch (e) { failures.push(`${name}: ${e.message}`); }
}

test('CHW-1 the CI workflow exists', () => {
  assert.ok(fs.existsSync(WORKFLOW), `${WORKFLOW} is missing`);
});

const yaml = fs.existsSync(WORKFLOW) ? fs.readFileSync(WORKFLOW, 'utf8') : '';

test('CHW-2 CI invokes the host-integration test', () => {
  assert.ok(
    yaml.includes(HOST_TEST),
    `no CI step runs ${HOST_TEST} — the layer would never execute anywhere`
  );
});

test('CHW-3 the invoking step enables live runs', () => {
  // Find the step that runs the test and confirm the flag is set on or above it.
  const idx = yaml.indexOf(HOST_TEST);
  assert.ok(idx > -1, 'host-integration step not found');
  // Look back to the start of this step (previous "- name:") and forward a
  // little, so an `env:` block on either side of the `run:` counts.
  const stepStart = yaml.lastIndexOf('- name:', idx);
  const stepEnd = yaml.indexOf('- name:', idx) === -1 ? yaml.length : yaml.indexOf('- name:', idx);
  const step = yaml.slice(stepStart === -1 ? 0 : stepStart, stepEnd);
  assert.ok(
    /BKIT_HOST_INTEGRATION:\s*(?:'1'|"1"|1)/.test(step)
      || /BKIT_HOST_INTEGRATION=1/.test(step),
    'the CI step runs the host-integration test but never sets BKIT_HOST_INTEGRATION=1, '
      + 'so it skips — a step that always skips is a gate that verifies nothing'
  );
});

test('CHW-4 the test still honours the opt-in flag it documents', () => {
  const src = fs.readFileSync(path.join(PROJECT_ROOT, HOST_TEST), 'utf8');
  assert.ok(
    src.includes('BKIT_HOST_INTEGRATION'),
    'the test no longer reads BKIT_HOST_INTEGRATION — this guard is checking a flag nobody uses'
  );
});

test('CHW-5 no CI step silently tolerates its own failure', () => {
  // `continue-on-error: true` is how validate-plugin --strict verified nothing
  // for eleven releases. Any use must be deliberate and visible in review.
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

if (failures.length > 0) {
  console.error(`\n✗ ci-host-integration-wiring: ${failures.length} failing assertion(s)`);
  for (const f of failures) console.error(`    ✗ ${f}`);
  console.error(`\npass:${pass} fail:${failures.length} skip:0`);
  process.exit(1);
}
console.log(`✓ ci-host-integration-wiring — pass:${pass} fail:0 skip:0`);
