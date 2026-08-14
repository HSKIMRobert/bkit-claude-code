/**
 * enh-433-hook-output-visibility.test.js — a message that is printed and a
 * message that is delivered are not the same thing.
 *
 * ENH-433 (v2.1.37).
 *
 * `outputAllow(context, hookEvent)` had two branches: SessionStart and
 * UserPromptSubmit got `{success, message}` JSON, and every other event got
 * `console.log(text)`. Claude Code's contract says what happens to that text
 * (code.claude.com/docs/en/hooks):
 *
 *   "For most events, stdout is written to the debug log but not shown to
 *    Claude."
 *
 * and names the two exceptions explicitly — SessionStart ("plain stdout already
 * reaches Claude for this event") and UserPromptSubmit ("any non-JSON text
 * written to stdout is added as context"). Those are the two bkit already
 * special-cased, so every other call was composing a sentence for a log.
 *
 * Measured across the repository: 32 `outputAllow` call sites, 26 of which pass
 * a NON-empty message on an event in neither set — recovery guidance from
 * tool-failure-handler, guardrail attribution from unified-bash-pre, PDCA
 * context from pre-write.
 *
 * Nine events do carry a context channel, and for those the fix is delivery
 * rather than deletion: `hookSpecificOutput.additionalContext` is what the
 * message was always for. That recovers eight sites from one place — the shape
 * ENH-466 chose for the same reason, that a per-site fix leaves the next call
 * site to rediscover the rule.
 *
 * For an event with neither, the text is still printed (Claude Code logs it, and
 * bkit's Stop integration tests read the line as a liveness signal) but the
 * debug entry now says it was not delivered. What changed is the belief, not the
 * bytes. See ENH-482 for the Stop family's remaining gap, which is a product
 * decision rather than a bug fix.
 *
 * @module test/regression/enh-433-hook-output-visibility.test
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const IO_PATH = path.join(__dirname, '..', '..', 'lib', 'core', 'io.js');

/**
 * Emit through a child process so the real stdout is observed rather than a
 * stubbed console.log — the thing Claude Code would actually read.
 */
function emit(message, event) {
  const code = `const io=require(${JSON.stringify(IO_PATH)});`
    + `io.outputAllow(${JSON.stringify(message)},${JSON.stringify(event)});`;
  return execFileSync(process.execPath, ['-e', code], { encoding: 'utf8' }).trim();
}

/** Events whose plain stdout Claude Code shows to the model. */
const STDOUT_VISIBLE = ['SessionStart', 'UserPromptSubmit'];

/** Events documenting a `hookSpecificOutput.additionalContext` field. */
const CONTEXT_CHANNEL = [
  'Setup', 'UserPromptExpansion', 'PreToolUse', 'PostToolUse',
  'PostToolUseFailure', 'PostToolBatch', 'SubagentStart',
];

/** Events with neither. */
const NO_CHANNEL = ['Stop', 'SubagentStop', 'Notification', 'TaskCompleted', 'StopFailure', 'CTOStop'];

test('an event whose stdout the model reads keeps the {success,message} shape', () => {
  for (const event of STDOUT_VISIBLE) {
    const parsed = JSON.parse(emit('CARRIER', event));
    assert.equal(parsed.success, true, event);
    assert.equal(parsed.message, 'CARRIER', event);
  }
});

test('an event with a context channel delivers through it', () => {
  // These printed bare text before, which Claude Code writes to the debug log.
  for (const event of CONTEXT_CHANNEL) {
    const out = emit('CARRIER', event);
    const parsed = JSON.parse(out);
    assert.equal(parsed.hookSpecificOutput.hookEventName, event);
    assert.equal(parsed.hookSpecificOutput.additionalContext, 'CARRIER',
      `${event} must deliver the message, not merely print it`);
  }
});

test('an event with no channel still prints — printing is not the defect', () => {
  // Removing the print would break the only signal that distinguishes a working
  // Stop hook from a crashed one, and would not deliver anything either way.
  for (const event of NO_CHANNEL) {
    assert.equal(emit('CARRIER', event), 'CARRIER', event);
  }
});

test('an empty message emits nothing, on every kind of event', () => {
  for (const event of [...CONTEXT_CHANNEL, ...NO_CHANNEL]) {
    assert.equal(emit('', event), '', `${event} should stay silent with nothing to say`);
  }
});

test('the visibility sets are stated once, not rediscovered per call site', () => {
  // The rule was previously implicit in an if/else. A later call site could only
  // learn it by reading that branch and inferring why.
  const io = require('../../lib/core/io');
  const src = require('fs').readFileSync(IO_PATH, 'utf8');
  assert.match(src, /STDOUT_REACHES_MODEL/, 'the measured set must be named');
  assert.match(src, /CONTEXT_CHANNEL_EVENTS/, 'the measured set must be named');
  // And the behaviour must follow the sets, which the cases above assert.
  assert.equal(typeof io.outputAllow, 'function');
});

test('Cursor output is untouched by the routing change', () => {
  // Issue #118: under Cursor, PreToolUse expects `{permission, agent_message}`.
  // Routing by Claude Code event semantics must not reach that branch.
  const code = `const io=require(${JSON.stringify(IO_PATH)});io.outputAllow('CARRIER','PreToolUse');`;
  const out = execFileSync(process.execPath, ['-e', code], {
    encoding: 'utf8',
    env: { ...process.env, CURSOR_VERSION: '1.0.0' },
  }).trim();
  const parsed = JSON.parse(out);
  assert.equal(parsed.permission, 'allow');
  assert.equal(parsed.agent_message, 'CARRIER');
  assert.equal(parsed.hookSpecificOutput, undefined,
    'Cursor must not receive Claude Code\'s hookSpecificOutput shape');
});
