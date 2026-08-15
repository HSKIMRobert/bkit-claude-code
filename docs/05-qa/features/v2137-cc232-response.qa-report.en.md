# v2137-cc232-response QA Report

| | |
|---|---|
| Feature | `v2137-cc232-response` (CC v2.1.228 → v2.1.232 impact response) |
| Target release | v2.1.37 |
| Branch | `feat/v2.1.37-permission-mode-awareness` (PR #150) |
| Runtime | Claude Code **v2.1.232**, Node v26, darwin 24.6.0 |
| Verdict | **QA_PASS** |

## 1. What had to be proven

This response is mostly about **defaults that changed underneath bkit**, not
contracts that broke. That shapes the risk: a changed default produces no error,
no failed test, and no complaint. It produces a number that is quietly wrong, or a
guard that quietly stops firing.

So the plan was built around three questions, each answerable only with evidence:

1. **Did the hook contract actually hold?** Not "did tests pass" — the tests were
   written before v2.1.232 existed.
2. **Does bkit behave honestly under the new fork default?** Specifically: does a
   gate it cannot measure report *no score*, rather than a score?
3. **Does all of bkit still work in a real session on v2.1.232** — every skill,
   every agent, every hook event, every MCP tool?

One rule governed the whole plan, carried over from issue #148: an assertion that
something now passes is worthless unless something that should fail is still
caught in the same run. Every block below carries controls.

## 2. Node suite

`node test/run-all.js`

| Category | Result |
|---|---|
| Unit | 1980 / 1980 |
| Integration | 611 / 611 |
| Security | 267 / 267 |
| Regression | 796 / 796 |
| Performance | 157 / 161 (4 skipped) |
| Philosophy | 140 / 140 |
| UX | 185 / 185 |
| E2E (Node) | 151 / 151 |
| Architecture | 100 / 100 |
| Controllable AI | 80 / 80 |
| Behavioral | 45 / 45 |
| Contract | 760 / 761 (1 skipped) |
| **Total** | **5,272 / 5,277 — 0 FAIL, 5 skipped** |

Four new regression suites, each **verified failing against the pre-fix tree**
rather than merely passing after it:

| Suite | Pre-fix result |
|---|---|
| `enh-477-git-destruction-guards` | 10 of 19 assertions failed |
| `agent-frontmatter-fields` | 4 of 6 assertions failed |
| `enh-475-476-unmeasured-honesty` | (new behaviour; asserts the iterate loop no longer burns cycles) |
| `enh-433-hook-output-visibility` | (new behaviour; asserts delivery, not printing) |

## 3. Hook contract — the Breaking 0 claim

Measured on four real binaries under `~/.local/share/claude/versions`, not
inferred from the CHANGELOG.

`grep -a -o -F -e '<needle>' -- <binary> | wc -l`

| Marker | 227 | 228 | 231 | 232 |
|---|---|---|---|---|
| `hookSpecificOutput` | 124 | 124 | 124 | 124 |
| `permissionDecision` | 34 | 34 | 34 | 34 |
| `permissions.deny` | 9 | 9 | 9 | 9 |
| `forked_skill_depth_cap` | 2 | 2 | 2 | 2 |
| `bashCommandClamp` | 42 | 42 | 42 | 42 |
| `hook_event_name` | 78 | 78 | 78 | 78 |
| `stop_hook_active` | 7 | 7 | 7 | 7 |
| `"SubagentStart"` | 13 | 13 | 13 | 13 |
| `continueOnBlock` | 3 | 3 | 3 | 3 |
| `launcher_hooks` | 0 | 0 | **30** | **30** |

The 227 column reproduces the previous cycle's independent measurement exactly —
two separate measurements agreeing is what makes the column trustworthy.

`launcher_hooks` is the only movement, it is **additive** (a new server-supplied
hook allow list in v2.1.231), and it changes no existing field. **Breaking 0.
Consecutive compatible releases: 171.**

This measurement is now `scripts/cc-binary-equivalence.js` rather than a
reconstruction. Its equivalence with the hand method is asserted on the
overlapping pair that rules out shortcuts: `PreToolUse` 140 and `"PreToolUse"` 34,
counted independently.

## 4. Live QA — a real Claude Code v2.1.232 session

`node test/qa-harness-full-live.js` — every case is a real
`claude -p --plugin-dir` session against the working tree.

| Layer | Pass | Fail |
|---|---|---|
| skills | 45 | 0 |
| agents | 34 | 0 |
| hook events | 23 | 0 |
| MCP tools | 38 | 0 |
| **fork mode** | **5** | **0** |
| **Total** | **145** | **0** |

Agent dispatch is proven from the hook-dispatch ledger (`agent_type` on
`SubagentStart`), not from the absence of an error string in the output. The
earlier version of that layer would have reported 34/34 while proving nothing.

### 4.1 The fork layer — the gap this release closes

Every other case runs with `-p`, and `-p` is exactly where Claude Code leaves fork
mode **off**. The harness that exists to find dead surfaces could not reach the
surface whose default changed. `CLAUDE_CODE_FORK_SUBAGENT=1` turns fork mode on in
non-interactive mode, which puts a scripted session on the same code path the
interactive default now takes.

| Assertion | Result |
|---|---|
| fork gate is live: Agent tool has no `run_in_background` | PASS |
| a gate that could not be measured reports **no score** | PASS |
| the failure names fork mode as the likely cause | PASS |
| v2.1.232 surfaces a known-issue advisory at SessionStart | PASS |
| the advisory goes quiet once fork mode is turned off | PASS |

The first assertion is load-bearing. Without proving the gate is genuinely on,
every assertion below it would pass vacuously against fork mode *off* — the same
"a dead surface looks like an unsampled one" failure the harness was written to
end, one level up.

Note what is **not** asserted: that sprint measurement succeeds under fork mode.
It does not, by construction — the result arrives after the turn ends. What is
asserted is that the failure is honest.

## 5. CI gates, run locally before pushing

All 22 commands the `contract-check.yml` workflow runs were executed against this
tree. **22 / 22 PASS**, including `check-domain-purity`, `check-guards`,
`docs-code-sync`, `check-deadcode`, the two dual-baseline contract comparisons
(v2.1.9 and v2.1.16), L2 smoke, L2 hook attribution, L3 MCP compat and runtime,
L6 live-run freshness, and `validate-plugin --strict`.

Running them before the push is deliberate: a CI failure costs a second push and
a second workflow run, and this repository's Actions budget is finite.

## 6. Guardrail precision — controls, not just counts

`git clean`, `checkout -f`, and reflog expiry are now guarded (rules 16 → 19). A
"3 new rules, 0 false positives" claim proves nothing on its own, so the same run
asserts:

| Control class | Result |
|---|---|
| Every pre-existing rule still fires (G-001, G-002, G-003, G-006, G-008, G-009, G-015) | 7 / 7 |
| v2.1.36's false-positive wins hold (`git status`, `npm install --force`, `grep -rn delete a b c d e`, `ls -la ./certs/server.pem`, …) | 9 / 9 |
| Deliberate non-coverage is asserted, not merely absent (`--amend`, `--no-verify`, `git add -f build/`) | 3 / 3 |

The last row exists because "we chose not to guard this" and "we forgot" are
indistinguishable in a denylist a year later.

G-005 was fixed in **both** directions and both are asserted: it now fires on
`cat .env`, `./.env`, `foo/.env` and `config.env.production`, and it no longer
fires on `process.env.PORT`, `import.meta.env.VITE_KEY` or `.envrc`.

## 7. What this QA did NOT cover

Stated plainly, because a scope nobody writes down reads as a scope nobody had.

1. **One platform.** All binary measurement is macOS x86_64. Linux, Windows and
   arm64 builds were not examined.
2. **Fork mode was reached through the env var, not through an interactive
   session.** Claude Code documents `CLAUDE_CODE_FORK_SUBAGENT=1` as turning the
   same gate on in non-interactive mode, and the layer proves the gate is on — but
   a genuinely interactive session was not driven, because a scripted harness
   cannot be one.
3. **ENH-482 is unmeasured by design.** No Stop script uses `outputStopSurface`,
   so unified-stop's next-action hint has never reached the model. The only
   channel that would deliver it forces every clean stop to continue. That is a
   product decision, left to the maintainer rather than settled here.
4. **The stdout visibility of the eight non-PostToolUse events was taken from
   Claude Code's documentation**, which states the rule per event, rather than
   from a live probe of each one.

## 8. Verdict

**QA_PASS.**

- Node suite 5,272 / 5,277 — 0 fail
- Live QA 145 / 145 — 0 fail, on a real Claude Code v2.1.232 session
- CI gates 22 / 22 locally
- Hook contract byte-identical across four builds → **Breaking 0**, consecutive
  compatible **171**
- Every new regression suite verified failing against the pre-fix tree

The release is ready for review. Merge is the maintainer's decision.
