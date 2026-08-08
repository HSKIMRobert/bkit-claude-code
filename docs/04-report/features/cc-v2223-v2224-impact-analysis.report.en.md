# CC v2.1.223 → v2.1.224 Impact Analysis Report (Cycle #33)

- **Date**: 2026-08-07
- **Scope**: CC CLI v2.1.223 → v2.1.224 (single version, 31 bullets)
- **Nature**: Analysis-only. No repository code was modified
- **Prior cycle**: [cc-v2222-v2223-impact-analysis.report.en.md](./cc-v2222-v2223-impact-analysis.report.en.md)
- **ENH allocation**: ENH-398 – ENH-409 (ledger max measured at 380; 381–397 reserved)

---

## Executive Summary

v2.1.224 breaks no bkit runtime contract (**0 breaking changes**, consecutive-compatible streak **167**). But the value of this cycle is not the compatibility verdict — it is the **execution-verified finding that bkit once again shares a defect class CC just fixed**. This is the **second consecutive cycle** where that holds.

Two bullets pointed the investigation:

- **bullet 13** — "Fixed plugin install records being **silently corrupted** when the same plugin is installed in multiple projects"
- **bullet 10** — "Fixed sandbox filesystem deny entries written with a trailing slash … being **silently bypassable**"

Both directions found a same-class defect in bkit, **reproduced in the main session**. The bullet-13 counterpart is especially serious: it is not a hypothesis but **damage already observed on this machine's disk**.

### Four-Perspective Value Assessment

| Perspective | Verdict | Basis |
|---|---|---|
| **Compatibility** | ✅ Safe | Of 31 bullets, 0 break hook payload schema, frontmatter, MCP protocol, or plugin manifest. No migration needed |
| **Security / Integrity** | 🔴 **Own defects exposed** | G-1 (backup clobber, observed damage) and G-2 (path-deny unwired + unnormalized) are both CRITICAL. Both are **pre-existing** — not caused by 224 |
| **Opportunity** | 🟡 Limited | Cross-session `SendMessage`/`ListAgents` is real but its L4 interaction is unverified. `archive` source is YAGNI |
| **Upstream trust** | 🔴 Worse | **0 of 12** watched issues resolved by 224. PreToolUse defects grew from 1 to a **3-issue cluster**. **0 of 7** new features documented |

### Three-Line Headline

1. **bkit's plugin-data backups overwrite each other across projects, and it has already happened on this machine.** `~/.claude/plugins/data/bkit-bkit-marketplace/backup/meta.json` carries `projectDir: tene-studio` — any other project using that slot has permanently lost its backup, and on restore the user sees only a **cause-misleading** message ("backup belongs to a different project").
2. **bkit has no code path that actually enforces path-based denial for Write/Edit.** The scope verdict exits through `outputAllow` (`pre-write.js:393`), and the Bash-path scope block is **entirely dead code** (`unified-bash-pre.js:454-461`). This is the third instance of the same class as cycle #32's F-1.
3. **CC's docs still advertise a feature 224 removed.** `sub-agents.md:898` states "at most 200 subagents … **the limit can't be turned off**", yet the 224 binary deleted the counting machinery outright and `CLAUDE_CODE_MAX_SUBAGENTS_PER_SESSION` survives **only in an allowlist — a zombie env var**.

---

## §1. Version Range and Method

### 1.1 Triple Sourcing

| Source | Value | Method |
|---|---|---|
| raw CHANGELOG.md | v2.1.224 section = **31 bullets** | `curl -sL raw.githubusercontent.com/…/CHANGELOG.md` + mechanical `perl` extraction |
| GitHub release tag | Same 31 bullets, `published_at` 2026-08-07T04:00:59Z | `gh api repos/anthropics/claude-code/releases/tags/v2.1.224` |
| npm registry | `latest`=`next`=2.1.224, `stable`=**2.1.220** | `npm view @anthropic-ai/claude-code dist-tags --json` |
| Local binaries | 2.1.222 / 2.1.223 / **2.1.224** all present → direct diff possible | `ls ~/.local/share/claude/versions/` |

**Symmetric difference = 0** (raw CHANGELOG ↔ GH release body identical). ERRATA-30-1 satisfied.

### 1.2 npm Continuity

| Item | Value |
|---|---|
| Publish gaps | 220→221 **239.08h (9.96-day freeze)** · 221→222 22.35h · 222→223 26.23h · **223→224 26.76h** |
| npm publish | 2026-08-07T01:36:32.682Z (**2h24m ahead** of the GitHub release) |
| R-1 (silent publish) | **Negative** — tags and npm `time` match 1:1. A transient lead window existed for 224; now resolved |
| R-2 (semver skip) | **Negative** — v2.1.215–224 contiguous |
| stable drift | `stable`=2.1.220 vs `latest`=2.1.224 → **spread 4** |

**Reading the frozen `stable`**: 2.1.220 was the last release **before** the 9.96-day freeze. After the freeze lifted, 221–224 shipped daily but `stable` never moved. It reads as an intentionally held **"pre-freeze known-good anchor."** Circumstantial support: regression reports against 221 (#84521, Windows ECONNRESET) and 222 (#84182, #84530, #84452, worktree) remain OPEN.

---

## §2. Change Catalogue

### 2.1 Category Distribution (31 bullets)

| Category | Count | Notes |
|---|---|---|
| Added | 7 | self-hosted-runner, archive source, paste confirm, Bedrock region prefix, crossSessionInbound/dialogExpiry, sandbox credential-masking, cross-session SendMessage |
| Fixed | 15 | incl. Remote Control ×5, sandbox ×2, plugin ×1, session path ×1 |
| Improved | 3 | fullscreen scrollback, Remote Control ×2 |
| Removed | 1 | **200-subagent-per-session spawn cap** |
| Changed | 5 | managed settings, feedback-survey upload scope, Bash description, paste renumber, Remote Control archive |
| `[VSCode]`-tagged | 2 | Included above. **Not contiguous** (ERRATA-33-1) |

> **Structural caution (ERRATA-33-1)**: The v2.1.224 CHANGELOG section has **no `### Added` / `### Fixed` subheadings.** It is a single flat bullet list; the categories above are derived from each bullet's **leading verb**. Writing "per the CHANGELOG's Added section" would fabricate structure.

### 2.2 bkit Intersections (9)

| # | Bullet | bkit surface | Verdict |
|---|---|---|---|
| 13 | plugin install records silently corrupted across projects | `lib/core/paths.js` backup layer | 🔴 **same-class own defect (G-1)** |
| 10 | sandbox deny trailing-slash silent bypass | `lib/control/scope-limiter.js`, `scripts/pre-write.js` | 🔴 **same-class own defect (G-2)** |
| R1 | 200-subagent spawn cap removed | `lib/core/constants.js:52` MAX_TEAMMATES=10 | 🟡 roster overflow exposure (G-5) |
| 5·7 | crossSessionInbound / cross-session SendMessage·ListAgents | L4 Full-Auto, `lib/orchestrator/team-protocol.js` | 🟡 opportunity + unverified risk |
| 12 | mid-turn MCP tool names announced | `servers/bkit-*-server/index.js` | 🟢 automatic gain |
| 8 | >200-char paths crossing session dirs | `.bkit/**` path lengths | 🟢 no impact (max measured 175) |
| 11 | sandbox violation detail in Bash results | `lib/core/io.js` hook output protocol | 🟢 different layer, no conflict |
| 2 | archive plugin source + SHA-256 pinning | `.claude-plugin/marketplace.json` | ⚪ YAGNI (DROP) |
| C(survey) | feedback-survey uploads system prompt + tool defs | `PRIVACY.md` | 🟡 disclosure needed |

### 2.3 Orthogonal / No Impact (22)

Remote Control ×8, paste ×3, Wayland clipboard, survey transmission, VSCode ×2, managed settings, Bedrock region prefix, self-hosted-runner, fullscreen scrollback. bkit operates only at the CLI/hook layer and does not intersect the remote/TUI/IDE surfaces.

### 2.4 Undocumented Subsystem Work (binary-only)

| Observation | 223 → 224 | Belongs to |
|---|---|---|
| `fail-open` literal | 7 → 13 | **all sandbox credential-masking** (bullet 6 — not a separate item) |
| `SIGKILL` near "hook" | 0 → 5 | **all self-hosted-runner** (checkout / post-session / spawn-runner hooks) |
| `hookTimeout` | 0 → 7 | **all self-hosted-runner** CLI flags |
| `self-hosted-runner` | 0 → 64 | new large subsystem |
| unique `tengu_*` gates | **1770 → 1801 (+31)** | mixed |
| `per-session` | 15 → 30 | mixed |

> **ERRATA-33-4 (new, process)**: Much of 224's string delta is **absorbed by self-hosted-runner, a large new subsystem**. During this analysis the `fail-open` increase and the appearance of hook-adjacent `SIGKILL` were each hypothesized as "undocumented hook-reliability work" and **both were retracted** after context extraction. Delta-based inference must be adopted **only after neighborhood confirmation**.

---

## §3.0 Raw Source Verification Gate (Phase 1.5 — MANDATORY)

### 3.0.1 Verification Table

| Field | Agent reported | Raw verified | Source | Verdict |
|---|---|---|---|---|
| Added | 7 | 7 | raw CHANGELOG (verb-derived) | ✅ match |
| Fixed | 15 | 15 | raw CHANGELOG | ✅ match |
| Improved | 3 | 3 | raw CHANGELOG | ✅ match |
| Removed | 1 | 1 | raw CHANGELOG | ✅ match |
| Changed | 5 | 5 | raw CHANGELOG | ✅ match |
| **Total bullets** | **31** | **31** | sum + `wc -l` | ✅ match |
| raw ↔ GH release | — | symmetric diff **0** | `diff <(sort raw) <(sort gh)` | ✅ match |

The main session fixed the bullet total **first** and supplied it to the research agent as a premise, so no count errata arose this cycle.

### 3.0.2 ERRATA-33-1 (new) — the CHANGELOG has no subheadings

See §2.1. Additionally the two `[VSCode]` bullets are **not contiguous** — an untagged bullet sits between them, so "slice the last two" logic misfires.

### 3.0.3 ERRATA-33-2 (new, HIGH) — `gh issue list --limit` truncates silently

Measured:

```
gh api -X GET search/issues -f q='repo:anthropics/claude-code created:2026-08-05..2026-08-08' -f per_page=1 --jq '.total_count'
→ 727

gh issue list --repo anthropics/claude-code --limit 300 --search 'created:2026-08-05..2026-08-08' --json number | (length)
→ 300
```

**It cuts off at 300 with no warning.** Window totals must come from `search/issues` `total_count` or `--paginate`. Cycle #32's "997 issues in window" may have been produced the same way and is flagged for **re-verification**.

### 3.0.4 ERRATA-33-3 (new) — `gh search issues` AND-joins unquoted tokens

A search for `subagent spawn limit` returns 0 results even though **#78406 is exactly that topic**. A 0-result multi-word query is **not proof of absence**. Re-query with a single token or a quoted phrase before claiming absence.

### 3.0.5 ERRATA-33-4 (new, process) — confirm neighborhood before delta inference

See §2.4.

### 3.0.6 ERRATA-33-5 (new, HIGH) — subagent CRITICAL claim omitted the automation-level context

bkit-impact-analyst presented `src/.env` → `allowed:true` as **"the simplest demonstration input, no evasion technique needed"** without stating the automation level. Main-session reproduction:

```
=== L0 ===                                  === L4 ===
src/.env            allowed=false            src/.env            allowed=true
src/config/.env.production  false            src/config/.env.production  true
src/server.key      false                    src/server.key      true
lib/keys/private.pem false                   lib/keys/private.pem true
src/.ENV            false                    src/.ENV            true
src//../.env        false                    src//../.env        true
src/../.git/config  false                    src/../.git/config  true
docs/../.env        **true**                 docs/../.env        **true**
.env                false (DENIED_PATH)      .env                false (DENIED_PATH)
```

**At L0 the allowlist (`NOT_IN_SCOPE`) incidentally blocks most of them.** Of the inputs the agent cited as "even L0 is bypassed," only **`docs/../.env`** actually is. The defect is real but the **description was overstated**. Future scope/permission claims must **state the automation level**. (Restatement in §4.1 — the CRITICAL verdict stands.)

### 3.0.7 ERRATA-33-6 (new) — the CHANGELOG paraphrases the implementation

Bullet: *"Changed the Bash tool description to always note that command output is displayed **to the model**, not reliably to the user"*

Measured: that sentence is **byte-identical** in 223 and 224, and its wording is **`to you`**, not `to the model`.

```
2.1.223: "Command output is displayed to you, not reliably to the user."  (3×, inside a ternary)
2.1.224: "Command output is displayed to you, not reliably to the user."  (2×, unconditional)
```

The real change is **not a wording edit but conditional → unconditional insertion (gating removed)**. Recorded as observation only.

---

## §4. bkit Impact Analysis

### 4.1 G-2 — path-based denial enforces nothing (**CRITICAL, reproduced**)

CC bullet 10 fixed "deny entries with a trailing slash are silently bypassable." Measuring bkit showed the trailing slash is **only part of the problem**.

#### (a) The verdict exits through `outputAllow` — no blocking wiring

`scripts/pre-write.js` (confirmed directly in the main session):

```
336:     outputEmpty();
350:     outputBlock(perm.denyReason);
351:     process.exit(2);
393:     outputAllow(contextParts.join(' | '), 'PreToolUse');
```

`outputBlock` + `exit(2)` exist **only at 350–351**, on the Permission Manager deny path. The scope verdict (`:376`) and destructive verdict (`:372`) are pushed into `contextParts` as **advisory text** and emitted **alongside allow** at 393. This is the **third instance** of the class first seen as cycle #32's F-1.

#### (b) The Bash-path scope block is entirely dead code

`scripts/unified-bash-pre.js:451-461` (confirmed directly):

```js
// ============================================================
// v2.0.0: Scope Limiter (Control Module)
// ============================================================
if (!blocked) {
  try {
    const sl = require('../lib/control/scope-limiter');
    const ac = require('../lib/control/automation-controller');
    const level = ac.getCurrentLevel();
    // Scope check available for path-targeting commands
  } catch (_) {}
}
```

`sl` and `level` are assigned and **never referenced again**. The comment reads "Scope check available," giving a reader the impression a defense exists.

#### (c) Missing normalization — `docs/../.env` passes **even at L0**

`lib/control/scope-limiter.js` computes `path.resolve()` at `:151` but uses it only for the root-escape check, then at `:168` **re-derives the match string from the raw input**. So `..`, `./`, `//`, and trailing slashes are never normalized.

Reproduction:

```
L0: {"input":"docs/../.env","allowed":true,"rule":null}
L4: {"input":"docs/../.env","allowed":true,"rule":null}
```

`docs/` is on the allowlist, so the prefix match succeeds and the fact that the real target is the root `.env` is never checked. **The strictest level is bypassed.**

Why existing tests missed it: `test/security/path-traversal.test.js:43,75` only covers `docs/../../.env` (two levels up, **outside** the root), which `PATH_TRAVERSAL` catches. The **one-level `docs/../.env` that lands back inside the root is untested**.

#### (d) Deny patterns are root-anchored — **L4 only**

`DEFAULT_SCOPE.deniedPaths` entries `.env*`, `*.key`, `*.pem` compile to `[^/]*` in `_globMatch` and cannot cross a slash.

```
L4: src/.env → allowed=true      |  root .env → allowed=false (DENIED_PATH)
L4: lib/keys/private.pem → true  |  root private.pem → false (DENIED_PATH)
```

**At L0–L3 the narrow allowlist blocks these incidentally via `NOT_IN_SCOPE`** (ERRATA-33-5). But **at L4 the allowlist is effectively permit-all, leaving deny patterns as the only defense** — and being root-anchored, they let every secret file in a subdirectory through. Since bkit markets L4 as "Full-Auto," this gap is material.

#### (e) Permission Manager cannot substitute

`DEFAULT_PERMISSIONS` in `lib/permission-manager.js` sets `Write: 'allow'`, `Edit: 'allow'`, with **zero** `.env`/`.pem`/`.key`/`secrets` path logic. Since `context-hierarchy.js` was removed, `checkPermission` always falls back to this table.

#### (f) The audit ledger is polluted again

`scripts/pre-write.js:216-236` hardcodes `action:'destructive_blocked'`, `result:'blocked'` for operations that are in fact allowed. Cycle #32's F-5 (audit hardcoding) exists on the **Write path as well as Bash**.

#### (g) Tests provide false assurance

`test/security/scope-limiter.test.js` SL-015 asserts `certs/private.pem` is `allowed===false` at L4. The actual return carries `rule:"NOT_IN_SCOPE"` — false because it is not on the allowlist, **not** because the `*.pem` deny fired. The test never inspects `rule`, so **the suite stays green even if `*.pem` deny breaks completely**.

> **Verdict: CRITICAL.** Restated precisely per §3.0.6: *at L4, secret files in subdirectories pass wholesale; at every level, a one-level traversal through an allowlisted prefix (`docs/../.env`) passes; and at no level is the scope verdict wired to blocking in the first place.*

### 4.2 G-1 — plugin-data backups clobber each other across projects (**CRITICAL, damage observed**)

CC bullet 13 fixed silent corruption of install records when one plugin is installed in multiple projects. bkit has **exactly the same defect in its own backup layer**.

#### (a) No project segment in the path

`lib/core/paths.js:31-36` (confirmed directly):

```js
// v1.6.2: ${CLAUDE_PLUGIN_DATA} persistent backup (ENH-119)
pluginData: () => process.env.CLAUDE_PLUGIN_DATA || null,
pluginDataBackup: () => {
  const pd = process.env.CLAUDE_PLUGIN_DATA;
  return pd ? path.join(pd, 'backup') : null;
},
```

Backup filenames are fixed too (`pdca-status.backup.json`, `memory.backup.json`). **Every project using the same plugin installation shares one slot.**

#### (b) It has already happened on this machine — observed evidence

The analysis agent could not observe `CLAUDE_PLUGIN_DATA` at runtime and left this as "unverified, priority 1." The main session checked the disk directly:

```
/Users/kaykim/.claude/plugins/data/bkit-bkit-marketplace/backup/meta.json
{ "projectDir": "/Users/kaykim/Documents/GitHub/agent-kay-it/tene-studio",
  "timestamp": "2026-08-07T02:50:37.871Z", "bkitVersion": "2.1.32" }

/Users/kaykim/.claude/plugins/data/bkit-inline/backup/meta.json
{ "projectDir": "/Users/kaykim/Documents/GitHub/agent-kay-it/bkit-claude-code",
  "timestamp": "2026-08-07T04:40:07.952Z", "bkitVersion": "2.1.32" }
```

- Namespacing is **per plugin installation** (`bkit-bkit-marketplace` / `bkit-inline`), **not per project**.
- The `bkit-bkit-marketplace` slot is currently held by **tene-studio**. Any other project that used that slot has **already lost its backup**.
- `pdca-status.backup.json` sizes (6,924 vs 29,235 bytes) confirm these are different projects' state.

#### (c) The guard prevents wrong restores, not overwrites

`restoreFromPluginData()` (`:292-317`) skips restore when `meta.projectDir` differs (#48, v2.0.1). That guard **stops contamination but not data loss**. Worse, the message the user sees is:

```
skipped: ["backup belongs to different project: /Users/.../tene-studio"]
```

The truth is *"your backup was overwritten by another project,"* but the message says *"this backup was always someone else's"* → **cause misattribution**.

`backupToPluginData()` is invoked automatically on **every `savePdcaStatus()` and memory write** from `lib/pdca/status-core.js`, so this occurs continuously the moment two projects are worked in parallel.

#### (d) ENH-383's model needs recomputation

ENH-383 (unshipped; 0 CHANGELOG hits by `perl`) models the fork/worktree "state void" as a **guard rejection**. There are actually two causes, and they emit the **same message**:

| Cause | Message shown | ENH-383 model |
|---|---|---|
| worktree realpath mismatch | `backup belongs to different project` | ✅ covered |
| **another project overwrote the backup** | `backup belongs to different project` (identical!) | ❌ not covered |

Implementing the detector as specified would **misattribute**.

> **Verdict: CRITICAL** (raised from the agent's HIGH). Rationale: this is not a hypothesis but **observed data loss on this machine**, and the trigger — "use bkit in two projects" — is an everyday condition.

### 4.3 G-5 — spawn-cap removal is roster-overflow exposure, not opportunity

bkit never depended on the cap (absence proof: `totalSpawned|spawnedCount|MAX_AGENTS|MAX_SPAWN|spawnCount` → 0 hits across `lib/` and `scripts/`). Moat #3 (Sequential Dispatch) is count-agnostic — `sub-agent-dispatcher.js` returns a **strategy** with no count ceiling — so the streak is **unaffected**.

The real exposure is elsewhere:

- `MAX_TEAMMATES = 10` (`lib/core/constants.js:52`, enforced in `lib/team/state-writer.js:259-268`)
- `removeTeammate` has **zero production callers** — the roster grows monotonically until `cleanupAgentState()` at Stop
- `agents/cto-lead.md` declares **18** `Task()` targets

Cap removal plus the v2.1.219 depth-3 default makes >10 spawns per turn realistic. Spawns still succeed; **bkit merely loses the record** (`droppedTeammates` rises), so dashboards and team state drift from reality. Not blocking → **P2**.

### 4.4 CC-side defects: a zombie env var and an active doc/impl contradiction

Main-session binary measurement (exact literal counts, 223 vs 224):

| Symbol | 223 | 224 | Meaning |
|---|---|---|---|
| `spawn limit` | 4 | **0** | error message deleted |
| `getTotalAgentSpawns` | 7 | **0** | counter read deleted |
| `incrementTotalAgentSpawns` | 8 | **0** | counter increment deleted |
| `subagent_count_cap` | 2 | **0** | telemetry event deleted |
| `forked_skill_spawn_cap` | 3 | **0** | deleted |
| `forked_skill_depth_chain_cap` | 3 | **0** | deleted |
| `forked_skill_depth_cap` | 2 | **2** | **depth limit retained** (matches the CHANGELOG claim) |
| `CLAUDE_CODE_MAX_SUBAGENTS_PER_SESSION` | 8 | **3** | **all 3 survivors are env-var allowlists** |

Context extraction shows all three survivors sit inside recognized-env-var lists such as `["CLAUDE_CODE_MAX_RETRIES","CLAUDE_CODE_MAX_SUBAGENTS_PER_SESSION","CLAUDE_CODE_MAX_TOOL_USE_CONCURRENCY",…]`, with **zero consuming logic**.

→ **Zombie env var**: setting it does nothing, and CC silently accepts it as a known setting without warning.

Meanwhile upstream docs still advertise the removed feature (`curl -sL code.claude.com/docs/en/sub-agents.md`):

```
898: By default, Claude can spawn at most 200 subagents per session. To raise the limit,
     set `CLAUDE_CODE_MAX_SUBAGENTS_PER_SESSION` to any positive whole number;
     there is no upper bound, but the limit can't be turned off. Requires v2.1.212 or later.
902: When Claude reaches the limit, the Agent tool fails with `Subagent spawn limit reached`…
```

The docs go so far as to assert the limit **cannot be turned off**, while 224 deleted the machinery entirely. This changes the character of watched issue **#78406** — no longer a documentation omission but an **active contradiction where stale docs instruct users toward a feature that no longer exists**.

### 4.5 Upstream: PreToolUse defects grew into a 3-issue cluster

**v2.1.224 resolved 0 of the 12 watched issues.**

| # | Title (abbrev.) | State | Fixed by 224? |
|---|---|---|---|
| **84302** | Killed PreToolUse command hook makes the CLI fail-open ALLOW | OPEN | ❌ |
| **84701** | PreToolUse **deny not enforced for Bash issued by Task subagents** | OPEN (new) | ❌ |
| **84632** | **`if`-scoped hook fires unconditionally and does not block**; reports stale "blocked" a turn late | OPEN (new) | ❌ |
| 84656 | `[DOCS]` PreToolUse timeout / spawn-failure outcomes unstated | OPEN (new) | ❌ |
| 84258 / 83953 / 84027 / 84452 | worktree family ×4 | OPEN | ❌ |
| 84217 / 84439 / 79560 / 83848 / 68110 / 78406 / 64436 | existing watch list | OPEN | ❌ |
| 84135 | worktree refuses Bash with env-var interpolation | CLOSED / **NOT_PLANNED** | ❌ **not a fix** — reporter self-closed after a triage timeout; content survives as OPEN **#84452** |

**#84632 touches bkit directly.** Main-session reproduction:

```
$ perl -ne 'print "$.: $_" if /"if"\s*:/' hooks/hooks.json
30:             "if": "Write(skills/**/SKILL.md)"
286:            "if": "Write|Edit(docs/**/*.md)",
```

bkit uses exactly **two** `if`-scoped hooks. If the upstream bug holds, these fire outside their scope, fail to block, and report a turn-late "blocked."

Additionally, `hooks.md` contains **no statement at all** about whether a PreToolUse command hook that hits its timeout blocks or allows the tool. The only such statement covers the Agent SDK callback path (`:1473`), while the control case `UserPromptSubmit` does have one (`:1229`). → **For every configuration using PreToolUse as a security gate (i.e. all of bkit's defenses), the behavior when a hook hangs or dies is undefined in the documentation.**

### 4.6 CC Hook Event Coverage (unchanged)

- CC hook events **31** (triple cross-checked in docs), bkit registers **22** → **70.97% unchanged**
- 9 unregistered: WorktreeCreate, WorktreeRemove, PostToolBatch, PermissionDenied, Setup, Elicitation, ElicitationResult, DirectoryAdded, MessageDisplay — all documented as real
- `BackgroundTaskProgress` appears **0×** in both binaries and 0× in docs → **still does not exist** (re-confirming it was fabricated in an earlier analysis)
- Of 25 spot-checked literals, only `PostToolUse` 41→42 and `SessionStart` 25→26 moved → **no new events**

### 4.7 RECOMMENDED_VERSION — agents disagreed; main-session ruling: **hold**

| Party | Recommendation | Basis |
|---|---|---|
| cc-version-researcher | **Hold** | `RECOMMENDED_VERSION='2.1.220'` equals npm `stable` → **drift 0**. Raising it would outrun upstream stable |
| bkit-impact-analyst | Raise to 2.1.224 | Bullets 10 and 13 are defense/integrity improvements with no regression on bkit's integration surface |

**Ruling: hold (research side adopted).** Rationale:

1. npm `stable` has been pinned to 2.1.220 for **four versions**, reading as the pre-freeze known-good anchor.
2. Regression reports against 221/222 remain **OPEN** (#84521, #84182, #84530, #84452).
3. 224 resolved **0** watched bkit issues.
4. All bkit defenses live in PreToolUse, and **#84302, #84701, #84632 are all OPEN**.

→ Cycle #32's **ENH-395 (raise to 2.1.223) should also be held**. bkit's conservative recommendation coinciding exactly with upstream `stable` is correct alignment, not coincidence.

---

## §5. ENH Roadmap (Phase 3 Brainstorming)

### 5.1 Intent Discovery

- **Maximum value from this upgrade?** Not feature adoption but **using CC's fixes as a mirror to find bkit's own defects**. Two consecutive cycles have produced CRITICAL findings this way.
- **Critical change we cannot miss?** None (0 breaking). Instead, **two own defects** we cannot miss.
- **Native features replacing workarounds?** Cross-session `SendMessage`/`ListAgents` could replace the Agent Teams message bus, but the L4 interaction is unverified, so it is not adopted this cycle.

### 5.2 ENH Numbering

- Ledger (CHANGELOG.md) max = **380** (measured by `perl`; 104 unique)
- Cycle #31's ENH-381–387 and cycle #32's ENH-388–397 shipped 0 but **remain reserved**
- **Cycle #33 starts at 398**

### 5.3 YAGNI Review

| ENH | Needed now? | If skipped? | Verdict |
|---|---|---|---|
| 398–401 (path deny) | ✅ | Secrets unprotected at L4; audit ledger keeps lying | **Pass** |
| 402–403 (backup clobber) | ✅ | Ongoing, already-occurring data loss | **Pass** |
| 404 (PRIVACY.md) | ✅ | Document is **currently false** | **Pass** |
| 405 (roster) | 🟡 | Dashboard inaccuracy (not functional loss) | Demote P2 |
| 406 (config cache key) | 🟡 | Harmless today (1 hook = 1 process); real defect once long-running | Demote P2 |
| 407 (`servers/` naming) | 🟡 | Docs=Code drift | P2 |
| 408 (cross-session) | ❌ | CC behavior unverified; risks L4 autonomy | **P3 Deferred** |
| 409 (archive source) | ❌ | git channel works fine | **DROP** |

### 5.4 Priority Assignment

| ENH | Pri | Title | Files | Test impact |
|---|---|---|---|---|
| **398** | **P0** | Wire pre-write's scope/destructive verdicts to real blocking; remove hardcoded audit `result` | `scripts/pre-write.js:216-236, 372-376, 392-393` | New integration test asserting `decision:'block'` |
| **399** | **P0** | Make `checkPathScope` match on `resolved` (`..`, `./`, `//`, trailing slash, case) | `lib/control/scope-limiter.js:151, 168, 89-97` | New security TCs: **`docs/../.env` at L0/L4**, `src//../.env` |
| **400** | **P0** | Subdirectory coverage for deny patterns (`**/.env*`, `**/*.key`, `**/*.pem`) + case-insensitive | `lib/control/scope-limiter.js:20` | Regression TCs: **`src/.env` (L4)**, `lib/keys/private.pem`, `src/.ENV` |
| **401** | **P1** | New evasion test suite + **assert the `rule` field in every deny TC** | `test/security/scope-limiter.test.js`, `path-traversal.test.js` | Fix SL-014/015 (currently false-positive) |
| **402** | **P0** | Namespace `${CLAUDE_PLUGIN_DATA}/backup` per project + clobber detection | `lib/core/paths.js:31-36, 223-279, 286-349` | Two-project cross-backup scenario |
| **403** | **P1** | Recompute ENH-383 — distinguish "guard rejection" from "backup overwritten" in the reason string | `lib/core/paths.js:312-317`, `lib/core/worktree-detector.js` | Assert the two reasons are distinguishable |
| **404** | **P1** | Update `PRIVACY.md` — (a) state the opt-in OTLP network transmission, (b) disclose that consenting to CC's feedback survey uploads CLAUDE.md, skill/agent definitions, and MCP tool definitions | `PRIVACY.md:19, 36-37, 54` | docs-code consistency scan |
| **405** | **P2** | Surface MAX_TEAMMATES overflow, or prune completed teammates | `lib/core/constants.js:52`, `lib/team/state-writer.js:259-268` | 11th-spawn TC |
| **406** | **P2** | Scope `lib/core/config.js` cache keys by `PROJECT_DIR` | `lib/core/config.js` | Cache isolation unit test |
| **407** | **P2** | Docs=Code: correct `mcp-servers/` → `servers/`; automate the 19-tools count check | agent defs, docs | `scripts/validate-plugin.js` path assertion |
| **408** | **P3 Deferred** | Adopt cross-session `SendMessage`/`ListAgents`; add "held message awaiting approval" as a 5th auto-pause trigger | `lib/orchestrator/team-protocol.js` | New on adoption |
| **409** | **DROP** | `archive` plugin source + SHA-256 pinning | — | — |

> **Ship ENH-398/399/400 as one PR** — partial fixes leave a bypass path. Commit the reproduction inputs (`src/.env` @L4, `docs/../.env` @L0) as **failing tests first**.
>
> **Changes vs. the analysis agent**: ENH-402 raised P1 → **P0** (§4.2 observed damage); ENH-409 moved P3 → **DROP** (clear YAGNI).

### 5.5 Philosophy Compliance

| ENH | Automation First | No Guessing | Docs=Code | Verdict |
|---|---|---|---|---|
| 398 | ✅ blocking *is* the automation | ✅ reproduction output | ✅ aligns code with `pre-write.js`'s "explicit danger is the exception" header | PASS |
| 399 | ✅ | ✅ node output | ✅ makes the "normalize path" JSDoc true | PASS |
| 400 | ✅ | ✅ | ✅ makes the "L0 = docs and .bkit only" claim true | PASS |
| 401 | ✅ tests as gate | ✅ | ✅ | PASS |
| 402 | ✅ keeps backup automatic | ✅ **disk-verified** | ✅ | PASS |
| 403 | ✅ | ✅ | ✅ | PASS |
| 404 | ➖ docs | ✅ telemetry.js measured | ✅ **resolves a current violation** | PASS |
| 405–407 | ✅ | ✅ | ✅ | PASS |
| 408 | ⚠️ may harm L4 autonomy | ❌ CC behavior unverified | ➖ | Deferred |

### 5.6 Test Impact

Measured: `test/` **292** + `tests/` **55** = **347**.

Cycle #32's **test wiring defect still holds** — `test/run-all.js:33` sets `TEST_DIR=__dirname` (= `test/`) with 0 occurrences of `tests/`, CI (`contract-check.yml`) never runs `tests/`, and there is no `package.json`. **55 tests (16%) sit outside both the runner and CI.** ENH-392 (cycle #32, unshipped) remains necessary.

ENH-401 collides with this: new evasion TCs placed in `tests/` **would never run**. Put them under `test/security/`.

---

## §6. Standing Tracking Items

### 6.1 Differentiator streaks

- **Consecutive compatibility 166 → 167** (v2.1.34 – v2.1.224, 0 breaking)
- **Moat #6 (defense stack)**: nominal streak intact (0 bullets requiring bkit code changes in 224), but **substantive erosion is worse than cycle #32**. On top of #32's F-1/F-2/F-3 (Bash path), **G-2 (Write path)** is confirmed — silent bypass now exists on **both tool paths**. Do **not** use "structural immunity" in external messaging until ENH-388–390 and 398–400 land.
- **Moat #3 (Sequential Dispatch)**: confirmed count-agnostic → orthogonal to cap removal, **unaffected**.
- **Moat #1 (Memory Enforcer)** adjacencies, all OPEN: #84536 (Plan Mode ignores CLAUDE.md), #84486 (AGENTS.md not applied), #84265 (agents don't re-consult their own memory).

### 6.2 Upstream OPEN issues

All 12 watched issues remain OPEN (#84135 is CLOSED but was not a fix; it survives as #84452). Newly added:

- **#84701** PreToolUse deny not enforced for Task-subagent Bash — **top priority**
- **#84632** `if`-scoped hooks fire unconditionally and don't block — **directly exposes bkit `hooks/hooks.json:30,286`**
- **#84656** `[DOCS]` PreToolUse timeout contract unstated
- #84589 `permissionDecision:'defer'` silently parks the tool
- #84011 `additionalContext` loses trailing newline → prompt-cache miss every turn (bkit uses `lib/core/io.js`)
- #84021/#84022 hook output over 10K silently dropped
- #84385 Stop hook `decision:block` renders as "Stop hook error"
- #84634/#84318 `permissions.deny Read()` not enforced
- #84685/#84493 worktree isolation binding is session-global → concurrent subagents steal each other's cwd
- #84262 Skill frontmatter `model`/`effort` not applied to API routing
- #84501 BOM in `known_marketplaces.json` causes silent infinite failure
- **#84183** 2.1.220 silently added a directive suppressing Agent-tool dispatch — **worth checking, since bkit's recommended version is exactly 2.1.220**

### 6.3 Issue window statistics

New issues in the 2026-08-05–08-08 window: **727** (`search/issues` `total_count`). Of 30 community PRs, **0 merged** — the repository is effectively issues-only.

### 6.4 Unverified (next-cycle priorities)

1. **Demonstrate #84302 fail-open** — actual behavior when a bkit hook exceeds its 5000ms timeout. Since the contract is undocumented (§4.5), measurement is the only answer.
2. **#84632 `if`-scoped hook behavior** — do `hooks.json:30,286` actually fire out of scope?
3. **#84701 subagent Bash deny bypass** — highest impact, since bkit uses subagents heavily.
4. **Cross-session messages × L4 Full-Auto** — unreachable today (bkit doesn't use `SendMessage`), but required before ENH-408.
5. **#84524 closed COMPLETED with no matching bullet** — `Agent-type Stop hook runs 42+ minutes despite "timeout": 240`, same family as bkit #139. Undisclosed fix or triage misfile?
6. **Re-verify cycle #32's "997 issues in window"** using the ERRATA-33-2 method.
7. Whether `SubagentStart`/`SubagentStop` fire at depth 2/3 (carried from cycle #30, still open).

---

## §7. Conclusion

### 7.1 CC compatibility

**v2.1.224 is safe.** None of the 31 bullets breaks a bkit runtime contract. Consecutive compatibility **167**. No migration work. Three automatic gains (MCP name announcement, long-path session isolation, CC-side install-record integrity).

### 7.2 Do these first (before any ENH work)

1. **Determine who currently owns the `bkit-bkit-marketplace` backup slot and tell the user.** Right now it is tene-studio. Any other project that relied on that slot no longer has a backup.
2. **Ship ENH-398/399/400 as a single PR**, reproduction inputs committed as failing tests first.
3. **ENH-404 (PRIVACY.md) needs no code change** and the document is currently false (`PRIVACY.md:37` "Does not make network requests of any kind" vs. the opt-in OTLP POST in `lib/infra/telemetry.js`), so it is high-value to fix immediately.
4. **Keep RECOMMENDED_VERSION at 2.1.220.** Hold ENH-395 (raise to 2.1.223) as well.

### 7.3 Character of this cycle

Cycles #32 and #33 show the same method paying off twice: **read what CC fixed, then verify by execution whether the same defect class exists in bkit.** #32 used "silent bypass" (permission hiding) as the mirror and found three Bash-path defects; #33 used "silent corruption" (plugin records) and "silent bypass" (deny trailing slash) and found the Write-path defect plus the backup clobber.

Notably, **#33's biggest finding came from disk observation, not code analysis.** The analysis agent did not know the value of `CLAUDE_PLUGIN_DATA` and left the item "unverified, possibly downgraded." When the main session inspected the actual filesystem, **damage that had already occurred** came to light. ERRATA-32-5 (adopt subagent claims only after reproduction) worked **in both directions** this cycle — one claim was found overstated and restated (§3.0.6), and another was promoted from hypothesis to **demonstrated fact** (§4.2).

---

## Appendix A — Verification Commands

```bash
# Phase 1.5 dual source (mechanical counting — never count via WebFetch: ERRATA-31-1/32-1)
curl -sL https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md -o /tmp/cc.md
perl -ne 'if(/^## 2\.1\.224\s*$/){$i=1;next} if(/^## /){$i=0} print if $i' /tmp/cc.md \
  | perl -ne 'print if /^- /' > /tmp/raw224.txt && wc -l < /tmp/raw224.txt      # → 31

# Symmetric difference (must be 0)
gh api repos/anthropics/claude-code/releases/tags/v2.1.224 --jq '.body' \
  | perl -ne 'print if /^- /' > /tmp/gh224.txt
diff <(sort /tmp/raw224.txt) <(sort /tmp/gh224.txt)

# Window totals via search/issues — gh issue list truncates silently (ERRATA-33-2)
gh api -X GET search/issues -f q='repo:anthropics/claude-code created:2026-08-05..2026-08-08' \
  -f per_page=1 --jq '.total_count'                                              # → 727

# Exact binary literal counts (no window diffs — ERRATA-31-2)
cd ~/.local/share/claude/versions/
for v in 2.1.223 2.1.224; do perl -0777 -ne '
  for my $s ("spawn limit","getTotalAgentSpawns","CLAUDE_CODE_MAX_SUBAGENTS_PER_SESSION"){
    my $c=0;my $q=0; while(($q=index($_,$s,$q))>=0){$c++;$q++} print "$s: $c\n" }' $v; done

# Upstream docs advertising a removed feature
curl -sL https://code.claude.com/docs/en/sub-agents.md \
  | perl -ne 'print "$.: $_" if /at most 200|MAX_SUBAGENTS_PER_SESSION/'

# G-2 reproduction — always state the automation level (ERRATA-33-5)
node -e 'const sl=require("./lib/control/scope-limiter");
for (const lvl of [0,4]) for (const p of ["src/.env","docs/../.env","lib/keys/private.pem"])
  console.log("L"+lvl, p, JSON.stringify(sl.checkPathScope(p,lvl)));'
# → L0 src/.env allowed=false (NOT_IN_SCOPE) / L4 src/.env allowed=true
# → docs/../.env allowed=true at BOTH L0 and L4

# G-2 absence proof (absence proofs via perl only — ERRATA-32-2)
perl -ne 'print "$.: $_" if /outputBlock|process\.exit\(2\)|outputAllow/' scripts/pre-write.js
perl -ne 'print "$.: $_" if $.>=451 && $.<=461' scripts/unified-bash-pre.js   # dead block

# G-1 observed damage — disk inspection, not inference
cat ~/.claude/plugins/data/*/backup/meta.json

# bkit's if-scoped hooks (exposure surface for upstream #84632)
perl -ne 'print "$.: $_" if /"if"\s*:/' hooks/hooks.json                        # → 2 hits
```

## Appendix B — Architecture Measurements (independently re-measured)

| Item | Value | Command |
|---|---|---|
| agents | 34 | `ls -1 agents/ \| wc -l` |
| skills | 44 | `ls -1 -d skills/*/ \| wc -l` |
| hook events | 22 | `node -e 'console.log(Object.keys(require("./hooks/hooks.json").hooks).length)'` |
| hook matcher blocks | 25 | `node -e '…reduce((a,v)=>a+v.length,0)'` |
| scripts | 67 | `ls -1 scripts/ \| wc -l` |
| lib modules (.js) | 195 | `find lib -name '*.js' \| wc -l` |
| tests | 292 (`test/`) + 55 (`tests/`) = **347** | `find … -name '*.test.js' \| wc -l` |
| ENH ledger max | **380** (104 unique) | `perl -ne 'while(/ENH-(\d+)/g){print "$1\n"}' CHANGELOG.md \| sort -n \| uniq \| tail -1` |
| plugin version | 2.1.32 | `jq -r '.version' .claude-plugin/plugin.json` |

Every figure matched the analysis agent's report under **independent re-measurement**.
