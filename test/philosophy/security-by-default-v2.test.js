'use strict';
/**
 * Philosophy Tests: Security-by-Default Principle v2 (15 TC)
 * Tests that L2 is default (not L0 or L4), 8 destructive rules active,
 * and Trust Score starts at 50 (middle, not high).
 *
 * @module test/philosophy/security-by-default-v2.test.js
 */

const fs = require('fs');
const path = require('path');
const { assert, summary } = require('../helpers/assert');

const PROJECT_ROOT = path.resolve(__dirname, '../..');

// ── Module loading ──────────────────────────────────────────────────

let automationController;
try {
  automationController = require('../../lib/control/automation-controller');
} catch (e) {
  console.error('automation-controller module load failed:', e.message);
  process.exit(1);
}

let destructiveDetector;
try {
  destructiveDetector = require('../../lib/control/destructive-detector');
} catch (e) {
  console.error('destructive-detector module load failed:', e.message);
  process.exit(1);
}

let trustEngine;
try {
  trustEngine = require('../../lib/control/trust-engine');
} catch (e) {
  console.error('trust-engine module load failed:', e.message);
  process.exit(1);
}

console.log('\n=== security-by-default-v2.test.js ===\n');

// =====================================================================
// SB-001~005: L2 is default (not L0 or L4)
// =====================================================================

// --- SB-001: DEFAULT_LEVEL is 2 (Semi-Auto) ---
assert('SB-001',
  automationController.DEFAULT_LEVEL === 2,
  'DEFAULT_LEVEL is 2 (Semi-Auto, not Manual L0 or Full-Auto L4)'
);

// --- SB-002: DEFAULT_LEVEL is not L0 (Manual) ---
assert('SB-002',
  automationController.DEFAULT_LEVEL !== 0,
  'Default level is NOT L0 (Manual) — too restrictive for good UX'
);

// --- SB-003: DEFAULT_LEVEL is not L4 (Full-Auto) ---
assert('SB-003',
  automationController.DEFAULT_LEVEL !== 4,
  'Default level is NOT L4 (Full-Auto) — too permissive for safety'
);

// --- SB-004: getRuntimeState currentLevel matches DEFAULT_LEVEL ---
// Reset to default before checking (previous tests in suite may have changed level)
automationController.setLevel(automationController.DEFAULT_LEVEL, { reason: 'test-reset' });
const initState = automationController.getRuntimeState();
assert('SB-004',
  initState.currentLevel === automationController.DEFAULT_LEVEL,
  'getRuntimeState.currentLevel matches DEFAULT_LEVEL (consistent defaults)'
);

// --- SB-005: bkit.config.json automationLevel is Semi-Auto ---
const config = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'bkit.config.json'), 'utf-8'));
assert('SB-005',
  config.pdca.automationLevel === 'Semi-Auto' || config.pdca.automationLevel === 'semi-auto',
  'bkit.config.json pdca.automationLevel is "Semi-Auto" (config matches code default)'
);

// =====================================================================
// SB-006~010: 8 destructive rules active by default
// =====================================================================

const { GUARDRAIL_RULES } = destructiveDetector;

// --- SB-006: destructive protection has not been weakened ---
// v2.1.33: was `length === 8`. This is a security assertion, and an exact count
// makes it fail on exactly the change we want (adding a rule) while staying
// silent on the change we fear (removing one). The set has grown to 12. Assert
// a floor instead, so protection can only be added, never quietly reduced.
const GUARDRAIL_RULE_FLOOR = 8;
assert('SB-006',
  Array.isArray(GUARDRAIL_RULES) && GUARDRAIL_RULES.length >= GUARDRAIL_RULE_FLOOR,
  `GUARDRAIL_RULES must keep at least ${GUARDRAIL_RULE_FLOOR} destructive rules (found: ${GUARDRAIL_RULES.length}) — a drop below the floor means protection was removed`
);

// --- SB-007: G-001 (Recursive delete) is critical severity, deny action ---
const g001 = GUARDRAIL_RULES.find(r => r.id === 'G-001');
assert('SB-007',
  g001 && g001.severity === 'critical' && g001.defaultAction === 'deny',
  'G-001 (Recursive delete) is critical severity with deny action'
);

// --- SB-008: G-002 (Force push) is critical severity, deny action ---
const g002 = GUARDRAIL_RULES.find(r => r.id === 'G-002');
assert('SB-008',
  g002 && g002.severity === 'critical' && g002.defaultAction === 'deny',
  'G-002 (Force push) is critical severity with deny action'
);

// --- SB-009: All rules have pattern, severity, and defaultAction ---
const allRulesComplete = GUARDRAIL_RULES.every(r =>
  r.id && r.name && r.pattern instanceof RegExp && r.severity && r.defaultAction
);
assert('SB-009',
  allRulesComplete,
  'All 8 guardrail rules have id, name, pattern (RegExp), severity, and defaultAction'
);

// --- SB-010: isDestructive identifies rm -rf as destructive ---
assert('SB-010',
  destructiveDetector.isDestructive('rm -rf /tmp/test') === true,
  'isDestructive() identifies "rm -rf" as destructive operation'
);

// =====================================================================
// SB-011~015: Trust Score starts at 50 (middle, not high)
// =====================================================================

// --- SB-011: control state surfaces the trust engine's score, and it starts low ---
//
// v2.1.33: this asserted a bare `=== 40`, which was wrong twice over.
//
// First, 40 was the 6-component baseline; v2.1.19 added a 7th component
// (externalDogfoodFeedbackResponseRate, weight 0.05) and rescaled the original
// six by x0.95, so a fresh profile now computes
// 0.1425*100 + 0.1425*100 + 0.095*100 = 38.
//
// Second, and more importantly, ANY constant is wrong here. With no
// .bkit/state/control.json on disk, getRuntimeState() builds a default whose
// trustScore comes from _getTrustScore() — which reads the machine's actual
// trust profile. So this assertion's expected value depended on how much the
// developer had used bkit: 38 on a fresh clone, 50 on this machine. A test that
// passes or fails based on accumulated local state is not a test.
//
// Assert the two properties that are actually contractual: control state
// reports the same score the trust engine does (the wiring), and a session
// starts in the lower half of the range rather than trusted-by-default (the
// security property this section is named for).
// `trustEngine` is already required at the top of this file.
const engineScore = trustEngine.loadTrustProfile().trustScore;
assert('SB-011',
  initState.trustScore === engineScore
    && Number.isFinite(initState.trustScore)
    && initState.trustScore >= 0 && initState.trustScore <= 50,
  `control runtime state must mirror the trust engine and start un-trusted (control: ${initState.trustScore}, engine: ${engineScore}; expected equal and within 0..50)`
);

// --- SB-012: Trust score 40 is below L3 upgrade threshold (65) ---
assert('SB-012',
  initState.trustScore < trustEngine.LEVEL_THRESHOLDS[3],
  `Trust score 40 < L3 threshold (${trustEngine.LEVEL_THRESHOLDS[3]}): cannot auto-escalate to L3`
);

// --- SB-013: a fresh profile does NOT qualify for L2 unattended ---
//
// v2.1.33: this asserted the opposite — that the starting trust score clears the
// L2 threshold. It passed on a machine with an accumulated profile (50 here) and
// failed on a fresh checkout, where `createDefaultProfile()` computes 38 against
// a threshold of 40. Machine-dependent either way, and pointed the wrong way for
// a suite called security-by-default: a brand-new install should have to *earn*
// semi-autonomy, not begin with it.
//
// The invariant worth holding is that trust is earned. A fresh profile starts
// below L2; a profile that has accumulated a record may sit above it.
assert('SB-013',
  trustEngine.createDefaultProfile().trustScore < trustEngine.LEVEL_THRESHOLDS[2],
  `a fresh trust profile (${trustEngine.createDefaultProfile().trustScore}) must start below the L2 threshold (${trustEngine.LEVEL_THRESHOLDS[2]}) — semi-autonomy is earned, not granted on install`
);

// --- SB-014: SCORE_CHANGES has negative values for risky events ---
const { SCORE_CHANGES } = trustEngine;
assert('SB-014',
  SCORE_CHANGES['emergency_stop'] < 0 && SCORE_CHANGES['rollback'] < 0,
  'Trust score decreases on emergency_stop and rollback events'
);

// --- SB-015: Trust level thresholds are monotonically increasing ---
const thresholds = trustEngine.LEVEL_THRESHOLDS;
const isMonotonic = thresholds.every((t, i) => i === 0 || t > thresholds[i - 1]);
assert('SB-015',
  isMonotonic && thresholds.length === 5,
  'Trust LEVEL_THRESHOLDS are monotonically increasing (5 levels: L0-L4)'
);

summary('security-by-default-v2.test.js');
process.exit(0);
