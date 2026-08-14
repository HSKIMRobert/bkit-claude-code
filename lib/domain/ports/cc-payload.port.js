/**
 * CCPayloadPort — Type-only Port (DIP) for CC hook payload IO.
 *
 * Design Ref: bkit-v2110-integrated-enhancement.design.md §2.3
 * Plan SC: Clean Architecture Layer - Domain depends on this Port, Infrastructure implements it.
 *
 * This file is a Type-only module. Runtime export is empty ({}).
 * JSDoc typedefs below are consumed by `tsc --checkJs --noEmit` in CI.
 *
 * @module lib/domain/ports/cc-payload.port
 *
 * @version 2.1.12
 */

/**
 * @typedef {Object} HookInput
 *
 * ENH-469 (v2.1.37) — corrected against a measured payload.
 *
 * This typedef used to declare a `permissions` object carrying
 * `bypassPermissions` and `dangerouslyDisableSandbox`. Claude Code does not send
 * one, and never has. The keys below are the complete set observed on a
 * PreToolUse payload on CC v2.1.231, captured by a hook that dumped its stdin,
 * once per permission mode.
 *
 * That fiction had a cost. `scripts/pre-write.js` read `input.bypassPermissions`
 * on the strength of it, always got `undefined`, and the ENH-263 guard — whose
 * first condition tests that flag — never fired once since v2.1.10. The real
 * signal is `permission_mode`, and it is a common field on EVERY hook event, not
 * just this one.
 *
 * `dangerouslyDisableSandbox` is likewise not a payload field; bkit reads it from
 * the environment (`CLAUDE_CODE_DANGEROUSLY_DISABLE_SANDBOX`), which is where it
 * lives.
 *
 * @property {string} [session_id] - CC session identifier
 * @property {string} [transcript_path] - Path to the conversation transcript
 * @property {string} [cwd] - Current working directory
 * @property {string} [permission_mode] - `'default'|'plan'|'acceptEdits'|'auto'|'dontAsk'|'bypassPermissions'`
 * @property {{level?: string}} [effort] - Model effort budget
 * @property {string} [prompt_id] - UUID of the user prompt (CC v2.1.196+)
 * @property {string} [hook_event_name] - e.g. `'PreToolUse'`
 * @property {string} [tool_name] - Name of the CC tool invoked (Write/Edit/Bash/etc.)
 * @property {Object} [tool_input] - Tool-specific arguments
 * @property {string} [tool_use_id] - Unique identifier for this tool call
 * @property {Object[]} [background_tasks] - In-flight background work (Stop family, CC v2.1.218+)
 */

/**
 * @typedef {Object} HookOutput
 * CC hook output contract (S6 ENH-361 correction). `decision` and
 * `permissionDecision` are DISTINCT enums and must not be conflated:
 *   - PreToolUse  → `permissionDecision: 'allow'|'deny'|'ask'` (+ 'defer' legacy)
 *   - Stop / SubagentStop → `decision: 'approve'|'block'` (block = keep going,
 *     feeding `reason` to the model; omit/`{}` = allow clean stop). `'allow'`
 *     is NOT a valid Stop `decision` value — emitting it fails CC's strict
 *     Stop validator with `(root): Invalid input`.
 * Stop output also rejects `hookSpecificOutput` (no Stop variant) and any
 * non-schema root field. Use lib/core/io.js outputStopSurface/outputStopAllow.
 * @property {'approve'|'block'} [decision] - Stop/SubagentStop decision
 * @property {'allow'|'deny'|'ask'|'defer'} [permissionDecision] - PreToolUse decision
 * @property {string} [reason]
 * @property {string} [additionalContext] - PreToolUse/UserPromptSubmit/PostToolUse only
 * @property {Object} [updatedInput]
 * @property {string} [stopReason]
 * @property {boolean} [continue]
 * @property {string} [systemMessage]
 */

/**
 * @typedef {Object} CCPayloadPort
 * @property {() => Promise<HookInput>} read - Parse stdin JSON into HookInput
 * @property {(out: HookOutput) => void} write - Serialize HookOutput to stdout JSON
 * @property {(msg: string) => void} warn - Write warning to stderr
 */

module.exports = {};
