# v2.1.36 Guardrail Precision — Sprint Master Plan

> **Sprint ID**: `v2136-guardrail-precision`
> **Date**: 2026-08-12
> **Author**: bkit:sprint-master-planner (invoked by main session)
> **Trust Level (start)**: L2
> **Estimated duration**: TBD — single release train, target label v2.1.36 (version number assignment is the maintainer's call)
> **Master Plan template**: bkit v2.1.13 (Sprint 4 Presentation output)
> **Responds to**: GitHub issue [#148](https://github.com/popup-studio-ai/bkit-claude-code/issues/148) (2026-08-12, @Sinclair-Seo, bkit 2.1.35 / CC 2.1.228 / Node 22.22.0 / WSL2)

---

## 0. Executive Summary

| Item | Content |
|------|---------|
| **Mission** | Make the Destructive Detector's 16 rules *precise*: stop blocking safe commands (8 boundary-crossing rules + G-004 hyphen defect + G-007 cross-domain FP + G-006 over-broad match), fix the G-010b critical **false negative**, and make the block message's advertised recovery path truthful — without weakening a single real protection. |
| **Anti-Mission** | NOT a rollback of ENH-388 enforcement. NOT new detection rules. NOT a redesign of heredoc-detector or the hook pipeline. NOT an allow-list mechanism for `.bkit/runtime/memory-directives.json` (deny-only by design). |
| **Core Primitives** | 6 features / 3 sprints / 13 ENH (440–452) / primary module `lib/control/destructive-detector.js` / consumers `scripts/unified-bash-pre.js:248`, `scripts/pre-write.js:228` / 46 dependent test files |
| **Trust Level** | L2 — auto-run within a phase; phase transitions and the two named design decisions (severity-grading scope, recovery-path direction) require user confirmation |
| **Auto-pause conditions** | 4 triggers active (QUALITY_GATE_FAIL / ITERATION_EXHAUSTED / BUDGET_EXCEEDED / PHASE_TIMEOUT) |
| **Success Criteria** | 5 items (see §5) — headline: zero-regression bar **≥ 3794/3798 PASS, 0 FAIL** (measured baseline) plus every measured false positive unblocked and every negative control still caught |

### Why now (causal chain, measured by main session)

1. **ENH-388 (v2.1.33)** repaired the Destructive Detector so it actually blocks (`scripts/unified-bash-pre.js:303-304`) instead of writing `result:'blocked'` while letting the command run. The repair was correct, but it converted **latent rule-precision defects into real work stoppages**. No rule-precision review preceded turning enforcement on.
2. **Issue #148** reported 3 rules blocking safe commands, with a 12-case reproduction harness including negative controls. The main session reproduced it exactly: **4 false positives, 0 missed controls**.
3. The main session then audited **all 16 rules**: the defect class is roughly **3× wider** than reported — 8 rules cross command-separator boundaries, and the same root cause produces a **critical false negative** in G-010b (unscoped SQL DELETE missed).
4. Severity: most affected rules grade **critical/deny**. In an unattended run a PreToolUse deny has nobody to answer it, so the agent **stalls silently instead of failing** — the reporter lost ~15 minutes twice in one sprint, caught only by an idle-stall monitor. A live instance also occurred during the investigation itself: a verification command containing `find … -delete` as literal *test data* was blocked by G-013 in the main session, while reassembling the same string from fragments passed unchanged — demonstrating both the false positive and the trivial evasion.

The cost was stated in the codebase itself (v2.1.34 comment in `destructive-detector.js`, quoted back by the reporter):

> "A guard that refuses correct commands and gives unfollowable advice is one people switch off, and then it protects nothing."

### The fix precedent already exists (G-001)

G-001 already solves both defect classes A and F in the same file; the work is largely **propagation, not invention**:

- **Operand boundary**: `destructive-detector.js:289` — `text.match(/\b(?:rm|rimraf|Remove-Item)\b([^\n;|&]*)/i)` cuts the operand list at the next command separator. Its comment records the exact v2.1.34 incident that motivated it.
- **Grading**: `:54` — `severityFor: (text) => (deleteTargetIsBroad(text) ? 'critical' : 'high')`.
- **Action resolution**: `resolveAction()` `:415-421` — `critical` always denies; a rule that graded *itself* down from `critical` relaxes `deny` → `ask` by exactly one tier, never to silence.
- **Broad-target vocabulary**: `BROAD_DELETE_TARGETS` `:246-256`.

---

## 1. Context Anchor (propagates Plan → Design → Do; written back to `.bkit/state/master-plans/v2136-guardrail-precision.json`)

| Key | Value |
|-----|-------|
| **WHY** | ENH-388 (v2.1.33) turned audit-only guardrails into real blocks without a rule-precision review. Issue #148 proved 3 rules block safe commands; the main session's 16-rule audit measured the defect class at ~3× the report: 8 operand-boundary-crossing rules (mostly critical/deny), a G-004 hyphen word-boundary defect, a G-010b **critical false negative** (unscoped SQL DELETE missed whenever any later statement contains WHERE), a G-007 cross-domain FP on safe SQL, a G-006 over-broad match, only 1/16 rules severity-graded, and a block message advertising a recovery path (`bkit.config.json`) that the module never reads. A guard that refuses correct commands and gives unfollowable advice is one people switch off — and then it protects nothing. |
| **WHO** | (a) Unattended / high-autorun operators — a PreToolUse deny stalls the agent silently (~15 min dead time per hit, measured by the reporter); (b) issue #148 reporter @Sinclair-Seo, who offered a PR; (c) every bkit user whose chained shell commands (`&&`, `;`, `\|`, newline) cross an unbounded operand window; (d) users relying on G-010b to catch unscoped SQL DELETEs — currently a false sense of safety in multi-statement input. |
| **WHAT (domain)** | Rule precision in `lib/control/destructive-detector.js`: operand-window boundary helper propagated to 8 rules, G-004 regex fix, G-010b statement-boundary fix, G-007 SQL suppression, `severityFor` extension (G-013 at minimum), recovery-path truthfulness, permanent E2E absorption of the reporter's harness, docs-code sync. |
| **WHAT NOT** | No new detection rules; no enforcement rollback; no runtime rule-disable mechanism unless the recovery-path design decision explicitly chooses it; no allow-list support in `memory-directives.json`; no version bumps (maintainer's call). |
| **RISK** | (1) Weakening a real guard while fixing false positives — the 32-TC bypass-closure suite (`test/regression/destructive-bypass.test.js`) must not be weakened; (2) 46 test files touch these rules; (3) `test/security/integrity-verification.test.js:206` asserts "critical rules default to deny" and may break when `severityFor` is added to a critical rule — must be resolved deliberately, not edited away; (4) `integrity-verification.test.js:168` asserts `disableRule` inertness *by design* — the recovery-path fix must not silently overturn an intended security property; (5) scope creep from grading rules that should stay strict (G-008/G-012/G-014/G-015 are inherently broad by construction). |
| **SUCCESS** | All measured false positives (issue #148 harness + 16-rule audit probes in §2.1) pass unblocked; `DELETE FROM audit_log; SELECT * FROM users WHERE id = 1` fires G-010b; every negative control still caught (0 missed); full suite **≥ 3794/3798 PASS, 0 FAIL**; reporter's 12-case harness green as a permanent E2E under `test/e2e/external-dogfood/`; the refusal message gives only followable advice, per rule, on the path the model actually reads; docs = code across all rule-count/behavior claims. |
| **SCOPE (quantitative)** | 6 features / 3 sprints / 13 ENH (440–452) / 1 primary production module + 2 consumer scripts + 46 dependent test files + ≥ 4 doc surfaces (README.md, CUSTOMIZATION-GUIDE.md, AI-NATIVE-DEVELOPMENT.md, CHANGELOG.md). |
| **OUT-OF-SCOPE** | New guardrail rules; heredoc-detector (`lib/defense/heredoc-detector.js`) redesign beyond keeping its imports working; general shell-parser adoption (AST-level parsing) — the separator-window heuristic is the chosen precision level; string-fragment-reassembly evasion closure (observed and documented, but a detection-depth problem, not a precision problem — carry item for a future cycle). |

---

## 2. Features (sprint work packages)

Feature ids match `.bkit/state/master-plans/v2136-guardrail-precision.json` `features[]` exactly. Priority reflects dependency order, not importance alone.

| # | Feature | Priority | Status | ENH | Defect classes addressed |
|---|---------|----------|--------|-----|--------------------------|
| 1 | `regression-suite` | P0 | pending | 450, 451 | All (test-first scaffolding) |
| 2 | `operand-boundary` | P0 | pending | 440, 441, 442 | A (8 rules), B (G-004 hyphen) |
| 3 | `sql-scope-integrity` | P0 | pending | 446, 447 | C (G-010b false negative — **user approved for v2.1.36 scope**), D (G-007 on SQL) |
| 4 | `severity-grading` | P1 | pending | 443, 444, 445 | F (1/16 graded), E (G-006 — pending scope confirmation, see §11) |
| 5 | `recovery-path` | P1 | pending | 448, 449 | G (two dead recovery paths — **explicit design decision required**) |
| 6 | `docs-sync` | P1 | pending | 452 | Docs-code drift |

### 2.1 Per-feature acceptance criteria (literal probes for QA)

Every probe below was measured by the main session before any change (current verdict), and states the expected verdict after the fix. QA executes them literally against `detect()` / the PreToolUse path.

#### Feature 1: `regression-suite` (ENH-450, 451)

Absorb the reporter's 12-case harness **verbatim** as a permanent E2E test under `test/e2e/external-dogfood/` (Early Adopter Program precedent — README "Real User Hall of Fame", existing `dandi-*` tests in that directory). Add per-defect-class regression tests (A–G). Scaffolding lands **before** the fixes so each fix lands against a failing (or explicitly expected-fail) test.

| Criterion | Probe | Expected |
|---|---|---|
| Harness absorbed | Run the 12-case harness file as part of `node test/run-all.js` | Present in suite totals; before fixes: 4 expected-fail FPs documented; after fixes: 12/12 PASS |
| Negative controls intact | Harness negative controls | 0 missed controls, before and after |
| Per-class coverage | One test file (or section) per defect class A–G | Each measured probe in this document appears as a test case |
| Bypass closures untouched | `test/regression/destructive-bypass.test.js` (32 TC) | 32/32 PASS, file not weakened (no assertion deletions/relaxations) |

#### Feature 2: `operand-boundary` (ENH-440, 441, 442)

Shared, unit-tested helper extracting a rule's operand window up to the next command separator (`&&`, `;`, `|`, newline) — generalizing the G-001 precedent at `destructive-detector.js:289` — applied to the 8 crossing rules.

False positives that MUST stop firing (all measured as blocked today):

| Rule (graded today) | Probe (safe command, currently blocked) | Expected after fix |
|---|---|---|
| G-002 (critical/deny) | `git push origin feature-x && rm -f /tmp/scratch/note.txt` | G-002 does not fire (the `-f` belongs to `rm`, not push) |
| G-004 (high/ask) | `git commit -m "wip" && cat src/main.js` | G-004 does not fire (`main.js` is a filename, not a branch) |
| G-007 (medium/ask) | `cd /tmp/scratch && rm -f note.txt && echo done` | G-007 does not fire |
| G-008 (critical/deny) | `cp a.txt b.txt && ls /` | G-008 does not fire (trailing `/` is `ls`'s argument) |
| G-012 (critical/deny) | `base64 -d payload.b64 > out.txt && cat ./vetted-install.sh \| sh` | G-012 does not fire |
| G-013 (critical/deny) | `find /tmp/scratch -type f -name '*.tmp' -delete` | G-013 does not deny (see grading probe in Feature 4) |
| G-014 (critical/deny) | `dd if=/dev/zero of=./scratch.img bs=1M count=1 && echo "of=/dev/null"` | G-014 does not fire |
| G-015 (critical/deny) | `curl -o pkg.tgz https://example.com/pkg.tgz && cat ./vetted-install.sh \| sh` | G-015 does not fire |

Word-boundary fix (class B, ENH-442) — all three measured, issue reported only the first:

| Probe (read-only command, currently matched by G-004) | Expected after fix |
|---|---|
| `git merge-base main HEAD` | G-004 does not fire |
| `git merge-tree main topic` | G-004 does not fire |
| `git merge-file a b c` | G-004 does not fire |

Negative controls that MUST keep firing:

| Probe | Expected (unchanged) |
|---|---|
| `git push --force origin main` | G-002 fires, critical/deny |
| `git merge main` (actual merge into protected branch context) | G-004 fires, high/ask |
| Each of the 32 bypass-closure TCs for G-012–G-015 | Still caught |

#### Feature 3: `sql-scope-integrity` (ENH-446, 447)

| Criterion | Probe | Current (measured) | Expected after fix |
|---|---|---|---|
| G-010b false negative closed | `DELETE FROM audit_log; SELECT * FROM users WHERE id = 1` | G-010b does NOT fire (WHERE of the later statement suppresses the negative lookahead) | G-010b fires — lookahead scoped to the DELETE's own statement |
| G-010b true positive kept | `DELETE FROM audit_log` (single statement, no WHERE) | fires | still fires |
| G-010b true negative kept | `DELETE FROM audit_log WHERE id = 1` | does not fire (as G-010b) | still does not fire |
| G-007 cross-domain FP closed | `DELETE FROM audit_log WHERE id = 1` | fires G-007 "Mass file deletion" (a filesystem rule; `delete` + ≥5 tokens suffices) | G-007 does not fire on SQL statements |
| G-007 filesystem detection kept | G-007's own positive fixtures in the existing suites | fire | still fire |

#### Feature 4: `severity-grading` (ENH-443, 444, 445)

Resolve the measured asymmetry — the strictly narrower operation is currently refused harder:

```
rm -rf /tmp/scratch/build                       → G-001 / high     / ask   (graded)
find /tmp/scratch -type f -name '*.tmp' -delete → G-013 / critical / deny  (ungraded)
```

| Criterion | Probe | Expected after fix |
|---|---|---|
| G-013 graded (ENH-443) | `find /tmp/scratch -type f -name '*.tmp' -delete` | G-013 fires at high/ask (narrow target) — parity with G-001; via `resolveAction()` one-tier relaxation (`deny` → `ask`, never silence) |
| G-013 broad target stays hard | `find / -delete` (or any `BROAD_DELETE_TARGETS` match) | G-013 fires at critical/deny |
| Ungraded-by-design list (ENH-444) | Design doc names G-008, G-012, G-014, G-015 as inherently broad by construction, with rationale each | Documented decision, no `severityFor` added to them |
| G-009/G-010/G-010b/G-011 decision (ENH-444) | Design-phase decision record | Explicit grade/no-grade decision per rule, user-confirmed (open question §11) |
| G-006 precision (ENH-445, conditional) | `ls -la ./certs/server.pem` (currently fires G-006 "Secret key access" high/ask on a mere listing) | If confirmed in scope: G-006 does not fire on read-only listing; access verbs (`cat`, `cp`, `curl --data @…`, etc.) still fire. If deferred: carry item |
| `integrity-verification.test.js:206` conflict | "critical rules default to deny" assertion | Resolved deliberately in Design phase (see §8 R-3) — not by editing the assertion away |

#### Feature 5: `recovery-path` (ENH-448, 449)

Two measured dead paths, both in `lib/control/destructive-detector.js`:

1. `getBlockMessage()` (`:520`) says "adjust guardrail settings in **bkit.config.json** or use manual override" — the module **never reads bkit.config.json** (the string appears exactly once in the file: inside the message itself).
2. `disableRule()` (`:567`) sets `rule._disabled = true`, but `detect()` (`:429-431`) never reads the flag. Measured: rule list identical before/after `disableRule('G-001')`. `addCustomRule`/`disableRule` have zero production callers (defined `:553`/`:567`, exported `:583-584`; only other reference is a test).

**This is an explicit design decision, not a foregone bug-fix.** `test/security/integrity-verification.test.js:168` asserts *"destructive-detector disableRule does not remove rule from detection"* — the inertness may be an intended security property (a guard that cannot be switched off at runtime). The only project-level directive file, `.bkit/runtime/memory-directives.json`, is deny-only and cannot express an allowance.

| Option | Description | Consequence |
|---|---|---|
| **B (recommended)** | Correct the message: `getBlockMessage()` states only recourse that actually exists (rephrase the command to avoid the matched pattern; split chained commands; answer the ask-prompt when attended). Keep rules runtime-immutable; record the immutability as an intended property in an ADR; remove or explicitly reserve the dead `addCustomRule`/`disableRule` exports. | No new attack surface; consistent with the `:168` test's intent and deny-only directive design. Precision fixes in Features 2–4 remove most of the *need* for overrides. |
| A | Wire `bkit.config.json` so the advertised path becomes real (config-driven rule disable/threshold). | Creates a runtime switch-off path — contradicts the apparent security property; requires overturning `:168` deliberately; larger blast radius. |

Recommendation: **Option B**, with Option A recorded as rejected-for-now and revisitable by the maintainer. Final call is user-gated (L2).

Acceptance (under Option B): grep for `bkit.config.json` in `destructive-detector.js` returns 0 hits in user-facing messages OR the message text matches actual behavior; the `:168` assertion still passes unmodified; an ADR/design-section documents the decision.

#### Feature 6: `docs-sync` (ENH-452)

Code = Docs sweep across README.md, CUSTOMIZATION-GUIDE.md, AI-NATIVE-DEVELOPMENT.md, CHANGELOG.md, bkit.config.json, `.claude-plugin/`, `hooks/`, `bkit-system/`.

| Criterion | Probe | Expected |
|---|---|---|
| Graded-rules claim true | `AI-NATIVE-DEVELOPMENT.md:110` — "16 known-pattern rules … graded by target — a broad target denies, a specific one asks" (currently true only of G-001) | Claim matches the post-sprint grading reality (which rules grade, which are strict by design) |
| Stale test header fixed | `test/security/destructive-rules.test.js:6` — "Validates all 8 guardrail rules (G-001 to G-008)" (there are 16) | Header matches reality |
| CHANGELOG entry | New section documenting the sprint (version heading provisional — maintainer assigns the real number; **no version field bumps anywhere**) | Entry present, labeled per Versioning policy |
| Recovery-path docs | Wherever docs describe block-message recovery | Matches the Feature 5 decision |

### 2.2 ENH ledger map (ledger max is 431; cycle #36 reserved 432–439; **this sprint starts at 440**)

| ENH | Feature | Discrete change |
|---|---|---|
| ENH-440 | operand-boundary | Shared operand-window helper (separator-bounded extraction, generalizing `:289`) + unit tests |
| ENH-441 | operand-boundary | Apply helper to the 8 crossing rules (G-002, G-004, G-007, G-008, G-012, G-013, G-014, G-015) |
| ENH-442 | operand-boundary | G-004 word-boundary fix (hyphen defect: `merge-base` / `merge-tree` / `merge-file`) |
| ENH-443 | severity-grading | `severityFor` for G-013 (broad vs narrow delete target, G-001 parity) |
| ENH-444 | severity-grading | Grading decision record: G-009/G-010/G-010b/G-011 decided per rule; G-008/G-012/G-014/G-015 documented ungraded-by-design |
| ENH-445 | severity-grading | G-006 verb-aware precision (read-only listing does not fire) — conditional on scope confirmation (§11 Q1) |
| ENH-446 | sql-scope-integrity | G-010b statement-boundary-aware negative lookahead (false-negative closure) |
| ENH-447 | sql-scope-integrity | G-007 suppression on SQL statements (cross-domain FP closure) |
| ENH-448 | recovery-path | `getBlockMessage()` truthfulness per the Feature 5 decision |
| ENH-449 | recovery-path | `addCustomRule`/`disableRule` resolution (remove, reserve, or wire — per the same decision) + ADR |
| ENH-450 | regression-suite | Reporter's 12-case harness as permanent E2E under `test/e2e/external-dogfood/` |
| ENH-451 | regression-suite | Per-defect-class (A–G) regression tests, each fix paired with a negative control |
| ENH-452 | docs-sync | Docs-code sync sweep incl. `AI-NATIVE-DEVELOPMENT.md:110` claim and `destructive-rules.test.js:6` stale header |

---

## 3. Sprint Decomposition & Dependency Order

`sprints[]` in the state JSON is currently empty; this section is the recommendation to populate it. Trust Level L2 means each sprint boundary is a user checkpoint.

| Sprint | Id | Features | Rationale for position |
|---|---|---|---|
| S1 | `v2136-s1-harness` | `regression-suite` (scaffolding portion) | **Tests first.** The harness and per-class probes land as expected-fail before any rule changes, so every fix in S2 lands against a failing test and every negative control is locked before the rules are touched. |
| S2 | `v2136-s2-detector` | `operand-boundary` → `sql-scope-integrity` → `severity-grading` | All three edit `lib/control/destructive-detector.js` and its 46-file test blast radius; keeping them in one sprint avoids repeated merge churn. Internal order: the boundary helper (ENH-440) is the substrate — G-010b's statement-boundary fix (ENH-446) is the same root-cause family, and grading (ENH-443) must evaluate the *correctly bounded* operand window, or it grades the wrong text. |
| S3 | `v2136-s3-recovery-docs` | `recovery-path` → `docs-sync` | The recovery-path design decision needs the S2 outcome (precision fixes reduce the need for overrides, which informs the Option A/B call). Docs sync must come last — it documents settled behavior, not intentions. |

Dependency graph (for state JSON `dependencyGraph`):

```json
{
  "operand-boundary":    ["regression-suite"],
  "sql-scope-integrity": ["operand-boundary"],
  "severity-grading":    ["operand-boundary"],
  "recovery-path":       ["regression-suite"],
  "docs-sync":           ["operand-boundary", "sql-scope-integrity", "severity-grading", "recovery-path", "regression-suite"]
}
```

Reporter-PR accommodation: if @Sinclair-Seo's offered PR arrives, it slots into S1 (the harness is their artifact — absorb it verbatim under `test/e2e/external-dogfood/` with attribution per the Early Adopter Program precedent) and/or S2 (their 3-rule fixes reviewed against the wider 8-rule helper design rather than merged as spot fixes). See §12.

---

## 4. Sprint Phase Roadmap

Each sprint (S1–S3) runs the 8-phase lifecycle independently.

| Phase | Activates | Deliverable | Quality Gates |
|-------|-----------|-------------|---------------|
| prd | sprint start | PRD document | M8 |
| plan | after PRD | Plan document | M8 |
| design | after Plan | Design document (codebase analysis; S2 design carries the two design decisions of §2.1-F4/F5) | M4, M8 |
| do | after Design | Implementation | M2, M3, M5, M7 |
| iterate | matchRate < 100 | matchRate 100% | M1 (100%) |
| qa | after iterate | 7-Layer S1 verification + literal probe execution (§2.1) + full-suite zero-regression run | M3 (=0), S1 (=100) |
| report | after qa | Sprint report | M10, S2, S4 |
| archived | after report (user-confirmed at L2) | terminal state | - |

---

## 5. Quality Gates & Success Metrics

### 5.1 Zero-regression bar (applies to every `do`/`qa` phase)

Baseline measured before any change: `node test/run-all.js` → **3794/3798 PASS across 177 subtotals, 0 FAIL**. Every sprint's qa phase must return **≥ 3794/3798 PASS, 0 FAIL** on the full suite. New tests raise the totals; they never lower the PASS floor.

### 5.2 Success metrics (5)

| # | Metric | Target | Measured by |
|---|--------|--------|-------------|
| 1 | matchRate (Design ↔ Code) | 100% | gap-detector |
| 2 | criticalIssueCount | 0 | code-analyzer |
| 3 | False-positive probes (§2.1) | 100% pass unblocked; reporter's 12-case harness 12/12 | literal probe execution in qa phase |
| 4 | Negative controls (incl. `destructive-bypass.test.js` 32 TC) | 0 missed | full suite + harness controls |
| 5 | Full-suite regression | ≥ 3794/3798 PASS, 0 FAIL | `node test/run-all.js` |

---

## 6. Auto-Pause Triggers (4 active)

| Trigger | Condition | User decision options |
|---------|-----------|----------------------|
| QUALITY_GATE_FAIL | M3 > 0 OR S1 < 100 OR full suite < 3794 PASS OR any FAIL | fix & resume / forward fix / abort |
| ITERATION_EXHAUSTED | iter ≥ 5 AND matchRate < 90 | forward fix / carry / abort |
| BUDGET_EXCEEDED | cumulativeTokens > budget | increase budget & resume / abort / archive |
| PHASE_TIMEOUT | phase duration > config.phaseTimeoutHours | extend / force-advance / abort |

Additional L2 hard-pauses (not auto-resumable): the severity-grading scope decision (ENH-444/445) and the recovery-path direction decision (ENH-448/449) each require explicit user confirmation before their `do` phase proceeds.

---

## 7. Cross-Sprint Dependency

- **S1 → S2**: S2's fixes are validated against S1's expected-fail probes flipping to PASS; S1's locked negative controls gate every S2 change.
- **S2 → S3**: the recovery-path decision consumes S2's outcome (post-precision need for overrides); docs-sync documents S2+S3 settled behavior.
- **Upstream (already shipped)**: ENH-388/389/393 (v2.1.33) enforcement repair is locked by `test/regression/enh-388-389-393-destructive-enforcement.test.js` — this sprint must keep it green; the enforcement itself is not in scope to change.
- **Downstream (carry candidates)**: string-fragment-reassembly evasion (observed live during the investigation) — detection-depth work for a future cycle; G-006 fix if deferred (§11 Q1); recovery-path Option A if the maintainer later wants config wiring.

---

## 8. Risks & Mitigation

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|------------|
| R-1 | **Weakening a real guard while fixing false positives.** Narrowing an operand window can exclude text a bypass relied on being caught. | Medium | Critical | S1 locks all negative controls before any rule change; `test/regression/destructive-bypass.test.js` (32 TC) must pass with zero assertion changes; every ENH-441 rule change ships with at least one negative control (ENH-451). |
| R-2 | **Breaking the 46 dependent test files.** | High (some breakage certain) | Medium | Design phase of S2 enumerates the 46 files and classifies expected impact per file *before* `do`; changes to test expectations require a stated reason in the design doc, never drive-by edits. Known specifics: `integrity-verification.test.js:191` ("all 8 core rules are present") and `destructive-rules.test.js:6` stale header. |
| R-3 | ~~**`integrity-verification.test.js:206` conflict**~~ — **RETIRED, measured 2026-08-12.** The assertion inspects the **declared** fields only (`r.severity === 'critical'` ⇒ `r.defaultAction === 'deny'`), never the graded outcome. Measured: 11 critical rules, **0 violating**; G-001 already carries `severity:'critical'` + `defaultAction:'deny'` + `severityFor` simultaneously and coexists with this test today. Adding `severityFor` to G-013 therefore cannot break IV-11. | ~~High~~ **None** | ~~High~~ **None** | No mitigation needed. Retained here as a record so the risk is not re-raised. The general rule still stands: **no assertion is edited away to make CI green** (see R-2). |
| R-4 | **Overturning an intended security property** — `disableRule` inertness is asserted as intended at `:168`. | Medium | High | Feature 5 is framed as a decision, not a bug-fix; Option B (message correction, rules stay immutable) is the recommendation; any deviation is user-gated. |
| R-5 | **Scope creep: grading rules that should stay strict.** G-008/G-012/G-014/G-015 are inherently broad by construction. | Medium | Medium | ENH-444 produces an explicit ungraded-by-design list with rationale; grading beyond G-013 requires the user-gated decision. |
| R-6 | **Unattended-run stalls persist until release.** Users on v2.1.35 keep hitting silent deny-stalls. | Certain until release | Medium | Sprint ordering front-loads the highest-frequency FPs (operand-boundary in S2, first); release timing is the maintainer's call — no version bumps from this sprint. |
| R-7 | **Reporter PR divergence** — @Sinclair-Seo's offered PR may conflict with the wider 8-rule design. | Medium | Low | §12 protocol: harness absorbed verbatim with attribution; rule fixes reviewed against the shared-helper design; early comment on #148 stating the plan so the reporter can align before writing code. |

Pre-mortem (one line each): *"We shipped the boundary helper and a bypass regressed"* → R-1 controls were locked first, so it cannot land silently. *"CI is green but only because assertions were relaxed"* → R-2/R-3 forbid unexplained expectation edits. *"We wired bkit.config.json and created the off-switch the design refused for years"* → R-4 gates it behind an explicit user decision.

---

## 9. Resume / Abort Flow

| Situation | Procedure |
|------|------|
| Resume after auto-pause | `/sprint resume v2136-guardrail-precision` — verify the pause cause is resolved (for QUALITY_GATE_FAIL: full suite re-run ≥ 3794/3798 PASS, 0 FAIL) |
| User abort | `/sprint archive v2136-guardrail-precision` — terminal state; carry items (§7 downstream) recorded in the sprint report |

---

## 10. Sprint Tracking (Living document)

This master plan is updated during the sprint: cumulative KPI refresh + history append on each phase transition. On archive it becomes readonly. The Context Anchor (§1) is written back into `.bkit/state/master-plans/v2136-guardrail-precision.json` `context{}` by the main session.

---

## 11. Open Questions / UNVERIFIED

Decisions required from the user/maintainer (L2 gates):

- **Q1 — G-006 scope (ENH-445).** Defect class E (listing a `.pem` fires "Secret key access") maps to no named feature in the state JSON. Recommendation: fold into `severity-grading` as verb-aware precision. Needs confirmation; if deferred, it becomes a carry item.
- **Q2 — G-009/G-010/G-010b/G-011 grading (ENH-444).** The main session flagged these as "need a design decision"; no measurement says which way. Decide per rule in S2 design.
- **Q3 — Recovery-path direction (ENH-448/449).** Option B recommended (§2.1-F5); Option A (wire bkit.config.json) remains open for the maintainer.
- ~~**Q4 — `resolveAction()` semantics for ask-tier rules.**~~ **ANSWERED by measurement, 2026-08-12.** `resolveAction()` returns the declared action unchanged for any non-`critical` grade. For the five rules whose `defaultAction` is already `ask` (G-003, G-004, G-005, G-006, G-007), adding `severityFor` would change only the **reported severity string**, never the action — there is no tier below `ask` short of silence, which `resolveAction()` refuses by design. **Consequence for the plan: grading is only meaningful for `deny`-tier rules. The remedy for every ask-tier false positive is the operand boundary (Feature 2), not grading.** This confirms ENH-443's scope (G-013, a deny-tier rule) and removes grading from consideration for G-004/G-007.
- **Q5 — CHANGELOG heading.** "v2.1.36" is a provisional label only; the maintainer assigns the real version (per project Versioning policy).

UNVERIFIED facts (needed but not measured — do not treat as established):

- **U1** — The exact contents/format of the reporter's 12-case harness beyond "12 cases, negative controls, 4 FPs / 0 missed on reproduction". Absorb verbatim from issue #148 at S1; do not reconstruct from memory.
- **U2** — Whether any *other* consumer beyond the four measured references (`unified-bash-pre.js:248`, `pre-write.js:228`, `lib/control/index.js:19`, `lib/defense/heredoc-detector.js:19,84`) imports the detector indirectly. S2 design phase should sweep imports before `do`.
- **U3** — State JSON `masterPlanPath` reads `…master-plan.md` (no `.en`/`.ko` suffix), while this file is the `.en.md` sibling per the bilingual docs policy. The main session should reconcile the path field when writing back the Context Anchor.

---

## 11b. Post-hoc: what auditing ONE module missed (added 2026-08-12)

Everything above scoped the work to `lib/control/destructive-detector.js`. The
fixes landed, 30 assertions against `detect()` passed, and the false-positive
class was reported closed.

It was not. Running ordinary commands through the **real hook process** — the
only surface a user meets — found five more defects that no `detect()`-level
test could express, plus one on the Write path:

| ENH | Defect | Why the unit tests could not see it |
|---|---|---|
| 459 | Refusal advice was fixed for every rule, led by "Scope the command to a specific path" — meaningless after `curl … \| sh`, `DROP TABLE`, `dd of=/dev/disk0` | The advice is assembled in the hook, not in the module under test |
| 448 (corrected) | `getBlockMessage()` has **no production callers**; rewriting it changed nothing for anyone | Nothing asserted that the fixed function is reached |
| 460 | `push-event-guard` scanned the whole line for force flags, so `git push origin feature-x && rm -f note.txt` stayed refused | Different module; the detector was clean |
| 461 | `bash <<'EOF' … rm -rf / … EOF` was **allowed** — the detector elides heredoc bodies by design, and the heredoc guard graded the plain form `warning` | Each module correct alone; the payload passed between them |
| 462 | `detectPushCommand` reported `branch: 'origin'` whenever a flag preceded the remote | Nothing read `branch` until the force verdict began grading by target |
| 463 | The hook emitted the push guard's `ask` through the deny call, so every confirmation was presented as a refusal | The guard returned the right verdict; the caller discarded it |
| 464 | `.env.example` was refused as a secret by the `.env*` deny glob | Write path, never exercised end to end |

**Method that found them**: 28 ordinary developer commands and 8 ordinary file
writes, fed to the real hook, with no assumption about which guard would fire.
Locked as `test/regression/enh-459-463-hook-path-guards.test.js` (34 TC), of
which 13 fail against the pre-fix tree — including two false negatives.

**Rule for future cycles**: a fix to a guard module is not verified until the
hook that hosts it has been run as a process and its JSON read. Module-level
green is necessary and not sufficient.

## 12. External Contribution (issue #148 reporter)

@Sinclair-Seo offered to send a PR. Plan accommodation:

1. **Comment on #148 early** (before S2 `do`) with this plan's §2.1 probe tables and §3 decomposition, so the reporter can target the shared-helper design instead of three spot fixes.
2. **Harness**: absorbed verbatim under `test/e2e/external-dogfood/` (ENH-450) with attribution, following the Early Adopter Program precedent (README "Real User Hall of Fame", existing `dandi-*` external-dogfood tests). If the reporter's PR includes the harness, that PR is the preferred vehicle for ENH-450.
3. **Rule fixes**: if the PR includes detector changes, they are reviewed against ENH-440/441 (shared helper) — either rebased onto the helper or superseded with credit in CHANGELOG and the sprint report.
4. Negative-control and zero-regression bars (§5) apply to external contributions identically.

---

> **Next Phase**: `/sprint init v2136-guardrail-precision` → S1 `prd` phase (`docs/01-plan/features/v2136-guardrail-precision.prd.md`), citing §1 Context Anchor and §2.1 acceptance probes for traceability.

> **Status**: Draft v1.0 — pending review.
