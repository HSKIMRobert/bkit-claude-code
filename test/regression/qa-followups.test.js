'use strict';
/**
 * Regression tests for the QA follow-up defects.
 * 21 TC | console.assert based | no external dependencies
 *
 * Companion to qa-pipeline-wiring.test.js. Same family of defect — a component
 * that reports success while doing nothing — found in the same audit.
 *
 *   F-0  unified-stop drains stdin, then dispatches self-executing handlers
 *        with require() in the SAME process, so every sub-handler read `{}`.
 *        No Stop handler had ever seen transcript_path.
 *   F-1  analysis-stop / qa-stop regexed their own hardcoded guidance string,
 *        so M2 was always 75 and M5 always 0.
 *   F-2  QA_RETRY (act -> qa) was never emitted, and initQaPhase never advanced
 *        the retry counter, so the max-retry guard could not fire.
 *   F-3  qa-lead never dispatched qa-monitor despite declaring it.
 *   F-4  qa-test-planner could not write the test plan it exists to produce.
 *   F-5  pre-release-check.sh scanned bkit rather than the user's project.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const REPO = path.resolve(__dirname, '../..');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bkit-qa-followups-'));
fs.mkdirSync(path.join(tmpDir, '.bkit', 'state'), { recursive: true });

const platformPath = require.resolve('../../lib/core/platform');
const origPlatform = require(platformPath);
require.cache[platformPath] = {
  id: platformPath,
  filename: platformPath,
  loaded: true,
  exports: { ...origPlatform, PROJECT_DIR: tmpDir },
};
const origProjectDirEnv = process.env.CLAUDE_PROJECT_DIR;
process.env.CLAUDE_PROJECT_DIR = tmpDir;

const transitions = require('../../lib/pdca/state-transitions');
const sm = require('../../lib/pdca/state-machine');

let passed = 0, failed = 0, total = 0, skipped = 0;
const failures = [];

function assert(id, condition, message) {
  total++;
  if (condition) { passed++; console.log(`  PASS: ${id} - ${message}`); }
  else { failed++; failures.push({ id, message }); console.error(`  FAIL: ${id} - ${message}`); }
}

function read(rel) {
  return fs.readFileSync(path.join(REPO, rel), 'utf8');
}

console.log('\n=== qa-followups.test.js ===\n');

// --- F-0: a second reader in the same process gets the payload ---

// Reproduces the executeHandler dispatch exactly: parent drains stdin with the
// bounded reader (which destroys the stream), then requires a child that calls
// readStdinSync for itself.
const probeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bkit-stdin-probe-'));
fs.writeFileSync(path.join(probeDir, 'child.js'),
  `const { readStdinSync } = require(${JSON.stringify(path.join(REPO, 'lib/core/io'))});\n` +
  `console.log('CHILD:' + JSON.stringify(readStdinSync()));\n`);
fs.writeFileSync(path.join(probeDir, 'parent.js'),
  `const { readStdinBounded } = require(${JSON.stringify(path.join(REPO, 'lib/core/io'))});\n` +
  `(async () => {\n` +
  `  const ctx = await readStdinBounded(2000);\n` +
  `  console.log('PARENT:' + JSON.stringify(ctx));\n` +
  `  require('./child.js');\n` +
  `})();\n`);

let probeOut = '';
try {
  probeOut = execFileSync('node', [path.join(probeDir, 'parent.js')], {
    input: '{"hook_event_name":"Stop","transcript_path":"/tmp/probe.jsonl"}',
    encoding: 'utf8',
    timeout: 15000,
    env: { ...process.env, BKIT_HOOK_DISPATCH_RECORD: '0' },
  });
} catch (e) {
  probeOut = String((e.stdout || '') + (e.stderr || ''));
}

const parentLine = (probeOut.match(/^PARENT:(.*)$/m) || [])[1] || '';
const childLine = (probeOut.match(/^CHILD:(.*)$/m) || [])[1] || '';

assert('QF-001', parentLine.includes('transcript_path'),
  'Parent reader receives the payload');
assert('QF-002', childLine.includes('transcript_path'),
  'Child handler receives the payload too (was {} — the F-0 defect)');
assert('QF-003', childLine !== '{}',
  'Child no longer reads an empty object after stdin was destroyed');

fs.rmSync(probeDir, { recursive: true, force: true });

// --- F-1: the two handlers read the agent's output, not their own message ---

const analysisSrc = read('scripts/analysis-stop.js');
const qaStopSrc = read('scripts/qa-stop.js');

assert('QF-004', !/agentOutput\s*=\s*typeof message/.test(analysisSrc),
  'analysis-stop no longer regexes its own guidance string');
assert('QF-005', /readHookText\(readStdinSync\(\)\)/.test(analysisSrc),
  'analysis-stop reads the payload it already imported a reader for');
assert('QF-006', !/qaOutput\s*=\s*typeof message/.test(qaStopSrc),
  'qa-stop no longer regexes its own guidance string');
assert('QF-007', /readHookText\(readStdinSync\(\)\)/.test(qaStopSrc),
  'qa-stop reads the payload');
assert('QF-008', /readStdinSync,\s*readHookText/.test(analysisSrc) &&
  /readStdinSync,\s*readHookText/.test(qaStopSrc),
  'Both import the text helper alongside the reader');

// --- F-2: QA_RETRY is reachable, and the retry counter advances ---

const qaFail = transitions.TRANSITIONS.find(t => t.from === 'qa' && t.event === 'QA_FAIL');
assert('QF-009', qaFail && qaFail.actions.includes('markQaRetryPending'),
  'QA_FAIL records that a retry is owed');
assert('QF-010', typeof transitions.ACTIONS.markQaRetryPending === 'function',
  'markQaRetryPending action exists');

const stopSrc = read('scripts/unified-stop.js');
assert('QF-011', /qaRetryPending[\s\S]{0,80}QA_RETRY/.test(stopSrc),
  'unified-stop emits QA_RETRY when a retry is pending');
assert('QF-012', /ANALYZE_DONE/.test(stopSrc),
  'ANALYZE_DONE remains the path for an ordinary act completion');

// initQaPhase advances the counter on retry, and only on retry.
const FEATURE = 'qa-followup-feature';
require('../../lib/pdca/status')
  .updatePdcaStatus(FEATURE, 'qa', { qaRetryCount: 0 }, { requireDocs: false });

const firstEntry = { feature: FEATURE, currentState: 'qa', qaRetryCount: 0 };
transitions.ACTIONS.initQaPhase(firstEntry, 'MATCH_PASS');
assert('QF-013', firstEntry.qaRetryCount === 0,
  'First entry into qa does not count as a retry');

const retryEntry = { feature: FEATURE, currentState: 'qa', qaRetryCount: 0 };
transitions.ACTIONS.initQaPhase(retryEntry, 'QA_RETRY');
assert('QF-014', retryEntry.qaRetryCount === 1,
  'QA_RETRY advances the counter (it never moved before)');

const thirdEntry = { feature: FEATURE, currentState: 'qa', qaRetryCount: 2 };
transitions.ACTIONS.initQaPhase(thirdEntry, { event: 'QA_RETRY' });
assert('QF-015', thirdEntry.qaRetryCount === 3,
  'Counter advances for the object event form too');

// With the counter moving, the escape hatch can now fire.
assert('QF-016', transitions.GUARDS.guardQaMaxRetryReached({ qaRetryCount: 3, maxQaRetries: 3 }),
  'Max-retry guard fires once the ceiling is reached');
assert('QF-017', !transitions.GUARDS.guardQaMaxRetryReached({ qaRetryCount: 1, maxQaRetries: 3 }),
  'Max-retry guard stays quiet below the ceiling');

const hydrated = sm.loadContext(FEATURE);
assert('QF-018', hydrated && typeof hydrated.qaRetryPending === 'boolean',
  'loadContext carries qaRetryPending so the guard sees real state');

// --- F-3 / F-4: qa-lead dispatches qa-monitor; planner can write its plan ---

const leadDoc = read('agents/qa-lead.md');
const plannerDoc = read('agents/qa-test-planner.md');
const generatorDoc = read('agents/qa-test-generator.md');

assert('QF-019', /Task\(qa-monitor\)/.test(leadDoc.split('## Orchestration Protocol')[1] || ''),
  'qa-lead actually dispatches qa-monitor in its protocol, not just its tool list');

const plannerFront = plannerDoc.split('---')[1] || '';

// Read each list as its own block. A regex spanning from `disallowedTools:` to
// the first `- Write` walks straight into the `tools:` list below it and reports
// the allow entry as a denial.
function yamlList(front, key) {
  const lines = front.split('\n');
  const start = lines.findIndex(l => l.trim() === `${key}:`);
  if (start === -1) return [];
  const out = [];
  for (let i = start + 1; i < lines.length; i++) {
    const m = lines[i].match(/^\s+-\s+(.+?)\s*$/);
    if (!m) break;
    out.push(m[1]);
  }
  return out;
}

const plannerDenied = yamlList(plannerFront, 'disallowedTools');
const plannerAllowed = yamlList(plannerFront, 'tools');
assert('QF-020', !plannerDenied.includes('Write') && plannerAllowed.includes('Write'),
  'qa-test-planner may write the test plan document it is defined to produce');
assert('QF-020b', plannerDenied.includes('Bash'),
  'qa-test-planner stays barred from Bash — planning is not execution');
assert('QF-021', /docs\/05-qa\/\{feature\}\.test-plan\.md/.test(plannerDoc) &&
  /docs\/05-qa\/\{feature\}\.test-plan\.md/.test(generatorDoc),
  'Planner output path and generator input path are the same file');

// --- F-5: the scanner targets the caller's project, not bkit ---

const scriptSrc = read('scripts/qa/pre-release-check.sh');
assert('QF-022', /SCAN_ROOT="\$\{CLAUDE_PROJECT_DIR:-\$PWD\}"/.test(scriptSrc),
  'Scan root defaults to the calling project');
assert('QF-023', /require\('\$\{BKIT_ROOT\}\/lib\/qa'\)/.test(scriptSrc),
  'Scanner code is still resolved relative to the script itself');
assert('QF-024', /--self/.test(scriptSrc),
  'Scanning bkit itself remains available, but is now opt-in');

const skillSrc = read('skills/qa-phase/SKILL.md');
assert('QF-025', /\$\{PLUGIN_ROOT\}\/scripts\/qa\/pre-release-check\.sh/.test(skillSrc),
  'Skill invokes the script by absolute plugin path');
assert('QF-026', /\|\s*wiring\s*\|/.test(skillSrc),
  'Skill documents all five scanners, including wiring');

// --- Cleanup ---
delete require.cache[platformPath];
if (origProjectDirEnv === undefined) delete process.env.CLAUDE_PROJECT_DIR;
else process.env.CLAUDE_PROJECT_DIR = origProjectDirEnv;
fs.rmSync(tmpDir, { recursive: true, force: true });

// --- Summary ---
console.log(`\nResults: ${passed}/${total} passed, ${failed} failed, ${skipped} skipped`);
if (failures.length > 0) {
  console.log('Failures:');
  failures.forEach(f => console.log(`  - ${f.id}: ${f.message}`));
}

module.exports = { passed, failed, total, skipped, failures };
