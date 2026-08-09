#!/usr/bin/env node
'use strict';

/*
 * scanner-comment-blindness.test.js — v2.1.34
 *
 * Found by running `/pdca qa` — the orchestrator this release was supposed to
 * use and initially did not.
 *
 * ## What was wrong
 *
 * `lib/qa/utils/pattern-matcher.js` scanned every line of a file for
 * `require('…')`, comments included. A JSDoc block documenting a module's
 * calling site —
 *
 *     Calling site (scripts/unified-bash-pre.js):
 *       const { detect } = require('../lib/defense/heredoc-detector');
 *
 * — was read as a real require and resolved relative to the WRONG file, then
 * reported CRITICAL "require target not found". `scripts/check-deadcode.js`
 * failed against itself twice, because the comment explaining its own regex
 * carries `require('./foo')` and `require("../lib/x.js")` as examples.
 *
 * Five of the six CRITICALs in bkit's pre-release scan were this. And
 * `scripts/qa/pre-release-check.sh` exits 1 on any CRITICAL, so `/pdca qa`
 * reported `RESULT: BLOCKED — fix critical issues before release` on every run
 * and could never reach L1. **A gate that is permanently red is as
 * uninformative as one that is permanently green**, and this one was hiding the
 * sixth finding, which was real:
 *
 * `scripts/lib/sprint-handlers-core.js` did `require('./sprint-memory-writer')`
 * while the module lives at `scripts/sprint-memory-writer.js`, one directory
 * up. Every sprint archive threw MODULE_NOT_FOUND into a best-effort catch, so
 * the MEMORY.md auto-update never ran once, and the only trace was a
 * `memoryReason` field nobody reads.
 *
 * Both halves are locked here, because either one alone would let the pair
 * recur: a scanner that cries wolf gets ignored, and then the real wolf walks in.
 */

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const { extractRequires } = require(
  path.join(PROJECT_ROOT, 'lib', 'qa', 'utils', 'pattern-matcher')
);

let pass = 0;
const failures = [];
function test(name, fn) {
  try { fn(); pass++; } catch (e) { failures.push(`${name}: ${e.message}`); }
}

const paths = (src) => extractRequires(src).map((r) => r.path);

test('SCB-1 a require inside a JSDoc block is not a require', () => {
  const src = [
    '/**',
    ' * Calling site (scripts/unified-bash-pre.js):',
    " *   const { detect } = require('../lib/defense/heredoc-detector');",
    ' */',
    "const real = require('./actually-required');",
  ].join('\n');
  assert.deepStrictEqual(
    paths(src), ['./actually-required'],
    'documenting a require must not be indistinguishable from making one'
  );
});

test('SCB-2 a require inside a line comment is not a require', () => {
  const src = [
    "// Pattern 1: direct string-literal require — `require('./foo')` / `require(\"../lib/x.js\")`",
    "const real = require('./actually-required');",
  ].join('\n');
  assert.deepStrictEqual(paths(src), ['./actually-required']);
});

test('SCB-3 a trailing comment does not hide a real require on the same line', () => {
  const src = "const real = require('./actually-required'); // see also require('./example')";
  assert.deepStrictEqual(
    paths(src), ['./actually-required'],
    'stripping the comment must not take the code before it'
  );
});

test('SCB-4 a URL inside a require survives comment stripping', () => {
  // `//` in `http://` is not a comment. Getting this wrong would swap one
  // false negative for another.
  const src = "const x = require('./a'); const y = 'http://example.com';";
  assert.deepStrictEqual(paths(src), ['./a']);
});

test('SCB-5 a single-line block comment does not swallow the rest of the line', () => {
  const src = "const a = require('./one'); /* require('./ignored') */ const b = require('./two');";
  assert.deepStrictEqual(paths(src), ['./one', './two']);
});

test('SCB-6 the four real files that reported CRITICAL now report none', () => {
  const { resolveRequirePath } = require(
    path.join(PROJECT_ROOT, 'lib', 'qa', 'utils', 'file-resolver')
  );
  const files = [
    'lib/defense/heredoc-detector.js',
    'lib/defense/push-event-guard.js',
    'scripts/check-deadcode.js',
    'scripts/lib/sprint-handlers-core.js',
  ];
  const stale = [];
  for (const rel of files) {
    const abs = path.join(PROJECT_ROOT, rel);
    for (const req of extractRequires(fs.readFileSync(abs, 'utf8'))) {
      if (!req.path.startsWith('.') && !req.path.startsWith('/')) continue;
      if (!resolveRequirePath(abs, req.path)) stale.push(`${rel}:${req.line} ${req.path}`);
    }
  }
  assert.deepStrictEqual(
    stale, [],
    `unresolvable requires: ${stale.join(', ')}`
  );
});

test('SCB-7 the sprint MEMORY.md writer is reachable from its caller', () => {
  /*
   * The real defect the false positives were hiding. Asserted by resolving the
   * require the way Node does, from the requiring file — not by checking that
   * the module exists somewhere, which was true all along and is exactly why
   * nothing noticed.
   */
  const caller = path.join(PROJECT_ROOT, 'scripts', 'lib', 'sprint-handlers-core.js');
  const src = fs.readFileSync(caller, 'utf8');
  const m = src.match(/require\(['"]([^'"]*sprint-memory-writer)['"]\)/);
  assert.ok(m, 'sprint-handlers-core.js no longer requires the memory writer at all');

  let resolved = null;
  try {
    resolved = require.resolve(m[1], { paths: [path.dirname(caller)] });
  } catch (_) { /* stays null */ }
  assert.ok(
    resolved,
    `require('${m[1]}') does not resolve from ${path.relative(PROJECT_ROOT, caller)}. `
      + 'It throws MODULE_NOT_FOUND into a best-effort catch, so every sprint archive '
      + 'silently skips its MEMORY.md entry.'
  );
});

test('SCB-8 the pre-release gate is not permanently blocked', () => {
  /*
   * The property that matters more than any individual finding. If the CRITICAL
   * count is non-zero for reasons nobody intends to fix, `/pdca qa` can never
   * run, and the release process routes around its own quality gate.
   */
  const DeadCodeScanner = require(
    path.join(PROJECT_ROOT, 'lib', 'qa', 'scanners', 'dead-code')
  );
  const scanner = new DeadCodeScanner({ rootDir: PROJECT_ROOT });
  scanner.reset();
  scanner.scanStaleRequires();
  const critical = scanner.issues.filter((i) => i.severity === 'CRITICAL');
  assert.deepStrictEqual(
    critical.map((c) => `${c.file}:${c.line} ${c.message}`),
    [],
    'the dead-code scanner reports CRITICAL findings, and pre-release-check.sh '
      + 'exits 1 on any CRITICAL — so /pdca qa is blocked before L1 on every run'
  );
});

if (failures.length > 0) {
  console.error(`\n✗ scanner-comment-blindness: ${failures.length} failing assertion(s)`);
  for (const f of failures) console.error(`    ✗ ${f}`);
  console.error(`\npass:${pass} fail:${failures.length} skip:0`);
  process.exit(1);
}
console.log(`✓ scanner-comment-blindness — pass:${pass} fail:0 skip:0`);
