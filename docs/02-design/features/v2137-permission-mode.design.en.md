# v2137-permission-mode Design Document

| | |
|---|---|
| Feature | `v2137-permission-mode` |
| Target release | v2.1.37 |
| Plan | [`v2137-permission-mode.plan.en.md`](../../01-plan/features/v2137-permission-mode.plan.en.md) |
| Analysis | [`v2137-permission-mode.analysis.en.md`](../../03-analysis/features/v2137-permission-mode.analysis.en.md) |
| Architecture | **Option B** — new pure domain policy module (maintainer decision D4) |

## Context Anchor

| Key | Value |
|---|---|
| **WHY** | bkit reinstates a confirmation the user explicitly disabled, because no decision surface reads `permission_mode`. |
| **WHO** | Anyone running bkit unattended — Trust L3/L4, `claude -p`, CI, `/sprint start` full-auto. |
| **RISK** | Over-relaxation removes a real safety net. Bounded by the grade split and by negative controls. |
| **SUCCESS** | Ask-grade rows become mode-dependent; deny rows unchanged in all 7 modes; 49/49 negative controls hold. |
| **SCOPE** | F1 + F8/F9 + F3/F4 (D1). |

## 1. Overview

### 1.1 Design goals

1. One place decides whether a decision may be emitted, so the table can be asserted
   exhaustively instead of sampled across ten call sites.
2. The relaxation is bounded by **grade**, not by mode alone: a question may be skipped, a
   refusal may not.
3. Suppression is observable. A guard that goes quiet without a trace is indistinguishable
   from a guard that is broken — the failure mode `lib/core/io.js:640-650` already documents.
4. Additive by construction: absent mode ⇒ today's behaviour, so bkit's CC floor (2.1.78) is
   unaffected.

### 1.2 Design principles

- Pure domain function: no FS, no network, no `child_process` (`test/architecture/` asserts).
- The rule table stays the single place that decides deny-vs-ask (v2.1.34 precedent); this
  design adds the layer that decides *whether an ask reaches anyone*, and nothing else.
- No parameter that cannot change an outcome. Deny helpers deliberately do **not** take a
  mode — see §2.3.

## 2. Architecture

### 2.0 Selected option

Option B was selected over A (inline at each of ten sites) and C (hidden module-scope state
in `io.js`). A reproduces this defect's own shape: one policy copied ten times, where the
eleventh site is the one that gets forgotten.

### 2.1 Component diagram

```
CC hook payload ──► lib/core/io.js
                      parseHookInput()  ──► { …, permissionMode }
                              │
                              ▼
        lib/domain/policy/permission-mode-policy.js   (new, pure)
                      normalizeMode(raw) ──► Mode
                      resolve({ mode, grade }) ──► { emit, reason }
                      isAskSuppressed(mode) ──► boolean
                              │
        ┌─────────────────────┼──────────────────────┐
        ▼                     ▼                      ▼
scripts/unified-bash-pre.js  scripts/pre-write.js   scripts/permission-request-handler.js
  (7 decision sites)          (2 decision sites)      (1 decision site)
        │
        └─► audit-logger: `<action>_suppressed` on every skipped ask (FR-6)
```

### 2.2 The decision table

`grade` is a property of the finding, not of the mode:

| Grade | Meaning | Examples |
|---|---|---|
| `critical` | A shape that is dangerous regardless of who is watching | `rm -rf /`, force push, `curl … \| sh`, `DROP TABLE`, raw-device write |
| `policy` | The user's own written rule, or a path-security boundary | Memory Enforcer directive, scope limiter `DENIED_PATH` / `SYMLINK_ESCAPE` / `NULL_BYTE` |
| `ask` | A confirmation request — reversible or narrowly scoped | scoped `rm -rf ./build`, `git reset --hard`, push to a protected branch |

| grade ＼ mode | `default` | `plan` | `auto` | `acceptEdits` | `dontAsk` | `bypassPermissions` | absent / unknown |
|---|---|---|---|---|---|---|---|
| `critical` | emit | emit | emit | emit | emit | emit | emit |
| `policy` | emit | emit | emit | emit | emit | emit | emit |
| `ask` | emit | emit | emit | **suppress** | **suppress** | **suppress** | emit |

Notes on the three columns that are not obvious:

- **`acceptEdits`** (maintainer decision D2). This mode auto-approves file edits and common
  filesystem Bash commands but still prompts for everything else. Suppressing bkit's ask
  therefore does not make the call unsupervised — Claude Code's own prompt policy still
  applies to non-filesystem Bash. bkit stops adding a second question on top of the host's.
- **`dontAsk`** is documented as auto-denying every call that would otherwise prompt. A bkit
  `ask` in that mode is not a question; it is a refusal with no recourse. Suppressing it is
  what makes the ask tier mean what it says.
- **`auto`** was not measurable in this environment (account eligibility). It is treated as
  human-present and therefore **not** suppressed. This is a policy choice made in the absence
  of measurement, and it is recorded as such rather than presented as a finding.

### 2.3 Why the deny helpers take no mode

`critical` and `policy` emit in every column. A `mode` parameter on `outputBlock` /
`outputBlockWithContext` could never change an outcome, and a parameter that cannot change an
outcome advertises a policy that does not exist — the next reader would reasonably assume
denials are relaxable somewhere. Only `outputAsk` becomes mode-aware.

### 2.4 Two lines of defense

1. **Primary — at the call site.** Each site consults `isAskSuppressed(mode)` before raising
   an ask, writes the `*_suppressed` audit entry, and continues. The site is where the audit
   context lives (rule ids, confidence, command), so this is where it belongs.
2. **Secondary — inside `outputAsk`.** If a call site is ever added and forgets step 1,
   `outputAsk` re-checks and degrades to an allow-with-context rather than emitting the ask.
   This costs one pure function call and removes the "forgotten eleventh site" failure mode
   that Option A was rejected for.

`outputAsk` currently exits the process. Under suppression it emits the allow payload and
returns normally, so the caller's remaining flow (`if (!blocked) outputAllow(...)`) must not
double-print. The call sites are ordered so the primary check prevents reaching the helper at
all in the normal path; the secondary path returns a sentinel the caller checks.

## 3. Data model

```js
/** @typedef {'default'|'plan'|'acceptEdits'|'auto'|'dontAsk'|'bypassPermissions'} PermissionMode */
/** @typedef {'critical'|'policy'|'ask'} DecisionGrade */
/** @typedef {{ emit: boolean, reason: string }} PolicyVerdict */
```

`normalizeMode(raw)`:
- a recognized string ⇒ itself
- `'manual'` ⇒ `'default'` (CC accepts `manual` as a CLI alias for `default`, v2.1.200+)
- anything else, including `undefined` ⇒ `'default'` (FR-5)

## 4. API specification

`lib/domain/policy/permission-mode-policy.js`

| Export | Signature | Behaviour |
|---|---|---|
| `PERMISSION_MODES` | `readonly string[]` | The six documented values |
| `ASK_SUPPRESSING_MODES` | `readonly string[]` | `['acceptEdits','dontAsk','bypassPermissions']` |
| `normalizeMode` | `(raw: unknown) => PermissionMode` | Never throws; unknown ⇒ `'default'` |
| `resolve` | `({mode, grade}) => PolicyVerdict` | Pure lookup over the §2.2 table |
| `isAskSuppressed` | `(raw: unknown) => boolean` | `resolve({mode, grade:'ask'}).emit === false` |

`lib/core/io.js` changes:

| Function | Change |
|---|---|
| `parseHookInput` | adds `permissionMode` (normalized) to the returned object |
| `outputAsk(reason, alternatives, mode)` | third parameter, optional; suppression path per §2.4 |

## 5. Scope of the coupled fixes

### 5.1 F8 — feed ENH-263 from the real signal

`scripts/pre-write.js:340` reads `ctx.input.bypassPermissions`; the measured payload has no
such key, so the guard at `lib/domain/guards/enh-263-claude-write.js:47` has never fired.
It is fed from `permissionMode === 'bypassPermissions'`. `lib/domain/ports/cc-payload.port.js:21`
documents a `permissions` object CC does not send — the origin of the wrong field name — and
is corrected to the measured key list.

### 5.2 F9 — apply the lifecycle that is already declared

`lib/cc-regression/defense-coordinator.js` never calls the `removeWhen(ccVersion)` that both
guards export. On CC v2.1.231 these guards describe regressions fixed at v2.1.118. The
coordinator resolves the running CC version and skips any guard whose `removeWhen` is
satisfied. Without this, §5.1 would start emitting attribution for a regression that no
longer exists — which is why the two ship together.

### 5.3 F3 — G-007 must match a delete *command*

Current: `/\b(rm|del|delete|remove)\b.*(\s+\S+){5,}/i`, applied per segment. The verb may sit
anywhere, so `grep -rn delete src a b c d e` matches (measured).

Fix uses the rule table's existing `suppressIf` extension point (the mechanism ENH-445 and
ENH-447 already use), with a predicate that stands the rule down when the delete verb is not
the segment's command head — after optional `sudo` and `VAR=value` prefixes, and reading
`/bin/rm` as `rm`. `npm remove a b c d e` therefore stops matching, because the command head
is `npm`. Negative controls for genuine mass deletion (`rm a b c d e f`, `del a b c d e f`)
are added **before** the pattern is narrowed.

### 5.4 F4 — grade the substring guards

| Guard | Today | After |
|---|---|---|
| `handleQaPreBash` (`unified-bash-pre.js:164`) | its own 9-pattern table, deny on any substring, no grading | delegates to the shared Destructive Detector, so it inherits grading; a QA-context finding is treated as at least `ask`. Removes a second, cruder copy of the same table |
| `handlePhase9DeployPre` (`unified-bash-pre.js:127`) | 6 substrings, deny on any, including bare `--force` and `production` | keeps its four infra patterns as `critical`; `--force` and `production` become `ask`-grade; a command carrying a dry-run flag (`--dry-run`, `-o yaml`, `plan`) produces no finding |

## 6. Error handling

Every new path is fail-safe in the direction of the current behaviour: a throw inside the
policy module, a malformed mode, or a missing field all resolve to `'default'`, which emits.
The policy module has no I/O and therefore no failure mode of its own; the call sites keep
their existing `try/catch` so auditing can never prevent a decision.

## 7. Security considerations

- ADR 0016 / `test/security/integrity-verification.test.js` IV-09 hold unchanged: the
  Destructive Detector still cannot be disabled at runtime, and this design adds no switch.
  `bkit.config.json guardrails.destructiveDetection` remains declarative.
- `critical` and `policy` are unreachable by any mode, asserted directly in the unit table
  and again by the negative controls in the E2E lock.
- Suppression is audited (FR-6), so a session can be reconstructed from the trail.

## 8. Test plan

| Level | Coverage |
|---|---|
| **Unit** | `resolve()` over 7 modes × 3 grades = 21 assertions, plus `normalizeMode` on unknown/absent/`manual` |
| **Contract** | `parseHookInput` exposes `permissionMode`; the payload key list matches the measured one; `outputAsk` honours the secondary check |
| **Regression** | G-007 command-head predicate with positive and negative controls; phase-9 and QA grading; ENH-263 reachability; `removeWhen` application |
| **E2E lock** | The full 7-mode × 19-case reproduction matrix, shipped with its negative controls, in `test/e2e/external-dogfood/` |
| **Live QA** | `claude -p --plugin-dir .` in `bypassPermissions` and `default`, asserting the observable difference |

## 9. Implementation order

1. `lib/domain/policy/permission-mode-policy.js` + unit tests
2. `lib/core/io.js` — `parseHookInput`, `outputAsk`
3. `scripts/unified-bash-pre.js` — ask site, then the two substring guards (F4)
4. `scripts/pre-write.js` — ENH-263 context (F8)
5. `scripts/permission-request-handler.js`
6. `lib/control/destructive-detector.js` — G-007 predicate (F3), controls first
7. `lib/cc-regression/defense-coordinator.js` + `cc-payload.port.js` (F9)
8. Tests, full suite, live QA, docs sync

## Version History

| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-08-14 | Initial design under maintainer decisions D1–D4 |
