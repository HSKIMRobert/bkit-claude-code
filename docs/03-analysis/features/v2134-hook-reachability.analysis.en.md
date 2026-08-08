# v2.1.34 — Hook Reachability Analysis

> **Cycle**: defect response · **Branch**: `feat/v2.1.34-defect-response`
> **Method**: every finding reproduced against a real Claude Code runtime
> (v2.1.226) with `claude -p --plugin-dir`, never inferred from documentation.

## Why this document exists

bkit reached 6,398 passing assertions across 354 test files while eight shipped
features were dead in production. Every one of them passed its tests, because
every test called bkit's own function directly. `test/contract/l2-smoke.test.js`
states the boundary in its own header: it *"does NOT require the real CC
runtime"*.

A test that invokes a handler proves the handler works. It cannot prove the host
ever calls it — and for a hook, that is the only property that matters.

This analysis records what that blind spot was hiding, how each item was
reproduced, and what changed.

## Findings

### F1 — Hook timeouts were 1000× too large, on all 22 events

`timeout` in `hooks.json` is measured in **seconds** (Claude Code default 600
for command hooks). bkit wrote milliseconds throughout.

| Declared | bkit intended | Actual |
|---|---|---|
| `5000` (PreToolUse, PostToolUse) | 5s | **83 min** |
| `10000` (Stop) | 10s | **2 h 46 min** |
| `3000` (UserPromptSubmit) | 3s | 50 min |
| `1500` (SessionEnd) | 1.5s | clamped to the 60s ceiling |

**Reproduction.** A probe plugin whose hook blocks for 5 seconds, run three
times under different declared timeouts:

| Declared | Outcome |
|---|---|
| `3000` | completed — not killed |
| `30` | completed, `elapsedMs: 5009` — **the discriminator; 30 ms would have killed it instantly** |
| `2` | killed; Claude Code logged `Slow PreToolUse hooks: 2260ms` |

**Consequence.** This is the root cause behind issue #139, where a Stop hook
stalled a session for ~15 minutes "exceeding its own 10s timeout". The timeout
was never 10 seconds, so nothing cancelled it. v2.1.30 fixed that handler's
blocking stdin read — the symptom — and left the unit error armed on every
event.

### F2 — The `FileChanged` handler never ran once, from v2.1.1 to v2.1.33

Three independent causes, each confirmed:

1. **`if` does not accept alternation.** The block declared
   `if: "Write|Edit(docs/**/*.md)"`. The `if` field holds exactly one permission
   rule; the documentation lists that exact string as invalid. Placing the same
   string on a *valid* tool event also suppressed the hook, which isolates the
   syntax as a cause on its own.
2. **`if` is evaluated only on tool events** — `PreToolUse`, `PostToolUse`,
   `PostToolUseFailure`, `PermissionRequest`, `PermissionDenied`. On any other
   event a hook declaring `if` never runs. `FileChanged` is not a tool event.
3. **`FileChanged`'s matcher names literal files to watch** (letters, digits,
   `_`, `|`). The path glob this handler needs cannot be expressed on that event
   at all — so its purpose was unreachable regardless of the other two faults.

**Reproduction.** A controlled matrix, one variable at a time:

| Configuration | Fired |
|---|---|
| `PostToolUse` on `Edit`, no `if` | 2 (baseline) |
| `PostToolUse` on `Edit`, `if: "Edit(docs/**/*.md)"` | 2 (single rule is fine) |
| `PostToolUse` on `Edit`, `if: "Write\|Edit(docs/**/*.md)"` | **0** |
| `FileChanged`, no `if` | 0 |
| `FileChanged`, bkit's shipped configuration | 0 |

**Boundary of the evidence.** In headless `-p` mode `FileChanged` did not fire
for an external mid-session write or for Claude's own `Edit`; Claude Code
established watchers only for skill/command directories and `settings.json`.
Interactive behaviour is **unverified** — PTY allocation was unavailable in the
environment used. Cause (3) is sufficient on its own, so the conclusion does not
rest on that gap.

**Resolution.** The capability moved to `PostToolUse(Write|Edit)`, where a live
session shows it firing. `FileChanged` was retired through an explicit
`deprecation-registry.json` entry.

### F3 — The headline quality gate reported 100% for a feature that did not exist

In an empty directory, with no design document, no implementation, and a feature
name that appears nowhere:

```
M1_matchRate: { current: 100, threshold: 90, passed: true }
kpi.matchRate: 100
```

Two layers turned "nobody measured anything" into "everything matches":
`gap-detector.adapter.js` returned `{matchRate: 100, gaps: []}` when no
`agentTaskRunner` was injected, and `iterate-sprint.usecase.js` did the same in
its default. The CLI entry point passes an empty `deps` object, and a subprocess
cannot reach the Task tool.

In the same run `S2_featureCompletion` and `S4_archiveReadiness` both failed
correctly — only the gate bkit is built around failed open.

**Resolution.** Both layers now report the absence of a measurement
(`matchRate: null`, `measured: false`), and the gate records `passed: false` —
**not `null`**, because `auto-pause.js` and `advance-phase.usecase.js` both test
`passed === false`, so `null` reads as "not applicable" and lets a sprint sail
past.

### F4 — `once: true` was silently ignored

`once` is honoured only for hooks declared in skill frontmatter. Reproduction:
a session started with `--session-id`, then resumed, fired SessionStart twice.

### F5 — Half the tool surface was uncovered

`if` holds one rule, so `if: "Write(skills/**/SKILL.md)"` under a `Write|Edit`
matcher covered only `Write` — editing a `SKILL.md` never linted. `PostToolUse`
matched `Write` alone, so `unified-write-post.js` (PDCA tracking, template
validation, reachability ping) never ran on `Edit`, which is the common case for
an existing file.

### F6 — The v2.1.33 live-QA harness shipped unrunnable

`test/qa-harness-live-claude-p.sh:8` was committed as:

```
BKIT="20 20 12 61 79 80 81 98 ...cd "...dirname "-e")/.." && pwd)"
```

The author wrote `$(cd "$(dirname "$0")/.." && pwd)` and generated the file
through an **unquoted heredoc**, so the generating shell expanded `$(` into a
list of line numbers and `$0` into `-e` before the bytes reached disk. `bash -n`
rejects it.

It went unnoticed because nothing referenced the file — not CI, not
`qa-aggregate` — and the QA report it backed had been produced from an
uncommitted scratch copy. It also hardcoded an absolute home directory.

### F7 — Nine tests were enforcing the defects

The suite was not merely blind to F1 and F4; parts of it **required** them.

| Assertion | What it demanded |
|---|---|
| `CC-009` | `stopTimeout >= 5000` on a seconds field — that the Stop hook be allowed ≥83 minutes |
| `HF-018` / `HF-019` | the millisecond reading of both bounds |
| `A10-5` | every timeout within `1000..30000` — i.e. 16 minutes to 8 hours |
| `HIS-08`, `A10-3` | that `once: true` be present |
| `issue-129-description-budget` | that the sprint skill keep Korean keywords in frontmatter — the exact always-resident cost #129 was filed about |
| `LS-006..009`, `VS-011..015`, `TRIG-*` | multilingual keywords in frontmatter |

A test can hold a bug in place as firmly as it can prevent one.

### F8 — Four destructive-command bypasses

Probing the shipped rules with realistic payloads: `eval "$(echo <b64> | base64
-d)"`, `find / -type f -delete`, `dd if=/dev/zero of=/dev/disk0`, and
`curl … | sh` all returned `allow`. None shares a token with an existing rule —
the structural weakness of a denylist.

### F9 — Two guards blocked ordinary work

Both hit during this release. A commit message that merely *mentioned* a blocked
pattern, and `python3 - <<'PY'` whose body contained `Write|Edit`, were refused
as critical: the detectors read heredoc bodies as command lines. Separately,
`G-001` matched `rm -r` regardless of target, so clearing a scoped temporary
directory was refused exactly as hard as clearing `/` — while advising the user
to "scope the command to a specific path", which the rule made impossible to act
on.

### F10 — Silent failure was the house style

333 catch blocks in the hook layer; **188 swallow without a trace**. Most are
legitimately best-effort — a hook must not take down a session because
bookkeeping failed. But a layer where every failure is silent is one where
working and broken look identical from outside, which is the enabling condition
for F2, F5 and the eight historical defects.

## What changed structurally

**A sixth verification layer.** L1–L5 all call bkit's own code. L6 drives a real
`claude -p --plugin-dir` session and asserts from the outside that Claude Code
dispatched each hook, reading a new append-only ledger stamped from the shared
stdin readers (0.69 ms per hook; a locked read-modify-write measured 5.04 ms and
was rejected — a mechanism that proves hooks are healthy must not be what makes
them slow).

It found a ninth defect within minutes of existing: `session-start.js` never read
its hook payload, so it could not see `source` either.

**Removal became auditable.** Hook events may leave `hooks.json` only through a
`deprecation-registry.json` entry carrying `deprecatedIn` and a reason, mirroring
ADR 0014. Silent removal still fails the contract test.

**Counts describe behaviour, not registration.** 22 events / 25 blocks → 21 / 24.

## Residual risk

- `FileChanged` interactive firing is unverified (PTY unavailable). The decision
  to retire it rests on the matcher grammar, which is sufficient independently.
- The destructive rules remain a denylist. F8 closed four proven holes; it did
  not make the list complete, and the documentation no longer claims otherwise.
- The opt-in on the L6 layer is guarded by a CI-wiring test, because bkit has
  precedent for a gate that verified nothing for eleven releases
  (`validate-plugin --strict` with `continue-on-error: true`).
