#!/usr/bin/env node
/**
 * permission-request-handler.js - PermissionRequest Hook Handler
 * Implements Controllable AI permission decisions based on automation level.
 *
 * - L2+ (semi-auto/full-auto): Auto-approve known safe PDCA operations
 * - Always deny dangerous operations regardless of level
 * - Auto-approve writes to docs/ and .bkit/ at L2+
 *
 * Input: { tool_name, tool_input, permission_suggestions }
 * Output: { decision: { behavior: 'allow'|'deny'|null, updatedInput: null } }
 *
 * @version 2.1.10
 * @module scripts/permission-request-handler
 */

const { readStdinSync } = require('../lib/core/io');
const { debugLog } = require('../lib/core/debug');
const { getAutomationLevel } = require('../lib/pdca/automation');
const { normalizeMode } = require('../lib/domain/policy/permission-mode-policy');

// Safe bash command patterns (prefix match)
const SAFE_BASH_PREFIXES = [
  'node ', 'npm run', 'npm test', 'npm build',
  'cat ', 'ls ', 'find ', 'grep ', 'rg ',
  'git status', 'git log', 'git diff', 'git show', 'git branch',
  'echo ', 'head ', 'tail ', 'wc ',
];

/**
 * Always-deny patterns (substring match in command).
 *
 * ENH-472 (v2.1.37) — `git reset --hard` was removed from this list.
 *
 * It is the only entry here that the Destructive Detector does not consider
 * critical: G-003 grades it `high`/`ask`, and v2.1.34 spent a release making that
 * distinction mean something. So the same command was refused outright by this
 * handler and merely confirmed by the Bash guard — two bkit surfaces disagreeing
 * about one command, which is the two-tables failure ENH-468 removes elsewhere in
 * this release.
 *
 * The tie is broken in favour of asking, and for a reason specific to this event:
 * PermissionRequest fires precisely BECAUSE Claude Code is about to show a
 * prompt. A human is present by construction. Auto-denying an ask-grade command
 * here takes the decision away from the one person who is definitely available to
 * make it. Everything left in this list is critical in the detector's terms and
 * stays denied, in every permission mode.
 */
const ALWAYS_DENY_PATTERNS = [
  'rm -rf /',
  'git push --force',
  'git push -f ',
  'chmod 777',
  '>/dev/',
  'mkfs.',
  'dd if=',
  ':(){:|:&};:',
];

// Safe write target directories (startsWith match)
const SAFE_WRITE_DIRS = [
  'docs/',
  '.bkit/',
  '.bkit\\',
];

let input;
try {
  input = readStdinSync();
} catch (e) {
  debugLog('PermissionRequest', 'Failed to read stdin', { error: e.message });
  // Return null decision (let user decide)
  console.log(JSON.stringify({ hookSpecificOutput: { decision: { behavior: null, updatedInput: null } } }));
  process.exit(0);
}

const toolName = input.tool_name || input.toolName || '';
const toolInput = input.tool_input || input.toolInput || {};
const suggestions = input.permission_suggestions || [];

/*
 * ENH-466 (v2.1.37): recorded for traceability, not for gating.
 *
 * Every decision this handler makes is either an auto-APPROVAL (which no mode
 * needs to relax) or a critical denial (which no mode may relax — maintainer
 * decision D3). There is therefore no ask tier here to suppress, and adding a
 * mode gate that could not change an outcome would advertise a policy that does
 * not exist. The value is carried into the audit trail so a session can still be
 * reconstructed. See lib/domain/policy/permission-mode-policy.js.
 */
const permissionMode = normalizeMode(input.permission_mode);

debugLog('PermissionRequest', 'Hook started', { toolName, suggestions, permissionMode });

// Determine automation level
let autoLevel = 'manual';
try {
  autoLevel = getAutomationLevel();
} catch (e) {
  debugLog('PermissionRequest', 'Failed to get automation level', { error: e.message });
}

const isL2Plus = autoLevel === 'semi-auto' || autoLevel === 'full-auto';

/**
 * Check if a bash command matches always-deny patterns
 */
function isDangerousBash(command) {
  if (!command || typeof command !== 'string') return false;
  const cmd = command.toLowerCase().trim();
  return ALWAYS_DENY_PATTERNS.some(p => cmd.includes(p));
}

/**
 * Check if a bash command matches safe patterns
 */
function isSafeBash(command) {
  if (!command || typeof command !== 'string') return false;
  const cmd = command.trim();
  return SAFE_BASH_PREFIXES.some(p => cmd.startsWith(p));
}

/**
 * Check if a write/edit target is in a safe directory
 */
function isSafeWriteTarget(filePath) {
  if (!filePath || typeof filePath !== 'string') return false;
  return SAFE_WRITE_DIRS.some(d => filePath.startsWith(d) || filePath.includes(`/${d}`));
}

// Make decision
let decision = { behavior: null, updatedInput: null };

try {
  if (toolName === 'Bash') {
    const command = toolInput.command || toolInput.cmd || '';

    // Always deny dangerous commands
    if (isDangerousBash(command)) {
      decision.behavior = 'deny';
      debugLog('PermissionRequest', 'DENIED dangerous bash', { command: command.substring(0, 100) });

      // Audit the denial
      try {
        const { writeAuditLog } = require('../lib/audit/audit-logger');
        writeAuditLog({
          actor: 'hook',
          actorId: 'permission-request-handler',
          action: 'destructive_blocked',
          category: 'control',
          target: command.substring(0, 200),
          targetType: 'feature',
          details: { tool: 'Bash', reason: 'dangerous_command', permissionMode },
          result: 'blocked',
          reason: 'Dangerous bash command blocked by permission handler',
          destructiveOperation: true,
          blastRadius: 'critical',
        });
      } catch (_) { /* non-critical */ }
    }
    // Auto-approve safe commands at L2+
    else if (isL2Plus && isSafeBash(command)) {
      decision.behavior = 'allow';
      debugLog('PermissionRequest', 'Auto-approved safe bash', { command: command.substring(0, 100) });
    }
  }

  if (toolName === 'Write' || toolName === 'Edit') {
    const filePath = toolInput.file_path || toolInput.filePath || toolInput.path || '';

    // Auto-approve writes to safe dirs at L2+
    if (isL2Plus && isSafeWriteTarget(filePath)) {
      decision.behavior = 'allow';
      debugLog('PermissionRequest', 'Auto-approved safe write', { filePath });
    }
  }
} catch (e) {
  debugLog('PermissionRequest', 'Decision logic error', { error: e.message });
  decision = { behavior: null, updatedInput: null };
}

// Output decision
const output = {
  hookSpecificOutput: {
    decision,
  },
};

console.log(JSON.stringify(output));

debugLog('PermissionRequest', 'Hook completed', {
  toolName,
  decision: decision.behavior,
  autoLevel,
});
