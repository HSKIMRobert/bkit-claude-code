/**
 * I/O Utilities
 * @module lib/core/io
 * @version 2.1.10
 *
 * Claude Code 전용 플러그인으로 단순화 (v1.5.0). Tag synced to 2.0.0 per ENH-263 (2026-04-21).
 */

const fs = require('fs');
const { STDIN_READ_TIMEOUT_MS } = require('./constants');

// Lazy require to avoid a circular dependency (debug.js -> platform.js is a
// separate chain; io.js -> debug.js is one-way). Needed so H5 can surface
// stdin parse failures via debugLog instead of swallowing them silently.
let _debug = null;
function getDebug() {
  if (!_debug) {
    _debug = require('./debug');
  }
  return _debug;
}

/*
 * ENH-466 (v2.1.37) — the permission-mode policy, loaded lazily for the same reason
 * `debug` is: this module is required at the top of all 28 hook scripts, and a
 * load-time require chain is one more thing that can fail before a handler has
 * read its payload. The policy is a pure lookup table with no dependencies of its
 * own, so the lazy handle costs nothing on the hot path.
 */
let _permissionModePolicy = null;
function getPermissionModePolicy() {
  if (!_permissionModePolicy) {
    _permissionModePolicy = require('../domain/policy/permission-mode-policy');
  }
  return _permissionModePolicy;
}

const MAX_CONTEXT_LENGTH = 500;

// Read buffer size for the incremental stdin reader (64 KiB — hook payloads are
// far smaller, but a generous chunk keeps large/multi-chunk payloads to one or
// two reads).
const STDIN_CHUNK_SIZE = 65536;

/**
 * 컨텍스트 문자열 자르기
 * @param {string} context
 * @param {number} [maxLength=MAX_CONTEXT_LENGTH]
 * @returns {string}
 */
function truncateContext(context, maxLength = MAX_CONTEXT_LENGTH) {
  if (!context || context.length <= maxLength) return context || '';
  return context.slice(0, maxLength) + '... (truncated)';
}

/**
 * ENH-374 — Report whether a Stop-family hook payload still has background work
 * in flight.
 *
 * Why this exists: `cleanupAgentState()` wipes the team roster, and until now
 * the only guard on it was `state.enabled`. That was correct while subagents
 * ran in the foreground and always finished before the main turn did. Two CC
 * changes broke the assumption — v2.1.218 made `/code-review` a background
 * subagent, and v2.1.219 made subagents spawn nested subagents to depth 3 by
 * default — so the main turn now routinely ends while subagents are alive.
 * Reproduced on CC v2.1.220: the Stop hook fired mid-flight, cleared the
 * roster, and every subsequent `SubagentStop` logged "Teammate not found for
 * status update" (4/4 spawns orphaned).
 *
 * CC supplies the signal needed to tell the two cases apart. `background_tasks`
 * is documented upstream as: "In-flight background work (running/pending +
 * backgrounded) registered in this session. Lets hooks distinguish 'session is
 * done' from 'session is paused waiting for background work to wake it'. Empty
 * array when nothing is in flight."
 *
 * That last sentence is the contract this function relies on: emptiness — not
 * any particular `status` value — is the signal. Enumerating an allowlist of
 * in-flight statuses would risk missing one and cleaning up early, which is the
 * failure being fixed; deferring cleanup one turn longer is harmless by
 * comparison.
 *
 * Backward compatible: CC before v2.1.218 sends no `background_tasks`, so an
 * absent or non-array value returns `false` and those runtimes keep the
 * historical cleanup behaviour unchanged.
 *
 * @param {*} hookContext - Parsed Stop / SubagentStop / SessionEnd hook payload
 * @returns {boolean} true when at least one background task is still registered
 */
function hasInFlightBackgroundWork(hookContext) {
  if (!hookContext || typeof hookContext !== 'object') return false;
  const tasks = hookContext.background_tasks;
  if (!Array.isArray(tasks)) return false;
  return tasks.length > 0;
}

/**
 * stdin에서 JSON 동기적 읽기 (유계 parse-early 리더)
 *
 * Issue #139: the previous `fs.readFileSync(0, 'utf8')` blocks until stdin EOF
 * with NO timeout. A hook therefore stalls for as long as Claude Code keeps the
 * stdin write-end open (observed up to ~15.5 min, far past the hook's own 10 s
 * timeout). This reader reads fd 0 incrementally and returns the instant the
 * accumulated buffer holds a complete JSON value — it never waits for EOF, which
 * is precisely the source of the stall. Used by every bkit hook script, so the
 * fix is central: all hook events are protected, not just Stop.
 *
 * The raw-fd `fs.readSync` path creates no libuv stream handle, so the process
 * exits promptly after this returns even when the pipe is still held open.
 *
 * H5 fix (audit) preserved: a malformed/truncated JSON-RPC envelope used to be
 * indistinguishable from a valid empty object (silently returned {}). Every
 * parse failure is recorded via debugLog, and BKIT_STRICT_STDIN=1 rethrows so a
 * debugging session sees the real error instead of a fabricated empty input.
 *
 * Residual (accepted): the deadline is best-effort — it is only checked between
 * blocking `readSync` calls, so a truly empty-but-held-open pipe can still block
 * inside a single read until EOF. Callers that must be hard-bounded even then
 * (the turn-gating Stop hook) use `readStdinBounded` instead.
 *
 * @returns {*}
 */
function readStdinSyncInner() {
  const deadline = Date.now() + STDIN_READ_TIMEOUT_MS;
  const tmp = Buffer.alloc(STDIN_CHUNK_SIZE);
  let buf = Buffer.alloc(0);
  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      // parse-early: return as soon as the buffer holds a complete JSON value.
      if (buf.length > 0) {
        try {
          return JSON.parse(buf.toString('utf8'));
        } catch (_) {
          /* incomplete — read more */
        }
      }
      if (Date.now() > deadline) break; // best-effort bound between reads
      let n = 0;
      try {
        n = fs.readSync(0, tmp, 0, STDIN_CHUNK_SIZE, null);
      } catch (e) {
        if (e.code === 'EAGAIN') continue; // non-blocking fd, no data yet
        if (e.code === 'EOF') { n = 0; } // some platforms surface EOF as a throw
        else throw e;
      }
      if (n === 0) break; // real EOF
      buf = Buffer.concat([buf, tmp.slice(0, n)]);
    }
    return JSON.parse(buf.toString('utf8')); // final attempt (empty → throws → {})
  } catch (e) {
    getDebug().debugLog('io', 'readStdinSync parse failure', {
      error: e && e.message,
      strict: process.env.BKIT_STRICT_STDIN === '1',
    });
    /*
     * v2.1.34 — this is what `degraded` means, and until now nothing produced it.
     *
     * Returning `{}` lets the hook keep running, which is right: a hook must not
     * take down the session over a malformed envelope. But every guard
     * downstream then inspects an empty payload, finds no command and no file
     * path, and ALLOWS. The hook exits 0 having enforced nothing — the single
     * most dangerous silent state in the layer, and it left no trace at all.
     *
     * Only recorded when bytes actually arrived and failed to parse. An empty
     * stdin is a direct invocation (a test, a CLI run), not a degradation, and
     * recording it would fill the ledger with noise from the tooling.
     */
    if (buf.length > 0) {
      /*
       * Recorded only when the degradation can be ATTRIBUTED to a hook event.
       *
       * Without that condition the suite poisons its own project: several tests
       * feed deliberately malformed payloads to this reader, and each one wrote
       * an `unknown` failure into `.bkit/runtime/hook-dispatch.ndjson`. Running
       * the tests then made the next session open with "bkit hooks reported 3
       * failure(s)" — a warning about the test suite doing its job. A guard that
       * cries wolf is one people learn to skip, and then the real failure it was
       * built for goes past unread too.
       *
       * A genuine hook invocation names its event: the host sets
       * CLAUDE_HOOK_EVENT, and even a truncated envelope usually still carries
       * `hook_event_name`. An unattributable degradation cannot be told apart
       * from a direct CLI or test invocation, so it is left alone.
       */
      const named = process.env.CLAUDE_HOOK_EVENT
        || (buf.toString('utf8').match(/"hook_event_name"\s*:\s*"([A-Za-z]+)"/) || [])[1];
      if (named) {
        try {
          require('./hook-dispatch').recordOutcome(
            named,
            'degraded',
            `stdin payload did not parse (${buf.length} bytes): ${e && e.message}`
          );
        } catch (_) { /* the recorder must never be the thing that breaks */ }
      }
    }
    if (process.env.BKIT_STRICT_STDIN === '1') {
      throw e; /* surface the real error in strict/debug mode */
    }
    return {};
  }
}

/**
 * stdin에서 JSON 읽기 — parse-early + hard timeout으로 완전 유계화 (Issue #139).
 *
 * The async, event-based counterpart to readStdinSync for hooks that MUST never
 * exceed a wall-clock budget even when stdin carries no data / a truncated
 * payload while the pipe is held open (cases the sync reader cannot hard-bound,
 * because its deadline can only be checked between blocking `readSync` calls).
 *
 * Two guarantees:
 *  1. parse-early — resolves the instant the accumulated data is valid JSON,
 *     without waiting for EOF.
 *  2. hard timeout — a `setTimeout` resolves with the best available value once
 *     `timeoutMs` elapses, so the read can never block longer than that.
 *
 * Critically, it destroys `process.stdin` on resolve. Without that, the open
 * stdin handle keeps the event loop alive until EOF and the PROCESS lingers even
 * though the payload was already parsed — reintroducing the very stall we fix.
 *
 * @param {number} [timeoutMs=STDIN_READ_TIMEOUT_MS] - Hard wall-clock budget (ms)
 * @returns {Promise<*>} Parsed payload, or {} on timeout/parse-failure
 */
function readStdinBoundedInner(timeoutMs) {
  const budget = (typeof timeoutMs === 'number' && timeoutMs > 0)
    ? timeoutMs
    : STDIN_READ_TIMEOUT_MS;
  return new Promise((resolve) => {
    let data = '';
    let done = false;
    let timer = null;

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      try { process.stdin.pause(); } catch (_) { /* ignore */ }
      process.stdin.removeAllListeners('data');
      process.stdin.removeAllListeners('end');
      process.stdin.removeAllListeners('error');
      // Release the stdin handle so the event loop can drain and the process
      // can exit promptly even if CC keeps the write-end open.
      try { process.stdin.destroy(); } catch (_) { /* ignore */ }
    };

    const finish = (value) => {
      if (done) return;
      done = true;
      cleanup();
      resolve(value);
    };

    const parseOrEmpty = () => {
      try {
        return JSON.parse(data);
      } catch (e) {
        getDebug().debugLog('io', 'readStdinBounded parse failure', {
          error: e && e.message,
          bytes: data.length,
        });
        return {};
      }
    };

    timer = setTimeout(() => {
      getDebug().debugLog('io', 'readStdinBounded hard timeout', {
        timeoutMs: budget,
        bytes: data.length,
      });
      finish(parseOrEmpty());
    }, budget);
    if (timer.unref) timer.unref();

    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
      // parse-early: resolve the moment we hold a complete JSON value.
      try {
        const parsed = JSON.parse(data);
        finish(parsed);
      } catch (_) {
        /* incomplete — keep reading */
      }
    });
    process.stdin.on('end', () => finish(parseOrEmpty()));
    process.stdin.on('error', () => finish({}));
  });
}

/**
 * stdin에서 JSON 비동기 읽기
 *
 * Mirrors the H5 fix: parse failures are debugLogged (and rethrown under
 * BKIT_STRICT_STDIN) rather than silently resolved to {}.
 *
 * @returns {Promise<*>}
 */
async function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => data += chunk);
    process.stdin.on('end', () => {
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        getDebug().debugLog('io', 'readStdin parse failure', {
          error: e && e.message,
          strict: process.env.BKIT_STRICT_STDIN === '1',
        });
        if (process.env.BKIT_STRICT_STDIN === '1') {
          reject(e); /* surface the real error in strict/debug mode */
          return;
        }
        resolve({});
      }
    });
  });
}

/**
 * Hook 입력 파싱
 *
 * H4 fix (audit): absent fields now return null (not '') so callers can
 * distinguish "no value supplied" from "empty string". Returning '' for
 * absent values caused empty-vs-null branch bugs (e.g. treating "no feature"
 * as "feature named ''"). Callers branching on a field's presence should use
 * `value == null` rather than `value === ''`.
 *
 * ENH-466 (v2.1.37) — `permissionMode` joins the five fields this parser has always
 * extracted. Claude Code sends `permission_mode` on EVERY hook event, and through
 * v2.1.36 bkit read it nowhere, so every guard behaved the same whether the user
 * had asked for maximum oversight or had run with `--dangerously-skip-permissions`.
 * Unlike the other fields it is normalized rather than picked verbatim: an absent
 * or unrecognized value becomes `'default'`, which changes nothing, so older
 * Claude Code builds keep their current behaviour (see permission-mode-policy.js
 * for why no version floor could be established for the field).
 *
 * @param {*} input
 * @returns {{toolName: ?string, filePath: ?string, content: ?string, command: ?string, oldString: ?string, permissionMode: string}}
 */
function parseHookInput(input) {
  const pick = (...vals) => {
    for (const v of vals) {
      if (v !== undefined && v !== null && v !== '') return v;
    }
    return null;
  };
  return {
    toolName: pick(input?.tool_name, input?.toolName),
    filePath: pick(input?.tool_input?.file_path, input?.tool_input?.filePath),
    content: pick(input?.tool_input?.content),
    command: pick(input?.tool_input?.command),
    oldString: pick(input?.tool_input?.old_string),
    permissionMode: getPermissionModePolicy().normalizeMode(
      pick(input?.permission_mode, input?.permissionMode)
    ),
  };
}

/**
 * Cursor IDE 런타임 감지 (GitHub issue #118).
 *
 * Cursor의 Claude plugin bridge는 PreToolUse hook runner에서 Claude Code와는
 * 다른 JSON 스키마를 기대한다:
 *   allow: {"permission":"allow","agent_message":...}
 *   deny:  {"permission":"deny","user_message":...,"agent_message":...}
 * CURSOR_VERSION env는 Cursor hook runtime이 주입한다. 빈 문자열("")은
 * 미설정과 동급으로 취급하여 truthy 여부로 판별한다.
 * @returns {boolean}
 */
function isCursorRuntime() {
  return !!process.env.CURSOR_VERSION;
}

/**
 * Hook events whose plain stdout Claude Code shows to the model.
 *
 * ENH-433 (v2.1.37). Measured from code.claude.com/docs/en/hooks, not assumed.
 * The general rule is stated once — "For most events, stdout is written to the
 * debug log but not shown to Claude" — and exactly two events say otherwise:
 *
 *   SessionStart      "plain stdout already reaches Claude for this event"
 *   UserPromptSubmit  "any non-JSON text written to stdout is added as context"
 *
 * Anything printed bare on any other event is written to a log nobody reads
 * during the session. Do not add an event here without a line in the docs
 * saying so; the whole point of this constant is that the rule stopped being
 * guessed one call site at a time.
 */
const STDOUT_REACHES_MODEL = new Set(['SessionStart', 'UserPromptSubmit']);

/**
 * Hook events that document a `hookSpecificOutput.additionalContext` field.
 *
 * ENH-433 (v2.1.37). Measured the same way — these are the nine events whose
 * "decision control" table in the Claude Code hooks reference lists
 * `additionalContext`. For an event in this set a message HAS somewhere to go,
 * even when bare stdout would be discarded.
 */
const CONTEXT_CHANNEL_EVENTS = new Set([
  'SessionStart', 'Setup', 'UserPromptSubmit', 'UserPromptExpansion',
  'PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'PostToolBatch',
  'SubagentStart',
]);

/**
 * 허용 결정 출력.
 * - Cursor: {"permission":"allow","agent_message":...}
 * - Claude Code: SessionStart/UserPromptSubmit → {success,message} JSON;
 *   an event with an additionalContext channel → hookSpecificOutput;
 *   anything else → the debug log, because nothing else would be delivered.
 * @param {string} [context]
 * @param {string} [hookEvent]
 */
function outputAllow(context, hookEvent) {
  const truncated = truncateContext(context);

  if (isCursorRuntime()) {
    // Cursor IDE PreToolUse allow 스키마.
    const payload = { permission: 'allow' };
    if (truncated) {
      payload.agent_message = truncated;
    }
    console.log(JSON.stringify(payload));
    return;
  }

  if (STDOUT_REACHES_MODEL.has(hookEvent)) {
    console.log(JSON.stringify({
      success: true,
      message: truncated || undefined,
    }));
    return;
  }

  if (!truncated) return;

  /*
   * ENH-433 (v2.1.37) — the message had nowhere to go on most events.
   *
   * The `else` branch here printed bare text to stdout for every event that is
   * not SessionStart or UserPromptSubmit. Claude Code's contract
   * (code.claude.com/docs/en/hooks): "For most events, stdout is written to the
   * debug log but not shown to Claude", and only two events say otherwise —
   * SessionStart ("plain stdout already reaches Claude for this event") and
   * UserPromptSubmit ("any non-JSON text written to stdout is added as context").
   *
   * Measured across bkit: 26 call sites passed a NON-empty message to an event
   * in neither set. Recovery guidance, guardrail attribution, PDCA context —
   * composed, truncated, printed, discarded.
   *
   * Nine events do have a context channel, and for those the message can simply
   * be delivered: `hookSpecificOutput.additionalContext` is what it was always
   * meant to be. That recovers eight of the call sites centrally, without
   * editing eight files — the shape ENH-466 settled on for the same reason, that
   * a per-site fix leaves the next call site to rediscover the rule.
   *
   * For an event with no channel there is nothing honest to emit, so the message
   * goes to the debug log under its own name. Bare stdout would land in the same
   * place while looking like output.
   */
  if (CONTEXT_CHANNEL_EVENTS.has(hookEvent)) {
    outputContext(truncated, hookEvent);
    return;
  }

  /*
   * No channel exists for this event, so this text cannot reach the model. It is
   * still printed, and that is deliberate rather than an oversight:
   *
   *   - Claude Code writes it to the debug log, so it remains available when
   *     diagnosing a hook, and printing costs nothing.
   *   - bkit's own integration tests read this line as the Stop family's
   *     liveness signal. A hook that prints nothing is hard to tell from a hook
   *     that crashed, which is the failure mode the crash recorder below exists
   *     to end.
   *
   * What changed is the belief, not the bytes. The debug entry states plainly
   * that the message was not delivered, so the next person composing a careful
   * sentence for a Stop hook finds out here rather than from its absence.
   *
   * ENH-482 records the consequence for the Stop family specifically: the
   * next-action hint in unified-stop.js is composed and never seen, and the only
   * channel that WOULD deliver it — `outputStopSurface`'s
   * `{decision:'block', reason}` — forces the turn to continue. Turning every
   * clean stop into a continuation is a product decision, not a bug fix, so it
   * is left for the maintainer rather than made here as a side effect.
   */
  try {
    getDebug().debugLog(hookEvent || 'unknown', 'outputAllow message not delivered to the model', {
      reason: 'this event has neither model-visible stdout nor an additionalContext channel',
      message: truncated,
    });
  } catch (_) { /* the debug channel must never break a hook's exit path */ }

  console.log(truncated);
}

/**
 * 차단 결정 출력.
 * - Cursor: {"permission":"deny","user_message":...,"agent_message":...}
 * - Claude Code: {"decision":"block","reason":...}
 * 두 runtime 모두 graceful deny이므로 exit(0).
 * @param {string} reason
 */
function outputBlock(reason) {
  if (isCursorRuntime()) {
    // Cursor IDE PreToolUse deny 스키마. reason을 사용자/에이전트 양쪽에 노출.
    console.log(JSON.stringify({
      permission: 'deny',
      user_message: reason,
      agent_message: reason,
    }));
  } else {
    console.log(JSON.stringify({
      decision: 'block',
      reason: reason,
    }));
  }
  process.exit(0);
}

/**
 * ENH-264 (bkit v2.1.10): Block a tool use while surfacing alternatives.
 *
 * Leverages CC v2.1.110+ PreToolUse `hookSpecificOutput.additionalContext`
 * to feed Claude a structured list of safer alternatives so the agent can
 * propose a recovery path instead of simply reporting "blocked".
 *
 * @param {string} reason - Short reason shown in the block message
 * @param {string[]} [alternatives] - Array of concrete safer commands / rephrasings
 * @param {string} [hookEvent='PreToolUse'] - CC hook event name
 */
function outputBlockWithContext(reason, alternatives, hookEvent) {
  const alts = Array.isArray(alternatives) && alternatives.length
    ? alternatives
    : [];

  if (isCursorRuntime()) {
    // Cursor IDE PreToolUse deny 스키마. 대체안을 agent_message에 함께 노출하여
    // 에이전트가 더 안전한 경로를 제안받도록 한다 (CC hookSpecificOutput 대체품).
    const agentMessage = alts.length
      ? `${reason}\n\nSafer alternatives you can try instead:\n${alts.map((a, i) => `  ${i + 1}. ${a}`).join('\n')}\n\nReformulate the command using one of the alternatives above or ask the user for an explicit confirmation.`
      : reason;
    console.log(JSON.stringify({
      permission: 'deny',
      user_message: reason,
      agent_message: agentMessage,
    }));
    process.exit(0);
    return;
  }

  const context = alts.length
    ? `Blocked: ${reason}\n\nSafer alternatives you can try instead:\n${alts.map((a, i) => `  ${i + 1}. ${a}`).join('\n')}\n\nReformulate the command using one of the alternatives above or ask the user for an explicit confirmation.`
    : `Blocked: ${reason}`;
  const payload = {
    decision: 'block',
    reason: reason,
    hookSpecificOutput: {
      hookEventName: hookEvent || 'PreToolUse',
      additionalContext: context,
    },
  };
  console.log(JSON.stringify(payload));
  process.exit(0);
}

/**
 * PreToolUse: hand the decision to the user instead of allowing or denying.
 *
 * v2.1.34 (D9). bkit had only two outcomes — block or allow — so every rule had
 * to be either catastrophic or invisible. G-001 chose catastrophic and refused
 * `rm -rf` on any target at all, including a scoped temporary directory, while
 * advising the user to "scope the command to a specific path" — advice the rule
 * made impossible to act on. Grading such a command down to `allow` would have
 * been a silent relaxation; `ask` is what the situation actually calls for.
 *
 * Uses `hookSpecificOutput.permissionDecision`, which is the documented shape
 * for PreToolUse (`allow` / `deny` / `ask` / `defer`).
 *
 * Scope of verification, stated precisely because the shape is the whole point:
 * the emitted payload is asserted by unit test, and PreToolUse itself is
 * confirmed to dispatch against a real runtime (test/contract/host-integration/
 * last-live-run.json). What is NOT verified is a live session actually
 * rendering the confirmation prompt — reaching that path needs an interactive
 * TTY, and the PTY this harness would need is unavailable in the sandbox
 * (`tcgetattr: Operation not supported on socket`). Do not upgrade this comment
 * to "verified end to end" without that run.
 *
 * ENH-466 (v2.1.37) — the third parameter. An `ask` is only worth emitting where someone
 * can answer it. In `bypassPermissions`, `dontAsk` and `acceptEdits` nobody can,
 * and the host turns the request into a refusal: measured on CC v2.1.231, a
 * minimal ask-returning hook produced `permission_denials` of 1 in all three.
 * So the tier that exists to avoid refusing a scoped operation was, in exactly
 * the modes where being proportionate matters most, refusing it.
 *
 * This is the SECOND of two checks. Call sites consult
 * `permission-mode-policy.isAskSuppressed()` themselves, because that is where
 * the audit context lives (rule ids, confidence, the command). The check here
 * catches a call site added later that forgets to — the "forgotten eleventh
 * site" failure that made a per-site-only design the wrong shape for this.
 *
 * The mode is normalized inside the policy, so an absent third argument means
 * `default`, which emits — every existing two-argument call keeps its behaviour.
 *
 * @param {string} reason - why confirmation is being requested
 * @param {string[]} [alternatives] - safer routes worth considering first
 * @param {string} [permissionMode] - host permission mode from the hook payload
 * @returns {boolean|void} `false` when the ask was suppressed and control returns
 *   to the caller; otherwise the process exits and nothing is returned
 */
function outputAsk(reason, alternatives, permissionMode) {
  const alts = Array.isArray(alternatives) ? alternatives : [];
  const detail = alts.length
    ? `${reason}\n\nBefore confirming, consider:\n${alts.map((a, i) => `  ${i + 1}. ${a}`).join('\n')}`
    : reason;

  if (getPermissionModePolicy().isAskSuppressed(permissionMode)) {
    /*
     * Suppressed, not silent. The model is told what was observed and why no
     * confirmation was raised, so a session transcript still shows that a guard
     * looked at this command — a guard that goes quiet without a trace is
     * indistinguishable from a guard that is broken, which is the failure mode
     * the crash recorder further down this file exists to end.
     *
     * The durable record is the caller's audit entry; this line is the
     * in-context one.
     */
    outputAllow(
      `${reason}\n\nNo confirmation was requested: the session is running in a permission mode `
      + 'that suppresses confirmation prompts. Proceeding.',
      'PreToolUse'
    );
    return false;
  }

  if (isCursorRuntime()) {
    /*
     * Cursor's PreToolUse schema, as used everywhere else in this file, carries
     * `permission: 'allow' | 'deny'`. There is no third tier we can point at,
     * and emitting an undocumented `'ask'` risks the host rejecting the whole
     * payload as malformed — which fails OPEN, letting the destructive command
     * run with no prompt at all. That is the worst available outcome.
     *
     * So on a host with no ask tier, a confirmation request degrades to a
     * refusal that says how to proceed. Fails closed, and stays inside a schema
     * we can actually name.
     */
    console.log(JSON.stringify({
      permission: 'deny',
      user_message: reason,
      agent_message: `${detail}\n\nThis host cannot show a confirmation prompt from a hook, `
        + 'so the command is refused rather than run unprompted. Ask the user to confirm '
        + 'explicitly, then re-issue it.',
    }));
    process.exit(0);
    return;
  }

  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'ask',
      permissionDecisionReason: detail,
    },
  }));
  process.exit(0);
}

/**
 * Feed text to the model from a non-blocking hook.
 *
 * v2.1.34. `outputAllow()` prints bare text on every event except SessionStart
 * and UserPromptSubmit. On PreToolUse that is fine. On PostToolUse it is not:
 * plain stdout from a PostToolUse hook goes to the transcript only, and the
 * model never sees it. Any handler that used `outputAllow(msg, 'PostToolUse')`
 * to say something was writing into a void — the identical class of defect as
 * ENH-410, where a block reason was computed and then dropped.
 *
 * `hookSpecificOutput.additionalContext` is the field that reaches the model,
 * so a hook with something to say must use this instead.
 *
 * @param {string} context - text to place in the model's context
 * @param {string} hookEvent - the event name, e.g. 'PostToolUse'
 */
function outputContext(context, hookEvent) {
  const truncated = truncateContext(context);
  if (!truncated) return;

  if (isCursorRuntime()) {
    // Cursor has no additionalContext channel; agent_message is the equivalent.
    console.log(JSON.stringify({ permission: 'allow', agent_message: truncated }));
    return;
  }

  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: hookEvent || 'PostToolUse',
      additionalContext: truncated,
    },
  }));
}

/**
 * 빈 출력 (Claude Code는 아무것도 출력하지 않음)
 */
function outputEmpty() {
  // Claude Code는 빈 출력 시 아무것도 출력하지 않음
}

/**
 * CC Stop hook — surface content and force Claude to continue (S6, ENH-364).
 *
 * CC's current strict Stop validator rejects `decision:'allow'`,
 * `hookSpecificOutput` (no Stop variant), and any non-schema root field
 * (`skillResult`/`autoTrigger`/...). The only schema-valid way for a Stop
 * hook to feed content back to the model AND keep the turn going is
 * `{ decision: 'block', reason: <content> }`. Claude receives `reason` as the
 * next-turn instruction and renders it (executive summary + AskUserQuestion
 * next-step options serialized into the text). This preserves the v2.1.21
 * #113 Stop-output-enforcement intent in a fully CC-compliant shape.
 *
 * @param {string} reason - Executive summary + next-step options (plain text)
 */
function outputStopSurface(reason) {
  console.log(JSON.stringify({ decision: 'block', reason: String(reason || '').trim() }));
}

/**
 * CC Stop hook — allow a clean stop with no forced continuation (S6, ENH-364).
 * Emits an empty object: every Stop schema field is optional, so `{}` is the
 * canonical "no opinion, let it stop" output. Used for read-only actions and
 * error fallbacks where surfacing a summary is not warranted.
 */
function outputStopAllow() {
  console.log(JSON.stringify({}));
}

/**
 * XML 특수문자 이스케이프
 * @param {string} content
 * @returns {string}
 */
function xmlSafeOutput(content) {
  if (!content) return '';
  return content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Record that this hook event reached bkit, then hand the payload back.
 *
 * Placed on the shared readers rather than in each handler so it covers every
 * hook script bkit ships and cannot be forgotten by a new one. A hook that
 * cannot prove the host ever invoked it is how eight bkit features stayed dead
 * across releases while every test stayed green — see lib/core/hook-dispatch.js.
 *
 * @template T
 * @param {T} payload
 * @returns {T} the same payload, unchanged
 */
function withDispatchRecord(payload) {
  try {
    require('./hook-dispatch').recordDispatch(payload);
    installCrashRecorder(payload && payload.hook_event_name);
  } catch (_) {
    /* observability must never break a hook */
  }
  return payload;
}

/** Guard so repeated reader calls in one process install the listeners once. */
let crashRecorderInstalled = false;

/**
 * The event this process is handling, once known.
 *
 * The recorder is installed at module load — before any handler has read its
 * payload — so at install time the event name is genuinely unknown. Keeping it
 * in a mutable cell lets a crash that happens LATER be attributed correctly,
 * while a crash that happens EARLIER is still recorded, as 'unknown'. Recording
 * an unattributed failure beats recording none.
 */
let crashRecorderEvent = null;

/**
 * Make a hook crash observable, without changing what happens next.
 *
 * v2.1.34 (R9). bkit's hook layer holds 333 catch blocks and 188 of them
 * swallow without a trace. Most are legitimately best-effort — a hook must not
 * take down the user's session because bookkeeping failed — but a layer where
 * every failure is silent is a layer where "working" and "broken" look
 * identical, which is exactly how eight shipped features stayed dead across
 * releases while every test passed.
 *
 * This records the failure and then lets the original behaviour proceed:
 * an uncaught exception still terminates with code 1, an unhandled rejection is
 * still non-fatal. Observation only — control flow is untouched, because a
 * mechanism that also changed semantics would be a second thing to debug.
 *
 * @param {string|undefined} event
 * @returns {void}
 */
function installCrashRecorder(event) {
  if (event) crashRecorderEvent = event;
  if (crashRecorderInstalled) return;
  crashRecorderInstalled = true;
  const record = (status, err) => {
    try {
      require('./hook-dispatch').recordOutcome(
        crashRecorderEvent || process.env.CLAUDE_HOOK_EVENT || 'unknown',
        status,
        (err && (err.stack || err.message)) || String(err)
      );
    } catch (_) { /* nothing left to fall back to */ }
  };

  /*
   * `uncaughtExceptionMonitor` is the API built for exactly this: it observes
   * and Node still applies its default afterwards.
   *
   * The first version of this used `process.on('uncaughtException')` plus
   * `process.on('unhandledRejection')`, with a comment claiming control flow was
   * untouched. Both halves were wrong, and measured:
   *
   *   no listener            exit=1, stack on stderr
   *   with the old listeners exit=0, no stack
   *
   * Registering an `unhandledRejection` listener SUPPRESSES Node's default,
   * which has been fatal since Node 15. So the recorder built to end silent
   * failure introduced a new one: a hook that died on a rejection exited 0 and
   * printed nothing, with the stack visible only in a ledger nobody reads at
   * the moment of the crash.
   *
   * The monitor keeps both properties — verified on this runtime: a throw and an
   * unhandled rejection each still exit 1 and still print their stack, and both
   * are observed.
   */
  process.on('uncaughtExceptionMonitor', (err) => {
    record('threw', err);
  });
}

/**
 * Read JSON from stdin synchronously, and record the dispatch.
 * @returns {*}
 */
function readStdinSync() {
  return withDispatchRecord(readStdinSyncInner());
}

/**
 * Bounded stdin read, and record the dispatch.
 * @param {number} [timeoutMs]
 * @returns {Promise<*>}
 */
function readStdinBounded(timeoutMs) {
  return readStdinBoundedInner(timeoutMs).then(withDispatchRecord);
}


/*
 * v2.1.34 — installed at module load, not on the first stdin read.
 *
 * The recorder used to be armed by `withDispatchRecord`, which runs only once a
 * handler has already called `readStdinSync()`. Everything before that point
 * was unobservable: a handler whose `require(...)` threw, a syntax error in a
 * lib module it pulls in, a throw inside the stdin reader itself. Those are
 * precisely the failures that kill a hook outright and leave nothing behind —
 * the process exits, the host sees a non-zero status it does not surface, and
 * the ledger has no line for it.
 *
 * `lib/core/io` is required at the top of every bkit hook script, so arming
 * here covers the whole lifetime of the process. The event name is filled in
 * later, once a payload is read.
 */
try { installCrashRecorder(process.env.CLAUDE_HOOK_EVENT || null); } catch (_) { /* never fatal */ }

module.exports = {
  MAX_CONTEXT_LENGTH,
  truncateContext,
  isCursorRuntime,
  hasInFlightBackgroundWork,
  readStdinSync,
  readStdinBounded,
  readStdin,
  parseHookInput,
  outputAllow,
  outputBlock,
  outputBlockWithContext,
  outputAsk,
  outputContext,
  outputEmpty,
  outputStopSurface,
  outputStopAllow,
  xmlSafeOutput,
};
