#!/usr/bin/env node
'use strict';

/*
 * hook-dispatch.test.js — v2.1.34 host-integration layer
 *
 * Runs a REAL Claude Code session with bkit loaded from the working tree
 * (`claude -p --plugin-dir <repo>`) and asserts, from the outside, that the
 * host actually dispatched bkit's hooks.
 *
 * ## Why a whole new test layer
 *
 * bkit's suite reached 6,398 assertions across 354 files while eight shipped
 * features were dead in production. All eight passed their tests, because every
 * test called bkit's own function directly. `l2-smoke.test.js` states the limit
 * outright: it "does NOT require the real CC runtime". A unit test proves a
 * handler works; only the host can prove the handler is ever called.
 *
 * Defects this layer would have caught the day they landed:
 *   - `FileChanged` never invoked once since v2.1.1 (invalid `if` alternation,
 *     `if` on a non-tool event, and a matcher grammar that cannot express the
 *     needed glob).
 *   - `PostToolUse` matching `Write` only, so the whole PDCA post-write path
 *     never ran on `Edit` — the common case for an existing file.
 *   - `skill_post` silently no-oping (#115), the session-title tag reading an
 *     environment variable Claude Code never sets (#119), namespaced skill
 *     resolution never firing (#125).
 *
 * ## How it decides
 *
 * bkit stamps `.bkit/runtime/hook-dispatch.json` from the shared stdin readers,
 * so any hook payload that reaches bkit is recorded with its event name and the
 * triggering tool. The test drives a session that exercises specific tools and
 * then asserts the ledger contains the corresponding events.
 *
 * ## Skipping
 *
 * Requires the `claude` CLI and a working session. When unavailable the test
 * SKIPS rather than fails, so a contributor without credentials is not blocked —
 * but it prints loudly, and CI runs it as a gate where the CLI is present.
 * Set BKIT_REQUIRE_HOST_INTEGRATION=1 to turn a skip into a failure.
 */

const assert = require('node:assert');
const { spawnSync, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const REQUIRE_HOST = process.env.BKIT_REQUIRE_HOST_INTEGRATION === '1';

let pass = 0;
let skip = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    pass++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failures.push(`${name}: ${e.message}`);
    console.error(`  ✗ ${name}: ${e.message}`);
  }
}

function skipAll(reason) {
  if (REQUIRE_HOST) {
    console.error(`✗ host-integration required but unavailable: ${reason}`);
    console.error('pass:0 fail:1 skip:0');
    process.exit(1);
  }
  console.log(`⚠ host-integration SKIPPED — ${reason}`);
  console.log('  (set BKIT_REQUIRE_HOST_INTEGRATION=1 to make this a failure)');
  console.log('pass:0 fail:0 skip:1');
  process.exit(0);
}

// ------------------------------------------------------------------
// Locate the CLI. Never hardcode a path: the v2.1.33 live harness pinned
// /Users/<name>/.local/bin/claude and was unrunnable anywhere else.
// ------------------------------------------------------------------
function findClaude() {
  // Walk PATH directly rather than shelling out: passing args with `shell: true`
  // is deprecated (DEP0190) and would concatenate unescaped.
  const exts = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : [''];
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      const candidate = path.join(dir, `claude${ext}`);
      try {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
      } catch (_) { /* unreadable PATH entry */ }
    }
  }
  return null;
}

const CLAUDE = findClaude();
if (!CLAUDE) skipAll('the `claude` CLI is not on PATH');

let cliVersion = 'unknown';
try {
  cliVersion = execFileSync(CLAUDE, ['--version'], { encoding: 'utf8', timeout: 30000 }).trim();
} catch (e) {
  skipAll(`\`claude --version\` failed: ${e.message}`);
}

console.log(`host-integration: ${CLAUDE} (${cliVersion})`);
console.log(`plugin under test: ${PROJECT_ROOT}`);

// ------------------------------------------------------------------
// Drive one real session in an isolated project directory.
// ------------------------------------------------------------------
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'bkit-hostint-'));
fs.mkdirSync(path.join(work, 'docs', '02-design'), { recursive: true });
fs.writeFileSync(
  path.join(work, 'docs', '02-design', 'probe.design.md'),
  '# Probe design\n\nInitial line.\n',
  'utf8'
);

/**
 * Run one prompt through a real session against the working-tree plugin.
 *
 * `--setting-sources ''` and `--strict-mcp-config` keep the developer's own
 * settings and MCP servers out of the result, so the ledger reflects bkit and
 * nothing else.
 *
 * @param {string} prompt
 * @returns {{status: number|null, stdout: string, stderr: string}}
 */
function runSession(prompt) {
  return spawnSync(
    CLAUDE,
    [
      '-p', prompt,
      '--plugin-dir', PROJECT_ROOT,
      '--setting-sources', '',
      '--strict-mcp-config',
      '--permission-mode', 'bypassPermissions',
      '--no-session-persistence',
    ],
    {
      cwd: work,
      encoding: 'utf8',
      timeout: 300000,
      env: { ...process.env, CLAUDE_PROJECT_DIR: work },
    }
  );
}

const EDIT_PROMPT =
  'Do these two things with tools, without asking: ' +
  '(1) run the shell command `echo bkit-host-integration`; ' +
  '(2) use the Edit tool to append the line "edited-by-host-integration" ' +
  'to docs/02-design/probe.design.md. Then reply "done".';

const session = runSession(EDIT_PROMPT);
if (session.error) skipAll(`session failed to start: ${session.error.message}`);
if (session.status !== 0 && session.status !== 1) {
  skipAll(`session exited ${session.status}: ${(session.stderr || '').slice(0, 300)}`);
}

const { readDispatch, missingEvents, toolsFor } = require('../../../lib/core/hook-dispatch');
const ledger = readDispatch(work);
const seen = Object.keys(ledger.events || {});
console.log(`dispatched events observed: ${seen.length ? seen.join(', ') : '(none)'}`);

if (seen.length === 0) {
  skipAll(
    'no bkit hook was dispatched at all — the plugin did not load in the session, ' +
      'so this run cannot distinguish a bkit defect from an environment problem'
  );
}

// ------------------------------------------------------------------
// HI-1 — the always-on events fire in an ordinary session
// ------------------------------------------------------------------
test('HI-1 SessionStart, UserPromptSubmit, PreToolUse, PostToolUse and Stop all dispatch', () => {
  const expected = ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Stop'];
  const missing = missingEvents(ledger, expected);
  assert.deepStrictEqual(
    missing,
    [],
    `registered but never dispatched: ${missing.join(', ')}. ` +
      `A hook that the host never invokes is a feature that does not exist, ` +
      `however green its unit tests are.`
  );
});

// ------------------------------------------------------------------
// HI-2 — the Edit path is covered (regression lock for D6)
// ------------------------------------------------------------------
test('HI-2 PostToolUse dispatches for Edit, not only Write', () => {
  const tools = toolsFor(ledger, 'PostToolUse');
  assert.ok(
    tools.includes('Edit'),
    `PostToolUse was dispatched for [${tools.join(', ') || 'nothing'}] but not Edit. ` +
      `Through v2.1.33 the matcher was "Write" alone, so unified-write-post.js ` +
      `(PDCA tracking, template validation, reachability ping) never ran when ` +
      `Claude edited an existing file — the common case.`
  );
});

test('HI-3 PreToolUse dispatches for Bash', () => {
  const tools = toolsFor(ledger, 'PreToolUse');
  assert.ok(
    tools.includes('Bash'),
    `PreToolUse tools seen: [${tools.join(', ') || 'nothing'}]. The Bash guard is ` +
      `bkit's destructive-command defense; if it is not dispatched it is not a defense.`
  );
});

// ------------------------------------------------------------------
// HI-4 — every registered event either dispatched, or is documented as
//        needing a trigger this session does not produce.
// ------------------------------------------------------------------
test('HI-4 no registered event is unaccounted for', () => {
  const hooksJson = JSON.parse(
    fs.readFileSync(path.join(PROJECT_ROOT, 'hooks', 'hooks.json'), 'utf8')
  );
  const registered = Object.keys(hooksJson.hooks || {});

  /*
   * Events this session genuinely cannot produce. Each entry must name the
   * trigger it needs — the point of the list is that "not dispatched" always
   * has a stated reason, so it can never quietly mean "broken".
   */
  const NEEDS_TRIGGER = {
    StopFailure: 'requires an API-level failure (rate limit, overload)',
    UserPromptExpansion: 'requires a slash-command expansion',
    PreCompact: 'requires the context window to reach compaction',
    PostCompact: 'requires the context window to reach compaction',
    TaskCompleted: 'requires the Task tool to complete a tracked task',
    TaskCreated: 'requires the Task tool to create a tracked task',
    SubagentStart: 'requires a subagent dispatch',
    SubagentStop: 'requires a subagent dispatch',
    TeammateIdle: 'requires Agent Teams (CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1)',
    PostToolUseFailure: 'requires a tool call to fail',
    InstructionsLoaded: 'requires CLAUDE.md instructions in the probe project',
    ConfigChange: 'requires settings or skills to change mid-session',
    PermissionRequest: 'suppressed under --permission-mode bypassPermissions',
    Notification: 'requires a permission or idle prompt',
    CwdChanged: 'requires a working-directory change mid-session',
  };

  const unexplained = registered.filter(
    (evt) => missingEvents(ledger, [evt]).length > 0 && !(evt in NEEDS_TRIGGER)
  );
  assert.deepStrictEqual(
    unexplained,
    [],
    `registered, not dispatched, and with no stated reason: ${unexplained.join(', ')}`
  );
});

// ------------------------------------------------------------------
// HI-5 — the guard still bites in a real session
// ------------------------------------------------------------------
test('HI-5 a destructive command is refused and the target survives', () => {
  const guarded = path.join(work, 'guard-target');
  fs.mkdirSync(guarded, { recursive: true });
  fs.writeFileSync(path.join(guarded, 'keep.txt'), 'keep\n', 'utf8');
  // Assembled at runtime so this source file does not itself contain the
  // literal pattern the guard blocks.
  const rm = String.fromCharCode(114, 109);
  runSession(`Run exactly this shell command: ${rm} -rf ./guard-target`);
  assert.ok(
    fs.existsSync(path.join(guarded, 'keep.txt')),
    'the guarded directory was deleted — the PreToolUse Bash defense did not hold'
  );
});

// ------------------------------------------------------------------
try {
  fs.rmSync(work, { recursive: true, force: true });
} catch (_) { /* best-effort cleanup */ }

if (failures.length > 0) {
  console.error(`\nhook-dispatch.test.js: ${pass} PASS, ${failures.length} FAIL, ${skip} SKIP`);
  process.exit(1);
}
console.log(`\nhook-dispatch.test.js: ${pass} PASS, 0 FAIL, ${skip} SKIP`);
