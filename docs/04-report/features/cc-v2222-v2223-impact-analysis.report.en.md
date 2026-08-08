# CC v2.1.222 → v2.1.223 Impact Analysis Report (Cycle #32)

- **Analysis date**: 2026-08-06
- **Scope**: Claude Code CLI v2.1.222 + v2.1.223 (40 bullets)
- **Previous baseline**: v2.1.221 (cycle #31)
- **bkit version**: 2.1.32 (branch `feat/v2.1.33-cc221-defect-response`)
- **Installed CC / npm latest**: 2.1.223 / 2.1.223
- **Analysis only** — **zero** repository code changes were made in this cycle.

---

## Executive Summary

> **Verdict**: **0 Breaking / 0 regressions** on the CC side. But the real output of this
> cycle is not CC compatibility work — it is **3 confirmed CRITICAL defects in bkit itself**.
> The v2.1.223 bullet "crafted command could hide parts of itself from permission checks"
> directed the investigation, and **bkit was found to share the very defect class CC just fixed**,
> with execution evidence.

| Perspective | Finding |
|---|---|
| **CC compatibility** | 🟢 Clean. No breaking item among 40 bullets has a bkit attachment point. Consecutive compatible **164 → 166** |
| **bkit internal health** | 🔴 **3 CRITICAL** — destructive-detector never blocks on the Bash path / caller corrupts its own input / 7 heredoc-guard evasions |
| **Transparency** | 🔴 Audit log records `result:"blocked"` for blocks that never happened |
| **Differentiation** | 🟡 #6 (heredoc defense) claim **materially undermined**. Nominal streak holds; the code does not back the claim |

### 4-Perspective Value Assessment

| Perspective | Problem | Solution | Function/UX effect | Core value |
|---|---|---|---|---|
| **Safety** | Destructive Bash commands are detected yet pass through | Restore block wiring (ENH-388) | `rm -rf` / `DROP TABLE` actually stop | The guard behaves as advertised |
| **Accuracy** | Object passing makes TAB-containing commands undetectable | Pass a string + normalize whitespace (ENH-389) | Tab / zero-width padding evasion blocked | Same defense class as CC v2.1.223 |
| **Trust** | Audit log and stats are fabricated | Bind `result` to the real decision | `/bkit:audit` reports become factual | Control transparency restored |
| **Consistency** | Hooks advertise bare `/btw` and `/code-review` | Propagate namespacing (ENH-391) | The bkit feature the user meant actually runs | Name-resolution integrity |

---

## §1. Version Scope and Method

### 1.1 Triple sourcing

| Source | Purpose | Note |
|---|---|---|
| GitHub release body (`gh api .body`) | Bullet text | Mechanical count |
| raw `CHANGELOG.md` (`curl`) | Bullet text (authoritative) | Mechanical count |
| CC binary direct read (`~/.local/share/claude/versions/{221,222,223}`) | Claim verification | perl `index` / regex counts only |
| Official docs raw `.md` (`curl code.claude.com/docs/en/*.md`) | Verbatim quotation | **New channel** — see ERRATA-32-1 |

### 1.2 npm continuity

| Version | Published (UTC) | Gap from previous |
|---|---|---|
| 2.1.221 | 2026-08-03T22:16:25Z | 239.08 h (220→221) |
| 2.1.222 | 2026-08-04T20:37:17Z | 22.35 h |
| 2.1.223 | 2026-08-05T22:51:13Z | 26.23 h |

- **dist-tags**: `latest` = `next` = **2.1.223**, `stable` = **2.1.220** (unchanged)
- **drift** (`latest` − `stable`) = **3** — below the threshold of 4, no user notice required
- **R-1** (silent publish without release notes) / **R-2** (integer skip): both **did not occur**
- A 10-day gap (220→221) followed by two releases 22–26 h apart — an active work window

---

## §2. Change Catalog

### 2.1 Category distribution (40 bullets)

| Version | Added | Fixed | Improved | Changed | Removed | Total |
|---|---|---|---|---|---|---|
| v2.1.222 | 0 | 16 | 3 | 1 | 1 | **21** |
| v2.1.223 | 3 | 12 | 0 | 4 | 0 | **19** |
| **Total** | 3 | 28 | 3 | 5 | 1 | **40** |

**Breaking-labeled: 0.**

### 2.2 bkit-crossing items (8)

| ID | Version | Item | bkit relevance |
|---|---|---|---|
| **C1** | 223 | Bash permission bypass (command hiding) + tab/invisible-Unicode padding | **Shares the same defect class — §4.1** |
| **C8** | 223 | `/review` aliased to `/code-review` | Name-collision surface widened — §4.2 |
| C4 | 223 | Warning when a restricted subagent model falls back to the parent | New warnings on 8 fable/opus-pinned agents |
| C3 | 223 | Agent `bypassPermissions` ignored org policy | **0** of bkit's 34 agents declare it → no impact |
| C6 | 223 | 1M context / unknown model ID window enforcement | Whether `model: fable` is recognized is **UNVERIFIED** |
| B1 | 222 | PreToolUse auto-allow bypassing restrictions in background | **Avoided by convention** — §4.4 |
| B2 | 222 | Worktree isolation extended to file edits + Bash | ENH-383 (#31) calculus unchanged; manual workaround gone |
| B4 | 222 | Subagent transcript effort label fix | Effort enum mismatch unresolved |

### 2.3 No impact / orthogonal (32)

`/usage` and `/usage-credits` attribution, HTTPS-proxy startup check, stream idle timeout,
claude.ai connectors, file-watcher crashes, screen-reader backspace, Vim registers,
Bedrock/Vertex auth, MDM/managed-settings merge, Remote Control auto-start, `ultraplan` removal,
gateway model discovery, `/cd` resume, `git push` parsing hang, marketplace `owner/*` wildcards —
no bkit attachment point.

### 2.4 Undocumented subsystem work (no bullet, binary-only)

Feature gates **1750 → 1761 → 1767** (net +21 added / 4 removed across 221→223).

| Cluster | New gates | CHANGELOG bullet |
|---|---|---|
| worktree | `tengu_worktree_resume_root_rejected` | partial (222 isolation bullet) |
| Remote Control | `tengu_remote_auto_mode_include_destructive_mcp`, `tengu_remote_notification_routed`, `tengu_remote_tool_result_rendered` | partial |
| **org-memory** | `tengu_org_memory_connected_mode` | **none** — adjacent to differentiation #1, keep watching |
| auq-park | `tengu_auq_park_interrupted_at_stream_close`, `..._preserve_reverted`, `..._preserved_at_shutdown` | **none** |
| bridge | `tengu_bridge_inline_image_attachments`, `tengu_bridge_selfheal_heartbeats` | **none** |
| codenames | `basalt_loom`, `cinder_heron`, `cinder_swift`, `dazzling_floyd`, `parchment_fern`, `harbor_kite_limits` | **none** |

Unique permission-refusal (`reason:`) literals went **525 → 557**. Among the new ones, a
worktree cluster of 7 (`invalid-linked-worktree`, `not-a-git-worktree`, `shared-git-dir`,
`work-tree-elsewhere`, `worktree-gone`, `pin-is-own-launch-tree`, `pin-is-protected-checkout`)
corroborates the 222 isolation hardening.

The `[[ ]]` cond-lexer heuristics were **replaced**: 221's `quoted operand contains ]] + command
separator` is gone; 223 adds `pattern leaf contains &&` and `pattern leaf contains a potential
standalone ]] closer`.

---

## §3.0 Raw Source Verification Gate (Phase 1.5 — MANDATORY)

### 3.0.1 Verification table

| Field | Agent reported | Raw verified | Source | Verdict |
|---|---|---|---|---|
| v2.1.222 total bullets | 21 | **21** | CHANGELOG ∧ release body | match |
| v2.1.223 total bullets | 19 | **19** | CHANGELOG ∧ release body | match |
| Added / Fixed / Improved / Changed / Removed | 3/28/3/5/1 | **3/28/3/5/1** | mechanical prefix classification | match |
| Breaking | 0 | **0** | label search | match |
| CHANGELOG ↔ release body symmetric diff | — | **0** (both versions) | `comm -3` | match |

**ERRATA-30-1** (union rule) produced no delta this cycle — both sources agreed exactly.

### 3.0.2 ERRATA-32-1 (new, HIGH) — WebFetch silently truncates doc table rows

A **truncation variant** of ERRATA-31-1 (WebFetch fabricating totals/structure). Same page, same row:

| Target | WebFetch returned | raw `.md` actual |
|---|---|---|
| `/review` row | `Give a fast single-pass, read-only review of a GitHub pull request` | Full text including the `[PR]` argument signature, the v2.1.186–201 behavior history, and 3 cross-links |
| `strictKnownMarketplaces` | Reported as "only a Note exists" (missing) | A dedicated table row **and** a `#### strictKnownMarketplaces` section exist |

→ **Verbatim doc quotation must go through raw `.md` + perl/grep.** WebFetch-only quotations do not
enter the report.

### 3.0.3 ERRATA-32-2 (new, HIGH) — this machine's `grep` (ugrep) gives false negatives on `-E`

The main session queried for remaining bare `/btw` with `grep -rnE '(^|[^:a-z-])/btw\b'` and got
**0 hits**; the same target via perl returned **many**, including `scripts/cto-stop.js:101`
(a runtime output).

```
$ grep --version | head -1
ugrep 7.5.0 x86_64-apple-macosx +avx2; -P:pcre2jit
```

→ **All absence proofs must use perl.** This is the filesystem analogue of ERRATA-31-2/31-3
(binary absence proofs). The false negative nearly produced the exact opposite conclusion —
"ENH-381 is done".

### 3.0.4 ERRATA-32-3 (new) — the `/ultraplan` docs-lag claim was wrong

The research agent reported "`/ultraplan` is still in the built-in table = docs lag", but the raw
doc row shows it was **already updated**:

> `/ultraplan <prompt>` | **Removed.** Use [plan mode](...) instead. Previously sent a planning task
> to a Claude Code on the web session…

→ Confirmed docs lag is still **3 items**, but with different membership: `/review` alias not
documented / `owner/*` wildcard not documented (literal appears 0 times in `settings.md`) /
`CLAUDE_CODE_DISABLE_UNKNOWN_MODEL_WINDOW_ENFORCEMENT` not documented (0 hits across 4 pages).

**Separate observation**: although v2.1.222 states "Removed ultraplan feature", the `/ultraplan`
command descriptor and the `Usage: /ultraplan <prompt>` string are **byte-identical in 221 and 223**.
The docs reflect the removal; the CLI binary does not. Per ERRATA-31-3 we do **not** assert "it was
not removed" — this is recorded as an observation only (server-side or gated deactivation is plausible).

### 3.0.5 ERRATA-32-4 (new, process) — cycle #31's "unique collision" used too narrow a population

Cycle #31 compared only the CC **command registry** against bkit's 44 skill names and concluded
`btw` was the sole collision. But the real population for name resolution is the official command
reference: **104 rows = 90 built-in + 13 bundled Skills + 1 Workflow**, and `code-review` lives in
the **bundled-Skill class**, structurally invisible to a registry-only comparison.

```
$ curl -sL code.claude.com/docs/en/commands.md | perl -ne 'print "$1\n" if /^\|\s*`?\/([a-z0-9][a-z0-9:._-]*)/' | sort -u | wc -l
104
$ comm -12 bkit-skills.txt doc-cmds.txt
btw
code-review
```

→ **There are 2 collisions, not 1.** Future comparisons take the **entire official command
reference** as the population, not the command registry.

### 3.0.6 ERRATA-32-5 (new) — subagent claims are adopted only after reproduction

The 3 CRITICAL findings reported by Phase 2 entered this report **only after the main session
reproduced them independently** (reproduction logs in §4.1). Nothing was adopted unreproduced.
Conversely, the research agent's `/ultraplan` claim was **refuted** during reproduction (ERRATA-32-3).

---

## §4. bkit Impact Analysis

### 4.1 F-1/F-2/F-3 — bkit shares the defect class CC just fixed (**CRITICAL, headline**)

CC v2.1.223:
> Fixed a Bash permission bypass where a crafted command could hide parts of itself from permission checks
> Fixed permission prompts so commands padded with tabs or invisible Unicode can no longer hide part of the command from the approval dialog

These two bullets directed the investigation, and the **same class** was found in bkit's Bash guard.

#### F-1 (CRITICAL) — destructive-detector **does not block** on the Bash path

`scripts/unified-bash-pre.js:232-253` writes an audit entry and calls
`incrementStat('destructiveBlocked')` on a critical verdict, but there is **no `blocked = true` and
no `outputBlock*` call**. Execution falls straight through to `outputAllow()` at `:500`.

The heredoc guard 30 lines below (`:281-282`) has exactly those two lines, making the contrast plain:

```js
outputBlockWithContext(verdict.reason, verdict.alternatives, 'PreToolUse');
blocked = true;
```

**End-to-end reproduction** (the hook parses stdin JSON and prints a decision; it does not execute
the command):

| Input command | Hook stdout | Verdict |
|---|---|---|
| `rm -rf /tmp/bkit-probe-nonexistent` | `Bash command validated.` | **ALLOW** |
| `DROP TABLE users;` | `Bash command validated.` | **ALLOW** |
| `git push --force origin main` | `{"decision":"block",...ENH-298 push-event guard...}` | BLOCK — **by a separate guard, not a G-rule** |
| `ls -la` | `Bash command validated.` | ALLOW (negative control) |

The `PreToolUse` Bash matcher in `hooks/hooks.json` is **only `unified-bash-pre.js`** — there is no
secondary hook to compensate.
→ **Detection works; only the wiring is missing.** G-002 (force push) survives incidentally thanks to
the redundant ENH-298 guard; G-001, G-009 and friends are unenforced.

#### F-2 (CRITICAL) — the caller corrupts its own input: **a single tab defeats detection**

`unified-bash-pre.js:236` passes an **object**, `{ command }`. But
`lib/control/destructive-detector.js:135` does:

```js
const input = typeof toolInput === 'string' ? toolInput : JSON.stringify(toolInput || '');
```

The JSDoc at `:131` declares `@param {string} toolInput`, so this is a **contract violation**.
`JSON.stringify` turns a real TAB into the two characters `\` + `t`, defeating the `\s+` / `\b`
anchors in every G-rule.

**Reproduction** (calling `dd.detect` both ways directly):

| Input | Hook's actual path (object) | String passed directly |
|---|---|---|
| `rm -rf /tmp/x` | G-001/critical | G-001/critical |
| `rm→-rf→/tmp/x` (TAB) | **NONE** | G-001/critical |
| `DROP TABLE users;` | G-009/critical | G-009/critical |
| `DROP→TABLE users;` (TAB) | **NONE** | G-009/critical |
| `ls -la` | NONE | NONE |

TAB is part of the shell's default IFS, so these commands **execute normally**. This is precisely the
class CC v2.1.223 fixed in its own approval dialog ("padded with tabs … can no longer hide part of
the command").

#### F-3 (CRITICAL) — heredoc guard evasion: **7 of 10 payloads are not blocked**

The root cause is that the pipe-shell pattern is `\|\s*\bbash\b`
(`lib/defense/heredoc-detector.js:115`), requiring the interpreter as a **literal word** right after
the pipe.

**Reproduction** (detector only; nothing executed):

| Payload | Guard verdict | Note |
|---|---|---|
| `cat <<EOF \| bash` | **critical** | positive control — blocked correctly |
| `cat <<EOF \| /bin/bash` | warning | allowed |
| `cat <<EOF \| "bash"` | warning | allowed |
| `cat <<EOF \| \bash` | warning | allowed |
| `cat <<EOF \| command bash` | warning | allowed |
| `cat <<EOF \| $X` | warning | allowed |
| `cat <<\EOF \| bash` | **NO-MATCH** | **not even audited** |
| `cat <<'É' \| bash` | **NO-MATCH** | **not even audited** |
| `cat <<'EOF' \| bash` | critical | blocked correctly |
| `cat <<EOF \|→bash` (TAB) | critical | blocked correctly (JS `\s` covers TAB) |

`warning` severity is an **allow path** in code (`unified-bash-pre.js:285` — audit only, no block).
So of the 7 non-blocking outcomes, 5 leave a record and 2 leave **no record at all**.

An internal asymmetry is the decisive evidence: the `sub` vector already tolerates path prefixes via
`[\w./-]*` (`heredoc-detector.js:93`), but **only the `pipe-shell` vector lacks that allowance**.
Furthermore `<<\EOF` is a standard bash idiom (equivalent to `<<'EOF'`) and not adversarial input —
the delimiter pattern requires ASCII `\w+`, so it is not even **recognized** as a heredoc.

**Do not overstate**: NBSP/ZWSP are inert as bash argv separators, so they are **not shell-level
evasions**. They only serve as detector-evasion material where the surrounding language tolerates
them (SQL bodies, quoted arguments).

#### F-5 (HIGH) — the audit log records blocks that never happened

`result: 'blocked'` at `unified-bash-pre.js:244` is a **hardcoded literal**, unrelated to the hook's
actual decision. The reproduction run above left this real ledger entry:

```json
{"actorId":"unified-bash-pre","action":"destructive_blocked","target":"DROP TABLE users;",
 "details":{"rules":["G-009"]},"result":"blocked",...}
```

The hook's stdout for that same command was `Bash command validated.` Because the `bkit:audit` skill
advertises `destructive_blocked` as a control/transparency guarantee, all downstream reporting reads
fabricated data. `incrementStat('destructiveBlocked')` (`:249`) is inflated the same way, polluting
trust-score and session statistics.

#### Honest re-assessment of differentiation #6

The "structural immunity to heredoc bypass" claim in `README`/`CHANGELOG` retains its **nominal
streak** (no code-fix bullet in CC 222/223) but is **materially undermined**. While 7 evasions exist,
"self-defense against CC regressions" is a claim the code does not support. We recommend softening
the strength of this claim in outward-facing copy until ENH-390 lands.

### 4.2 C8 — the `code-review` name collision: closing MF-3 was **wrong**

CC v2.1.223 absorbed `/review` as an alias of `/code-review`. Verified directly in the binary:

- v2.1.221: `{type:"prompt", name:"review", description:"Review a GitHub pull request; for your working diff use /code-review", source:"builtin"}`
- v2.1.223: `name:"review"` appears **0 times** — command registry 100 → 99

The two collisions are **different classes**:

| Name | CC-side entity | bkit-side | CC meaning | bkit meaning |
|---|---|---|---|---|
| `btw` | built-in command (confirmed in the docs table) | `skills/btw/` | **Side-question overlay** that does not join the conversation | Improvement-suggestion **collector** |
| `code-review` | **bundled Skill** (`code-review@claude-code-plugins`) | `skills/code-review/` | Diff bug-hunting + effort | Quality/security/best-practice review |

In both cases the **meanings differ**, so typing the bare form silently runs a different feature.

The CC v2.1.216 plugin name-prefix fix that cycles #216-217 cited when closing MF-3 fixed
**`/bkit:btw` resolution** only; it never touched **bkit advertising the bare form**. Two
**runtime hook outputs** in particular are still live — the worst surface, because a docs review
cannot catch them:

| File:line | Output | Nature |
|---|---|---|
| `scripts/cto-stop.js:101` | `Use /btw list to review, /btw promote {id} to create skills.` | **Runtime output at session end** |
| `scripts/code-review-stop.js:38` | `🔄 To re-review after fixes: /code-review [path]` | **Runtime output** |
| `hooks/startup/session-context.js:619` | Session-startup skill listing | **Runtime output** |

A contradiction inside the repo settles it: `agents/cto-lead.md:292-293` correctly uses
`/bkit:btw list` and even **warns** that "bare `/btw` is shadowed by a Claude Code built-in" — yet the
hook that actually runs at session end prints bare `/btw`. **The namespace migration was applied to
agent prose and missed the hook output strings.**

→ The closing condition is not "CC fixed it" but **"bkit no longer emits the bare form"**. **MF-3 is reopened.**

**Corroboration**: the `/code-review` docs row carries the argument signature
`[low|medium|high|xhigh|max|ultra]` — a first-party source for the effort-enum item in §4.5.

### 4.3 Test wiring defect — 55 tests outside both the runner and CI (**HIGH**)

| Item | Measured |
|---|---|
| `test/run-all.js` base directory | `const TEST_DIR = __dirname;` (`:33`) = `test/` |
| Occurrences of `tests/` inside `test/run-all.js` | **0** |
| Test files under `test/` | 292 |
| **Test files under `tests/`** | **55** |
| CI (`.github/workflows/contract-check.yml`) | Runs only `test/contract/...` and individual scripts — never `run-all.js`, never `tests/` |
| `package.json` | **absent** (no npm script entry point) |

Memory's "347 tests" was the sum of 292 + 55. That means **55 (16%) run in neither the main runner
nor CI** — including the only test suite for differentiation #6
(`tests/qa/v2114-defense-heredoc.test.js`, 53 TCs).

Worse: those 53 TCs are **all happy-path**, with **0** evasion TCs. So the 7 evasions in §4.1 F-3
would not have been caught even if the suite had been running. A direct violation of the
**Automation First** philosophy.

### 4.4 B1 — PreToolUse auto-allow tightening: bkit is avoided by convention

CC 222 stopped auto-allow hooks from bypassing tool restrictions in background agent tasks. Checking
bkit's attachment points:

bkit emits PreToolUse allow from only three places (`unified-bash-pre.js:500`, `pre-write.js:393`,
`lint-skill-md.js:85,110`), and crucially **`outputAllow` in `lib/core/io.js:314-337` prints plain
text only on the CC runtime** (`:332-336`). Emitting `{"permission":"allow"}` is a
**Cursor-runtime-only branch** (`:317-325`).

→ **bkit never emits `permissionDecision:"allow"` to CC at all**, so the path 222 tightens has no
bkit attachment point. This is the same "avoidance by convention" pattern as
`hook-matcher-pipe-convention`.

However, the **consuming direction does exist**: `lib/domain/guards/enh-262-hooks-combo.js:43` and
`enh-263-claude-write.js:48` read an incoming `permissionDecision==='allow'` to attribute CC
regressions, and `unified-bash-pre.js:482` defaults to `'allow'` when absent. Attribution firing
frequency may shift after 222, but these paths are **attribution-only and never block** (`:465-467`).

**Side finding (Docs=Code defect)**: `CUSTOMIZATION-GUIDE.md:1481` instructs users to write
`console.log(JSON.stringify({ decision: "allow" }))`, but `decision:'allow'` is not a valid PreToolUse
field (`lib/domain/ports/cc-payload.port.js:27-36` already separates the two enums). Stale doc.

**Related upstream issue (OPEN, not reproduced)**: #84302 reports that when a PreToolUse command hook
is killed, the CLI **ALLOWs** the gated tool (fail-open). bkit's defense is entirely PreToolUse, and
bkit already hit a defect where the Stop hook blocked for up to 15.5 minutes (#139) — if true, this
affects an assumption of the defense architecture. **Top verification item for the next cycle.**

### 4.5 Remaining CC item mapping

| ID | Item | Verdict | Evidence |
|---|---|---|---|
| B2 | Worktree isolation extended | ENH-383 calculus **unchanged**, pain increased | `restoreFromPluginData()` reads `${CLAUDE_PLUGIN_DATA}` outside the repo, so isolation is irrelevant. But the manual workaround "cd to the main checkout and copy `.bkit/`" is blocked by 222 |
| B3 | `disable-model-invocation` refusal improved | No impact | **0** of 44 skills use it in frontmatter |
| B4 | Subagent effort label | Gap unresolved | bkit `VALID_EFFORT_LEVELS` (`lib/domain/guards/invariant-10-effort-aware.js:24`) = `['low','medium','high']` vs the documented CC `[low\|medium\|high\|xhigh\|max]` |
| B5 | org-restricted model alias step-down | **Automatic benefit** | bkit does not use `modelOverrides`. 34 agents = opus 10 / fable 6 / sonnet 15 / haiku 2 |
| B6 | ultraplan removal | No impact | **0** hits in repo code/config |
| B7 | SendMessage permission classifier | No impact | bkit's dispatcher uses **Task spawn**, not SendMessage (`lib/orchestrator/team-protocol.js`) |
| B8 | Remote Control repo-local blocked | No impact | Neither `.claude/settings.json` nor `settings.local.json` exists; 0 `remoteControl` code hits |
| C2 | Workflow `import()` sandbox escape | **Unrelated (name collision only)** | bkit's `workflow-engine.js` etc. are its own PDCA abstraction. All `import(` hits in `lib/` are JSDoc `@typedef`; 0 runtime dynamic imports |
| C3 | Agent `bypassPermissions` vs org policy | No impact | **0** declarations across 34 agents. The only hit, `pre-write.js:286`, **consumes** the CC flag in a defense guard |
| C4 | Restricted-model warning added | **New warning noise** | The 8 fork skills declare no `model:` → no warning. But `design-validator` / `gap-detector` (opus) and the 6 fable agents will warn under org restrictions |
| C5 | Forked background "already resuming" | Pure benefit | All 8 fork skills are `background: false` (ENH-367) → path never entered |
| C6 | 1M / unknown-model window enforcement | Monitor | `CLAUDE_CODE_DISABLE_1M_CONTEXT`: 0 repo hits. Whether CC recognizes `model: fable` is **UNVERIFIED** |
| C7 | Non-Anthropic `modelOverrides` ignored | No impact | 0 configuration hits |
| C9 | Marketplace `owner/*` | **Opportunity** | bkit ships `.claude-plugin/marketplace.json`; admins can now allow `popup-studio-ai/*` in one line |

### 4.6 CC hook event coverage

Measured from the plugin hook-bucket initializer in the CC 2.1.223 binary:
**CC total 31 / bkit registers 22 = 70.97%** (unchanged). The registry is **byte-identical across
221→222→223** → no new hook to adopt in this window. 0 invalid keys.

Unregistered (9): **`WorktreeCreate`**, **`WorktreeRemove`**, `PostToolBatch`, `PermissionDenied`,
`Setup`, `Elicitation`, `ElicitationResult`, `DirectoryAdded`, `MessageDisplay`.

`WorktreeCreate` / `WorktreeRemove` are exactly the lifecycle hooks that would address ENH-383
(worktree state gap).

> **Trap recorded**: `BackgroundTaskProgress` **does not exist** (0 occurrences in 2.1.223). Past
> analyses listing that name fabricated it. Also, the binary contains a separate 29-name string table
> with no adjacent JS structure — a raw string pool that **must not be cited as an event count**.

### 4.7 RECOMMENDED_VERSION

| Item | Value |
|---|---|
| Current value | **`'2.1.220'`** — `lib/infra/cc-version-checker.js:65` |
| Companion constant | `MIN_VERSION = '2.1.78'` (`:44`) |
| Implementation references | 1 file / 6 lines (`:65, 289, 291, 292, 294, 299`) |
| **Test references** | **0 files / 0 lines** |
| Doc references | 40 files — all narrative, no assertions |

→ A bump is a one-line change breaking 0 tests. But there are also **0 tests that would catch the
drift**, so "drifting unnoticed for 20 releases" can repeat. Recommended value: **2.1.223**.

---

## §5. ENH Roadmap (Phase 3 Brainstorming)

### 5.1 Intent discovery

- **Maximum value from this upgrade?** Not adopting a CC feature, but the **self-defect discovery**
  that CC's permission-hiding fix pointed at. This cycle's ROI lies entirely there.
- **Critical change not to miss?** None (0 Breaking). Instead, there are **3 self-defects** not to miss.
- **Native replacing a workaround?** C4 (restricted-model warning) natively replaces part of the
  v2.1.31 Dual Floor model-floor advisory (ENH-368). C9 simplifies distribution policy.

### 5.2 ENH numbering — avoiding double-booking

The CHANGELOG ledger's highest issued number is **380**, and cycle #31's proposed **ENH-381~387
shipped 0 items**. Applying ERRATA-31-5 (ledger is the number SSoT) literally would leave 381 free —
but #31's proposals are still alive, so reusing those numbers would **recreate exactly the
double-booking ERRATA-31-5 warned about**.

→ **This cycle allocates from ENH-388**, leaving 381–387 reserved for #31's proposals.
Refinement of the ledger-SSoT principle: **the ledger is the SSoT for *shipped* numbers; the
reservation register is "ledger ∪ open proposals".** (The maintainer may renumber if preferred.)

### 5.3 YAGNI review

| ENH | Needed now? | Problem if unimplemented | Will the next CC do it? | Verdict |
|---|---|---|---|---|
| 388 | **Yes** | Destructive commands keep passing | No (bkit code) | **Pass** |
| 389 | **Yes** | One tab defeats detection | No | **Pass** |
| 390 | **Yes** | Differentiation #6 claim is false | No | **Pass** |
| 391 | Yes | Users run a different feature | No (CC is widening the name instead) | Pass |
| 392 | **Yes** | 55 tests never run | No | **Pass** |
| 393 | Yes | Audit data stays fabricated | No | Pass (can fold into 388) |
| 394 | Conditional | Alert noise on every high-effort session | Partly (CC's enum supplies the answer) | Pass |
| 395 | Yes | Drift recurs | No | Pass |
| 396 | No | Worktree state gap persists | **Possibly** — 4 upstream issues in flight | **Demote to P3** |
| 397 | No | Stale doc persists | No | P3 |

### 5.4 Priority assignment

| ENH | P | Content | Target | Verification |
|---|---|---|---|---|
| **ENH-388** | **P0** | Restore destructive-detector block wiring — add `blocked=true` + `outputBlockWithContext`, bind `result` to the real decision | `scripts/unified-bash-pre.js:232-253` | Hook stdout reproduction (§4.1) |
| **ENH-389** | **P0** | Pass a **string** via `dd.detect('Bash', toolInput.command)` + normalize whitespace / strip zero-width before matching. Align with the JSDoc contract at `:131` | `unified-bash-pre.js:236`, `lib/control/destructive-detector.js:135` | Object/string comparison table (§4.1) |
| **ENH-390** | **P0** | Allow path prefixes, quotes, backslashes and wrapper words (`command`/`nice`/`exec`) in the heredoc pipe-shell pattern; treat `$VAR` as unknown-interpreter→critical; widen the delimiter from `\w+` to `[^\s\|;&<>]+` | `lib/defense/heredoc-detector.js:115-207, 219` | 7/10 evasion reproduction (§4.1) |
| **ENH-391** | **P1** | Propagate `/bkit:` namespacing to bare `/btw` and `/code-review` **runtime outputs**. Reopen MF-3 | `scripts/cto-stop.js:101`, `scripts/code-review-stop.js:38`, `hooks/startup/session-context.js:619`, related SKILL.md | §4.2 |
| **ENH-392** | **P1** | Wire `tests/` (55 files) into `test/run-all.js` and CI + add heredoc evasion TCs | `test/run-all.js:33`, `.github/workflows/contract-check.yml` | §4.3 |
| **ENH-393** | **P1** | Remove the hardcoded audit `result` and correct the `incrementStat` condition | `unified-bash-pre.js:244, 249` | §4.1 F-5 (foldable into ENH-388) |
| **ENH-394** | **P2** | Align `VALID_EFFORT_LEVELS` with the CC enum (including `xhigh`/`max`); change degrade to raise | `lib/domain/guards/invariant-10-effort-aware.js:24` | `/code-review` docs signature |
| **ENH-395** | **P2** | `RECOMMENDED_VERSION` 2.1.220 → 2.1.223 + **add a regression test** (currently 0) | `lib/infra/cc-version-checker.js:65` | §4.7 |
| **ENH-396** | **P3** | Register `WorktreeCreate` / `WorktreeRemove` — root-cause response to the worktree state gap | `hooks/hooks.json` | §4.6 · after observing upstream issues |
| **ENH-397** | **P3** | Fix the `decision:"allow"` misguidance at `CUSTOMIZATION-GUIDE.md:1481` | same file | `cc-payload.port.js:27-36` |

### 5.5 Philosophy compliance

| ENH | Automation First | No Guessing | Docs=Code | Verdict |
|---|---|---|---|---|
| 388 | ✅ blocks for real, no manual check | ✅ hook stdout evidence | ✅ audit reflects the real decision | **PASS** |
| 389 | ✅ | ✅ comparison table evidence | ✅ JSDoc contract aligned | **PASS** |
| 390 | ✅ | ✅ 7/10 reproduced | ✅ code matches the differentiation #6 claim | **PASS** |
| 391 | ⚠️ string edits (not automation) | ✅ file:line measured | ✅ agent prose ↔ hook output synced | PASS |
| 392 | ✅ **currently in violation** | ✅ `run-all.js:33` measured | — | **PASS (fix first)** |
| 393 | ✅ | ✅ ledger entry evidence | ✅ | PASS |
| 394 | ✅ | ✅ first-party docs signature | ✅ | PASS |
| 395 | ✅ test makes drift self-detecting | ✅ | ✅ | PASS |
| 396 | ✅ | ⚠️ hook payload schema **UNVERIFIED** | ✅ | Conditional |
| 397 | — | ✅ | ✅ | PASS |

### 5.6 Test impact

| Finding | At-risk assertion | Action |
|---|---|---|
| ENH-388 wiring | `tests/contract/v2114-defense-contract.test.js:125-128` (C-09) only checks the `require` — unaffected | Re-check `test/integration/hook-behavioral-bash-pre.test.js` + add behavioral TCs |
| ENH-390 | `tests/qa/v2114-defense-heredoc.test.js` — 53 TCs all happy-path, 0 evasion TCs → **nothing breaks (that is the problem)** | Add evasion TCs |
| ENH-392 | Wiring makes 55 files run for the first time — **many new failures possible** | Stage the wiring |
| ENH-394 | `test/regression/agents-effort.test.js`, `agents-effort-32.test.js` — the 34 agents use only low/med/high, so **widening** the enum is non-breaking | New TCs only |
| ENH-395 | **0** | Add a regression test |

---

## §6. Continuous Tracking

### 6.1 Differentiation streaks

| # | Backing issue | State | This window | Substantive verdict |
|---|---|---|---|---|
| #6 heredoc defense | #58904 | CLOSED / NOT_PLANNED (bot auto-close, 2026-07-06) | 0 code-fix bullets → nominal +2 | 🔴 **materially undermined** (7 evasions) |
| #3 sequential dispatch | #56293 | CLOSED / NOT_PLANNED (**2026-08-05 — inside this window**) | 0 code-fix bullets → +2 | 🟢 holds |
| #5 PostToolUse continueOnBlock | #57317 | CLOSED / NOT_PLANNED (2026-06-06) | 0 code-fix bullets → +2 | 🟢 holds |

**Interpretation change required**: all three closed via **bot inactivity auto-close (NOT_PLANNED)**.
Upstream did not decide "we won't fix"; the issues **expired without response**. The moat is durable,
but the "streak" metric now means "upstream no longer tracks this", not "upstream hasn't fixed it yet".
The metric's meaning is redefined here in the report.

### 6.2 OPEN upstream issues

| # | Content | Last updated |
|---|---|---|
| 68110 | General-purpose subagents recursively spawn unbounded children | 2026-07-21 |
| 78406 | Env-variable reference missing per-session subagent spawn cap | 2026-07-17 |
| 64436 | Background sessions drop work-phase OTEL logs | 2026-07-08 |

### 6.3 New watch issues (2026-08-03..07 window; all OPEN, none reproduced)

| # | Content | bkit relevance |
|---|---|---|
| **84302** | A killed PreToolUse command hook makes the CLI **ALLOW** the gated tool (fail-open) | **Top priority** — bkit's defense is entirely PreToolUse; #139 stall history |
| 84258 | Worktree isolation hard-blocks `git -C <main>` even after a PreToolUse allow | Isolation overrides hook decisions |
| 83953 | Project-scope hooks do not reach worktrees; **absent entirely** when `.claude/` is gitignored | Upstream basis for ENH-383/396 |
| 84027 | The harness dirties every isolated worktree via `.claude/settings.local.json`, defeating auto-cleanup | same |
| 84135 | Worktree isolation refuses Bash commands interpolating an env var (explicit 222 regression) | same |
| 84217 | Skills with `disable-model-invocation:true` + `context:fork` lose invocation args | bkit's 8 fork skills (though bkit does not use `disable-model-invocation`) |
| 84439 | PostToolUse hooks in settings.json never register | Adjacent to differentiation #5 |
| 79560 | Built-in `/code-review` rejects invocation from another skill | Name-resolution thread |
| 83848 | Background subagents stall silently while the harness reports `completed` | bkit orchestration |

For reference, **997** issues were created in anthropics/claude-code during that window
(`gh api "search/issues?q=repo:anthropics/claude-code+type:issue+created:2026-08-03..2026-08-07"` →
`total_count`). 08-06 is partial as of query time; 08-07 had not arrived.

### 6.4 Standing watch

- **REMOTE-GATE-DRIFT**: nesting depth = `env var → tengu_hazel_trellis → fallback 3`. The only
  deterministic control remains setting `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` explicitly.
- **MCP protocol negotiation**: both bkit servers hardcode `protocolVersion:'2024-11-05'`
  (`servers/bkit-pdca-server/index.js:719-725`, `bkit-analysis-server/index.js:408-414`). Currently inert.
- **org-memory cluster**: `tengu_org_memory_connected_mode` newly added (no CHANGELOG bullet).
  Adjacent to differentiation #1.

---

## §7. Conclusion

### 7.1 CC compatibility

| Item | Value |
|---|---|
| Breaking | **0** |
| Migration required | **None** |
| Consecutive compatible releases | **164 → 166** (v2.1.34 – v2.1.223) |
| Recommended CC version | **v2.1.223** (code currently says 2.1.220 → ENH-395) |

### 7.2 Do these first (before starting ENH work)

1. **Treat ENH-388/389/390 as one P0 bundle.** All three are the same defect class on the same code
   path; fixing them separately leaves a partially-defended state in place for a long time.
2. **Wire ENH-392 immediately before that.** Without the wiring, the tests that would justify the P0
   fixes still sit outside CI. Note that wiring makes 55 files run for the first time, so
   **expect a number of new failures** — stage it.
3. **Soften the outward-facing differentiation #6 copy until ENH-390 lands.** The code does not
   currently support the "structural immunity" claim.
4. **Do not trust existing `destructive_blocked` entries in `.bkit/audit/`.** Data predating ENH-393
   is unrelated to whether anything was actually blocked.

### 7.3 Character of this cycle

We recommend **ending the 0-new-ENH maturity streak here.** That metric assumes "CC's new features
are already covered by bkit", but these 3 P0 items are not CC features — they are **confirmed defects
in bkit's own code**. CC compatibility remains perfect (0 Breaking, 166 consecutive), but the core
lesson of this cycle is that compatibility is not evidence of internal health.

---

## Appendix A — Verification Commands (for reproduction)

```bash
# Phase 1.5 dual source (mechanical counts — never count via WebFetch: ERRATA-31-1/32-1)
gh api repos/anthropics/claude-code/releases/tags/v2.1.223 --jq .body | grep -c '^- '
curl -sL https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md \
  | perl -ne 'print if /^## 2\.1\.223$/../^## (?!2\.1\.223$)/' | grep -c '^- '
# symmetric difference (must be 0)
comm -3 <(...CHANGELOG bullets|sort) <(...release bullets|sort)

# Absence proofs via perl only — this machine's grep is ugrep (ERRATA-32-2)
perl -ne 'print "$ARGV:$.: $_" if m{(?<![:\w-])/btw\b}' scripts/*.js hooks/**/*.js

# Binary exact-literal counts (no window diffs — ERRATA-31-2)
perl -e '...index() loop...' ~/.local/share/claude/versions/2.1.223

# Name-collision population = the entire official command reference (ERRATA-32-4)
curl -sL https://code.claude.com/docs/en/commands.md \
  | perl -ne 'print "$1\n" if /^\|\s*`?\/([a-z0-9][a-z0-9:._-]*)/' | sort -u > doc-cmds.txt
ls -1 skills/ | sort | comm -12 - doc-cmds.txt      # → btw, code-review

# CRITICAL reproduction (the hook prints a decision; it never executes the command)
node -e 'const{execFileSync}=require("child_process");
 const p=JSON.stringify({tool_name:"Bash",tool_input:{command:"DROP TABLE users;"},
 hook_event_name:"PreToolUse",session_id:"probe",cwd:process.cwd()});
 console.log(execFileSync("node",["scripts/unified-bash-pre.js"],{input:p,encoding:"utf8"}))'
# → "Bash command validated."  (yet the audit log records result:"blocked")

# Architecture measurements
ls -1 skills/ | wc -l          # 44
ls -1 agents/ | wc -l          # 34
find lib -name '*.js' | wc -l  # 195
ls -1 scripts/ | wc -l         # 67
find test  -name '*.test.js' | wc -l   # 292  (covered by run-all.js)
find tests -name '*.test.js' | wc -l   # 55   (outside both runner and CI)

# ENH number SSoT (ledger)
perl -ne 'while(/ENH-(\d+)/g){print "$1\n"}' CHANGELOG.md | sort -n | uniq | tail -1   # 380
```
