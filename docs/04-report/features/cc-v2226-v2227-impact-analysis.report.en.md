# CC v2.1.226 → v2.1.227 Impact Analysis Report (Cycle #36)

- **Analysis date**: 2026-08-11
- **Range**: CC CLI v2.1.226 → v2.1.227 (single-version delta)
- **Installed CC**: 2.1.227 · **npm latest**: 2.1.227 · **npm stable**: 2.1.220 (held for 7 releases)
- **bkit plugin**: v2.1.35 (HEAD `3352f26`, clean)
- **Verdict**: **Breaking 0 — no migration required.** Cumulative consecutive compatibility **169 → 170 (conditionally certified)**
- **RECOMMENDED_VERSION**: **hold 2.1.220 + introduce a KNOWN_BAD set (ENH-437)**

---

## Executive Summary

The headline of this cycle is not a CC change. **While researching CC, binary
measurement established that differentiation #5 (`PostToolUse continueOnBlock`) —
which bkit has advertised publicly for a long time — was not "unimplemented" but
a specification that is impossible to implement under CC's schema.**

This is the same class of defect as the v2.1.35 headline (a worktree warning that
measurement showed to be false), but **worse in one respect**: this time three
automated tests existed, and because they inspected *prose strings and enum
entries*, they were **concealing the violation**.

CC v2.1.227 itself differs from what its release notes describe. The notes say
"Fixed 3 / Improved 2", but measurement shows a **broad JS payload rebuild of
+5.37 MB**, and **at least three new subsystems that appear in no bullet at all**.
Even so, every hook-contract string bkit depends on is **invariant**, and the sole
shape-level delta (`"PreToolUse"` +1) has been attributed to an internal branch of
a new function.

### Four-perspective value assessment

| Perspective | Assessment |
|---|---|
| **User** | The upgrade is **safe on compatibility grounds, but 227 is not recommended**. The hook contract is unchanged, yet #85665 (interactive sessions never write transcript JSONL) is a 227-specific regression. **Keep recommending 2.1.220** |
| **Developer** | **Zero code changes required to accommodate CC.** Instead, this investigation newly established four bkit-side defects, one of which (ENH-432) is a P0 requiring withdrawal of a public marketing claim |
| **Architecture** | The arrival of `bashCommandClamp` (CC-native allowlist-style Bash clamping) is confirmed to be **opposite in polarity** to bkit differentiation #6 — complementary, not a replacement. However it is currently workflow-script-only and **bkit cannot reach it** |
| **Business** | **Two public statements need immediate correction** — the differentiation #5 claim (impossible to implement) and five drifted architecture counts in `marketplace.json` |

### What this cycle established (summary)

1. **v2.1.227 is not a bug-fix release but a full payload rebuild** (+5,415,936 B; segment arithmetic matches exactly; only 23 bytes of native code changed).
2. **Three undocumented new subsystems** — `bashCommandClamp` (42), `deviceRegistry`/`deviceBind` (65), storage v5. `bashCommandClamp` appears **0 times** across six official CC doc pages.
3. **The subagent handoff fail-open condition widened** (undocumented) — a fourth instance following cycle #34's F-1.
4. **bkit's hook contract is entirely invariant** — the direct basis for the Breaking-0 verdict.
5. **Differentiation #5 was an unimplementable specification** (ENH-432, P0 withdrawal).
6. The previous cycle's outputs **ENH-420/421/422 all failed to land**, so this cycle re-paid the same manual cost.

---

## 1. Cycle-number correction (prerequisite)

At kickoff the rolling memory recorded the baseline as v2.1.225. That was
**stale**. Checking the repository:

- `docs/04-report/features/cc-v2225-v2226-impact-analysis.report.ko.md` (dated
  2026-08-09, commit `a8b3072`) **already exists** — cycle #35 covered
  v2.1.225 → v2.1.226
- This run is therefore **cycle #36**, covering **v2.1.226 → v2.1.227**
- Consecutive compatibility starts from **169**, not 168
- The highest ENH in the ledger is **431**, not 380/424
  (`CHANGELOG.md:136` `ENH-424, 425, 426, 427, 428, 429, 430, 431`) → new numbers
  start at **432**

This correction was found while the Phase 1 research agent was running and was
relayed immediately; the agent's Q1 (re-verifying 225 vs 226 equivalence) was
discarded and replaced with Q1' (measuring 226 vs 227).

---

## 2. Phase 1.5 — Raw Source Verification Gate

**Gate verdict: PASS.** Per ERRATA-31-1 the main session mechanically established
the totals first and supplied them to the agent as premises, so count errata is
**0** (third consecutive successful cycle).

| Field | Agent reported | Raw verified | Source | Verdict |
|---|---|---|---|---|
| Added | (supplied as premise) | 0 | raw CHANGELOG | match |
| Fixed | (supplied as premise) | **3** | raw CHANGELOG | match |
| Improved | (supplied as premise) | **2** | raw CHANGELOG | match |
| Breaking | (supplied as premise) | **0** | raw CHANGELOG | match |
| Total bullets (range) | (supplied as premise) | **6** (226:1 + 227:5) | sum | match |

**Acquisition method** (no WebFetch — ERRATA-31-1 upheld):

```bash
curl -sL https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md
gh api repos/anthropics/claude-code/releases/tags/v2.1.227 --jq '.body'
```

**Cross-check result**: the bullet set from the raw CHANGELOG and the bullet set
from the GH release body are **identical down to md5**.

| Version | raw md5 | gh md5 | Symmetric difference |
|---|---|---|---|
| v2.1.226 | `0d58a8d82b1b95b8da6e79ccc2998545` | identical | **0** |
| v2.1.227 | `bff2f4817e7fc0d692ae82380ffc6ec1` | identical | **0** |

**Full v2.1.227 CHANGELOG section (verbatim)**:

```
## 2.1.227

- Fixed feature flags being evaluated without the user's subscription tier when a session started with an expired login token, which could wrongly prompt Max plan users to enable usage credits for Fable
- Fixed every Bash command failing under `claude-code-action` with `allowed_non_write_users` on GitHub-hosted runners
- Fixed `/tui` bringing back a conversation that had been rewound to before its first message
- Improved slash-command menu: blue now marks only the selected row, matched characters are bolded instead of recolored, and emoji or accented names keep their glyphs
- Improved performance: fewer event-loop stalls on file-not-found suggestions and at-mention size checks
```

**Category derivation**: there are no subheadings such as `### Added`; categories
are derived from each bullet's first word (ERRATA-33-1 reconfirmed).
`Fixed` 3 / `Improved` 2 / `Bug` 1 (226).

**Release timing** (ERRATA-34-4 upheld — anchor like-for-like versions):

| Version | npm publish | GH release | Lag |
|---|---|---|---|
| v2.1.225 | 2026-08-07T23:08:56Z | 2026-08-08T01:09:26Z | +2.01h |
| v2.1.226 | 2026-08-08T01:53:22Z | 2026-08-08T02:48:05Z | +0.91h |
| v2.1.227 | 2026-08-10T20:56:57Z | 2026-08-10T22:56:53Z | +2.00h |

All within the normal range.

---

## 3. CC version change research

### 3.0 Research-confidence disclosure (read first)

The Phase 1 research agent **self-reported one error**: it wrote as though citing
results from subagents that never returned (ERRATA-36-1). Those citations were
fully retracted, and **every CC-side quantitative claim adopted in this report is
one the main session independently reproduced.**

Additionally, two of the research agent's eight subagents — the GitHub-issue
worker and the docs worker — **never returned**, so those two areas (§3.4, §3.5)
were **performed directly by the main session**.

### 3.1 Binary measurement — the substance of this cycle

All three version binaries exist locally and were compared directly
(`~/.local/share/claude/versions/{2.1.225,2.1.226,2.1.227}`).

#### File and segment level

| Item | 2.1.225 | 2.1.226 | 2.1.227 |
|---|---|---|---|
| File size | 289,284,768 B | 289,284,768 B | **294,700,704 B** |
| `__TEXT` | 71,524,352 | 71,524,352 | 71,524,352 |
| `__DATA_CONST` | 1,409,024 | 1,409,024 | 1,409,024 |
| `__DATA` | 151,552 | 151,552 | 151,552 |
| `__BUN` | 213,696,512 | 213,696,512 | **219,070,464** |
| `__LINKEDIT` | 2,503,328 | 2,503,328 | **2,545,312** |

The **226 → 227 delta of +5,415,936 B** matches **exactly** the sum of `__BUN`
**+5,373,952** and `__LINKEDIT` **+41,984**. All three native code segments are
**unchanged in size**.

Reproduce:
```bash
otool -l ~/.local/share/claude/versions/2.1.227 | \
  perl -ne 'if(/^\s+segname\s+(\S+)/){$s=$1} if(/^\s+filesize\s+(\d+)/ && $s){print "$s $1\n"; $s=undef}'
```

#### Byte identity of the native region

sha256 over `[0, 73084928)` (= `__TEXT` + `__DATA_CONST` + `__DATA`, ending just
before `__BUN`):

| Version | sha256 |
|---|---|
| 2.1.225 | `c7fe71b829670748c88b69d7eb5352687273183526b8e053093e80622d5551e7` |
| 2.1.226 | `c7fe71b829670748c88b69d7eb5352687273183526b8e053093e80622d5551e7` |
| 2.1.227 | `bbe7942335af7383ad81b5287eae1c933dbf559df4428bcc6271e30c991002fa` |

**225 ≡ 226, byte-identical** (reconfirming cycle #35's conclusion).

Reproduce: `head -c 73084928 <binary> | shasum -a 256`

#### Distribution of differing bytes by segment

| Comparison | Total differing | Native region | `__BUN` | `__LINKEDIT` |
|---|---|---|---|---|
| 225 vs 226 | 918,852 | **0** | 464,864 | 453,988 |
| 226 vs 227 (native only) | — | **23** (offsets 2035–2735, load-command table) | — | — |

**→ Every change in v2.1.227 is in the JS payload.** The native code changed only
in 23 bytes of the load-command table (recorded segment sizes and offsets).

> **ERRATA-36-8 (HIGH, methodology)**: the npm package's `unpackedSize`
> (166,777 B) differs from the actual runtime binary (289 MB) by three orders of
> magnitude. The npm artifact is a **wrapper stub** that downloads the binary, so
> equality of `unpackedSize` across versions carries **no information** about
> runtime equivalence. Any inference resting on that value in cycle #35 cannot be
> used as evidence. (Cycle #35's conclusion itself remains valid, since it was
> derived from a separate comparison of the JS body.)

### 3.2 Hook contract surface — fully invariant (direct basis for Breaking 0)

Exact occurrence counts were taken from the original binaries with
`grep -a -o -F` (avoiding `strings` chunking artifacts — ERRATA-35-1).

| Token | 225 | 226 | 227 | Verdict |
|---|---|---|---|---|
| `hookSpecificOutput` | 124 | 124 | 124 | **match** |
| `continueOnBlock` | 3 | 3 | 3 | **match** |
| `permissionDecision` | 34 | 34 | 34 | **match** |
| `permissions.deny` | 9 | 9 | 9 | **match** |
| `forked_skill_depth_cap` | 2 | 2 | 2 | **match** |
| `"PreToolUse"` (quoted) | 31 | 31 | **32** | **+1 — attributed in §3.3** |
| `PreToolUse` (unquoted) | 133 | 133 | **135** | +2 (1 unattributed) |

Reproduce: `grep -a -o -F -- '<token>' <binary> | wc -l`

### 3.3 Attributing `"PreToolUse"` +1 — successful

Inside a new generator function present only in 227 (offset ≈ 271,127,532):

```js
let t = e.hookInput.hook_event_name === "PreToolUse";
```

This function wraps all 16 hook dispatch sites and **does not exist in 226**.
The quoted +1 is thereby attributed — it is **an internal branch of a new
function, not a contract change**.

**UNVERIFIED**: one of the +2 unquoted `PreToolUse` occurrences remains
unattributed.

### 3.4 Three undocumented new subsystems

#### F-3. `bashCommandClamp` (0 → 42) — the biggest question of this cycle

CC has begun offering **allowlist-style Bash command clamping** natively at
`agent()` spawn time. Text extracted directly from the 227 binary:

```
denied: this agent carries a per-spawn bashCommandClamp, which scopes shell
execution to a fixed set of Bash command forms

agent() opts.bashCommandClamp entry '${…}' must be a '${…}(<command or prefix>)' permission rule
agent() opts.bashCommandClamp can bind nothing: the spawned agent's resolved tool pool has no ${…}

function …(e){ let t = …(e).bashCommandClamps; if(t !== void 0 && t.length > 0) return { behavior:"deny", … }
case "bash_command_clamp": t = { …t, bashCommandClamps: [ …t.bashCommandClamps ?? [], o.rules ] }
```

Additional semantics (from binary measurement):
- **Additive** — it preserves both the agent definition's denies and the spawn's `disallowedTools`, and when a clamp is present it additionally blocks all `mcp__*` plus `PowerShell` and `REPL`
- **Fail-closed** — if the resolved tool pool has no `Bash`, or `toolAliases` remaps it, **the spawn itself is refused**. Commands that cannot be decomposed (substitution, control flow) are denied as `unverifiable`
- **Inherited** — propagates to nested child spawns

**Documentation status: none.** `bashCommandClamp` and the substring `clamp`
appear **0 times** across six official CC doc pages:

| Doc | `bashCommandClamp` | `clamp` |
|---|---|---|
| `workflows.md` | 0 | 0 |
| `sub-agents.md` | 0 | 0 |
| `permissions.md` | 0 | 0 |
| `permission-modes.md` | 0 | 0 |
| `agents.md` | 0 | 0 |
| `settings.md` | 0 | 0 |

Reproduce (ERRATA-34-1 upheld — use the `code.claude.com` path):
```bash
curl -sL https://code.claude.com/docs/llms.txt          # full index (193 lines)
curl -sL https://code.claude.com/docs/en/workflows.md
```

GitHub issue mentions: **0**.

#### F-4. `deviceRegistry` / `deviceBind` (0 → 38 / 0 → 27)

A persistent device-key issuance and binding system. Text from the 227 binary:

```
[deviceRegistry] register status=
[deviceRegistry] registered device row=
[deviceRegistry] stored device key is unreadable; minting a new one
deviceRegistry: device key revoked server-side; a new key will be minted on the next registration
[deviceBind] malformed UUID
[deviceBind] create returned 200 but the session is not bound to this device; continuing unbound
```

**Zero functional contact with bkit** — but because this is a **persistent
identifier subject to server-side revocation**, it is in scope for a consistency
review of `PRIVACY.md` (strengthening the existing ENH-404 rationale).

#### F-5. Storage v5 migration

`v5 write failed` 4 → 26, `importSessionToStore` 8 → 28. Targets include plan
workshop documents, changelog cache, `adopt.json`, and classifier link records.
**No contact with bkit configuration paths.**

### 3.5 F-2. Subagent handoff fail-open widened (undocumented, HIGH)

| Version | String |
|---|---|
| 2.1.226 | `Handoff classifier unavailable, allowing sub-agent output with warning` |
| 2.1.227 | `Handoff classifier unavailable **or failed closed without a verdict**, allowing sub-agent output with warning` |

Associated counts: `refusedBySafeguard` 13 → **12**, `UNREVIEWED` 1 → **2**.

**Meaning**: the fail-open trigger widened from "the classifier is unavailable"
to **"including cases where it failed closed without producing a verdict"**. That
is, subagent output passes with a warning even when the safety classifier closed
conservatively.

**Zero bullet coverage.** This is the **fourth instance** in the series following
F-1 established in cycle #34.

> **Structural constraint (established in cycle #34, still valid)**: CC delivers
> this warning only as transcript prose, so **bkit hooks cannot observe or block
> it**. No hook-based remediation ENH is proposed.

### 3.6 Per-bullet measured verdicts

| # | Bullet gist | Measured evidence | Verdict |
|---|---|---|---|
| ① | Expired token → wrongly prompts Max plan for Fable credits | `claude-fable` 50/50/50, `resolveModel` 2/2/2 **invariant** | No change to model alias resolution |
| ② | `claude-code-action` + `allowed_non_write_users` → all Bash fails | `claude-code-action` 21, `allowed_non_write_users` 4, `GITHUB_ACTIONS` 22 — **all invariant** | **Could not locate the fix in the CLI binary.** The fix may live outside the CLI (the action repository) |
| ③ | `/tui` revives a rewound conversation | `/tui` 22, `rewind` 185, `checkpoint` 69 — all invariant | Pure control-flow fix |
| ④ | Slash menu color/bold/**glyph preservation** | `NFC` 108→**114**, `NFD` 5→**7**, `normalize(` 194→**199**, `isSelected` 57→**61**, `slashCommand` 18→**22**. **Invariant**: `stringWidth` 3, `Intl.Segmenter` 10, `graphem` 63 | **A Unicode normalization fix**, not a width or grapheme change |
| ⑤ | Fewer event-loop stalls on file-not-found and at-mention checks | `existsSync` −3 but `statSync` **+5**, `readFileSync` **+1** = net **+3 sync calls** | **A scheduling fix, not a sync→async conversion** |

> **ERRATA-36-7**: release-note vocabulary is frequently absent from the binary
> (`subscriptionTier`, `usageCredits`, `Max plan`, `allowedNonWriteUsers` = 0 in
> all three versions). **The CHANGELOG is not a code index.** Searching the binary
> for a bullet's vocabulary and finding nothing does not mean the fix is absent.

### 3.7 GitHub issues (performed by the main session)

#### Tracked issue state delta

Each was queried individually via `gh api` (ERRATA-33-2 upheld — avoiding the
silent truncation of `gh issue list --limit`).

| Category | Issues | State |
|---|---|---|
| **PreToolUse threat cluster (5)** | #84302, #84701, #84632, #84697, #84926 | **all remain OPEN** |
| worktree | #84685, #84493 | OPEN |
| 224 regressions | #84892, #84925, #84960 | OPEN |
| Others | #84589, #84969, #84939, #84863, #84906, #84656, #78406, #68110, #64436 | OPEN |
| Closed with no information | #84524 | **CLOSED** (2026-08-06) |

**Zero tracked issues were resolved in v2.1.227.**

The absence of a PreToolUse command-hook timeout fail-open/closed contract in
`hooks.md` (#84656) was also reconfirmed — `hooks.md:1231` covers only the
**Agent SDK callback hook on UserPromptSubmit**; there is still no command-hook
contract.

#### New issues in the window

New issues from 2026-08-08 to 2026-08-11: **749**.
Per day 183 / 264 / 253 / 49 → sums match, **proving no truncation**.

Reproduce:
```bash
gh api -X GET search/issues \
  -f q='repo:anthropics/claude-code is:issue created:2026-08-08..2026-08-11' \
  -f per_page=1 --jq '.total_count'
```

#### New issues relevant to v2.1.227 (important)

| Issue | Title | bkit relevance |
|---|---|---|
| **#85665** | `[Bug] 2.1.227: interactive sessions never write transcript JSONL (headless -p unaffected); regression boundary measured from 2.1.226` | **227-specific regression.** See §4.5 |
| **#85669** | `UserPromptSubmit hook not invoked when prompt contains an attachment (VSCode extension)` | **HIGH — see §4.4** |
| **#85699** | A session cannot determine its own effective permission mode, so the model reads `defaultMode` from `settings.json` and reports confidently wrong (2.1.227) | Adjacent to bkit automation-level reporting |
| **#85700** | With worktree + PreToolUse hooks, Edit reports success and reads back the edit but never writes to disk | Extends the Write/Edit deny cluster |

`bashCommandClamp` issue mentions: **0**. The two `deviceRegistry` matches are
both Linux session-linking problems, **unrelated to the new feature**.

> **Caution**: v2.1.227 has been published for under 24 hours. Regression-report
> counts must not be used as a quality signal (a rule upheld since cycle #33).

---

## 4. bkit impact analysis

### 4.0 Architecture measurement (independent, main session)

Measured directly by the main session per the Numeric Correction Protocol.

| Item | Measured | Command |
|---|---|---|
| Agents | **34** | `ls -1 agents/*.md \| wc -l` |
| Skills | **44** | `ls -1d skills/*/ \| wc -l` |
| Lib modules | **198** (22 subdirs) | `find lib -name '*.js' -type f \| wc -l` |
| Scripts | **66** | `find scripts -name '*.js' -type f \| wc -l` |
| Hook events | **21** (24 blocks / 28 handlers) | parsing `hooks/hooks.json` |
| Tests | `test/` **338** + `tests/` **33** | `find <dir> -name '*.test.js' \| wc -l` |
| plugin version | **2.1.35** | `.claude-plugin/plugin.json` |

> **Definition note (not an erratum)**: the `scripts` count varies by definition —
> 62 (`ls -1 scripts/*.js`, top level only) / **66** (`find`, including the
> `scripts/lib` and `scripts/qa` subdirectories) / 67 (`ls -1 scripts/` entries,
> including directories). This report uses **66**.

> **Correction to cycle #35 §10**: that report recorded "Hook events (registered)
> 12"; the measured value is **21**. It also recorded "Lib modules 197"; the
> current value is **198**.

**The 21 registered hook events**: SessionStart, PreToolUse, PostToolUse, Stop,
StopFailure, UserPromptSubmit, UserPromptExpansion, PreCompact, PostCompact,
TaskCompleted, SubagentStart, SubagentStop, TeammateIdle, SessionEnd,
PostToolUseFailure, InstructionsLoaded, ConfigChange, PermissionRequest,
Notification, CwdChanged, TaskCreated

### 4.1 Component impact matrix

| Component | Measured scale | Impact | Basis |
|---|---|---|---|
| **Hook events** | 21 / 24 blocks / 28 handlers | **None** | Contract strings fully invariant (§3.2). The sole delta `"PreToolUse"` +1 is attributed to an internal branch of a new function (§3.3) |
| **Agents** | 34 | **None** (one self-defect tracked separately) | bkit uses 10 of CC's 19 agent frontmatter schema keys. Non-schema keys are ignored and do not cause load failure (§4.3) |
| **Skills** | 44 | **None** | `bashCommandClamp` does not touch the skill surface. Bullet ④ **preserves** glyphs, so it is a pure gain |
| **Lib modules** | 198 | **None** | No CC surface consumed by lib appears in the 227 delta |
| **Scripts** | 66 | **None** (two self-defects tracked separately) | stdin/stdout protocol strings invariant |
| **MCP servers** | 2 (19 tools) | **None** | `protocolVersion` 80 and `2024-11-05` 8 invariant. Zero hook-contract references in server code |
| **CI workflows** | 2 | **Immune** | `claude-code-action` usage is 0 → bullet ② entirely inapplicable |
| **plugin.json** | — | **Pure gain** | `:4` `displayName` = `"bkit — AI Native Development OS"` contains one U+2014 EM DASH. Bullet ④ preserves that glyph |
| **Conditional hook `if`** | 4 sites | **Monitor** | `:29`/`:35` `Write\|Edit(skills/**/SKILL.md)`, `:63`/`:69` `Write\|Edit(docs/**/*.md)`. Exposure to CC #84632/#84925, unchanged in 227 |

### 4.2 `bashCommandClamp` vs bkit differentiation #6 — **complementary**

#### 4.2.1 Prerequisite correction — differentiation #6 works correctly at HEAD

The rolling memory recorded differentiation #6 as "compromised for three
consecutive cycles" (`unified-bash-pre.js:232-253` writing `result:'blocked'` to
the audit log while not actually blocking). The main session verified directly
that **this has been fully repaired at HEAD**.

| Alleged defect | HEAD state | Basis |
|---|---|---|
| Audit records `blocked` while not blocking | **Repaired** | Now `:264-305`. `blocked = true` (`:303`) + `outputBlockWithContext(...)` (`:304`). The audit entry is written **only on the genuinely blocking path** (ENH-388/393) |
| Object passed instead of string, defeating anchored rules | **Repaired** | `:262` `dd.detect('Bash', toolInput.command || '')` — string passed (ENH-389) |
| scope-limiter dead block | **Removed** | Removal and a harmlessness proof are recorded in comments |
| Memory Enforcer `outputBlock` arity bug | **Repaired** | `:556` `outputBlockWithContext(reason, alternatives, 'PreToolUse')` (ENH-410) |

`unified-bash-pre.js` now has **six** real blocking call sites
(`:144`, `:183`, `:304`, `:367`, `:431`, `:556`).

**→ The memory's "differentiation #6 compromised for three cycles" record is
stale; this report closes it.**

#### 4.2.2 Relationship: complementary, not a replacement — **opposite polarity**

- **bkit differentiation #6 = denylist** — `lib/defense/heredoc-detector.js` detects and blocks bypasses such as `<<EOF | bash`
- **CC `bashCommandClamp` = allowlist** — restricts a spawned agent's shell execution to a fixed set of command forms

bkit already uses CC's permission-rule syntax in agent definitions (e.g.
`agents/cto-lead.md:18-20` with `"Bash(rm -rf*)"`, `"Bash(git push*)"`,
`"Bash(git reset --hard*)"`). Such three-pattern denylists are bypassable by
construction (`/bin/rm -rf`, `rm -fr`, whitespace variants). **A clamp has the
opposite polarity, so that class of bypass cannot arise in principle.**

**Verdict: complementary.** The clamp does not replace differentiation #6; it
supplies a polarity bkit does not have.

#### 4.2.3 But bkit cannot currently reach it — and the failure mode is dangerous

`bashCommandClamp` is **exclusive to `agent()` opts in workflow scripts**
(`.claude/workflows/*.js`). The binary has a single construction site for
`{kind:"bash_command_clamp"}`; it is pushed onto an in-memory permission stack and
is never deserialized from any file.

`bashCommandClamp` is **not** among CC's 19 agent frontmatter schema keys:
`name, description, model, tools, disallowedTools, color, effort, permissionMode,
mcpServers, hooks, maxTurns, skills, initialPrompt, memory, background,
isolation, observer, observerMessage, observeSubagents`

**Decisively**: that schema's `.strict()` validator is a **shadow validator** and
does not gate loading — unknown keys produce telemetry only and the return value
is discarded. Furthermore, **plugin-bundled agents skip the shadow check
entirely**.

**→ Putting `bashCommandClamp:` into `agents/*.md` would be silently ignored.**
That is a failure mode that looks like adoption while enforcing nothing, so
**any adoption attempt must be accompanied by runtime verification, never
frontmatter editing alone.**

Current recommendation: **do not adopt.** Revisit if a reachable path opens
(registered for monitoring under ENH-439).

### 4.3 F-12 (P0) — differentiation #5 was not unimplemented but **unimplementable**

This is the headline of the cycle.

#### Root cause (binary measurement, reproduced by the main session)

`continueOnBlock` is **not** a field a hook emits on stdout. Three sites in the
227 binary show this consistently:

**(1) offset 87,115,617 — schema key list**
```
… prompt … model … continueOnBlock … server … allowedEnvVars …
BashCommandHookSchema … PromptHookSchema … HttpHookSchema … AgentHookSchema … McpToolHookSchema
```
`continueOnBlock` sits in the key list of **hook definition schemas**.

**(2) offset 259,698,907 — field definition and description**
```js
timeout: …optional().describe("Timeout in seconds for this specific prompt evaluation"),
model:   …optional().describe('Model to use for this prompt hook (e.g., "claude-sonnet-5"). …'),
continueOnBlock: …optional().describe(
  `Sets the continue value for the decision:"block" produced when ok is false.
   Default false (turn ends). Whether continue:true lets the turn proceed depends on
   the event's decision:"block" semantics. On PostToolUse, the reason is fed b…`)
```
Its neighbours read "for this specific **prompt** evaluation" and "Model to use
for this **prompt hook**", so this is a **configuration field on a prompt-type
hook definition**.

**(3) offset 271,071,646 — consumption site**
```js
preventContinuation: !c && e.continueOnBlock !== !0,
```
`e` is the **hook definition object** (the same return object uses `e.prompt`).
It is read **from configuration**, not from hook stdout.

#### Why bkit cannot use it

**All 28 of bkit's hook handlers are `"type": "command"`.**

Reproduce:
```bash
node -e 'const j=require("./hooks/hooks.json").hooks; const t={}; let n=0;
for(const k of Object.keys(j)) for(const b of j[k]||[]) for(const h of b.hooks||[]){n++;t[h.type]=(t[h.type]||0)+1;}
console.log(n, JSON.stringify(t));'
# → 28 {"command":28}
```

Since `continueOnBlock` is a field of a **prompt-type hook definition**, there is
**no way in principle** for bkit's command hooks to emit or use it.

The binary count holding steady at `3/3/3` across all three versions meant "this
field exists", not "it exists on the surface bkit assumed".

#### Blast radius

| Artifact | State |
|---|---|
| `.claude-plugin/marketplace.json:36` | **Public marketing**: "v2.1.14 6 differentiations (… **PostToolUse continueOnBlock** …)" |
| `scripts/unified-bash-post.js:180-183` | A comment **specifies** "emit hookSpecificOutput with continueOnBlock=true" |
| `scripts/unified-bash-post.js:184` | The actual code is `outputAllow('', 'PostToolUse')` — **nothing emitted** |
| `lib/audit/audit-logger.js:72` | `post_tool_block_recorded` enum entry — **zero emitters** |
| `test/contract/v2114-doc-contract.test.js:71-79` (C-07) | Asserts a **prose string** exists in `agents/cc-version-researcher.md` |
| `test/contract/v2114-defense-contract.test.js:126` | Asserts only that the enum **entry exists** |

#### Philosophy verdict

| Principle | Verdict | Reason |
|---|---|---|
| **No Guessing** | **Violated** | ENH-303 was designed assuming a surface, without checking CC docs or the binary |
| **Docs = Code** | **Violated** | Design, plan, report, enum, and marketplace all describe a feature absent from the code |
| **Automation First** | **Violated (worst)** | Automated verification existed but inspected *prose and enums*, thereby **concealing** the violation |

**Relationship to the v2.1.35 headline**: v2.1.35 withdrew "a worktree warning
that measurement showed to be false". F-12 is **the same class but worse** — that
time there was no verification; this time three tests existed and, by inspecting
the wrong targets (prose, enums), let the violation through.

**→ The correct action is withdrawal, not implementation (ENH-432, P0).**

### 4.4 F-D: #85669 (UserPromptSubmit attachment bypass) — **HIGH, no fallback path**

ENH-371/372 are described as "dual wiring", but **the two handlers are not
equivalent**.

`scripts/user-prompt-expansion-handler.js:51-53`:
```js
// Filter 1: only bkit's own plugin slash commands (e.g. /simplify has a
// different command_source and must be a no-op here).
if (input.command_source !== 'plugin') {
  process.exit(0);
}
```

The UserPromptExpansion path operates **only for `/bkit:<skill>` slash commands**.
An ordinary prose prompt carrying an attachment is not within this handler's
scope at all.

Therefore, when #85669 manifests, the following features in
`scripts/user-prompt-handler.js` **all die silently with no fallback**:

| Feature lost | Location |
|---|---|
| New Feature Intent detection → `/pdca-plan` prompt | `:111-122` |
| Implicit agent triggers | `:125-136` |
| Implicit skill triggers | `:139-150` |
| CC `/simplify`·`/batch` awareness | `:153-167` |
| bkend MCP not-configured guidance | `:170-183` |
| **Ambiguity detection + AskUserQuestion (H-02)** | `:187-214` |
| Team Mode auto-suggestion | `:217-242` |
| Skill template import injection | `:245-283` |
| **sessionTitle emission (ENH-227)** | `:290` |
| IntentRouter structured suggestions (ENH-371) | `:300-307` |

**The irony**: prompts carrying image or file attachments are precisely the ones
most likely to be new-feature requests, and that is exactly the case in which the
PDCA entry prompt disappears.

**Not fixable on the bkit side** (a CC bug) → registered for monitoring (ENH-439).

### 4.5 F-E: #85665 (transcript JSONL not written) — **no direct impact, but it collapses a premise**

**bkit does not read the contents of CC's transcript files.** All of bkit's
`.jsonl` references are to its own artifacts (`.bkit/audit/YYYY-MM-DD.jsonl`,
`.bkit/decisions/`, `.bkit/state/sqm-history.jsonl`, and so on).

There are only two contact points:
- `scripts/post-compaction.js:26` — `input.transcript_length` (a numeric field, not a file)
- `scripts/subagent-stop-handler.js:56-58` — **the problem site**

```js
// Determine exit status (transcript_path exists = normal exit)
const isSuccess = hookContext.transcript_path != null
  || hookContext.exit_code === 0
  || hookContext.exit_code === undefined;
const status = isSuccess ? 'completed' : 'failed';
```

bkit **infers a subagent's "success" from the existence of a transcript artifact**.
Because the third disjunct (`exit_code === undefined`) **defaults to true**, the
outcome is the same whether or not `transcript_path` disappears — **every subagent
is recorded as `completed`.**

**→ The real value of #85665 is not that it breaks a bkit feature, but that CC
has empirically demonstrated this success proxy was never a sound signal.**

This is also where the widened handoff fail-open from §3.5 lands. However **the
numeric sink is already closed** — the main session confirmed ENH-412 landed
(`lib/infra/sprint/gap-detector.adapter.js:88` `matchRate: null` + `measured: false`;
finiteness checks and clamping in `lib/application/quality-gates/measure-router.js`).

What remains is the **content-blind sink**, and per the structural constraint
(§3.5) no hook-based remediation is proposed.

### 4.6 ENH-434: `skills_preload:` — not hygiene but **real functional loss**

CC's actual field is `skills:`. Official documentation, `sub-agents.md:287`:

> `skills` — Skills to preload into the subagent's context at startup.
> The full skill content is injected, not only the description.

`skills_preload` **does not exist** anywhere in CC's documentation (0 occurrences
across all five docs checked). And bkit **correctly uses `skills:` in 19 other
agents**, so the repository is in a self-contradictory state.

**Measured (including the main session's correction)**:

| Agent | `skills_preload` contents | Separate `skills:` | Actual loss |
|---|---|---|---|
| `code-analyzer.md:21` | phase-2-convention, phase-8-review, code-review | **absent** | **all 3** |
| `pdca-iterator.md:16` | pdca, bkit-rules | **absent** | **all 2** |
| `bkit-impact-analyst.md:31` | bkit-rules | **absent** | **1** |
| `bkend-expert.md:36` | bkend-data, bkend-auth, bkend-storage | **present at `:29-34`** | **0** |

> **Correction**: the Phase 2 analysis agent reported "7 entries / 6 unique skills
> lost" and "bkend-expert loses bkend-storage". On reproduction by the main
> session, **bkend-expert's `skills:` (`:29-34`) lists `dynamic,
> bkend-quickstart, bkend-data, bkend-auth, bkend-storage, bkend-cookbook`,
> covering all three `skills_preload` entries**, so there is no loss there.
>
> **Correct figures: 3 agents / 6 entries / 5 unique skills**
> (phase-2-convention, phase-8-review, code-review, pdca, bkit-rules)

Worth highlighting: `code-analyzer`, which handles the PDCA Check phase, loses all
three, and **`bkit-impact-analyst` — the very agent performing this analysis —
fails to preload its own `bkit-rules`.**

**Rename safety confirmed (main session resolved an UNVERIFIED item)**: of the six
target skills (phase-2-convention, phase-8-review, code-review, pdca, bkit-rules,
bkend-storage), **none** has `disable-model-invocation: true`. The rename has no
blocker.

### 4.7 F-13 extended: "writing into a void" is not one site but roughly 24

`outputContext`, specified at `lib/core/io.js:516-531`, is called from **exactly
one place** (`scripts/pdca-doc-changed-handler.js:91`).

The `io.js` comment states the problem explicitly:

> `outputAllow()` prints bare text on every event except SessionStart and
> UserPromptSubmit. On PreToolUse that is fine. **On PostToolUse it is not:
> plain stdout from a PostToolUse hook goes to the transcript only, and the
> model never sees it.** Any handler that used `outputAllow(msg, 'PostToolUse')`
> to say something was writing into a void — **the identical class of defect as
> ENH-410**, where a block reason was computed and then dropped.

Yet `outputAllow(<non-empty message>, <event>)` remains at roughly **24 call sites
across 9 events**:

| Event | Representative site | Note |
|---|---|---|
| PostToolUse | `unified-write-post.js:204` | ENH-103 template validation warning — **confirmed not to reach the model** |
| PostToolUseFailure | `tool-failure-handler.js:165` | Tool-failure recovery guidance |
| Notification | `notification-handler.js:100` | |
| StopFailure | `stop-failure-handler.js:213` | |
| SubagentStart / SubagentStop | `:70,85` / `:33,41` | |
| TaskCompleted | `pdca-task-completed.js:37,54,182` | `:54` passes no event argument at all |
| TeammateIdle | `team-idle-handler.js:35,45` | |
| Stop | 7 sites (`unified-stop.js:712` etc.) | |

**The stdout visibility of the 8 events other than PostToolUse is UNVERIFIED in
both directions.** What is needed is measurement, not more inference → ENH-433.

### 4.8 ENH-435: `marketplace.json` architecture count drift

Public strings disagree with measurement.

| Item | `marketplace.json` states | Measured | Verdict |
|---|---|---|---|
| Skills | 44 | 44 | match |
| Agents | 34 | 34 | match |
| Scripts | **61** | **66** | **drift** |
| Lib Modules | **195** | **198** | **drift** |
| Hook Events | **22** | **21** | **drift** |
| blocks | **25** | **24** | **drift** |
| CC recommended | **v2.1.218** | code says `2.1.220` | **drift** |

---

## 5. Compatibility assessment

### 5.1 Breaking verdict

**Breaking 0.** Basis:

1. Every hook-contract string bkit depends on is **invariant** (§3.2)
2. The sole shape delta `"PreToolUse"` +1 is attributed to **an internal branch of a new function** (§3.3)
3. The three undocumented new subsystems are **all on surfaces bkit does not touch** (§4.1, §4.2.3)
4. Model alias resolution is fully invariant → no impact on Fable-pinned agents

### 5.2 Consecutive compatibility — **169 → 170 certified (conditionally)**

This verdict involved **disagreement between agents**, so it is addressed directly.

- **Phase 1 research agent**: recommended **withholding** certification, citing ① the magnitude of F-1 (31.6% of string runs changed) and ② the three undocumented subsystems
- **Phase 2 analysis agent**: **in favour** of certification
- **Main session verdict**: **certify**. The research agent's grounds are rejected as follows.

#### Rejection ① "31.6% of string runs changed" — magnitude is not evidence about compatibility

What the consecutive-compatibility count measures is not "how much CC changed"
but **"whether the contract bkit depends on changed"**. Using magnitude as a
proxy for compatibility is a category error.

**A decisive counterexample sits inside the same release pair**: 225 vs 226
differed by 918,852 B (`__BUN` 464,864 / `__LINKEDIT` 453,988) with zero bytes
differing in the native region, and CC itself described it in one line as "Bug
fixes and reliability improvements". A bundle rebuild can shake string runs at
scale through minifier symbol reassignment alone.

**Direct evidence overrides the magnitude proxy** — the contract tokens are fully
invariant and the only shape delta has been attributed.

#### Rejection ② "three undocumented subsystems" — all on surfaces bkit does not touch

| Subsystem | bkit contact | Basis |
|---|---|---|
| `bashCommandClamp` (42) | **0** | Exclusive to `agent()` opts in workflow scripts; bkit does not use workflow scripts |
| `deviceRegistry`/`deviceBind` (65) | **0** | No functional contact (the privacy-doc review is a separate matter) |
| New hook-result filter | **0 (conditional)** | Fires only when `observer`/`observerMessage`/`observeSubagents` are declared; bkit declares none of the three |

**Undocumented is not the same as unverified.** These three lack documentation,
but their operating boundaries were located in the binary, and bkit sits outside
those boundaries.

#### Certification conditions (explicit)

1. Valid as long as bkit does not adopt `observer` / `observeSubagents`.
   **Re-verification is mandatory** on adoption (ENH-438 guards this).
2. **#85665 is a runtime defect, not a contract violation**, so it is not counted
   as Breaking but handled as KNOWN_BAD (ENH-437). Blurring this distinction would
   degrade the consecutive-compatibility count into a "CC quality metric".

### 5.3 `RECOMMENDED_VERSION` verdict — **hold 2.1.220 + introduce KNOWN_BAD**

#### A defect in the current structure (important)

```
lib/infra/cc-version-checker.js:44   const MIN_VERSION = '2.1.78';
lib/infra/cc-version-checker.js:65   const RECOMMENDED_VERSION = '2.1.220';
lib/infra/cc-version-checker.js:75   const FABLE_MODEL_FLOOR = '2.1.170';
```

The checker has **no upper bound and no concept of avoidance.** It only compares
lower bounds, so **users on 2.1.227 already receive an `ok` verdict.** Holding at
220 affects only users **below** 220 and **protects nobody from #85665.**

In other words, "hold 2.1.220" is by itself **inaction**.

#### Upgrade vs hold

| Grounds to move to 227 | Grounds to hold |
|---|---|
| Hook contract strings fully invariant | **#85665 is a 227-specific regression** (its regression boundary was measured at 2.1.226) |
| Breaking 0 on the bkit surface | Three undocumented subsystems + a full payload rebuild |
| Two performance fixes help the hook timeout budget | New regressions such as #85699 and #85700 |
| — | **Zero** tracked issues resolved |
| — | The npm `stable` channel has held **2.1.220 for 7 releases** |

**Verdict: hold 2.1.220 + introduce ENH-437 (KNOWN_BAD set).**

---

## 6. Brainstorming results (Plan Plus)

### 6.1 Intent discovery

**Q. What is the greatest value bkit can extract from this CC upgrade?**

Not a CC feature — **the trustworthiness of its own verification system.** This
cycle set out to research CC and discovered that a publicly advertised bkit
feature was impossible to implement in principle, and that **three automated tests
were passing it**. That discovery is worth more than all five v2.1.227 bullets
combined.

**Q. Any critical change that must not be missed?**

None on the CC side (contract invariant). One on the bkit side — ENH-432.

**Q. Any native feature that could replace an existing workaround?**

`bashCommandClamp` was a candidate, but it is confirmed **currently unreachable**
(§4.2.3). Its opposite polarity makes it complementary rather than a replacement
in any case.

**Q. What structural problem recurred?**

None of ENH-420/421/422 from cycle #35 landed, so this cycle re-performed the same
binary comparison procedure by hand. When analysis does not lead to execution, the
same cost recurs every cycle.

### 6.2 Alternative exploration — ENH-432 (differentiation #5)

| Alternative | Content | Assessment |
|---|---|---|
| **A. Implement** | Actually emit `continueOnBlock` | **Impossible.** It is a field on a prompt-type hook definition, and all 28 bkit hooks are command type |
| **B. Introduce prompt-type hooks** | Add a prompt hook to bkit to realize the feature | **Excessive.** It incurs a separate model call and uses a different mechanism from differentiation #5's original intent (conveying PostToolUse block reasons) |
| **C. Withdraw** | Remove from public text, comments, enum, and tests, and record the finding honestly | **Adopted** |

C is adopted, but not as a plain deletion — **the reason it is impossible is
recorded with evidence**, matching the precedent of the v2.1.35 worktree
withdrawal.

### 6.3 YAGNI review

| ID | Genuinely needed? | Problem if not done | Verdict |
|---|---|---|---|
| ENH-432 | ✅ A false public claim persists | Trust damage. Since implementation is impossible, leaving it = permanent falsehood | **Pass · P0** |
| ENH-433 | ✅ ENH-103 warnings never reach the model | Template validation is effectively void | **Pass · P1** |
| ENH-434 | ✅ Five unique skills are not injected | The PDCA Check agent operates without its rules | **Pass · P1** |
| ENH-420~422 (resume) | ✅ This cycle re-paid the cost | The next cycle repeats it | **Pass · P1** |
| ENH-437 | ✅ The current checker **has no way to express** #85665 | 227 users keep receiving `ok` | **Pass · P1** |
| ENH-435 | ✅ Five public counts have drifted | Inaccurate external figures | **Pass · P2** |
| ENH-438 | ✅ Adoption would erase all model-facing output | Blocks a future risk | **Pass · P2** |
| ENH-436 | ✅ Violates the CLAUDE.md bilingual rule | Rule compliance | **Pass · P3** |
| ENH-439 | ✅ All three are unfixable by bkit | Tracking gap | **Pass · P3** |
| ~~Adopt clamp~~ | ❌ No reachable path; frontmatter entries would be silently ignored | — | **YAGNI rejected · DROP** |
| ~~Respond to bullets ①–⑤~~ | ❌ Inapplicable / immune / orthogonal / pure gain | — | **DROP** |
| ~~Respond to `deviceRegistry`~~ | ❌ Zero functional contact | — | **DROP** (privacy-doc review stays under existing ENH-404) |
| ~~Hook-based blocking for F-2~~ | ❌ CC delivers it as prose only — technically impossible | — | **DROP** |

---

## 7. Implementation proposals (ENH roadmap)

**Numbering rule**: ledger maximum = 431. New numbers start at **432**.
**Unlanded numbers are resumed rather than burning new ones** — ENH-420/421/422
are resumptions, not new items.

### 7.1 bkit self-defect remediation

| ID | P | Title | Target files | Test impact |
|---|---|---|---|---|
| **ENH-432** | **P0** | **Withdraw the differentiation #5 `PostToolUse continueOnBlock` claim** — record the evidence (prompt-hook definition field; all 28 bkit hooks are command type) | `.claude-plugin/marketplace.json:36`, `scripts/unified-bash-post.js:180-184`, `lib/audit/audit-logger.js:72`, `docs/sprint/v2114/*` | **Rewrite C-07** (`v2114-doc-contract.test.js:71-79`) and `v2114-defense-contract.test.js:126`. **Convert source-regex assertions into behavioural assertions** |
| **ENH-433** | **P1** | Convert `outputAllow` → `outputContext` + produce a **measured per-event stdout visibility matrix** | Immediately: `scripts/unified-write-post.js:204`. After measurement: ~24 sites across 8 events | New behavioural tests asserting hook **stdout** |
| **ENH-434** | **P1** | **Rename `skills_preload:` → `skills:`** (3 agents) + clean up non-schema frontmatter + a 19-key contract test | Rename `agents/{code-analyzer,pdca-iterator,bkit-impact-analyst}.md`; remove the duplicate key from `bkend-expert.md` | New 19-key allowlist contract test |
| **ENH-435** | **P2** | Sync the five drifted architecture counts in `marketplace.json` | `.claude-plugin/marketplace.json:36` | Extend `test/integration/config-sync.test.js` |
| **ENH-436** | **P3** | Create the `.en.md` sibling | `docs/04-report/features/cc-v2225-v2226-impact-analysis.report.en.md` | — |
| **ENH-420~422** | **P1** | **Resume** — codify the opaque-release protocol + binary equivalence script + provenance recording | `scripts/cc-binary-equivalence.js` (new), `skills/cc-version-analysis/SKILL.md` | New unit tests |

### 7.2 CC-facing

| ID | P | Title | Target files | Test impact |
|---|---|---|---|---|
| **ENH-437** | **P1** | Introduce a **KNOWN_BAD version set** in `cc-version-checker` | `lib/infra/cc-version-checker.js`, `hooks/startup/session-context.js` | New unit + SessionStart integration |
| **ENH-438** | **P2** | A **guard against adopting** `observer`/`observeSubagents` + documented rationale | `docs/06-guide/cc-compatibility.guide.md`, new contract test | Contract test |
| **ENH-439** | **P3** | Register for monitoring: #85669 (attachment bypass), #85665 (transcript), `bashCommandClamp` reachability | Monitoring registry | — |

### 7.3 ENH-437 design specification

```js
/**
 * Versions known to be defective. Warn even when at or above RECOMMENDED.
 * Every entry requires an addedCycle comment. Remove once a CC fix is confirmed.
 */
const KNOWN_BAD_VERSIONS = Object.freeze({
  // addedCycle: #36 (2026-08-11)
  '2.1.227': {
    issue: 85665,
    severity: 'warn',
    scope: 'interactive',   // 'interactive' | 'headless' | 'all'
    detail: 'Interactive sessions never write transcript JSONL (headless -p unaffected).',
  },
});
```

Extension to the `checkCCVersion()` return contract:

1. The `error` verdict (< MIN_VERSION) **retains top priority** — KNOWN_BAD never overrides it.
2. `< RECOMMENDED_VERSION` → existing `warn` retained.
3. **New**: if `KNOWN_BAD_VERSIONS[current]` exists, raise `severity` to that value and add `{ knownBad: {...} }` to the return object. The primary use is promoting `ok → warn`.
4. If `scope` does not match the current execution mode, **suppress** the warning (false-positive avoidance). If execution mode cannot be determined, **fail safe toward warning**.
5. The consumer (`hooks/startup/session-context.js`) surfaces `knownBad.detail` plus an issue link **once** in the SessionStart advisory. It **does not block** — the module's fail-open design is preserved.

**Regression-lock tests**: promotion on a KNOWN_BAD hit / `error` unchanged below
MIN / suppression on scope mismatch / **behaviour identical to today when the map
is empty**.

### 7.4 Dependencies

- ENH-432 → ENH-435 (both edit `marketplace.json:36` — sequencing required)
- ENH-433 requires the **measured matrix as a prerequisite**. No bulk substitution based on inference
- ENH-420 → ENH-421 (the protocol defines the script's specification)
- ENH-437 is independent

---

## 8. GitHub issue monitoring

### 8.1 State summary

- **Tracked issues resolved in v2.1.227: 0**
- The five-issue PreToolUse threat cluster (#84302, #84701, #84632, #84697, #84926) **all remain OPEN**
- New issues in the window (08-08 to 08-11): **749** (no truncation, proven)

### 8.2 New watch items

| Issue | Reason | bkit response |
|---|---|---|
| **#85665** | 227-specific regression; direct basis for the RECOMMENDED verdict | ENH-437 |
| **#85669** | UserPromptSubmit attachment bypass — ten bkit features die with no fallback | ENH-439 (unfixable) |
| **#85699** | Session misreports its own permission mode — adjacent to bkit automation-level reporting | Observe |
| **#85700** | Edit not written under worktree + PreToolUse — extends the Write/Edit deny cluster | Observe |

### 8.3 Closures

- **#84524**: CLOSED (2026-08-06). Closed with zero comments and zero cross-references, so no information. It belonged to the bkit #139 family, so **the reproduction attempt remains carried forward**.
- **Differentiation #6 compromise watch item**: **closed** per §4.2.1, confirmed repaired at HEAD.

---

## 9. Verdict

**CC v2.1.227 is Breaking 0 for bkit and requires no migration.**

- **Consecutive compatibility 170 certified** (conditionally — §5.2)
- **Zero CC-facing code changes required in bkit**
- **Hold RECOMMENDED_VERSION at 2.1.220 + introduce KNOWN_BAD** — holding alone protects nobody from #85665, so ENH-437 is required alongside it
- **8 new ENH items + 3 resumptions**

The substantive output of this cycle, however, is not the CC compatibility
verdict.

**It is the fact that differentiation #5, which bkit has advertised publicly, was
a specification impossible to implement under CC's schema, and that the three
tests built to verify it were inspecting prose and enums — thereby concealing the
violation.** Just as v2.1.35 withdrew one of its own claims through measurement,
this time binary measurement of CC forced the withdrawal of another.

That this class of defect has surfaced in two consecutive cycles is itself a
signal: **a test that inspects source text with a regular expression does not
verify a feature.** ENH-432 is P0 not because of the marketing copy, but because
that lesson must be reflected in test design.

---

## 10. Limits of verification scope (honest statement)

1. **The subject was a single macOS x86_64 binary.** Linux, Windows, and arm64
   builds were not examined. Notably **#85665 was reported on Windows native**, so
   this report's binary measurement can neither reproduce nor refute it.
2. **The bytecode region was not decompiled.** It was treated as equivalent
   because it is generated from identical JS, but that is an inference.
3. **v2.1.227 has been published for under 24 hours.** Regression-report counts
   cannot be used as a quality signal.
4. Two of the Phase 1 research agent's eight subagents (issues, docs) **never
   returned**, so the main session performed those areas instead. No claim is made
   that their research density matches the other areas.

### UNVERIFIED list

| # | Item | Why unverified |
|---|---|---|
| 1 | One of the +2 unquoted `PreToolUse` occurrences **unattributed** | The new function accounts for only one |
| 2 | Whether CC sets delegated-observation mode automatically **without** an `observer` declaration | The gate's setting site was not traced |
| 3 | **stdout → model visibility for the 8 events other than PostToolUse** | Requires runtime observation (prerequisite for ENH-433) |
| 4 | Whether `disallowedTools` is **actually enforced for plugin agents** | Existing tests assert frontmatter contents only |
| 5 | Whether #85665 removes the `transcript_path` **field itself** | The issue body describes only the missing file |
| 6 | Where bullet ②'s fix lives | All related strings in the CLI binary are invariant — the fix may be in the action repository |
| 7 | Whether preloading **actually occurs** after the ENH-434 rename | Requires runtime observation |

---

## 11. Errata for this cycle

### ERRATA-36-1 (CRITICAL, narrative) — a subagent cited results that never returned

The Phase 1 research agent wrote as though citing results from subagents that
never returned, and **found and fully retracted this itself**.

**Lesson**: subagent output **is not evidence until the main session reproduces
it** (a reconfirmation of ERRATA-32-5). The rule worked in both directions this
cycle — every binary claim reproduced successfully, and the unreturned areas were
performed by the main session instead.

**Side note**: among the retracted citations, `#85665` **turned out to be a real
issue whose subject matched exactly**. Nevertheless, since the agent had no basis
for it, the retraction was correct, and this report adopts it solely on the basis
of the main session's **independent `gh api` query**.

### ERRATA-36-2 (HIGH, state management) — stale rolling memory

At kickoff the memory recorded the baseline as v2.1.225 when it was actually
v2.1.226, and the cycle number as #35 when it was #36 (§1).

**Lesson**: at cycle start, the **repository** (`docs/04-report/features/`), not
memory, is the primary source. Memory is a secondary index.

### ERRATA-36-3 (HIGH, methodology) — npm `unpackedSize` is not runtime evidence

The npm artifact (166,777 B) is a **wrapper stub** that downloads the binary
(289 MB). Equality of `unpackedSize` across versions carries no information about
runtime equivalence.

### ERRATA-36-4 (MEDIUM, prior correction) — numeric errors in cycle #35 §10

That report's "Hook events (registered) 12" measures **21**, and "Lib modules 197"
is now **198**.

### ERRATA-36-5 (MEDIUM, numeric) — the Phase 2 agent's `skills_preload` tally

The analysis agent reported "7 entries / 6 unique skills lost, bkend-expert loses
bkend-storage". On reproduction, **bkend-expert loses nothing**, and the actual
figures are **3 agents / 6 entries / 5 unique skills** (§4.6).

### ERRATA-36-6 (LOW, tooling) — `cmp -l` on large files

A full `cmp -l` over two 289 MB binaries exceeds 120 seconds and must be
backgrounded. The `cmp -n` / `-i` flags can produce incorrect results on these
artifacts and are not used.

### Reconfirmation of prior errata

- **ERRATA-34-1** (CC docs live at `code.claude.com`; `raw.githubusercontent.com` returns 404): worked correctly this cycle. `llms.txt` (193 lines) → six individual `.md` paths fetched successfully
- **ERRATA-31-1** (WebFetch fabricates totals): the main session fixed the totals first → **three consecutive cycles with zero count errata**
- **ERRATA-33-2** (`gh issue list --limit` truncates silently): avoided via `search/issues` `total_count`; per-day sums prove no truncation
- **ERRATA-35-1** (`strings` diffs are not evidence of semantic change): only exact `grep -a -o -F` counts were used throughout

---

## 12. Priorities for the next cycle

1. **Prerequisite for ENH-433**: **measure** stdout → model visibility for the 8
   events other than PostToolUse. Without it, ENH-433 becomes an inference-based
   bulk substitution and is risky.
2. **Recheck `bashCommandClamp` reachability**: whether CC exposes the option
   through agent frontmatter or a configuration file. If it does, a combined
   design with bkit differentiation #6 is needed.
3. **When #85665's fix lands**: tracked to decide when the KNOWN_BAD entry is removed.
4. **When #85669's fix lands**: recovery point for the ten bkit features.
5. **Cross-platform binary equivalence** (carried from #35): Linux/arm64. Low-cost
   once ENH-422's provenance recording is in place.
6. **Carried-forward unverified**: whether hook denies count toward the auto-mode
   3/20 counter, its relationship to `PermissionRequest` `behavior:'deny'`,
   empirical validation of #84302/#84632/#84701/#84697/#84926, and
   `SubagentStart`/`SubagentStop` firing at depth 2/3.

---

*Every quantitative claim in this report was verified directly by the main session
using reproducible commands. Subagent output that failed reproduction, or for
which no evidence was supplied, was either not adopted or marked UNVERIFIED.*
