#!/usr/bin/env node
'use strict';

/*
 * state-schema-keys.test.js — v2.1.34
 *
 * Production code must not read keys that the current PDCA state schema does
 * not have.
 *
 * ## Why
 *
 * Reading a renamed key is not a crash. It is `undefined`, and `undefined`
 * flows onward as a falsy fallback, an empty string, or a condition that never
 * fires — so the feature it guards simply stops happening and nothing reports
 * it. That is this release's defining failure mode, and the state schema turned
 * out to be riddled with it:
 *
 *   - `scripts/pdca-doc-changed-handler.js` read `pdcaStatus.currentPhase`,
 *     which does not exist; the phase lives at
 *     `features[primaryFeature].phase`. The handler's guard was permanently
 *     false — one of five independent reasons it never spoke.
 *   - `currentFeature` was renamed to `primaryFeature` by the v3 migration.
 *     FIVE production sites still read the old name:
 *       lib/orchestrator/skill-invocation-effects.js (×2)
 *       lib/orchestrator/runtime-guidance.js
 *       scripts/unified-write-post.js  — the file_change_count metric was
 *         behind `if (pdcaStatus.currentFeature)`, so it was never collected
 *       scripts/code-review-stop.js    — every suggestion branch fell through
 *
 * `scripts/pre-write.js` had carried a comment since v2.1.15 stating plainly
 * that `currentFeature` does not exist on v2/v3. Someone knew, fixed one site,
 * and left five. **A note describing a defect is not a fix for the other places
 * it lives** — which is precisely why this belongs in a test rather than a
 * comment.
 *
 * ## Scope
 *
 * Retired keys only, on the live status object. The migration module is exempt:
 * reading the OLD schema is its entire job.
 */

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

let pass = 0;
const failures = [];
function test(name, fn) {
  try { fn(); pass++; } catch (e) { failures.push(`${name}: ${e.message}`); }
}

/**
 * Keys that once existed on the PDCA status object and no longer do, with
 * where the value actually lives now.
 */
const RETIRED_KEYS = {
  currentFeature: 'primaryFeature (renamed by the v3 migration)',
  currentPhase: 'features[primaryFeature].phase',
  currentState: 'features[<feature>].phase',
};

/** Files allowed to name a retired key, and why. */
const EXEMPT = new Set([
  // Reading the v1/v2 shape is what migration is for.
  'lib/pdca/status-migration.js',
  // This suite names every retired key by definition.
  'test/contract/state-schema-keys.test.js',
]);

const ROOTS = ['lib', 'scripts', 'hooks', 'servers'];

/** @returns {string[]} repo-relative .js paths under `dir` */
function walk(dir) {
  const out = [];
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return out; }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else if (e.name.endsWith('.js')) out.push(full);
  }
  return out;
}

/**
 * Source with comment CONTENT blanked but line structure preserved.
 *
 * A note about a retired key stays legal, and reported line numbers still point
 * at the real source — deleting comments outright shifted every line below them
 * and made the first draft of this suite cite the wrong lines.
 */
function codeOnly(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"\w])\/\/.*$/gm, (m, p1) => p1 + ' '.repeat(m.length - p1.length));
}

/**
 * Identifiers that hold a PDCA *status* object.
 *
 * Scoping matters more than it looks. `currentState` is a perfectly real field
 * of the state-machine CONTEXT (`lib/pdca/state-machine.js` writes it), and
 * `currentPhase` is a legitimate local in a dozen handlers. Flagging every
 * object's field found fifteen innocent lines and would have taught the next
 * reader to skip this suite — the first draft did exactly that.
 *
 * Every real defect this suite exists for read the status object through one of
 * these names.
 */
const STATUS_RECEIVER = '(?:pdcaStatus|currentStatus|statusFull|getPdcaStatusFull\\(\\)|loadPdcaStatus\\(\\))';

const files = ROOTS.flatMap((r) => walk(path.join(PROJECT_ROOT, r)));

test('SSK-0 the walk found production files to check', () => {
  // Without a floor, a misconfigured walk reports a clean bill of health for
  // an empty set — the shape of failure this whole suite is about.
  assert.ok(
    files.length >= 100,
    `only ${files.length} production files walked; the roots are misconfigured`
  );
});

for (const [key, livesAt] of Object.entries(RETIRED_KEYS)) {
  test(`SSK retired key \`${key}\` is not read anywhere in production`, () => {
    const offenders = [];
    for (const abs of files) {
      const rel = path.relative(PROJECT_ROOT, abs);
      if (EXEMPT.has(rel)) continue;
      const code = codeOnly(fs.readFileSync(abs, 'utf8'));
      // `pdcaStatus.currentFeature`, `getPdcaStatusFull()?.currentFeature`,
      // `currentStatus['currentFeature']` — a status object, not any object.
      const re = new RegExp(
        `${STATUS_RECEIVER}\\s*\\??\\.\\s*${key}\\b`
        + `|${STATUS_RECEIVER}\\s*\\??\\[\\s*['"]${key}['"]\\s*\\]`
      );
      const lines = code.split('\n');
      lines.forEach((l, i) => {
        if (re.test(l)) offenders.push(`${rel}:${i + 1}`);
      });
    }
    assert.deepStrictEqual(
      offenders, [],
      `these read \`${key}\`, which the current schema does not have — the value is at `
        + `${livesAt}. Reading it yields undefined, which does not throw: the guard it `
        + `feeds simply never fires and nothing reports it.\n  ${offenders.join('\n  ')}`
    );
  });
}

test('SSK-LIVE the live status object really lacks the retired keys', () => {
  /*
   * The list above is only worth anything if these keys are genuinely absent.
   * Asserting against the real state module keeps the ban honest — if a future
   * schema reintroduces `currentFeature`, this fails and the entry should be
   * removed rather than the code contorted around it.
   */
  const { getPdcaStatusFull } = require(path.join(PROJECT_ROOT, 'lib', 'pdca', 'status'));
  let status;
  try { status = getPdcaStatusFull(); } catch (_) { status = null; }
  if (!status || typeof status !== 'object') return; // no state in this checkout

  const present = Object.keys(RETIRED_KEYS).filter((k) => k in status);
  assert.deepStrictEqual(
    present, [],
    `the schema now carries ${present.join(', ')} again. Update RETIRED_KEYS instead of `
      + 'leaving a ban on a key that is real.'
  );
  assert.ok(
    'primaryFeature' in status,
    'primaryFeature is missing from the status object — the replacement this suite '
      + 'points callers at does not exist'
  );
});

if (failures.length > 0) {
  console.error(`\n✗ state-schema-keys: ${failures.length} failing assertion(s)`);
  for (const f of failures) console.error(`    ✗ ${f}`);
  console.error(`\npass:${pass} fail:${failures.length} skip:0`);
  process.exit(1);
}
console.log(`✓ state-schema-keys — ${files.length} production files — pass:${pass} fail:0 skip:0`);
