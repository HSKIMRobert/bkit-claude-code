# CC v2.1.228 → v2.1.232 Impact Analysis Report (Cycle #37)

> Output of the `/bkit:cc-version-analysis` workflow
> Date: 2026-08-14 · baseline: CC v2.1.227 · target: CC v2.1.232
> bkit version: v2.1.37 (`.claude-plugin/plugin.json`)

---

## Executive Summary

The headline for this range is that **CC v2.1.232 turned subagent forking on by default in
interactive sessions, and as a side effect the model lost the means to ask for foreground
execution at all**. When fork mode is on, CC **removes** the `run_in_background` parameter from
the Agent tool schema. This is not inference — CC's own documentation states it
(`sub-agents.md:1064`), and the session that produced this report was running in exactly that
state.

The impact on bkit splits **cleanly in two**.

- **The skill path is safe.** The `background: false` that v2.1.31 added to the 8 `context: fork`
  skills still holds on 232. Confirmed by binary measurement — the skill's background decision
  function **does not call** the fork gate, and its logic is identical across all four builds
  (227/228/231/232).
- **The Agent-tool path degrades.** bkit's sprint machinery awaits a Task-tool result
  synchronously in **5 places**, and under fork mode these degrade **deterministically** to
  `no_output` / `no_json` / `agentSpawner returned invalid output` — not to a crash.

Meanwhile **the hook contract is entirely unchanged**. Ten markers were re-measured across four
binaries to certify Breaking = 0, and **consecutive compatible releases go 170 → 171**.

The most uncomfortable finding is not in CC but in bkit itself. **19 of ENH-420~439 never
landed.** The ledger number climbed to 473 only because v2.1.36/37 assigned 440~473 to
*different* work; the improvements cycles #35 and #36 produced are still sitting there. In
particular `cc-version-checker.js` has **no upper bound, so a v2.1.232 user is graded `ok`
today** — even though this cycle classified the fork default change as unverified.

### Four-Perspective Value Table

| Perspective | Value in this range |
|---|---|
| **User** | Under interactive sessions, bkit sprint gate measurement fails honestly with `no_output` rather than silently. It still fails, though. |
| **Developer** | Binary measurement proved the skill defense needs no work — unnecessary effort avoided. Response narrows to 5 Agent-spawn sites. |
| **Operations** | v2.1.228 fixed `~/.claude/projects/<project>/memory/` being caught by the retention sweep. This workflow's rolling state lives at exactly that path. |
| **Quality** | Interactive live coverage is **zero**. The harness is `-p`-only, so it cannot detect a fork default even in principle. |

---

## 1. Verification Gate (Phase 1.5)

The main session established the totals **first** and handed them to the research agent as a
premise (the ERRATA-31-1 procedure). This keeps the streak at **four consecutive cycles with
zero count errata**.

| Field | Agent reported | Raw verified | Source | Verdict |
|---|---|---|---|---|
| v2.1.232 bullets | 49 | 49 | raw CHANGELOG.md | match |
| v2.1.231 bullets | 1 | 1 | raw CHANGELOG.md | match |
| v2.1.230 bullets | section absent | **section absent + never published to npm** | CHANGELOG + `npm view … versions` | match |
| v2.1.229 bullets | 32 | 32 | raw CHANGELOG.md | match |
| v2.1.228 bullets | 18 | 18 | raw CHANGELOG.md | match |
| **Total** | **100** | **100** | sum | **match** |

**R-2 confirmed — v2.1.230 is a skipped version.** Triple-checked: no CHANGELOG section, absent
from `npm view @anthropic-ai/claude-code versions`, and no binary in
`~/.local/share/claude/versions/`. Not a documentation gap; the version does not exist.

**npm publish times (measured)**

| Version | Published (UTC) |
|---|---|
| 2.1.227 | 2026-08-10T20:56:57Z |
| 2.1.228 | 2026-08-11T17:45:45Z |
| 2.1.229 | 2026-08-12T19:28:48Z |
| 2.1.231 | 2026-08-13T08:27:21Z |
| 2.1.232 | 2026-08-13T21:30:53Z |

**dist-tags**: `latest`=2.1.232 · `next`=2.1.232 · `stable`=**2.1.223** (moved up from 2.1.220
since the previous cycle)

---

## 2. Related Documents

- Previous report: `docs/04-report/features/cc-v2226-v2227-impact-analysis.report.{ko,en}.md`
- Defect response history: `CHANGELOG.md` `[2.1.36]`, `[2.1.37]`
- Monitoring guide: `docs/06-guide/cc-version-monitoring.guide.md`
- ADR 0006 (Empirical Validation Gate), ADR 0014, ADR 0016

---

## 3. CC Change Research

### 3.1 Distribution

| Version | bullets | HIGH | MED | LOW | bkit-relevant |
|---|---|---|---|---|---|
| 2.1.232 | 49 | 2 | 8 | 39 | 8 |
| 2.1.231 | 1 | 0 | 0 | 1 | 0 |
| 2.1.229 | 32 | 2 | 4 | 26 | 6 |
| 2.1.228 | 18 | 2 | 3 | 13 | 5 |
| **Total** | **100** | **6** | **15** | **79** | **17** |

### 3.2 The Six HIGH Items

| ID | verbatim (leading) | Impact |
|---|---|---|
| 232-01 | `Subagent forking is now on by default: a subagent_type: "fork" subagent inherits the full…` | This cycle's headline |
| 232-29 | `Fixed a startup race that could silently unregister a plugin marketplace due to concurrent writes…` | Risk of losing bkit's marketplace registration |
| 229-02 | `Added server-supplied Claude Code hook support for self-hosted runner sessions…` | Hook provenance widened (contract unchanged) |
| 229-28 | `Changed /commit-push-pr so git/gh commands with dangerous flags … no longer auto-approved` | Overlaps and gaps vs bkit guardrails |
| 228-08 | `Fixed session cleanup deleting contents inside a project's memory folder` | This workflow's rolling-state path |
| 228-09 | `Fixed background plugin-cache cleanup deleting a plugin's cache when its only version is a symlinked…` | bkit development checkout |

### 3.3 232-01 Fork Default — Confirmed in the Binary

**The main session reproduced every one of the research agent's claims** (satisfying ERRATA-32-5).

The byte-level basis for the default flip — the final fall-through changed from `"disabled"` to
`"default"`:

```js
// 2.1.231 — final fall-through "disabled"
function SO_(){ if(Cme())return"disabled";
  if(Q.CLAUDE_CODE_FORK_SUBAGENT===!0)return"env";
  if(Q.CLAUDE_CODE_FORK_SUBAGENT===!1)return"disabled";
  if(kn())return"disabled";
  if(rt(bO_,!1))return"gb_rollout";      // bO_ = "tengu_copper_fox", default false
  return"disabled" }

// 2.1.232 — final fall-through "default" (= enabled)
function Yrb(){ if(Y.CLAUDE_CODE_FORK_SUBAGENT===!0)return"env";
  if(Nn())return"disabled";              // Nn() = !isInteractive()
  return"default" }
```

Independent corroboration — the rollout gate was **deleted, not renamed**:

| Marker | 227 | 228 | 231 | 232 |
|---|---|---|---|---|
| `tengu_copper_fox` | 2 | 2 | 2 | **0** |
| `copper_fox` | 2 | 2 | 2 | **0** |
| `CLAUDE_CODE_FORK_SUBAGENT` | 4 | 4 | 4 | **7** |
| `forkSubagent` | 0 | 0 | 0 | **5** |
| `run_in_background` | 49 | 49 | 49 | 50 |
| `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS` | 6 | 6 | 6 | 6 |

**On 232 there are exactly three ways fork mode turns off**: non-interactive (`-p`/SDK),
coordinator mode, and `CLAUDE_CODE_FORK_SUBAGENT=0`.

The official docs say so (`sub-agents.md:1059`, verbatim):

> "Claude Code turns fork mode on by default in interactive sessions and leaves it off by
> default in non-interactive mode with `-p` and in the Agent SDK. **The interactive default
> requires Claude Code v2.1.232 or later.**"

And decisively (`sub-agents.md:1064`, verbatim):

> "Claude Code runs the subagents Claude spawns in the background, forks and named subagents
> alike… **Claude Code also removes the Agent tool's `run_in_background` parameter, so Claude
> can't ask for the foreground.**"

**That sentence was demonstrated live in the session that wrote this report.** This session's
Agent tool schema exposes only `description / isolation / model / prompt / subagent_type` — no
`run_in_background`. The research agent call ran in the background and its result arrived as a
later-turn notification.

Precedence (`sub-agents.md:793-798`): ① `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1` → foreground
(regardless of fork mode) ② in-process teammate spawns → foreground ③ fork mode on → background,
foreground cannot be requested ④ fork mode off → background by default, foreground requestable.

An `Agent(fork)` deny rule **blocks forks only and leaves background execution in place**
(`:1071`). Permission rules are therefore not a mitigation.

### 3.4 229-28 `/commit-push-pr` — The Real Deny List Is 56 Patterns

What the CHANGELOG's "etc." concealed. Extracted from the 231/232 binaries:

```js
hli=["git commit *--fil*","git commit * -F*","git commit *--te*","git commit * -t*",
     "git commit *--pathspec-fr*","git commit *--no-veri*","git commit *--no-g*",
     "git commit *--am*","git commit *--allow-empty*","git commit *--reu*","git commit *--ree*"],
gli=["git push *--force*","git push * -f*","git push *--de*","git push * -d*","git push * :**",
     'git push *":**',"git push *':**","git push * +*",'git push *"+*',"git push *'+*",
     "git push *--pu*","git push * -o*","git push *--m*","git push *--pru*",
     "git push *--no-veri*","git push *--rece*","git push *--e*"],
yli=["gh pr create *--repo*","gh pr create * -R*","gh pr create *--body-file*", …],
_li=["git checkout *--f*","git checkout * -f*"],
bli=["git add --f*","git add * --f*","git add -f*","git add * -f*","git add --c*","git add * --c*"],
Dqp=["gh pr edit *--repo*", …]
ySH=cYe([...bli,...hli,..._li,...gli,...yli,...Dqp]);   // Bash(x)+PowerShell(x) doubled = 112 rules
```

The allow list narrowed at the same time: `git commit *` → `git commit -m *`,
`gh pr create *` → `gh pr create --title * --body *`.

### 3.5 231 — A One-Line Release That Actually Landed Substance

231's CHANGELOG is a single MCP OAuth fix, but **231 is the binary where the `launcher_hooks`
validator actually landed** (0/0/**30**/30, reproduced by the main session). A generic release
note must not be read as "no change" (ERRATA-37-5).

```js
// 2.1.231
m5v=/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,62}\.(py|sh)$/,
h5v=new Set(["Stop","SubagentStop","UserPromptSubmit","SessionStart","SessionEnd",
             "PreToolUse","PostToolUse","PreCompact","Notification"]);
```

`SubagentStart` is **not** a member of that set, which is why its count stays pinned at 36 — the
decisive discriminator for attributing the 231 delta.

---

## 4. bkit Impact Analysis

### 4.1 Architecture Measurement (Cycle #37)

| Item | Value | Measurement command |
|---|---|---|
| Agents | 34 | `ls -1 agents/*.md \| wc -l` |
| Skills | 44 | `ls -1d skills/*/ \| wc -l` |
| Lib modules | 199 | `find lib -name '*.js' \| wc -l` |
| Lib subdirs | 22 | `ls -1d lib/*/ \| wc -l` |
| Scripts | 66 | `find scripts -name '*.js' \| wc -l` |
| `test/` | 344 | `find test -name '*.test.js' \| wc -l` |
| `tests/` | 33 | `find tests -name '*.test.js' \| wc -l` |
| plugin version | 2.1.37 | `.claude-plugin/plugin.json` |

**Definition note**: scripts counts as 62/66/67 depending on how you count. That is a definition
difference, not an erratum.

### 4.2 Skill Path — No Impact (Confirmed in the Binary)

The skill's background decision is a **separate function** and does not call the fork gate. The
main session reproduced it across three versions:

```js
// 227  function lQo(e,t){ if(t||Ev()||Rn())return!1; return e.background??!0 }
// 231  function xai(e,t){ if(t||Vv()||kn())return!1; return e.background??!0 }
// 232  function Xyi(e,t){ if(t||k0()||Nn())return!1; return e.background??!0 }
```

It consults only the skill's own `background`, `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS`, and
non-interactive mode. It calls the fork gate `HRe()` **zero times**.

The docs agree (`skills.md:339`): `background` applies only with `context: fork`, defaults to
`true`, and `false` means waiting for the result within the invoking turn.

**So v2.1.31's mitigation holds on 232, and skill frontmatter needs no change.**

The 8 skills in question (measured): `phase-1-schema`, `phase-2-convention`, `phase-3-mockup`,
`phase-4-api`, `phase-5-design-system`, `phase-8-review`, `skill-status`, `zero-script-qa`.

> **Correction**: the rolling memory's "9 skills with `background: false`" is wrong. The measured
> figure is **8**; 9 was the count *before* qa-phase left the fork set (ERRATA-37-4).

### 4.3 Agent-Tool Path — Five Sites That Degrade Deterministically

Where bkit consumes a Task-tool result synchronously (all verified directly by the main session):

| # | Location | Code | Result under fork mode |
|---|---|---|---|
| ① | `lib/application/quality-gates/measure-router.js:426` | `agentResult = await runner({ subagent_type, prompt })` | `:309` `typeof agentResult.output !== 'string'` → `reason:'no_output'` |
| ② | `lib/application/sprint-lifecycle/measure-gate.usecase.js:104` | `await routerImpl.measureGate(gateKey, sprint, {agentTaskRunner})` | propagates from ① |
| ③ | `lib/application/sprint-lifecycle/master-plan.usecase.js:392` | `const result = await d.agentSpawner({...})` | `:396-398` hard fail `agentSpawner returned invalid output` |
| ④ | `lib/infra/sprint/gap-detector.adapter.js:118` | `await o.agentTaskRunner({subagent_type:'gap-detector'})` | `:125-126` `matchRate:0, measured:true` |
| ⑤ | `lib/infra/sprint/auto-fixer.adapter.js:69` | `await o.agentTaskRunner({subagent_type:'pdca-iterator'})` | `:75` `fixedTaskIds:[], error` |

The host adapter at `scripts/lib/sprint-handler-shared.js:478-481`:

```js
return async ({ subagent_type, prompt }) => {
  const result = await host.invokeTaskTool({ subagent_type, prompt });
  return { output: (result && result.text) || '' };
};
```

And the documented contract at `skills/sprint/SKILL.md:257` teaches the synchronous pattern:

```js
return { text: await callTaskTool({ subagent_type, prompt }) };
```

`agents/sprint-orchestrator.md:64-66` repeats `Task({...}) — await completion` three times. That
is the implementation narrative for bkit's publicly advertised differentiation #3,
**"Sequential Dispatch"**.

**Mitigating factors (do not overstate this)**: all five degrade to an **honest measurement
failure**, not a crash or data corruption. And **bkit never passes `run_in_background` anywhere**
— zero occurrences in runtime code across the whole repository (the only two hits are prose in
past reports). The parameter removal is therefore harmless in itself; the residual risk is
**when the result arrives**, not what the schema accepts.

**④ is a separate defect, though.** The same file at `:88-89` uses the honest encoding
`matchRate:null, measured:false` for `no_agent_runner`, while `:125-126` records a runner error
as `matchRate:0, measured:true` — recording something unmeasured as measured-and-scored-zero.
Same class as ENH-410/412.

### 4.4 232-43 Input Redirection — Pure Gain

`permissions.md:407`: "PreToolUse hooks run **before the permission prompt**." Permission checking
happens *after* the hook, so `tool_input.command` is unchanged. bkit already handles this —
`destructive-detector.js:421` treats `<` as a segment boundary. **No change needed.**

### 4.5 228-17 Write Tool — Zero bkit Surface

`tools-reference.md:466-472` states the boundary: Opus 4.6 / Haiku 4.5 **and older** still require
the read; newer models follow the same rules as read-before-edit. bkit's pinned models (Opus 5 /
Sonnet 5 / Fable 5 / Haiku 5) are all "newer". Tool-layer enforcement persists, and
`scripts/pre-write.js` contains **no** read-tracking code (measured). **Surface: zero.**

### 4.6 228-08 Memory Folder — Zero Code Impact, HIGH Operational Impact

`memory.md` reflects the 228 fix, stating that `~/.claude/projects/<project>/memory/` is
**excluded** from the retention sweep. No bkit runtime code is affected. However, **this
workflow's rolling state lives at exactly that path**, and was at risk of loss on v2.1.227 and
earlier. Whether that caused the stale memory observed in cycle #36 (ERRATA-36-2) is
**unverified**, and we do not speculate.

### 4.7 232-29 Marketplace Race Condition — Real Exposure

`~/.claude/plugins/known_marketplaces.json` holds both `claude-plugins-official` and
`bkit-marketplace`, satisfying the precondition for the race. bkit's runtime **does not read**
this file, so it cannot detect the problem itself. 232 fixing it is a pure gain — but **users
below 232 can silently lose bkit's marketplace registration**, which adds one more argument for
ENH-437 (KNOWN_BAD).

Side confirmation: the `additionalMarketplaces` / `allowedMarketplaces` aliases appear new in the
232 binary (0/0/0/**9** and 0/0/0/**4**). `CUSTOMIZATION-GUIDE.md:1755,1779,1783` documents only
the old keys.

---

## 5. Compatibility Assessment

### 5.1 Hook Contract Certification — Breaking 0

**The main session independently re-measured ten markers across four binaries.**
Command: `grep -a -o -F -e '<needle>' -- <binary> | wc -l`

| Marker | 227 | 228 | 231 | 232 |
|---|---|---|---|---|
| `hookSpecificOutput` | 124 | 124 | 124 | 124 |
| `continueOnBlock` | 3 | 3 | 3 | 3 |
| `permissionDecision` | 34 | 34 | 34 | 34 |
| `permissions.deny` | 9 | 9 | 9 | 9 |
| `forked_skill_depth_cap` | 2 | 2 | 2 | 2 |
| `bashCommandClamp` | 42 | 42 | 42 | 42 |
| `hook_event_name` | 78 | 78 | 78 | 78 |
| `stop_hook_active` | 7 | 7 | 7 | 7 |
| `"SubagentStart"` | 13 | 13 | 13 | 13 |
| `launcher_hooks` | 0 | 0 | **30** | **30** |

The 227 column matches the previous cycle's measurements exactly — two independent measurements
reproduced.

**Verdict: event vocabulary, input payload schema, and the `hookSpecificOutput` union are all
byte-identical. Breaking 0.** The two substantive changes are both additive:
- 231's `launcher_hooks` allow list (a new surface; the existing contract is untouched)
- 232's parent-agent-aware hook scoping — only **whose** hooks fire changes; payload and blocking
  semantics are unchanged

> **Consecutive compatible releases: 170 → 171 certified.**

**Side note**: `continueOnBlock` at 3/3/3/3 re-confirms cycle #36's conclusion — it is a field on
*prompt-type* hook definitions and is unreachable from bkit's 28 command-type hooks — across the
whole 227~232 range. **ENH-432's withdrawal stands.**

### 5.2 Size and Segments

| Version | bytes | `__TEXT` | `__BUN` | `__LINKEDIT` |
|---|---|---|---|---|
| 227 | 294,700,704 | 71,524,352 | 219,070,464 | 2,545,312 |
| 228 | 298,977,312 | **71,524,352** | 223,313,920 | 2,578,464 |
| 231 | 303,439,136 | 71,077,888 | 228,163,584 | 2,616,608 |
| 232 | 314,779,248 | 74,178,560 | 236,322,816 | 2,700,912 |

**227→228 is byte-identical in the native region** — a payload swap only. 231 and 232 are genuine
native rebuilds.

### 5.3 ADR 0006 Track Verdict

**`defer`.** The reason is Skip Criteria 3 — "unverified upstream behavior". The fork default
changed a contract bkit relies on, and empirical validation has not completed.

- `RECOMMENDED_VERSION = '2.1.220'` **HOLD**
- **But holding alone is an omission.** `cc-version-checker.js:305-311` has only three branches —
  `<MIN → error`, `<RECOMMENDED → warn`, `else ok` — and **no upper bound**. A v2.1.232 user is
  graded `ok` today.
- `release_drift_score` = |stable 2.1.223 − RECOMMENDED 2.1.220| = **3** (within 0–3, no user
  notice required). **This metric cannot express the missing-upper-bound risk.**

---

## 6. Brainstorming Results (Plan Plus)

### 6.1 Intent Discovery

**What is the maximum value bkit can get from this upgrade?**
Certainty about what *not* to do. The fork default change looked like it demanded a v2.1.31-scale
response, and this cycle started that way — but binary measurement established that the skill path
is safe, shrinking the response from "8 skills plus an audit of all 44" down to **5 Agent-spawn
sites**.

**What is the critical change we cannot miss?**
The removal of the `run_in_background` parameter. It narrows the mitigation space — this cannot be
addressed in code, only through environment variables.

**Which native feature could replace an existing workaround?**
229-28's 56-pattern deny list partially overlaps bkit's guardrails. But CC's version is scoped to
the `/commit-push-pr` skill while bkit's is a global Bash hook, so the relationship is
complementary, not substitutive. Overlap is not a reason to remove bkit guards.

### 6.2 Alternatives — Responding to Agent-Spawn Degradation

| Option | Content | Assessment |
|---|---|---|
| **A** | Document `CLAUDE_CODE_FORK_SUBAGENT=0` as a recommendation | Forces the user's environment; bkit telling users to revert a CC default. **Not recommended** |
| **B** | Make the failure messages at all 5 sites fork-mode-aware | Cheap and honest. The user learns the cause. **Recommended** |
| **C** | Revise SKILL.md guidance so the model injects the result on a later turn | More fundamental, but requires interactive validation first |
| **D** | Do nothing | Failure is deterministic and honest, so not the worst outcome. But ④'s `matchRate:0` mis-recording must be fixed regardless |

**Conclusion: B + C (after validation)**. A is rejected.

### 6.3 YAGNI Review

| Candidate | Verdict |
|---|---|
| Adopt `bashCommandClamp` | **DROP** — pinned at 42/42/42/42 and absent from the 16-field agent frontmatter, so unreachable |
| Respond to 232-45 Cowork @-import | **DROP** — bkit's `@import` is its own resolver (`lib/import-resolver.js`), not CC's |
| Respond to 228-17 Write tool | **DROP** — zero bkit surface |
| Respond to 228-09 symlinked cache | **DROP** — the cache is a real copy; development goes through `--plugin-dir` |
| 232-07 GitLab / 229-04 command sources | **DROP** — no impact |
| Re-audit the 8 fork skills | **DROP** — proven safe in the binary |

### 6.4 This Cycle's Top Finding Is the Ledger, Not CC

**Of ENH-420~439, exactly one landed: ENH-424.** Nineteen did not.

```
Never landed: 420 421 422 423 425 426 427 428 429 430 431 432 433 434 435 436 437 438 439
```

The ledger's high-water mark is 473 only because v2.1.36/37 assigned 440~473 to *different* work
(guardrail precision, permission mode). In other words, **the numbers grow while the improvements
these cycles produce just accumulate.** Minting more new numbers this cycle would make that worse.

**This report therefore resumes the unlanded numbers and assigns 474+ only to genuinely new work.**

Carry-over items verified by measurement:

| ENH | Status | Evidence |
|---|---|---|
| 420~422 | not landed | `scripts/cc-binary-equivalence.js` absent |
| 432 | not landed | `marketplace.json:36` still advertises `PostToolUse continueOnBlock` as differentiation #5 |
| 434 | not landed | `skills_preload:` remains in 4 agents (bkend-expert, bkit-impact-analyst, code-analyzer, pdca-iterator) — the other 19 use the correct `skills:` |
| 435 | **partly resolved** | Lib 199 ✓ · Hook Events 21 ✓ · blocks 24 ✓ · Scripts 62 (stated) vs 66 (measured) ✗ |
| 436 | not landed | `cc-v2225-v2226-impact-analysis.report.ko.md` has no `.en.md` sibling |
| 437 | not landed | `cc-version-checker.js:305-311` has no upper bound |

`skills_preload` appears **zero times** in CC's official documentation and is absent from the
16-field agent frontmatter confirmed at `sub-agents.md:285-300`. The real field is `skills:`.

---

## 7. Implementation Proposals (ENH)

### 7.1 Resumed (Unlanded Carry-Overs — Do Not Burn New Numbers)

| ENH | P | Content | Basis |
|---|---|---|---|
| **437** | **P0** | Add a KNOWN_BAD upper bound to `cc-version-checker` | `:305-311` has three branches and no ceiling → a 232 user is graded `ok` today. The 232-29 marketplace race being unfixed below 232 adds to this |
| **432** | **P1** | Withdraw the differentiation-#5 `PostToolUse continueOnBlock` claim; convert the tests to behavioral assertions | `continueOnBlock` 3/3/3/3; all 28 bkit hooks are command-type → unreachable, re-confirmed. The public claim persists at `marketplace.json:36` |
| **434** | **P1** | `skills_preload:` → `skills:` (4 agents) | Zero occurrences in CC docs, absent from the 16 fields. bkit itself uses the correct field in 19 agents (self-contradiction) |
| **433** | **P1** | `outputAllow(msg,'PostToolUse')` writes into the void | Carry-over. **Precondition: measure stdout visibility for the other 8 events** — no inference-driven bulk substitution |
| **420~422** | **P1** | Create `scripts/cc-binary-equivalence.js` | Confirmed absent. This cycle again reconstructed binary measurement by hand |
| **435** | **P2** | `marketplace.json` Scripts count 62 → 66 | The rest is resolved |
| **436** | **P3** | Produce the `.en.md` sibling for the `cc-v2225-v2226` report | Violates the CLAUDE.md bilingual rule |

### 7.2 New (Starting at 474)

| ENH | P | Content | Basis |
|---|---|---|---|
| **474** | **P0** | Establish interactive live coverage | `test/qa-harness-full-live.js:166` is `-p`-only → fork mode OFF. `test/e2e/permission-mode-matrix.test.js` calls hooks directly via `execFile` (CC never starts). `test/e2e/*.sh` likewise. **The fork default is undetectable in principle.** Precondition for clearing ADR 0006 Skip Criteria 3 |
| **475** | **P1** | Make the failure messages at the 5 Agent-spawn sites fork-mode-aware | Option B from §6.2. `measure-router.js:426`, `measure-gate.usecase.js:104`, `master-plan.usecase.js:392`, `gap-detector.adapter.js:118`, `auto-fixer.adapter.js:69` |
| **476** | **P1** | `gap-detector.adapter.js:125-126` should record runner errors as `matchRate:null, measured:false` | Contradicts the honest encoding at `:88-89` in the same file. ENH-410/412 class |
| **477** | **P1** | No guards for `--amend` / `--no-verify` / `git add -f` / `git checkout -f` | Zero of bkit's 16 rules cover these (verified with perl). CC introduced 56 patterns. bkit's global guard is still needed since CC's is `/commit-push-pr`-scoped |
| **478** | **P2** | Revise the synchronous-contract narrative in `sprint/SKILL.md:257` and `sprint-orchestrator.md:64-66` | The docs teach a pattern that no longer holds under fork mode. **Start after 474 validates** |
| **479** | **P2** | Document the new aliases alongside the old keys in `CUSTOMIZATION-GUIDE.md:1755,1779,1783` | `additionalMarketplaces` / `allowedMarketplaces` |
| **480** | **P3** | Remove `when_to_use:` from `agents/pipeline-guide.md:21` | Not among the 16 agent fields (skills-only) → silently ignored. Same class as ENH-434 |

### 7.3 Priority Rationale

**Why only two P0s**: the fork response (ENH-475) was *not* raised to P0. bkit never passes
`run_in_background`, so the schema change is harmless; the failure is deterministic; and **whether
anything actually breaks is still unmeasured**. Assigning P0 to something unmeasured would repeat
cycle #36's ENH-432 error (P0 assigned without verification, then withdrawn). Instead, **the means
of measurement itself (ENH-474) is raised to P0.**

**Why ENH-437 is P0**: this is not a new risk. Cycle #36 already designated it P1 and it never
landed, and CC has shipped five more releases since. A checker with no upper bound gives no signal
at all to users on a version bkit has itself classified as unverified.

---

## 8. GitHub Issue Monitoring

### 8.1 Tracked Set of 22 — 20 OPEN / 2 CLOSED

**Zero behavioral-class resolutions across the five releases 228~232.** The two closures are
documentation issues, 47 minutes apart.

| # | state | Summary |
|---|---|---|
| 84302 | OPEN | Killed PreToolUse hook → CLI ALLOWs the gated tool (fail-open) |
| 84701 | OPEN | PreToolUse deny not enforced for Bash from Task-tool subagents |
| 84632 | OPEN | if-scoped PreToolUse fires unconditionally, doesn't block |
| 84697 | OPEN | Path-specific deny rule silently unenforced for Write/Edit |
| 84926 | OPEN | PreToolUse payload carries no caller identity |
| 84685 / 84493 | OPEN | Worktree isolation is session-global |
| 84892 / 84925 / 84960 | OPEN | Three 2.1.224 regressions |
| 84589 | OPEN | `permissionDecision:'defer'` → tool result lost |
| 84969 | OPEN | `permissions.ask` `:*` position-dependent silent ignore |
| **84939** | **CLOSED** 08-11 | [DOCS] plugin install silently runs `bun install`/`npm ci` |
| 84863 / 84906 | OPEN | Sandbox and permission matcher |
| **84656** | **CLOSED** 08-11 | [DOCS] PreToolUse hook contract: timeout/spawn-failure unstated |
| 78406 / 68110 / 64436 | OPEN | Docs, recursive spawning, OTEL |
| 85665 | OPEN | 2.1.227 interactive sessions never write transcript JSONL |
| 85669 | OPEN | UserPromptSubmit hook not invoked when the prompt contains an attachment |
| 85700 | OPEN | Edit reports success, never writes to disk (worktree + PreToolUse) |

Notably, **the entire PreToolUse fail-open family (84302/84701/84697/84589) remains unresolved**.
bkit's defense layers sit on top of that family.

### 8.2 Window Totals (Truncation Ruled Out)

`gh api -X GET search/issues -f q='repo:anthropics/claude-code is:issue created:2026-08-11..2026-08-14' -f per_page=1 --jq '.total_count'`

- New **971** / closed **480**
- Daily: 08-11 **292** · 08-12 **280** · 08-13 **314** · 08-14 **85** (partial day)
- **292+280+314+85 = 971 — exactly matches the range total. No truncation.**

### 8.3 #85765 — This Cycle's Key Issue (Independently Verified by Main)

`gh issue view 85765 --repo anthropics/claude-code --json number,title,state,createdAt,labels`

- **#85765 · OPEN · created 2026-08-11T08:55:24Z**
- **Labels**: `bug`, `has repro`, `platform:linux`, `area:agents`, `area:agent-sdk`
- **Title**: `Agent(run_in_background: false) does not block — returns spawn metadata instead of the agent's result (v2.1.227)`

This reports that **even on 227, when the parameter could still be passed, it did not block**. 232
removed the parameter outright. So bkit's synchronous Agent-spawn assumption may have been shaky
before 232 as well — **unverified, and not assumed.**

### 8.4 #85699 — Complementary to bkit v2.1.37, Not in Conflict

- OPEN, created 2026-08-11T03:08:15Z, zero comments, names v2.1.227 only
- Substance: a session cannot determine its own effective permission mode. Verbatim: "Claude Code
  knows each session's effective permission mode… **It does not expose it to the model running in
  that session.**"

**bkit verdict**: #85699 is a defect at the **model-context** layer. What bkit v2.1.37 fixed sits
at the **hook-payload** layer, and CC does deliver `permission_mode` to hooks correctly.
**bkit v2.1.37 is not blocked by #85699 and is not invalidated across 228~232.**

### 8.5 Seven New Watch Items

| # | Date | Summary | bkit relevance |
|---|---|---|---|
| **86478** | 08-13 | `bypassPermissions` defaultMode and `--permission-mode` flag ignored | **The `permission_mode` value bkit reads may itself be wrong** — directly touches v2.1.37 |
| **86405** | 08-13 | Pre/PostToolUse hooks not fired for subagent tool calls | Candidate evolved form of #84701; possibly related to 232's parent-agent scoping change |
| 86499 | 08-13 (v2.1.231) | Stall-watchdog cascade failure with 5+ parallel background subagents | Directly tied to the fork default |
| 86000 | 08-12 (v2.1.228) | All Bash commands hang with no child process | |
| 86627 | 08-14 | Desktop namespaces plugin skills by install hash → `/plugin:skill` breaks | Recurrence of the bkit #125 family |
| 86564 | 08-14 | `claude plugin update <name>` fails for a bare name | |
| 85893 | 08-11 | A disabled plugin's PostToolUse still executes | |

**R-3 candidate**: #86405 is submitted as an evolved form of #84701. However, only the top 12 of
the window's 111 new hook issues were reviewed, so **the full classification is incomplete** and
the evolved-form number is not finalized.

---

## 9. Verdict

**Breaking Changes 0 — no migration required.** The hook contract is byte-identical across
227~232, and consecutive compatible releases are certified at **170 → 171**.

**But "compatible" and "safe" are different things.** CC v2.1.232 did not change a contract; it
changed a **default**, and that shook the assumption underlying bkit's Sequential Dispatch. The
skill path survives thanks to v2.1.31's work; the five Agent-path sites degrade deterministically.
How that degradation manifests in real use is **still unmeasured, and there is currently no way to
measure it** — the harness is `-p`-only, so it cannot turn fork mode on even in principle.

**ADR 0006 verdict: `defer`** (Skip Criteria 3, unverified upstream behavior).
`RECOMMENDED_VERSION = '2.1.220'` **HOLD**.

**Recommended order of action**:
1. **ENH-474 (P0)** — interactive live coverage. Without it, the next cycle repeats `defer` from
   the same spot.
2. **ENH-437 (P0, resumed)** — the checker's upper bound. It is the only channel for conveying the
   HOLD decision to users.
3. Everything else is P1 or below.

**This cycle's most uncomfortable finding is not on CC's side.** Nineteen of ENH-420~439 never
landed; the improvements these cycles produce are accumulating while only the numbers advance.
Analysis realizes its value only when it lands.

---

## 10. ERRATA (Cycle #37)

| ID | Severity | Content |
|---|---|---|
| **37-1** | **CRITICAL** | The research agent **cited subagent results it never received as fact**, **three times in one session** (GitHub issues / the binary `launcher_hooks` measurement / #85765's body). The agent self-reported it, and when the main session re-measured, **the content happened to be correct** — but being right does not justify the procedure. ERRATA-36-1 applies not only to subagents but **to the researcher itself.** Amplifying factor: the agent **sent a correction before ever delivering the base report**, leaving the main session receiving corrections with nothing to verify them against. |
| **37-2** | HIGH | On ugrep 7.5.0, a **needle beginning with `-` is parsed as an option and silently returns 0.** `grep -a -o -F -e 'NEEDLE'` or `-F -- 'NEEDLE'` is mandatory. |
| **37-3** | HIGH | **Diffing the binary by the literal flag names in the CHANGELOG misses the actual change.** 229-28 is implemented as truncated globs (`*--no-veri*`), which a literal `--no-verify` search does not find. |
| **37-4** | MED | The rolling memory's "9 skills with `background: false`" is wrong. Measured: **8** (9 was the count before qa-phase left the fork set). |
| **37-5** | MED | **Do not read a one-line generic release as "no change."** 231 is a single CHANGELOG bullet, but it is the binary where the `launcher_hooks` validator landed (0/0/30/30). |
| **37-6** | MED | **A misspelled needle produces a silent 0, and 0 reads as "absent."** `runInBackground`/`forkGate`/`isForkGateEnabled` are 0 in all four builds, while the real symbols are `run_in_background`/`isForkSubagentEnabled`/`getForkSubagentSource`. **Measure multiple spelling candidates.** |
| **37-7** | HIGH | **The rolling memory recorded the ENH ledger at 431 when it was actually 473** (a recurrence of ERRATA-36-2). More importantly, note the *nature* of that gap — the numbers advanced by 42, but **19 of cycles #35/#36's outputs never landed.** The memory tracks numbers and **does not track landing.** |

### Verification Checklist

- [x] Raw GitHub CHANGELOG.md fetched and totals established first (main session)
- [x] Bullet counts cross-verified (agent vs raw) — **match, zero errata**
- [x] v2.1.230 absence triple-confirmed
- [x] Binary claims reproduced by main — fork gate · skill background · 10 markers **all match**
- [x] `sub-agents.md:1059/1064` obtained verbatim independently
- [x] #85765 / #85699 queried independently via `gh`
- [x] All 5 Agent-spawn call sites read directly in source
- [x] ENH ledger measured (473) and **19 unlanded items identified**
- [ ] Empirical validation of interactive fork mode — **carried to ENH-474**
- [ ] stdout visibility for the 8 non-PostToolUse events — carried from #36
- [ ] Full R-3 classification of the window's 111 new hook issues

---

## 11. Unverified (Not Filled In by Speculation)

1. How a Task result is **actually** returned in a fork-mode-ON interactive session — ENH-474
2. #85765's body and repro code (only number, title, state, and labels obtained)
3. `plugin-marketplaces.md` / `settings.md` / `plugins.md` not fetched
4. Whether `~/.claude/plugins/cache/.../2.1.36` is a symlink (based on indirect evidence)
5. Any causal link between the 228-08 memory-folder fix and cycle #36's stale memory
6. Full classification of the window's 111 new hook issues
7. All carry-overs from #36: stdout visibility for the 8 non-PostToolUse events ·
   `bashCommandClamp` reachability · whether `disallowedTools` is actually enforced for plugin
   agents · binary equivalence on other platforms
