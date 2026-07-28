# CC v2.1.219 → v2.1.220 Impact Analysis Report (Cycle #30)

- **Analysis date**: 2026-07-28
- **Scope**: CC CLI v2.1.219, v2.1.220 (baseline v2.1.218 = cycle #29)
- **bkit version**: v2.1.31 (34 Agents / 44 Skills / 22 Hook Events / 346 test files)
- **Total change scope**: **28 bullets** (219 = 27, 220 = 1)
- **Breaking**: 0 · **Migration required**: none
- **Consecutive compatible releases**: **163** (v2.1.34 – v2.1.220)

---

## Executive Summary

CC v2.1.219 **reverses v2.1.217 outright**. v2.1.217 disabled nested subagent spawning
by default, and cycle #28 recorded that as upstream vindication of bkit's design.
v2.1.219 **restores nesting to depth 3 by default** and flips the env var to opt-out.

Three things make this reversal significant.

1. **The driving issue is still open.** #68110 ("General-purpose sub-agents recursively
   spawn unbounded child agents, causing exponential fan-out and massive token burn")
   was **updated 2026-07-21 and remains OPEN**. v2.1.219 was built three days later.
   CC restored, as the default, the exact behaviour an unresolved issue documents.
2. **The default is not pinnable by version.** Inspection of the installed binary shows
   the depth default resolves as `env var → remote feature gate tengu_hazel_trellis →
   hardcoded fallback 3`. The resolver function is literally named
   `getFeatureValue_CACHED_MAY_BE_STALE`. The effective nesting depth can therefore
   **change server-side with no CC release and no changelog entry**, and can differ
   between sessions on the same version.
3. **bkit declares two cyclic spawn paths.** Under depth 1 these were dead edges.
   They are now legal spawn chains.

The reversal also exposed that bkit's own guard against this has **never run**.
LB-003 (agent recursion, A→B→A, `action: abort`) was designed for precisely this
situation and has **zero production call sites**.

v2.1.220 is a separate matter. A 219→220 binary diff found four real differences
(build metadata, one telemetry field, one warning-string reword, one trailing period).
Every surface bkit integrates against is byte-identical.

### 4-Perspective Value Assessment

| Perspective | Assessment |
|---|---|
| **User** | Neutral-to-negative. Ten `model: opus` agents silently move to Opus 5 (1M) — a capability gain, but the cost profile changes. The team panel is already inaccurate (ENH-374 below) |
| **Developer (maintainer)** | Negative. Three doc sites now contradict reality (ENH-372), one guard is dead (ENH-373), one hook-contract mismatch confirmed (ENH-374) |
| **Architecture** | Mixed. bkit's "1-level sequential dispatch" is demoted from a **CC constraint** to a **bkit convention** — bkit must now enforce it itself |
| **Strategic** | Negative signal. The remote feature gate is a change vector where **version pinning does not pin behaviour** |

---

## §1. Version Range and Research Method

| Item | Value |
|---|---|
| Installed CC | 2.1.220 (native installer) |
| npm latest / stable | 2.1.220 / 2.1.212 |
| Previous baseline | 2.1.218 (cycle #29) |
| Analysis range | v2.1.219, v2.1.220 |

**Triple-sourced research**:
1. raw `CHANGELOG.md` (`curl` + `awk` section slice + `grep -cE "^- "`)
2. GitHub release tag body (`gh api repos/anthropics/claude-code/releases/tags/v*`)
3. **Direct inspection of the installed binary** (`~/.local/share/claude/versions/{218,219,220}`
   — a compiled Mach-O single file, but the JS bundle is embedded as plaintext, so zod
   schemas, defaults, and built-in doc strings are directly readable)

Source 3 is new this cycle and settled four items that documentation could not.

> **Limits of binary evidence**: implementation strings from the shipped artifact are
> stronger evidence for *what the code does* than docs are, but they are not an
> Anthropic-published contract. Field names and defaults may change without notice.

---

## §2. Change Catalogue

### 2.1 Category Distribution (GitHub release body, 27 bullets)

| Category | Count |
|---|---|
| Added | 9 |
| Fixed | 10 |
| Changed | 3 (+ #27 with no lead verb = 4 effective) |
| Improved | 2 |
| Removed / Updated | 1 / 1 |
| **Breaking** | **0** |

### 2.2 bkit-Intersecting Items (HIGH/MEDIUM)

| # | Bullet (abbrev.) | Impact | bkit verdict |
|---|---|---|---|
| 27 | Subagents nest to depth 3 by default (was 1); `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH=1` disables | **HIGH** | **Exposed — ENH-372/373/374** |
| 1 | Claude Opus 5 the default Opus model, 1M context, fast mode $10/$50 per Mtok | MEDIUM | Auto-benefit via aliases; no code change |
| 3 | New `DirectoryAdded` hook | MEDIUM | Not registered — ENH-377 (P3, parked) |
| 25 | Opus 4.7 removed from fast mode | LOW | Two stale comments |
| 8 | Error detail in `claude mcp list` / `/mcp` + whitespace warning | LOW | Diagnostic synergy; no action |

### 2.3 IMMUNE / Orthogonal (representative)

| # | Bullet | Justification |
|---|---|---|
| 2 | `sandbox.network.strictAllowlist` | Zero `sandbox` references in `.claude-plugin/`, `lib/`, `hooks/` |
| 5·21·24 | `workflowSizeGuideline` / dynamic workflow size | bkit does not use CC dynamic workflows (its own `lib/pdca/workflow-engine.js` is an unrelated YAML engine) |
| 22 | Managed MCP allowlist `${VAR}` resolution source | bkit's only `${VAR}` is `${CLAUDE_PLUGIN_ROOT}` in `plugin.json:23,28`, not a managed allowlist |
| 4 | headless stream-json `mcp_server_errors` | bkit ships servers via the plugin manifest; never `--mcp-config` |
| 6 | stream-json nested subagent forwarding | bkit does not consume stream-json |
| 9·11·12 | Three self-hosted-runner fixes | bkit ships no runner config |
| 13·14·17·18·23 | `/model` display, GNU screen, Vim, screen reader | TUI surface |
| 15·19 | Remote Control | Not used |
| 16 | `CLAUDE_CODE_GIT_BASH_PATH` (Windows) | bkit sets no such env var; hooks invoke `node` directly |
| 20 | `claude --teleport` | Not used |

---

## §3.0 Raw Source Verification Gate (Phase 1.5 — MANDATORY)

| Field | raw CHANGELOG.md | GitHub release body | Verdict |
|---|---|---|---|
| Added (219) | 8 | **9** | **errata** |
| Fixed (219) | 8 | **10** | **errata** |
| Improved (219) | 2 | 2 | match |
| Changed/Removed/Updated (219) | 6 | 6 | match |
| Breaking (219) | 0 | 0 | match |
| **Total (219)** | **24** | **27** | **errata** |
| Total (220) | 1 | 1 | match |

### ERRATA-30-1 — CHANGELOG.md is a proper subset of the GitHub release body

A sorted `comm` comparison found three bullets present only in the GitHub release body,
with an empty reverse difference:

- `Fixed a permission you approved while a self-hosted runner was restarting being dropped when the session resumed, so the approved action now runs`
- `Fixed a SIGTERM arriving while a self-hosted runner was starting up leaving a stale active row until the lease expired; it now deregisters cleanly`
- `Added structured failure categories to self-hosted runner spawn and session failures, so hook errors, runner crashes and config errors can be told apart`

**Rule change**: through cycle #29 the standing guidance was "raw CHANGELOG.md is
authoritative, raw wins." That is now overturned for the first time. All three omitted
bullets are self-hosted-runner items, which *suggests* CHANGELOG.md deliberately excludes
that category — but there is no evidence for the motive.
**Going forward: treat the union of both sources as the scope, and record the difference
as errata.**

### Verified Numeric Corrections

| Item | First claim | Re-measured | Source |
|---|---|---|---|
| Test file count | 291 | **346** | `find test tests -name "*.test.js"` — the first measurement missed the `tests/` directory |
| Last ENH number | 367 | **371** | repo-wide `grep -rhoE "ENH-[0-9]{3}"` (368 dual-floor / 369 MCP manifest / 370 Fable retune / 371 slash-path) |
| CC hook event total | 30 (official docs) | **31** | binary enum array read directly |

---

## §4. bkit Impact Analysis

### 4.1 C1 — Nested subagents default to depth 3 (headline)

#### (a) Edges brought back to life

Declarations that were dead under the depth-1 constraint are now executable.

| Entry point | depth 0 | depth 1 | depth 2 | depth 3 |
|---|---|---|---|---|
| `@cto-lead` | cto-lead | sprint-orchestrator | sprint-qa-flow | qa-monitor |
| `@cto-lead` | cto-lead | pm-lead | pm-discovery | — |
| `/sprint master-plan` | main | sprint-master-planner | pm-lead / cto-lead / qa-lead | pm-discovery etc. |

**Two declared cycles (measured)**:

| Cycle | Evidence |
|---|---|
| cto-lead ↔ sprint-master-planner | `agents/cto-lead.md:45` `Task(sprint-master-planner)` ↔ `agents/sprint-master-planner.md:27` `Task(cto-lead)` |
| pm-lead ↔ sprint-master-planner | `agents/pm-lead.md:28` ↔ `agents/sprint-master-planner.md:25` |

#### (b) Fan-out magnitude

cto-lead declares 18 `Task()` targets in frontmatter. Summing those 18 agents' own
`Task()` declarations gives 42 (sprint-orchestrator 7 / sprint-master-planner 7 /
pm-lead 6 / qa-lead 6 / qa-strategist 4, etc.). The worst-case reach of a single
`@cto-lead` invocation grows from 18 to **18 + 42 = 60 spawns at depth 2**, and is
unbounded at depth 3 given the cycles above.

At `maxTurns: 30–50`, `effort: high`, and Opus 5 at $10/$50 per Mtok, this is a genuine
cost event. CC's own bullet #21 (dynamic workflows default to "fewer than 15 agents")
is an acknowledgement of exactly this risk — but bkit does not use CC dynamic workflows,
so it receives **none** of that protection.

#### (c) The default is not pinnable by version

Resolution order confirmed in the binary:

```
CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH (env)
  → remote feature gate tengu_hazel_trellis (getFeatureValue_CACHED_MAY_BE_STALE)
    → hardcoded fallback 3
```

Independently verified: the `tengu_hazel_trellis` string is present,
`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` appears at 5 sites, and the limit message reads
verbatim:

> `Subagent nesting limit reached (depth ${m} of ${g}). Complete this task directly using your tools instead of spawning another agent. If the user explicitly requested deeper nesting, ask them to raise CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH.`

**Implication**: the changelog's "default 3" is the fallback, not necessarily the
effective value. Effective depth can change server-side without a release, and can
differ between sessions on the same version. **Setting the env var explicitly is the
only deterministic control.**

This is a change vector absent from the R-Series. Unlike R-1 (silent npm publish), the
artifact itself does not change, so **version pinning is not a defence**.

#### (d) Where bkit depended on nesting being blocked

**Three doc sites — Docs=Code violations as of v2.1.219**:

| Location | Current text |
|---|---|
| `agents/cto-lead.md:66-67` | "The Task() tools below work as 1-level subagents within this session (NOT nested spawn)." |
| `agents/cto-lead.md:69-71` | "When invoked as a subagent, Task() tools are **blocked by CC's nested spawn restriction**." |
| `agents/pm-lead.md:48,50` | "work as 1-level subagents." / "Task() tools are **blocked**." |
| `lib/orchestrator/team-protocol.js:43` | "Required for 1-level sub-agent Task tool spawn." |

Both agent sections are headed "CC v2.1.69+ Architecture Note" — 150 releases stale.

**The guard is dead**: LB-003 in `lib/control/loop-breaker.js` ("Agent recursion",
"A→B→A agent call pattern", `maxCount: 3`, `action: 'abort'`, `:55-60`) is the rule for
exactly this situation. However:

- `recordAction('agent_call', …)` has **zero production call sites**. Measurement shows
  production calls are only `'file_edit'` (`scripts/unified-write-post.js:230`) and
  `'bash_command'` (`scripts/unified-bash-post.js:102`); `'agent_call'` appears only in
  `test/unit/loop-breaker.test.js:71-72`.
- Incidental finding: `'bash_command'` is **not** among the `recordAction` switch cases
  (`:182-210` handles `pdca_iteration` / `file_edit` / `agent_call` / `error`), so that
  call is a **silent no-op**.
- `agentCallStack` is deliberately process-local (stated at `:18`). Each nested spawn is
  a separate hook process, so **even if wired, it could not observe cross-process
  recursion.** That design rationale was written while nesting was blocked; the depth-3
  default invalidates its premise.

**Sequential Dispatch (differentiator #3) is unaffected**:
`lib/orchestrator/sub-agent-dispatcher.js:9-18` targets #56293 (parallel-spawn prefix-cache
misses) — a **breadth** concern, orthogonal to depth. But the "only 1 level" premise is
now demoted from a CC constraint to a bkit convention.

### 4.2 C2 — SubagentStart hook-contract mismatch (newly confirmed)

The SubagentStart payload **construction site** was read directly from the binary:

```js
hook_event_name:"SubagentStart", agent_id:e, agent_type:t}
```

The shared base hook input (`session_id`, `transcript_path`, `cwd`, `prompt_id?`,
`permission_mode?`, `agent_id?`, `agent_type?`, `effort?`) is composed onto it.
**`agent_name`, `model`, `team_name`, and `tool_input` are not sent.**

Compared with what `scripts/subagent-start-handler.js` reads:

| Code | Field read | Actual consequence |
|---|---|---|
| `:56` | `agent_name` → `agentId` → `tool_input?.name` → `'unknown'` | `agent_name` absent → **falls through to `agentId`**. Roster name is an unreadable ID |
| `:66-71` | `model` → `tool_input?.model` → `'sonnet'` | **Always `'sonnet'`**. 18 of 34 agents misreported (opus 10 · fable 6 · haiku 2) |
| `:93-95` | `tool_input?.prompt` | `currentTask` always `null` |
| `:60-62` | `team_name` → `tool_input?.team_name` → `''` | Empty team name into `initAgentState` |

**Knock-on effect — the cap breaks deterministically**: because the key is the
instance-unique `agent_id`, the name-based dedup in `addTeammate`
(`lib/team/state-writer.js:204`) **never fires**. Under depth-3 fan-out (up to 60 spawns)
the `MAX_TEAMMATES = 10` cap (`state-writer.js:26`) is therefore reached deterministically,
and `:224-227` is `debugLog(...); return;` — a **silent drop with no user surface and no
audit entry**.

**Three-way constant inconsistency (measured)**:

| Location | Value |
|---|---|
| `lib/core/constants.js:52` | `MAX_TEAMMATES = 10` |
| `lib/team/state-writer.js:26` | `MAX_TEAMMATES = 10` — **redefined** rather than imported from constants.js |
| `bkit.config.json:211` / `:215-216` | `maxTeammates: 5` / Dynamic 3 · Enterprise 5 |
| `lib/team/coordinator.js:35,43` | default `4` |

**Race**: `writeAgentState` (`state-writer.js:97-148`) is **atomic per write** (tmp +
rename), but the read at `:197` and the write at `:231` are not serialized across
processes. Two concurrent nested SubagentStart hooks read the same roster, each appends
its own entry, and the last writer wins. By contrast
`lib/control/loop-breaker.js:14-15` explicitly uses "locked RMW so concurrent hook fires
never lose an increment" — the primitive exists; state-writer does not use it.

> **Residual unknown**: whether SubagentStart *fires at all* at depth 2+ cannot be settled
> from binary strings alone. What is settled is that the payload carries no depth or
> parent field — so **whether or not it fires, bkit cannot reconstruct the nesting tree.**
> A single run capturing the payload would resolve it.

### 4.3 C3 — Opus 5 becomes the default

**No impact on model pins.** All 34 bkit agents use aliases (`opus`/`sonnet`/`fable`/`haiku`),
and alias resolution is CC's responsibility. The only full model IDs anywhere in the repo
are `['claude-sonnet-4-6','claude-sonnet-4-5']` at
`lib/domain/guards/enh-264-token-threshold.js:22`, correctly scoped to sonnet
(`:20-21` states "Sonnet 5 intentionally excluded … No Guessing"). Opus 5 cannot trigger it.

**No context-budget assumptions exist.** The token modules
(`lib/pdca/token-report.js`, `lib/cc-regression/token-accountant.js`,
`lib/domain/ports/token-meter.port.js`) are **pass-through accounting** of CC-supplied
usage numbers and never assume a window size. bkit is structurally immune to the 1M shift.

**Binary confirmation — `claude-opus-5[1m]` is real**: the model-ID table contains both
`claude-opus-5` and `claude-opus-5[1m]`. `claude-mythos-5` also exists, distinct from
`claude-fable-5`. There is **no** `claude-opus-5-fast` (current-generation fast mode is an
API configuration, not a separate model). bkit uses aliases, so no action.

**`FABLE_MODEL_FLOOR = '2.1.170'` remains correct**: bullet #10 is a **display** bug
(stale cache baking in the "Requires usage credits" label), not an alias-availability change.

**Stale comments (LOW)**: `lib/domain/ports/token-meter.port.js:22` and
`lib/cc-regression/token-accountant.js:57,67` mention "Opus 4.7", which bullet #25 removed
from fast mode.

**Docs drift confirmed**: `lib/infra/cc-version-checker.js:47` holds
`RECOMMENDED_VERSION = '2.1.218'`, but
`docs/04-report/claude-model-alignment.report.ko.md:144,312` still documents
`RECOMMENDED=2.1.198`. That document is a record of a completed release and can be read as
a point-in-time snapshot — but `:144` sits inside a design-implementation match-rate table,
which is precisely the artifact Docs=Code scores against.

### 4.4 C4 — `DirectoryAdded` (schema settled)

zod schema read directly from the binary:

```js
S.object({
  hook_event_name: S.literal("DirectoryAdded"),
  directory: S.string(),   // absolute path of the directory that was added
  source: S.enum(["slash_command","register_repo_root"])
})
```

- **Matcher support confirmed**: `fieldToMatch:"source", values:["slash_command","register_repo_root"]`
  — unlike `CwdChanged` (no matcher support), this event can be scoped per source.
- **Cannot block**: it fires **after** the sandbox configuration is refreshed, so it cannot
  veto the registration. A non-zero exit only produces a debug log (plus, on the `/add-dir`
  path, a failure count and bounded `systemMessage` context).
- The companion SDK control request `register_repo_root` carries `reload_claude_md` /
  `reload_plugins` / `reload_skills` — an SDK host can force a plugin/skill reload mid-session.

**bkit coverage**: 22 of CC's 31 events = **71%**. The 9 unregistered events are
`PostToolBatch`, `PermissionDenied`, `Setup`, `Elicitation`, `ElicitationResult`,
`WorktreeCreate`, `WorktreeRemove`, `DirectoryAdded`, `MessageDisplay`.

### 4.5 v2.1.220 — Binary diff

| Item | Value |
|---|---|
| Size | 266,381,200 → 266,397,712 (**+16,512, +0.0062%**) |
| Sorted-unique strings | 227,059 → 227,423 |
| Real differences after filtering | **4** |

1. Build metadata (`VERSION` / `BUILD_TIME` / `GIT_SHA`; builds 18h53m apart)
2. New predicate `isEntitlementOverlayUnavailable()` adding an `entitlement_blind` field
   to two **existing** telemetry payloads. It terminates in a telemetry argument, not a
   control decision
3. One warning-string reword in the auto-mode permission classifier
   (`the bare retry succeeded` → `the retry without it succeeded`)
4. One trailing period in the `disableAllHooks` settings-schema description

**Every bkit-integrated surface is identical**: feature gates 1,754/1,754 · all zod markers ·
`hook_event_name` 13 · `DirectoryAdded` 30 · `SPAWN_DEPTH` 5 · `hookSpecificOutput` 40 ·
`mcpServers` 86 · `disableAllHooks` 14 · fork/background surface (`run_in_background` 32,
`isBackgroundAgent` 18).

> **Method limits**: pure control-flow changes with no string delta (**which covers most
> real bugfixes**), numeric *literal* value changes, data-only changes, and reordering are
> invisible. Confidence ≈95% on the named-surface negatives, ≈65% on the characterization.

---

## §5. ENH Roadmap (Phase 3 Brainstorming)

> ENH numbering starts at **ENH-372** per the measured correction (previous highest = ENH-371).
> This skill is **analysis-only** — every item below is a **proposal and is unimplemented**.

### 5.1 Intent Discovery

- **Maximum value available from this upgrade**: automatic Opus 5 benefit (zero cost) plus
  a settled `DirectoryAdded` schema (no future re-research needed)
- **The change not to miss**: bullet #27 — the combination of a reversed default, a remote
  gate, and an unresolved #68110
- **Native features replacing a workaround**: none

### 5.2 Alternative Exploration — ENH-373 (nesting containment)

| Option | Content | Assessment |
|---|---|---|
| **A** | Pin `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH=1` explicitly (docs + session notice) | **Recommended**. The only deterministic control; neutralizes the remote gate |
| B | Remove the two cyclic edges (drop `Task(cto-lead)` / `Task(pm-lead)` from sprint-master-planner) | **Recommended alongside A**. Blocks unbounded recursion even if A is not applied |
| C | Wire LB-003 (call `recordAction('agent_call')`) | **Insufficient alone**. Process-local, so it cannot observe nested recursion — would need a persisted counter first |
| D | No action (trust the CC default) | **Rejected**. The default is remotely mutable and therefore not a trustworthy anchor |

### 5.3 YAGNI Review

| Item | Actually needed? | Cost of not doing it | Will a future CC solve it? | Verdict |
|---|---|---|---|---|
| ENH-372 (doc correction) | ✅ | Misdirects users with a constraint that no longer exists | ❌ | **Pass** |
| ENH-373 (nesting containment) | ✅ | Two cycles + 60 spawns + a dead guard | ❌ (#68110 OPEN) | **Pass** |
| ENH-374 (hook contract) | ✅ | Wrong model display + silent cap drop | ❌ (bkit-side defect) | **Pass** |
| ENH-375 (constant inconsistency) | ⚠️ | Confusing; not an immediate failure | ❌ | Pass (low) |
| ENH-376 (positional args) | ⚠️ | No runtime caller today (latent) | ❌ | Pass (low) |
| ENH-377 (`DirectoryAdded`) | ❌ | bkit is not multi-root aware — would surface a problem it cannot act on | n/a | **P3 parked** |

> ENH-377's basis changed during this cycle: the original disqualifier was "schema
> unverified → No Guessing violation," which the binary inspection **removed**. The
> remaining disqualifier is pure YAGNI — bkit has no multi-root state precedence rule, so
> it could not act on the event.

### 5.4 Priority Assignment

| ENH | Priority | CC bullet | Content | Affected files |
|---|---|---|---|---|
| **ENH-372** | **P0** | #27 | Correct the three nested-spawn statements; re-anchor the "CC v2.1.69+" section headings | `agents/cto-lead.md:62-71`, `agents/pm-lead.md:44-51`, `lib/orchestrator/team-protocol.js:43` |
| **ENH-373** | **P0** | #27 | Options A+B together: pin the env var and remove the two cyclic edges | `agents/sprint-master-planner.md:25,27`, session notice (`hooks/startup/session-context.js`), docs |
| **ENH-374** | **P1** | #27 | Align to the SubagentStart contract: drop the four never-sent fields, display via `agent_type`, surface cap exhaustion | `scripts/subagent-start-handler.js:56,60-71,93-95`, `lib/team/state-writer.js:204,224-227` |
| **ENH-375** | P2 | — | Reconcile the three-way `MAX_TEAMMATES` inconsistency, single-source it in `constants.js`, apply locked RMW | `lib/team/state-writer.js:26,97-148`, `lib/core/constants.js:52`, `bkit.config.json:211` |
| **ENH-376** | P3 | — | `registerSpawn`'s positional call vs the `addTeammate(teammateInfo)` signature (latent) | `lib/orchestrator/team-protocol.js:76` |
| **ENH-377** | P3 | #3 | Register `DirectoryAdded` — **schema now settled; revisit once a multi-root rule exists** | `hooks/hooks.json`, `scripts/cwd-changed-handler.js` |

### 5.5 Philosophy Compliance

| ENH | Automation First | No Guessing | Docs=Code | Verdict |
|---|---|---|---|---|
| ENH-372 | Neutral | Pass (refuted by the changelog) | **Pass — this is the point** | Accept |
| ENH-373 | Pass (restores a guardrail) | Pass (binary evidence + #68110 OPEN) | Pass | Accept |
| ENH-374 | Pass (removes a silent drop) | Pass (payload construction site read directly) | Pass | Accept |
| ENH-375 | Neutral | Pass (measured three-way mismatch) | Pass | Accept (low) |
| ENH-376 | Neutral | Pass (signature verified) | Pass | Defer |
| ENH-377 | Neutral | **Pass (now resolved)** | Neutral | **P3 park — YAGNI** |

### 5.6 Test Impact (full suite = 346 files)

| ENH | Test impact |
|---|---|
| ENH-372 | `test/philosophy/docs-equals-code*.test.js` — confirm no assertion greps the "blocked" wording |
| ENH-373 | New L1: assert the absence of cyclic edges (frontmatter graph check). Fits `test/architecture/` |
| ENH-374 | Extend `test/contract/hook-input-schema.test.js` to lock the contract to fields CC actually sends. `test/unit/team-modules.test.js:148` currently asserts only `typeof` → needs real roster assertions |
| ENH-375 | New L2 concurrency test (two processes calling addTeammate simultaneously) |
| ENH-376 | Add roster-content assertions to `test/contract/orchestrator.test.js:85-86` |

---

## §6. Always-Tracked Items

| Item | Status | Evidence |
|---|---|---|
| **#58904 heredoc-pipe bypass** | **CLOSED / NOT_PLANNED** (2026-07-06) | Unfixed — bkit Layer-6 differentiator **streak intact, +2** |
| **#56293 parallel cache regression** | **CLOSED / NOT_PLANNED** (2026-06-02) | Unfixed — Sequential Dispatch differentiator **intact, +2** |
| **#57317 plugin hook drop** | **CLOSED / NOT_PLANNED** (2026-06-06) | Unfixed — remains ACTIVE |
| **#64436 background OTEL drop** | **OPEN** (2026-07-08) | bkit uses its own file ledger; no direct exposure, watch only |
| **#68110 recursive unbounded fan-out** | **OPEN** (2026-07-21) | **Escalated**. v2.1.219 (built 2026-07-24) restored the depth-3 default while this remained unresolved |
| **#78406 spawn-cap doc gap** | **OPEN** (2026-07-17) | CC docs still omit the env var → bkit cannot rely on docs |
| MF-2 (stale RECOMMENDED) | **Resolved** | Bumped `2.1.198` → `2.1.218` in v2.1.31. Current drift 2 |
| MF-3 (namespacing) | **RESOLVED (CC-native)** | No change |
| FORK-SKILL-BG-DEFAULT | **Resolved** | ENH-367 shipped in v2.1.31 — 8 fork skills carry `background: false`, `qa-phase` dropped `context: fork`. The 220 diff confirms the fork/background surface is unchanged |

### New Watch Items

| ID | Content |
|---|---|
| **REMOTE-GATE-DRIFT (new)** | Behaviour drift via remote feature gates (`tengu_hazel_trellis` et al.). A change vector **version pinning cannot defend against**. Consider a new R-Series class |
| **SUBAGENT-HOOK-CONTRACT (new)** | The `SubagentStart` payload is `{agent_id, agent_type}` plus base fields only. bkit depends on four never-sent fields (to be resolved by ENH-374) |
| **NEST-DEPTH-DEFAULT (new)** | CC's default nesting depth. Fallback 3 today, remotely mutable. ENH-373 makes it deterministic |

---

## §7. Conclusion

- **0 breaking changes, no migration.** Consecutive compatible releases: **163**
  (v2.1.34 – v2.1.220).
- **Recommended CC version: hold at `2.1.218` (no change).** The reason is not the
  original one (220's opacity) — the binary diff resolved that — but **ENH-373 being
  unaddressed**. Accepting 219 means accepting the depth-3 default, the remote gate, the
  two declared cycles, and a dead LB-003 together. Once ENH-373 lands, `2.1.220` becomes a
  clean target and drift improves from 6 to 2.
- `MIN_VERSION='2.1.78'`, `FABLE_MODEL_FLOOR='2.1.170'`, and
  `FEATURE_VERSIONS.contextFork='2.1.113'` all need no change.
- All three differentiator streaks (#56293 · #57317 · #58904) **extend +2** — none of the
  28 bullets is a code fix for them.
- **Candidate end to the 28-cycle 0-ENH streak**: ENH-372 is a pure factual correction with
  no behavioural risk, and ENH-373 rests on external evidence (an unresolved #68110 plus
  the remote gate). This skill is analysis-only, so **implementation belongs to a separate
  PDCA cycle**.

### The First Thing To Do (not an ENH)

**Capture one depth-2 `SubagentStart` payload.** Trigger a nested spawn once with
`BKIT_DEBUG` enabled to confirm (a) whether it fires at depth 2+ and (b) whether
`agent_name` / `model` are genuinely absent. That single experiment fixes ENH-374's scope
and quantifies ENH-373's urgency at the same time.

---

## Appendix A — Verification Commands (reproducible)

```bash
# Phase 1.5 dual source
curl -sL https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md -o cc.md
awk '/^## 2\.1\.219$/{f=1;next} /^## /{f=0} f' cc.md | grep -cE "^- "     # 24
gh api repos/anthropics/claude-code/releases/tags/v2.1.219 --jq '.body' \
  | grep -cE "^- "                                                        # 27

# Architecture measurement
ls -1 agents/*.md | wc -l                                                 # 34
ls -1d skills/*/ | wc -l                                                  # 44
find test tests -name "*.test.js" | wc -l                                 # 346
grep -rhoE "ENH-[0-9]{3}" --include="*.md" --include="*.js" . | sort -u | tail -1   # ENH-371

# Binary verification
BIN=~/.local/share/claude/versions/2.1.220
grep -aoE '\["PreToolUse","PostToolUse"[^]]{0,700}\]' "$BIN" | tr ',' '\n' | wc -l  # 31
grep -aoE 'hook_event_name:"SubagentStart"[^;]{0,300}' "$BIN"
grep -aoE 'fieldToMatch:"source",values:\["slash_command","register_repo_root"\]' "$BIN"
grep -ac "tengu_hazel_trellis" "$BIN"

# Always-tracked issues
for n in 58904 57317 64436 56293 68110 78406; do
  gh issue view $n --repo anthropics/claude-code \
    --json number,state,stateReason,updatedAt,title
done
```

> **Note on this machine**: `grep` resolves to `ugrep`, which imposes regex complexity
> limits that BSD/GNU grep does not. Wide `.{0,N}` context patterns should use `perl`
> (`index()` + `substr()`) instead of `grep -oE`.
