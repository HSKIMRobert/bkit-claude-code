# v2.1.37 — Decision-Surface Inventory: every bkit path that can stop a tool call

> Feature: `v2137-permission-mode` · PDCA phase: analysis (pre-plan investigation)
> Target release: v2.1.37 · Branch: `feat/v2.1.37-permission-mode-awareness`
> Measured against: Claude Code **v2.1.231**, bkit **v2.1.36**, Node v22, darwin 24.6.0

## 1. Why this inventory exists

A user reported that `claude --dangerously-skip-permissions` still stops at `PreToolUse`.
Before proposing any change, this document establishes **what bkit can stop, from where,
and on what evidence** — so the fix targets a defect class rather than the one symptom
that happened to be noticed.

Every row below was verified by reading the cited line **and** by executing the path where
execution was possible. Nothing here is inferred from naming.

## 2. The finding that frames everything

```
$ grep -rn "permission_mode" scripts lib hooks agents skills
(0 results)
```

Claude Code sends `permission_mode` to **every** hook event as a common input field
(`"default" | "plan" | "acceptEdits" | "auto" | "dontAsk" | "bypassPermissions"`).
bkit reads it in zero places. `lib/core/io.js parseHookInput()` (:317-331) extracts five
fields — `toolName`, `filePath`, `content`, `command`, `oldString` — and `permission_mode`
is not among them.

Consequence: every decision surface in §3 behaves identically whether the user asked for
maximum oversight or explicitly turned confirmation off.

## 3. The inventory

### 3.1 Surfaces that can stop a **tool call**

| # | Surface | file:line | Decision emitted | Reads `permission_mode` | Verified by |
|---|---|---|---|---|---|
| S1 | Destructive Detector — critical | `scripts/unified-bash-pre.js:311` | `decision:'block'` via `outputBlockWithContext` | No | execution |
| S2 | Heredoc bypass guard — critical | `scripts/unified-bash-pre.js:377` | `decision:'block'` | No | read + unit tests |
| S3 | Push Event Guard — deny verdict | `scripts/unified-bash-pre.js:456` | `decision:'block'` | No | read |
| S4 | Memory Enforcer — directive deny | `scripts/unified-bash-pre.js:589` | `decision:'block'` | No | read |
| S5 | Destructive Detector — ask-grade | `scripts/unified-bash-pre.js:664` | `hookSpecificOutput.permissionDecision:'ask'` | No | execution |
| S6 | Phase-9 deployment guard | `scripts/unified-bash-pre.js:144` | `decision:'block'` | No | read |
| S7 | Zero-Script-QA bash guard | `scripts/unified-bash-pre.js:183` | `decision:'block'` | No | read |
| S8 | Permission Manager deny (Write/Edit) | `scripts/pre-write.js:404-405` | `decision:'block'` **+ `process.exit(2)`** | No | read |
| S9 | Scope limiter hard-deny | `scripts/pre-write.js:444` | `decision:'block'` | No | read |
| S10 | PermissionRequest always-deny | `scripts/permission-request-handler.js:110` | `decision.behavior:'deny'` | No | read |

Payload construction for S1–S9 lives in `lib/core/io.js`:
`outputBlock` (:388), `outputBlockWithContext` (:416), `outputAsk` (:477).
Each emits unconditionally; none takes the payload or the mode as an argument.

### 3.2 Surfaces that stop something **other than** a tool call

| # | Surface | file:line | Effect | In scope? |
|---|---|---|---|---|
| S11 | PreCompact guard | `scripts/context-compaction.js:77` | `process.exit(2)` blocks compaction | No — not a tool call, no permission semantics |
| S12 | Stop-hook continuation | `lib/core/io.js:571` `outputStopSurface` | `decision:'block'` makes the turn continue | No — opposite polarity; `decision:'block'` on Stop means *keep going*, documented at `lib/domain/ports/cc-payload.port.js:26-34` |

### 3.3 Verified **non**-blockers

| Surface | Evidence |
|---|---|
| `scripts/lint-skill-md.js` | `process.exit(0); // never block` (:120); all four exits are 0 |
| `pre-write.js` destructive detector | Advisory only. Measured: a Write whose *content* mentions a recursive delete emits `Destructive operation detected: G-001` as context and exits 0 — the write proceeds |
| `pre-write.js` Permission Manager, in practice | `DEFAULT_PERMISSIONS` (`lib/permission-manager.js:34-39`) declares no `Write(...)`/`Edit(...)` patterns, so `checkPermission('Write', path)` falls through to the tool-level `Write: 'allow'`. S8 is reachable in code but unreachable with the shipped defaults |

## 4. Host-contract facts established

| Fact | Source |
|---|---|
| PreToolUse hooks run **before** the permission prompt; hook output can deny, force a prompt, or skip the prompt | `code.claude.com/docs/en/permissions` § Extend permissions with hooks |
| A hook exiting 2 stops the call **before permission rules are evaluated** | same section |
| `bypassPermissions` still prompts for: explicit `ask` rules, org-`ask` connector tools, `requiresUserInteraction` MCP tools, and the root/home removal circuit breaker. **Hooks are not on that list — because they act at an earlier stage, not because they are exempt** | `code.claude.com/docs/en/permission-modes` § Skip all checks |
| `permission_mode` is a common field on every hook event | `code.claude.com/docs/en/hooks` § Hook input |
| Hook `ask` is honoured under `--dangerously-skip-permissions` | **measured**, §5 |

## 5. Measurements

### 5.1 Claude Code honours a hook `ask` in bypassPermissions — with no bkit present

A throwaway project containing one hook that returns `permissionDecision:'ask'` and nothing
else, run headless:

```
claude -p --dangerously-skip-permissions "Run the bash command: echo HELLO_FROM_BASH"
```

Result JSON (CC v2.1.231):

```json
"permission_denials":[{"tool_name":"Bash","tool_input":{"command":"echo HELLO_FROM_BASH"}}]
```

An `echo` was stopped in bypass mode. This isolates the behaviour to the host contract and
rules out any bkit-specific cause for the *mechanism*.

### 5.2 bkit emits ask/deny while the payload says `bypassPermissions`

Synthetic PreToolUse payloads carrying `"permission_mode":"bypassPermissions"`, fed to the
shipped hook:

| Command | bkit output |
|---|---|
| `npm run build` | allow |
| `git status` | allow |
| `git commit -m fix` | allow |
| `npm test` | allow |
| `docker compose down -v` | allow |
| `git checkout main` | allow |
| `cat .env.example` | allow |
| `rm -rf ./tmp/build` | **ask** (G-001) |
| `rm -rf node_modules` | **ask** (G-001) |
| `git commit -m 'fix' && git push origin main` | **ask** (G-004) |
| `npm remove lodash react vue axios dayjs` | **ask** (G-007) |
| `grep -rn delete src a b c d e` | **ask** (G-007) |

### 5.3 A live block observed during this investigation

While assembling §5.2, the investigator's own `Bash` call was denied by S1:

```
Blocked: bkit Destructive Detector: this command matches rule G-001 (Recursive delete)
and is blocked as critical.
```

The command was a `printf | node` that carried the characters `rm -rf` inside a JSON test
payload. It deleted nothing. This is the false-positive class of §6.2 reproducing itself
unprompted, in an ordinary working session.

## 6. Findings

**F1 — Root cause (confirmed).** bkit reinstates a confirmation step that the user
explicitly disabled, because no decision surface consults `permission_mode`. The host is
behaving as documented; bkit is the component that ignores stated intent.

**F2 — The grades are not equivalent.** S5 (`ask`) asks a question. S1–S4 and S6–S10
(`deny`) refuse outright. A design that relaxes both under `bypassPermissions` is a
different, larger decision than one that relaxes only the question. This must be settled in
design, not assumed here.

**F3 — Residual false positives (measured, distinct from F1).** G-007's pattern
`/\b(rm|del|delete|remove)\b.*(\s+\S+){5,}/i` (`lib/control/destructive-detector.js:113`)
fires on any single command segment containing the *word* `delete` or `remove` plus five or
more tokens — including read-only ones (§5.2, `grep -rn delete …`). Issue #148 fixed the
cross-segment case in v2.1.36; the within-segment case survives.

**F4 — Substring guards with no grading.** S6 blocks on the bare substrings `--force` and
`production` anywhere in a command; S7 blocks on `rm -r`, `TRUNCATE`, `DELETE FROM` and
similar. Both refuse outright with no target grading and no ask tier, and both are gated
only on which skill/agent is active.

**F5 — Two output shapes for one concept.** S1–S4, S6–S9 emit the legacy top-level
`decision:'block'`; the documented PreToolUse shape is
`hookSpecificOutput.permissionDecision:'deny'`. The legacy form works today (§5.3 is
evidence it reaches the host), so this is a consistency question, not a live defect.

**F6 — Unattended runs cannot answer.** External issue #148 recorded ~15 minutes of dead
time per incident when a `PreToolUse` question had nobody to answer it. `bypassPermissions`
is the strongest available signal that no one is watching, which is what makes F1 costly
rather than merely annoying.

**F7 — Backward compatibility is undetermined by binary probing.** `strings` finds
`permission_mode` in the v2.1.227/228/231 binaries but also finds *no* occurrence of the
control marker `hook_event_name` in v2.1.226, whose payload is packed differently. The probe
therefore says nothing about versions at or below 2.1.226, and no floor may be claimed from
it. bkit's runtime minimum is 2.1.78, so any implementation must treat an absent
`permission_mode` as "unknown" and keep today's behaviour — the same fail-safe pattern
already used for `background_tasks` (`lib/core/io.js:74-79`).

## 6b. Host semantics, measured rather than assumed

### 6b.1 `permission_mode` is delivered verbatim, for every mode

One hook that dumps its stdin, run headless once per mode on CC v2.1.231:

| Requested mode | `permission_mode` received | Payload keys |
|---|---|---|
| `default` | `"default"` | `cwd, effort, hook_event_name, permission_mode, prompt_id, session_id, tool_input, tool_name, tool_use_id, transcript_path` |
| `plan` | `"plan"` | identical |
| `acceptEdits` | `"acceptEdits"` | identical |
| `dontAsk` | `"dontAsk"` | identical |
| `bypassPermissions` | `"bypassPermissions"` | identical |

`--dangerously-skip-permissions` produces `"bypassPermissions"` (§5.1). `auto` was not
measured — it requires account eligibility this environment does not have — so it is
handled by policy, not by measurement, and that is stated where it is used.

### 6b.2 Two fields bkit reads do not exist in the payload

The key list above is exhaustive. Neither `bypassPermissions` nor `permissionDecision`
appears at the top level of a PreToolUse payload, yet both are read:

| Read site | Reads | Actual value at runtime |
|---|---|---|
| `scripts/pre-write.js:340` | `ctx.input.bypassPermissions` | always `undefined` → `false` |
| `scripts/unified-bash-pre.js:630` | `input.permissionDecision` | always `undefined` → defaults to `'allow'` |

**F8 — The ENH-263 guard is unreachable.** `lib/domain/guards/enh-263-claude-write.js:47`
returns `{hit:false}` unless `ctx.bypassPermissions` is true, and the only thing that ever
sets it is the always-`false` read above. The guard has never fired in production. The
correct source for that flag is `permission_mode === 'bypassPermissions'`, so the fix for F1
also revives it — which is why F8 has to be handled deliberately rather than as a
side effect. `lib/domain/ports/cc-payload.port.js:21` documents a `permissions` object that
CC does not send, and is the origin of the mistaken field name.

**F9 — Guard lifecycle is declared but never applied.** Both regression guards export
`removeWhen(ccVersion)` returning true for CC ≥ 2.1.118, and
`lib/cc-regression/defense-coordinator.js:24-58` never calls it. On CC v2.1.231 these guards
describe regressions that were fixed 113 releases ago. Reviving F8 without applying F9 would
start emitting attribution for a regression that no longer exists.

### 6b.3 A hook `ask` is a refusal wherever nobody can answer

Measured with the same minimal ask-hook, headless:

| Mode | Outcome |
|---|---|
| `bypassPermissions` | `permission_denials` = 1, command did not run |
| `dontAsk` | `permission_denials` = 1, command did not run |
| `acceptEdits` | `permission_denials` = 1, command did not run |

This confirms the shape of F6 concretely: in any non-interactive run, bkit's `ask` is not a
question — it is a refusal with a question mark on it. The documentation supports the same
reading for `dontAsk` even interactively: that mode "auto-denies every tool call that would
otherwise prompt you" (`permission-modes` § dontAsk).

## 7. Out of scope for this inventory

- Whether `deny` should ever relax — a design decision (F2), deferred to the design phase.
- Rule-precision work on G-004/G-007 (F3) and the substring guards (F4) — assessed for
  inclusion during the related-surface sweep, not decided here.
- S11/S12 — different mechanisms with no permission semantics.

## 7b. Related-surface sweep

Run after implementation, per the maintainer's rule that a fix targets the defect class
rather than the reported instance.

**F10 — A search for a dangerous string was graded as performing one. IN SCOPE, fixed
(ENH-473).** Reproduced twice while writing this release: a `grep` for two rule patterns was
refused as "Recursive delete; SQL table drop". `grep` has no write mode, so the command could
not have deleted anything. This is F3 one level up — F3 stopped G-007 reading a *word* as a
delete command; F10 stops any rule reading a search *argument* as an operation.

The exemption is bounded severely, because its failure direction is a false negative. Both
must hold: the command head is a search tool with no write mode (`echo` is deliberately
excluded — it is how `echo "…" | sh` starts), and the segment contains no shell metacharacter
outside quotes. Quote-awareness is load-bearing: `grep -rlE "DROP|rm" lib` carries a `|`
inside a regex, and reading it as a pipe would have left the commonest form of the false
positive unfixed. An unbalanced quote is treated as escaping, because a segment that cannot
be parsed with confidence should not be trusted.

Five negative controls ship with it — real pipe to a shell, redirect to a script, `echo`
payload, command substitution, unbalanced quote — each carrying an actual destructive string.
An earlier draft of those controls used payload-free commands and therefore passed by being
empty rather than by being caught: the bogus green issue #148 warned about, reproduced inside
its own regression lock.

**F11 — A third declaration of the same destructive policy. OUT OF SCOPE, recorded.**
`lib/permission-manager.js:34-39` `DEFAULT_PERMISSIONS` declares `Bash(rm -rf*): deny`,
`Bash(git push --force*): deny` and two `ask` rules. Nothing consults it for Bash:
`pre-write.js` is its only caller and asks about `Write`/`Edit`, for which the table holds no
patterns, so it falls through to `Write: 'allow'`. Combined with `bkit.config.json`'s
`permissions` block (declarative by ENH-458) and the Destructive Detector itself, the same
policy is now stated in three places, only one of which enforces anything. Consolidating them
is a separate change with its own blast radius and its own tests; doing it inside a release
whose evidence is a behavioural matrix would confound both.

**Not duplicates.** `lib/defense/heredoc-detector.js` owns heredoc shapes that the detector
deliberately elides, and `lib/core/io.js`'s pattern strings are alternative-suggestion text.
Neither is a second rule table.

## 8. Reproduction assets

The measurement scripts backing §5 are carried into
`test/e2e/external-dogfood/` as a permanent regression lock during the test phase, following
the practice established by issue #148: a green reading is meaningless unless genuinely
destructive commands are still stopped in the same run, so negative controls ship with it.
