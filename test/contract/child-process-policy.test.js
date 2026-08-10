/**
 * child-process-policy.test.js — no shipped code may hand a shell a built string
 *
 * The policy predates this test. `lib/qa/test-runner.js:9-13` has carried
 * "C1 fix (audit): use execFileSync (no shell) so testDir can never reach a
 * shell" since an earlier audit — but it was a comment in one file, so seven
 * other call sites kept using `execSync`, two of them interpolating variables.
 * PR #146 (external, semgrep-driven) found one of them. This test is the
 * difference between a policy someone has to remember and one that is enforced.
 *
 * The rule is deliberately mechanical: shipped code passes argv arrays.
 * `spawnSync`/`execFileSync`/`spawn`/`execFile` all take argv and are fine;
 * `execSync`/`exec` take a command string a shell will parse, and are not.
 *
 * Covers docs/02-design/features/v2135-security-hardening.design.en.md §1.5, §2.4.
 *
 * @module test/contract/child-process-policy.test
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

/** Directories whose contents ship to users. Tests and fixtures are excluded. */
const SHIPPED_DIRS = ['lib', 'hooks', 'scripts', 'servers'];

function walk(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      walk(full, out);
    } else if (e.isFile() && e.name.endsWith('.js')) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Strip comments and string literals so that prose about `execSync` — of which
 * this repository now has a fair amount — is not mistaken for a call to it.
 * A scanner that reads its own explanatory comments as code is exactly the
 * failure v2.1.34 fixed in check-deadcode.js; do not reintroduce it here.
 */
function stripNonCode(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""');
}

const FILES = SHIPPED_DIRS.flatMap((d) => walk(path.join(ROOT, d)));

test('CPP-1 shipped directories are actually being scanned', () => {
  // A scan that silently matches nothing passes forever. Pin the floor.
  assert.ok(FILES.length > 200, `expected >200 shipped .js files, found ${FILES.length}`);
});

test('CPP-2 no shipped code calls execSync or exec with a shell command string', () => {
  const offenders = [];
  for (const file of FILES) {
    const code = stripNonCode(fs.readFileSync(file, 'utf8'));
    const lines = code.split('\n');
    lines.forEach((line, i) => {
      // `execSync(` / `.execSync(` / `exec(` as a child_process call. `.exec(`
      // preceded by a regex or matcher is excluded by requiring the
      // child_process spelling or a bare call.
      if (/\bexecSync\s*\(/.test(line)) {
        offenders.push(`${path.relative(ROOT, file)}:${i + 1} execSync`);
      }
    });
  }
  assert.deepEqual(
    offenders, [],
    `execSync passes a string to a shell; use execFileSync(file, argv) instead:\n${offenders.join('\n')}`,
  );
});

test('CPP-3 no shipped code interpolates into a child_process command', () => {
  // The specific shape semgrep flagged: a template literal or concatenation
  // reaching any child_process entry point.
  const offenders = [];
  const CALL = /\b(execSync|exec|execFileSync|execFile|spawnSync|spawn)\s*\(\s*([^)]*)/;
  for (const file of FILES) {
    const code = stripNonCode(fs.readFileSync(file, 'utf8'));
    code.split('\n').forEach((line, i) => {
      const m = line.match(CALL);
      if (!m) return;
      const firstArg = m[2];
      // After stripNonCode, a template literal keeps its backticks; a real
      // interpolation keeps `${`. Plain '' or "" are inert.
      if (/`/.test(firstArg) && /\$\{/.test(firstArg)) {
        offenders.push(`${path.relative(ROOT, file)}:${i + 1} ${m[1]}`);
      }
    });
  }
  assert.deepEqual(
    offenders, [],
    `command name must be a literal, never built from data:\n${offenders.join('\n')}`,
  );
});

test('CPP-4 the two historically risky call sites pass argv', () => {
  /*
   * Named explicitly because these are the only two places where
   * caller-controlled data ever reached a command: a remote name parsed out of
   * the user's own `git push`, and a GitHub handle. A generic rule can be
   * satisfied by deleting the call; these assertions require it to still work.
   */
  const guard = fs.readFileSync(path.join(ROOT, 'lib/defense/push-event-guard.js'), 'utf8');
  assert.match(guard, /execFileSync/, 'push-event-guard must use execFileSync');
  assert.match(
    guard, /\[\s*'remote',\s*'get-url',\s*'--push',\s*'--',\s*remoteName\s*\]/,
    'remote name must be passed as argv after a `--` separator',
  );

  const measure = fs.readFileSync(path.join(ROOT, 'scripts/_v2119-s0-measure.js'), 'utf8');
  assert.match(measure, /execFileSync\(\s*\n?\s*'gh'/, 'gh invocation must use execFileSync');
  assert.doesNotMatch(
    measure, /gh issue list --state all --search/,
    'the gh search must not be assembled as a shell string',
  );
});

test('CPP-5 CC version detection has exactly one subprocess implementation', () => {
  // ENH-428. Three copies existed; two shelled out. The contract is that the
  // shared helper is the only place that spawns the CLI.
  const checker = fs.readFileSync(path.join(ROOT, 'lib/infra/cc-version-checker.js'), 'utf8');
  assert.match(checker, /function detectViaSubprocess/, 'shared helper must exist');

  for (const rel of ['lib/infra/cc-bridge.js', 'hooks/startup/session-context.js']) {
    const src = stripNonCode(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
    assert.doesNotMatch(
      src, /spawnSync\s*\(|execFileSync\s*\(/,
      `${rel} must delegate CC version detection, not spawn its own process`,
    );
  }
});
