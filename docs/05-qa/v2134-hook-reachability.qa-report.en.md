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
| `trigger-locale-contract` | 161 | a restored trailing period on `제어` → 1 failure |
| `shipped-scripts-parse` | 40 | the v2.1.33 corrupted harness line → 2 failures |
| `destructive-bypass` | 27 | — |
| `hook-failure-observability` | 5 | — |
| `ci-host-integration-wiring` | 5 | removing `BKIT_HOST_INTEGRATION=1` from CI → 1 failure |

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
