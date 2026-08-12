/**
 * HeredocDetector — Defense Layer pure-fn detector for heredoc-pipe permission bypass.
 *
 * Design Ref: docs/sprint/v2114/design.md §3.3
 * Plan SC: ENH-310 Heredoc Pipe Bypass Defense.
 * Differentiation: bkit moat #6 — CC permission system regression self-defense.
 *
 * Background:
 *   CC #58904 (regression of #48518, present v2.1.73 through v2.1.141, ~68
 *   unfixed versions) lets a Bash command of the form
 *
 *     cat <<'EOF' | bash
 *     rm -rf /
 *     EOF
 *
 *   bypass CC's permission system: CC inspects only the outer `cat` token,
 *   never the heredoc body or its pipe-target. bkit's PreToolUse defense
 *   stack inherited the same blind spot — `scripts/unified-bash-pre.js`
 *   substring patterns and `lib/control/destructive-detector.js` G-001~G-011
 *   evaluate only top-level argv. This module closes that gap.
 *
 * Responsibility:
 *   detect(command) inspects an entire Bash command string for the
 *   `heredoc + (command-substitution | pipe-to-shell | eval/source)`
 *   combination that defines the bypass. It returns a structured verdict
 *   so the calling hook can emit a deterministic deny with safe-alternative
 *   suggestions via `outputBlockWithContext`.
 *
 * Design invariants:
 *   1) Pure function — no fs, child_process, http, network, env reads.
 *      Domain-grade purity even though this lives in Defense Layer.
 *   2) Conservative false-positive policy: lone `<<` heredoc returns
 *      severity='warning' (audit-only, allow), never 'critical'. Only the
 *      combination with `$(`, backtick, or pipe-to-shell promotes to
 *      severity='critical' (deny).
 *   3) 30+ patterns categorized by attack vector (sub / pipe-shell /
 *      eval-source / sudo). PATTERNS array is Object.freeze'd so callers
 *      cannot mutate the policy at runtime.
 *   4) Deterministic ordering: critical patterns are evaluated before
 *      warning patterns, then short-circuit on first critical match.
 *
 * Calling site (Step 6, scripts/unified-bash-pre.js):
 *   const { detect } = require('../lib/defense/heredoc-detector');
 *   const verdict = detect(command);
 *   if (verdict.matched && verdict.severity === 'critical') {
 *     outputBlockWithContext(verdict.reason, {
 *       additionalContext: verdict.alternatives.join('\n'),
 *     }, 'PreToolUse');
 *   }
 *
 * @module lib/defense/heredoc-detector
 * @version 2.1.14
 * @since 2.1.14
 * @layer Defense
 * @enh ENH-310
 * @differentiation #6
 */

'use strict';

/**
 * @typedef {'critical'|'warning'|null} Severity
 *   critical — heredoc COMBINED with a payload-execution vector. Hook MUST deny.
 *   warning  — heredoc present but no execution vector detected. Hook MAY allow + audit.
 *   null     — no heredoc detected; out of scope for this detector.
 */

/**
 * @typedef {Object} HeredocVerdict
 * @property {boolean} matched         — true when at least one pattern matched
 * @property {Severity} severity       — see Severity typedef
 * @property {string|null} pattern     — regex source string of the matched pattern (debugging)
 * @property {string|null} vector      — semantic vector: 'sub'|'pipe-shell'|'eval-source'|'sudo'|'lone-heredoc'|null
 * @property {string} reason           — human-readable explanation (for hook deny message)
 * @property {string[]} alternatives   — safe alternative suggestions for the user/model
 */

/**
 * Critical patterns: heredoc combined with payload-execution vector.
 *
 * Conservative regex design: each pattern requires the explicit
 * `<<` (heredoc start) AND an unambiguous execution token. Single
 * tokens (e.g. lone `$(`) never produce critical here — that is
 * destructive-detector territory.
 *
 * Pattern source strings are kept on each entry so the verdict can
 * report which pattern matched (debug + audit-log richness).
 */
const CRITICAL_PATTERNS = Object.freeze([
  // -------- vector: 'sub' (heredoc inside $() command substitution) --------
  {
    vector: 'sub',
    re: /\$\(\s*[\w./-]*\s*<<-?\s*['"]?\w+['"]?[\s\S]*?\)/,
    description: '$(cmd <<TAG ... TAG)  — heredoc inside $() substitution',
  },
  {
    vector: 'sub',
    re: /`\s*[\w./-]*\s*<<-?\s*['"]?\w+['"]?[\s\S]*?`/,
    description: '`cmd <<TAG ... TAG`  — heredoc inside backtick substitution',
  },
  {
    vector: 'sub',
    re: /\$\(\s*cat\s+<<-?\s*['"]?\w+['"]?/,
    description: '$(cat <<TAG …)  — bypass via cat heredoc + substitution',
  },
  {
    vector: 'sub',
    re: /`\s*cat\s+<<-?\s*['"]?\w+['"]?/,
    description: '`cat <<TAG …`  — bypass via cat heredoc + backtick',
  },

  /*
   * -------- vector: 'pipe-shell' (heredoc piped to interpreter) -----------
   *
   * ENH-390 (v2.1.33): one tolerant pattern replaces eight literal ones.
   *
   * Each rule used to be `\|\s*\bbash\b` — the interpreter name had to follow
   * the pipe immediately. Every ordinary way of writing the same command
   * therefore fell through to the WARNING tier, and `scripts/unified-bash-pre.js:325`
   * lets warnings through with an audit entry only. Measured before the fix,
   * all of these executed:
   *
   *     cat <<EOF … EOF | /bin/bash        -> warning (allowed)
   *     cat <<EOF … EOF | /usr/bin/sh      -> warning (allowed)
   *     cat <<EOF … EOF | nice bash        -> warning (allowed)
   *     cat <<EOF … EOF | command bash     -> warning (allowed)
   *     cat <<EOF … EOF | "bash"           -> warning (allowed)
   *     cat <<EOF … EOF | \bash            -> warning (allowed)
   *
   * against `… | bash` -> critical (blocked). So bkit differentiation #6, the
   * heredoc bypass defense, was defeated by an absolute path.
   *
   * The delimiter also widened from `\w+` to `[^\s|;&<>'"]+`, so `<<'EOF-1'`
   * and `<<EOF.1` are recognised as delimiters rather than parsed as `EOF`
   * plus body text.
   */
  {
    vector: 'pipe-shell',
    re: new RegExp(
      '<<-?\\s*[\'"]?[^\\s|;&<>\'"]+[\'"]?[\\s\\S]*?'
      // the pipe, then any stack of harmless wrappers…
      + '\\|\\s*(?:(?:command|exec|env|nice|nohup|time|xargs)\\s+(?:-\\S+\\s+)*)*'
      // …optional quote/backslash obfuscation, optional absolute or relative path…
      + '[\'"\\\\]*(?:[\\w./-]*/)?'
      // …and the interpreter itself.
      + '(?:bash|sh|zsh|ksh|dash|ash|fish|csh|tcsh|python[\\d.]*|perl|ruby|node|deno|bun)\\b',
    ),
    description: 'heredoc | interpreter — pipe to a shell/interpreter (path, quote, backslash and wrapper forms included)',
  },
  {
    // An interpreter chosen at runtime cannot be inspected, so it is treated as
    // the most dangerous case rather than the least. Previously `| $SHELL`
    // matched no interpreter rule at all and landed in the warning tier.
    vector: 'pipe-shell',
    re: /<<-?\s*['"]?[^\s|;&<>'"]+['"]?[\s\S]*?\|\s*(?:\$\{?\w+\}?|`[^`]*`|\$\([^)]*\))/,
    description: 'heredoc | $VAR — pipe to an interpreter resolved at runtime (unknown target)',
  },
  {
    // A wrapper on its own is still an execution vector: `… | exec` and
    // `… | env` both run the piped content. The consolidated interpreter rule
    // above requires an interpreter AFTER the wrapper, so these standalone
    // forms need their own rule — dropping them was a coverage regression the
    // v2.1.14 suite (CR-07/CR-08) caught immediately.
    vector: 'pipe-shell',
    re: /<<-?\s*['"]?[^\s|;&<>'"]+['"]?[\s\S]*?\|\s*(?:command|exec|env|nice|nohup|time|xargs)\b/,
    description: 'heredoc | exec/env/... — pipe to an execution wrapper',
  },

  // -------- vector: 'eval-source' (heredoc piped to eval/source/.) --------
  {
    vector: 'eval-source',
    re: /<<-?\s*['"]?\w+['"]?[\s\S]*?\|\s*\beval\b/,
    description: 'heredoc | eval   — pipe to eval',
  },
  {
    vector: 'eval-source',
    re: /<<-?\s*['"]?\w+['"]?[\s\S]*?\|\s*\bsource\b/,
    description: 'heredoc | source — pipe to source',
  },
  {
    vector: 'eval-source',
    re: /<<-?\s*['"]?\w+['"]?[\s\S]*?\|\s*\.\s/,
    description: 'heredoc | . path — pipe to POSIX `.` (source)',
  },

  // -------- vector: 'sudo' (heredoc piped to sudo) ------------------------
  {
    vector: 'sudo',
    re: /<<-?\s*['"]?\w+['"]?[\s\S]*?\|\s*\bsudo\b/,
    description: 'heredoc | sudo — escalated pipe',
  },
  {
    vector: 'sudo',
    re: /<<-?\s*['"]?\w+['"]?[\s\S]*?\|\s*\bdoas\b/,
    description: 'heredoc | doas — OpenBSD escalated pipe',
  },

  // -------- vector: 'sub' with shell-as-arg ($(bash <<EOF …)) -------------
  {
    vector: 'sub',
    re: /\$\(\s*(?:bash|sh|zsh|ksh|dash|fish)\s+-c\s*['"]?<<-?\s*['"]?\w+['"]?/,
    description: '$(bash -c "<<TAG …") — substitution wrapping shell -c heredoc',
  },
  {
    vector: 'sub',
    re: /\$\(\s*(?:bash|sh|zsh|ksh|dash|fish)\s+<<-?\s*['"]?\w+['"]?/,
    description: '$(bash <<TAG …) — substitution wrapping shell heredoc',
  },

  // -------- vector: 'direct-shell' (interpreter consumes the heredoc as code) --
  /*
   * ENH-461 (v2.1.36) — the most direct execution vector was missing.
   *
   * The list above covers the heredoc reaching a shell through a substitution
   * (`$(bash <<TAG)`), a pipe (`<<TAG | sh`), or xargs. It did not cover the
   * plainest spelling of all:
   *
   *     bash <<'EOF'
   *     rm -rf /
   *     EOF
   *
   * Measured on v2.1.35 and still on this branch before this rule: the hook
   * ALLOWED it. destructive-detector elides heredoc bodies before matching, by
   * design, so G-001 never sees the delete; and this file graded the form
   * `warning`, which the hook audits and permits. Between the two, the payload
   * executed and nothing objected. Found by running ordinary commands through
   * the real hook rather than through detect() — a module-level test could not
   * have seen it, because neither module is wrong on its own.
   *
   * A script argument means the heredoc is stdin DATA, not code
   * (`bash deploy.sh <<EOF`), so the pattern allows only flags between the
   * interpreter and `<<`. The command must also start a command — after a
   * separator or at the beginning — so `echo bash <<EOF` stays a warning.
   *
   * Scope is shells, matching the rest of this table. `python3 - <<'PY'` is a
   * routine, legitimate way to run a script and is deliberately not included;
   * widening to every interpreter would refuse work people do every day, which
   * is the failure this release exists to remove.
   */
  {
    vector: 'direct-shell',
    re: /(?:^|[\n;|&(])\s*(?:bash|sh|zsh|ksh|dash|fish)\s+(?:-[a-zA-Z]+\s+)*<<-?\s*['"]?\w+/,
    description: 'bash <<TAG … — interpreter executes the heredoc body directly',
  },

  // -------- vector: 'pipe-shell' (here-string + shell, less common variant)
  {
    vector: 'pipe-shell',
    re: /<<<\s*[\s\S]*?\|\s*\b(?:bash|sh|zsh|ksh|dash|fish|exec)\b/,
    description: 'here-string (<<<) | shell — variant of heredoc-pipe',
  },

  // -------- vector: 'pipe-shell' (heredoc → curl|bash anti-pattern) --------
  {
    vector: 'pipe-shell',
    re: /<<-?\s*['"]?\w+['"]?[\s\S]*?\|\s*\bxargs\b\s+(?:bash|sh|zsh|ksh|dash|fish|exec)\b/,
    description: 'heredoc | xargs (bash|sh|…)  — xargs-shell escalation',
  },
]);

/**
 * Warning patterns: heredoc present but no execution vector detected.
 * Returns severity='warning' (allow + audit). This list intentionally
 * captures only the heredoc-start surface so audit logs can attribute
 * the pattern without triggering false-positive denies.
 */
const WARNING_PATTERNS = Object.freeze([
  {
    vector: 'lone-heredoc',
    re: /<<-?\s*['"]?\w+['"]?/,
    description: '<<TAG — lone heredoc start (no exec vector detected)',
  },
  {
    vector: 'lone-heredoc',
    re: /<<<\s*\S/,
    description: '<<< — here-string (no exec vector detected)',
  },
]);

/** Safe alternatives to suggest when severity='critical'. */
const CRITICAL_ALTERNATIVES = Object.freeze([
  'Write the script to a file first, audit it, then run with explicit permission: bkit \'cat > script.sh && cat script.sh && bash script.sh\' (3 separate tool calls)',
  'Inline a single safe command without heredoc: e.g. `echo "..." | grep foo` instead of `<<EOF … EOF | bash`',
  'Use bkit checkpoint + manual review: /pdca checkpoint create  → review the planned changes → confirm before executing',
]);

/** Safe alternatives to suggest when severity='warning'. */
const WARNING_ALTERNATIVES = Object.freeze([
  'Heredoc usage is acceptable for static input (e.g. SQL, JSON, plain text). Verify no `$(`/backtick/pipe-to-shell follows the heredoc.',
]);

/**
 * Detect heredoc-pipe bypass attempt in a Bash command string.
 *
 * Pure function — same input always returns the same verdict. No IO.
 * Returns a structured verdict; callers (hooks) own the decision to
 * deny / allow / audit.
 *
 * @param {string|unknown} command
 * @returns {HeredocVerdict}
 */
/**
 * Replace the body of every QUOTED heredoc with a placeholder line, keeping the
 * opener and terminator.
 *
 * Quoted delimiter => the shell expands nothing inside the body, so the body is
 * inert data on a program's stdin. Unquoted delimiter => `$(...)` and backticks
 * inside the body DO execute, so those bodies are deliberately left untouched.
 *
 * @param {string} command
 * @returns {string}
 */
function elideQuotedHeredocBodies(command) {
  if (!command.includes('<<')) return command;
  const lines = command.split('\n');
  const out = [];
  let delimiter = null;
  let terminated = true;
  for (const line of lines) {
    if (delimiter === null) {
      out.push(line);
      // Quoted forms only: <<'EOF' / <<-'EOF' / <<"EOF" / <<-"EOF"
      const m = line.match(/<<-?\s*(?:'([^']+)'|"([^"]+)")/);
      if (m) { delimiter = m[1] || m[2]; terminated = false; }
      continue;
    }
    /*
     * The terminator line is kept WHOLE, not just recognised. A known bypass
     * writes the pipe on that line — `EOF-1 | bash` — so discarding anything
     * after the delimiter would delete the exec vector along with the body.
     * The line is matched by prefix rather than equality for the same reason.
     */
    if (line.trim() === delimiter || line.trimStart().startsWith(delimiter)) {
      out.push('__BKIT_HEREDOC_BODY__');
      out.push(line);
      delimiter = null;
      terminated = true;
    }
  }
  /*
   * An unterminated heredoc means the delimiter was never found, so there is no
   * body boundary to trust. Returning the original text keeps every pattern
   * looking at everything — this helper may only ever remove noise, never
   * remove evidence.
   */
  if (!terminated) return command;
  return out.join('\n');
}

/**
 * Split a command into the regions a heredoc pattern may legitimately span.
 *
 * v2.1.34. The `pipe-shell` pattern is
 * `<<-?\s*['"]?TAG['"]?[\s\S]*?\|\s*<interpreter>` — and `[\s\S]*?` crosses
 * newlines, terminator lines, and any number of subsequent commands. So a
 * heredoc that opened and closed cleanly, followed later by a completely
 * unrelated pipe, was graded CRITICAL.
 *
 * Reproduced against this very session: the block
 *
 *     python3 - <<'PY'
 *     ...
 *     PY
 *     echo done | python3 -c "..."
 *
 * was refused as "pipe to a shell/interpreter", though the heredoc closed two
 * lines before the pipe and the two share nothing but a process. Exactly the
 * defect class this release fixes elsewhere — a pattern reading past the
 * construct it is analysing — sitting in a guard that refuses commands.
 *
 * A terminated heredoc becomes one region, opener line through terminator line
 * INCLUSIVE, because both known exec vectors live on those lines: `<<EOF | bash`
 * on the opener and `EOF-1 | bash` on the terminator. Everything outside is a
 * separate region. An UNTERMINATED heredoc yields the whole text as one region:
 * with no trustworthy boundary the guard must keep seeing everything.
 *
 * @param {string} text
 * @returns {string[]} regions to match independently
 */
function heredocRegions(text) {
  const lines = text.split('\n');
  const regions = [];
  let outside = [];
  let current = null;
  let delimiter = null;

  /*
   * A line that BEGINS with a shell continuation token belongs to the command
   * that just ended, not to a new one.
   *
   * Without this the region closes at the terminator and the form
   *
   *     cat <<'EOF'
   *     …
   *     EOF
   *     | bash
   *
   * splits the pipe away from its heredoc — twenty-three assertions in
   * tests/qa/v2114-defense-heredoc.test.js exist for exactly that shape, and the
   * first cut of this split turned all of them from critical to warning. A
   * region that ends one token early is a hole, and closing a false positive by
   * opening a hole is not a fix.
   *
   * The distinguishing test is whether the next line CONTINUES the pipeline or
   * STARTS something: `| bash` continues, `echo done | python3 -c …` starts.
   */
  const CONTINUATION = /^\s*(?:[|)&;]|\|\||&&|>>?|<)/;
  let closing = false;

  for (const line of lines) {
    if (closing) {
      if (CONTINUATION.test(line)) { current.push(line); continue; }
      regions.push(current.join('\n'));
      current = null;
      closing = false;
      // fall through: this line starts a new region
    }
    if (delimiter === null) {
      const m = line.match(/<<-?\s*['"]?([^\s|;&<>'"]+)['"]?/);
      if (m) {
        if (outside.length) { regions.push(outside.join('\n')); outside = []; }
        delimiter = m[1];
        current = [line];
      } else {
        outside.push(line);
      }
      continue;
    }
    current.push(line);
    if (line.trim() === delimiter || line.trimStart().startsWith(delimiter)) {
      delimiter = null;
      closing = true; // keep absorbing continuation lines — see below
    }
  }

  // Unterminated: no boundary to trust, so nothing may be split apart.
  if (delimiter !== null) return [text];
  if (closing && current) regions.push(current.join('\n'));

  if (outside.length) regions.push(outside.join('\n'));
  return regions.length ? regions : [text];
}

function detect(command) {
  if (typeof command !== 'string' || command.length === 0) {
    return emptyVerdict();
  }

  /*
   * v2.1.34: elide the bodies of QUOTED heredocs before matching.
   *
   * This module's subject is the command STRUCTURE — a heredoc combined with a
   * pipe to an interpreter, a command substitution, or eval. Body text is not
   * structure. Matching against it produced refusals that were indistinguishable
   * from real findings: during work on this release, `python3 - <<'PY' … PY` was
   * blocked as "pipe to an interpreter resolved at runtime (unknown target)"
   * when the interpreter was the literal `python3` and the trigger was the
   * string `Write|Edit` sitting in the body.
   *
   * Only QUOTED delimiters (`<<'EOF'`, `<<"EOF"`) are elided. With a quoted
   * delimiter the shell performs no expansion, so the body genuinely is inert
   * data. An UNQUOTED heredoc still expands `$(...)` and backticks inside the
   * body at runtime — that is a real execution vector and its body is left fully
   * visible to every pattern below. The opener and terminator lines survive in
   * both cases, so a heredoc piped into a shell is still matched exactly as
   * before.
   */
  const bodyElided = elideQuotedHeredocBodies(command);

  // Strip escaped sequences that should not count toward matching:
  //   \$\( and \` are escaped substitutions — treat as inert.
  //   \\<< is an escaped heredoc start — treat as inert.
  const stripped = bodyElided
    .replace(/\\\$\(/g, '__BKIT_ESCAPED_DOLLAR_PAREN__')
    .replace(/\\`/g, '__BKIT_ESCAPED_BACKTICK__')
    .replace(/\\<</g, '__BKIT_ESCAPED_HEREDOC__');

  /*
   * Critical patterns are evaluated per REGION, not across the whole command —
   * see `heredocRegions`. A pattern that may span `[\s\S]*?` must not span
   * from one command into an unrelated one.
   */
  const regions = heredocRegions(stripped);

  // Evaluate critical patterns first; short-circuit on first hit.
  for (const p of CRITICAL_PATTERNS) {
    if (regions.some((r) => { p.re.lastIndex = 0; return p.re.test(r); })) {
      return {
        matched: true,
        severity: 'critical',
        pattern: p.re.source,
        vector: p.vector,
        reason: `bkit ENH-310 heredoc-bypass guard: ${p.description}`,
        alternatives: CRITICAL_ALTERNATIVES.slice(),
      };
    }
  }

  // Then warning patterns (heredoc present but no exec vector).
  for (const p of WARNING_PATTERNS) {
    if (p.re.test(stripped)) {
      return {
        matched: true,
        severity: 'warning',
        pattern: p.re.source,
        vector: p.vector,
        reason: `bkit ENH-310 heredoc audit: ${p.description}`,
        alternatives: WARNING_ALTERNATIVES.slice(),
      };
    }
  }

  return emptyVerdict();
}

function emptyVerdict() {
  return {
    matched: false,
    severity: null,
    pattern: null,
    vector: null,
    reason: '',
    alternatives: [],
  };
}

module.exports = {
  detect,
  // Exposed for contract tests + observability — DO NOT mutate at runtime
  // (Object.freeze enforces immutability; mutation in non-strict mode is silent,
  // in strict mode throws).
  CRITICAL_PATTERNS,
  WARNING_PATTERNS,
  CRITICAL_ALTERNATIVES,
  WARNING_ALTERNATIVES,
};
