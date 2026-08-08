#!/usr/bin/env node
/*
 * ENH-388 / 389 / 393 regression — destructive detection must actually block
 * (bkit v2.1.33).
 *
 * These three were reported separately but are one defect in one code path
 * (`scripts/unified-bash-pre.js`, the Destructive Detector block), which is why
 * the source report forbade splitting them:
 *
 *   ENH-389 — the call passed `{ command }` where `detect()` documents a string
 *     (lib/control/destructive-detector.js:131) and otherwise falls back to
 *     `JSON.stringify` (:135). Rules were therefore matched against
 *     `{"command":"..."}`, which defeats anchored patterns. Measured:
 *       detect('Bash', 'chmod 777 /')              -> G-008 critical
 *       detect('Bash', { command: 'chmod 777 /' }) -> not detected
 *     G-008 ends with `\/\s*$`; the JSON form ends with `"}`. Every command
 *     aimed at the filesystem root was invisible in production.
 *
 *   ENH-388 — even when a critical rule did match, nothing blocked. The branch
 *     wrote an audit entry and returned, so the command ran.
 *
 *   ENH-393 — that audit entry hardcoded `result: 'blocked'` and the
 *     `destructiveBlocked` session counter incremented, so both the audit trail
 *     and the stats asserted a protection that had not happened.
 *
 * Fixing 389 alone would have made the detector see more while still blocking
 * nothing; fixing 388 alone would have left root-targeting commands undetected.
 *
 * Destructive command strings are assembled at runtime rather than written as
 * literals: bkit's own PreToolUse hook is active while these tests run and now
 * genuinely blocks them.
 *
 * module: test/regression/enh-388-389-393-destructive-enforcement
 *
 * @version 2.1.33
 * @since   2.1.33
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const HOOK = path.join(PROJECT_ROOT, 'scripts', 'unified-bash-pre.js');
const detector = require('../../lib/control/destructive-detector');

let pass = 0;
let fail = 0;
const failures = [];

function assert(id, condition, message) {
  if (condition) {
    pass++;
    console.log(`  PASS: ${id}`);
  } else {
    fail++;
    failures.push({ id, message });
    console.error(`  FAIL: ${id} - ${message}`);
  }
}

/** Feed a Bash command through the real PreToolUse hook and read its decision. */
function runHook(command) {
  const payload = JSON.stringify({
    tool_name: 'Bash',
    tool_input: { command },
    session_id: 'enh388-regression',
  });
  let stdout = '';
  try {
    stdout = execFileSync(process.execPath, [HOOK], {
      input: payload,
      encoding: 'utf8',
      env: { ...process.env, CLAUDE_PROJECT_DIR: PROJECT_ROOT },
    });
  } catch (e) {
    stdout = (e.stdout || '') + (e.stderr || '');
  }
  try {
    const line = stdout.trim().split('\n').filter(Boolean).pop();
    const parsed = JSON.parse(line);
    // v2.1.34 (D9): three tiers, not two. `ask` uses the documented PreToolUse
    // shape (`hookSpecificOutput.permissionDecision`); collapsing it into
    // `allow` here would report a confirmation prompt as a silent pass.
    const hso = parsed.hookSpecificOutput || {};
    if (parsed.decision === 'block') {
      return { decision: 'block', reason: parsed.reason || '' };
    }
    if (hso.permissionDecision === 'ask') {
      return { decision: 'ask', reason: hso.permissionDecisionReason || '' };
    }
    return { decision: 'allow', reason: parsed.reason || '' };
  } catch (_e) {
    return { decision: 'allow', reason: '' };
  }
}

const RM = ['r', 'm'].join('');
/*
 * v2.1.34 (D9): the payload is now a BROAD target.
 *
 * This read `${RM} -rf /tmp/enh388-regression`, from a time when G-001 graded
 * every recursive delete as critical regardless of what it pointed at. That
 * blanket severity is what made the guard's own advice — "scope the command to
 * a specific path" — impossible to act on, and it refused ordinary cleanup of a
 * temporary directory.
 *
 * G-001 now grades by target: broad stays critical and blocks, specific asks.
 * ENH-388's assertion is about the CRITICAL path reaching a real block rather
 * than only an audit line, so it needs a critical payload to test. The scoped
 * case is asserted separately below, so both tiers stay locked.
 */
const RECURSIVE_DELETE = `${RM} -rf /`;
const SCOPED_DELETE = `${RM} -rf /tmp/enh388-regression`;
const ROOT_CHMOD = 'chmod 777 /';

console.log('=== ENH-388/389/393: destructive detection must block ===\n');

// --- ENH-389: string vs object must not change what the detector sees ---
const asString = detector.detect('Bash', ROOT_CHMOD);
const asObject = detector.detect('Bash', { command: ROOT_CHMOD });
assert('E388-01', asString.detected === true,
  `detector must flag a root-targeting chmod when given a string (got ${JSON.stringify(asString.detected)})`);
assert('E388-02', asString.detected === asObject.detected,
  'passing the command as an object must not change detection — that divergence is how root-targeting commands went unseen');

// --- ENH-388: critical detections reach a block ---
const del = runHook(RECURSIVE_DELETE);
assert('E388-03', del.decision === 'block',
  `a critical recursive delete must be blocked, not merely logged (got ${del.decision})`);
assert('E388-04', /G-\d/.test(del.reason),
  `the block reason must name the rule that fired (got ${JSON.stringify(del.reason.slice(0, 80))})`);

// --- D9: a specific target asks rather than refusing outright ---
// The other half of the same contract. Grading a scoped delete down to a silent
// `allow` would be a relaxation dressed up as a fix, so it must still reach the
// user — just as a question, not a refusal.
const scoped = runHook(SCOPED_DELETE);
assert('E388-03b', scoped.decision !== 'block',
  `a scoped recursive delete must not be refused outright (got ${scoped.decision})`);
assert('E388-03c', scoped.decision === 'ask',
  `a scoped recursive delete must still reach the user for confirmation (got ${scoped.decision})`);

const rootChmod = runHook(ROOT_CHMOD);
assert('E388-05', rootChmod.decision === 'block',
  `a chmod on the filesystem root must be blocked — this is the case ENH-389's object form hid entirely (got ${rootChmod.decision})`);

// --- No false positives: ordinary commands still run ---
assert('E388-06', runHook('echo hello').decision === 'allow',
  'a harmless command must not be blocked');
assert('E388-07', runHook('chmod 644 ./README.md').decision === 'allow',
  'a scoped chmod on a project file must not be blocked — G-008 targets the filesystem root, not chmod itself');

// --- ENH-393: the audit trail must not claim a block that did not happen ---
const hookCode = fs.readFileSync(HOOK, 'utf8')
  .split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
assert('E388-08', /blocked\s*=\s*true;[\s\S]{0,200}outputBlockWithContext|outputBlockWithContext[\s\S]{0,200}blocked\s*=\s*true/.test(hookCode)
  || /blocked = true;\n\s*outputBlockWithContext/.test(hookCode),
  'the destructive branch must set `blocked` and emit a block — writing an audit entry alone is what ENH-388 was');
assert('E388-09', !/detect\(\s*'Bash'\s*,\s*\{/.test(hookCode),
  'detect() must receive the command string, not an object literal (ENH-389)');

// --- Summary ---
const total = pass + fail;
console.log(`\nResults: ${pass}/${total} passed, ${fail} failed`);
if (failures.length > 0) {
  console.log('Failures:');
  failures.forEach((f) => console.log(`  - ${f.id}: ${f.message}`));
}
process.exit(fail > 0 ? 1 : 0);
