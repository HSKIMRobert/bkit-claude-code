# v2137-permission-mode QA Report

| | |
|---|---|
| Feature | `v2137-permission-mode` |
| Target release | v2.1.37 |
| Branch | `feat/v2.1.37-permission-mode-awareness` |
| Runtime | Claude Code **v2.1.231**, Node v22.22, darwin 24.6.0 |
| Verdict | **QA_PASS** |

## 1. What had to be proven

This release makes bkit **quieter on purpose**. That creates a specific risk: quieter and
broken look identical from the outside. So the QA plan was built around one rule — every
assertion that something is now *allowed* is worthless unless genuinely destructive commands
are still *stopped in the same run*.

Three questions had to be answered with evidence, not reasoning:

1. Does the ask tier actually stand down where nobody can answer it?
2. Does every critical refusal survive, in every mode?
3. Does bkit still work — all of it, in a real Claude Code session, not just in unit tests?

## 2. Node suite

`node test/run-all.js`

| Category | Result |
|---|---|
| Unit | 1980 / 1980 |
| Integration | 611 / 611 |
| Security | 267 / 267 |
| Regression | 796 / 796 |
| Performance | 157 / 161 (4 skip) |
| Philosophy | 140 / 140 |
| UX | 185 / 185 |
| E2E (node) | 151 / 151 |
| Architecture | 100 / 100 |
| Controllable AI | 80 / 80 |
| Behavioral | 45 / 45 |
| Contract | 760 / 761 (1 skip) |
| **Total** | **5277 TC · 5271 PASS · 1 FAIL · 5 SKIP** |

The single failure was `live-run-freshness` LRF-3: `hooks/hooks.json` changed in this release
(its description names the version), so the recorded host-integration evidence no longer
described what is being shipped. That is the gate doing its job. It was resolved by
re-recording — `node test/qa-harness-full-live.js --layer hooks --record` — not by relaxing
the assertion.

Baseline for comparison: v2.1.36 on this tree measured **4364 TC / 0 FAIL**. The +913 comes
from 89 new test cases in this release and 824 that existed but ran nowhere (§5).

## 3. Live QA — real Claude Code sessions

`bash test/qa-harness-live-claude-p.sh` — each case runs `claude -p --plugin-dir <repo>` in
an isolated project directory.

**Result: 18 / 18 PASS.**

| Group | Cases |
|---|---|
| Skills reachable as slash commands | `/bkit`, `/bkit:pdca status`, `/bkit:sprint list`, `/bkit:control`, `/bkit:bkit-explore` — 5 PASS |
| MCP servers | `bkit_pdca_status` answered from a live session — PASS |
| Agent dispatch | `code-analyzer` spawned and reported — PASS |
| 8-language auto-detection | Korean prompt routed correctly — PASS |
| Enforcement | 6 PASS (see §4) |
| Hook dispatch | 10 events observed live: SessionStart, UserPromptExpansion, UserPromptSubmit, Stop, SessionEnd, PreToolUse, PostToolUse, PostToolUseFailure, SubagentStart, SubagentStop — PASS |
| Session title not forced (#77) | PASS |

## 4. The new contract, measured live

The enforcement group is where this release is proven. It was **restructured rather than
relaxed**: the previous version ran everything in `acceptEdits`, which this release makes a
suppressing mode, so simply leaving it would have turned a protection assertion into a
tautology.

| Assertion | Result |
|---|---|
| PreToolUse returns ask/deny for a recursive delete (no mode field) | PASS |
| the decision names the rule that fired | PASS |
| **no confirmation is raised under `bypassPermissions`** | PASS |
| **NEGATIVE CONTROL: a critical delete is still refused under `bypassPermissions`** | PASS |
| destructive command not executed (supervised session, `--permission-mode default`) | PASS |
| `guard-target` survived the supervised session | PASS |
| secret write refused | PASS |
| `config/.env` not created | PASS |

The third and fourth rows are the release in one line: the question stands down, the refusal
does not.

## 5. Coverage gap closed

A sweep found **148 test files registered in neither `test/run-all.js` nor any workflow**.
Run by hand: 147 passed, 1 failed — `component-inventory`, which was catching this release
adding a lib module while two documents still said 198.

All 148 are now registered. This is the failure v2.1.36 wrote down one release earlier — "two
runners disagreeing about what 'all tests' means is how a gap hides" — except these had
fallen out of *both*.

**Still uncovered, recorded rather than fixed**: `test/qa-harness-live-claude-p.sh` is a
`.sh` file and is referenced by nothing. The sweep above matched `*.test.js` only, so it did
not catch itself.

## 6. Gates run outside the suite

| Gate | Result |
|---|---|
| `scripts/docs-code-sync.js` | PASS — 0 drift |
| `scripts/validate-plugin.js` | PASS |
| `scripts/check-deadcode.js` | PASS |
| `scripts/check-domain-purity.js` | PASS |
| `scripts/check-guards.js` | PASS |
| `scripts/check-test-tracking.js` | PASS — 0 untracked |
| `test/contract/invocation-inventory.test.js` | PASS |
| `test/contract/component-inventory.test.js` | PASS (after doc counts corrected) |
| `tests/qa/bkit-full-system.test.js` | PASS |

**ESLint**: not run by CI, and the `no-console` findings in the changed files are present on
the same files at HEAD. The new domain module lints clean. Reported rather than absorbed.

## 7. Reproduction matrix — before and after

7 permission modes × 21 commands, fed to the shipped hooks
(`test/e2e/permission-mode-matrix.test.js`):

| | before | after |
|---|---|---|
| benign commands stopped | 14 | **0** |
| negative controls still refused | 49/49 | **49/49** |
| ask-grade rows that vary by mode | 0 — every column identical | 4 of 4 |
| `absent` column matches `default` | n/a | yes — older Claude Code unaffected |

## 8. Residual risk

- **`auto` mode was never observed on the wire.** It needs account eligibility this
  environment does not have. It is treated as human-present (not suppressed) by policy, and
  the code says so at the point of decision rather than implying it was measured.
- **No floor could be established for `permission_mode`.** A binary probe found it in
  v2.1.227/228/231 but found no occurrence of the control marker `hook_event_name` in
  v2.1.226, whose payload is packed differently — so the probe is silent about older builds.
  Absence is therefore treated as "unknown, change nothing", verified by the `absent` column.
- **The `acceptEdits` decision (D2) is the maintainer's**, and it is the widest of the three.
  Note that Claude Code still applies its own prompt policy to non-filesystem Bash in that
  mode, so removing bkit's question does not leave the call unsupervised.
