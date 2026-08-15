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

## 3b. Full-surface live QA — every shipped feature

The section above samples. This one does not: `node test/qa-harness-full-live.js`
with no `--layer` runs all four layers against real Claude Code sessions.

**Result: 139 / 140 PASS**, on CC v2.1.231.

| Layer | Cases | Result | What is proven |
|---|---|---|---|
| skills | 44 + inventory | **44 / 45** | every skill resolves and answers; the inventory case reads `Loaded N skills from plugin bkit` out of the host's own debug log, so a whole directory failing to register cannot pass |
| agents | 34 | **34 / 34** | every agent is dispatchable — asserted from `SubagentStart` in the hook ledger, not from the model's prose |
| hooks | 23 | **23 / 23** | all 21 events observed dispatching |
| mcp | 38 | **38 / 38** | all 19 tools over both servers |

The single miss was `cc-version-analysis` exceeding its 600 s budget. Measured in
isolation immediately afterwards: **exit 0 in 1330 s**, Phase 1 research complete
and its artifact written. The skill researches a Claude Code release across docs,
blogs and GitHub; minutes is its normal shape. The harness budget was raised above
the measurement rather than the result being explained away — a QA report that
carries "not necessarily broken" is teaching its reader to discount it.

**Why this section exists.** An earlier draft of this report led with the 18-case
sample and did not say what it had left out. 5 of 44 skills, 1 of 34 agents and 1
of 19 MCP tools had been exercised live. The numbers in it were true and the
impression it gave was not.

## 3c. What bkit's own QA skill found, running against this repo

The full-surface sweep ran `/bkit:qa-phase` against bkit itself, and it wrote a report. Its
verdict was **CONDITIONAL PASS — 0 product defects, 1 test-infrastructure defect** — and the
defect it names is the root cause of both mistakes this release made on its way through QA.

**`lib/core/platform.js:47`**

```js
const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || process.cwd();
```

`PROJECT_DIR` is a module-load-time constant, and every bkit state read and write resolves
through it. So the two things a test does to isolate itself — `process.chdir(tmpDir)`, or
writing fixtures under the repo root — **cannot work**: the constant was frozen before either
happened, and `loadFresh()` busts the require cache for the module under test but not for
`platform.js`.

Consequences it observed directly:

- **Two identical `--unit` runs produced different results**: 4 FAIL / 2 SKIP, then
  3 FAIL / 1 SKIP. A suite whose answer changes on identical input cannot gate a release.
- Tests wrote into the live project: a `trust-profile.json` (score 72 / L3), three checkpoint
  files, and `pdca-status.json` growing from ~0.7 KB to 5.6 KB.
- A fixture leaked on failure — `TC-F4-1-U5` restores its backup *after* its assertions, so a
  throwing assert skips the restore.

**Why it matters past the tests**: `trust-profile.json` drives the L0–L4 automation gate and
the destructive-operation guardrails. A leaked profile changes what bkit does without asking.
In that run a fresh temp project resolved to trustScore 72 / L3 where the documented default
is 38 / L0 — not from a code bug, but from state bleeding across contexts.

**This report's own numbers are qualified by that finding.** The 0-FAIL run in §2 was real and
repeatable here, and the same defect is what made two earlier runs of this suite disagree with
each other. Treat §2 as "0 FAIL on this machine, on these runs", not as a property of the tree.

**Not fixed in v2.1.37.** It is test infrastructure, its blast radius is every state-touching
test, and folding it into a behaviour release would confound both. Carried to v2.1.38 with the
input-contract gate.

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
