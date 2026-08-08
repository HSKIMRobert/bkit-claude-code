# CC v2.1.220 → v2.1.221 Impact Analysis Report (cycle #31)

| Field | Value |
|---|---|
| Analysis date | 2026-08-04 |
| CC range | v2.1.220 → **v2.1.221** (new scope is 221 alone) |
| Installed CC / npm latest | 2.1.221 / 2.1.221 |
| npm dist-tags | `latest=2.1.221`, `next=2.1.221`, `stable=2.1.220` |
| bkit version | 2.1.32 |
| Bullet count | **39** (Breaking **0**) |
| Verdict | **COMPATIBLE** — **164** consecutive compatible releases |
| New ENH | ENH-381 – ENH-387 (proposed, **not implemented**) |

---

## Executive Summary

v2.1.221 is the opposite of v2.1.220 in character. 220 was effectively a no-op
(binary +0.0062%, feature gates 1754/1754 identical); 221 is a substantive
release at **+13.7 MB (+5.14%)**, 39 bullets, and +33 new `reason:` literals
with zero removed. The npm publish interval matches: 220→221 is roughly
**10 days**, against ~1 day for every other adjacent pair in the window
(219→220 was 7 hours).

The bkit headline is the **`btw` name-collision fix (bullet #18)**. CC ships 88
`local-jsx` built-in commands, and exactly one of bkit's 44 skill names — `btw`
— collides with them. Notably, **bkit found this independently one release
before CC fixed it** and mitigated it in v2.1.32 (`CHANGELOG.md:161-166`). The
fix therefore creates no new dependency and no new version floor for bkit.

Compatibility is clean. `claude plugin validate .` passes with 0 warnings, the
CC hook-event set is unchanged at 31 = 31, and skill frontmatter
`context:`/`background:` parsing is unchanged, so bkit's 8 fork skills are
unaffected. Zero breaking changes.

What this cycle did surface is **three defects in bkit itself — not defects
caused by CC, but ones CC's changes revealed**: (1) an incomplete `btw`
mitigation that still emits a non-working command at runtime, (2) a defense
guard whose effort enum is narrower than CC's actual one, downgrading
highest-effort sessions to the middle tier, and (3) a bkit state void that
`/fork` now makes reachable by default. All three are internal-consistency
problems, not CC workarounds.

### Four-perspective value assessment

| Perspective | Assessment |
|---|---|
| **User** | Confirmed: incorrect guidance such as `/btw list` is emitted at runtime (ENH-381). v2.1.221 itself is a net gain — e.g. the zsh `[[ ]]` permission-bypass fix. |
| **Maintenance** | ENH number double-booking recurred (ERRATA-31-5): the report doc and the shipped ledger assign different meanings to ENH-374–377. The numbering SSoT must be pinned to the ledger. |
| **Architecture** | Reconfirmed that bkit's regex-based Bash defense is **structurally immune** to CC's tokenizer defect (zsh `[[ ]]`) — the same dodge-by-convention pattern as the pipe-matcher case. |
| **Cost / risk** | REMOTE-GATE-DRIFT unresolved — the nested-spawn depth default is still server-adjustable via a remote gate (`tengu_hazel_trellis`). Version pinning cannot defend against it. |

---

## §1. Version range and method

Three-source cross-verification was applied.

| # | Source | Retrieval |
|---|---|---|
| 1 | raw CHANGELOG.md | `curl raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md` |
| 2 | GitHub release body | `gh api repos/anthropics/claude-code/releases/tags/v2.1.221 --jq .body` |
| 3 | Installed-binary direct read | `~/.local/share/claude/versions/{2.1.220,2.1.221}` |

Source 3 was introduced in cycle #30. Although the artifact is a single Mach-O
file, the JS bundle is embedded in plaintext, so zod schemas, defaults, feature
gates, and doc strings can be read directly.

**npm continuity (R-1 / R-2)**

An integer-gap walk over 2.1.210–2.1.221 finds **no missing versions** (12/12
present), so R-1 (silent publish) is **CLEAN**. This closes an item left
unassessed in cycle #30. R-2 (220→221 contiguity) is also CLEAN.

```
2.1.210  2026-07-14T19:39:21     2.1.216  2026-07-20T20:19:37
2.1.211  2026-07-15T19:24:07     2.1.217  2026-07-21T19:55:38
2.1.212  2026-07-16T19:20:24     2.1.218  2026-07-22T19:55:32
2.1.213  2026-07-17T22:26:26     2.1.219  2026-07-24T16:11:49
2.1.214  2026-07-18T00:13:41     2.1.220  2026-07-24T23:11:21
2.1.215  2026-07-19T00:53:37     2.1.221  2026-08-03T22:16:25
```

---

## §2. Change catalog

### 2.1 Category distribution (39 bullets)

Both raw sources are a **flat list with no sub-headings**. The classification
below is assigned by this analysis from each bullet's leading verb; it is not a
distinction present in the source.

| Category | Count |
|---|---|
| Added | 4 |
| Fixed | 17 |
| Improved | 5 |
| Changed | 11 |
| Reduced | 1 |
| Removed | 1 |
| **Total** | **39** |
| **Breaking** | **0** |

### 2.2 bkit cross-cutting items

| # | Change | Impact | bkit surface |
|---|---|---|---|
| 18 | Plugin/org skills named after terminal-only built-ins un-invocable in non-interactive sessions — fixed | **HIGH** | `skills/btw/SKILL.md` (the only collision) |
| 5 | Bash permission-check bypass where zsh executed hidden commands in `[[ ]]` regex conditionals — fixed | **HIGH** | Differentiation #6 (heredoc), Layer-6 defense |
| 34 | `/fork` sessions create a worktree of their own instead of using the original checkout | **HIGH** | `lib/core/paths.js`, `worktree-detector.js`, `.bkit/state/*` |
| 30 | Plugins installed from `/plugin` activate immediately without `/reload-plugins` | LOW | Doc references only (all describe post-*edit* reload) |
| 28 | Background sessions commit and push, following CLAUDE.md git instructions | MEDIUM | `lib/defense/push-event-guard.js` (ENH-298) |
| 11 | WebSearch 400 at effort `xhigh`/`max` with thinking disabled — fixed | MEDIUM | Reveals that **CC's effort enum ⊋ bkit's** |
| 3 | `claude plugin validate` warns on marketplace names | LOW | `marketplace.json` — **verified passing, 0 warnings** |
| 31 | Plugins accept `"."` as a `skills` path | LOW | `plugin.json` has no `skills` key at all |
| 8 | MCP servers from `--mcp-config` not connected in `-p` mode — fixed | LOW | bkit ships servers via manifest; no `.mcp.json` |
| 15 | `CLAUDE_CODE_RESUME_INTERRUPTED_TURN=0` falsy now honored | LOW | Zero references repo-wide |

### 2.3 IMMUNE / orthogonal (24 items)

VSCode Focus view, two Vim-mode fixes, sandbox `mask` (Linux/WSL), PowerShell
quoted paths, Bedrock + AWS SSO, Stats panel, emoji autocomplete, Claude in
Chrome, Gateway `model` validation, Monitor, `/status` session kind,
`/ultrareview`, Windows kernel32 startup, thinking toggle, @-mention Esc, SDK
MCP `constructor` crash, TLS uploads, spend-limit wording, wake-from-sleep token
race, session rename, "Plugins changed" notification, Vertex tool search, and
two auto-mode cache items — no bkit surface.

### 2.4 Undocumented subsystem work (no bullet, binary-only)

Two clusters appear in the binary with **no corresponding changelog bullet**.
Flagged for next cycle.

- **MCP cluster (7 new gates):** `tengu_mcp_protocol_negotiation_{stdio,http,claudeai}`,
  `tengu_mcp_discovery_{cache,source}`, `tengu_mcp_listen_reopen`,
  `tengu_mcp_skills_funnel`, plus `skills-capable`/`channel-capable` capability
  markers (0 → 7 each).
- **org-memory cluster (4 new gates):** `tengu_org_memory_*`. Adjacent to bkit
  differentiation #1 (Memory Enforcer).

---

## §3.0 Raw source verification gate (Phase 1.5 — MANDATORY)

| Field | Raw verified | Source | Verdict |
|---|---|---|---|
| raw CHANGELOG.md §2.1.221 bullets | **39** | `sed -n '3,44p'` + `grep -cE '^\s*[-*] '` | measured |
| GitHub release body bullets | **39** | `gh api … --jq .body` + `grep -c` | measured |
| Union | **39** | `comm` over sorted bullet text | — |
| GH − CHANGELOG | **0** | `comm -13` | match |
| CHANGELOG − GH | **0** | `comm -23` | match |
| Per-heading split | **N/A — no sub-headings exist** | both raw sources | see ERRATA-31-1 |

**Gate PASSES.** Unlike cycle #30 (v2.1.219: CHANGELOG 24 vs GH body 27), the two
documentary sources agree exactly. The ERRATA-30-1 union rule was applied and
yielded no delta.

### ERRATA-31-1 — WebFetch fabricated document structure (NEW, HIGH)

**Both** Phase 1.5 WebFetch calls returned wrong totals and non-existent structure.

| Source | WebFetch claimed | Measured |
|---|---|---|
| raw CHANGELOG.md | "Total bullets: 31" | **39** |
| GitHub release tag | "Total bullets: 58", `Feature Additions(4)/Bug Fixes(20)/Improvements(11)/Additional Changes(8)` | **39**, single `## What's changed` heading, **no sub-headings** |

Three independent defects in one gate run: (1) both totals wrong, (2) the GitHub
figure was internally inconsistent (claimed 58; its own section counts summed to
43; its own listed bullets numbered 39), (3) the sub-heading taxonomy was
**fabricated**. The bullet **text itself was faithful in both fetches**; only the
quantitative and structural claims were confabulated.

**Rule change (supersedes SKILL.md Phase 1.5 protocol step 3):** bullet counts and
document structure MUST be established by mechanical extraction
(`gh api --jq .body` / `curl` + `grep -c` + `comm`), never by asking a WebFetch
prompt to count. WebFetch remains valid for retrieving verbatim text only.

### ERRATA-31-2 — window-diffing minified bundles yields false positives (NEW)

Diffing N-character context windows around a keyword across two minified bundles
reports spurious additions, because identifier renaming shifts every byte offset.
Here it falsely flagged two heredoc guard strings as new in 221; exact-literal
counting showed both present in 220 with identical counts (2 = 2).

**Rule:** binary-source claims must use **exact string occurrence counts**
(`index()` loop), and set comparison must be over extracted literals, never
context windows.

### ERRATA-31-3 — the `/fork` downgrade is itself refuted

The Phase 1 agent downgraded bullet #34 from HIGH to MEDIUM citing
`isolation:"worktree"` 0/0, `worktree`+`fork` co-occurrence 32/32, and
`WorktreeCreate` 83/83. Those probes count machinery that predates the change and
are insensitive to the change itself. Re-measuring against the actual new copy
settles it.

| Literal | 2.1.220 | 2.1.221 |
|---|---|---|
| `create a new worktree of your own with` | **0** | **4** |
| `This conversation was forked from a session that is still working in this checkout` | **0** | **2** |
| `a linked worktree the original session is still working in` | **0** | **1** |
| `own-worktree` | 2 | 4 |

**CONFIRMED NEW in 221.** Rating restored to HIGH. Lesson: an absence proof must
target strings belonging to the change itself; counting surrounding
infrastructure proves nothing.

### ERRATA-31-4 — VSCode-scoped bullets cannot be tested against the CLI binary

`Toggle Focus view` 0/0, `Focus view` 12/12. The VSCode extension is a separate
artifact from the CLI binary, so **CLI-binary absence is not evidence against a
VSCode bullet.**

### ERRATA-31-5 — ENH number double-booking (NEW, process defect)

Cycle #30's **report document** and the **shipped ledger** assign different
meanings to the same numbers.

| Number | Report doc (`…report.en.md:420-425`) | Shipped (`CHANGELOG.md`) |
|---|---|---|
| ENH-374 | SubagentStart contract alignment | Stop-family `background_tasks` gating |
| ENH-375 | `MAX_TEAMMATES` reconciliation | CC version detection Strategy 0 |
| ENH-376 | `registerSpawn` positional args | Roster identity |
| ENH-377 | Register `DirectoryAdded` (**P3 parked**) | `MAX_TEAMMATES` single-source + locked RMW |

**ENH-377 is therefore double-booked**, and the one cycle-#30 item genuinely still
unimplemented — `DirectoryAdded` registration — is **orphaned with no valid
number**.

**Additional correction:** at the start of this analysis, memory recorded
"highest ENH = 371, new candidates from 372, and 372–377 are all unimplemented."
**All of that was wrong.** Direct ledger measurement shows nine items, ENH-372
through ENH-380, were **implemented and shipped** in v2.1.32 (2026-07-28)
(`CHANGELOG.md:19,37,56,80,96,114`). The highest consumed number is **ENH-380**;
new candidates start at **ENH-381**. The numbering SSoT must be pinned to the
ledger.

---

## §4. bkit impact analysis

### 4.1 C1 — the `btw` name collision (headline)

Extracting the **88** `local-jsx` built-in command names from the CC binary and
intersecting them with bkit's 44 skill names yields exactly one match — **`btw`**.
Near-misses that dodge by suffix convention: `plan-plus` (vs `plan`),
`mobile-app` (vs `mobile`), `desktop-app` (vs `desktop`), `skill-status`
(vs `status`), `code-review` (vs `review`).

**bkit found this before CC did.** `CHANGELOG.md:161-166` (v2.1.32, 2026-07-28)
records that bare `/btw` answers "isn't available in this environment" rather
than "Unknown command" — evidence that CC knows the name and gates it — and that
a sweep of all user-invocable skills found this to be the only collision, after
which the namespaced form `/bkit:btw` was adopted.

- **Was `/bkit:btw` broken before 221? — No.** The namespaced form was verified
  working end-to-end on v2.1.220. Bullet #18 targets **bare-name shadowing** only.
- **Does this create a new version floor? — No.** bkit does not depend on the
  bare form, so it gains nothing and owes nothing. **Recommendation: do not revert**
  to the bare form; the namespaced form is version- and mode-independent.
- **Residual risk (CONFIRMED):** the v2.1.32 fix landed in the SKILL.md
  **frontmatter** and the cto-lead tip, but not in the SKILL.md **body** or its
  sibling surfaces. Six surfaces still advertise the bare form, and one **emits it
  to the user at runtime**: `scripts/cto-stop.js:101` —
  `` `Use /btw list to review, /btw promote {id} to create skills.\n` `` (directly
  verified). The rest: `skills/btw/SKILL.md` (14 sites in the body),
  `skills/bkit/SKILL.md:81,147`, `commands/bkit.md:282`,
  `skills/skill-create/SKILL.md:142`, `agents/skill-needs-extractor.md:120`.
  → **ENH-381**
- **Residual risk (UNVERIFIED):** bullet #18 is scoped to **non-interactive**
  sessions. In the interactive TUI the built-in `btw` can run, so bare `/btw`
  there likely still resolves to CC's built-in — a **worse failure mode** (silent
  wrong-target) than the current visible refusal. Experiment needed on 221:
  `claude -p --plugin-dir . '/btw test'` versus typing `/btw test` in the
  interactive TUI. Not run this cycle.

### 4.2 C2 — effort enum mismatch (a bkit defect revealed by a CC change)

Bullet #11's mention of effort `xhigh`/`max` exposed that bkit's guard enum is too
narrow. CC's actual enum was confirmed from the binary:

| Enum | Values | Binary occurrences |
|---|---|---|
| Runtime effort (full) | `low, medium, high, xhigh, max` | `["low","medium","high","xhigh","max"]` **8×** |
| Persisted effort | `low, medium, high, xhigh` | `["low","medium","high","xhigh"]` 9×, "Persisted effort level for supported models" |

bkit's side (`lib/domain/guards/invariant-10-effort-aware.js:24`):

```js
const VALID_EFFORT_LEVELS = Object.freeze(['low', 'medium', 'high']);
```

`normalize()` (`:98-103`) resolves both `xhigh` and `max` to `'medium'`. A session
running at CC's **highest** reasoning effort therefore receives bkit's **middle**
defense verbosity.

**To be precise — this is not a silent failure.** `check()` (`:72-88`)
simultaneously fires a finding with `kind: 'out-of-range'` and `severity: 'HIGH'`.
But its note reads `'effort.level out of range — defense modules will degrade
safely'` (`:84`), and calling a downgrade from the highest effort tier "safely" is
inaccurate. It also fires on every high-effort session, making it alert noise.
→ **ENH-382**

### 4.3 C3 — `/fork` worktrees: a state void with a guard-blocked recovery path

The full chain is verified.

1. All bkit state resolves under `${PROJECT_DIR}/.bkit/` (`lib/core/paths.js:19-21`;
   30+ `STATE_PATHS` entries at `:23-76`).
2. `.bkit/` is gitignored (`.gitignore:58`).
3. A `/fork`-created worktree is therefore a fresh checkout with **no** `.bkit/`.
   `ensureBkitDirs()` (`paths.js:92-106`) silently recreates an empty skeleton and
   `initPdcaStatusIfNotExists()` (`hooks/startup/context-init.js:84`) initializes a
   blank PDCA status. The fork starts at zero: no PDCA phase, no memory, no trust
   profile, no checkpoints, no audit trail.
4. **The recovery path is blocked by design.** `restoreFromPluginData()`
   (`lib/core/paths.js:286-321`, wired at `hooks/startup/restore.js:20-21`) applies
   the #48 cross-project guard (`:292-317`), `realpathSync`-normalizing
   `meta.projectDir` against the current `PROJECT_DIR` and returning
   `{restored: [], skipped: ['backup belongs to different project: …']}` when they
   differ. **A worktree has a different path.** So the guard that prevents project
   A leaking into project B also prevents a fork from recovering its own parent's
   state — and does so without surfacing anything to the user (the skip reason is
   returned, not displayed).
5. **The existing warning does not cover this.** `lib/core/worktree-detector.js:58-84`
   (wired at `hooks/startup/context-init.js:68-81`) does fire in a linked worktree,
   but its message (`:69-72`) concerns issue #46808 ("hooks may not fire — run bkit
   from the primary repository") and says nothing about state absence. Worse, its
   advice **directly conflicts with what CC's new system prompt instructs the fork
   to do.**

A latent gap thus became **reachable by default** in v2.1.221. → **ENH-383**

**UNVERIFIED (must confirm before designing a fix):** `backupToPluginData()`
(`:223-279`) rewrites `meta.projectDir` with the current `PROJECT_DIR` on every
backup (`:271`) and is called from SessionEnd
(`scripts/session-end-handler.js:40-41`). If `CLAUDE_PLUGIN_DATA` is shared
between a session and its fork, the fork's SessionEnd would repoint
`meta.projectDir` at the worktree, after which **the original session's restore
would also be refused**. The scope of `CLAUDE_PLUGIN_DATA` (per-session,
per-project, or per-plugin) must be established first.

### 4.4 C4 — SubagentStart emits 9 fields, not 7

Read directly from the 221 binary, the base spread is:

```js
{session_id:n, transcript_path:BD(n), cwd:Ot(), prompt_id:cRt()??void 0,
 permission_mode:e, agent_id:r?.agentId, agent_type:o, effort:a}
```

`effort` is an **object** `{level: …}`, not a bare string, resolved from
`getAppState().effortValue` and overridden by any `permissionLayers` entry with
`kind === "effort"`. Including `hook_event_name`, that is **9** fields.

Still absent (unchanged from cycle #30): `agent_name`, `model`, `team_name`,
`tool_input`, `depth`, `parent_agent_id`, `parent_tool_use_id`.

The contract comment at `scripts/subagent-start-handler.js:92-96` enumerates only
**7**, omitting `permission_mode` and `effort`. → **ENH-385**

**Cycle #30's open question is closed:** "Does SubagentStart fire at depth 2+?" —
**yes.** The same file at `:92-93` records a verbatim v2.1.220 capture showing
depth-1 and depth-2 spawns produce an identical field set. Since the payload
carries no depth or parent field, **firing is confirmed but tree reconstruction
remains impossible.**

### 4.5 C5 — the zsh `[[ ]]` fix: bkit is structurally immune

bkit's Bash defense does not tokenize; it regex-scans the whole command string
(12 unanchored patterns at `lib/control/destructive-detector.js:34-126`, 22 at
`lib/defense/heredoc-detector.js:89-208`). The CC bug lived in *permission
traversal over a tokenized AST* — the `DoubleBracketOpen`/`Close` lexer tokens
already existed in 220, so the fix was in traversal — and a word-splitting trick
that hides a token from a parser **cannot hide the literal bytes from a regex**.
This is the same dodge-by-convention pattern as the pipe-matcher case.

**Differentiation #6 (heredoc) needs no change.** #58904 remains
CLOSED/NOT_PLANNED, the binary heredoc guard literals are unchanged at 2 = 2, and
none of the 39 bullets addresses it.

### 4.6 C6 — plugin lifecycle and MCP

All assessed Neutral.

- **Immediate activation (#30):** bkit's three `/reload-plugins` references
  (`skills/bkit-rules/SKILL.md:268`, `commands/bkit.md:292`,
  `skills/claude-code-learning/SKILL.md:259`) all describe post-*edit* reload during
  development, not post-install activation. None becomes wrong.
- **Marketplace-name warnings (#3):** `marketplace.json:3` = `bkit-marketplace`,
  `plugin.json:2` = `bkit`. `claude plugin validate .` on CC 2.1.221 → **passes,
  0 warnings**. Empirically settled.
- **`"."` as skills path (#31):** `plugin.json` has no `skills` key. Not applicable.
- **MCP:** both servers hardcode `protocolVersion: '2024-11-05'`
  (`servers/bkit-pdca-server/index.js:719-725`,
  `servers/bkit-analysis-server/index.js:408-414`) and advertise no `skills`, so
  `tengu_mcp_skills_funnel` and `skills-capable` are inert for bkit (CC will not
  send `skills/list`). **One monitor item:** against
  `tengu_mcp_protocol_negotiation_stdio`, bkit responds with a pinned version rather
  than echoing the client's request. Under MCP semantics a server answering with a
  version it supports is correct, but if a future negotiation gate enforces a
  floor, this is the line that breaks. Monitor item, not an ENH.

---

## §5. ENH roadmap (Phase 3 brainstorming)

### 5.1 Intent discovery

- **What is the maximum value bkit can extract from this upgrade?** Not new
  feature adoption but **restored self-consistency**. 221 created no new problems;
  it revealed three existing ones.
- **What critical change must not be missed?** None. Breaking 0, hook events
  31 = 31, skill parsing unchanged. Even the one changed default (`/fork`
  worktrees) breaks no bkit code — it only makes a latent gap reachable.
- **What native feature could replace an existing workaround?** None. All three
  differentiation streaks (heredoc, parallel cache, plugin hook drop) remain
  unfixed, and the `btw` mitigation is namespace-based and stays valid regardless
  of CC's fix.

### 5.2 Alternative exploration — ENH-383 (fork state void)

| Option | Description | Assessment |
|---|---|---|
| A | **Detect + warn**: extend `worktree-detector` to detect the state void and state explicitly that recovery was refused by the #48 guard | **Adopted** — minimal implementation, and it corrects the now-wrong existing advice |
| B | Cross-worktree state synchronization | Rejected — a feature, not a fix; cannot be designed while `CLAUDE_PLUGIN_DATA` scope is unknown |
| C | Add a worktree exception to the #48 guard | Rejected — weakens cross-project leak defense; no reliable way to identify a parent-fork relationship today |
| D | Do nothing | Rejected — CC's system prompt is actively steering users down this path |

Even under option A, the essential part is **surfacing** `restoreFromPluginData`'s
skip reason to the user (today it is returned but never displayed).

### 5.3 YAGNI review

| ENH | Needed now? | Consequence of not doing it | Verdict |
|---|---|---|---|
| 381 | Yes | Runtime keeps advertising a command that does not work | **Accept** |
| 382 | Yes | Defense verbosity downgraded on highest-effort sessions + persistent HIGH alert noise | **Accept** |
| 383 | Yes | Silent state loss on a path 221 now steers users toward by default | **Accept (warning scope only)** |
| 384 | Yes | Recommended version stays pinned to a no-op hotfix (220) | **Accept** |
| 385 | Yes | A hand-verified contract record stays inaccurate — the exact drift ENH-376 existed to eliminate | **Accept** |
| 386 | No | None — no defense module currently branches on subagent-scope effort | **Defer** |
| 387 | No | None — bkit has no multi-worktree rule, so it would surface a condition it cannot act on | **Defer** |

### 5.4 Priority assignment

| ENH | P | Description | Key files |
|---|---|---|---|
| **ENH-381** | **P1** | Finish propagating bare `/btw` → `/bkit:btw` across 6 surfaces, including one runtime emitter | `scripts/cto-stop.js:101`, `skills/btw/SKILL.md` (14 sites), `skills/bkit/SKILL.md:81,147`, `commands/bkit.md:282`, `skills/skill-create/SKILL.md:142`, `agents/skill-needs-extractor.md:120` |
| **ENH-382** | **P1** | Add `xhigh`/`max` to `VALID_EFFORT_LEVELS`; make out-of-range escalate rather than downgrade; fix the note wording | `lib/domain/guards/invariant-10-effort-aware.js:24,72-88,98-103`, `docs/adr/0010-effort-aware-invariant.md` |
| **ENH-383** | **P1** | Detect and warn on the fork-worktree state void; surface the recovery-refusal reason | `lib/core/worktree-detector.js:58-84`, `lib/core/paths.js:292-317`, `hooks/startup/context-init.js:68-81` |
| **ENH-384** | P2 | Advance `RECOMMENDED_VERSION` 2.1.220 → 2.1.221 + doc sync | `lib/infra/cc-version-checker.js:49-65`, `README.md` |
| **ENH-385** | P3 | Correct the SubagentStart contract comment from 7 to 9 fields; fix the stale fixture | `scripts/subagent-start-handler.js:92-96`, `test/contract/l2-smoke.test.js:74-75` |
| ENH-386 | P2 | *(Deferred)* Consume SubagentStart `effort.level` to scale per-subagent defense verbosity | `scripts/subagent-start-handler.js:110-116` |
| ENH-387 | P3 | *(Deferred)* Register `WorktreeCreate`/`WorktreeRemove` | `hooks/hooks.json` |

**Orphaned item:** cycle #30's `DirectoryAdded` registration lost its valid number
through ERRATA-31-5. It needs renumbering, but remains parked this cycle on YAGNI
grounds (no multi-root rule exists).

### 5.5 Philosophy compliance

| ENH | Automation First | No Guessing | Docs=Code | Verdict |
|---|---|---|---|---|
| 381 | Neutral (adds a grep-assertable invariant) | **Pass** — bare-form breakage empirically reproduced and recorded | **Pass — this is the point** | Accept |
| 382 | Pass (removes a silent downgrade) | **Pass** — CC enum confirmed from the binary (`["low","medium","high","xhigh","max"]`, 8×) | Pass (ADR 0010 needs the same edit) | Accept |
| 383 | Pass (silent void → automated warning) | Pass on the chain (every link read). ⚠️ `CLAUDE_PLUGIN_DATA` scope is **unverified** — do not design around it | Pass (`worktree-detector.js:69-72` message is now misleading) | Accept |
| 384 | Neutral | Pass — validate clean, hooks 31 = 31, zero breaking surface | Pass (README/CHANGELOG sync required) | Accept |
| 385 | Neutral | Pass (payload read directly) | **Pass** | Accept |

> **Note:** ENH-382's No Guessing verdict was *conditional* at Phase 2. The Phase 2
> analyst had no Bash and could not confirm CC's enum, relying on bullet text alone;
> this session confirmed it from the binary and cleared the gate.

### 5.6 Test impact (suite = 347 files)

- **Tests broken by v2.1.221 itself: 0.** No test asserts `RECOMMENDED_VERSION`
  (all 6 repo references live inside `lib/infra/cc-version-checker.js`; zero in
  `test/`), no test asserts CC's hook-event count (31 = 31), and no test depends on
  bare `/btw` resolution.
- **One test breaks by design if ENH-382 lands:**
  `tests/contract/v2114-e-defense-contract.test.js:60-67` (C-05) pins
  `VALID_EFFORT_LEVELS` to exactly `['low','medium','high']` and asserts
  frozen-ness. This is a deliberate contract, so widening it is a **contract
  amendment, not a fix**.
- **One pre-existing stale fixture found:** `test/contract/l2-smoke.test.js:74-75`
  feeds `{"subagent_type":"cto-lead"}` to the handler, but CC sends `agent_type`
  (`scripts/subagent-start-handler.js:111`). The test passes only because the
  handler fails open — it is not exercising the real contract.
- **New tests needed:** worktree state void (L2, ENH-383), differing-`projectDir`
  restore skip (extend `test/integration/session-restore.test.js`), bare-`/btw`
  grep invariant (L1, ENH-381), effort enum cases (extend
  `tests/qa/v2114-invariant-10-effort-aware.test.js`).

---

## §6. Standing tracking items

### Differentiation streaks

All three issues remain CLOSED/NOT_PLANNED with zero corresponding code-fix
bullets among the 39 → **all extend +1**.

| Issue | State | Last updated |
|---|---|---|
| #58904 heredoc pipe bypass | closed/**not_planned** | 2026-07-06 |
| #56293 parallel-team cache regression | closed/**not_planned** | 2026-06-02 |
| #57317 plugin PostToolUse hook drop | closed/**not_planned** | 2026-06-06 |

> **Nuance worth recording:** 221 **did** fix an adjacent Bash permission vector
> (zsh `[[ ]]`). The bypass-hardening area is actively worked while bkit's specific
> vector stays uncovered — a fact that strengthens rather than weakens the moat.

### Open issues

| Issue | State | Last updated | Note |
|---|---|---|---|
| #68110 recursive unbounded fan-out | open | 2026-07-21 | Both the basis for and the counter-evidence to the depth-3 default |
| #78406 spawn cap env var undocumented | open | 2026-07-17 | bkit cannot rely on official docs |
| #64436 background OTEL loss | open | 2026-07-08 | Worked around by bkit's own file ledger |

### Watch items

- **REMOTE-GATE-DRIFT (ongoing)** — the nested depth default still resolves via
  `env var → tengu_hazel_trellis → fallback 3` (literal count 2 = 2 in 221,
  structure identical). It can change server-side without a release, so **version
  pinning cannot defend against it**; setting `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`
  explicitly is the only deterministic control.
- **SUBAGENT-HOOK-CONTRACT (ongoing, scope widened)** — the field count is
  confirmed as 9, not 7. Tree reconstruction remains impossible for want of
  depth/parent fields.
- **MCP protocol negotiation (new)** — against
  `tengu_mcp_protocol_negotiation_stdio`, both bkit servers hardcode `2024-11-05`.
- **org-memory cluster (new)** — 4 gates, no bullet. Adjacent to differentiation #1.
- **CC hook coverage** — bkit registers 22 of CC's 31 = **71%** (unchanged).
  The 9 unregistered: PostToolBatch, PermissionDenied, Setup, Elicitation,
  ElicitationResult, WorktreeCreate, WorktreeRemove, DirectoryAdded, MessageDisplay.

---

## §7. Conclusion

**bkit is compatible with CC v2.1.221.**

- `claude plugin validate .` → passes, 0 warnings (run directly on 2.1.221)
- CC hook-event set 31 = 31; all 22 bkit registrations remain valid
- Skill frontmatter `context:`/`background:` parsing unchanged → the 8 fork skills
  are unaffected (the `/fork` change is a **different**, session-level mechanism)
- Nested depth control identical to 220 → the ENH-372/373/374 work in v2.1.32
  remains correct and sufficient
- **0** breaking changes among 39 bullets
- npm continuity R-1 and R-2 both CLEAN

→ **164 consecutive compatible releases** (v2.1.34 – v2.1.221).

**Recommend advancing `RECOMMENDED_VERSION` from 2.1.220 to 2.1.221 (ENH-384).**
Rationale: (1) 221 fixes a bkit-adjacent bug (the `btw` class) plus a Bash
permission bypass, both strictly better for bkit users; (2) it is test-free — all
6 references to the constant live in the implementation file, none in `test/`;
(3) 220 was a no-op hotfix while 221 is the substantive release; (4) npm `stable`
is at 2.1.220 with `latest`/`next` at 2.1.221, so recommending 221 keeps bkit one
step ahead of stable, consistent with how 2.1.220 was adopted.

Two conditions: ship it with README and CHANGELOG doc sync (Docs=Code), and record
the rationale in the comment block at `lib/infra/cc-version-checker.js:49-58` —
noting explicitly that **the `btw` fix is not the reason** (bkit does not rely on
the bare form), so the advance carries no new hard floor.

### Do these first (not ENH items)

1. **Pin the ENH numbering SSoT to the ledger** — to prevent ERRATA-31-5 from
   recurring. `CHANGELOG.md` is the single source, not memory or report documents.
2. **Confirm the three unverified items** — (a) how bare `/btw` actually resolves
   in the 221 interactive TUI, (b) the scope of `CLAUDE_PLUGIN_DATA`, (c) how
   `push-event-guard`'s `action === 'ask'` path behaves in unattended background
   sessions.

> This skill is **analysis-only**. ENH-381 through ENH-387 are proposals;
> implementation belongs to a separate PDCA cycle. No code or version changes were
> made in this cycle.

---

## Appendix A — verification commands (reproduction)

```bash
# Phase 1.5 dual source (mechanical counting — never ask WebFetch to count)
curl -sL https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md -o CHANGELOG.md
sed -n '3,44p' CHANGELOG.md > ch-221.txt
gh api repos/anthropics/claude-code/releases/tags/v2.1.221 --jq '.body' > gh-body-221.txt
grep -cE '^\s*[-*] ' ch-221.txt gh-body-221.txt          # 39, 39
comm -3 <(grep -E '^\s*[-*] ' ch-221.txt  | sed -E 's/^\s*[-*] //' | sort) \
        <(grep -E '^\s*[-*] ' gh-body-221.txt | sed -E 's/^\s*[-*] //' | sort)   # empty

# Category distribution
for w in Added Fixed Improved Changed Reduced Removed; do
  printf "%-10s %s\n" "$w" "$(grep -cE "^\s*[-*] \[?[A-Za-z]*\]? ?$w " gh-body-221.txt)"
done

# Binary: exact literal counts (no window diffing — ERRATA-31-2)
cnt(){ perl -e '$s=shift;$f=shift;open(F,"<:raw",$f);local $/;$d=<F>;$c=0;$p=0;
  while(($p=index($d,$s,$p))>=0){$c++;$p++} print "$c\n";' "$1" "$2"; }
cd ~/.local/share/claude/versions
cnt 'create a new worktree of your own with' 2.1.220   # 0
cnt 'create a new worktree of your own with' 2.1.221   # 4
cnt '["low","medium","high","xhigh","max"]' 2.1.221     # 8
cnt 'tengu_hazel_trellis' 2.1.220; cnt 'tengu_hazel_trellis' 2.1.221   # 2, 2

# Feature gate set comparison
for v in 2.1.220 2.1.221; do
  perl -ne 'while(/tengu_[a-z0-9_]+/g){print "$&\n"}' $v | sort -u > /tmp/gates-$v.txt
done
comm -23 /tmp/gates-2.1.220.txt /tmp/gates-2.1.221.txt   # 28 removed
comm -13 /tmp/gates-2.1.220.txt /tmp/gates-2.1.221.txt   # 24 added

# Extract CC's 88 local-jsx built-ins, intersect with bkit skill names
perl -e 'open(F,"<:raw",shift); local $/; $d=<F>; %n=(); $p=0;
  while(($p=index($d,"local-jsx",$p))>=0){ $s=$p-600; $s=0 if $s<0;
    $w=substr($d,$s,700); while($w=~/name:"([a-z0-9][a-z0-9:_-]{1,28})"/g){$n{$1}=1} $p++ }
  print join("\n", sort keys %n),"\n";' 2.1.221 > /tmp/cc-builtins.txt
comm -12 <(sort -u /tmp/cc-builtins.txt) \
         <(find skills -name SKILL.md -exec sh -c 'grep -m1 "^name:" "$1" | sed "s/^name: *//"' _ {} \; | sort)
# → btw

# Architecture measurement
ls -1 agents/*.md | wc -l                    # 34
find skills -name SKILL.md | wc -l           # 44
find lib -name '*.js' | wc -l                # 195
find scripts -name '*.js' | wc -l            # 66
find test tests -name '*.test.js' | wc -l    # 347  (both test/ and tests/ exist)

# ENH numbering SSoT (the ledger)
grep -oE 'ENH-3[0-9]{2}' CHANGELOG.md | sort -u -t- -k2 -n | tail -3   # ENH-378..380

# Standing tracking
for n in 68110 78406 64436 58904 56293 57317; do
  gh api repos/anthropics/claude-code/issues/$n \
    --jq '"#\(.number) \(.state)\(if .state_reason then "/"+.state_reason else "" end) \(.updated_at[0:10])"'
done

# npm continuity (R-1 integer-gap walk)
npm view @anthropic-ai/claude-code time --json | python3 -c "
import json,sys; t=json.load(sys.stdin)
print([f'2.1.{i}' for i in range(210,222) if f'2.1.{i}' not in t] or 'no gaps')"
```
