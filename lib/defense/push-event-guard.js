/**
 * PushEventGuard — Defense Layer guard for `git push` to upstream vs fork.
 *
 * Design Ref: docs/sprint/v2114/design.md §1.2 (audit-logger imports) — body
 *             spec authored in Sub-Sprint 2 Phase 0 Pre-impl Analysis §2.3.
 * Plan SC: ENH-298 Push event Defense (bundled with ENH-289 Defense Layer 6).
 *
 * Background:
 *   CC #56884 (v2.1.132): an evolved-form R-3 case where the model issued a
 *   silent `git push` to the upstream remote without user confirmation. bkit
 *   already blocks `git push --force` / `git push -f` via
 *   scripts/permission-request-handler.js ALWAYS_DENY_PATTERNS, but plain
 *   non-force pushes to **upstream** (not the developer's own fork) are not
 *   distinguished today. This module supplies that distinction.
 *
 * Public API (3 pure-ish functions):
 *   detectPushCommand(command) → { isPush, force, remote, branch }
 *   classifyRemote(remoteName, opts?) → { kind, isFork }
 *   shouldGuard(parsed, classified, trustLevel) → { action, reason, alternatives }
 *
 * Purity split:
 *   - detectPushCommand: pure regex parser, no IO
 *   - classifyRemote: requires git context (uses `git remote -v` via opts.exec,
 *     so it can be injected for tests; default uses child_process synchronously)
 *   - shouldGuard: pure decision function over the two inputs above
 *
 * Calling site (Step 6, scripts/unified-bash-pre.js Stage 2):
 *   const guard = require('../lib/defense/push-event-guard');
 *   const parsed = guard.detectPushCommand(command);
 *   if (parsed.isPush) {
 *     const classified = guard.classifyRemote(parsed.remote, { cwd });
 *     const verdict = guard.shouldGuard(parsed, classified, trustLevel);
 *     if (verdict.action === 'deny' || verdict.action === 'ask') {
 *       outputBlockWithContext(verdict.reason, {
 *         additionalContext: verdict.alternatives.join('\n'),
 *       }, 'PreToolUse');
 *     }
 *   }
 *
 * @module lib/defense/push-event-guard
 * @version 2.1.14
 * @since 2.1.14
 * @layer Defense
 * @enh ENH-298
 */

'use strict';

// child_process is only loaded when classifyRemote() is invoked without an
// injected exec — keeps imports lazy and lets tests pass a mock without
// touching the real git command.
let _child_process = null;
function getChildProcess() {
  if (!_child_process) _child_process = require('child_process');
  return _child_process;
}

/**
 * @typedef {Object} PushParse
 * @property {boolean} isPush  — command matches `git push` shape
 * @property {boolean} force   — `--force`/`-f`/`--force-with-lease` flag detected
 * @property {string|null} remote — remote name (default 'origin' when omitted)
 * @property {string|null} branch — branch refspec (best-effort, may be null)
 */

/**
 * @typedef {'origin'|'upstream'|'fork'|'unknown'} RemoteKind
 *   origin   — the developer's own remote (default for first-time clones)
 *   upstream — the canonical project remote (anthropics/*, popup-studio-ai/*, etc.)
 *   fork     — alias for origin when origin is a fork (most common in bkit dev flow)
 *   unknown  — could not classify (git not available, remote not found, etc.)
 */

/**
 * @typedef {Object} RemoteClass
 * @property {RemoteKind} kind
 * @property {boolean} isFork  — true iff kind ∈ {'origin','fork'} OR url contains fork heuristic
 * @property {string|null} url — resolved push URL (debug)
 */

/**
 * @typedef {'allow'|'ask'|'deny'} GuardAction
 */

/**
 * @typedef {Object} GuardVerdict
 * @property {GuardAction} action
 * @property {string} reason
 * @property {string[]} alternatives
 */

const PUSH_REGEX = /^\s*git\s+push(\s|$)/;
const FORCE_FLAGS_REGEX = /\s(--force(?:-with-lease)?(?:=\S*)?|-f)(\s|$)/;
const REMOTE_REGEX = /^\s*git\s+push\b[^|;&]*?\s+([\w./-]+)(?:\s+([\w./*+:-]+))?/;

// Heuristic patterns identifying upstream remotes — these are the canonical
// public organizations bkit-claude-code interacts with. Pushes here MUST be
// guarded. (Lowercased URL is matched.)
const UPSTREAM_URL_HEURISTICS = Object.freeze([
  /github\.com[:/]anthropics\//i,
  /github\.com[:/]anthropic\//i,
  /github\.com[:/]openai\//i,
  /github\.com[:/]google\//i,
  /github\.com[:/]microsoft\//i,
]);

// Heuristic patterns identifying the developer's fork (origin in bkit flow).
const FORK_URL_HEURISTICS = Object.freeze([
  /github\.com[:/]popup-studio-ai\//i,
  /github\.com[:/]popup\//i,
  /github\.com[:/]tomo-kay\//i,
]);

/**
 * Pure parser. Recognizes `git push [flags] [remote [refspec]]` shape.
 *
 * @param {string|unknown} command
 * @returns {PushParse}
 */
function detectPushCommand(command) {
  if (typeof command !== 'string' || command.length === 0 || !PUSH_REGEX.test(command)) {
    return { isPush: false, force: false, remote: null, branch: null };
  }
  /*
   * ENH-460 (v2.1.36) — read the flags of THIS command, not of the whole line.
   *
   * `force` was `FORCE_FLAGS_REGEX.test(command)` against the entire input, so
   * any `-f` later in a chain was attributed to the push. Measured on v2.1.35
   * and still reproducing after the destructive-detector fix, because this is a
   * different module:
   *
   *   git push origin feature-x && rm -f /tmp/scratch/note.txt
   *     -> "force push detected (origin)"  -> blocked
   *
   * Pushing a feature branch and removing a scratch file is not a force push.
   * REMOTE_REGEX on the line above already cut at `[^|;&]` for exactly this
   * reason; the flag scan was left unbounded, so half the parser was scoped and
   * half was not. This closes the other half.
   *
   * The window ends at the first command separator. A pipe ends it too: `git
   * push | tee log` is still one push, and nothing after `|` is a push flag.
   */
  const pushSegment = (command.match(/^\s*git\s+push\b[^\n;|&]*/) || [command])[0];
  const force = FORCE_FLAGS_REGEX.test(pushSegment);

  /*
   * ENH-462 (v2.1.36) — read the operands, do not pattern-match around them.
   *
   * REMOTE_REGEX's `([\w./-]+)` includes `-`, so with a flag before the remote
   * it captured the FLAG as group 1 and the REMOTE as group 2. The old code then
   * rejected group 1 for starting with `-`, fell back to 'origin', and kept
   * group 2 — so the branch was reported as the remote name. Measured:
   *
   *   git push --force-with-lease origin my-topic-branch
   *     -> { remote: 'origin', branch: 'origin' }     // my-topic-branch unseen
   *
   * Harmless while nothing read `branch`. Not harmless now that the force
   * verdict grades by target: every push would have looked like it aimed at
   * whatever the remote was called. Splitting the segment and dropping flags
   * gives the operands git itself would use.
   */
  const operands = pushSegment
    .replace(/^\s*git\s+push\b/, '')
    .split(/\s+/)
    .filter((tok) => tok && !tok.startsWith('-'));

  // When the user omits the remote, git pushes to the tracking remote (usually
  // 'origin'). Surface 'origin' so classifyRemote() can still resolve.
  const remote = operands[0] || 'origin';
  const branch = operands[1] || null;
  return { isPush: true, force, remote, branch };
}

/**
 * Resolve the push URL for a remote and classify it as fork / upstream / unknown.
 *
 * Uses `git remote get-url --push <remote>` (lighter than `git remote -v`).
 * Failure modes (git missing, remote missing, non-zero exit) → kind:'unknown'.
 *
 * @param {string} remoteName
 * @param {{ cwd?: string, exec?: (cmd: string, opts: object) => string }} [opts]
 * @returns {RemoteClass}
 */
function classifyRemote(remoteName, opts) {
  if (typeof remoteName !== 'string' || remoteName.length === 0) {
    return { kind: 'unknown', isFork: false, url: null };
  }
  const cwd = (opts && typeof opts.cwd === 'string') ? opts.cwd : process.cwd();
  const exec = (opts && typeof opts.exec === 'function')
    ? opts.exec
    : (file, args, o) => getChildProcess().execFileSync(file, args, o).toString();

  let url = null;
  try {
    /*
     * ENH-427 (v2.1.35): argv, no shell.
     *
     * `remoteName` is parsed out of the user's own Bash command, so this is the
     * one call site in bkit where caller-controlled data really did reach a
     * shell string. It was defended by REMOTE_REGEX (`[\w./-]+`) plus
     * shellEscape(), and that defence held — but the regex only constrains the
     * detectPushCommand() path, and classifyRemote() is exported. Passing argv
     * removes the shell instead of arguing about who validated what.
     *
     * `--` stops git from reading a remote name that begins with `-` as a flag;
     * shellEscape() passed those through unquoted.
     */
    url = String(exec('git', ['remote', 'get-url', '--push', '--', remoteName], {
      cwd,
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 2000,
    })).trim();
  } catch {
    return { kind: 'unknown', isFork: false, url: null };
  }
  if (!url) return { kind: 'unknown', isFork: false, url: null };

  for (const re of UPSTREAM_URL_HEURISTICS) {
    if (re.test(url)) return { kind: 'upstream', isFork: false, url };
  }
  for (const re of FORK_URL_HEURISTICS) {
    if (re.test(url)) return { kind: 'fork', isFork: true, url };
  }
  // Default convention: remote literally named 'origin' is treated as fork
  // (the bkit developer flow keeps origin pointed at their own fork).
  if (remoteName === 'origin') return { kind: 'origin', isFork: true, url };
  if (remoteName === 'upstream') return { kind: 'upstream', isFork: false, url };
  return { kind: 'unknown', isFork: false, url };
}

/**
 * Pure decision function: should bkit guard this push, and how strictly?
 *
 *   force      → deny  (force pushes never auto-approved; align with
 *                 ALWAYS_DENY_PATTERNS scripts/permission-request-handler.js)
 *   upstream   → ask   (require explicit confirmation regardless of Trust Level)
 *   unknown remote at L4 → ask  (conservative when classification failed)
 *   fork/origin at L0-L3 → allow
 *   fork/origin at L4 → ask  (L4 sub-agent dispatch enforces sequential AND
 *                              extra caution on cross-trust boundary ops)
 *
 * Note: shouldGuard never returns 'allow' for force=true regardless of
 * trustLevel — this matches the existing permission-request-handler stance.
 *
 * @param {PushParse} parsed
 * @param {RemoteClass} classified
 * @param {'L0'|'L1'|'L2'|'L3'|'L4'|string} trustLevel
 * @returns {GuardVerdict}
 */
function shouldGuard(parsed, classified, trustLevel) {
  if (!parsed || !parsed.isPush) {
    return { action: 'allow', reason: 'not a git push command', alternatives: [] };
  }
  if (parsed.force) {
    /*
     * ENH-462 (v2.1.36) — grade by target, and stop recommending the thing being
     * refused.
     *
     * Two defects sat here together. The advice told the user to
     * "Use `--force-with-lease`" while refusing exactly that, which is
     * unfollowable advice of the plainest kind. And every force push denied
     * outright, so rewriting your own topic branch after a rebase — ordinary
     * work, and `--force-with-lease` is its careful spelling, since it refuses
     * when upstream moved — was treated as harshly as overwriting main.
     *
     * The documented policy is that force pushes are "never auto-approved". An
     * ask is not an auto-approval: the human still answers. So a protected
     * branch keeps its deny, and anything else asks. That also makes this guard
     * agree with destructive-detector G-002, which grades the same way — before
     * this change the detector said ask and the guard said deny for the same
     * command, and the stricter one silently won.
     *
     * An unreadable target counts as protected: `git push --force` with no
     * refspec pushes the current branch, which may be main.
     */
    const branch = parsed.branch || '';
    const remote = parsed.remote || '';
    const targetsProtected = !parsed.branch
      || /\b(main|master|release|production)\b/i.test(branch)
      || /\b(main|master|release|production)\b/i.test(remote);

    return {
      action: targetsProtected ? 'deny' : 'ask',
      reason: `bkit ENH-298 push-event guard: force push detected (${parsed.remote || '?'}`
        + `${parsed.branch ? ' ' + parsed.branch : ''}). Force pushes overwrite remote history.`,
      alternatives: targetsProtected
        ? [
          'Push to a topic branch instead, then open a PR',
          'Reconcile with `git pull --rebase` and push without forcing',
          'If rewriting a protected branch is genuinely intended, co-ordinate first and have the user confirm',
        ]
        : [
          'Confirm the branch is yours and that no one else has built on it',
          'Prefer `--force-with-lease` over `--force` so the push refuses if upstream moved',
          'Reconcile with `git pull --rebase` instead, if the rewrite is avoidable',
        ],
    };
  }
  if (!classified || classified.kind === 'upstream') {
    return {
      action: 'ask',
      reason: `bkit ENH-298 push-event guard: pushing to upstream remote (${parsed.remote}).`,
      alternatives: [
        'Push to your fork first: `git push origin <branch>` then open a PR via `gh pr create`.',
        'Confirm this is intended: upstream pushes affect every downstream user.',
      ],
    };
  }
  if (classified.kind === 'unknown') {
    if (trustLevel === 'L4') {
      return {
        action: 'ask',
        reason: `bkit ENH-298 push-event guard: remote '${parsed.remote}' could not be classified (kind=unknown) and Trust Level is L4. Confirm destination.`,
        alternatives: ['Run `git remote -v` to verify the remote URL before pushing.'],
      };
    }
    return { action: 'allow', reason: `remote=${parsed.remote} unknown but trustLevel < L4`, alternatives: [] };
  }
  // fork / origin
  if (trustLevel === 'L4') {
    return {
      action: 'ask',
      reason: `bkit ENH-298 push-event guard: Trust Level L4 requires explicit confirmation for any push, including to fork (${parsed.remote}).`,
      alternatives: ['Confirm and proceed, or adjust Trust Level via `/control level 3`.'],
    };
  }
  return { action: 'allow', reason: `push to ${classified.kind} '${parsed.remote}' OK at ${trustLevel}`, alternatives: [] };
}

/** Minimal shell-arg escape for `git remote get-url --push <remote>`. */
function shellEscape(s) {
  if (/^[\w./-]+$/.test(s)) return s;
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

module.exports = {
  detectPushCommand,
  classifyRemote,
  shouldGuard,
  UPSTREAM_URL_HEURISTICS,
  FORK_URL_HEURISTICS,
};
