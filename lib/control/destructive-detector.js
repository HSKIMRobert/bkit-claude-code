#!/usr/bin/env node
/**
 * Destructive Operation Detector (FR-10)
 * Detects destructive operations before execution using 8 guardrail rules.
 *
 * Rules G-001 to G-008 cover recursive delete, force push, hard reset,
 * protected branch modification, env file modification, secret key access,
 * mass file deletion, and root directory operations.
 *
 * @version 2.1.10
 * @module lib/control/destructive-detector
 */

/**
 * @typedef {Object} GuardrailRule
 * @property {string} id - Rule identifier (G-001 to G-008)
 * @property {string} name - Human-readable rule name
 * @property {RegExp} pattern - Detection pattern
 * @property {'critical'|'high'|'medium'} severity - Rule severity
 * @property {'deny'|'ask'|'allow'} defaultAction - Default action when triggered
 */

/**
 * @typedef {Object} DetectionResult
 * @property {boolean} detected - Whether a destructive operation was detected
 * @property {Array<{id: string, name: string, severity: string, pattern: string}>} rules - Matched rules
 * @property {number} confidence - Detection confidence 0-1
 */

/**
 * Guardrail rules for destructive operation detection
 * @type {GuardrailRule[]}
 */
const GUARDRAIL_RULES = [
  {
    id: 'G-001',
    name: 'Recursive delete',
    pattern: /\b(rm\s+-(r|rf|fr)\b|rm\s+--recursive|rimraf|shutil\.rmtree|Remove-Item\s+-Recurse)/i,
    severity: 'critical',
    defaultAction: 'deny',
    /*
     * v2.1.34 (D9) — severity depends on WHAT is being deleted.
     *
     * This rule matched `rm -r` regardless of target, so deleting a scoped
     * temporary directory was refused exactly as hard as deleting `/`. The
     * refusal then advised "Scope the command to a specific path instead of a
     * broad or root target" — advice the rule made impossible to act on, since
     * scoping changed nothing. Guidance a user cannot follow is how a guard
     * teaches people to switch it off, and both cases below were hit doing
     * ordinary work on this release.
     *
     * A dangerous target still denies. A specific one asks.
     */
    severityFor: (text) => (deleteTargetIsBroad(text) ? 'critical' : 'high'),
  },
  {
    id: 'G-002',
    name: 'Force push',
    pattern: /\bgit\s+push\s+.*(-f|--force|--force-with-lease)\b/i,
    severity: 'critical',
    defaultAction: 'deny'
  },
  {
    id: 'G-003',
    name: 'Hard reset',
    pattern: /\bgit\s+reset\s+--hard\b/i,
    severity: 'high',
    defaultAction: 'ask'
  },
  {
    id: 'G-004',
    name: 'Protected branch modification',
    pattern: /\bgit\s+(commit|merge|rebase|push)\b.*\b(main|master|release|production)\b/i,
    severity: 'high',
    defaultAction: 'ask'
  },
  {
    id: 'G-005',
    name: 'Environment file modification',
    pattern: /\b(\.env|\.env\.\w+)\b/i,
    severity: 'high',
    defaultAction: 'ask'
  },
  {
    id: 'G-006',
    name: 'Secret key access',
    pattern: /\b[\w/.-]+(\.key|\.pem|\.p12|\.pfx|\.jks|\.keystore)\b/i,
    severity: 'high',
    defaultAction: 'ask'
  },
  {
    id: 'G-007',
    name: 'Mass file deletion',
    pattern: /\b(rm|del|delete|remove)\b.*(\s+\S+){5,}/i,
    severity: 'medium',
    defaultAction: 'ask'
  },
  {
    id: 'G-008',
    name: 'Root directory operations',
    pattern: /\b(rm|mv|cp|chmod|chown)\s+.*\s+\/\s*$/,
    severity: 'critical',
    defaultAction: 'deny'
  },
  // v2.1.12 Sprint E-1 (defect #19 fix): DB destruction patterns previously
  // were not matched (e.g. `DROP TABLE users` returned isDestructive=false).
  // Added SQL DDL/DML destruction + NoSQL drop patterns.
  {
    id: 'G-009',
    name: 'SQL table/database drop',
    // matches DROP TABLE / DROP DATABASE / DROP SCHEMA / DROP INDEX / DROP VIEW
    pattern: /\bDROP\s+(TABLE|DATABASE|SCHEMA|INDEX|VIEW|TRIGGER|PROCEDURE|FUNCTION)\b/i,
    severity: 'critical',
    defaultAction: 'deny'
  },
  {
    id: 'G-010',
    name: 'SQL TRUNCATE / ALTER DROP COLUMN',
    pattern: /\b(TRUNCATE\s+TABLE\b|ALTER\s+TABLE\s+\S+\s+DROP\s+COLUMN)\b/i,
    severity: 'critical',
    defaultAction: 'deny'
  },
  {
    id: 'G-010b',
    name: 'DELETE without WHERE clause',
    // Matches `DELETE FROM <ident>` only when no WHERE clause appears after
    // it (case-insensitive single-line). Use the `s` flag so `.` spans newlines.
    pattern: /\bDELETE\s+FROM\s+[\w.]+(?![\s\S]*\bWHERE\b)/i,
    severity: 'critical',
    defaultAction: 'deny'
  },
  {
    id: 'G-011',
    name: 'NoSQL collection drop',
    // MongoDB `db.collection.drop()` / `dropDatabase()` / Redis FLUSHALL/FLUSHDB
    pattern: /\b(db\.\w+\.drop\s*\(\s*\)|dropDatabase\s*\(\s*\)|FLUSHALL\b|FLUSHDB\b)/i,
    severity: 'critical',
    defaultAction: 'deny'
  },
  /*
   * G-012 ~ G-015 (v2.1.34) — bypasses proven against the shipped v2.1.33 rules.
   *
   * The rules above are a denylist of literal shapes, so they hold only for the
   * spellings someone thought to write down. Probing the live PreToolUse handler
   * showed which spellings were missing: the recursive-delete rules caught the
   * plain form, a variable-indirected form, an xargs form and `shutil.rmtree`,
   * but these four went straight through with `decision: allow`.
   *
   * A denylist is never complete, and these additions do not make it so. They
   * close the specific holes that were demonstrated rather than imagined, and
   * each ships with a regression test in
   * test/regression/destructive-bypass.test.js. The honest framing of this
   * subsystem is a known-pattern guard, not a complete defense — the docs now
   * say that.
   */
  {
    id: 'G-012',
    name: 'Obfuscated command execution',
    // `eval "$(echo <base64> | base64 -d)"`, `... | base64 --decode | sh`, and
    // the `bash <(...)` process-substitution form. The payload is unknowable at
    // match time, which is exactly why executing it cannot be waved through.
    pattern: /\b(base64\s+(-d|-D|--decode)\b[\s\S]*\|\s*(ba)?sh\b|eval\s+"?\$\(|(ba)?sh\s+<\(|\|\s*eval\b)/i,
    severity: 'critical',
    defaultAction: 'deny'
  },
  {
    id: 'G-013',
    name: 'Find-based mass deletion',
    // `find / -delete` and `find . -exec rm {} \;` delete recursively without
    // ever containing the token `rm -rf`, so G-001 and G-007 both miss them.
    pattern: /\bfind\s+[\s\S]*?(-delete\b|-exec\s+(rm|unlink|shred)\b|-execdir\s+(rm|unlink|shred)\b|\|\s*xargs\s+(-\S+\s+)*(rm|unlink|shred)\b)/i,
    severity: 'critical',
    defaultAction: 'deny'
  },
  {
    id: 'G-014',
    name: 'Raw device or disk write',
    // `dd of=/dev/disk0`, `mkfs`, `> /dev/sda`. Destroys a volume outright and
    // shares no token with any delete rule.
    pattern: /\b(dd\s+[\s\S]*\bof=\s*\/dev\/|mkfs(\.\w+)?\s|>\s*\/dev\/(disk|sd|nvme|hd)\w*|\bwipefs\b|\bblkdiscard\b)/i,
    severity: 'critical',
    defaultAction: 'deny'
  },
  {
    id: 'G-015',
    name: 'Remote script piped to a shell',
    // `curl … | sh`, `wget -O- … | bash`. Executes code nobody in this session
    // has read, from a host nobody has vetted.
    pattern: /\b(curl|wget|fetch)\b[\s\S]*\|\s*(sudo\s+)?(ba|z|k|da)?sh\b/i,
    severity: 'critical',
    defaultAction: 'deny'
  }
];

/**
 * Fields of a parsed hook input that can carry a destructive operation.
 * Anything not listed here (ids, booleans, metadata) is not worth matching and
 * only adds noise.
 */
const MATCHABLE_FIELDS = ['command', 'file_path', 'filePath', 'content', 'old_string', 'oldString', 'new_string', 'newString'];

/**
 * Normalize an input into the list of strings the rules should run against.
 *
 * ENH-389 (v2.1.33): this used to be `JSON.stringify(toolInput)` for anything
 * that was not already a string, which quietly broke every anchored pattern.
 * `{"command":"chmod 777 /"}` ends with `"}`, so G-008's `\/\s*$` never
 * matched and commands aimed at the filesystem root were invisible. Measured
 * before the fix:
 *   detect('Bash', 'chmod 777 /')              -> G-008 critical
 *   detect('Bash', { command: 'chmod 777 /' }) -> not detected
 *
 * Fixing only the call site would have left the trap armed for the next caller
 * (`scripts/pre-write.js:217` passes a parsed object today). Each field is
 * matched separately so per-field anchors behave exactly as they do for a bare
 * string, rather than being concatenated into one blob.
 *
 * @param {string|object|null|undefined} toolInput
 * @returns {string[]}
 */
function toMatchableStrings(toolInput) {
  if (typeof toolInput === 'string') return [toolInput];
  if (!toolInput || typeof toolInput !== 'object') return [''];
  const parts = [];
  for (const key of MATCHABLE_FIELDS) {
    const v = toolInput[key];
    if (typeof v === 'string' && v.length > 0) parts.push(v);
  }
  // Nothing recognizable — fall back to the raw values so a novel shape is not
  // silently exempt from every rule.
  if (parts.length === 0) {
    for (const v of Object.values(toolInput)) {
      if (typeof v === 'string' && v.length > 0) parts.push(v);
    }
  }
  return parts.length > 0 ? parts : [''];
}

/**
 * Targets that make a recursive delete catastrophic rather than routine.
 *
 * Deliberately conservative: anything not recognised as specific is treated as
 * broad. Being wrong in this direction costs a confirmation prompt; being wrong
 * in the other direction costs the user their data.
 */
const BROAD_DELETE_TARGETS = [
  /(^|\s)\/(\s|$)/,                       // the filesystem root
  /(^|\s)~(\/?\s|\/?$)/,                  // home
  /\$(HOME|PWD|CWD|ROOT|PROJECT_ROOT)\b/, // an env var standing in for a root
  /(^|\s)\.\.?(\s|$)/,                    // bare . or ..
  /(^|\s)\/(etc|usr|var|bin|sbin|lib|opt|boot|dev|sys|proc|System|Library|Applications|Users|home)(\/|\s|$)/i,
  /(^|\s)[A-Za-z]:\\(\s|$)/,              // a Windows drive root
  /(^|\s)\/\*/,                           // a glob directly under root
  /(^|\s)\*(\s|$)/,                       // a bare glob
  /(^|\s)["']?\$\{?\w+\}?["']?(\s|$)/,    // an unresolved variable as the whole target
];

/**
 * Does this recursive-delete command aim at something broad?
 *
 * An unparseable command counts as broad — the point is to be sure the target
 * is specific before relaxing, never to guess that it is.
 *
 * @param {string} text - the command that matched the recursive-delete pattern
 * @returns {boolean}
 */
function deleteTargetIsBroad(text) {
  if (typeof text !== 'string') return true;

  // Everything after the delete verb, minus its flags, is the target list.
  const m = text.match(/\b(?:rm|rimraf|Remove-Item)\b(.*)$/is);
  if (!m) return true; // shutil.rmtree(...) and friends: not parsed, stay strict
  const operands = m[1]
    .split(/\s+/)
    .filter((tok) => tok && !tok.startsWith('-'));

  if (operands.length === 0) return true; // no target found — do not relax

  return operands.some((operand) => {
    const target = ' ' + operand.replace(/^["']|["']$/g, '') + ' ';
    return BROAD_DELETE_TARGETS.some((re) => re.test(target));
  });
}

/**
 * Remove heredoc BODIES before rule matching.
 *
 * A heredoc body is data on a program's stdin, not a command line. Matching
 * rules against it produces false positives that are indistinguishable from
 * real findings — writing a commit message that merely *mentions* `find -delete`
 * or `curl | sh`, or piping documentation text through `python3 - <<'PY'`, was
 * enough to be refused as critical. Both happened during work on v2.1.34, and a
 * guard that blocks ordinary work is a guard people switch off.
 *
 * This does not create a bypass. The heredoc-as-bypass vector — a heredoc piped
 * into an interpreter, or a command substitution alongside one — is the whole
 * subject of `lib/defense/heredoc-detector.js`, which inspects the command
 * STRUCTURE and still sees everything here. What this strips is only the inert
 * payload, and the delimiter line itself is kept so structural rules can still
 * see that a heredoc was present.
 *
 * Handles the `<<EOF`, `<<-EOF`, `<<'EOF'` and `<<"EOF"` spellings.
 *
 * @param {string} command
 * @returns {string} the command with heredoc bodies elided
 */
function stripHeredocBodies(command) {
  if (typeof command !== 'string' || !command.includes('<<')) return command;
  const lines = command.split('\n');
  const out = [];
  let delimiter = null;
  let terminated = true;
  for (const line of lines) {
    if (delimiter === null) {
      out.push(line);
      const m = line.match(/<<-?\s*(?:'([^']+)'|"([^"]+)"|([A-Za-z_][A-Za-z0-9_]*))/);
      if (m) { delimiter = m[1] || m[2] || m[3]; terminated = false; }
      continue;
    }
    /*
     * Inside a body: drop the content, but keep the terminator line WHOLE. A
     * known bypass writes the exec vector on that line (`EOF-1 | bash`), so
     * truncating at the delimiter would remove the very thing worth matching.
     * Prefix match, not equality, for the same reason.
     */
    if (line.trim() === delimiter || line.trimStart().startsWith(delimiter)) {
      out.push(line);
      delimiter = null;
      terminated = true;
    }
  }
  // No terminator found — there is no trustworthy body boundary, so match
  // against everything. This helper may remove noise, never evidence.
  if (!terminated) return command;
  return out.join('\n');
}

/**
 * Detect destructive operations in a tool invocation
 * @param {string} toolName - Name of the tool being invoked
 * @param {string|object} toolInput - Command string, or a parsed tool input whose
 *   command/path/content fields are matched individually (see toMatchableStrings)
 * @returns {DetectionResult}
 */
function detect(toolName, toolInput) {
  const inputs = toMatchableStrings(toolInput).map(stripHeredocBodies);
  // Kept for the tool-specific checks below, which only need substring semantics.
  const input = inputs.join('\n');
  const matchedRules = [];

  for (const rule of GUARDRAIL_RULES) {
    const hit = inputs.find((s) => rule.pattern.test(s));
    if (hit !== undefined) {
      matchedRules.push({
        id: rule.id,
        name: rule.name,
        // A rule may grade itself from the matched text — see G-001, where the
        // target decides whether a recursive delete is catastrophic or routine.
        severity: typeof rule.severityFor === 'function'
          ? rule.severityFor(hit)
          : rule.severity,
        pattern: rule.pattern.source
      });
    }
  }

  // Also check tool-specific destructive patterns
  if (toolName === 'Write' || toolName === 'Edit') {
    // Check G-005 and G-006 for file operations
    const envMatch = GUARDRAIL_RULES.find(r => r.id === 'G-005');
    const keyMatch = GUARDRAIL_RULES.find(r => r.id === 'G-006');
    if (envMatch && envMatch.pattern.test(input) && !matchedRules.some(r => r.id === 'G-005')) {
      matchedRules.push({ id: 'G-005', name: envMatch.name, severity: envMatch.severity, pattern: envMatch.pattern.source });
    }
    if (keyMatch && keyMatch.pattern.test(input) && !matchedRules.some(r => r.id === 'G-006')) {
      matchedRules.push({ id: 'G-006', name: keyMatch.name, severity: keyMatch.severity, pattern: keyMatch.pattern.source });
    }
  }

  const confidence = matchedRules.length > 0
    ? Math.min(1, 0.5 + matchedRules.length * 0.2)
    : 0;

  return {
    detected: matchedRules.length > 0,
    rules: matchedRules,
    confidence
  };
}

/**
 * Quick check whether a Bash command is destructive
 * @param {string} command - Bash command string
 * @returns {boolean}
 */
function isDestructive(command) {
  if (!command || typeof command !== 'string') return false;
  return GUARDRAIL_RULES.some(rule => rule.pattern.test(command));
}

/**
 * Generate a human-readable block message for matched rules
 * @param {Array<{id: string, name: string, severity: string, pattern: string}>} rules - Matched rules
 * @returns {string}
 */
function getBlockMessage(rules) {
  if (!rules || rules.length === 0) {
    return 'No destructive operations detected.';
  }

  const lines = [
    '⛔ Destructive operation blocked by bkit guardrails:',
    ''
  ];

  for (const rule of rules) {
    const severityTag = rule.severity === 'critical' ? '[CRITICAL]'
      : rule.severity === 'high' ? '[HIGH]'
        : '[MEDIUM]';
    lines.push(`  ${severityTag} ${rule.id}: ${rule.name}`);
  }

  lines.push('');
  lines.push('To proceed, adjust guardrail settings in bkit.config.json or use manual override.');

  return lines.join('\n');
}

/**
 * Get the default action for a specific rule
 * @param {string} ruleId - Rule ID (e.g., 'G-001')
 * @returns {'deny'|'ask'|'allow'|null}
 */
function getRuleAction(ruleId) {
  const rule = GUARDRAIL_RULES.find(r => r.id === ruleId);
  return rule ? rule.defaultAction : null;
}

/**
 * Get all guardrail rules
 * @returns {GuardrailRule[]}
 */
function getRules() {
  return GUARDRAIL_RULES.map(r => ({
    id: r.id,
    name: r.name,
    severity: r.severity,
    defaultAction: r.defaultAction,
    pattern: r.pattern.source
  }));
}

/**
 * Add a custom guardrail rule at runtime
 * @param {{ id: string, name: string, severity: string, pattern: RegExp, defaultAction: string }} rule
 */
function addCustomRule(rule) {
  if (!rule || !rule.id || !rule.pattern) return;
  const existing = GUARDRAIL_RULES.find(r => r.id === rule.id);
  if (!existing) {
    GUARDRAIL_RULES.push(rule);
  }
}

/**
 * Disable a guardrail rule by ID
 * @param {string} ruleId - Rule ID to disable
 * @param {string} [reason] - Reason for disabling
 * @returns {boolean} True if rule was found and disabled
 */
function disableRule(ruleId, reason) {
  const rule = GUARDRAIL_RULES.find(r => r.id === ruleId);
  if (rule) {
    rule._disabled = true;
    rule._disableReason = reason || 'unknown';
    return true;
  }
  return false;
}

module.exports = {
  detect,
  isDestructive,
  getBlockMessage,
  getRuleAction,
  getRules,
  addCustomRule,
  disableRule,
  stripHeredocBodies,
  GUARDRAIL_RULES
};
