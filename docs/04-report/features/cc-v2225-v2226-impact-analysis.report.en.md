# CC v2.1.225 → v2.1.226 Impact Analysis Report (Cycle #35)

- **Analysis date**: 2026-08-09
- **Range**: CC CLI v2.1.225 → v2.1.226 (single-version delta)
- **Installed CC**: 2.1.226 · **npm latest**: 2.1.226
- **bkit plugin**: v2.1.34
- **Verdict**: **Breaking 0 — no migration required.** Consecutive compatible releases **168 → 169**
- **RECOMMENDED_VERSION**: **hold at 2.1.220**

> Produced in v2.1.37 (ENH-436) as the English sibling of
> `cc-v2225-v2226-impact-analysis.report.ko.md`. The Korean file shipped in cycle
> #35 without a pair, which the bilingual rule for new `docs/` files requires. A
> repository-wide audit found it to be the only unpaired base of 56.

---

## 1. Executive Summary

**This cycle's conclusion is unusually strong: v2.1.226 ships the same JavaScript
bundle as v2.1.225.** The difference is three build-banner fields (VERSION,
BUILD_TIME, GIT_SHA) and nothing else; the remaining 27.9 MB of JS body matches
exactly after normalization.

The CHANGELOG offers a single bullet — `Bug fixes and reliability improvements`.
This is an **opaque release**: there is no text to investigate. The whole
analysis was therefore carried out as **direct binary measurement**, and that
measurement is the headline.

One derived proposition is particularly useful. **Every judgement made about
v2.1.225 transfers unchanged to v2.1.226.** Compatibility, risk, and tracked
issue states are logically identical, so nothing needs re-evaluating.

### Four-Perspective Value Table

| Perspective | Assessment |
|---|---|
| **User** | The upgrade is **harmless and pointless**. 225 → 226 changes no behaviour, so there is neither a reason to take it nor a reason to avoid it. **Keep the recommendation at 2.1.220** — the #84892 and #84925 regressions are naturally still unresolved in 226 |
| **Developer** | All 25 hook-contract tokens unchanged (exact counts match). **Zero code changes required** |
| **Architecture** | This cycle's output is not a CC impact but a **method**: a protocol for opaque releases and a way to decide binary equivalence (ENH-420, ENH-421) |
| **Business** | "v2.1.226 verified" can be claimed publicly **with evidence** — but the claim must be scoped to **one macOS x86_64 binary** (see §6) |

---

## 2. Phase 1.5 — Raw Source Verification Gate

**Gate: PASS.** The main session established the totals mechanically before using
them (the ERRATA-31-1 procedure), so there are zero count errata.

| Field | Agent reported | Raw verified | Source | Verdict |
|---|---|---|---|---|
| Added | (supplied as premise) | 0 | raw CHANGELOG | match |
| Fixed | (supplied as premise) | 0 | raw CHANGELOG | match |
| Improved | (supplied as premise) | 0 | raw CHANGELOG | match |
| Breaking | (supplied as premise) | **0** | raw CHANGELOG | match |
| Total bullets | (supplied as premise) | **1** | raw CHANGELOG | match |

**The complete v2.1.226 CHANGELOG section, verbatim:**

```
## 2.1.226

- Bug fixes and reliability improvements
```

Additional verification:

- Retrieval: `curl -sL raw.githubusercontent.com/.../CHANGELOG.md` (no WebFetch, per ERRATA-31-1)
- raw CHANGELOG md5: `9e4eec3861c1b33cd815f64f9da8f211`
- GitHub release body (`gh release view v2.1.226`) = `## What's changed\n\n- Bug fixes and reliability improvements\n`
  → **symmetric difference of 0** against the raw CHANGELOG
- Release time: `2026-08-08T02:48:05Z`
- No category sub-headings (`### Added` etc.) — re-confirming ERRATA-33-1

> **Opaque-release determination**: one bullet, and its content is non-specific.
> CHANGELOG-based analysis carries **zero information** here, so the binary
> measurement in §3 is the only basis available.

---

## 3. Binary Measurement — the substance of this cycle

Both binaries were present locally and compared directly.

| Item | 2.1.225 | 2.1.226 |
|---|---|---|
| Path | `~/.local/share/claude/versions/2.1.225` | `~/.local/share/claude/versions/2.1.226` |
| Size | 289,284,768 B | 289,284,768 B (**identical**) |
| md5 | `081b02db15e27192caedf84c96cf0d56` | `8b6cde0e1009f954454af60f8f62682d` |
| Format | Mach-O 64-bit executable **x86_64** | same |

### 3.1 Byte level

```
cmp -l → 918,852 bytes differ
first offset 73,085,125 · last offset 289,275,816
```

**The sizes are exactly equal and 918 thousand bytes differ.** Unchanged size plus
bulk substitution is the signature of a same-length recompile, and §3.3 confirms
the cause.

### 3.2 Hook contract surface — every item unchanged

Exact occurrence counts taken with `grep -a -o -F` **directly against the raw
binary** (excluding `strings` chunking artifacts — see ERRATA-35-1).

| Token | 225 | 226 | Verdict |
|---|---|---|---|
| `PreToolUse` | 133 | 133 | match |
| `PostToolUse` | 188 | 188 | match |
| `SessionStart` | 110 | 110 | match |
| `SubagentStop` | 73 | 73 | match |
| `hookSpecificOutput` | 124 | 124 | match |
| `additionalContext` | 186 | 186 | match |
| `permissionDecision` | 34 | 34 | match |
| `continueOnBlock` | 3 | 3 | match |
| `refusedBySafeguard` | 13 | 13 | match |
| `UNREVIEWED` | 1 | 1 | match |
| `allowing sub-agent output` | 4 | 4 | match |

By the `strings` set as well, 12 hook events and 13 contract fields — **25 tokens,
all with delta 0** (`PreToolUse` 67/67, `PostToolUse` 68/68, `UserPromptSubmit`
37/37, `SessionEnd` 27/27, `PreCompact` 27/27, `PostCompact` 25/25,
`TaskCompleted` 19/19, `hookEventName` 14/14, `systemMessage` 23/23,
`suppressOutput` 8/8, `stopReason` 39/39, `updatedInput` 80/80, `allowedTools`
87/87, `disallowedTools` 40/40 …).

### 3.3 JS bundle equivalence — the decisive evidence

Extracting printable runs of 200 characters or more from the CC binary leaves
essentially the JS bundle body (27.9 MB).

| Stage | 225 | 226 | Difference |
|---|---|---|---|
| Raw JS region size | 27,906,243 B | 27,906,244 B | +1 B |
| Raw md5 | `f057b5d3…` | `f1f2bebc…` | mismatch |
| Differing lines after sorting | — | — | **228** (114 pairs) |

Pairing the 114 pairs by longest common prefix and extracting only the differing
spans, **all 114 differed in exactly three fields**:

| Field | 2.1.225 | 2.1.226 |
|---|---|---|
| `VERSION` | `2.1.225` | `2.1.226` |
| `BUILD_TIME` | `2026-08-07T19:37:58Z` | `2026-08-08T00:42:40Z` |
| `GIT_SHA` | `d4b76e8c52c2391af51b60cc71a513246c40a129` | `e140b3281c1e8d834468889bd0a5c3fd2f15507c` |

This build banner is **inlined at 114 points** in the bundle.

**Re-measured after normalization** (the three banner fields replaced by constants):

| Stage | Result |
|---|---|
| Differing lines after normalization | **228 → 2** |
| What the remaining 2 are | The CSS token `--md-bg:#0d0d0d;…--md-link:hsl(210 100% 72%)` — one character longer on the 226 side, a trailing `"` (249 B vs 250 B) |
| Cause | A `strings` extraction-boundary artifact. The adjacent byte (in the bytecode region) happens to be a printable `"` in 226, extending the run by one character |

So the substantive JS difference after normalization is **zero**, and the
one-byte size difference is entirely explained by the same artifact.

### 3.4 Full string-literal comparison

Comparing the complete set of prose literals (12 characters or more, containing
whitespace):

| Item | Result |
|---|---|
| Literals in 225 | 62,871 |
| Literals in 226 | 62,871 |
| Present only in 226 | **0** |
| Present only in 225 | **0** |

**Not a single user-visible string changed.**

### 3.5 Overall determination

> **The shipped JS bundle of v2.1.226 is equivalent to v2.1.225.**
> The difference is three build-banner fields, and the 918 thousand differing
> bytes are confined to the Bun-compiled bytecode and pointer regions regenerated
> as a consequence of the banner change.

---

## 4. bkit Impact Analysis

### 4.1 Impact matrix

| bkit component | Measured scale | Impact | Basis |
|---|---|---|---|
| Agents | 34 | **none** | Frontmatter parser strings unchanged, contract tokens delta 0 |
| Skills | 44 | **none** | `allowed-tools` and hook integration surfaces unchanged |
| Hook events | 12 registered | **none** | §3.2 exact counts all match |
| Lib modules | 197 | **none** | CC API surface unchanged |
| Scripts | 67 | **none** | stdin/stdout protocol strings unchanged |
| MCP servers | 2 | **none** | Protocol negotiation strings unchanged |

**Conclusion: zero code changes required. Zero test impact. No migration.**

### 4.2 Derived propositions — nothing to re-evaluate

Because the JS is equivalent, the following are **logically settled** with no
further investigation:

1. **v2.1.226 fixes nothing new.** The tracked issues #84892 (hook env silently
   stripped) and #84925 (conditional hook misfiring) remain **unresolved** in 226.
   The code did not change, so they cannot have been fixed.
2. **v2.1.226 introduces no new regression either.** Risk delta against 225 is zero.
3. **F-1 from cycle #34 (the third subagent-handoff classifier fail-open) is
   present in 226 unchanged.** Re-confirmed by `refusedBySafeguard` 13 and
   `UNREVIEWED` 1. The mitigation strategy (the prose layer) needs no change.

### 4.3 RECOMMENDED_VERSION determination

Current value: `lib/infra/cc-version-checker.js:65` → `'2.1.220'`

**Verdict: hold at 2.1.220.**

Rationale: 226 ≡ 225, and the reason cycle #34 held at 225 (#84892, #84925) still
applies. 226 does not resolve it, so there is no basis for raising the
recommendation. **"No change" is itself the reason it cannot be raised** — a
clarifying side effect of this cycle.

---

## 5. ENH Roadmap (Phase 3 brainstorming)

### 5.1 Intent discovery

- **What is the maximum value bkit can take from this upgrade?** Not a CC feature
  but an **analysis capability**. Opaque releases will certainly recur, and if the
  method established here is not turned into an asset, the next cycle repeats the
  same exploration cost (15+ tool calls).
- **What critical change must we not miss?** None — established by measurement.
- **Which native feature replaces an existing workaround?** None.

### 5.2 Priority assignment

ENH numbering starts at **420** (417 in use; 418 and 419 reserved as candidates).

| ID | Priority | Content | Target files | Test impact |
|---|---|---|---|---|
| **ENH-420** | **P1** | **Codify the opaque-release protocol in the skill** — when the CHANGELOG has ≤1 bullet or its content is non-specific, make a binary-equivalence determination mandatory after Phase 1.5. Specify the procedure (banner normalization → JS run hash → exact contract-token counts) and the rule that equivalence transfers the previous cycle's judgement forward | `skills/cc-version-analysis/SKILL.md`, `agents/cc-version-researcher.md` | Contract TC: the opaque-release section exists in SKILL.md |
| **ENH-421** | **P1** | **Script the binary equivalence check** — `strings -n 200` extraction → normalize the three banner fields → md5 comparison → exact `grep -a -o -F` contract-token count table, in a single command. Collapses a procedure that took 15+ manual tool calls this cycle into one | new `scripts/cc-binary-equivalence.js` | Unit TC: identical binary → equivalent; banner-only fixture → equivalent; one added literal → not equivalent |
| **ENH-422** | **P2** | **Record binary provenance in the cycle memory** — arch, file size, md5, `GIT_SHA`, `BUILD_TIME`. Scopes the verification claim honestly and makes cross-platform gaps trackable | `memory/cc_version_history_*.md` format, `skills/cc-version-analysis/SKILL.md` | Format TC |

### 5.3 YAGNI review

| ID | Genuinely needed? | Cost of not doing it | Better approach in a future CC? | Verdict |
|---|---|---|---|---|
| ENH-420 | ✅ Opaque releases will recur | The next cycle re-derives the method from scratch | None (a bkit-internal procedure, unrelated to CC) | **pass · P1** |
| ENH-421 | ✅ 15+ tool calls this cycle | Expensive manual repetition every cycle, with room for error (ERRATA-35-1) | None | **pass · P1** |
| ENH-422 | ✅ Needed to scope the claim | Risk of overclaiming (§6) | None | **pass · P2** |
| ~~ENH-423 candidate~~ | ❌ | Encoding a "225 ≡ 226 equivalence class" into `cc-version-checker` was considered, but it changes nothing a user would do | — | **YAGNI reject · dropped** |

> The ENH-423 candidate is dropped explicitly. An equivalence class is a
> **report-level fact**, not something runtime code needs to know.

### 5.4 Dependencies

- ENH-420 → ENH-421 (the protocol defines the script's specification)
- ENH-422 is independent

---

## 6. Limits of this verification (stated plainly)

To prevent overclaiming:

1. **One macOS x86_64 binary was examined.** Linux, Windows and arm64 builds were
   not.
2. **`GIT_SHA` did change** (`d4b76e8c…` → `e140b328…`, about five hours between
   builds), so **real commits exist** upstream. The claim here is not "there were
   no commits" but **"those commits did not change the shipped macOS x86_64 JS
   bundle."** Non-bundle assets, other platforms' code paths, and test/CI changes
   are not observable by this method.
3. **The bytecode region was not decompiled.** It is generated from the same JS
   and was treated as equivalent, which is an inference rather than a direct
   verification.

---

## 7. Philosophy compliance

| Principle | Met | Note |
|---|---|---|
| **Automation First** | ✅ | ENH-421 automates exactly the manual procedure used here |
| **No Guessing** | ✅ | With the CHANGELOG carrying zero information, the analysis switched to binary measurement instead of speculation, and caught its own false positive under ERRATA-35-1 |
| **Docs = Code** | ✅ | ENH-420 updates SKILL.md and the agent definition together |

---

## 8. ERRATA from this cycle

### ERRATA-35-1 (HIGH, methodology) — a `strings` diff is not evidence of a semantic change

A `strings -n 5` set comparison produced **1,315 added / 1,226 removed**, and the
analysis nearly concluded "one net new literal: `Push when Claude decides`".

**That was entirely a false positive.**

- `Push when Claude decides` is **present in both binaries** (exact count 5/5 on
  the raw files).
- The diff was a **trailing-byte artifact**. For example: `_boolean` (225) ↔
  `_booleanI` (226), `_float32I` (225) ↔ `_float32` (226), `Entered plan mode`
  (225) ↔ `Entered plan modezE` (226). The literal body is identical; the
  **adjacent bytecode byte** differs, which moves the `strings` extraction
  boundary.

**Lessons (mandatory for the next cycle):**

1. Never use a `strings` set diff as **sole evidence**.
2. Re-confirm every delta candidate with
   `grep -a -o -F <token> <binary> | wc -l` — the **exact occurrence count on the
   raw binary**.
3. **Normalize the build banner first** (VERSION, BUILD_TIME, GIT_SHA). Without
   it, all 114 inline banner sites register as phantom deltas.

### ERRATA-35-2 (LOW, environment) — macOS tool differences

- `cat -A` does not exist in BSD `cat` — do not assume GNU.
- `tr` against a binary fails with `Illegal byte sequence` unless `LC_ALL=C` is set.

---

## 9. Standing tracker update

### 9.1 Retained

| Item | State | 226 impact |
|---|---|---|
| #84892 hook env silently stripped | unresolved | **unchanged (identical code)** — the reason RECOMMENDED_VERSION is held |
| #84925 conditional hook misfiring | unresolved | **unchanged (identical code)** |
| F-1 third subagent fail-open (#34) | present | re-confirmed in 226 by `refusedBySafeguard` 13 / `UNREVIEWED` 1 |
| PRIVACY.md disagrees with current fact (ENH-404) | unresolved | unrelated to CC; still needed |

### 9.2 New watch items

| Item | Reason |
|---|---|
| **Frequency of opaque releases** | 226 is the first. If it recurs, CHANGELOG reliability itself becomes a tracked risk and ENH-421's priority rises |
| **Cross-platform bundle divergence** | `GIT_SHA` changed while the x86_64 bundle did not. Watch whether changes that apply only to other platforms become more common |

---

## 10. Architecture measurement (independent re-measurement)

Measured directly by the main session (Numeric Correction Protocol).

| Item | Measured | Command |
|---|---|---|
| Agents | **34** | `ls -1 agents/ \| wc -l` |
| Skills | **44** | `ls -1 skills/ \| wc -l` |
| Lib modules | **197** | `find lib -name '*.js' \| wc -l` |
| Scripts | **67** | `ls -1 scripts/ \| wc -l` |
| Hook events (registered) | **12** | parsed from `hooks/hooks.json` |
| bkit plugin version | **2.1.34** | `bkit.config.json` |

> The SessionStart banner's "195 Lib Modules" has been updated to **197** (+2).

---

## 11. Unverified, prioritized for the next cycle

1. **Binary equivalence on other platforms** — whether 226 ≡ 225 also holds for
   Linux/arm64 builds. Cheap to determine once ENH-422's provenance record exists.
2. **When the #84892 / #84925 fixes land** — check first in the earliest release
   after 227 whose JS actually changes.
3. **Bytecode-region equivalence** — currently an inference. A Bun bytecode parser
   could be considered if needed (low value for the cost; P3 today).

---

## 12. Verdict

**v2.1.226 is a rebuild of v2.1.225.** The shipped macOS x86_64 JS bundle is
equivalent apart from three build-banner fields, and all 25 tokens of bkit's hook
contract surface are unchanged.

- **Breaking 0** → consecutive compatible releases **169**
- **Zero bkit code changes required**
- **RECOMMENDED_VERSION held at 2.1.220** — 226 resolves no regression, so it
  cannot be raised
- **Three new ENH items** (ENH-420, ENH-421 at P1; ENH-422 at P2) — none of them a
  CC response, all of them **turning opaque-release analysis into an asset**

The real value of this cycle is not a CC change but a **reproducible answer to
"what do you decide on when the CHANGELOG says nothing"** — and, along the way,
one of the analysis's own false positives was rejected by measurement
(ERRATA-35-1).
