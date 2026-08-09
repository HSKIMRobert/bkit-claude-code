#!/usr/bin/env node
/**
 * context-compaction.js - Context Compaction Hook (FR-07)
 * Preserves PDCA state before context compression
 *
 * @version 2.1.10
 * @module scripts/context-compaction
 */

const fs = require('fs');
const path = require('path');
const { readStdinSync, outputEmpty } = require('../lib/core/io');
const { debugLog } = require('../lib/core/debug');
const { getPdcaStatusFull } = require('../lib/pdca/status');
const { PROJECT_DIR } = require('../lib/core/platform');

// Read compaction event from stdin
let input;
try {
  input = readStdinSync();
} catch (e) {
  debugLog('ContextCompaction', 'Failed to read stdin', { error: e.message });
  outputEmpty();
  process.exit(0);
}

debugLog('ContextCompaction', 'Hook started', {
  reason: input.reason || 'unknown'
});

// Get current PDCA status
const pdcaStatus = getPdcaStatusFull(true);

// ENH-203 (CC v2.1.105 PreCompact blocking, Plan §3): Critical phase 진행 중 'manual' compaction 차단
// - 'auto' compaction은 차단하지 않음 (사용자 의도 없는 자동 호출은 snapshot만)
// - 'manual' compaction은 do/check/act 진행 중 차단하여 컨텍스트 손실 방지
try {
  const reason = (input && input.reason) ? String(input.reason) : 'unknown';
  const isManual = reason === 'manual';
  /*
   * v2.1.34: read the phase from the feature entry.
   *
   * `pdcaStatus.currentPhase` is a v1 schema key, so `criticalPhase` was
   * permanently false and this guard has never once engaged. Its whole purpose
   * is to refuse a MANUAL compaction while a do/check/act cycle is live —
   * exactly when losing that context costs the most — and it has been inert
   * since the v3 migration.
   */
  const activePhase = (pdcaStatus && pdcaStatus.primaryFeature
    && pdcaStatus.features && pdcaStatus.features[pdcaStatus.primaryFeature]
    && pdcaStatus.features[pdcaStatus.primaryFeature].phase) || null;
  const criticalPhase = !!activePhase && ['do', 'check', 'act'].includes(activePhase);

  if (isManual && criticalPhase) {
    const blockMsg =
      `[bkit] PDCA ${String(activePhase).toUpperCase()} phase in progress (${pdcaStatus.primaryFeature}). ` +
      `Manual compaction risks losing that context, so it is blocked. ` +
      `Check progress with \`/pdca status\`, or run \`/pdca report\` first.`;
    // v2.1.10 Sprint 5.5: PreCompact counter (ENH-247/257 2-week measurement)
    try {
      const cc = require('../lib/cc-regression');
      cc.recordPrecompactEvent({
        blocked: true,
        reason: reason || 'unknown',
        ccVersion: cc.detectCCVersion() || 'unknown',
        phase: activePhase,
        sessionId: input && input.session_id ? input.session_id : null,
      });
    } catch (_e) { /* fail-silent */ }

    console.log(JSON.stringify({
      decision: 'block',
      reason: blockMsg,
      hookSpecificOutput: { hookEventName: 'PreCompact', additionalContext: blockMsg },
    }));
    debugLog('ContextCompaction', 'PreCompact blocked', { reason, phase: activePhase, feature: pdcaStatus.primaryFeature });
    process.exit(2); // CC: exit 2 == block
  }

  // v2.1.10 Sprint 5.5: sample counter even when not blocked
  try {
    const cc = require('../lib/cc-regression');
    cc.recordPrecompactEvent({
      blocked: false,
      reason: reason || 'unknown',
      ccVersion: cc.detectCCVersion() || 'unknown',
      phase: activePhase || null,
      sessionId: input && input.session_id ? input.session_id : null,
    });
  } catch (_e) { /* fail-silent */ }
} catch (_e) {
  // Block 로직 실패는 silent (기존 snapshot 경로 진행)
}

if (pdcaStatus) {
  // Create compaction snapshot
  const snapshot = {
    timestamp: new Date().toISOString(),
    reason: input.reason || 'compaction',
    status: pdcaStatus
  };

  // Save snapshot
  const { STATE_PATHS } = require('../lib/core/paths');
  const snapshotDir = STATE_PATHS.snapshots();
  try {
    if (!fs.existsSync(snapshotDir)) {
      fs.mkdirSync(snapshotDir, { recursive: true });
    }

    const snapshotPath = path.join(
      snapshotDir,
      `snapshot-${Date.now()}.json`
    );

    fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2));

    debugLog('ContextCompaction', 'Snapshot saved', { path: snapshotPath });

    // Clean up old snapshots (keep last 10)
    const files = fs.readdirSync(snapshotDir)
      .filter(f => f.startsWith('snapshot-') && f.endsWith('.json'))
      .sort()
      .reverse();

    for (let i = 10; i < files.length; i++) {
      fs.unlinkSync(path.join(snapshotDir, files[i]));
    }
  } catch (e) {
    debugLog('ContextCompaction', 'Failed to save snapshot', { error: e.message });
  }

  // Output summary for context restoration
  const summary = {
    activeFeatures: pdcaStatus.activeFeatures || [],
    primaryFeature: pdcaStatus.primaryFeature,
    currentPhases: Object.entries(pdcaStatus.features || {}).map(([name, data]) => ({
      feature: name,
      phase: data.phase,
      matchRate: data.matchRate
    }))
  };

  const additionalContext = `PDCA State preserved. Active: ${summary.activeFeatures.join(', ') || 'none'}. Primary: ${summary.primaryFeature || 'none'}.`;

  // v1.4.2: hookEventName 추가 (ISSUE-006 수정)
  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreCompact',
      additionalContext
    }
  }));
} else {
  debugLog('ContextCompaction', 'No PDCA status to preserve');
  outputEmpty();
}
