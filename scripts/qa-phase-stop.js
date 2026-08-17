#!/usr/bin/env node
/**
 * qa-phase-stop.js - QA Phase Stop Event Handler
 *
 * Collects M11-M16 metrics from QA execution results
 * and triggers appropriate state machine event (QA_PASS/QA_FAIL/QA_SKIP).
 */

const path = require('path');
const { readStdinSync, readHookText, outputAllow } = require('../lib/core/io');
const { debugLog } = require('../lib/core/debug');
// C7/C8/L2 (audit): atomic+locked reachability ping + single BKIT_VERSION source.
// L2: this hook was the only Stop/Post handler without a reachability stamp.
// It is not in today's SessionStart monitored set, so the impact is limited — but
// stamping here keeps every Stop/Post hook symmetric and future-proofs against
// qa_phase_stop being added to the monitored set (a silent drop would otherwise
// look like a real CC plugin-hook drop, per MON-CC-NEW-PLUGIN-HOOK-DROP).
const { lockedUpdate } = require('../lib/core/state-store');
const { BKIT_VERSION } = require('../lib/core/version');

try {
  const mc = require('../lib/quality/metrics-collector');
  const { extractFeatureFromContext, getPdcaStatusFull } = require('../lib/pdca/status');
  const currentStatus = getPdcaStatusFull();
  const feature = extractFeatureFromContext({ currentStatus }) || 'unknown';

  /*
   * Read the QA output as TEXT.
   *
   * `readStdinSync()` returns the parsed hook payload — an object. The previous
   * code assigned it straight to `qaOutput` and called `.match()` on it, which
   * throws TypeError on the very first pattern below. The outer catch swallowed
   * it, so none of M11-M15 was ever collected while the handler still reported
   * success. readHookText normalizes the payload to the assistant's actual
   * reported text (via transcript_path) and always returns a string.
   */
  let qaOutput = '';
  try { qaOutput = readHookText(readStdinSync()); } catch (_) { qaOutput = ''; }

  // M11: QA Pass Rate
  const passRateMatch = qaOutput.match(/pass\s*rate[^0-9]*(\d+\.?\d*)\s*%/i);
  const qaPassRate = passRateMatch ? parseFloat(passRateMatch[1]) : 0;
  mc.collectMetric('M11', feature, qaPassRate, 'qa-lead');

  // M12: Test Coverage L1
  const coverageMatch = qaOutput.match(/coverage[^0-9]*(\d+\.?\d*)\s*%/i);
  const testCoverage = coverageMatch ? parseFloat(coverageMatch[1]) : 0;
  mc.collectMetric('M12', feature, testCoverage, 'qa-test-generator');

  // M13: E2E Scenario Coverage
  const e2eMatch = qaOutput.match(/e2e[^0-9]*coverage[^0-9]*(\d+\.?\d*)\s*%/i);
  const e2eCoverage = e2eMatch ? parseFloat(e2eMatch[1]) : 0;
  mc.collectMetric('M13', feature, e2eCoverage, 'qa-lead');

  // M14: Runtime Error Count
  const errorCountMatch = qaOutput.match(/runtime\s*error[^0-9]*(\d+)/i);
  const runtimeErrors = errorCountMatch ? parseInt(errorCountMatch[1]) : 0;
  mc.collectMetric('M14', feature, runtimeErrors, 'qa-debug-analyst');

  // M15: Data Flow Integrity
  const integrityMatch = qaOutput.match(/data\s*flow\s*integrity[^0-9]*(\d+\.?\d*)\s*%/i);
  const dataFlowIntegrity = integrityMatch ? parseFloat(integrityMatch[1]) : 100;
  mc.collectMetric('M15', feature, dataFlowIntegrity, 'qa-lead');

  /*
   * M16: QA Critical Count — the gate has required this since v2.1.1 but
   * nothing ever produced it (see METRIC_SPECS.M16). qa-lead's Phase 4 reports
   * it alongside passRate, so it is parsed from the same text.
   *
   * Absent means zero, matching M14's existing convention: "no criticals
   * reported" is the normal shape of a clean run. This is safe because a run
   * whose output cannot be parsed at all also yields qaPassRate 0, which fails
   * the gate on its own — M16 defaulting to 0 cannot turn a broken run green.
   */
  const criticalMatch = qaOutput.match(/critical[^0-9]{0,20}(\d+)/i);
  const qaCriticalCount = criticalMatch ? parseInt(criticalMatch[1], 10) : 0;
  mc.collectMetric('M16', feature, qaCriticalCount, 'qa-lead');

  debugLog('QA-Phase-Stop', 'Metrics collected', {
    feature, qaPassRate, testCoverage, e2eCoverage, runtimeErrors, dataFlowIntegrity,
    qaCriticalCount
  });
} catch (e) {
  debugLog('QA-Phase-Stop', 'Metric collection failed', { error: e.message });
}

// L2 fix (audit): reachability ping — unconditional + atomic, fired AFTER metric
// collection so a collection failure can't skip it. Symmetric with the other
// Stop/Post hooks (skill-post, unified-*-post, pre-write).
try {
  const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const file = path.join(root, '.bkit', 'runtime', 'hook-reachability.json');
  lockedUpdate(file, (state) => {
    const next = state && typeof state === 'object' ? state : {};
    next.qa_phase_stop = { ts: new Date().toISOString(), version: BKIT_VERSION };
    return next;
  });
} catch (_) { /* graceful — reachability ping is best-effort */ }

const message = `QA Phase completed.

Next steps:
1. Review QA report in docs/05-qa/
2. If QA PASS: proceed to /pdca report
3. If QA FAIL: review failures and /pdca iterate`;

outputAllow(message, 'Stop');
