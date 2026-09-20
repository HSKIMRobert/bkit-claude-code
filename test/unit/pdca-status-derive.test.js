/**
 * Unit tests — document-derived PDCA phase (Issue #156)
 *
 * Two things the report's symptom rests on, both mechanical:
 *   1. a feature whose phase nothing recorded is still readable from its docs
 *   2. the feature name is recoverable from a doc path in a phase's output
 *
 * @module test/unit/pdca-status-derive
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

/** A project with the given doc files, and the lib loaded against it.
 *
 * `CLAUDE_PROJECT_DIR` is read once per module load (lib/core/platform.js), so
 * the cache is dropped to make each project its own. */
function inProject(files, fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bkit-derive-'));
  for (const rel of files) {
    const p = path.join(root, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, '# doc\n');
  }

  const before = process.env.CLAUDE_PROJECT_DIR;
  process.env.CLAUDE_PROJECT_DIR = root;
  for (const k of Object.keys(require.cache)) if (k.includes(`${path.sep}lib${path.sep}`)) delete require.cache[k];
  try {
    return fn(require('../../lib/pdca/status'), root);
  } finally {
    if (before === undefined) delete process.env.CLAUDE_PROJECT_DIR;
    else process.env.CLAUDE_PROJECT_DIR = before;
    for (const k of Object.keys(require.cache)) if (k.includes(`${path.sep}lib${path.sep}`)) delete require.cache[k];
  }
}

test('a plan document alone gives the feature and its phase, with no status file', () => {
  inProject(['docs/01-plan/features/user-auth.plan.md'], (s) => {
    assert.equal(s.getPdcaStatusFull(), null, 'nothing recorded it');
    const view = s.getPdcaStatusView();
    assert.equal(view.features['user-auth'].phase, 'plan');
    assert.equal(view.features['user-auth'].source, 'documents');
    assert.deepEqual(view.derivedOnly, ['user-auth']);
  });
});

test('the feature is recovered from a doc path in a phase output', () => {
  inProject(['docs/01-plan/features/user-auth.plan.md'], (s) => {
    assert.equal(s.featureFromDocPaths('Document: docs/01-plan/features/user-auth.plan.md'), 'user-auth');
    // A path the output only proposed is not a document this project has.
    assert.equal(s.featureFromDocPaths('will write docs/01-plan/features/not-yet.plan.md'), '');
    assert.equal(s.featureFromDocPaths('nothing here'), '');
  });
});

test('an ambiguous output defers to the recorded feature rather than moving the phase', () => {
  inProject(
    ['docs/01-plan/features/alpha.plan.md', 'docs/01-plan/features/beta.plan.md'],
    (s) => {
      const text = 'see docs/01-plan/features/alpha.plan.md and docs/01-plan/features/beta.plan.md';
      assert.equal(s.featureFromDocPaths(text, 'alpha'), 'alpha');
    }
  );
});
