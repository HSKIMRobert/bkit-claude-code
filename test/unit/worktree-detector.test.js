/**
 * worktree-detector.test.js — git worktree detection across real git topologies
 *
 * Restores the coverage CHANGELOG v2.1.12 recorded as
 * `test-scripts/unit/worktree-detector.test.js`; that path never existed in the
 * repository, which is why ENH-424 shipped undetected for 22 releases.
 *
 * Everything here runs against real `git`, not a mock: the defect being locked
 * down is a disagreement between what git prints and what the module assumed,
 * and a mock would have encoded the same wrong assumption.
 *
 * Covers docs/02-design/features/v2135-security-hardening.design.en.md §1.2, §2.
 *
 * @module test/unit/worktree-detector.test
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync, execFileSync } = require('child_process');

const detector = require('../../lib/core/worktree-detector');

const HAS_GIT = (() => {
  try {
    execFileSync('git', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

/** Build the topology once and share it across cases; nothing here mutates it. */
function buildTopology() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bkit-wt-test-'));
  const sh = (cmd, cwd) => execSync(cmd, { cwd, stdio: ['ignore', 'pipe', 'ignore'] });

  const main = path.join(root, 'main');
  fs.mkdirSync(main, { recursive: true });
  sh('git init -q .', main);
  sh('git config user.email bkit@test.local', main);
  sh('git config user.name bkit-test', main);
  sh('git commit -q --allow-empty -m init', main);
  fs.mkdirSync(path.join(main, 'sub', 'deep'), { recursive: true });

  const linked = path.join(root, 'linked');
  sh(`git worktree add -q "${linked}" -b wt-test-branch`, main);
  fs.mkdirSync(path.join(linked, 'sub', 'deep'), { recursive: true });

  // Submodule: a git dir that is neither the common dir's parent nor a worktree.
  const subRepo = path.join(root, 'subrepo');
  fs.mkdirSync(subRepo, { recursive: true });
  sh('git init -q .', subRepo);
  sh('git config user.email bkit@test.local', subRepo);
  sh('git config user.name bkit-test', subRepo);
  sh('git commit -q --allow-empty -m init', subRepo);
  let submodule = null;
  try {
    sh(`git -c protocol.file.allow=always submodule add -q "${subRepo}" mod`, main);
    sh('git commit -q -m add-submodule', main);
    submodule = path.join(main, 'mod');
  } catch {
    // Some git builds refuse file:// submodules outright; the case is skipped.
  }

  const bare = path.join(root, 'bare.git');
  sh(`git init -q --bare "${bare}"`, root);

  const plain = path.join(root, 'plain');
  fs.mkdirSync(plain, { recursive: true });

  let symlinked = null;
  try {
    fs.symlinkSync(main, path.join(root, 'link-to-main'));
    symlinked = path.join(root, 'link-to-main', 'sub', 'deep');
  } catch {
    // Symlink creation can be unavailable (e.g. Windows without privilege).
  }

  return { root, main, linked, submodule, bare, plain, symlinked };
}

const topo = HAS_GIT ? buildTopology() : null;

process.on('exit', () => {
  if (topo) {
    try { fs.rmSync(topo.root, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

/* ------------------------------------------------------------------ verdicts */

test('WT-01 main repository toplevel is not a worktree', { skip: !HAS_GIT }, () => {
  assert.equal(detector.inspectWorktree(topo.main).isWorktree, false);
});

test('WT-02 a subdirectory of the main repository is not a worktree', { skip: !HAS_GIT }, () => {
  /*
   * ENH-424. This is the case that failed through v2.1.34 and in PR #146.
   * `git rev-parse --git-dir` answers with an absolute path here while
   * `--git-common-dir` answers relative to CWD (`../../.git`); resolving both
   * against `toplevel` compares two different directories and always reports a
   * worktree.
   */
  assert.equal(detector.inspectWorktree(path.join(topo.main, 'sub', 'deep')).isWorktree, false);
});

test('WT-03 linked worktree toplevel is a worktree', { skip: !HAS_GIT }, () => {
  assert.equal(detector.inspectWorktree(topo.linked).isWorktree, true);
});

test('WT-04 subdirectory of a linked worktree is a worktree', { skip: !HAS_GIT }, () => {
  assert.equal(detector.inspectWorktree(path.join(topo.linked, 'sub', 'deep')).isWorktree, true);
});

test('WT-05 submodule working directory is not a worktree', { skip: !HAS_GIT }, (t) => {
  if (!topo.submodule) return t.skip('submodule setup unavailable in this git build');
  assert.equal(detector.inspectWorktree(topo.submodule).isWorktree, false);
});

test('WT-06 bare repository is not a worktree', { skip: !HAS_GIT }, () => {
  assert.equal(detector.inspectWorktree(topo.bare).isWorktree, false);
});

test('WT-07 non-git directory reports nothing and stays null', { skip: !HAS_GIT }, () => {
  const r = detector.inspectWorktree(topo.plain);
  assert.equal(r.isWorktree, false);
  assert.equal(r.toplevel, null);
});

test('WT-08 symlinked path to the main checkout is not a worktree', { skip: !HAS_GIT }, (t) => {
  if (!topo.symlinked) return t.skip('symlinks unavailable in this environment');
  // Comparison runs through realpath: /tmp -> /private/tmp on macOS must not
  // read as two different git directories.
  assert.equal(detector.inspectWorktree(topo.symlinked).isWorktree, false);
});

/* ------------------------------------------------------------------ contract */

test('WT-09 gitDir and gitCommonDir are returned absolute', { skip: !HAS_GIT }, () => {
  // The module docstring and JSDoc both promise absolute paths, and the flag
  // file's consumers read them. PR #146 returned git's raw output instead.
  for (const cwd of [topo.main, path.join(topo.main, 'sub', 'deep'), topo.linked]) {
    const r = detector.inspectWorktree(cwd);
    assert.ok(path.isAbsolute(r.gitDir), `gitDir not absolute from ${cwd}: ${r.gitDir}`);
    assert.ok(
      path.isAbsolute(r.gitCommonDir),
      `gitCommonDir not absolute from ${cwd}: ${r.gitCommonDir}`,
    );
  }
});

test('WT-10 detectAndWarn honours its cwd argument', { skip: !HAS_GIT }, () => {
  // PR #146 built the flag path from process.cwd() and ignored the parameter.
  const r = detector.detectAndWarn(topo.main);
  assert.equal(r.isWorktree, false);
  assert.equal(r.flagPath, undefined, 'no flag file for a plain checkout');
});

/* ------------------------------------------------------------------ advisory */

test('WT-11 the advisory does not claim bkit hooks may fail', () => {
  /*
   * ENH-425. Measured on Claude Code 2.1.226: a live `claude -p --plugin-dir`
   * session inside a linked worktree dispatched the same hook events as the
   * matched control in the primary checkout. The pre-v2.1.35 message said the
   * opposite and told users to leave the worktree.
   */
  const text = JSON.stringify(detector.ADVISORY);
  assert.doesNotMatch(text, /may not fire/i);
  assert.doesNotMatch(text, /run bkit from the primary repository/i);
  assert.equal(detector.ADVISORY.bkitHooksAffected, false);
});

test('WT-12 the advisory does not cite the closed issue as a live defect', () => {
  // anthropics/claude-code#46808 is closed as not planned, and concerns
  // project-scope .claude/settings.json rather than plugin hooks.
  assert.doesNotMatch(JSON.stringify(detector.ADVISORY), /issues\/46808/);
  assert.match(detector.ADVISORY.reference, /^https:\/\/code\.claude\.com\//);
});

test('WT-13 the advisory names what is actually at risk', () => {
  assert.equal(detector.ADVISORY.projectScopeConfigAtRisk, true);
  assert.match(detector.ADVISORY.message, /\.claude\//);
});

/* -------------------------------------------------- negative control (guard) */

test('WT-14 negative control: both superseded implementations fail WT-02', { skip: !HAS_GIT }, () => {
  /*
   * A regression test that cannot fail is decoration. This re-implements the
   * two shipped predecessors and asserts each one gets WT-02 wrong, so the
   * suite is demonstrably sensitive to the defect it claims to lock down.
   */
  const cwd = path.join(topo.main, 'sub', 'deep');
  const git = (args) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'] })
    .toString().trim();

  const toplevel = git(['rev-parse', '--show-toplevel']);
  const rawDir = git(['rev-parse', '--git-dir']);
  const rawCommon = git(['rev-parse', '--git-common-dir']);

  // v2.1.12 .. v2.1.34: resolved against toplevel — the wrong base.
  const preV2135 = path.resolve(toplevel, rawDir) !== path.resolve(toplevel, rawCommon);
  assert.equal(preV2135, true, 'pre-v2.1.35 implementation should misreport this case');

  // PR #146: compared git's raw output — absolute against relative.
  const pr146 = rawDir !== rawCommon;
  assert.equal(pr146, true, 'PR #146 implementation should misreport this case');

  // The shipped implementation gets it right.
  assert.equal(detector.inspectWorktree(cwd).isWorktree, false);
});
