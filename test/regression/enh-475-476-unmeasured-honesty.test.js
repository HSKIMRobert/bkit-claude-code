/**
 * enh-475-476-unmeasured-honesty.test.js — a gate that could not be measured
 * says so, and says why.
 *
 * ENH-476 / ENH-475 (v2.1.37).
 *
 * gap-detector.adapter.js already knew the difference between "we compared and
 * found little" and "nothing was compared": `unmeasured()` returns
 * `matchRate: null, measured: false`, and v2.1.34 introduced it precisely
 * because reporting a score for an absent measurement had certified a feature
 * that did not exist. But only ONE of the five ways a comparison can fail to
 * happen used it — the missing-runner case. The other four returned
 * `matchRate: 0, measured: true`, which asserts two things that are both false:
 * that a comparison ran, and that it scored zero.
 *
 * The cost was not only the wrong number. `isMeasured()` in
 * iterate-sprint.usecase.js accepts any finite matchRate, so a 0 from
 * `parse_fail` looked like a real measurement and the iterate loop went on to
 * run auto-fix up to maxIterations against a gap list whose one entry was
 * "no JSON in output" — the exact waste that use case's own comment warns
 * about. Reported honestly, the loop exits immediately AND still fails the
 * gate: `M1_matchRate.passed` becomes `false`, not `null`, so QUALITY_GATE_FAIL
 * fires and the phase stays blocked. Honest is also safe here; it is not a
 * trade.
 *
 * ENH-475 is the other half: on Claude Code v2.1.232+ the overwhelmingly likely
 * reason a subagent returns nothing is that fork mode is on by default and the
 * result arrives in a later turn. "no JSON in output" sends the reader hunting
 * for a formatting bug that is not there.
 *
 * @module test/regression/enh-475-476-unmeasured-honesty.test
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const adapter = require('../../lib/infra/sprint/gap-detector.adapter');

/** Run a body with a temporarily patched process.env. */
function withEnv(patch, body) {
  const saved = {};
  for (const k of Object.keys(patch)) {
    saved[k] = process.env[k];
    if (patch[k] === undefined) delete process.env[k];
    else process.env[k] = patch[k];
  }
  try { return body(); } finally {
    for (const k of Object.keys(patch)) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

// ---------------------------------------------------------------------------
// ENH-476 — every "nothing was compared" path reports the absence of a
// measurement, not a score.
// ---------------------------------------------------------------------------

const NOTHING_COMPARED = [
  ['a null result', null, 'no_output'],
  ['a result with no output field', {}, 'no_output'],
  ['an empty output string', { output: '' }, 'no_output'],
  ['whitespace-only output', { output: '   \n  ' }, 'no_output'],
  ['prose with no JSON object', { output: 'I could not find the design document.' }, 'parse_fail'],
  ['a JSON-shaped block that does not parse', { output: '{ matchRate: }' }, 'json_invalid'],
];

for (const [label, input, expectedId] of NOTHING_COMPARED) {
  test(`${label} reports no measurement, not a zero score`, () => {
    const r = adapter.parseGapDetectorOutput(input);
    assert.equal(r.matchRate, null,
      'a score claims a comparison happened; null is the absence of one');
    assert.equal(r.measured, false);
    assert.equal(r.gaps[0].id, expectedId);
  });
}

test('a real comparison keeps reporting its number', () => {
  const r = adapter.parseGapDetectorOutput({ output: '{"matchRate":72,"gaps":[]}' });
  assert.equal(r.matchRate, 72);
  assert.equal(r.measured, true);
});

test('ENH-412 still rules an unusable number inside valid JSON', () => {
  // A comparison DID run here — the agent returned a parseable result and named
  // a match rate. That the figure is unusable makes it 0, the failing end, which
  // is ENH-412's ruling and is deliberately NOT changed by ENH-476.
  for (const bad of ['"abc"', 'null', 'true']) {
    const r = adapter.parseGapDetectorOutput({ output: `{"matchRate":${bad},"gaps":[]}` });
    assert.equal(r.matchRate, 0, `matchRate ${bad} must read as 0, not as unmeasured`);
    assert.equal(r.measured, true, 'a comparison ran; only the number was unusable');
  }
  // And an implausible figure is clamped rather than trusted.
  const high = adapter.parseGapDetectorOutput({ output: '{"matchRate":999,"gaps":[]}' });
  assert.equal(high.matchRate, 100);
  assert.equal(high.measured, true);
});

test('a runner that throws reports no measurement and names the failure', async () => {
  const detector = adapter.createGapDetector({
    projectRoot: '/tmp',
    agentTaskRunner: async () => { throw new Error('spawn refused'); },
  });
  const r = await detector({ id: 's1', phase: 'iterate' });
  assert.equal(r.matchRate, null);
  assert.equal(r.measured, false);
  assert.equal(r.gaps[0].id, 'runner_error');
  assert.match(r.gaps[0].description, /spawn refused/);
});

test('the missing-runner path keeps its own id', async () => {
  const detector = adapter.createGapDetector({ projectRoot: '/tmp' });
  const r = await detector({ id: 's1' });
  assert.equal(r.matchRate, null);
  assert.equal(r.measured, false);
  assert.equal(r.gaps[0].id, 'no_agent_runner',
    'a runner that was never injected is a different diagnosis from one that failed');
});

// ---------------------------------------------------------------------------
// ENH-476, second half — the honest encoding must still FAIL the gate, not skip
// it. This is the assertion that makes the change safe rather than merely tidy.
// ---------------------------------------------------------------------------

test('an unmeasured result routes the iterate loop to blocked, not to a pass', async () => {
  const { iterateSprint } = require('../../lib/application/sprint-lifecycle/iterate-sprint.usecase');
  const sprint = {
    id: 'sprint-1', phase: 'iterate', iterateHistory: [],
    kpi: {}, qualityGates: { M1_matchRate: { current: null, threshold: 90, passed: null } },
  };
  const result = await iterateSprint(sprint, {
    gapDetector: async () => adapter.parseGapDetectorOutput({ output: '' }),
    autoFixer: async () => { throw new Error('auto-fix must not run against a gap nobody detected'); },
  });
  assert.equal(result.measured, false);
  assert.equal(result.finalMatchRate, null);
  assert.equal(result.blocked, true, 'the phase must stay blocked');
  assert.equal(result.iterations, 0, 'the loop must not burn iterations on a non-gap');
  assert.equal(result.sprint.qualityGates.M1_matchRate.passed, false,
    '`false` fires QUALITY_GATE_FAIL; `null` would read as not-applicable and sail past it');
});

// ---------------------------------------------------------------------------
// ENH-475 — name fork mode when it is the likely cause.
// ---------------------------------------------------------------------------

test('empty subagent output names fork mode as a lead', () => {
  withEnv({ CLAUDE_CODE_FORK_SUBAGENT: undefined, CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: undefined }, () => {
    const r = adapter.parseGapDetectorOutput({ output: '' });
    assert.match(r.gaps[0].description, /fork mode/,
      'the reader should not have to rediscover the v2.1.232 default themselves');
    assert.match(r.gaps[0].description, /CLAUDE_CODE_FORK_SUBAGENT=0/,
      'a cause without a remedy is half a message');
  });
});

test('the fork-mode lead is suppressed once the user has mitigated it', () => {
  for (const patch of [
    { CLAUDE_CODE_FORK_SUBAGENT: '0', CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: undefined },
    { CLAUDE_CODE_FORK_SUBAGENT: 'false', CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: undefined },
    { CLAUDE_CODE_FORK_SUBAGENT: undefined, CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: '1' },
  ]) {
    withEnv(patch, () => {
      const r = adapter.parseGapDetectorOutput({ output: '' });
      assert.doesNotMatch(r.gaps[0].description, /fork mode/,
        'fork mode is off here, so naming it would send the reader down a dead end');
    });
  }
});

test('the factual part of the message survives with or without the lead', () => {
  withEnv({ CLAUDE_CODE_FORK_SUBAGENT: '0' }, () => {
    const r = adapter.parseGapDetectorOutput({ output: '' });
    assert.match(r.gaps[0].description, /nothing was compared/);
  });
});

test('a runner error does NOT get the fork-mode lead', () => {
  // Fork mode produces empty output, not a thrown error. Attaching the lead here
  // would be a guess dressed as a diagnosis.
  return withEnv({ CLAUDE_CODE_FORK_SUBAGENT: undefined }, async () => {
    const detector = adapter.createGapDetector({
      projectRoot: '/tmp',
      agentTaskRunner: async () => { throw new Error('boom'); },
    });
    const r = await detector({ id: 's1' });
    assert.doesNotMatch(r.gaps[0].description, /fork mode/);
  });
});

// ---------------------------------------------------------------------------
// ENH-475 — all five spawn sites, not just the one that was easiest to reach.
// The report named three; auditing the surface found five. A fix applied to a
// subset is how the next reader concludes the pattern was handled.
// ---------------------------------------------------------------------------

test('measure-router names fork mode on both empty-result shapes', () => {
  const router = require('../../lib/application/quality-gates/measure-router');
  withEnv({ CLAUDE_CODE_FORK_SUBAGENT: undefined, CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: undefined }, () => {
    for (const [label, input, reason] of [
      ['empty output', { output: '' }, 'no_output'],
      ['no JSON', { output: 'nothing to report' }, 'no_json'],
    ]) {
      const r = router.parseAgentOutput(input);
      assert.equal(r.ok, false, label);
      assert.equal(r.reason, reason, label);
      assert.match(r.error, /fork mode/, `${label}: reason alone is not a diagnosis`);
    }
  });
});

test('measure-router keeps failing closed on an unusable value, without the lead', () => {
  const router = require('../../lib/application/quality-gates/measure-router');
  const r = router.parseAgentOutput({ output: '{"value":"abc"}' });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'invalid_value');
  assert.doesNotMatch(r.error || '', /fork mode/,
    'the agent DID answer here; fork mode is not the explanation');
});

test('auto-fixer no longer reports "zero fixes" silently', () => {
  const fixer = require('../../lib/infra/sprint/auto-fixer.adapter');
  withEnv({ CLAUDE_CODE_FORK_SUBAGENT: undefined, CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: undefined }, () => {
    for (const input of [{ output: '' }, { output: 'no json here' }, null]) {
      const r = fixer.parseAutoFixerOutput(input);
      assert.deepEqual(r.fixedTaskIds, [], 'the consumed field keeps its shape');
      assert.ok(r.error, 'an iterate cycle that did nothing must not look like one with nothing to do');
      assert.match(r.error, /fork mode/);
    }
  });
});

test('auto-fixer stays silent when the agent genuinely had nothing to fix', () => {
  const fixer = require('../../lib/infra/sprint/auto-fixer.adapter');
  const r = fixer.parseAutoFixerOutput({ output: '{"fixedTaskIds":[]}' });
  assert.deepEqual(r.fixedTaskIds, []);
  assert.equal(r.error, undefined, 'a real empty answer is not a failure');
});

test('master-plan names fork mode instead of describing a type signature', async () => {
  const os = require('os');
  const fs = require('fs');
  const path = require('path');
  const { generateMasterPlan } = require('../../lib/application/sprint-lifecycle/master-plan.usecase');

  // A scratch root so the idempotency check finds nothing and no real state is
  // touched. This is the entry point of a sprint: a user who hits this failure
  // has no artifact to inspect, which is why the message has to carry the cause.
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bkit-enh475-'));
  try {
    const result = await withEnv(
      { CLAUDE_CODE_FORK_SUBAGENT: undefined, CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: undefined },
      () => generateMasterPlan(
        { projectId: 'enh-475-probe', projectName: 'ENH-475 probe', features: ['f1'], projectRoot },
        { agentSpawner: async () => ({ output: '' }) },
      ),
    );
    assert.equal(result.ok, false);
    assert.doesNotMatch(result.error, /expected \{ output: string \}/,
      'a type signature is not something a user can act on');
    assert.match(result.error, /fork mode/);
    assert.match(result.error, /CLAUDE_CODE_FORK_SUBAGENT=0/);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});
