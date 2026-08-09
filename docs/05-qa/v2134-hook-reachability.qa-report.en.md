# v2.1.34 QA Report — Live Verification of Every Surface

- **Branch**: `feat/v2.1.34-defect-response`
- **Runtime**: Claude Code **v2.1.226**, plugin loaded from the working tree via
  `--plugin-dir`
- **Harness**: `test/qa-harness-full-live.js` (exhaustive), plus the offline suite

## Why this report exists

v2.1.33's live QA covered thirteen cases, and everything it touched worked. The
defects this release fixes were all in what it did not touch: a hook that had
never fired since v2.1.1, a matcher covering `Write` but not `Edit`, a quality
gate reporting 100% for a feature that did not exist.

**Sampling cannot find a dead surface, because a dead surface looks exactly like
an unsampled one.** So this pass enumerates every surface bkit ships.

## Results

| Layer | Cases | Pass | Notes |
|---|---|---|---|
| **Hook events** | 23 | **23** | includes explicit `Write`/`Edit` coverage checks |
| **MCP tools** | 19 | **19** | real stdio JSON-RPC handshake, both servers |
| **Skills** | 45 | **44** | 1 long-running, verified working in isolation (below) |
| **Agents** | 34 | **34** | verified by `SubagentStart` evidence, not by prose |
| **Total** | **121** | **120** | |

## What each layer actually proves

### Hooks — dispatch, not registration

The check reads `.bkit/runtime/hook-dispatch.ndjson`, stamped from bkit's shared
stdin readers, after a session that exercises Bash, Edit, Write and a subagent.
An event that does not appear must have a stated reason it cannot fire in a
scripted session (an API failure, a compaction, Agent Teams); "not dispatched"
can never quietly mean "broken".

Two assertions exist purely as regression locks for this release: `PostToolUse`
must be observed with **both** `Write` and `Edit`. Through v2.1.33 the matcher
was `Write` alone.

### Agents — evidence, not absence of an error

The first version of this layer asserted that session output contained no
"unknown agent" string. **That assertion was wrong and was replaced.** It cannot
distinguish a successful dispatch from the model never calling the Task tool —
both produce output with no error in it. It would have reported 34/34 while
proving nothing.

Claude Code sends `agent_type` on `SubagentStart`, so a real dispatch leaves a
record. All 34 agents now run against one project directory and are confirmed
against that ledger:

```
{"event":"SubagentStart","agent":"bkit:code-analyzer","at":"..."}
{"event":"SubagentStop", "agent":"bkit:code-analyzer","at":"..."}
```

### Skills — host acceptance, plus an inventory check

The first version required non-empty output and marked **18 healthy skills as
broken**. bkit's reference skills — `bkend-*`, the `phase-1..9` pipeline guides,
`bkit-rules`, `bkit-templates` — load content into context and leave the model
nothing to say, so a bare invocation legitimately prints nothing.

What distinguishes reachable from dead is whether the host recognised the
command. Inventory-level proof is separate and comes from Claude Code's own
debug log: `Loaded 44 skills from plugin bkit`.

#### The one non-pass

`cc-version-analysis` exceeded the 180s budget (SIGTERM, exit 143). Reproduced
in isolation without a budget, it **works correctly**: it runs Phase 0 version
detection and reports

> Installed CC **2.1.226** · npm latest **2.1.226** — no new version to analyse.

It is slow because it does real work (`claude --version`, `npm view`) before it
can answer. The harness now carries it in a `LONG_RUNNING` map with that reason
and a 600s budget, and reports a SIGTERM as "the harness ran out of patience"
rather than as a defect.

## Offline suite

The full aggregate runs `test/**` and `tests/**`. New contract layers added this
release, each verified against a negative control — the guard was shown to fail
when the defect is reintroduced, not merely to pass today:

| Suite | Cases | Negative control |
|---|---|---|
| `hooks-config-contract` | 94 | v2.1.33's `timeout: 10000`, `once: true` and `if: "Write\|Edit(…)"` → 3 failures |
| `trigger-locale-contract` | 242 | a restored trailing period on `제어` → 1 failure; reverting the router to first-match-wins → 2 failures |
| `shipped-scripts-parse` | 41 | the v2.1.33 corrupted harness line → 2 failures; a reintroduced raw NUL byte → 1 failure |
| `destructive-bypass` | 30 | includes the issue #145 reproduction |
| `bash-pre-decision` | 23 | removing the ask tier → 5 failures; emitting the ask inline → 2 failures |
| `gap-detector-unmeasured` | 6 | restoring the fabricated `: 0` → 3 failures |
| `pdca-doc-changed` | 6 | — |
| `hook-failure-observability` | 9 | — |
| `live-run-freshness` | 8 | editing `hooks.json` without re-recording → 1 failure |
| `deprecation-registry-schema` | 26 | — |
| `ci-host-integration-wiring` | 7 | a workflow claiming CI runs a live session → 1 failure |

**Totals: 369 files, 6,898 assertions, 0 failures, 0 errored files.**

The assertion count jumped by 481 without a single new assertion being written:
`qa-aggregate` had no pattern for the `pass:N fail:N skip:N` summary that 36
suites emit, so each of them was counted as one passing assertion. Failures were
still caught — their detail lines are counted separately — so the gate never went
green over a real failure. What it misreported was how much verification stood
behind a green result. `node test/run-all.js` had the mirror-image gap and never
opened six regression files at all. Both runners now agree.

## Second and third review rounds

Two review passes over this branch, after the live QA above, found thirteen more
defects. They are recorded in full in `CHANGELOG.md`; the pattern is the same one
this release is named for — a value or a decision that exists in the code, looks
configured, and reaches nothing:

- ten destructive rules declared `defaultAction: 'ask'` and none ever asked
- a gap analysis that measured nothing recorded a **fabricated 0%** into state,
  metrics, a generated report document, the audit trail and the state machine
- implicit routing returned the first-declared match rather than the strongest,
  so security prompts reached the wrong agent in three languages
- a relocated PostToolUse handler spoke on a channel the model does not read,
  and read a phase key the state schema does not have — five independent causes
- a raw NUL byte shipped inside a `lib/` source file, parsing and running fine

Three of the thirteen were introduced by this branch, including one where the
degraded-payload recorder polluted the test suite's own project ledger, so
running the tests made the next session open with a warning about the tests.
Each is listed rather than quietly fixed, because a release about invisible
failure that hides its own would be making the same mistake.
## Findings raised by QA itself

Two of this pass's three "failures" were defects in the harness, not in bkit.
Both were reproduced before being acted on.

1. **`InstructionsLoaded` appeared dead.** It fires 2× under default setting
   sources and **0×** under `--setting-sources ''`, which the harness passed for
   isolation — that flag also switches off CLAUDE.md discovery. Reported as a
   bkit defect, this would have been wrong. The harness now runs one extra
   session with discovery enabled.

2. **18 skills appeared dead** (above).

Two further findings were real and in bkit's data.

**39 keywords ended in a sentence period** (`"제어."`, `"롤백."`), captured from
the last entry on each `Triggers:` line. They looked alive and could never
match. After cleanup, `제어 레벨 바꿔줘` → `bkit:control` and `롤백 해줘` →
`bkit:rollback` route for the first time.

That cleanup then exposed a second: the vendor-specific `bkend-*` skills had
lost their vendor token on the non-English side, leaving bare `인증`, `로그인`,
`회원가입`. With the periods gone those became matchable, and
"회원가입 기능 만들어줘" routed to a BaaS documentation skill instead of bkit's
general fullstack path. Every `bkend-*` keyword now names bkend, matching what
its English triggers always did.

## Residual risk

- `FileChanged` interactive firing is **unverified** — PTY allocation was
  unavailable in this environment. The decision to retire it rests on the
  matcher grammar, which is sufficient independently.
- The destructive rules remain a denylist. Four proven bypasses are closed; the
  list is not complete and the documentation no longer claims it is.
- Agent dispatch is proven; agent *output quality* is not in scope here.
