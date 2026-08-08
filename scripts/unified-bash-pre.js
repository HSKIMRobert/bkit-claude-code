#!/usr/bin/env node
/**
 * unified-bash-pre.js - Unified Bash PreToolUse Handler (v2.0.0)
 *
 * GitHub Issue #9354 Workaround:
 * Consolidates Bash PreToolUse hooks from:
 * - phase-9-deployment: phase9-deploy-pre.js
 * - zero-script-qa: qa-pre-bash.js
 * - qa-monitor: qa-pre-bash.js (same as zero-script-qa)
 *
 * v2.0.0 Changes:
 * - Added destructive detector integration (control module)
 * - Added scope limiter check (control module)
 * - Added audit logging for destructive commands
 *
 * bkit v2.1.10 (ENH-264):
 * - Leverages CC v2.1.110+ PreToolUse `hookSpecificOutput.additionalContext`
 *   to surface safer alternatives instead of bare "blocked" reasons.
 *   Claude receives actionable recovery suggestions and can propose a
 *   reformulated command automatically (agent resilience boost).
 */

const { readStdinSync, parseHookInput, outputAllow, outputBlock, outputBlockWithContext, outputAsk } = require('../lib/core/io');
const { debugLog } = require('../lib/core/debug');
const { getActiveSkill, getActiveAgent } = require('../lib/task/context');

// ============================================================
// ENH-264: Alternative suggestions for blocked commands (CC v2.1.110+)
// ============================================================

/**
 * Maps a matched danger pattern to concrete safer alternatives.
 * Used by all block paths in this hook to populate
 * `hookSpecificOutput.additionalContext`.
 *
 * Keep keys lowercase-free (match raw pattern substring).
 */
const ALTERNATIVES_BY_PATTERN = {
  'rm -rf': [
    'git clean -fdx  # clean tracked + untracked, respects .gitignore',
    'rm -rf ./dist ./build ./node_modules  # only the directories you actually need to remove',
    'trash ~/path  # if `trash` CLI is available (macOS/Linux), allows recovery',
  ],
  'rm -r': [
    'rm -ri path  # interactive per-file confirmation',
    'git clean -fd  # clean untracked files inside a git repo',
  ],
  'DROP TABLE': [
    'Back up first: `pg_dump -t table_name db > backup.sql`',
    'Run under a migration tool (Prisma/Alembic/Knex) so the change is versioned and reversible',
    'Ask the user to confirm the target environment before issuing DDL',
  ],
  'DROP DATABASE': [
    'Create a dump first: `pg_dump db > backup.sql` / `mysqldump db > backup.sql`',
    'Rename instead of dropping so the data can be restored if needed',
  ],
  'DELETE FROM': [
    'Add a narrowing WHERE clause and wrap in a transaction: `BEGIN; DELETE FROM ... WHERE ... LIMIT 10; -- inspect; COMMIT;`',
    'Soft-delete instead: add a `deleted_at` column and update rows',
  ],
  'TRUNCATE': [
    'Back up first: `pg_dump -t table_name db > backup.sql`',
    'Use a migration tool so the operation is recorded and reversible',
  ],
  '> /dev/': [
    'Write to a file path you control instead of a device',
    'If you need to clear output, append to `/dev/null` only for *discarding* output, not for writing data',
  ],
  'mkfs': [
    'Verify the target device with `lsblk` / `diskutil list` before any filesystem operation',
    'Abort unless the user has explicitly named the device in the current turn',
  ],
  'dd if=': [
    'Verify destination with `lsblk` / `diskutil list`',
    'Use tools like `rsync` or `cp` when copying regular files (dd is rarely the right choice)',
  ],
  'kubectl delete': [
    'Preview with `kubectl get ...` or `--dry-run=client` first',
    'Scale to 0 instead of deleting: `kubectl scale deployment NAME --replicas=0`',
  ],
  'terraform destroy': [
    'Use `terraform plan -destroy` to preview',
    'Target a specific resource: `terraform destroy -target=RESOURCE`',
  ],
  'aws ec2 terminate': [
    'Stop first instead of terminating: `aws ec2 stop-instances --instance-ids ...`',
    'Snapshot the EBS volume before terminating',
  ],
  'helm uninstall': [
    'Use `helm rollback RELEASE 0` to restore a previous revision instead',
    'Run `helm list` and confirm the release/namespace before uninstalling',
  ],
  '--force': [
    'Prefer `--force-with-lease` (git) which aborts if the remote moved',
    'Remove `--force` and address the underlying cause reported by the tool',
  ],
  'production': [
    'Target a staging environment first to rehearse the change',
    'Request an explicit confirmation from the user before touching production',
  ],
};

/**
 * Returns safer alternatives for the first matching danger pattern, or [] if none.
 * @param {string} command
 * @returns {string[]}
 */
function getAlternativesForCommand(command) {
  if (!command) return [];
  for (const key of Object.keys(ALTERNATIVES_BY_PATTERN)) {
    if (command.includes(key)) {
      return ALTERNATIVES_BY_PATTERN[key];
    }
  }
  return [];
}

// ============================================================
// Handler: phase9-deploy-pre
// ============================================================

/**
 * Phase 9 deployment safety checks
 * @param {Object} input - Hook input
 * @returns {boolean} True if blocked
 */
function handlePhase9DeployPre(input) {
  const { command } = parseHookInput(input);
  if (!command) return false;

  // Dangerous deployment patterns that require manual confirmation
  const dangerousPatterns = [
    { pattern: 'kubectl delete', reason: 'Kubernetes resource deletion' },
    { pattern: 'terraform destroy', reason: 'Infrastructure destruction' },
    { pattern: 'aws ec2 terminate', reason: 'EC2 instance termination' },
    { pattern: 'helm uninstall', reason: 'Helm release removal' },
    { pattern: '--force', reason: 'Force flag detected' },
    { pattern: 'production', reason: 'Production environment detected' }
  ];

  for (const { pattern, reason } of dangerousPatterns) {
    if (command.toLowerCase().includes(pattern.toLowerCase())) {
      // ENH-264: provide alternatives via additionalContext
      outputBlockWithContext(
        `Deployment safety: ${reason}. Command '${pattern}' requires manual confirmation.`,
        getAlternativesForCommand(command) || getAlternativesForCommand(pattern)
      );
      return true;
    }
  }

  return false;
}

// ============================================================
// Handler: qa-pre-bash (shared by zero-script-qa and qa-monitor)
// ============================================================

/**
 * QA destructive command prevention
 * @param {Object} input - Hook input
 * @returns {boolean} True if blocked
 */
function handleQaPreBash(input) {
  const { command } = parseHookInput(input);
  if (!command) return false;

  const DESTRUCTIVE_PATTERNS = [
    { pattern: 'rm -rf', reason: 'Recursive force deletion' },
    { pattern: 'rm -r', reason: 'Recursive deletion' },
    { pattern: 'DROP TABLE', reason: 'SQL table drop' },
    { pattern: 'DROP DATABASE', reason: 'SQL database drop' },
    { pattern: 'DELETE FROM', reason: 'SQL mass deletion' },
    { pattern: 'TRUNCATE', reason: 'SQL table truncation' },
    { pattern: '> /dev/', reason: 'Device write' },
    { pattern: 'mkfs', reason: 'Filesystem creation' },
    { pattern: 'dd if=', reason: 'Low-level disk operation' }
  ];

  for (const { pattern, reason } of DESTRUCTIVE_PATTERNS) {
    if (command.includes(pattern)) {
      // ENH-264: provide alternatives via additionalContext
      outputBlockWithContext(
        `QA safety: ${reason}. Destructive command '${pattern}' blocked during testing.`,
        getAlternativesForCommand(pattern)
      );
      return true;
    }
  }

  return false;
}

// ============================================================
// Main Execution
// ============================================================

debugLog('UnifiedBashPre', 'Hook started');

// Read hook context
let input = {};
try {
  input = readStdinSync();
  if (typeof input === 'string') {
    input = JSON.parse(input);
  }
} catch (e) {
  debugLog('UnifiedBashPre', 'Failed to parse input', { error: e.message });
}

// Get current context
const activeSkill = getActiveSkill();
const activeAgent = getActiveAgent();

debugLog('UnifiedBashPre', 'Context', { activeSkill, activeAgent });

let blocked = false;

// Phase 9 deployment checks
if (activeSkill === 'phase-9-deployment') {
  blocked = handlePhase9DeployPre(input);
}

// QA checks (zero-script-qa skill or qa-monitor agent)
if (!blocked && (activeSkill === 'zero-script-qa' || activeAgent === 'qa-monitor')) {
  blocked = handleQaPreBash(input);
}

// ============================================================
// v2.0.0: Destructive Detector (Control Module)
// ============================================================
if (!blocked) {
  try {
    const dd = require('../lib/control/destructive-detector');
    const toolInput = parseHookInput(input);
    // ENH-389 (v2.1.33): pass the command STRING, not `{ command }`.
    //
    // `detect(toolName, toolInput)` documents `@param {string} toolInput`
    // (lib/control/destructive-detector.js:131) and falls back to
    // `JSON.stringify(toolInput)` for anything else (:135). Passing an object
    // therefore matched the rules against `{"command":"..."}` rather than the
    // command, which silently defeats every anchored pattern. Measured:
    //   detect('Bash', 'chmod 777 /')             -> G-008 critical
    //   detect('Bash', { command: 'chmod 777 /' }) -> not detected
    // because G-008 ends with `\/\s*$` and the JSON form ends with `"}`. The
    // same held for `chown root /` and `mv /etc/passwd /` — commands aimed at
    // the filesystem root were invisible to the detector in production.
    const result = dd.detect('Bash', toolInput.command || '');
    const criticalRules = (result.rules || []).filter((r) => r.severity === 'critical');
    if (result.detected && criticalRules.length > 0) {
      // ENH-388 (v2.1.33): actually block.
      //
      // This branch previously wrote an audit entry saying `result: 'blocked'`,
      // incremented the `destructiveBlocked` counter, and then let the command
      // run. Nothing here called an output helper or set `blocked`, so a
      // critical destructive command was recorded as blocked and executed
      // anyway — the audit trail and the session stats both asserted a
      // protection that did not exist.
      const ruleIds = criticalRules.map((r) => r.id);
      const reason = `bkit Destructive Detector: this command matches ${ruleIds.length > 1 ? 'rules' : 'rule'} `
        + `${ruleIds.join(', ')} (${criticalRules.map((r) => r.name).join('; ')}) and is blocked as critical.`;
      const alternatives = [
        'Scope the command to a specific path instead of a broad or root target',
        'Run the operation on a copy, or dry-run it first, to confirm the blast radius',
        'Ask the user for explicit confirmation if this destruction is intended',
      ];

      // ENH-393 (v2.1.33): record the decision that was actually made.
      // `result` was hardcoded to 'blocked' regardless of outcome; now the
      // audit entry is written on the path that genuinely blocks, and the
      // session counter increments only alongside a real block.
      try {
        const audit = require('../lib/audit/audit-logger');
        audit.writeAuditLog({
          actor: 'hook', actorId: 'unified-bash-pre',
          action: 'destructive_blocked', category: 'control',
          target: toolInput.command?.substring(0, 100) || '', targetType: 'file',
          details: { rules: ruleIds, confidence: result.confidence },
          result: 'blocked', destructiveOperation: true,
          reason,
        });
      } catch (_) { /* graceful — auditing must never prevent the block */ }
      // v2.1.1 TC-02: Track destructive blocks in session stats
      try {
        const ac = require('../lib/control/automation-controller');
        ac.incrementStat('destructiveBlocked');
      } catch (_) {}

      blocked = true;
      outputBlockWithContext(reason, alternatives, 'PreToolUse');
    }

    /*
     * v2.1.34 (D9) — high-severity findings ask instead of passing silently.
     *
     * Before this, only `critical` did anything, so a rule was either an
     * absolute refusal or invisible. That is why G-001 refused `rm -rf` on any
     * target at all: making it proportionate would have meant making it
     * toothless. With a grading step (see `severityFor` on G-001) a scoped
     * recursive delete lands on `high`, and `high` must reach the user rather
     * than slip past — grading it down to a silent allow would be a relaxation
     * dressed up as a fix.
     */
    if (!blocked && result.detected) {
      const askRules = (result.rules || []).filter((r) => r.severity === 'high');
      if (askRules.length > 0) {
        const ids = askRules.map((r) => r.id);
        const askReason =
          `bkit Destructive Detector: this command matches ${ids.length > 1 ? 'rules' : 'rule'} `
          + `${ids.join(', ')} (${askRules.map((r) => r.name).join('; ')}). `
          + `The target looks specific rather than broad, so this is a confirmation, not a refusal.`;
        try {
          const audit = require('../lib/audit/audit-logger');
          audit.writeAuditLog({
            actor: 'hook', actorId: 'unified-bash-pre',
            action: 'destructive_confirmation_requested', category: 'control',
            target: toolInput.command?.substring(0, 100) || '', targetType: 'file',
            details: { rules: ids, confidence: result.confidence },
            result: 'ask', destructiveOperation: true,
            reason: askReason,
          });
        } catch (_) { /* graceful — auditing must never prevent the prompt */ }
        outputAsk(askReason, [
          'Confirm the exact path is the one you mean',
          'Run the operation on a copy, or dry-run it first, to confirm the blast radius',
        ]);
      }
    }
  } catch (_) {}
}

// ============================================================
// v2.1.14 Sub-Sprint 2: Heredoc Bypass Defense (ENH-310, 차별화 #6)
// Catches `cat <<EOF | bash`-style permission bypass (CC #58904 regression).
// Runs after destructive-detector so destructive patterns in plain commands
// take precedence; heredoc-detector then catches the heredoc-encapsulated
// case that destructive-detector cannot see (heredoc body is invisible to
// substring match). All IO is best-effort, never throws.
// ============================================================
if (!blocked) {
  try {
    const { detect: detectHeredoc } = require('../lib/defense/heredoc-detector');
    const toolInput = parseHookInput(input);
    const verdict = detectHeredoc(toolInput.command || '');
    if (verdict.matched && verdict.severity === 'critical') {
      // Audit before block — fail-silent so block path still fires
      try {
        const audit = require('../lib/audit/audit-logger');
        audit.writeAuditLog({
          actor: 'hook', actorId: 'unified-bash-pre',
          action: 'heredoc_bypass_blocked', category: 'control',
          target: (toolInput.command || '').substring(0, 200), targetType: 'file',
          details: { pattern: verdict.pattern, vector: verdict.vector },
          result: 'blocked', destructiveOperation: true, blastRadius: 'critical',
          reason: verdict.reason,
        });
      } catch (_) { /* audit failure non-fatal */ }
      outputBlockWithContext(verdict.reason, verdict.alternatives, 'PreToolUse');
      blocked = true;
    }
    // warning severity → allow with audit-only (no block, no additionalContext spam)
    if (!blocked && verdict.matched && verdict.severity === 'warning') {
      try {
        const audit = require('../lib/audit/audit-logger');
        audit.writeAuditLog({
          actor: 'hook', actorId: 'unified-bash-pre',
          // ENH-393 class (v2.1.33): this said `heredoc_bypass_blocked` on the
          // path that deliberately ALLOWS the command. Reading the audit trail,
          // an observed-but-permitted heredoc was indistinguishable from a
          // blocked one — the same false-assurance pattern as the destructive
          // detector's hardcoded `result: 'blocked'`. The action now names what
          // actually happened; `result: 'success'` below was already correct.
          action: 'heredoc_bypass_observed', category: 'control',
          target: (toolInput.command || '').substring(0, 200), targetType: 'file',
          details: { pattern: verdict.pattern, vector: verdict.vector, severity: 'warning' },
          result: 'success',
          reason: verdict.reason,
        });
      } catch (_) { /* graceful */ }
    }
  } catch (_) { /* heredoc-detector unavailable — fail-open */ }
}

// ============================================================
// v2.1.14 Sub-Sprint 2: Push Event Guard (ENH-298)
// Distinguishes fork-push (allowed at L0-L3) from upstream-push (always asks),
// and denies force pushes regardless. Runs after heredoc-detector; the two
// guards are independent (a heredoc-wrapped git push would already have been
// blocked at the heredoc stage).
// ============================================================
if (!blocked) {
  try {
    const guard = require('../lib/defense/push-event-guard');
    const toolInput = parseHookInput(input);
    const parsed = guard.detectPushCommand(toolInput.command || '');
    if (parsed.isPush) {
      const ac2 = require('../lib/control/automation-controller');
      const trustLevel = (() => {
        try { const lv = ac2.getCurrentLevel(); return typeof lv === 'string' ? lv : `L${lv}`; }
        catch (_) { return 'L2'; }
      })();
      const classified = guard.classifyRemote(parsed.remote || 'origin');
      const verdict = guard.shouldGuard(parsed, classified, trustLevel);
      try {
        const audit = require('../lib/audit/audit-logger');
        audit.writeAuditLog({
          actor: 'hook', actorId: 'unified-bash-pre',
          action: 'git_push_intercepted', category: 'control',
          target: parsed.remote || 'origin', targetType: 'config',
          details: {
            force: parsed.force, branch: parsed.branch,
            kind: classified.kind, isFork: classified.isFork,
            trustLevel, action: verdict.action,
          },
          result: verdict.action === 'allow' ? 'success' : 'blocked',
          destructiveOperation: parsed.force === true,
          blastRadius: parsed.force ? 'high' : null,
          reason: verdict.reason,
        });
      } catch (_) { /* graceful */ }
      if (verdict.action === 'deny' || verdict.action === 'ask') {
        outputBlockWithContext(verdict.reason, verdict.alternatives, 'PreToolUse');
        blocked = true;
      }
    }
  } catch (_) { /* push-event-guard unavailable — fail-open */ }
}

// ============================================================
// v2.1.14 Sub-Sprint 4 Stage 4 (ENH-300, differentiation #4): effort-aware
// ------------------------------------------------------------
// CC v2.1.133+ exposes the model's effort/reasoning budget as `effort.level`
// on the tool_input (when present) and as $CLAUDE_EFFORT in the hook env.
// We don't gate on it (the model's self-report is advisory) but we DO use it
// to adjust defense verbosity and audit detail: 'low' → terse, 'high' →
// verbose. The value is normalized through the domain invariant-10 guard so
// out-of-range strings degrade safely to 'medium' instead of disabling
// downstream defenses.
// ============================================================
let effortLevel = 'medium';
if (!blocked) {
  try {
    const inv10 = require('../lib/domain/guards/invariant-10-effort-aware');
    const fromPayload = input && input.tool_input && typeof input.tool_input.effort === 'object'
      ? input.tool_input.effort.level
      : undefined;
    const fromEnv = process.env.CLAUDE_EFFORT;
    const raw = (typeof fromPayload === 'string' && fromPayload.length > 0) ? fromPayload : fromEnv;
    const guardResult = inv10.check({
      effortLevel: raw,
      source: fromPayload !== undefined ? 'payload' : (fromEnv ? 'env' : 'default'),
      scope: 'unified-bash-pre',
    });
    if (guardResult.hit) {
      debugLog('UnifiedBashPre', 'invariant-10 effort-aware guard hit', guardResult.meta);
    }
    effortLevel = inv10.normalize(raw);
    debugLog('UnifiedBashPre', 'effort-aware intensity resolved', { effortLevel });
  } catch (_) { /* effort-aware unavailable — fail-open with default 'medium' */ }
}

// ============================================================
// v2.1.14 Sub-Sprint 4 Stage 5 (ENH-286, differentiation #1): Memory Enforcer
// ------------------------------------------------------------
// CC treats CLAUDE.md as advisory (issues #56865, #57485, #58887 show the
// model overriding directives via R-3 evolved forms). bkit hard-enforces by
// extracting "Do NOT", "NEVER", "FORBIDDEN", "MUST NOT" directives at
// SessionStart, caching them to .bkit/runtime/memory-directives.json, and
// matching tool_input here on every Bash PreToolUse. A deny match short-
// circuits the hook with audit `memory_directive_enforced`. Verbosity scales
// with effortLevel ('low' → bare reason, 'high' → full directive context).
// ============================================================
if (!blocked) {
  try {
    const fs = require('fs');
    const path = require('path');
    const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
    const cacheFile = path.join(root, '.bkit', 'runtime', 'memory-directives.json');
    let directives = [];
    if (fs.existsSync(cacheFile)) {
      try {
        const payload = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
        const { deserializeMemoryDirectives } = require('../lib/defense');
        directives = deserializeMemoryDirectives(payload);
      } catch (e) {
        debugLog('UnifiedBashPre', 'memory-directives cache parse failed', { error: e.message });
      }
    }
    if (directives.length > 0) {
      const { enforceMemoryDirectives } = require('../lib/defense');
      const toolCall = {
        tool: 'Bash',
        command: (input && input.tool_input && input.tool_input.command) || '',
      };
      const verdict = enforceMemoryDirectives(toolCall, directives);
      if (!verdict.allowed && verdict.deniedBy) {
        const d = verdict.deniedBy;
        const verbose = effortLevel === 'high';
        const baseReason = `bkit Memory Enforcer: directive "${d.text.slice(0, 80)}" denied this command (rule: ${d.rule}, source: ${d.source}).`;
        const reason = verbose
          ? baseReason + ` Matched pattern: /${d.pattern.slice(0, 60)}/i.`
          : baseReason;
        // ENH-410 (v2.1.33): give the model something to do instead of a dead end.
        // Every other block site in this file already passes alternatives; this
        // one did not, and its recovery hint was buried in a prose sentence that
        // never reached the model at all (see the outputBlockWithContext call
        // below for why).
        const alternatives = [
          `Narrow the command so it no longer matches /${d.pattern.slice(0, 60)}/i`,
          `Edit the directive in ${d.source} if this command should be allowed`,
          'Ask the user for explicit confirmation before retrying',
        ];
        try {
          const audit = require('../lib/audit/audit-logger');
          audit.writeAuditLog({
            actor: 'hook', actorId: 'unified-bash-pre',
            action: 'memory_directive_enforced', category: 'control',
            target: toolCall.command.slice(0, 240) || 'unknown', targetType: 'tool_call',
            details: {
              tool: 'Bash',
              rule: d.rule,
              source: d.source,
              pattern: d.pattern.slice(0, 80),
              effortLevel,
              warnings: verdict.warnings.length,
            },
            result: 'blocked',
            destructiveOperation: false,
            reason,
          });
        } catch (_) { /* graceful */ }
        // ENH-410 (v2.1.33): was `outputBlock('deny', reason, 'PreToolUse')`.
        //
        // `outputBlock(reason)` takes ONE parameter (lib/core/io.js:346), so
        // `reason` bound to the literal 'deny' and the other two arguments were
        // dropped on the floor. Everything computed above — the directive text,
        // rule, source, matched pattern — was discarded, and the model received
        // exactly `{"decision":"block","reason":"deny"}`. Verified by execution.
        //
        // That mattered beyond cosmetics: with no stated cause, the model's
        // rational move is to retry the same command, and CC's auto mode pauses
        // after 3 consecutive blocks (aborting outright in headless `-p` runs,
        // per code.claude.com/docs/en/permission-modes.md:332-334).
        //
        // This is the Memory Enforcer path — bkit differentiation #1 — and the
        // four other block sites in this file already called the right helper.
        outputBlockWithContext(reason, alternatives, 'PreToolUse');
        blocked = true;
      } else if (verdict.warnings.length > 0 && effortLevel === 'high') {
        // High-effort mode surfaces soft warnings to the user via debug log.
        debugLog('UnifiedBashPre', 'memory-directive warn matched', {
          count: verdict.warnings.length, first: verdict.warnings[0].rule,
        });
      }
    }
  } catch (_) { /* memory-enforcer unavailable — fail-open */ }
}

// v2.1.33 (D4): the v2.0.0 "Scope Limiter" placeholder block was removed here.
// It required scope-limiter and automation-controller, called getCurrentLevel(),
// discarded both results, and swallowed any error — a provable no-op, verified
// on five points before removal (unused symbols, no module-load side effects, a
// redundant require already satisfied at lines 248/314, a read-only
// getCurrentLevel, and zero write primitives in automation-controller).
// Archived with that reasoning at .backup/v2.1.33/ (git-ignored).
// The genuine Bash-path scope enforcement gap it appeared to cover is tracked
// as ENH-388 / ENH-398, which restore real blocking rather than a placeholder.

// ============================================================
// Sprint 4.5 Integration: CC regression attribution (ENH-262 / #51798)
// Best-effort — attribution only, never blocks. bkit does NOT fix the CC
// regression; it surfaces "not a bkit failure" context when the combo hits.
// ============================================================
let ccRegressionAttr = '';
if (!blocked) {
  try {
    const ccRegression = require('../lib/cc-regression');
    const toolInput = parseHookInput(input);
    const envOverrides = {
      dangerouslyDisableSandbox:
        process.env.CLAUDE_CODE_DANGEROUSLY_DISABLE_SANDBOX === '1' ||
        process.env.CLAUDE_DANGEROUSLY_DISABLE_SANDBOX === '1',
    };
    const result = ccRegression.checkCCRegression({
      tool: 'Bash',
      command: toolInput.command,
      envOverrides,
      permissionDecision: input.permissionDecision || 'allow',
    });
    if (result && Array.isArray(result.attributions) && result.attributions.length > 0) {
      ccRegressionAttr = ' | ' + result.attributions.join(' | ');
      debugLog('UnifiedBashPre', 'CC regression attribution', {
        attr: ccRegressionAttr.slice(0, 80),
      });
    }
  } catch (e) {
    debugLog('UnifiedBashPre', 'cc-regression unavailable', { error: e.message });
  }
}

// Allow if not blocked
if (!blocked) {
  const contextMsg = activeSkill || activeAgent
    ? `Bash command validated for ${activeSkill || activeAgent}.`
    : 'Bash command validated.';
  outputAllow(contextMsg + ccRegressionAttr, 'PreToolUse');
}

debugLog('UnifiedBashPre', 'Hook completed', { blocked });
