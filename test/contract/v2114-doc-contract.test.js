'use strict';

/**
 * v2114-doc-contract.test.js — L3 Contract Tests (Sub-Sprint 5 Doc).
 *
 *   C-01  docs/06-guide/version-policy.guide.md exists (ENH-309)
 *   C-02  docs/06-guide/cc-version-monitoring.guide.md exists (ENH-306+296)
 *   C-03  docs/adr/0010-effort-aware-invariant.md exists (Sub-Sprint 4 carry)
 *   C-04  scripts/check-skill-frontmatter.js exists + 1536-char cap (ENH-291)
 *   C-05  agents/cc-version-researcher.md includes R-Series Tracker section
 *   C-06  agents/cc-version-researcher.md includes release_drift_score formula
 *   C-07  agents/cc-version-researcher.md includes 6-differentiation table
 *   C-08  version-policy guide enumerates dist-tag 3-Bucket Framework
 *   C-09  cc-version-monitoring guide enumerates ≥12 R-3 evolved-form entries
 *   C-10  ADR 0010 references ADR 0003 + ENH-307
 *
 * @version 2.1.14
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '../..');

let passed = 0, failed = 0;

function record(name, fn) {
  try { fn(); passed += 1; console.log('  ✅ ' + name + ' PASS'); }
  catch (e) { failed += 1; console.log('  ❌ ' + name + ' FAIL: ' + e.message); }
}

function readFile(rel) {
  return fs.readFileSync(path.join(projectRoot, rel), 'utf8');
}

console.log('\n📋 v2.1.14 Sub-Sprint 5 (Doc) Contract Tests\n');

record('C-01 version-policy.guide.md exists (ENH-309)', () => {
  assert.ok(fs.existsSync(path.join(projectRoot, 'docs/06-guide/version-policy.guide.md')));
});

record('C-02 cc-version-monitoring.guide.md exists (ENH-306+296)', () => {
  assert.ok(fs.existsSync(path.join(projectRoot, 'docs/06-guide/cc-version-monitoring.guide.md')));
});

record('C-03 docs/adr/0010-effort-aware-invariant.md exists', () => {
  assert.ok(fs.existsSync(path.join(projectRoot, 'docs/adr/0010-effort-aware-invariant.md')));
});

record('C-04 check-skill-frontmatter.js exists + 1536-char cap', () => {
  assert.ok(fs.existsSync(path.join(projectRoot, 'scripts/check-skill-frontmatter.js')));
  const m = require(path.join(projectRoot, 'scripts/check-skill-frontmatter'));
  assert.equal(m.SKILL_DESCRIPTION_CAP, 1536);
  assert.notEqual(m.SKILL_DESCRIPTION_CAP, 250);
});

record('C-05 cc-version-researcher.md includes R-Series Tracker section', () => {
  const src = readFile('agents/cc-version-researcher.md');
  assert.ok(/R-Series Regression Tracker/.test(src));
  assert.ok(/numbered violation/.test(src));
  assert.ok(/evolved form/.test(src));
});

record('C-06 cc-version-researcher.md includes release_drift_score formula', () => {
  const src = readFile('agents/cc-version-researcher.md');
  assert.ok(/release_drift_score/.test(src));
  assert.ok(/dist-tag\(stable\)/.test(src) || /dist-tag/.test(src));
});

/*
 * C-07 (v2.1.37, ENH-432) — this test is the reason the withdrawn claim survived
 * three releases.
 *
 * It asserted that the string "PostToolUse continueOnBlock" appeared in a
 * markdown file. That is true of a claim nobody implemented, true of a claim
 * nobody CAN implement, and true of a claim that is simply wrong — so it passed
 * while bkit advertised a differentiation that was unreachable by construction:
 * `continueOnBlock` is a field on a PROMPT-type hook definition, and all bkit
 * hook handlers are `"type": "command"`.
 *
 * A regex over source text does not verify a feature. The replacement asserts
 * the property that actually matters — that every differentiation bkit claims is
 * one it can reach — and it is written so that reinstating an unreachable claim
 * fails here rather than shipping.
 */
record('C-07 cc-version-researcher.md lists the 5 surviving differentiations', () => {
  const src = readFile('agents/cc-version-researcher.md');
  for (const name of ['Memory Enforcer', 'Defense Layer 6', 'Sequential dispatch',
    'Effort-aware', 'Heredoc']) {
    assert.ok(new RegExp(name).test(src), `differentiation missing: ${name}`);
  }
});

record('C-07b the withdrawn differentiation is not advertised anywhere', () => {
  // Three surfaces carried it: the agent's table, the marketplace description a
  // user reads before installing, and a code comment claiming the emission.
  const researcher = readFile('agents/cc-version-researcher.md');
  const table = researcher.slice(0, researcher.indexOf('**Withdrawn'));
  assert.ok(!/\|\s*\d\s*\|\s*PostToolUse continueOnBlock/.test(table),
    'the differentiation table still lists PostToolUse continueOnBlock');

  const marketplace = readFile('.claude-plugin/marketplace.json');
  assert.ok(!/6 differentiations \([^)]*continueOnBlock/.test(marketplace),
    'marketplace.json still advertises continueOnBlock as a differentiation');
});

record('C-07c bkit cannot emit continueOnBlock, so nothing claims it does', () => {
  // The behavioural half. `continueOnBlock` is read off a hook DEFINITION by
  // Claude Code, and only for prompt-type hooks — so a command-type hook has no
  // way to set it, whatever it writes to stdout. This asserts the precondition
  // rather than the prose: if bkit ever ships a prompt-type hook, this test
  // fails and the claim can be re-examined on evidence.
  const hooks = JSON.parse(readFile('hooks/hooks.json'));
  const types = new Set();
  for (const blocks of Object.values(hooks.hooks || {})) {
    for (const block of blocks) for (const h of (block.hooks || [])) types.add(h.type);
  }
  assert.deepEqual([...types], ['command'],
    'a non-command hook type would change whether continueOnBlock is reachable');

  // And no runtime module may claim to emit it.
  for (const file of ['scripts/unified-bash-post.js', 'lib/audit/audit-logger.js']) {
    const src = readFile(file);
    const claims = src.split('\n').filter((l) =>
      /continueOnBlock/.test(l) && /emit|emitted|produces|sets/i.test(l) && !/never|not|cannot|could/i.test(l));
    assert.deepEqual(claims, [], `${file} still claims to emit continueOnBlock`);
  }
});

record('C-07d the audit trail declares no action type nothing can write', () => {
  // `post_tool_block_recorded` was declared for this feature and never written.
  // The old defense-contract test asserted it EXISTED, which is how it survived.
  const { ACTION_TYPES } = require(require('path').join(projectRoot, 'lib/audit/audit-logger'));
  assert.ok(!ACTION_TYPES.includes('post_tool_block_recorded'),
    'post_tool_block_recorded records a block decision bkit cannot make');
});

record('C-08 version-policy guide enumerates dist-tag 3-Bucket Framework', () => {
  const src = readFile('docs/06-guide/version-policy.guide.md');
  assert.ok(/3-Bucket Decision Framework/.test(src));
  assert.ok(/`stable`/.test(src));
  assert.ok(/`latest`/.test(src));
  assert.ok(/`next`/.test(src));
});

record('C-09 monitoring guide lists ≥12 R-3 evolved-form entries', () => {
  const src = readFile('docs/06-guide/cc-version-monitoring.guide.md');
  const matches = src.match(/evolved form #\d+/g) || [];
  assert.ok(matches.length >= 12, 'expected ≥12 evolved-form entries, found ' + matches.length);
});

record('C-10 ADR 0010 references ADR 0003 + ENH-307', () => {
  const src = readFile('docs/adr/0010-effort-aware-invariant.md');
  assert.ok(/ADR 0003/.test(src));
  assert.ok(/ENH-307/.test(src));
  assert.ok(/invariant 9.*10/.test(src) || /9 → 10/.test(src) || /9.*→.*10/.test(src));
});

console.log('\n📊 Summary: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
process.exit(0);
