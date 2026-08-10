/**
 * test-manifest-integrity.test.js — every file the runner claims to run must exist
 *
 * `test/run-all.js` carries a hand-maintained manifest. When v2.1.16 deleted 31
 * stale tests it removed the files and left four manifest entries behind, so for
 * 19 releases the runner reported
 *
 *   - **unit/context-loader.test.js**: File not found
 *
 * in its generated report while `runTestFile()` counted the same entry as a
 * *skip*, not a failure. The report therefore listed failures it did not count
 * and counted failures it did not list — the exact shape of problem this
 * release is about: a claim that nobody re-measured.
 *
 * Covers docs/02-design/features/v2135-security-hardening.design.en.md §ENH-431.
 *
 * @module test/contract/test-manifest-integrity.test
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const TEST_DIR = path.join(ROOT, 'test');
const RUN_ALL = path.join(TEST_DIR, 'run-all.js');

/** Strip comments so a deliberately disabled entry is not read as a live one. */
function activeSource(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

const MANIFEST_ENTRY = /'([a-z0-9-]+(?:\/[a-z0-9._-]+)*\.test\.js)'/gi;

function manifestEntries() {
  const src = activeSource(fs.readFileSync(RUN_ALL, 'utf8'));
  return [...new Set([...src.matchAll(MANIFEST_ENTRY)].map((m) => m[1]))];
}

test('TMI-1 the manifest is being parsed, not silently matching nothing', () => {
  // A scan that matches zero entries would pass TMI-2 forever.
  const entries = manifestEntries();
  assert.ok(entries.length > 100, `expected >100 manifest entries, parsed ${entries.length}`);
});

test('TMI-2 every manifest entry points at a file that exists', () => {
  const missing = manifestEntries().filter((rel) => !fs.existsSync(path.join(TEST_DIR, rel)));
  assert.deepEqual(
    missing, [],
    'run-all.js lists test files that do not exist. Delete the entry, or restore the file:\n'
      + missing.map((m) => `  ${m}`).join('\n'),
  );
});

test('TMI-3 a missing file is reported as a failure, not a skip', () => {
  /*
   * TMI-2 keeps the manifest clean; this keeps the runner honest if it ever
   * drifts again. `runTestFile()` returned `{ failed: 0, skipped: 1 }` alongside
   * a failure entry, which is how four orphans stayed invisible in the totals
   * for 19 releases.
   */
  const src = fs.readFileSync(RUN_ALL, 'utf8');
  const idx = src.indexOf("message: 'File not found'");
  assert.ok(idx > -1, 'run-all.js no longer has a missing-file branch — update this contract');

  const branch = src.slice(Math.max(0, idx - 240), idx);
  assert.match(
    branch, /failed:\s*1/,
    'a manifest entry with no file must count as failed:1, not skipped',
  );
});
