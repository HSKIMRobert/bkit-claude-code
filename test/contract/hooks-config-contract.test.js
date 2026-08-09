#!/usr/bin/env node
'use strict';

/*
 * hooks-config-contract.test.js — v2.1.34
 *
 * Locks hooks/hooks.json against the Claude Code hook specification.
 *
 * Every defect this file guards shipped in a release and survived a green
 * 6,398-assertion suite, because nothing checked the *configuration* — only
 * that each handler file existed, parsed, and behaved when invoked directly:
 *
 *   HC-TIMEOUT   `timeout` is SECONDS. bkit wrote milliseconds through v2.1.33,
 *                so `10000` on Stop meant 2h46m, not 10s. Verified against a
 *                real runtime: a 5s hook survives `timeout: 30` and is killed
 *                at 2.26s under `timeout: 2`.
 *   HC-ONCE      `once` is honoured only in skill frontmatter and ignored in
 *                settings files, so `once: true` here promised a guarantee the
 *                host never made.
 *   HC-IF-ONE    `if` holds exactly ONE permission rule. `Write|Edit(x)` is not
 *                a rule; it silently matches nothing and the handler never runs
 *                — confirmed on a valid tool event, so the syntax is a cause on
 *                its own, independent of which event carries it.
 *   HC-IF-EVENT  `if` is evaluated only on tool events. On any other event a
 *                hook that declares `if` never runs at all.
 *   HC-EVENT     Event names must exist in the CC specification; a typo is a
 *                registration that can never fire.
 *   HC-MATCHER   Events documented as having no matcher support must not carry
 *                one.
 *   HC-CMD       Every command must resolve to a file that exists.
 *   HC-COUNT     Counts must equal the docs=code SoT.
 *
 * Reference: https://code.claude.com/docs/en/hooks
 */

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const HOOKS_PATH = path.join(PROJECT_ROOT, 'hooks', 'hooks.json');

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
 * Every hook event name Claude Code recognises.
 * A name outside this set is a registration that can never fire.
 */
const CC_HOOK_EVENTS = Object.freeze([
  'SessionStart', 'Setup', 'UserPromptSubmit', 'UserPromptExpansion', 'PreToolUse',
  'PermissionRequest', 'PermissionDenied', 'PostToolUse', 'PostToolUseFailure',
  'PostToolBatch', 'Notification', 'MessageDisplay', 'SubagentStart', 'SubagentStop',
  'TaskCreated', 'TaskCompleted', 'Stop', 'StopFailure', 'TeammateIdle',
  'InstructionsLoaded', 'ConfigChange', 'CwdChanged', 'DirectoryAdded', 'FileChanged',
  'WorktreeCreate', 'WorktreeRemove', 'PreCompact', 'PostCompact', 'Elicitation',
  'ElicitationResult', 'SessionEnd',
]);

/** The only events on which `if` is evaluated. Elsewhere it suppresses the hook. */
const IF_EVALUATED_ON = Object.freeze([
  'PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'PermissionRequest', 'PermissionDenied',
]);

/** Events documented as "no matcher support — always fires on every occurrence". */
const NO_MATCHER_EVENTS = Object.freeze([
  'UserPromptSubmit', 'PostToolBatch', 'Stop', 'TeammateIdle', 'TaskCreated',
  'TaskCompleted', 'WorktreeCreate', 'WorktreeRemove', 'MessageDisplay', 'CwdChanged',
]);

/*
 * Upper bound for any bkit hook, in seconds.
 *
 * This is the assertion that would have caught the 1000x unit error on the day
 * it was written. bkit's slowest handler measures ~1.4s (SessionStart); nothing
 * it does legitimately needs a minute. Anything larger is either a unit mistake
 * or a hook that should not be blocking the session in the first place.
 */
const MAX_TIMEOUT_SECONDS = 60;
const MIN_TIMEOUT_SECONDS = 1;

const raw = fs.readFileSync(HOOKS_PATH, 'utf8');
const config = JSON.parse(raw);
const events = config.hooks || {};

/** Flatten to {event, blockIndex, block, hook} rows so each assertion reads plainly. */
const rows = [];
for (const [event, blocks] of Object.entries(events)) {
  assert.ok(Array.isArray(blocks), `hooks.${event} must be an array`);
  blocks.forEach((block, blockIndex) => {
    for (const hook of block.hooks || []) {
      rows.push({ event, blockIndex, block, hook });
    }
  });
}

// ============================================================
// HC-EVENT — every event name is one Claude Code actually dispatches
// ============================================================
for (const event of Object.keys(events)) {
  test(`HC-EVENT ${event} is a documented Claude Code hook event`, () => {
    assert.ok(
      CC_HOOK_EVENTS.includes(event),
      `'${event}' is not a Claude Code hook event — it would never fire`
    );
  });
}

// ============================================================
// HC-TIMEOUT — seconds, not milliseconds
// ============================================================
for (const { event, hook } of rows) {
  const label = `${event} -> ${path.basename((hook.command || '').replace(/"$/, ''))}`;
  test(`HC-TIMEOUT ${label} declares a sane timeout in seconds`, () => {
    assert.strictEqual(
      typeof hook.timeout,
      'number',
      `timeout must be a number (seconds), got ${typeof hook.timeout}`
    );
    assert.ok(
      Number.isFinite(hook.timeout),
      `timeout must be finite, got ${hook.timeout}`
    );
    assert.ok(
      hook.timeout >= MIN_TIMEOUT_SECONDS && hook.timeout <= MAX_TIMEOUT_SECONDS,
      `timeout ${hook.timeout} is outside ${MIN_TIMEOUT_SECONDS}..${MAX_TIMEOUT_SECONDS}s. ` +
        `The unit is SECONDS: a value like 5000 means 83 minutes, not 5 seconds, ` +
        `and leaves a hung hook with no effective cancellation (issue #139).`
    );
  });
}

// ============================================================
// HC-ONCE — `once` is ignored outside skill frontmatter
// ============================================================
test('HC-ONCE no hook block declares `once` (ignored in settings files)', () => {
  const offenders = [];
  for (const [event, blocks] of Object.entries(events)) {
    blocks.forEach((block, i) => {
      if ('once' in block) offenders.push(`${event}[${i}]`);
      for (const hook of block.hooks || []) {
        if ('once' in hook) offenders.push(`${event}[${i}].hooks`);
      }
    });
  }
  assert.deepStrictEqual(
    offenders,
    [],
    `\`once\` is honoured only for hooks declared in skill frontmatter and is ` +
      `ignored here, so it promises a guarantee the host never makes: ${offenders.join(', ')}`
  );
});

// ============================================================
// HC-IF-ONE / HC-IF-EVENT — `if` syntax and placement
// ============================================================
for (const { event, hook } of rows) {
  if (!('if' in hook)) continue;
  const label = `${event} -> ${path.basename((hook.command || '').replace(/"$/, ''))} if:${hook.if}`;

  test(`HC-IF-EVENT ${label} sits on an event where \`if\` is evaluated`, () => {
    assert.ok(
      IF_EVALUATED_ON.includes(event),
      `\`if\` is evaluated only on ${IF_EVALUATED_ON.join('/')}. ` +
        `On '${event}' a hook that declares \`if\` never runs at all.`
    );
  });

  test(`HC-IF-ONE ${label} is exactly one permission rule`, () => {
    const rule = String(hook.if);
    const toolPart = rule.includes('(') ? rule.slice(0, rule.indexOf('(')) : rule;
    assert.ok(
      !toolPart.includes('|'),
      `\`if\` holds exactly one permission rule — there is no \`|\` alternation. ` +
        `'${rule}' silently matches nothing, so the handler never runs. ` +
        `Declare one handler per tool instead.`
    );
    assert.ok(
      !rule.includes('&&') && !rule.includes('||'),
      `\`if\` has no combinator syntax; '${rule}' cannot match.`
    );
  });
}

// ============================================================
// HC-MATCHER — no matcher on events that do not support one
// ============================================================
for (const [event, blocks] of Object.entries(events)) {
  if (!NO_MATCHER_EVENTS.includes(event)) continue;
  test(`HC-MATCHER ${event} carries no matcher (event has no matcher support)`, () => {
    const withMatcher = blocks.filter((b) => b.matcher != null);
    assert.strictEqual(
      withMatcher.length,
      0,
      `'${event}' always fires on every occurrence and supports no matcher; ` +
        `a matcher here is silently ignored and misleads the reader.`
    );
  });
}

// ============================================================
// HC-CMD — every handler resolves
// ============================================================
for (const { event, hook } of rows) {
  test(`HC-CMD ${event} handler file exists`, () => {
    const m = (hook.command || '').match(/\$\{CLAUDE_PLUGIN_ROOT\}\/([^"]+\.js)/);
    assert.ok(m, `command does not reference \${CLAUDE_PLUGIN_ROOT}: ${hook.command}`);
    const full = path.join(PROJECT_ROOT, m[1]);
    assert.ok(fs.existsSync(full), `handler missing: ${m[1]}`);
  });
}

// ============================================================
// HC-COUNT — counts equal the docs=code SoT
// ============================================================
test('HC-COUNT event and block counts match the counts SoT', () => {
  const { EXPECTED_COUNTS } = require('../../lib/domain/rules/docs-code-invariants');
  const eventCount = Object.keys(events).length;
  const blockCount = Object.values(events).reduce((n, b) => n + b.length, 0);
  assert.strictEqual(eventCount, EXPECTED_COUNTS.hookEvents, 'hook event count drift');
  assert.strictEqual(blockCount, EXPECTED_COUNTS.hookBlocks, 'hook block count drift');
});

// ============================================================
// HC-DOC — the file documents the seconds unit for the next reader
// ============================================================
test('HC-DOC hooks.json states that timeout is in seconds', () => {
  assert.ok(
    /timeout` is in SECONDS|timeout is in SECONDS/i.test(config.description || ''),
    'hooks.json description must state the timeout unit — the unit error persisted ' +
      'for 33 minor releases precisely because nothing in the file said what it was.'
  );
});

// ============================================================
// Report
// ============================================================
if (failures.length > 0) {
  console.error(`\n✗ hooks-config-contract: ${failures.length} failing assertion(s)`);
  for (const f of failures) console.error(`    ✗ ${f}`);
  console.error(`\npass:${pass} fail:${failures.length} skip:0`);
  process.exit(1);
}
console.log(`✓ hooks-config-contract — pass:${pass} fail:0 skip:0`);
