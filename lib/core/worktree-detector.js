/**
 * bkit - git worktree detector
 *
 * Detects whether the session is running inside a linked git worktree and, when
 * it is, records an advisory flag file for downstream bkit tooling.
 *
 * What this is NOT about (v2.1.35): bkit's own hooks. They ship in plugin
 * `hooks/hooks.json`, which Claude Code loads when the plugin is enabled — a
 * different configuration source from project `.claude/settings.json`. Measured
 * on Claude Code 2.1.226: a live session inside a linked worktree dispatched
 * SessionStart, InstructionsLoaded, UserPromptSubmit, Stop and SessionEnd —
 * the same set as the matched control in the primary checkout. Earlier releases
 * warned that hooks "may not fire" here and told users to leave the worktree.
 * That was never measured, and it is not true. See ADVISORY below for what
 * genuinely is at risk.
 *
 * Linked worktree test: `git rev-parse --git-dir` differs from
 * `--git-common-dir`, both as absolute, symlink-resolved paths. Getting the
 * base directory wrong is what made every subdirectory of a plain checkout look
 * like a worktree before v2.1.35 — see inspectWorktree().
 *
 * @version 2.1.35
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

/**
 * Advisory shown when a linked worktree is detected.
 *
 * Scoped to what reproduces: project-scope configuration lives in the main
 * checkout, and Claude Code resolves `.claude/settings.json` relative to the
 * working directory (anthropics/claude-code#46808, closed as not planned). A
 * worktree where `.claude/` is untracked or gitignored therefore has no
 * project-scope hooks or settings. Plugin-scope components — which is all of
 * bkit — are unaffected.
 */
const ADVISORY = Object.freeze({
  message:
    'git worktree detected. Project-scope configuration in `.claude/` may be absent here '
    + 'if it is untracked or gitignored, so project-level hooks and settings can be missing. '
    + "bkit's own hooks are plugin-scope and are not affected — verified by live measurement.",
  bkitHooksAffected: false,
  projectScopeConfigAtRisk: true,
  reference: 'https://code.claude.com/docs/en/hooks',
});

function safeGit(args, cwd) {
  try {
    return execFileSync('git', args, {
      cwd,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

/** Resolve symlinks for comparison only; returns the input when it cannot. */
function realpath(p) {
  try {
    return fs.realpathSync(p);
  } catch {
    return p;
  }
}

/**
 * Inspect the current git context.
 *
 * `gitDir` and `gitCommonDir` are returned as absolute paths, as promised by
 * this module's contract and relied on by the flag file.
 *
 * @param {string} [cwd]
 * @returns {{ isWorktree: boolean, toplevel: string|null, gitDir: string|null, gitCommonDir: string|null }}
 */
function inspectWorktree(cwd = process.cwd()) {
  let gitDir = null;
  let gitCommonDir = null;

  // git >= 2.31 emits absolute paths directly, which removes the base-directory
  // question entirely. One call returns both values, in the order requested.
  const absolute = safeGit(
    ['rev-parse', '--path-format=absolute', '--git-dir', '--git-common-dir'],
    cwd,
  );
  if (absolute) {
    const lines = absolute.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length >= 2) {
      [gitDir, gitCommonDir] = lines;
    }
  }

  // Fallback for git < 2.31. git emits these relative to the CWD it ran in, not
  // relative to the repository toplevel. Resolving against toplevel — which is
  // what bkit did through v2.1.34 — reports every subdirectory of a plain
  // checkout as a linked worktree, because `--git-common-dir` comes back as
  // something like `../../.git`.
  if (!gitDir || !gitCommonDir) {
    const rawDir = safeGit(['rev-parse', '--git-dir'], cwd);
    const rawCommon = safeGit(['rev-parse', '--git-common-dir'], cwd);
    if (rawDir) gitDir = path.resolve(cwd, rawDir);
    if (rawCommon) gitCommonDir = path.resolve(cwd, rawCommon);
  }

  const toplevel = safeGit(['rev-parse', '--show-toplevel'], cwd);
  if (!toplevel || !gitDir || !gitCommonDir) {
    return { isWorktree: false, toplevel, gitDir, gitCommonDir };
  }

  // Compare through realpath so a symlinked checkout (/tmp -> /private/tmp on
  // macOS) does not read as two different directories. The returned values stay
  // as git reported them — a diagnostic file should record what git said.
  return {
    isWorktree: realpath(gitDir) !== realpath(gitCommonDir),
    toplevel,
    gitDir,
    gitCommonDir,
  };
}

/**
 * Resolve the advisory flag path through bkit's own state resolver.
 *
 * Every other bkit state file goes through STATE_PATHS, which honours
 * CLAUDE_PROJECT_DIR. Building this path from bare `process.cwd()` dropped the
 * flag into whatever subdirectory the session started in, where nothing reads
 * it. Falls back to the caller's cwd if paths cannot be loaded.
 *
 * @param {string} cwd
 * @returns {string}
 */
function resolveFlagPath(cwd) {
  try {
    const { STATE_PATHS } = require('./paths');
    return path.join(STATE_PATHS.runtime(), 'worktree-warning.flag');
  } catch {
    return path.join(cwd, '.bkit', 'runtime', 'worktree-warning.flag');
  }
}

/**
 * Detect a linked worktree and record an advisory. Idempotent, never throws.
 *
 * @param {string} [cwd]
 * @returns {{ isWorktree: boolean, flagPath?: string }}
 */
function detectAndWarn(cwd = process.cwd()) {
  const info = inspectWorktree(cwd);
  if (!info.isWorktree) return info;

  const flagPath = resolveFlagPath(cwd);
  const payload = {
    detectedAt: new Date().toISOString(),
    toplevel: info.toplevel,
    gitDir: info.gitDir,
    gitCommonDir: info.gitCommonDir,
    // Records the runtime the "not affected" claim was measured against, so a
    // later reader can re-verify rather than inherit it on trust.
    verifiedOn: process.env.CLAUDE_CODE_VERSION || null,
    ...ADVISORY,
  };
  try {
    fs.mkdirSync(path.dirname(flagPath), { recursive: true });
    fs.writeFileSync(flagPath, JSON.stringify(payload, null, 2));
    process.stderr.write(
      `\n[bkit] git worktree detected — project-scope \`.claude/\` config may be absent here. `
      + `bkit's own hooks are unaffected. See ${flagPath}\n`,
    );
  } catch {
    // Non-fatal: the flag file is advisory.
  }

  return { ...info, flagPath };
}

module.exports = { inspectWorktree, detectAndWarn, ADVISORY };
