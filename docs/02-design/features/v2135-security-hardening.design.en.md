# v2.1.35 Security Hardening + Worktree Correctness — Design Document

> **Summary**: An external `execSync` → `execFileSync` hardening patch (PR #146) was
> merged, and reproducing it surfaced two shipping defects in the same file: a plain
> checkout is reported as a linked worktree, and the warning it prints is factually
> wrong about bkit's own hooks. This release corrects both, finishes the child_process
> migration across the repository, and locks all of it behind regression tests.
>
> **Project**: bkit — AI Native Development OS
> **Version**: 2.1.35 (target)
> **Date**: 2026-08-10
> **Status**: Awaiting approval
> **Branch**: `feat/v2.1.35-security-hardening` (single branch, forked from `026378f`)
> **Upstream**: PR #146 by [@anupamme](https://github.com/anupamme), merged as `026378f`

---

## Context Anchor

| Field | Value |
|---|---|
| **WHY** | A security patch arrived from outside the project. Merging it was correct, but the patch's own premise (a HIGH command-injection finding) did not survive reproduction, while two unrelated defects in the file it touched did. bkit's stated philosophy is *No Guessing*; the response has to be measurement, not a rubber stamp. |
| **WHO** | Anyone running bkit from a subdirectory of their repository (false worktree warning), anyone running bkit inside a git worktree (told to stop doing so, for no reason), and maintainers relying on the child_process policy that `lib/qa/test-runner.js` already declared. |
| **RISK** | The advisory bkit prints today drives users away from a workflow that works. Correcting it wrongly — dropping detection entirely — would give up genuine signal about project-scope `.claude/` configuration. |
| **SUCCESS** | The 8-context detection matrix has zero mismatches; the advisory states only what has been measured; every `child_process` call site in shipped code passes an argv array; regression tests fail if any of it is reverted. |
| **SCOPE** | `lib/core/worktree-detector.js`, the remaining 7 `child_process` shell call sites, one new contract test, one new unit test, docs + version sync. Explicitly **not** in scope: registering `WorktreeCreate`/`WorktreeRemove` (see §6). |

---

## 1. Evidence

Every claim below is a recorded run, not a reading of the code. The harness is
`test/unit/worktree-detector.test.js` (new) and the live probe described in §1.3.

### 1.1 The semgrep finding does not reproduce as a vulnerability

PR #146 cites `javascript.lang.security.detect-child-process` at HIGH severity:
"Detected calls to child_process from a function argument `args`."

All three `safeGit(...)` call sites pass module-internal string literals
(`'rev-parse --show-toplevel'`, `'rev-parse --git-dir'`, `'rev-parse --git-common-dir'`).
No caller-controlled value reaches `args`. The finding is a true description of the
*pattern* and a false description of the *risk* at this call site.

The migration is still correct, and is kept and extended: with `execFileSync` there is
no shell, so the primitive cannot be reintroduced by a future caller. This is already
the project's stated policy — `lib/qa/test-runner.js:9-13` carries the comment
*"C1 fix (audit): use execFileSync (no shell) so testDir can never reach a shell."*
Seven call sites simply never received it.

### 1.2 A plain checkout is reported as a linked worktree (ENH-424)

Measured on git 2.39.5 across 8 contexts. `BASE` is bkit before PR #146, `PR146` is
what is on `main` now, `FIX` is the design in §2.

| context | expected | BASE | PR146 | FIX |
|---|---|---|---|---|
| main repo toplevel | false | false | false | false |
| **main repo subdirectory** | false | **true ❌** | **true ❌** | false |
| linked worktree toplevel | true | true | true | true |
| linked worktree subdirectory | true | true | true | true |
| submodule working dir | false | false | false | false |
| bare repo | false | false | false | false |
| non-git directory | false | false | false | false |
| **symlinked path to main** | false | **true ❌** | **true ❌** | false |

**Root cause.** `git rev-parse --git-dir` returns an absolute path, while
`--git-common-dir` returns a path relative to **the current working directory**. The
pre-#146 code resolved both against `toplevel`:

```js
const absGitDir = path.resolve(toplevel, gitDir);      // already absolute — fine
const absCommon = path.resolve(toplevel, gitCommonDir); // '../../.git' against the WRONG base
```

From `main/sub/deep`, git emits `--git-common-dir` as `../../.git`, which is correct
relative to `sub/deep` and meaningless relative to `main/`. The two paths therefore
never compare equal and every subdirectory looks like a worktree. PR #146 removed the
`path.resolve` calls entirely and compares git's raw output, which fails the same case
for a different reason (absolute vs. relative string).

This is **pre-existing**, shipping since v2.1.12. PR #146 neither caused it nor fixed it.

### 1.3 The advisory is wrong about bkit's own hooks (ENH-425 — headline)

The message bkit writes today:

> `git worktree detected — Claude Code hooks may not fire (issue #46808). Run bkit from the primary repository if hook-driven automation is required.`

Two independent problems.

**(a) The cited issue is closed and is about a different loading path.**
[anthropics/claude-code#46808](https://github.com/anthropics/claude-code/issues/46808)
is **closed as not planned**. Its subject is project-level `.claude/settings.json`,
which Claude Code resolves relative to the process working directory; in a worktree
where `.claude/` is untracked or gitignored, that file is absent. bkit does not ship
hooks that way. bkit's hooks come from plugin `hooks/hooks.json`, which the
[official hooks reference](https://code.claude.com/docs/en/hooks) lists as a distinct
configuration source, loaded when the plugin is enabled.

**(b) Measured: bkit's hooks fire in a linked worktree.** One live
`claude -p --plugin-dir <bkit> --strict-mcp-config --no-session-persistence` session
inside a linked worktree, against a matched control in the primary checkout of the same
repository, read back from bkit's own dispatch ledger:

| | linked worktree | primary checkout |
|---|---|---|
| events dispatched | `SessionStart`, `InstructionsLoaded`, `UserPromptSubmit`, `Stop`, `SessionEnd` | **identical set** |
| `.bkit/` created | yes | yes |
| worktree advisory written | **yes** | no |

The hooks are not degraded in any observable way. bkit has been advising users to
abandon a workflow over a problem it does not have — and pointing them at an issue that
will not be fixed because it was declined.

### 1.4 The flag file bypasses bkit's own path resolver (ENH-426)

Every other state path in bkit goes through `STATE_PATHS.runtime()` →
`getPlatform().PROJECT_DIR`, which is `process.env.CLAUDE_PROJECT_DIR || process.cwd()`
(`lib/core/platform.js:47`). `worktree-detector.js` builds its flag path from bare
`process.cwd()` instead. Combined with §1.2, a session started in a subdirectory writes
a stray `.bkit/runtime/worktree-warning.flag` into that subdirectory — a directory no
other bkit component reads.

PR #146 additionally changed this line from the `cwd` parameter to `process.cwd()`,
so `detectAndWarn(cwd)` now ignores its own argument. The only caller
(`hooks/startup/context-init.js:72`) passes nothing, so nothing observable broke, but
the contract did.

### 1.5 Seven shell call sites remain (ENH-427, ENH-428)

| file:line | command | variable interpolated | assessment |
|---|---|---|---|
| `lib/defense/push-event-guard.js:150` | `git remote get-url --push ${remoteName}` | **yes** — parsed out of the user's Bash command | Defended today by `REMOTE_REGEX` (`[\w./-]+`) plus `shellEscape()`. The function is exported, so the regex is not a guarantee for other callers. |
| `scripts/_v2119-s0-measure.js:185` | `gh issue list --search "author:${handle} …"` | **yes** — `DEFAULT_DOGFOODERS`, currently the literal `['pruge']` | Interpolated inside a double-quoted shell string. Safe only because the list is hardcoded. |
| `lib/infra/cc-bridge.js:55` | `claude --version 2>/dev/null` | no | uses a shell redirect that `stdio` already provides |
| `hooks/startup/session-context.js:171` | `claude --version` | no | duplicate of the above |
| `scripts/check-test-tracking.js:94` | `git ls-files` | no | — |
| `scripts/_v2119-s0-measure.js:289` | `git rev-parse HEAD` | no | — |
| `scripts/lib/sprint-handler-shared.js:193` | `git rev-parse HEAD` | no | no `cwd`, inherits the process's |

Separately, CC version detection exists **three times**: the two `execSync` sites above
and `lib/infra/cc-version-checker.js:212`, which already uses
`spawnSync('claude', ['--version'])`. The correct implementation is already in the tree.

### 1.6 There are no tests for this file

`CHANGELOG.md` (v2.1.12) records *"`test-scripts/unit/worktree-detector.test.js`
(jest, 2 suites / 6 tests)"*. That path does not exist, `test-scripts/` does not exist,
and a repository-wide search for worktree tests returns nothing. The coverage was
either lost in a directory move or never landed. Either way the file has shipped
untested for 22 releases, which is why §1.2 survived that long.

---

## 2. Design

### 2.1 `inspectWorktree()` — ask git for absolute paths

```js
function inspectWorktree(cwd = process.cwd()) {
  let gitDir = null;
  let gitCommonDir = null;

  // git >= 2.31 emits absolute paths directly, which removes the base-directory
  // question entirely. One call returns both values, in order.
  const absolute = safeGit(
    ['rev-parse', '--path-format=absolute', '--git-dir', '--git-common-dir'], cwd,
  );
  if (absolute) {
    const lines = absolute.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length >= 2) { [gitDir, gitCommonDir] = lines; }
  }

  // Fallback for git < 2.31. git emits these relative to CWD, not to toplevel —
  // resolving against toplevel is what made every subdirectory look like a worktree.
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
  // A symlinked checkout (/tmp -> /private/tmp on macOS) must not read as two dirs.
  return {
    isWorktree: realpath(gitDir) !== realpath(gitCommonDir),
    toplevel, gitDir, gitCommonDir,
  };
}
```

Three decisions worth stating:

- **Absolute paths are restored to the return value**, matching the JSDoc and the
  module docstring that both still promise them, and matching what downstream tooling
  reads out of the flag file.
- **`realpath` is applied only to the comparison**, not to the returned values. A
  diagnostic file should record the paths git actually reported.
- **The fallback resolves against `cwd`**, the base git actually used.

### 2.2 The advisory says what was measured (ENH-425)

Detection is **kept** — a linked worktree is still worth telling the user about, because
project-scope `.claude/settings.json` and a gitignored `.claude/` genuinely may be
absent there. What changes is that the message stops describing bkit's hooks as broken,
stops citing a declined issue as a live defect, and stops recommending that users leave
the worktree.

The flag file gains `bkitHooksAffected: false` and a `verifiedOn` field recording the
Claude Code version the claim was measured against, so the next person can tell whether
the statement is still current rather than inheriting it on trust.

Severity drops from `WARNING` to an informational line. It is written to stderr only
when a linked worktree is genuinely detected — which, after §2.1, is far less often.

### 2.3 State paths go through the resolver (ENH-426)

The flag path becomes `path.join(STATE_PATHS.runtime(), 'worktree-warning.flag')`,
honouring `CLAUDE_PROJECT_DIR` like every other bkit state file. `detectAndWarn(cwd)`
passes its `cwd` through to `inspectWorktree()` and no longer silently ignores it.

### 2.4 Repository-wide `execFileSync` (ENH-427)

All seven remaining sites move to argv arrays. `push-event-guard.js` keeps its regex
and `shellEscape` export for compatibility but no longer depends on them for safety.
`_v2119-s0-measure.js` passes `--search` as a single argv element, so a handle can
never terminate a quoted string.

A new contract test (`test/contract/child-process-policy.test.js`) fails when shipped
code calls `execSync`/`exec` with a template literal or concatenation. The rule is
mechanical, so it does not depend on anyone remembering §1.5.

### 2.5 CC version detection consolidates (ENH-428)

`cc-bridge.js` and `session-context.js` delegate to the existing
`lib/infra/cc-version-checker.js` implementation rather than each spawning their own
shell. Three implementations of one question become one.

### 2.6 Regression suite (ENH-429)

`test/unit/worktree-detector.test.js` builds the 8-context topology from §1.2 in a temp
directory and asserts the verdict for each. Included as **negative controls**: restoring
either the pre-#146 `path.resolve(toplevel, …)` or the #146 raw-string comparison must
make the suite fail, and an assertion that the advisory text contains no "may not fire"
claim about plugin hooks.

---

## 3. What changes for the user

| Before | After |
|---|---|
| Starting bkit from a subdirectory printed a worktree warning and wrote a stray flag file | No warning; a plain checkout is recognized as one |
| Working in a git worktree told you hooks "may not fire" and to go back to the main checkout | You are told what is actually at risk (project-scope `.claude/` config) and that bkit's own hooks are unaffected — measured, with the CC version recorded |
| The warning cited a closed-as-not-planned issue as if it were live | The advisory cites only what currently reproduces |

---

## 4. Test plan

| Level | What | Pass condition |
|---|---|---|
| Unit | 8-context detection matrix | 0 mismatches |
| Unit | negative controls (both old implementations) | suite fails when either is restored |
| Contract | `child-process-policy` | 0 shell-interpolating call sites in shipped code |
| Contract | existing suite | no regression against the current baseline |
| Host (L6) | `claude -p --plugin-dir` in a linked worktree + control | identical dispatched-event sets; advisory text matches §2.2 |
| Full QA | every skill / agent / hook event / MCP tool | per Phase 4 harness |

---

## 5. Risks

| Risk | Mitigation |
|---|---|
| `--path-format=absolute` is unavailable on git < 2.31 | Explicit fallback path, exercised by forcing the fallback branch in tests |
| Softening the advisory hides a real worktree problem | Detection is kept; only the claim about *bkit's hooks* is withdrawn, and it is withdrawn on measurement |
| The measurement in §1.3 is CC-version-specific | `verifiedOn` records the version; the L6 test re-measures rather than trusting the recorded value |
| Touching 7 files for the child_process sweep risks churn | Each is a mechanical argv conversion with no behavioral change; the contract test pins the outcome |

---

## 6. Explicitly deferred

**`WorktreeCreate` / `WorktreeRemove` registration.** CHANGELOG v2.1.33 records these
as deferred under ENH-396/418: *"confirmed supported by Claude Code, deferred for the
hook-count cascade."* That reasoning is unchanged by anything found here — this release
removes an incorrect claim about worktrees, it does not add worktree lifecycle
management. Registering two more always-loaded hook events carries a context cost that
this release has no evidence to justify. Recorded, not silently dropped.

**ENH-383 / ENH-403 status correction.** Analysis documents from the v2.1.33 cycle
describe ENH-383 as unshipped. That is now half true: the `skipped[]` surfacing half
shipped in `hooks/startup/restore.js:29` and `lib/core/paths.js:365` (both labelled
v2.1.33), while ENH-403's two-cause message distinction is in `paths.js:379-387` and is
listed in the v2.1.33 CHANGELOG. The remaining half of ENH-383 — *"the
`worktree-detector.js` message is now misleading"* — is exactly §1.3, and this release
closes it.

---

## 7. Traceability

| ID | Item | Files |
|---|---|---|
| ENH-424 | Worktree detection base-directory correctness | `lib/core/worktree-detector.js` |
| ENH-425 | Advisory correctness; retire the #46808 citation | `lib/core/worktree-detector.js` |
| ENH-426 | Flag path via `STATE_PATHS.runtime()`; honour `cwd` | `lib/core/worktree-detector.js` |
| ENH-427 | Repository-wide `execFileSync` + policy contract | 7 files + `test/contract/child-process-policy.test.js` |
| ENH-428 | Consolidate CC version detection | `lib/infra/cc-bridge.js`, `hooks/startup/session-context.js` |
| ENH-429 | Restore worktree-detector test coverage | `test/unit/worktree-detector.test.js` |
| ENH-430 | De-flake SB-011 (read pinned state, not the live project) | `test/philosophy/security-by-default-v2.test.js` |
| ENH-431 | Test manifest lists only files that exist; a missing file fails | `test/run-all.js`, `test/contract/test-manifest-integrity.test.js` |

### ENH-430 — found by running the suite, not by reading it

The first full aggregate on this branch reported one failure:
`SB-011 … (control: 38, engine: 50)`. The second reported none. The assertion
captures `initState` at line 69 and reads the trust engine at line 153, both from
the developer's live `.bkit/state/` — and a bkit session running inside this very
repository rewrites `trust-profile.json` between them (confirmed by mtime). v2.1.33
had already removed a hardcoded constant from this assertion with the note *"a test
that passes or fails based on accumulated local state is not a test"*; it removed the
constant and left the state dependence.

Both readings now come from one child process pinned to an empty
`CLAUDE_PROJECT_DIR`, which makes the pair atomic and the expected value the same on
a fresh clone, on a dogfooding machine, and in CI. Measured deterministic at 38/38
across three consecutive runs.
