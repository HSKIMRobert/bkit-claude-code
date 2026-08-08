#!/usr/bin/env node
'use strict';

/*
 * shipped-scripts-parse.test.js — v2.1.34
 *
 * Every shell script bkit ships must parse.
 *
 * ## Why this exists
 *
 * v2.1.33's flagship deliverable was a live-QA harness. The commit that shipped
 * it (`test(qa): ship the full-surface and live QA harnesses`) contained this on
 * line 8 of `test/qa-harness-live-claude-p.sh`:
 *
 *   BKIT="20 20 12 61 79 80 81 98 ...cd "...dirname "-e")/.." && pwd)"
 *
 * The author wrote `$(cd "$(dirname "$0")/.." && pwd)` and generated the file
 * through an UNQUOTED heredoc, so the generating shell expanded `$(` into a
 * list of line numbers and `$0` into `-e` before the bytes reached disk.
 * `bash -n` rejects the result outright.
 *
 * It went unnoticed because nothing referenced the file — not CI, not
 * qa-aggregate — and the QA report it backed had actually been produced from an
 * uncommitted scratch copy. A harness that cannot run is worse than no harness:
 * it is a claim of verification with nothing behind it.
 *
 * `node --check` already covers every .js handler. This closes the same hole for
 * .sh, so a shell deliverable can never again ship unrunnable.
 */

const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

/** Directories worth walking. Excludes vendored and generated trees. */
const ROOTS = ['scripts', 'test', 'tests', 'hooks', 'evals', 'servers'];
const SKIP_DIRS = new Set(['node_modules', '.git', 'live-qa-work', 'baseline']);

let pass = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    pass++;
  } catch (e) {
    failures.push(`${name}: ${e.message}`);
  }
}

/**
 * @param {string} dir
 * @returns {string[]} absolute paths of *.sh under dir
 */
function findShellScripts(dir) {
  const out = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (_) {
    return out;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...findShellScripts(full));
    else if (entry.name.endsWith('.sh')) out.push(full);
  }
  return out;
}

/**
 * The script with comment lines and trailing comments stripped, so the
 * fingerprint checks below read executable text only.
 *
 * @param {string} file
 * @returns {string}
 */
function executableLines(file) {
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n');
}

const scripts = ROOTS.flatMap((r) => findShellScripts(path.join(PROJECT_ROOT, r)));

test('SSP-00 at least one shell script is present to check', () => {
  assert.ok(scripts.length > 0, 'no .sh files found — the walk is misconfigured');
});

for (const script of scripts) {
  const rel = path.relative(PROJECT_ROOT, script);
  test(`SSP parses: ${rel}`, () => {
    const r = spawnSync('bash', ['-n', script], { encoding: 'utf8', timeout: 20000 });
    assert.strictEqual(
      r.status,
      0,
      `bash -n failed — this script cannot run:\n${(r.stderr || '').trim()}`
    );
  });

  test(`SSP no expanded-heredoc corruption: ${rel}`, () => {
    // Only executable lines matter. A comment may legitimately quote the
    // corrupted form — this file's own header does — and flagging that would
    // punish documenting the defect.
    const code = executableLines(script);
    // `$0` expanding to `-e` and `$(` expanding to a line-number list are the
    // two fingerprints of the v2.1.33 accident. Both are meaningless in a
    // hand-written script, so their presence is proof of the same mistake.
    assert.ok(
      !/dirname\s+"-e"/.test(code),
      '`dirname "-e"` — $0 was expanded at generation time; quote the heredoc delimiter'
    );
    assert.ok(
      !/"\d+(?:\s+\d+){5,}[a-z]/.test(code),
      'a run of numbers fused to a command name — $( was expanded at generation time'
    );
  });

  test(`SSP no hardcoded home path: ${rel}`, () => {
    const m = executableLines(script).match(
      /(\/Users\/[A-Za-z0-9._-]+|\/home\/[A-Za-z0-9._-]+)/
    );
    assert.ok(
      !m,
      `hardcoded home directory '${m && m[1]}' — resolve from PATH or the script's own location ` +
        `so the script runs on a machine other than its author's`
    );
  });
}

if (failures.length > 0) {
  console.error(`\n✗ shipped-scripts-parse: ${failures.length} failing assertion(s)`);
  for (const f of failures) console.error(`    ✗ ${f}`);
  console.error(`\npass:${pass} fail:${failures.length} skip:0`);
  process.exit(1);
}
console.log(`✓ shipped-scripts-parse — ${scripts.length} shell script(s) — pass:${pass} fail:0 skip:0`);
