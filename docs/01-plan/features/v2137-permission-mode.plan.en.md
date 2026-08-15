# v2137-permission-mode Planning Document

| | |
|---|---|
| Feature | `v2137-permission-mode` |
| Target release | v2.1.37 |
| Branch | `feat/v2.1.37-permission-mode-awareness` |
| Phase | plan |
| Analysis | [`v2137-permission-mode.analysis.en.md`](../../03-analysis/features/v2137-permission-mode.analysis.en.md) |

## Executive Summary

| Perspective | Statement |
|---|---|
| **Problem** | `claude --dangerously-skip-permissions` does not stop bkit from interrupting the session. bkit never reads the `permission_mode` field Claude Code sends on every hook event, so it reinstates a confirmation step the user explicitly switched off. In an unattended run that confirmation has nobody to answer it, and the agent stalls instead of failing. |
| **Solution** | A single domain policy module decides whether a decision may be emitted, given the host's permission mode and the decision's grade. Ask-grade findings are suppressed in the three modes that mean "nobody is watching"; critical denials are never suppressed. Three coupled defects found in the same code path are fixed with it. |
| **Function / UX effect** | Under `--dangerously-skip-permissions`, `dontAsk`, or `acceptEdits`, bkit stops asking. Under `default` and `plan` nothing changes. `rm -rf /`, force pushes, `curl … \| sh` and SQL drops stay refused in every mode. |
| **Core value** | bkit's guardrails become **proportionate to stated intent** rather than absolute. A guard that refuses correct work is one people switch off, and then it protects nothing — the same principle v2.1.34 wrote onto G-001 and v2.1.36 applied to issue #148, now applied to the layer above the rules. |

## Context Anchor

| Key | Value |
|---|---|
| **WHY** | A user running with permissions explicitly skipped was still stopped at `PreToolUse` on every session. Measured cause: zero of bkit's 10 decision surfaces consult `permission_mode`. |
| **WHO** | Anyone running bkit unattended — Trust Level 3/4 sprints, `claude -p` pipelines, CI, and the `/sprint start` full-auto path bkit itself recommends. |
| **RISK** | Relaxing too far removes a real safety net. Mitigation: the grade split — `ask` relaxes, `critical` never does — plus negative controls in every test run. |
| **SUCCESS** | The reproduction matrix shows mode-dependent columns for ask-grade rows, an unchanged `deny` row in all 7 modes, and 100% of negative controls still stopped. |
| **SCOPE** | F1 (mode awareness) + F8/F9 (dead guard, unapplied lifecycle) + F3/F4 (rule precision). Maintainer decision D1. |

## 1. Overview

### 1.1 Purpose

Make every bkit decision surface aware of the permission mode the host is running in, and
make the guardrail rules precise enough that the surfaces rarely need to fire in the first
place.

### 1.2 Background

See the analysis document for the full inventory and measurements. The three facts that
drive this plan:

1. Claude Code runs `PreToolUse` hooks **before** the permission prompt, so a hook decision
   is not something `bypassPermissions` can bypass. The host is behaving as documented.
2. `grep -rn "permission_mode" scripts lib hooks agents skills` returns nothing. bkit is the
   component ignoring stated intent.
3. In any non-interactive run, a hook `ask` is a refusal — measured on `bypassPermissions`,
   `dontAsk` and `acceptEdits` alike.

### 1.3 Related documents

- Analysis: `docs/03-analysis/features/v2137-permission-mode.analysis.{en,ko}.md`
- Design: `docs/02-design/features/v2137-permission-mode.design.{en,ko}.md`
- Precedent: issue #148 → v2.1.36 guardrail precision (`test/e2e/external-dogfood/sinclair-seo-148-guardrail-precision.test.js`)
- Policy: ADR 0016 — the Destructive Detector cannot be disabled at runtime

## 2. Scope

### 2.1 In scope

| ID | Item |
|---|---|
| **F1** | Read `permission_mode` and gate ask-grade decisions on it, across all 10 decision surfaces |
| **F8** | Feed the ENH-263 guard from `permission_mode` instead of a payload field CC never sends; correct the `cc-payload.port.js` typedef that caused it |
| **F9** | Apply `removeWhen(ccVersion)` in the defense coordinator so retired regression guards stop firing |
| **F3** | G-007 must not fire on read-only commands that merely contain the word `delete` or `remove` |
| **F4** | The phase-9 deployment guard and the Zero-Script-QA guard must grade their targets instead of refusing on a bare substring |

### 2.2 Out of scope

| Item | Why |
|---|---|
| `S11` PreCompact `exit 2` | Blocks compaction, not a tool call; no permission semantics |
| `S12` Stop-hook continuation | `decision:'block'` on Stop means *continue*; opposite polarity |
| Migrating `decision:'block'` → `hookSpecificOutput.permissionDecision:'deny'` (F5) | The legacy shape demonstrably works; a schema migration is a separate, testable change and mixing it in would confound this release's evidence |
| Any version bump before release | Maintainer assigns the version at release time; recorded here as the target only |

## 3. Requirements

### 3.1 Functional

| ID | Requirement |
|---|---|
| FR-1 | `parseHookInput()` exposes the host's permission mode as a normalized value |
| FR-2 | A pure policy function maps `(mode, grade) → emit \| suppress` with no I/O |
| FR-3 | `ask`-grade decisions are suppressed in `bypassPermissions`, `dontAsk`, `acceptEdits` |
| FR-4 | `critical`-grade denials are emitted in **every** mode, without exception |
| FR-5 | An absent or unrecognized `permission_mode` is treated as `default` — today's behaviour |
| FR-6 | A suppressed decision is still written to the audit trail, with the mode and the rule that would have fired, so suppression is observable rather than silent |
| FR-7 | The ENH-263 guard reads the real mode; both regression guards respect `removeWhen()` |
| FR-8 | G-007 counts delete *operands*, not tokens that happen to follow the word |
| FR-9 | The phase-9 and QA substring guards grade their match and route through the same policy |

### 3.2 Non-functional

| ID | Requirement |
|---|---|
| NFR-1 | No added I/O on the hook hot path — the policy is a pure function |
| NFR-2 | Hook cold-start stays within the existing performance test budget |
| NFR-3 | Backward compatible to bkit's runtime floor (CC 2.1.78) via FR-5 |
| NFR-4 | Code, comments and messages in English (project rule); `docs/` bilingual |
| NFR-5 | The Destructive Detector remains impossible to disable at runtime (ADR 0016 / IV-09) |

## 4. Success criteria

### 4.1 Definition of done

| SC | Criterion | Evidence |
|---|---|---|
| SC-1 | Ask-grade rows in the reproduction matrix differ by mode | matrix output |
| SC-2 | Every negative control is still stopped, in all 7 modes | matrix, 49/49 |
| SC-3 | The 14 benign-but-blocked cells measured before the change go to 0 | matrix |
| SC-4 | Full suite ≥ baseline: 4364 TC, 0 failures | `node test/run-all.js` |
| SC-5 | Live `claude -p --plugin-dir .` run confirms the new behaviour end to end | QA report |
| SC-6 | `scripts/docs-code-sync.js` reports 0 drift | CI |

### 4.2 Quality criteria

- Every rule change ships with a negative control in the same test file.
- No finding is closed on reasoning alone; each has a measurement or a cited line.

## 5. Risks and mitigation

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Relaxation removes protection users depend on | Medium | High | Grade split (D3): only `ask` relaxes. Negative controls enforce it per run |
| `acceptEdits` inclusion (D2) suppresses asks a watching user wanted | Medium | Medium | Accepted by the maintainer. Note: CC still applies its own prompt policy for non-filesystem Bash in `acceptEdits`, so removing bkit's ask does not make the call unsupervised |
| Reviving ENH-263 (F8) emits attribution for a regression fixed 113 releases ago | High if F9 skipped | Low | F9 is in the same scope precisely to prevent this |
| G-007 narrowing (F3) introduces a false negative | Medium | High | Negative controls added for genuine mass deletions before narrowing the pattern |
| Suppression becomes invisible | Medium | Medium | FR-6: audit entry on every suppressed decision |

## 6. Impact analysis

### 6.1 Changed resources

| Resource | Change |
|---|---|
| `lib/domain/policy/permission-mode-policy.js` | new — pure decision policy |
| `lib/core/io.js` | `parseHookInput` + the three output helpers accept a mode |
| `scripts/unified-bash-pre.js` | 7 decision sites pass the mode; 2 substring guards graded |
| `scripts/pre-write.js` | 2 decision sites pass the mode; ENH-263 context corrected |
| `scripts/permission-request-handler.js` | mode-aware deny |
| `lib/control/destructive-detector.js` | G-007 operand counting |
| `lib/cc-regression/defense-coordinator.js` | apply `removeWhen()` |
| `lib/domain/ports/cc-payload.port.js` | typedef corrected to the measured payload |

### 6.2 Current consumers

All 28 hook handlers load `lib/core/io.js`. The output helpers gain an optional trailing
parameter, so every existing call site keeps compiling and keeps its current behaviour when
the mode is absent (FR-5) — the change is additive by construction.

### 6.3 Verification

Reproduction matrix (before/after) · full node suite · live `claude -p --plugin-dir .` ·
`docs-code-sync` · GitHub Actions `contract-check` and `cc-regression-reconcile`.

## 7. Architecture considerations

Maintainer selected **Option B** (D4): a new pure module under `lib/domain/policy/`,
consulted by `lib/core/io.js`. This matches the existing `lib/domain/guards/` pattern — pure
domain functions, no FS or network — and keeps the whole decision table in one testable
place, where 7 modes × 3 grades can be asserted exhaustively rather than sampled across ten
call sites.

Options A (inline at each site) and C (hidden module-scope state in `io.js`) were presented
and declined. A reproduces the very shape of this defect: one policy copied to ten places,
where the eleventh site is the one that gets forgotten.

## 8. Convention prerequisites

- Pure domain modules: no `require('fs')`, no `child_process`, no network — asserted by
  `test/architecture/`.
- All new code, comments and audit strings in English.
- New `docs/` files ship as `.en.md` + `.ko.md` siblings.

## 9. Next steps

`/pdca design v2137-permission-mode` → implement → test → live QA → docs sync → PR.

## Version History

| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-08-14 | Initial plan, after the analysis phase and maintainer decisions D1–D4 |
