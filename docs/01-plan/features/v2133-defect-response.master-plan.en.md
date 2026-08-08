---
template: sprint-master-plan
version: 1.0
description: Sprint Master Plan — bkit v2.1.33 Defect Response
variables:
  feature: v2133-defect-response
  displayName: bkit v2.1.33 Defect Response
  date: 2026-08-08
  author: kay kim (maintainer) + sprint-master-planner
  trustLevel: L2
  duration: 7 work units (S1–S7), multi-session
---

# bkit v2.1.33 Defect Response — Sprint Master Plan

> **Sprint ID**: `v2133-defect-response`
> **Date**: 2026-08-08
> **Author**: kay kim (maintainer) + sprint-master-planner
> **Trust Level (start)**: L2 — auto-run through `design`; entering `do` requires explicit user approval
> **Estimated duration**: 7 work units (S1–S7), spanning multiple sessions
> **Branch**: `feat/v2.1.33-defect-response` (single branch; minimal commits/pushes)
> **Master Plan template**: bkit v2.1.13 (Sprint 4 Presentation output)
> **Version note**: target version **v2.1.33** is maintainer-ordered. The repo rule "agents do not bump versions" is explicitly excepted for this sprint by maintainer decision (recorded here). Do not re-litigate.

---

## 0. Executive Summary

| Item | Content |
|------|---------|
| **Mission** | Ship bkit v2.1.33 closing the verified defect backlog ENH-388~416 (STILL-VALID 21) plus the user-mandated session-UX redesign (re-opened Issue #77), with every fix protected by a **gating** test — no more "tests that report FAIL and exit 0". |
| **Anti-Mission** | No new features. No RECOMMENDED_VERSION raise (held at 2.1.220 by two consecutive cycles' analysis). No hook-based mitigation for the CC v2.1.225 subagent fail-open (structurally impossible — prose layer only). No retroactive translation of existing docs. |
| **Core Primitives** | 10 features → 7 sequential work units (S1–S7) on one branch; 8-phase lifecycle per unit; proof-first ordering (test gating lands before any enforcement fix). |
| **Trust Level** | L2 — `prd → plan → design` auto-advance; **`do` entry pauses for user approval** per work unit. PR merge to `main` is a second, separate approval gate. |
| **Auto-pause conditions** | 4 triggers active (QUALITY_GATE_FAIL / ITERATION_EXHAUSTED / BUDGET_EXCEEDED / PHASE_TIMEOUT) |
| **Success Criteria** | 5 items (see §6) + Definition of Done (§14) |

**Why "proof first"**: the current test infrastructure has three independent non-gating layers (ENH-411). Any enforcement fix (F3–F7) merged before S1 would be protected by tests that cannot fail the build — indistinguishable from no protection. Therefore `proof-infrastructure` is a hard prerequisite of everything else.

---

## 1. Context Anchor (propagated Plan → Design → Do)

| Key | Value |
|-----|-------|
| **WHY** | Two forces converge. (a) **Users**: multiple users independently asked bkit to stop forcing session names — maintainer verbatim: "다른 사용자로부터 같은 요청을 여러번 받았으니까 세션에 이름 강제하는거 하지 말라고 한거야". Issue #77 (closed 2026-04-15) reported three forced behaviors; all three are still default-ON. (b) **Evidence**: cycles #33–#34 of CC-version impact analysis produced a reproduced, file:line-verified defect ledger (ENH-388~416) showing bkit's two headline differentiators — Memory Enforcer deny path and Design↔Code matchRate gate — are respectively emitting the wrong reason (ENH-410) and undecidable on NaN (ENH-412), while the test suite that should catch this cannot fail the build (ENH-411/416). |
| **WHO** | (1) All existing bkit users — the session-UX redesign changes default behavior for every one of them. (2) The maintainer — needs a gating CI to trust future changes. (3) Downstream CC-version-analysis cycles — consume the corrected ledger (ERRATA-34-6 restatement) and the held RECOMMENDED_VERSION rationale. |
| **WHAT (domain)** | 10 features: `session-ux-redesign`, `proof-infrastructure`, `io-block-contract`, `bash-path-enforcement`, `write-path-enforcement`, `plugin-data-isolation`, `gate-numeric-hygiene`, `subagent-trust-boundary`, `docs-privacy-sync`, `residual-p2-p3` — all registered in `.bkit/state/master-plans/v2133-defect-response.json`. |
| **WHAT NOT** | RECOMMENDED_VERSION raise (ENH-395 first half / 384 — intended hold, not a defect); ENH-386 (re-evaluate only after 394 lands); ENH-408 (depends on unverified CC behavior); ENH-409 (dropped); any retroactive rename/translation of existing docs; any hook-based observation of CC's subagent-handoff refusal prose. |
| **RISK** | (1) Enabling CI gating turns the build red immediately unless the currently-hidden failures (AL-007, TE-001/TE-025, flaky v2112 invariant) are fixed first — ordering inside S1 is load-bearing. (2) Session-UX redesign is a behavior change for all users; naive default-off of context injection silently kills 8-language detection, ambiguity detection and PDCA state awareness. (3) Restoring real blocking in bash/write paths (388/398) can produce false positives on legitimate commands. (4) Long-lived single branch drifts from `main`. Full register: §9. |
| **SUCCESS** | All 21 STILL-VALID ENH items closed or explicitly deferred with recorded reason; test suite gating (a deliberate failure turns CI red — demonstrated, not assumed); session title/dashboard/context-injection driven by PDCA-usage detection instead of unconditional defaults; PR merged to `main` with explicit approval; tag `v2.1.33` + English GitHub Release note. |
| **SCOPE (quantified)** | 10 features / 21 STILL-VALID ENH (P0 7 · P1 7 · P2 4 · P3 3) + 2 orphans + 1 split (395b) / 7 work units / rough token estimate ≈ 385K total, ≤ 100K per unit (heuristic estimate per `lib/application/sprint-lifecycle/context-sizer.js` defaults — estimate, not measurement) / duration multi-session, resumable (§12). |
| **OUT-OF-SCOPE** | See §13 Deferred: 395a (version hold), 386, 408, 409; SUPERSEDED 381→391, 382→394, 384→395, 387→396; NEEDS-RECHECK 3. Ledger max shipped ENH = **380**; nothing in 381–416 has shipped. |

**Analysis discipline (binding for every phase of this sprint)**:
- **Never guess** — every defect claim must be reproduced before it enters a design or a commit message. Everything in this plan is already reproduced; anything *added* later must state its measurement method.
- Absence proofs use **perl**, not grep (this machine's `grep` is ugrep 7.5.0 with `-E` false negatives). Multi-file `perl -ne` must include `close ARGV if eof;` because `$.` does not reset per file.
- Any scope/permission claim must state which automation level (L0–L4) it applies to. Baseline: bkit's PreToolUse hook deny paths (`unified-bash-pre.js`, `pre-write.js`) execute at **all levels L0–L4** (hooks run unconditionally); `SPRINT_AUTORUN_SCOPE` L2 governs only sprint phase auto-advance, not hook enforcement.

---

## 2. Features (work bundles composing the sprint)

| # | Feature | Priority | ENH / origin | Status | Work unit |
|---|---------|----------|--------------|--------|-----------|
| 1 | `proof-infrastructure` | P0 | ENH-411, ENH-416, hidden-failure fixes, ERRATA-34-6 restatement | pending | S1 |
| 2 | `io-block-contract` | P0 | ENH-410 (upstream node of 388/398) | pending | S2 |
| 3 | `bash-path-enforcement` | P0 | ENH-388+389+390+393 (atomic bundle) + orphan A | pending | S2 |
| 4 | `write-path-enforcement` | P0 | ENH-398+399+400+401 (atomic bundle) | pending | S3 |
| 5 | `plugin-data-isolation` | P0/P1 | ENH-402 (P0) → 403 → 383, + 396 | pending | S4 |
| 6 | `gate-numeric-hygiene` | P1 | ENH-412 | pending | S5 |
| 7 | `subagent-trust-boundary` | P1 | ENH-413 (prose layer only) | pending | S5 |
| 8 | `session-ux-redesign` | P0 (user-mandated) | Issue #77 re-open; maintainer-chosen redesign | pending | S6 |
| 9 | `docs-privacy-sync` | P1/P2/P3 | ENH-404 (P1), 407 (P2), 397 (P3), + generator bilingual finding | pending | S7 |
| 10 | `residual-p2-p3` | P2/P3 | ENH-394, 405, 406, 385, 414, 415, 395b, orphan B | pending | S7 |

Priority note: `session-ux-redesign` is P0 by maintainer mandate and highest user visibility, but is *sequenced* at S6 because it has no dependency on the enforcement chain and benefits from S1's gating tests plus an empirical probe (§3 S6). Priority and execution order deliberately differ.

---

## 3. Sprint Decomposition, Ordering & Dependency Graph

### 3.1 Ordering (fixed constraint — do not renegotiate)

```
S1 proof-infrastructure
 └─→ S2 io-block-contract + bash-path-enforcement   (shared file: scripts/unified-bash-pre.js)
      └─→ S3 write-path-enforcement                 (consumes fixed outputBlockWithContext contract)
           └─→ S4 plugin-data-isolation             (402 before 403 — same lines paths.js:312-317)
                └─→ S5 gate-numeric-hygiene + subagent-trust-boundary
                     └─→ S6 session-ux-redesign
                          └─→ S7 docs-privacy-sync + residual-p2-p3
```

Dependency graph (feature-level adjacency, for the state JSON `dependencyGraph`):

```json
{
  "io-block-contract":        ["proof-infrastructure"],
  "bash-path-enforcement":    ["io-block-contract"],
  "write-path-enforcement":   ["io-block-contract", "bash-path-enforcement"],
  "plugin-data-isolation":    ["write-path-enforcement"],
  "gate-numeric-hygiene":     ["plugin-data-isolation"],
  "subagent-trust-boundary":  ["plugin-data-isolation"],
  "session-ux-redesign":      ["gate-numeric-hygiene", "subagent-trust-boundary"],
  "docs-privacy-sync":        ["session-ux-redesign"],
  "residual-p2-p3":           ["session-ux-redesign"]
}
```

Rationale for the two non-obvious edges:
- **F3 before F4/F5**: `io.js:346 outputBlock(reason)` is the shared upstream of ENH-410, ENH-388 **and** ENH-398. If 410 is not fixed first, the "restore blocking" work in 388/398 emits the wrong reason string (`reason` binds to the literal `'deny'` — execution-proven: `{"decision":"block","reason":"deny"}`, exit 0). Cycle #34 linked 410→398/399/400 but missed the 388 link; this plan restores it.
- **402 before 403**: both edit `lib/core/paths.js:312-317`; 403's reason-string split only makes sense once 402's project-segment namespacing defines what "different project" means.

### 3.2 Per-unit detail

---

#### S1 — `proof-infrastructure` (must land FIRST)

**Goal**: make test failure visible. After S1, a failing test turns `node test/run-all.js` non-zero and CI red — demonstrated with a deliberate scratch failure, then removed.

**Internal ordering (load-bearing — see Risk R1)**: fix hidden failures *before* enabling any gating layer.

1. **Hidden failures (fix first)**:
   - `test/unit/audit-logger.test.js` **AL-007**: asserts `ACTION_TYPES has 29 entries`; live value measured **40**; `.claude/CLAUDE.md` and the audit skill say **19**. Three-way drift → **maintainer must pick the Source of Truth** (approval-gate decision D1, §11). Plan default recommendation: code (40) is SoT; test asserts 40; docs corrected in S7.
   - `test/unit/trust-engine.test.js` **TE-001, TE-025**: default trust score 40 mismatch — align test with shipped default (measured), or shipped default with spec if maintainer rules otherwise (decision D2).
   - `test/contract/v2112-deep-qa-invariants.contract.test.js`: **flaky** (measured back-to-back: `PASS 4308/Errors 0` vs `PASS 4307/Errors 1`). Root-cause the nondeterminism; if not fixable inside S1 budget, quarantine with a recorded reason and a follow-up ticket — a flaky test inside a newly-gating suite poisons every later unit.
2. **ENH-411 — close all three non-gating layers** (fixing only one is a known trap; the pipe is the *least* important):
   - ① test files must exit non-zero on FAIL (measured today: `node test/unit/trust-engine.test.js` → exit 0 with 2 FAILs);
   - ② `test/contract/scripts/qa-aggregate.js` gains `process.exit(1)` on failure (currently **zero** `process.exit` calls);
   - ③ `.github/workflows/contract-check.yml:74` — `node …/qa-aggregate.js | tail -10` under default `bash -e` **without pipefail** masks the exit code; either drop the pipe or set `shell: bash` with `set -o pipefail`. Also `:98-99` `continue-on-error: true` contradicts the `:96` comment "v2.1.21+: strict (continue-on-error: false)" — disagreement has persisted for 11 minor versions; set the value to match the comment (strict).
3. **ENH-416 — the 22 never-run files**: `tests/contract` (19) + `tests/unit` (3) never execute anywhere. `test/run-all.js:33` `const TEST_DIR = __dirname;` and the file references `tests/` **0 times** (perl-verified). Migrate the 22 files into `test/` (preferred; keeps one tree) or teach the runner about `tests/` — decision D3, default: migrate.
   **ERRATA-34-6 restatement (confirmed twice, binding)**: the prior claim "55 files outside runner+CI" is wrong. `qa-aggregate.js:20` includes `tests/qa` as `'qa-legacy'` (33 files, executed but non-gating → ENH-411's problem) and `contract-check.yml:84` runs `tests/qa/bkit-full-system.test.js` directly (gating). **34 of 55 execute; only 22 never do.** ENH-392's premise is restated accordingly: [22 never-run → ENH-416] + [33 run-but-non-gating → ENH-411].

4. **ENH-417 — sprint Stop hook reports a false completion** *(added 2026-08-08; reproduced live during this plan's own creation — same "false green" class as ENH-411 and ENH-412, which is why it belongs in S1)*:
   Running `/sprint master-plan v2133-defect-response` produced `✅ Sprint "v2133-defect-response" — report → archived` with a body rendered from `final-qa-i18n-docs-sync` (a sprint last touched 2026-06-02). Disk check: `.bkit/state/sprints/v2133-defect-response.json` **does not exist** — nothing was archived. Three compounding causes, all code-verified:
   - `scripts/sprint-skill-stop.js:141` `if (sprint && !sprintId) sprintId = sprint.id;` — when `sprintId` resolved from the marker but `loadSprint` returned null and the `:139` `latestActiveSprint()` fallback loaded a **different** sprint, the id is never corrected. So the `:182` header prints the *requested* id while the body (`summary`, `sprint.phase`) comes from the *fallback* sprint.
   - `scripts/sprint-skill-stop.js:46` `READONLY_ACTIONS = ['status','watch','list','help']` omits `master-plan`, which advances no sprint — so the fallback path fires for it at all.
   - Archiving never clears `status`: `latestActiveSprint` (`:96`) filters `s.status === 'active'`, but **6 of 7 sprint state files are `status:'active'` + `phase:'archived'`** (measured), so the fallback structurally returns a long-finished sprint.
   Fix scope: `sprint-skill-stop.js:46,138-141`; `status` transition in `lib/application/sprint-lifecycle/archive-sprint.usecase.js`; one-time migration of the 6 stale state files. Regression TC: when the requested id does not resolve, the hook must **not** render another sprint's summary under that id.

**Entry criteria**: sprint approved; branch `feat/v2.1.33-defect-response` checked out.
**Exit criteria**: (a) deliberate scratch failure → runner exit ≠ 0 AND CI job red (proof run, then reverted); (b) full suite green under gating; (c) flaky test fixed or quarantined-with-reason; (d) ERRATA-34-6 restatement recorded in the S1 report; (e) ENH-417 regression TC proves header/body can never disagree.
**Quality gates**: M2/M3/M5/M7 at `do`; M1 = 100 at `iterate`.
**Test impact**: this unit *is* the test impact; every later unit inherits gating.
**Rollback**: revert the workflow + runner commits; hidden-failure fixes are independently safe to keep.

---

#### S2 — `io-block-contract` + `bash-path-enforcement` (one work unit; shared file)

**Goal**: the Memory Enforcer deny path (differentiation #1) blocks for real and says *why*.

**F3 `io-block-contract` (ENH-410)** — do first within the unit:
- `lib/core/io.js:346` `outputBlock(reason)` takes **one** parameter; `scripts/unified-bash-pre.js:439` calls it with **three** (`'deny', reason, 'PreToolUse'`). The rich reason built at `:416-419` (directive text, `rule`, `source`, matched pattern, "Edit {source} or scope the command if intentional") is discarded. Fix: call the intended callee `outputBlockWithContext(reason, alternatives, hookEvent)` at `io.js:374`.
- Dead code cleanup (explicitly **not a security fix** — `io.js:343`'s comment states exit(0) is intended graceful deny): `unified-bash-pre.js:440` `blocked = true` unreachable; `pre-write.js:351` `process.exit(2)` unreachable — the latter is **deferred to S3** to avoid double-touching `pre-write.js` (§8 collision matrix).
- Replace test false positive: `test/integration/hook-wiring.test.js:141-144` (HW-014) is a source-text regex `/(?:block|deny|getBlockMessage|outputBlock|outputAllow)/` — cannot detect arity, reachability, or emitted JSON. Replace with a behavioral test: spawn the hook with fixture stdin, assert emitted JSON shape and reason content.
- Docs=Code origin note: `docs/sprint/v2114/sub-sprint-4-e-defense.report.md:111` specified a two-argument `outputBlock('deny', reason)` that never existed. Historical doc stays untouched (no retroactive edits); the correction is recorded in this sprint's report.

**F4 `bash-path-enforcement` (atomic bundle {ENH-388, 389, 390} + 393 — source report forbids splitting: "같은 코드 경로의 같은 결함")**:
- **388**: `scripts/unified-bash-pre.js:232-253` — never sets `blocked`, never calls `outputBlock*`, hardcodes `result:'blocked'` in the audit record at `:244`, and fires `incrementStat('destructiveBlocked')` at `:249` without blocking. Restore the actual block via the fixed `outputBlockWithContext`.
- **389** (main-session reproduced): `:236` passes `dd.detect('Bash', { command: toolInput.command })` — an **object** — while `lib/control/destructive-detector.js:131` JSDoc says `@param {string} toolInput` and `:135` falls back to `JSON.stringify(toolInput || '')`. Patterns match against `{"command":"…"}` — start-anchors broken, JSON escaping introduced. Pass the raw command string.
- **390**: `lib/defense/heredoc-detector.js:115-207,219` — delimiter regex is `\w+`; add path prefix / quote / backslash / wrapper-word (`command`, `nice`, `exec`) tolerance; `$VAR` interpreter → unknown-interpreter → critical; delimiter becomes `[^\s|;&<>]+`.
- **393**: audit `result` must reflect the actual outcome; `incrementStat('destructiveBlocked')` conditioned on a real block (source allows absorbing into 388 — absorbed here).
- **Orphan A (no ENH number)**: `unified-bash-pre.js:454-461` scope-limiter dead block (`sl` and `level` assigned, never referenced). Appears in no ENH target-file table. **Plan decision: fold explicitly into the ENH-388 work item** (same file, same unit); maintainer may alternatively assign candidate number ENH-419 (decision D4). *(417 is taken by the sprint Stop false-report defect, 418 by orphan B.)*

**Entry criteria**: S1 exit criteria met (gating live).
**Exit criteria**: behavioral tests prove (a) destructive command → emitted `{"decision":"block", …}` with the rich reason including `rule`/`source`; (b) detector receives a string; (c) heredoc evasion fixture set (path-prefixed, quoted, backslashed, wrapper-worded, `$VAR`) all detected; (d) audit `result` matches actual outcome; (e) legit-command corpus still allowed (false-positive guard). All tests placed under `test/` (never `tests/`).
**Quality gates**: M2/M3/M5/M7 at `do`; M1 at `iterate`; M3 = 0 at `qa`.
**Test impact**: HW-014 replaced; new behavioral + evasion suites under `test/integration/` and `test/security/`.
**Rollback**: single revert of the S2 commit restores prior (non-blocking) behavior — note that prior behavior is the defect; rollback is for emergency only.

---

#### S3 — `write-path-enforcement` (atomic bundle {ENH-398, 399, 400} + 401)

**Goal**: the Write deny path enforces; source report: "한 PR로 묶을 것. 부분 수정 시 우회 경로가 남는다" (single-branch translation: one indivisible work unit — partial fixes leave bypass routes).

- **398**: `scripts/pre-write.js` — only real block today is the Permission Manager at `:345-351`; destructive `:371-372`, blast `:373-374`, scope `:375-376` all `contextParts.push` → `:392-393 outputAllow`. Wire all three to the (now fixed) block path. Audit `result:'blocked'` hardcode at `:229` fixed alongside. Also complete the deferred ENH-410 dead code cleanup: `:351 process.exit(2)` unreachable.
- **399**: `lib/control/scope-limiter.js:151` computes `path.resolve()` but only uses it for the root-escape check at `:153`; `:168` re-derives the match string from the **raw** `filePath` — `..`, `./`, `//`, trailing slash, case all unnormalized. Match against the resolved, normalized path.
- **400**: `scope-limiter.js:20` `deniedPaths: ['.env*','*.key','*.pem','**/secrets/**','.git/**','node_modules/**']` — first three are root-anchored; subdirectories uncovered. De-anchor (e.g. `**/.env*`, `**/*.key`, `**/*.pem`) with tests proving subdirectory coverage.
- **401**: `test/security/scope-limiter.test.js:133-141` SL-014/015 assert only `r.allowed === false`, never the `rule` field (perl-verified across `test/security`) — a broken `*.pem` deny still passes. Add `rule` assertions + an evasion suite (`sub/dir/.env`, `a/../.env`, `./x.key`, `X.PEM` case, trailing slash, `//`). **Placement rule: `test/security/` — new files under `tests/` never run.**
- Upstream context (state, don't act): CC has the same defect class open (#84697, #84634, #84318) — **both layers are currently non-enforcing**, but they arose independently; a CC upgrade will not fix bkit's half. Applies at all levels L0–L4 (hook enforcement).

**Entry criteria**: S2 exit (fixed `outputBlockWithContext` contract available).
**Exit criteria**: evasion suite green; `rule` field asserted; deliberate `.env`-in-subdir write blocked with correct rule; legit-write corpus unaffected.
**Quality gates**: M2/M3/M5/M7 · M1 · M3=0.
**Test impact**: `test/security/scope-limiter.test.js` extended; new evasion suite.
**Rollback**: single revert; same emergency-only caveat as S2.

---

#### S4 — `plugin-data-isolation` (ENH-402 → 403 → 383, + 396)

**Goal**: stop cross-project backup clobbering (real disk damage observed in cycle #33: `~/.claude/plugins/data/bkit-bkit-marketplace/backup/meta.json` held `projectDir: …/tene-studio` while the `bkit-inline` slot held this repo).

- **402 (P0, first — collides with 403 at `paths.js:312-317`)**: `lib/core/paths.js:31-36` `pluginDataBackup()` = `path.join(pd, 'backup')` — no project segment; namespace is per plugin-install-id, not per project. Add a project-derived segment. **Design question (D5)**: migration/compat read for existing single-slot backups — migrate-on-first-touch vs ignore-legacy; default recommendation: read-fallback + write-new-path.
- **403**: `paths.js:312-317` single reason string `backup belongs to different project: X` misattributes cause — the guard only blocks a wrong *restore*; it cannot prevent the *overwrite*. Split into "guard refused (wrong-project restore)" vs "your backup was overwritten by another project".
- **383**: `lib/core/worktree-detector.js:58-84` message mentions only issue #46808; `paths.js:292-317` returns `skipped: [...]` with no surfacing path. Surface `skipped[]` to the user-visible layer; broaden the message.
- **396** (supersedes 387): register `WorktreeCreate` / `WorktreeRemove` hooks — perl-verified 0 occurrences repo-wide today. Design must first confirm the events exist in the CC version bkit runs against (measure via binary/docs probe, never assume).

**Entry criteria**: S3 exit.
**Exit criteria**: two projects sharing one plugin install no longer clobber each other's backups (integration test with two fixture project dirs); reason strings split; `skipped[]` surfaced; 396 hooks registered or explicitly deferred with probe evidence.
**Quality gates**: M2/M3/M5/M7 · M1 · M3=0.
**Test impact**: new integration fixtures for dual-project backup.
**Rollback**: revert restores old path scheme; migration fallback makes revert non-destructive.

---

#### S5 — `gate-numeric-hygiene` + `subagent-trust-boundary`

**F7 `gate-numeric-hygiene` (ENH-412)** — bkit's headline product claim (matchRate gate) must be decidable:
- `lib/infra/sprint/gap-detector.adapter.js:106` `matchRate: typeof parsed.matchRate === 'number' ? parsed.matchRate : 0` — no clamp; `typeof NaN === 'number'` is true. **Execution-proven**: NaN makes both `>=90` and `<90` false → gate **undecidable, not failing**; `999` passes unclamped. Fix: `Number.isFinite` guard + clamp to [0,100]; invalid input → explicit gate FAIL with logged reason (never silent 0, never undecidable).
- Same class at `lib/application/quality-gates/measure-router.js:308-328` — fix identically.
- Blast radius: `iterate-sprint.usecase.js` loop exit, `kpi.matchRate`, `qualityGates.M1_matchRate.passed`. Regression tests feed NaN / 999 / "85" (string) / undefined through both paths.

**F8 `subagent-trust-boundary` (ENH-413)** — prose layer only:
- Context: CC v2.1.225 added a third fail-open in the subagent handoff classifier (`refusedBySafeguard` 0→13, `UNREVIEWED` 0→1, undocumented in all 14 CHANGELOG bullets). CC's own text: the refusal "reacts to content in the subagent's own transcript (**which the subagent controls**)".
- **Structural limit (binding design constraint)**: CC delivers the warning as prose in the parent transcript, not a structured hook field → bkit hooks cannot observe or block it. **No hook-based mitigation will be planned.**
- Work: propagate the "reproduce a subagent's claim in the main session before adopting it" rule — today it exists only in `skills/cc-version-analysis/SKILL.md:197-236` and `agents/bkit-impact-analyst.md:125-134` — to the five orchestrators that actually dispatch subagents (`cto-lead` [18 `Task()` grants], `pm-lead`, `qa-lead`, `sprint-orchestrator`, `sprint-master-planner`) plus `skills/pdca`, `skills/sprint`, `.claude/CLAUDE.md` (all currently have **none** — verified).
- `scripts/subagent-stop-handler.js:56-59` `isSuccess` never inspects content and defaults TRUE — design evaluates a conservative content-aware check; if none is safe, record why and keep prose-layer only.
- **Honest tension (state in all downstream docs)**: this cannot be auto-enforced. A contract test can only assert the rule paragraph *exists* in each file — that is the ceiling, and the plan says so explicitly rather than implying enforcement.

**Entry criteria**: S4 exit. **Exit criteria**: NaN/999/string/undefined regression tests green in both numeric paths; rule paragraph present in all 8 target files with presence-asserting contract test; honest-tension wording included.
**Quality gates**: M2/M3/M5/M7 · M1 · M3=0. **Rollback**: both features independently revertible.

---

#### S6 — `session-ux-redesign` (user-driven, highest visibility)

**Goal**: implement the maintainer-chosen **redesign** — detect whether the user actually uses PDCA and drive all three behaviors from that — instead of three independent opt-outs. Re-opens Issue #77 (closed 2026-04-15; three forced behaviors reported, only the first partially addressed, all three still default-ON):

1. Session title overwrite — `lib/core/config.js:179` `ui.sessionTitle.enabled` default `true`
2. Session-start ASCII dashboard — `lib/core/config.js:184` `ui.dashboard.enabled` default `true`
3. UserPromptSubmit context injection — `lib/core/config.js:191` `ui.contextInjection.enabled` default `true`

**Reproduced root causes to fix regardless of the detection design** (behavior 1):
- **Ping-pong republish**: `lib/core/session-title-cache.js:190-197` `isSameAsCached` compares `rec.action === (action ?? null)`. Stop hooks (`pdca-skill-stop`, `plan-plus-stop`, `iterator-stop`, `gap-detector-stop`) publish with `action:'PLAN'|'ACT'|…`, but `scripts/user-prompt-handler.js:95,290` calls `generateSessionTitle({ sessionId })` with no action → `null`. Every alternation skill-stop ↔ user-prompt is a cache miss → republish.
- **bkit ignores CC's documented remedy**: CC docs `hooks.md:1039` verbatim — a hook that emits `sessionTitle` can check `session_title` first to avoid overwriting a user-set title. `session_title` is documented for **SessionStart** input (`hooks.md:1032`) and confirmed in the binary for **UserPromptSubmit** (`X8t()` builds `session_title: jT(Ft())`) but **NOT documented** for that event. **Perl absence proof: `session_title` appears 0 times across bkit `lib/`, `scripts/`, `hooks/`.**
- `hooks.md:1060`: SessionStart `sessionTitle` output applies on `startup`/`resume`/`fork`, **ignored** on `clear`/`compact`.
- CC tracks `customTitle` (user-set) separately from `aiTitle` (auto); priority `agentName || customTitle || aiTitle || summary || …`.

**Design tasks (in order)**:
1. **Empirical probe first (never guess)**: a scratch UserPromptSubmit hook dumps stdin to verify `session_title` presence/shape on this CC version before any code relies on it. Probe method + output recorded in the design doc.
2. PDCA-usage detector: define signals (e.g. PDCA state files under `.bkit/state/`, `docs/01-plan/` activity, recent pdca skill invocations), hysteresis, and the mapping detector → {title, dashboard, injection} enable state.
3. Respect `session_title`: if user set a title (customTitle present), never overwrite — at any automation level L0–L4.
4. Fix the ping-pong regardless of detection outcome (pass `action` through from `user-prompt-handler`, or make `isSameAsCached` action-insensitive for null).
5. **Constraint (binding)**: turning context injection off by default must NOT silently disable 8-language auto-detection, ambiguity detection, or PDCA state awareness **for PDCA users** — the detector must keep these alive where PDCA is in use.
6. Migration: this changes behavior for **all existing users** → CHANGELOG migration note + README/CUSTOMIZATION-GUIDE opt-in documentation (docs land in S7 sync, drafted here).

**Entry criteria**: S5 exit. **Exit criteria**: probe evidence recorded; detector designed + implemented + tested (PDCA-user fixture keeps all three; non-PDCA fixture gets none); no title overwrite when `session_title` set; ping-pong regression test (alternating stop/prompt → single publish); migration note drafted.
**Quality gates**: M4+M8 at `design` (M8 ≥ 85); M2/M3/M5/M7 · M1 · M3=0. **Rollback**: config defaults are one commit; revert restores current (forced) behavior.

---

#### S7 — `docs-privacy-sync` + `residual-p2-p3` (closing unit)

**F9 `docs-privacy-sync`**:
- **ENH-404 (P1)**: `PRIVACY.md:37` "Does not make network requests of any kind" vs `lib/infra/telemetry.js:11,27-28,153,193-198` opt-in OTLP HTTP POST. Also disclose CC's feedback-survey upload of CLAUDE.md/skill/agent/MCP tool definitions on consent. Rewrite truthfully.
- **ENH-397 (P3)**: `CUSTOMIZATION-GUIDE.md:1481` shows `decision:"allow"` — wrong guidance; correct it.
- **ENH-407 (P2)**: `agents/bkit-impact-analyst.md:70` says `mcp-servers/` but real directory is `servers/`; also automate the "19 tools" count check (script or contract test).
- **Requirement #8 doc-sync targets (all English)**: `README.md`, `CUSTOMIZATION-GUIDE.md`, `AI-NATIVE-DEVELOPMENT.md`, `CHANGELOG.md`, `bkit.config.json`, `.claude-plugin/`, `hooks/`, `bkit-system/` — synchronized with every change S1–S6 shipped, including the S6 migration note.
- **New finding (fold in, decision D6)**: the sprint master-plan generator itself writes `docs/01-plan/features/<id>.master-plan.md` with **no language suffix**, violating this repo's bilingual docs rule (this very sprint's skeleton was the instance). Decide: fix the generator to emit `.en.md`/`.ko.md` pair, or exempt generated planning docs. Default recommendation: fix the generator; also update `masterPlanPath` in the state schema accordingly.

**F10 `residual-p2-p3`**:
- **394** (supersedes 382): `lib/domain/guards/invariant-10-effort-aware.js:24` `Object.freeze(['low','medium','high'])` — missing CC's `xhigh`/`max`; out-of-range currently downgrades, should upgrade.
- **405**: `lib/core/constants.js:52` `MAX_TEAMMATES = 10`; `lib/team/state-writer.js:259-268` writes `droppedTeammates` that nothing reads (perl-verified); `removeTeammate` has zero production callers. Wire or remove.
- **406**: `lib/core/config.js:34,103` cache keys `bkit-config`/`bkit-full-config` not scoped by `PROJECT_DIR` — scope them. (Collision note: `config.js` also touched in S6 — S6 lands first; see §8.)
- **385**: `scripts/subagent-start-handler.js:91-96` comment lists 7 fields, missing `permission_mode` and `effort`; `test/contract/l2-smoke.test.js:74-75` injects `{"subagent_type":"cto-lead"}` but the real field is `agent_type` — fix both.
- **414**: `scripts/permission-request-handler.js:110,153-157` deny carries no reason field — add one.
- **415**: `test/helpers/mcp-client.js` `'2025-03-26'` vs both production servers `'2024-11-05'` — both in CC's supported negotiation list → zero runtime impact, pure hygiene; align.
- **395b (split from deferred 395)**: add the missing regression test asserting `RECOMMENDED_VERSION` (today `test/` asserts it 0 times) — the *hold* at 2.1.220 stays (§13), the *test* ships.
- **Orphan B**: cycle #30's `DirectoryAdded` hook registration lost its ENH number to ERRATA-31-5; perl-verified 0 occurrences. **Plan decision: assign candidate ENH-418, scope-check in S7 design; drop with recorded reason if CC-side support cannot be measured** (decision D7).

**Entry criteria**: S6 exit. **Exit criteria**: all doc-sync targets updated (English); PRIVACY.md truthful; residual items each closed or deferred-with-reason; CHANGELOG `## [2.1.33]` section complete (version heading maintainer-ordered — see header note).
**Quality gates**: M2/M3/M5/M7 · M1 · M3=0 · then report-phase M10/S2/S4 for the whole sprint.
**Rollback**: docs-only + independent small fixes; per-item revert.

### 3.3 Rough token budget (heuristic, not measurement)

| Unit | Estimate | Basis |
|------|----------|-------|
| S1 | ~60K | 22-file migration + workflow + 4 hidden-failure fixes |
| S2 | ~70K | 2 scripts + 2 lib modules + behavioral/evasion suites |
| S3 | ~60K | 1 script + 1 lib module + evasion suite |
| S4 | ~45K | paths/worktree + dual-project fixtures |
| S5 | ~35K | 2 small numeric fixes + 8-file prose propagation |
| S6 | ~70K | probe + detector design + cache/handler changes |
| S7 | ~55K | broad doc sync + 8 small residual items |
| **Total** | **~395K** | all units under the 100K default budget (`sprint.contextSizing.maxTokensPerSprint`) |

---

## 4. Sprint Phase Roadmap (per work unit)

| Phase | Activation | Output | Quality Gates |
|-------|-----------|--------|---------------|
| prd | unit start | PRD doc (S-unit scope from this plan §3.2) | M8 |
| plan | after PRD | Plan doc | M8 |
| design | after Plan | Design doc incl. codebase analysis + reproduction evidence | M4, M8 (≥85) |
| **do** | after Design + **explicit user approval (L2 gate)** | implementation | M2, M3, M5, M7 |
| iterate | matchRate < 100 | matchRate 100% | M1 (100%) |
| qa | after iterate | full-suite run under S1 gating + functional QA | M3 (=0), S1 (=100) |
| report | after qa | unit report + memory-file update (§12) | M10, S2, S4 |
| archived | after report | terminal per unit | - |

S1 interpretation note: this is a plugin-infrastructure sprint, not a web app — the 7-Layer dataFlowIntegrity check is interpreted as hook-chain flow (stdin → handler → lib → emitted JSON → CC behavior) per unit.

---

## 5. Quality Gates Activation Matrix

| Gate | prd | plan | design | do | iterate | qa | report |
|------|-----|------|--------|----|---------|----|--------|
| M1 matchRate (=100) | | | | | ✓ | | |
| M2 | | | | ✓ | | | |
| M3 criticalIssues (=0 at qa) | | | | ✓ | | ✓ | |
| M4 | | | ✓ | | | | |
| M5 | | | | ✓ | | | |
| M7 | | | | ✓ | | | |
| M8 designCompleteness (≥85) | ✓ | ✓ | ✓ | | | | |
| M10 | | | | | | | ✓ |
| S1 dataFlowIntegrity (=100, hook-chain interpretation) | | | | | | ✓ | |
| S2 | | | | | | | ✓ |
| S4 | | | | | | | ✓ |

Special to this sprint: after S1 lands, **the CI gate itself is a quality gate** — no unit may exit `qa` with a red `contract-check.yml`.

---

## 6. Success Metrics (5)

| # | Metric | Target | Measurement |
|---|--------|--------|-------------|
| 1 | matchRate (Design ↔ Code) per unit | 100% | gap-detector (post-ENH-412: NaN-safe, clamped) |
| 2 | criticalIssueCount | 0 | code-analyzer |
| 3 | Gating proof | deliberate failure → CI red (demonstrated in S1, kept true thereafter) | scratch failure run + revert |
| 4 | ENH ledger closure | 21/21 STILL-VALID closed or deferred-with-reason | §13 ledger vs S7 report |
| 5 | Functional QA (requirement #8) | full pass | `claude -p` scenarios with `--plugin-dir .` (§14) |

---

## 7. Auto-Pause Triggers (4 active)

| Trigger | Condition | User decision options |
|---------|-----------|----------------------|
| QUALITY_GATE_FAIL | M3 > 0 OR S1 < 100 | fix & resume / forward fix / abort |
| ITERATION_EXHAUSTED | iter ≥ 5 AND matchRate < 90 | forward fix / carry / abort |
| BUDGET_EXCEEDED | cumulativeTokens > budget | raise budget & resume / abort / archive |
| PHASE_TIMEOUT | phase time > config.phaseTimeoutHours | extend / force-advance / abort |

Post-ENH-412 note: matchRate comparisons in these triggers become NaN-safe only after S5; until then, treat any non-finite matchRate reading as QUALITY_GATE_FAIL manually.

---

## 8. File-Collision Matrix (single branch — collisions resolve by unit ordering)

| File | Touched by | Resolution |
|------|-----------|------------|
| `scripts/unified-bash-pre.js` | ENH-388, 389, 393, 410 (call site :439), orphan A (:454-461) | **One work unit (S2), one coherent change set** — never split across units |
| `scripts/pre-write.js` | ENH-398 (S3) + ENH-410 dead `process.exit(2)` :351 | 410's pre-write portion **deferred into S3** — file touched once |
| `lib/core/io.js` | ENH-410 (callee contract) | S2 only; S3 consumes the fixed contract, does not edit |
| `lib/core/paths.js` | ENH-402, 403 (both at :312-317), 383 (:292-317) | Sequential inside S4: **402 → 403 → 383** |
| `lib/core/config.js` | F1 ui defaults (:179,184,191 — S6) + ENH-406 cache keys (:34,103 — S7) | S6 before S7; S7 rebases on S6 state; disjoint line ranges but same file — verify no default-loading interplay in S7 design |
| `test/security/scope-limiter.test.js` | ENH-401 | S3 only |
| `test/integration/hook-wiring.test.js` | HW-014 replacement | S2 only |
| `.github/workflows/contract-check.yml` | ENH-411 (:74, :96-99) | S1 only |
| `CHANGELOG.md` / `README.md` / `CUSTOMIZATION-GUIDE.md` | S6 drafts migration note; S7 (F9) consolidates all doc sync | Final text lands once, in S7 |
| `scripts/user-prompt-handler.js` | F1 (:95, :290) | S6 only |

---

## 9. Risks & Mitigation (register)

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|------------|
| R1 | Enabling CI gating turns the build red immediately (hidden failures AL-007, TE-001/TE-025, flaky v2112 invariant are exposed the moment exit codes propagate) | Certain if misordered | High — blocks all later units | S1 internal ordering is binding: fix hidden failures **before** flipping any of ENH-411's three layers; flaky test fixed or quarantined-with-reason |
| R2 | Session-UX redesign changes behavior for **every existing user**; naive default-off silently kills 8-language detection / ambiguity detection / PDCA state awareness | High if designed carelessly | High — user trust | PDCA-usage detector keeps features alive for PDCA users (binding constraint S6-5); CHANGELOG migration note; README/CUSTOMIZATION-GUIDE opt-in docs; empirical probe before relying on undocumented `session_title` in UserPromptSubmit |
| R3 | Restoring real blocking (388/398) causes false positives on legitimate commands/writes | Medium | Medium-High — workflow breakage at all levels L0–L4 (hooks unconditional) | Legit-command/write allow-corpus tests in S2/S3 exit criteria; rich reason strings (post-410) tell users which rule/source fired and how to scope |
| R4 | Long-lived single branch drifts from `main` across multiple sessions | Medium | Medium | Minimal commits; rebase policy decided at each session start; rolling state in memory file (§12) |
| R5 | ENH-412 fix changes iterate-loop exit behavior (previously-undecidable gates start failing) | Medium | Medium | Regression tests over NaN/999/string/undefined; treat new failures as revealed truth, not regression — but audit each before accepting |
| R6 | Subagent trust boundary cannot be auto-enforced; stakeholders may assume it is | Medium | Medium — false security | Honest-tension wording mandatory in every artifact; contract test asserts only paragraph presence and says so |
| R7 | New tests placed under `tests/` silently never run | Medium (habit) | High — undoes S1 | Placement rule stated in every unit's exit criteria; S1 adds a runner-level check or removes `tests/` ambiguity entirely (D3) |
| R8 | AL-007 SoT decision (19 vs 29 vs 40) made unilaterally and wrong | Low | Medium | Maintainer decision D1 at S1 design gate; default recommendation documented, not assumed |
| R9 | Backup-path migration (402) breaks existing single-slot backups on revert or on old versions | Low | Medium | Read-fallback + write-new-path design (D5); revert non-destructive |
| R10 | `session_title` in UserPromptSubmit is binary-confirmed but undocumented — CC may change it without notice | Low-Medium | Medium | Probe at S6 design; degrade gracefully (absence → keep current behavior for that signal); note in design doc as an undocumented dependency |

---

## 10. Cross-Sprint Dependency (external)

- **Inputs**: cycle #33/#34 CC-version impact analysis ledger (ENH-388~416, ERRATA-34-6); Issue #77 history; maintainer directives (version v2.1.33, single branch, L2, redesign choice).
- **Outputs consumed downstream**: corrected ledger restatement (ERRATA-34-6) feeds the next cc-version-analysis cycle; the S1 gating infrastructure becomes the baseline for all future sprints; RECOMMENDED_VERSION hold rationale (§13) carries to the next cycle's re-evaluation.
- **Explicit non-dependency**: nothing in this sprint waits on a CC release; the CC-side twin defects (#84697/#84634/#84318, #84302/#84701/#84632) are tracked, not blocked on.

---

## 11. Approval Gates & Decisions (L2 protocol)

**Structural gates**:
1. **`do` entry, per work unit (L2 scope)** — auto-run halts after `design`; user approves before implementation starts. Applies to S1–S7 individually.
2. **PR merge to `main`** — explicit user approval required. After merge: git tag `v2.1.33` + **English** GitHub Release note with highlights and user-experience changes (session-UX redesign is the headline UX change; enforcement restoration and CI gating are the headline reliability changes).

**Maintainer decisions queued (resolve at the noted design gate — defaults are recommendations, not assumptions)**:

| ID | Decision | Gate | Default recommendation |
|----|----------|------|------------------------|
| D1 | ACTION_TYPES SoT: 19 (docs) vs 29 (test) vs 40 (live code) | S1 design | Code (40) is SoT; docs fixed in S7 |
| D2 | Trust default score: align test to shipped 40 or change shipped default | S1 design | Align test to shipped value |
| D3 | ENH-416: migrate 22 files into `test/` vs teach runner about `tests/` | S1 design | Migrate (one tree, kills R7 permanently) |
| D4 | Orphan A (`unified-bash-pre.js:454-461`): fold into ENH-388 vs assign ENH-419 | S2 design | Fold into 388 (same file, same unit) |
| D5 | ENH-402 backup migration: read-fallback vs ignore-legacy | S4 design | Read-fallback + write-new-path |
| D6 | Master-plan generator bilingual output: fix generator vs exempt generated docs | S7 design | Fix generator (emit `.en.md`/`.ko.md`) |
| D7 | Orphan B (`DirectoryAdded`): assign ENH-418 vs drop-with-reason | S7 design | Probe CC support first; assign if measurable |

---

## 12. Multi-Session Resumption Protocol

Rolling state lives in the agent memory file **`v2133-defect-response-progress.md`** (same pattern as `v2132-cc219-nesting-progress.md`).

**At every session end (or unit `report` phase)** update the memory file with:
- current unit (S1–S7) + phase + last commit hash on `feat/v2.1.33-defect-response`
- open maintainer decisions (D1–D7) and their status
- any newly measured facts (with measurement method — never guesses)
- next action, precise enough to resume cold

**At every session start**:
1. Read the memory file; 2. `git log --oneline -10` on the branch (git is authoritative over memory for code state); 3. re-read this master plan §3.2 for the current unit; 4. verify memory claims against the working tree before acting on them (a memory that names a file/line is a claim about the past, not the present).

Conflict rule: working tree > git history > memory file > this plan's snapshot-in-time statements.

---

## 13. Deferred / Out of Scope (do not re-litigate)

| Item | Status | Reason |
|------|--------|--------|
| **ENH-395a / 384** — raise `RECOMMENDED_VERSION` above `2.1.220` | **HELD (intended, not a defect)** | Cycles #33 and #34 both recommended holding: npm `stable` is exactly 2.1.220 (drift 0); v2.1.225 resolved 0 watch-list issues; raising imports the #84892 and #84925 regressions. |
| **ENH-395b** — regression test for `RECOMMENDED_VERSION` (currently 0 assertions) | **IN SCOPE → S7/F10** | The valid half of 395, split out. |
| **ENH-386** | Deferred | Re-evaluate only after 394 lands. |
| **ENH-408** | Deferred | Depends on unverified CC behavior — would violate "never guess". |
| **ENH-409** | Dropped | Per ledger. |
| SUPERSEDED | 381→391, 382→394, 384→395, 387→396 | Ledger. |
| NEEDS-RECHECK | 3 items | Re-measure before any future inclusion. |

Ledger snapshot: STILL-VALID 21 (P0 7 / P1 7 / P2 4 / P3 3), SUPERSEDED 4, NEEDS-RECHECK 3, DROPPED 1. Max shipped ENH = **380**; nothing in 381–416 has shipped as of this plan.

---

## 14. Definition of Done (release gate for v2.1.33)

1. All 21 STILL-VALID ENH items: closed with gating tests, or deferred with recorded reason (§13 updated).
2. **Gating proof**: a deliberate failure turns `node test/run-all.js` non-zero and CI red (demonstrated in S1; still true at release).
3. **Functional QA (requirement #8)**: full end-to-end pass via `claude -p` scenarios with `--plugin-dir .` covering: hook deny paths (bash + write, with rich reasons), backup isolation (dual project), session-UX detector (PDCA and non-PDCA fixtures), sprint gate numerics.
4. **Doc sync complete (all English)**: `README.md`, `CUSTOMIZATION-GUIDE.md`, `AI-NATIVE-DEVELOPMENT.md`, `CHANGELOG.md`, `bkit.config.json`, `.claude-plugin/`, `hooks/`, `bkit-system/` — including the session-UX migration note; PRIVACY.md truthful (ENH-404).
5. Language policy honored: code/comments/commits/PR English; new `docs/` files bilingual `.en.md`+`.ko.md` pairs; 8-language trigger keyword lists untouched.
6. Single branch `feat/v2.1.33-defect-response`, minimal commits; **PR merge to `main` explicitly approved by the user**; then tag `v2.1.33` + English GitHub Release note (highlights + user-experience changes).
7. Memory file `v2133-defect-response-progress.md` final state written (RELEASED marker), mirroring the v2.1.32 pattern.

---

## 15. Resume / Abort Flow

| Situation | Procedure |
|-----------|-----------|
| Resume after auto-pause | `/sprint resume v2133-defect-response` — verify pause cause resolved; re-read §12 protocol |
| Cold-start new session | §12 session-start sequence (memory → git → plan) |
| User abort | `/sprint archive v2133-defect-response` — terminal state; memory file records abort reason + last good commit |

---

## 16. Sprint Tracking (living document)

This master plan receives cumulative KPI updates during the sprint and history appends on phase transitions; on archive it becomes readonly. Unit-level status changes are mirrored in `.bkit/state/master-plans/v2133-defect-response.json` (`sprints[]`, `dependencyGraph` per §3.1). Known follow-up: the state JSON's `masterPlanPath` currently points at the suffix-less path — update alongside decision D6.

---

**Next Phase**: `prd` for work unit S1 (`proof-infrastructure`) — draft `docs/01-plan/features/v2133-defect-response.prd.{en,ko}.md` scoped from §3.2-S1, then auto-advance through `plan` and `design` under L2; halt for user approval before `do`.

> **Status**: Draft v1.0 — pending review.
