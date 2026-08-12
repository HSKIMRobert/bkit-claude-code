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
    /*
     * ENH-442 (v2.1.36) — `(?!-)` excludes hyphenated sub-commands.
     *
     * `\b` is satisfied by a hyphen, so `merge` matched `merge-base` and the
     * read-only `git merge-base origin/master HEAD` was graded as a protected
     * branch modification. Reported in issue #148; `merge-tree` and `merge-file`
     * were measured to have the same defect and are covered by the same guard.
     *
     * The hyphenated spellings are git's plumbing (`merge-base`, `merge-tree`,
     * `merge-file`, `commit-tree`) — they compute and report, they do not move a
     * branch. The porcelain commands that DO move a branch are exactly the
     * un-hyphenated four, so excluding the hyphen form is the whole fix.
     */
    pattern: /\bgit\s+(commit|merge|rebase|push)(?!-)\b.*\b(main|master|release|production)\b/i,
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
    defaultAction: 'ask',
    // ENH-445 (v2.1.36): listing a key file is not accessing it. See
    // isMetadataOnlyAccess(). Readers and copiers are unaffected.
    suppressIf: isMetadataOnlyAccess,
  },
  {
    id: 'G-007',
    name: 'Mass file deletion',
    pattern: /\b(rm|del|delete|remove)\b.*(\s+\S+){5,}/i,
    severity: 'medium',
    defaultAction: 'ask',
    // ENH-447 (v2.1.36): SQL's `DELETE FROM` is not a filesystem deletion. The
    // SQL rules own that language; G-010b still catches an unscoped DELETE.
    suppressIf: looksLikeSqlStatement,
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
    defaultAction: 'deny',
    // ENH-440: SQL statements end at `;`, not at a newline. See splitCommandSegments().
    segmentOn: 'sql'
  },
  {
    id: 'G-010',
    name: 'SQL TRUNCATE / ALTER DROP COLUMN',
    pattern: /\b(TRUNCATE\s+TABLE\b|ALTER\s+TABLE\s+\S+\s+DROP\s+COLUMN)\b/i,
    severity: 'critical',
    defaultAction: 'deny',
    segmentOn: 'sql'
  },
  {
    id: 'G-010b',
    name: 'DELETE without WHERE clause',
    /*
     * Matches `DELETE FROM <ident>` only when no WHERE clause follows it.
     *
     * ENH-446 (v2.1.36) — the lookahead is unchanged, but it is now evaluated
     * against ONE statement instead of the whole input. Previously a WHERE
     * belonging to an unrelated later statement suppressed the match, so an
     * unscoped DELETE went undetected. Measured on v2.1.35:
     *
     *   DELETE FROM audit_log; SELECT 1 FROM t WHERE x=1   -> not detected
     *   DELETE FROM audit_log -- WHERE                     -> not detected
     *
     * Both now segment at `;` (and the comment case matches within its own
     * statement), so the lookahead only sees the DELETE's own clause.
     */
    pattern: /\bDELETE\s+FROM\s+[\w.]+(?![\s\S]*\bWHERE\b)/i,
    severity: 'critical',
    defaultAction: 'deny',
    segmentOn: 'sql'
  },
  {
    id: 'G-011',
    name: 'NoSQL collection drop',
    // MongoDB `db.collection.drop()` / `dropDatabase()` / Redis FLUSHALL/FLUSHDB
    pattern: /\b(db\.\w+\.drop\s*\(\s*\)|dropDatabase\s*\(\s*\)|FLUSHALL\b|FLUSHDB\b)/i,
    severity: 'critical',
    defaultAction: 'deny',
    segmentOn: 'sql'
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
    defaultAction: 'deny',
    // ENH-443 (v2.1.36): grade by target, matching G-001. A broad target still
    // denies; a scoped one asks. See findTargetIsBroad() for the measured
    // asymmetry this removes.
    severityFor: (text) => (findTargetIsBroad(text) ? 'critical' : 'high'),
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

  /*
   * The target list runs from the delete verb to the next command separator —
   * NOT to the end of the input.
   *
   * The first version used `(.*)$` with the `s` flag, which swallowed every
   * subsequent line of a multi-command block, so anything appearing later in
   * the script was read as an operand of the delete. Reproduced while working
   * on v2.1.34, on a block of the shape:
   *
   *   cd "$JOB/tmp" && rm -rf degtest && mkdir degtest
   *   ...
   *   printf ... | CLAUDE_PROJECT_DIR="$PWD" node r.js
   *
   * `$PWD` on the last line matched the "env var standing in for a root" rule,
   * so a delete of one scoped directory was graded `critical` and refused —
   * while advising the user to "scope the command to a specific path", which
   * they had already done. A guard that refuses correct commands and gives
   * unfollowable advice is one people switch off, and then it protects nothing.
   */
  const m = text.match(/\b(?:rm|rimraf|Remove-Item)\b([^\n;|&]*)/i);
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
 * Commands that report a file's METADATA without reading its contents.
 *
 * ENH-445 (v2.1.36) — G-006 fires on any mention of a key-file extension, so
 * `ls -la ./certs/server.pem` was graded "Secret key access" and prompted. The
 * rule exists to notice a secret being READ or moved; a directory listing does
 * neither, and prompting for it is the kind of unfollowable friction that
 * teaches people to switch the guard off.
 *
 * Deliberately a short allowlist of commands whose entire job is metadata. Any
 * verb not on it — including every reader (`cat`, `head`, `openssl`, `base64`)
 * and every copier (`cp`, `scp`, `rsync`) — still fires.
 */
const METADATA_ONLY_COMMANDS = [
  'ls', 'll', 'stat', 'file', 'find', 'basename', 'dirname', 'realpath',
  'readlink', 'test', 'wc', 'du',
];

/**
 * Is this segment nothing but a metadata query over its operands?
 *
 * @param {string} text - the segment that matched
 * @returns {boolean} true when the leading command only reports metadata
 */
function isMetadataOnlyAccess(text) {
  if (typeof text !== 'string') return false;
  const m = text.trim().match(/^([\w./-]+)/);
  if (!m) return false;
  const verb = m[1].split('/').pop(); // /bin/ls -> ls
  return METADATA_ONLY_COMMANDS.includes(verb.toLowerCase());
}

/**
 * Does this segment read as a SQL statement rather than a shell command?
 *
 * ENH-447 (v2.1.36) — G-007 ("Mass file deletion") counts operands after the
 * token `delete`, and SQL's `DELETE FROM` supplies it. Measured on v2.1.35, the
 * safe, scoped statement
 *
 *   DELETE FROM audit_log WHERE id = 1
 *
 * was reported as a filesystem mass-deletion. The SQL rules (G-009, G-010,
 * G-010b, G-011) are the ones that own this language; G-007 has nothing useful
 * to say about it and should stand down rather than double-report.
 *
 * This suppresses G-007 only. It does not weaken the SQL rules — a genuinely
 * unscoped `DELETE FROM audit_log` is still caught by G-010b, which is the rule
 * written for it.
 *
 * @param {string} text
 * @returns {boolean}
 */
function looksLikeSqlStatement(text) {
  if (typeof text !== 'string') return false;
  return /\b(DELETE\s+FROM|INSERT\s+INTO|UPDATE\s+[\w.]+\s+SET|TRUNCATE\s+TABLE|DROP\s+(TABLE|DATABASE|SCHEMA|INDEX|VIEW)|SELECT\s+[\s\S]*\bFROM\b)\b/i.test(text);
}

/**
 * Does this find-based deletion aim at something broad?
 *
 * ENH-443 (v2.1.36) — G-013 had no `severityFor`, so it graded every match
 * `critical` and denied outright. That produced the asymmetry issue #148 called
 * out, measured on v2.1.35:
 *
 *   rm -rf /tmp/scratch/build                       -> G-001 / high     / ask
 *   find /tmp/scratch -type f -name '*.tmp' -delete -> G-013 / critical / deny
 *
 * The strictly narrower operation was refused harder, and the refusal advised
 * "scope the command to a specific path" — which the user had already done.
 *
 * find's paths are the operands before the first expression token, so the search
 * stops at the first `-flag`. A find with no path defaults to the working
 * directory, which `BROAD_DELETE_TARGETS` already treats as broad; an
 * unparseable command stays broad for the same reason `deleteTargetIsBroad()`
 * does — be sure the target is specific before relaxing, never guess that it is.
 *
 * @param {string} text - the segment that matched the find-based deletion pattern
 * @returns {boolean}
 */
function findTargetIsBroad(text) {
  if (typeof text !== 'string') return true;

  const m = text.match(/\bfind\b([^\n;]*)/i);
  if (!m) return true;

  const paths = [];
  for (const tok of m[1].split(/\s+/)) {
    if (!tok) continue;
    if (tok.startsWith('-')) break; // expressions start here; paths are done
    paths.push(tok);
  }

  if (paths.length === 0) return true; // implicit cwd, or nothing parseable

  return paths.some((operand) => {
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
/**
 * Find a heredoc opener on a line, ignoring any `<<` that sits inside quotes.
 *
 * v2.1.34: an earlier version matched `<<` anywhere on the line, which is a
 * bypass rather than a nicety. `echo "example: cmd << EOF"` starts a bogus
 * elision, and every line up to the next `EOF` is discarded — including a real
 * destructive command. Measured against that earlier version:
 *
 *   echo "example: cmd << EOF"   →  stripped to the echo alone
 *   rm -rf ~/                        (elided)
 *   EOF                              detect: []
 *
 * Quote tracking is deliberately simple — single and double quotes, with
 * backslash escapes — because the only decision it feeds is "may this line be
 * treated as an opener". Anything it cannot parse confidently is left alone,
 * which keeps evidence rather than removing it.
 *
 * @param {string} line
 * @returns {string|null} the delimiter, or null when this line opens no heredoc
 */
function findHeredocDelimiter(line) {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '\\') { i++; continue; }
    if (c === "'" && !inDouble) { inSingle = !inSingle; continue; }
    if (c === '"' && !inSingle) { inDouble = !inDouble; continue; }
    if (inSingle || inDouble) continue;
    if (c !== '<' || line[i + 1] !== '<') continue;
    // `<<<` is a here-STRING, not a heredoc — it has no body and no terminator.
    if (line[i + 2] === '<') continue;
    const m = line.slice(i).match(/^<<-?\s*(?:'([^']+)'|"([^"]+)"|([A-Za-z_][A-Za-z0-9_]*))/);
    if (m) return m[1] || m[2] || m[3];
    return null;
  }
  return null;
}

function stripHeredocBodies(command) {
  if (typeof command !== 'string' || !command.includes('<<')) return command;
  const lines = command.split('\n');
  const out = [];
  let delimiter = null;
  let terminated = true;
  for (const line of lines) {
    if (delimiter === null) {
      out.push(line);
      const found = findHeredocDelimiter(line);
      if (found) { delimiter = found; terminated = false; }
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
 * Strip SQL comments so a commented-out keyword cannot stand in for a real clause.
 *
 * ENH-446 (v2.1.36) — G-010b fires only when no WHERE follows the DELETE, so any
 * occurrence of the WORD `WHERE` suppresses it. A comment is not a clause.
 * Measured on v2.1.35:
 *
 *   DELETE FROM audit_log -- WHERE     -> not detected
 *
 * A comment introducer must be `--` followed by WHITESPACE or end-of-input.
 * Without that condition this helper destroys evidence: the first version
 * treated the shell flag `--command` as a comment, so
 *
 *   wrangler d1 execute db --command "DROP TABLE audit_log"
 *
 * was truncated to `wrangler d1 execute db` and G-009 stopped firing — a real
 * DROP went undetected. That regression was caught by the negative controls
 * before it left the working tree, which is precisely why they are run on every
 * change. `--WHERE` (no space) is therefore left intact; keeping a token we are
 * unsure about costs a prompt, discarding one costs a table.
 *
 * Quote-aware for the same reason as everywhere else in this file — a literal
 * `'--'` inside a string is data, not a comment introducer.
 *
 * @param {string} text
 * @returns {string} the statement with `--` line comments and block comments removed
 */
function stripSqlComments(text) {
  if (typeof text !== 'string' || (!text.includes('--') && !text.includes('/*'))) return text;

  let out = '';
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '\\') { out += c + (text[i + 1] || ''); i++; continue; }
    if (c === "'" && !inDouble) { inSingle = !inSingle; out += c; continue; }
    if (c === '"' && !inSingle) { inDouble = !inDouble; out += c; continue; }
    if (!inSingle && !inDouble) {
      if (c === '-' && text[i + 1] === '-' && /^(\s|$)/.test(text[i + 2] || '')) {
        const nl = text.indexOf('\n', i);
        if (nl === -1) break;
        i = nl;
        out += '\n';
        continue;
      }
      if (c === '/' && text[i + 1] === '*') {
        const end = text.indexOf('*/', i + 2);
        if (end === -1) break;
        i = end + 1;
        out += ' ';
        continue;
      }
    }
    out += c;
  }
  return out;
}

/**
 * Split a command into the segments a rule may legitimately span.
 *
 * ENH-440 (v2.1.36) — every rule below is written as a single command's shape,
 * but they were matched against the WHOLE input. `.*` and `[\s\S]*` therefore ran
 * past `&&`, `;` and newlines, so tokens belonging to *other* commands in a chain
 * were read as operands of the dangerous one. G-001 already solved this for
 * itself at `deleteTargetIsBroad()` by cutting at `[^\n;|&]`; this generalizes
 * that cut so every rule gets it, instead of nine near-copies of the same regex.
 *
 * Measured on v2.1.35, this defect ran in BOTH directions:
 *
 *   false positives — a safe command refused because a later command supplied
 *   the incriminating token:
 *     git push origin feature-x && rm -f /tmp/scratch/note.txt   -> G-002 deny
 *     cp a.txt b.txt && ls /                                     -> G-008 deny
 *     dd if=/dev/zero of=./scratch.img && echo "of=/dev/null"     -> G-014 deny
 *
 *   false negatives — a real threat hidden because a later command pushed an
 *   end-anchor out of reach or satisfied a negative lookahead:
 *     chmod 777 / ; ls                     -> NOTHING detected (G-008 defeated)
 *     DELETE FROM audit_log; SELECT 1 WHERE x=1 -> G-010b defeated
 *
 * The false negatives are why this is a correctness fix and not a comfort fix.
 *
 * `|` is deliberately NOT a split point. A pipe is how several rules' threat is
 * expressed — `curl … | sh` (G-015), `base64 -d … | sh` (G-012),
 * `find … | xargs rm` (G-013) are each ONE dangerous construct, not two safe
 * ones. Splitting there would blind exactly the rules that exist to catch it.
 * `||` is a sequencer, not a pipe, and does split.
 *
 * Quote tracking mirrors `findHeredocDelimiter()`: single and double quotes with
 * backslash escapes, so `echo "a && b"` stays one segment. Anything the tracker
 * cannot parse confidently is left joined — this helper may narrow a window,
 * never hide evidence.
 *
 * A newline separates SHELL commands but NOT SQL statements, which end at `;`.
 * Splitting SQL on newlines would refuse the ordinary
 *
 *   DELETE FROM audit_log
 *   WHERE id = 1
 *
 * because segment 1 has no WHERE — turning a fix for one false positive into a
 * new one. Hence `mode`: rules written in SQL declare `segmentOn: 'sql'` and are
 * cut at `;` only. Measured on v2.1.35, that statement is correctly clean today,
 * and it must stay clean.
 *
 * @param {string} text
 * @param {'shell'|'sql'} [mode='shell'] which separators terminate a statement
 * @returns {string[]} one entry per segment; the original text when it contains
 *   no top-level separator
 */
function splitCommandSegments(text, mode) {
  if (typeof text !== 'string' || text.length === 0) return [''];
  const sqlMode = mode === 'sql';

  const segments = [];
  let start = 0;
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '\\') { i++; continue; }
    if (c === "'" && !inDouble) { inSingle = !inSingle; continue; }
    if (c === '"' && !inSingle) { inDouble = !inDouble; continue; }
    if (inSingle || inDouble) continue;

    let sepLen = 0;
    if (c === ';') sepLen = 1;
    else if (!sqlMode && c === '\n') sepLen = 1;
    else if (!sqlMode && ((c === '&' && text[i + 1] === '&') || (c === '|' && text[i + 1] === '|'))) sepLen = 2;

    if (sepLen > 0) {
      segments.push(text.slice(start, i));
      i += sepLen - 1;
      start = i + 1;
    }
  }
  segments.push(text.slice(start));

  const trimmed = segments.map((s) => s.trim()).filter((s) => s.length > 0);
  return trimmed.length > 0 ? trimmed : [text];
}

/**
 * Detect destructive operations in a tool invocation
 * @param {string} toolName - Name of the tool being invoked
 * @param {string|object} toolInput - Command string, or a parsed tool input whose
 *   command/path/content fields are matched individually (see toMatchableStrings)
 * @returns {DetectionResult}
 */
/**
 * Resolve the action a matched rule calls for, from its declaration and its
 * graded severity.
 *
 * `critical` always denies. Otherwise the rule's own `defaultAction` stands —
 * except when the rule graded ITSELF down from `critical` (G-001 on a scoped
 * target). There the declaration describes the worst case, not this match, so
 * `deny` relaxes exactly one tier, to `ask`. It never relaxes to silence.
 *
 * @param {object} rule - the rule as declared in GUARDRAIL_RULES
 * @param {string} severity - the severity this particular match graded to
 * @returns {'deny'|'ask'|'allow'}
 */
function resolveAction(rule, severity) {
  if (severity === 'critical') return 'deny';
  const declared = rule.defaultAction || 'ask';
  const gradedDown = typeof rule.severityFor === 'function' && rule.severity === 'critical';
  if (declared === 'deny') return gradedDown ? 'ask' : 'deny';
  return declared;
}

function detect(toolName, toolInput) {
  const inputs = toMatchableStrings(toolInput).map(stripHeredocBodies);
  // Kept for the tool-specific checks below, which only need substring semantics.
  const input = inputs.join('\n');

  /*
   * ENH-440 (v2.1.36) — match each rule against single command/statement
   * segments rather than the whole input. See splitCommandSegments() for why
   * this fixes false positives and false negatives at the same time, and why
   * `|` is not a split point.
   *
   * Both segmentations are computed once and reused across the 16 rules; a rule
   * picks the one matching the language it is written in.
   */
  const segmentsByMode = {
    shell: inputs.flatMap((s) => splitCommandSegments(s, 'shell')),
    // Comments are stripped BEFORE splitting so a `--` comment cannot hide a
    // statement separator, and a commented-out keyword cannot satisfy a
    // negative lookahead (ENH-446).
    sql: inputs.flatMap((s) => splitCommandSegments(stripSqlComments(s), 'sql')),
  };
  const matchedRules = [];

  for (const rule of GUARDRAIL_RULES) {
    const segments = segmentsByMode[rule.segmentOn === 'sql' ? 'sql' : 'shell'];
    /*
     * A rule may declare `suppressIf` for contexts where its pattern provably
     * says nothing useful — a metadata-only listing for G-006, a SQL statement
     * for G-007. Suppression is evaluated per segment, so a chain that also
     * contains a genuine match still reports it.
     *
     * This is deliberately narrower than grading: `severityFor` cannot help a
     * rule whose declared action is already `ask`, because resolveAction()
     * returns a non-critical rule's declared action unchanged and there is no
     * tier below `ask` short of silence.
     */
    const hit = segments.find(
      (s) => rule.pattern.test(s)
        && !(typeof rule.suppressIf === 'function' && rule.suppressIf(s))
    );
    if (hit !== undefined) {
      // A rule may grade itself from the matched text — see G-001, where the
      // target decides whether a recursive delete is catastrophic or routine.
      const severity = typeof rule.severityFor === 'function'
        ? rule.severityFor(hit)
        : rule.severity;
      matchedRules.push({
        id: rule.id,
        name: rule.name,
        severity,
        /*
         * v2.1.34 — the action the rule table declares for this match.
         *
         * `defaultAction` has been on every rule since the table was written,
         * but nothing read it: the hook branched on `severity === 'critical'`
         * and did nothing at all otherwise. Ten rules declared `ask` and none
         * of them ever asked. Surfacing it here makes the table the single
         * place that decides deny-vs-ask.
         *
         * A graded rule outranks its own declaration in the dangerous
         * direction only: G-001 declares `deny`, and a scoped delete grades to
         * `high`, so it asks — but a broad delete grades back to `critical`
         * and denies. Grading never turns a `deny` into silence.
         */
        action: resolveAction(rule, severity),
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
      matchedRules.push({ id: 'G-005', name: envMatch.name, severity: envMatch.severity,
        action: envMatch.defaultAction || 'ask', pattern: envMatch.pattern.source });
    }
    if (keyMatch && keyMatch.pattern.test(input) && !matchedRules.some(r => r.id === 'G-006')) {
      matchedRules.push({ id: 'G-006', name: keyMatch.name, severity: keyMatch.severity,
        action: keyMatch.defaultAction || 'ask', pattern: keyMatch.pattern.source });
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
  /*
   * ENH-448 (v2.1.36) — this used to read "To proceed, adjust guardrail settings
   * in bkit.config.json or use manual override."
   *
   * Neither route existed. This module never reads bkit.config.json (that string
   * appeared exactly once in the file — inside the message), and `disableRule()`
   * sets a flag `detect()` does not consult, by design (see its own docs). So the
   * message named two recoveries, both imaginary, to a user who had just been
   * refused. Issue #148 called this out, and it is the same class of defect as
   * the rules themselves: a guard giving advice nobody can act on.
   *
   * What follows is only what actually works.
   */
  lines.push('Ways forward:');
  lines.push('  - Narrow the target. A scoped path is graded lower than a broad one and asks rather than denies.');
  lines.push('  - Split a chained command. Each segment is judged on its own, so an unrelated step cannot implicate a safe one.');
  lines.push('  - If the operation is genuinely intended, say so explicitly and have the user confirm it.');
  lines.push('');
  lines.push('These rules cannot be switched off at runtime — that is deliberate, not an oversight.');

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
 * Mark a guardrail rule disabled — WITHOUT removing it from detection.
 *
 * ENH-449 (v2.1.36) — read the name and you expect the rule to stop firing. It
 * does not, and that is intentional: `detect()` never consults `_disabled`, so a
 * rule cannot be switched off from inside a running session. The property is
 * locked by test/security/integrity-verification.test.js IV-09, whose assertion
 * says so explicitly.
 *
 * The flag is therefore an annotation — it records that someone asked — and this
 * function is retained for that and for API compatibility. It has no production
 * callers. Do not "fix" the flag to be honoured without deliberately overturning
 * IV-09; the immutability is the security property, and the false-positive
 * pressure that motivates an off-switch is answered by rule precision instead
 * (see splitCommandSegments and the grading helpers above).
 *
 * @param {string} ruleId - Rule ID to annotate
 * @param {string} [reason] - Reason recorded alongside the annotation
 * @returns {boolean} True if the rule exists (NOT that detection changed)
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
  // ENH-440/446 (v2.1.36): exported so their behaviour can be asserted directly
  // rather than only inferred from detect() outcomes. The `--command` regression
  // below was a helper-level defect that a detect()-only test would have found
  // only by luck.
  splitCommandSegments,
  stripSqlComments,
  GUARDRAIL_RULES
};
