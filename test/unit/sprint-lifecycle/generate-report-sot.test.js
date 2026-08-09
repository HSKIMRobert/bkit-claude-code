#!/usr/bin/env node
/** L1 — generate-report SoT + Quality Gates section (F3-3 v2.1.19 S3, 9 TC, closes #105) */
'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const gr = require(path.join(PROJECT_ROOT, 'lib/application/sprint-lifecycle/generate-report.usecase.js'));
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { failed++; console.log(`  ✗ ${name} — ${e.message}`); } }

console.log('L1 F3-3 generate-report SoT + Quality Gates section tests');

const fixtureSprint = {
  id: 'test-sprint',
  name: 'Test Sprint',
  phase: 'archived',
  status: 'archived',
  context: { WHY: 'test why', WHO: 'test who', RISK: 'r', SUCCESS: 's', SCOPE: 'sc' },
  features: ['f1', 'f2'],
  featureMap: {
    f1: { matchRate: 100, qa: 'pass', s1Score: 100, completion: true, scope: 'P0' },
    f2: { matchRate: 85, qa: 'fail', s1Score: 80, completion: false, scope: 'P1', details: 'iteration stuck below 90%' },
  },
  qualityGates: {
    M1_matchRate: { current: 90, threshold: 90, passed: true, lastMeasuredAt: '2026-05-21T10:00:00Z', source: 'gap-detector' },
    M3_criticalIssueCount: { current: 0, threshold: 0, passed: true, lastMeasuredAt: '2026-05-21T10:00:00Z', source: 'gap-detector' },
    S1_dataFlowIntegrity: { current: 100, threshold: 100, passed: true, lastMeasuredAt: '2026-05-21T10:01:00Z', source: 'sprint-qa-flow' },
  },
  kpi: { matchRate: 50, criticalIssues: 0, qaPassRate: null, cumulativeIterations: 1, cumulativeTokens: 1000, sprintCycleHours: 2 },
  phaseHistory: [{ phase: 'prd', enteredAt: '2026-05-21T09:00:00Z', exitedAt: '2026-05-21T09:30:00Z', durationMs: 1800000 }],
  iterateHistory: [{ iteration: 1, matchRate: 100, fixedTaskIds: [], durationMs: 60000 }],
};

test('TC-F3-3-R1: generateReport returns reportContent + kpiSnapshot', async () => {
  const r = await gr.generateReport(fixtureSprint);
  assert.ok(r.ok);
  assert.ok(r.reportContent.length > 0);
  assert.ok(r.kpiSnapshot);
});

test('TC-F3-3-R2: kpiSnapshot.matchRate uses qualityGates (90), NOT kpi.matchRate (50)', async () => {
  const r = await gr.generateReport(fixtureSprint);
  assert.equal(r.kpiSnapshot.matchRate, 90, 'qualityGates SoT not applied');
});

test('TC-F3-3-R3: kpiSnapshot.dataFlowIntegrity uses qualityGates.S1 (100)', async () => {
  const r = await gr.generateReport(fixtureSprint);
  assert.equal(r.kpiSnapshot.dataFlowIntegrity, 100);
});

test('TC-F3-3-R4: reportContent includes ## Quality Gates section', async () => {
  const r = await gr.generateReport(fixtureSprint);
  assert.match(r.reportContent, /## Quality Gates \(3 gates, 3 passed\)/);
});

test('TC-F3-3-R5: Quality Gates section includes M1 + M3 + S1 rows', async () => {
  const r = await gr.generateReport(fixtureSprint);
  assert.match(r.reportContent, /\| M1 \| 90 \| 90 \| ✓ \|/);
  assert.match(r.reportContent, /\| S1 \| 100 \| 100 \| ✓ \|/);
});

test('TC-F3-3-R6: divergences detected (kpi=50 vs qg=90)', async () => {
  const r = await gr.generateReport(fixtureSprint);
  assert.ok(r.divergences.length >= 1);
  assert.equal(r.divergences[0].field, 'matchRate');
});

test('TC-F3-3-R7: divergenceLogger called when divergences exist', async () => {
  const logged = [];
  await gr.generateReport(fixtureSprint, { divergenceLogger: (d) => logged.push(d) });
  assert.equal(logged.length, 1);
  assert.equal(logged[0].precedenceApplied, 'qualityGates');
});

test('TC-F3-3-R8: an unmeasured gate is RENDERED as "not measured", not omitted', () => {
  /*
   * v2.1.34 — inverted. This asserted that a gate with nothing measured is
   * dropped from the report entirely.
   *
   * That is the same fail-open the release closes one layer down, where an
   * unmeasured gate reported 100. A dropped row and a passing row read
   * identically to anyone holding the report: the heading said "N gates, N
   * passed" and the gate that was never measured simply was not there. The
   * report asserted completeness it had not earned.
   *
   * An unmeasured gate is not a passing gate. It appears, it says so, and it
   * does not count toward the passed tally.
   */
  const sec = gr.renderQualityGatesSection({ qualityGates: { M1_matchRate: { current: null } } });
  assert.ok(Array.isArray(sec), 'the section was omitted — an absent gate reads as a passing one');
  const text = sec.join('\n');
  assert.match(text, /M1/, 'the unmeasured gate is missing from the table');
  assert.match(text, /not measured/, 'the row does not say the gate was never measured');
  assert.match(text, /0 passed/, 'an unmeasured gate must not count as passed');
  assert.match(text, /1 not measured/, 'the heading does not disclose the unmeasured count');
});

test('TC-F3-3-R9: a sprint with NO registered gates omits the section', async () => {
  // Still correct, and now the only case that omits it: there is genuinely
  // nothing to report, as distinct from a gate that exists and was not measured.
  const minimal = { id: 'min', name: 'Min', phase: 'archived', status: 'archived', context: {}, features: [], featureMap: {}, qualityGates: {}, kpi: {}, phaseHistory: [], iterateHistory: [] };
  const r = await gr.generateReport(minimal);
  assert.ok(!r.reportContent.includes('## Quality Gates'), 'should omit section when no gates are registered at all');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
