#!/usr/bin/env node
/*
 * QA Aggregator — parse test file outputs and tally PASS/FAIL/SKIP.
 *
 * Design Ref: bkit-v2110 Sprint 1 QA Phase (qa-lead delegation).
 * Scope: existing test/unit + new test/contract + Sprint 1 additions.
 *
 * module: test/contract/scripts/qa-aggregate
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
/*
 * v2.1.33 (ENH-416, widened): discover every `test/` subdirectory instead of
 * naming three of them.
 *
 * This list used to be hand-maintained: `test/unit`, `test/contract`, and the
 * legacy `tests/qa`. Measured 2026-08-08, that covered 188 of 331 test files —
 * **143 files across 13 directories never ran in CI at all**, among them the
 * entire `test/security` suite (13 files) and `test/regression` (32). Nothing
 * was wrong with those tests: all 143 passed when run directly. They were
 * simply never wired in, because adding a directory required also remembering
 * to edit this array, and nobody did.
 *
 * The original ENH-416 scoped this at 22 files (`tests/contract` + `tests/unit`).
 * That was the visible part of a much larger gap.
 *
 * Enumerating the directory removes the failure mode rather than patching this
 * instance of it: a new `test/<something>/` is covered the moment it exists.
 */
function discoverTestDirs() {
  const roots = [
    { base: path.join(PROJECT_ROOT, "test"), suffix: "" },
    // Legacy tree. Only `qa` remains here — `tests/contract` and `tests/unit`
    // were migrated into `test/` in v2.1.33 (decision D3). The suffix keeps the
    // historical `qa-legacy` label intact so existing reports stay comparable.
    { base: path.join(PROJECT_ROOT, 'tests'), suffix: '-legacy' },
  ];
  const dirs = [];
  for (const { base, suffix } of roots) {
    if (!fs.existsSync(base)) continue;
    for (const name of fs.readdirSync(base).sort()) {
      const full = path.join(base, name);
      let stat;
      try { stat = fs.statSync(full); } catch (_e) { continue; }
      if (!stat.isDirectory()) continue;
      // findTestFiles walks recursively, so a directory whose tests live only in
      // nested folders (e.g. test/e2e/external-dogfood) is still picked up here.
      if (findTestFiles(full).length === 0) continue;
      dirs.push({ dir: full, label: `${name}${suffix}` });
    }
  }
  return dirs;
}

const TEST_DIRS = discoverTestDirs();

/**
 * Pre-existing expected failures tracked separately (not counted as regression).
 * v2.1.10: stderr noise from v2.1.9 (G-Q2). These exit code 0 tests emit
 * non-critical stderr that the parser picks up as fail=1 but are actually passing.
 * File paths are PROJECT_ROOT-relative.
 */
/*
 * v2.1.33: emptied. Both entries were verified green and removed.
 *
 * The list existed to stop two "stderr noise" quirks from v2.1.9 counting as
 * regressions. Re-measured 2026-08-08: project-isolation 10/10 PASS, runner
 * 79/79 PASS — the quirks had been fixed at some point and the exemptions
 * outlived them by several releases.
 *
 * That is not harmless. An exemption suppresses whatever the file reports, not
 * just the failure it was written for: during this release, an ENH-402 change
 * broke project-isolation in 7 places and the aggregate still exited 0, because
 * all 7 were absorbed here. A stale exemption is the same false-assurance shape
 * as the non-gating pipe (ENH-411) — machinery reporting success it has not
 * verified.
 *
 * Before adding an entry: fix the test, or quarantine the file out of the run
 * with a dated follow-up. An entry here must state what it hides and be
 * re-checked every release, or it will hide the next regression too.
 */
const EXPECTED_FAILURES = [];

/*
 * v2.1.33: walk nested directories too.
 *
 * This read only the immediate directory, so tests living one level down were
 * invisible even inside an aggregated directory — `test/e2e/external-dogfood`,
 * `test/unit/sprint-handler`, `test/unit/sprint-lifecycle`, `test/contract/baseline`
 * and others, 27 files in total. That is the same blind spot as the unlisted
 * directories, one level further in.
 */
function findTestFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...findTestFiles(full));
    } else if (entry.name.endsWith('.test.js') || entry.name.endsWith('.spec.js')) {
      out.push(full);
    }
  }
  return out;
}

/** Parse common summary patterns emitted by bkit tests. */
function parseSummary(stdout) {
  if (!stdout) return { pass: 0, fail: 0, skip: 0 };
  let pass = 0, fail = 0, skip = 0;

  // Pattern 1: "Tests: NN/NN PASS, NN FAIL, NN SKIP" or "X/Y passed, Z failed"
  const m1 = stdout.match(/(\d+)\s*\/\s*(\d+)\s*(?:PASS(?:ED)?|passed)\s*,\s*(\d+)\s*(?:FAIL(?:ED)?|failed)(?:\s*,\s*(\d+)\s*(?:SKIP(?:PED)?|skipped))?/i);
  if (m1) {
    pass = parseInt(m1[1], 10);
    fail = parseInt(m1[3], 10);
    skip = parseInt(m1[4] || '0', 10);
    return { pass, fail, skip };
  }

  // Pattern 2: count `PASS:` lines
  const passLines = (stdout.match(/^\s*(✓|PASS:|PASS\s)/gm) || []).length;
  const failLines = (stdout.match(/^\s*(✗|FAIL:|FAIL\s)/gm) || []).length;
  const skipLines = (stdout.match(/^\s*(SKIP:|SKIP\s)/gm) || []).length;
  if (passLines || failLines || skipLines) {
    return { pass: passLines, fail: failLines, skip: skipLines };
  }

  // Pattern 3: "Results: X/Y passed"
  const m3 = stdout.match(/Results:\s*(\d+)\s*\/\s*(\d+)/);
  if (m3) {
    // v2.1.33: clamp at zero. This derives `fail` as (total - pass), which goes
    // NEGATIVE whenever the matched line reports more passes than the total it
    // is measured against — a real occurrence once the widened directory scan
    // brought in suites with other summary formats. Negative fails then summed
    // across files and cancelled genuine failures out of the totals.
    const passed = parseInt(m3[1], 10);
    const totalTc = parseInt(m3[2], 10);
    return { pass: passed, fail: Math.max(0, totalTc - passed), skip: 0 };
  }

  // Pattern 4: explicit PASSED n assertion
  const m4 = stdout.match(/✓\s*PASSED\s*\((\d+)\s*assertions?/i);
  if (m4) return { pass: parseInt(m4[1], 10), fail: 0, skip: 0 };

  return { pass: 0, fail: 0, skip: 0 };
}

function main() {
  const results = [];
  let total = { files: 0, pass: 0, fail: 0, skip: 0, errors: 0, expectedFail: 0 };
  const expectedSet = new Set(EXPECTED_FAILURES.map((ef) => ef.file));

  for (const { dir, label } of TEST_DIRS) {
    const files = findTestFiles(dir);
    for (const file of files) {
      total.files++;
      let out = '';
      let error = null;
      try {
        out = execSync(`node "${file}"`, {
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
          timeout: 30000,
          // v2.1.33: tell timing-sensitive suites they are running under load.
          // Spawning 350+ processes back to back inflates wall-clock enough that
          // an MCP handshake measured 570-598 ms against a 500 ms budget while
          // passing comfortably on its own. A test that is green standalone and
          // red in CI teaches people to ignore CI, so those suites widen their
          // bound when this is set rather than reporting a regression that is
          // really scheduling noise.
          env: { ...process.env, BKIT_TEST_AGGREGATE: '1' },
        });
      } catch (e) {
        error = e.message;
        out = (e.stdout || '') + (e.stderr || '');
        total.errors++;
      }
      const summary = parseSummary(out);
      const relPath = path.relative(PROJECT_ROOT, file);
      const isExpectedFailure = expectedSet.has(relPath);

      total.pass += summary.pass;
      if (isExpectedFailure) {
        total.expectedFail += summary.fail;
      } else {
        total.fail += summary.fail;
      }
      total.skip += summary.skip;
      /*
       * v2.1.33: keep the failing assertion lines, not just the tally.
       *
       * Only the one-line per-file summary was reported, so a red CI run said
       * "14 failing assertion(s)" and named the files but never said WHICH
       * assertions — reproducing it meant guessing at platform differences.
       * The child's stdout is already in hand here; capture the failure lines
       * while we have them and print them below.
       */
      const failureLines = summary.fail > 0
        ? out.split('\n').filter((l) => /^\s*(✗|FAIL[: ])/.test(l)).slice(0, 12)
        : [];
      results.push({
        file: relPath,
        label,
        ...summary,
        expected: isExpectedFailure,
        error: error ? error.split('\n')[0].slice(0, 80) : null,
        failureLines,
      });
    }
  }

  // Also count the standalone contract runner we already executed (226 assertions).
  // These were executed separately via `node test/contract/scripts/contract-test-run.js`.
  try {
    const runnerOut = execSync(
      `node test/contract/scripts/contract-test-run.js --compare v2.1.9 --level L1,L4`,
      { encoding: 'utf8', cwd: PROJECT_ROOT, timeout: 10000 }
    );
    const m = runnerOut.match(/PASSED \((\d+)\s*assertions?/);
    if (m) {
      const assertions = parseInt(m[1], 10);
      total.pass += assertions;
      results.push({
        file: 'test/contract/scripts/contract-test-run.js (L1+L4)',
        label: 'contract-runner',
        pass: assertions,
        fail: 0,
        skip: 0,
        error: null,
      });
      total.files++;
    }
  } catch {
    /* non-critical */
  }

  // Print per-file summary
  // eslint-disable-next-line no-console
  console.log('\n=== Per-file Results ===');
  for (const r of results) {
    const mark = r.error ? '⚠' : r.fail > 0 ? '✗' : '✓';
    // eslint-disable-next-line no-console
    console.log(
      `${mark} [${r.label}] ${r.file} — pass:${r.pass} fail:${r.fail} skip:${r.skip}` +
        (r.error ? ` (error: ${r.error})` : '')
    );
    // v2.1.33: name the assertions, so a red CI run is reproducible without
    // guessing which of a file's checks broke.
    if (Array.isArray(r.failureLines)) {
      for (const line of r.failureLines) {
        // eslint-disable-next-line no-console
        console.log(`      ${line.trim()}`);
      }
    }
  }

  // Print totals
  // eslint-disable-next-line no-console
  console.log('\n=== Aggregate ===');
  // eslint-disable-next-line no-console
  console.log(`Test files: ${total.files}`);
  // eslint-disable-next-line no-console
  console.log(`Errors (files that threw): ${total.errors}`);
  // eslint-disable-next-line no-console
  console.log(`PASS: ${total.pass}`);
  // eslint-disable-next-line no-console
  console.log(`FAIL: ${total.fail}`);
  // eslint-disable-next-line no-console
  console.log(`SKIP: ${total.skip}`);
  // eslint-disable-next-line no-console
  console.log(`Expected Failures: ${total.expectedFail} (tracked, excluded from fail count)`);
  // eslint-disable-next-line no-console
  console.log(`TOTAL TC: ${total.pass + total.fail + total.skip + total.expectedFail}`);

  // Write summary JSON
  const summaryPath = path.join(PROJECT_ROOT, '.bkit', 'runtime', 'qa-aggregate.json');
  fs.mkdirSync(path.dirname(summaryPath), { recursive: true });
  fs.writeFileSync(summaryPath, JSON.stringify({ total, results, at: new Date().toISOString() }, null, 2));
  // eslint-disable-next-line no-console
  console.log(`\nSummary written: ${summaryPath}`);

  // ENH-411 (v2.1.33) — layer 2 of 3: the aggregator must be able to fail.
  //
  // Until now this script had zero `process.exit` calls, so it returned 0 no
  // matter how many tests failed. Combined with the CI step piping it through
  // `| tail -10` under a shell without pipefail, a red suite rendered green.
  // Both `fail` (assertions that failed) and `errors` (files that exited
  // non-zero or threw) are gating: an errored file has an unknown result, and
  // "unknown" must never be reported as success.
  // v2.1.33: check each signal independently rather than summing them.
  //
  // The first version of this gate used `total.fail + total.errors > 0`, and a
  // parser bug that produced a negative `fail` cancelled a real error out of
  // the sum — the run reported `Errors: 1` and still exited 0. A gate that can
  // be defeated by arithmetic is not a gate. A nonsensical total (negative, NaN)
  // is itself a reason to fail: it means the suite's result is unknown, and
  // unknown must never be reported as success.
  const countIsSane = Number.isFinite(total.fail) && total.fail >= 0
    && Number.isFinite(total.errors) && total.errors >= 0;
  if (!countIsSane || total.fail > 0 || total.errors > 0) {
    // eslint-disable-next-line no-console
    console.error(
      `\n[qa-aggregate] GATE FAILED — ${countIsSane ? '' : 'UNPARSEABLE TOTALS (treated as failure); '}`
      + `${total.fail} failing assertion(s), `
      + `${total.errors} errored file(s). Exiting 1.`,
    );
    process.exitCode = 1;
  }
}

// v2.1.33: expose the discovered directories so contract tests can assert
// coverage behaviourally instead of grepping this file for literals. The
// literal-grep style is what let the hand-written TEST_DIRS drift unnoticed.
module.exports = { TEST_DIRS, findTestFiles, parseSummary };

if (require.main === module) main();
