#!/usr/bin/env node
/**
 * pdca-doc-changed-handler.js — PDCA design/plan document change detector.
 *
 * When a PDCA document (docs/01-plan/, docs/02-design/) is edited while the
 * cycle is already at `do` or later, the design has moved after the code was
 * written, so this suggests re-running gap-detector.
 *
 * Hook: PostToolUse, matcher `Write|Edit`, one handler per tool:
 *   if: "Write(docs/[star][star]/[star].md)"
 *   if: "Edit(docs/[star][star]/[star].md)"
 *
 * v2.1.34 — moved off FileChanged. This handler shipped on FileChanged from
 * v2.1.1 to v2.1.33 and never ran once, for three independent reasons, each
 * confirmed against a real Claude Code runtime:
 *
 *   1. It carried `if: "Write|Edit(docs/[star][star]/[star].md)"`. The `if`
 *      field holds exactly ONE permission rule — there is no `|` alternation.
 *      The same string on a *valid* tool event also suppressed the hook, which
 *      isolates the syntax as an independent cause.
 *   2. `if` is evaluated only on PreToolUse, PostToolUse, PostToolUseFailure,
 *      PermissionRequest and PermissionDenied. On any other event a hook that
 *      declares `if` never runs at all, and FileChanged is not a tool event.
 *   3. FileChanged's `matcher` names literal files to watch on disk (letters,
 *      digits, `_` and `|` only). A path glob like `docs/[star][star]/[star].md`
 *      is not expressible, so this handler's purpose could never be served by
 *      that event regardless of the other two faults.
 *
 * PostToolUse Write|Edit is the event that actually describes what this
 * handler reacts to — Claude editing a document — and it is covered by
 * test/contract/host-integration/*.
 */

const { readStdinSync, outputContext, outputEmpty } = require('../lib/core/io');
const { debugLog } = require('../lib/core/debug');
const { getPdcaStatusFull, getFeatureStatus } = require('../lib/pdca/status');

// PDCA doc directories that trigger the gap-detector suggestion.
const PDCA_DOC_DIRS = ['docs/01-plan/', 'docs/02-design/'];

// Phases where a design-doc change matters (do and later).
const ACTIVE_PHASES = ['do', 'check', 'act', 'report'];

debugLog('PdcaDocChanged', 'Hook started');

let input = {};
try {
  input = readStdinSync();
} catch (e) {
  debugLog('PdcaDocChanged', 'Failed to parse input', { error: e.message });
  outputEmpty();
  process.exit(0);
}

const filePath = input?.tool_input?.file_path || input?.file_path || '';

debugLog('PdcaDocChanged', 'Document written', { filePath });

const isPdcaDoc = PDCA_DOC_DIRS.some((dir) => filePath.includes(dir));
if (!isPdcaDoc) {
  outputEmpty();
  process.exit(0);
}

/*
 * v2.1.34 — the third independent reason this handler produced nothing.
 *
 * It read `pdcaStatus.currentPhase` and `pdcaStatus.session.currentPhase`.
 * Neither key exists on the v3.0 state schema: the phase lives at
 * `features[primaryFeature].phase`. Measured against the live state file,
 * `getPdcaStatusFull()` returns keys [version, lastUpdated, activeFeatures,
 * primaryFeature, features, pipeline, session, history, stateMachine,
 * automation, team, taskHistory] and BOTH lookups resolve to `undefined`, so
 * `currentPhase` was always null and the `ACTIVE_PHASES` test could never pass.
 *
 * Fixing the event (FileChanged → PostToolUse) and the output channel
 * (plain text → additionalContext) would still have left the handler silent.
 */
const pdcaStatus = getPdcaStatusFull();
const primaryFeature = pdcaStatus?.primaryFeature || null;
const currentPhase = primaryFeature
  ? (getFeatureStatus(primaryFeature)?.phase || null)
  : null;

if (currentPhase && ACTIVE_PHASES.includes(currentPhase.toLowerCase())) {
  // v2.1.34 — `outputAllow(msg, 'PostToolUse')` printed bare text, and bare
  // stdout from a PostToolUse hook reaches the transcript only. The suggestion
  // this handler exists to make was never delivered to the model. Moving the
  // handler off the dead FileChanged event and then emitting on a channel the
  // model does not read would have replaced one silence with another.
  outputContext(
    `Design document changed: ${filePath}. Consider running gap-detector to check design-implementation alignment.`,
    'PostToolUse'
  );
} else {
  outputEmpty();
}

debugLog('PdcaDocChanged', 'Hook completed', { filePath, primaryFeature, currentPhase, isPdcaDoc });
