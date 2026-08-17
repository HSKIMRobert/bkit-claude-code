'use strict';
/**
 * Regression tests for the QA pipeline wiring defects.
 * 18 TC | console.assert based | no external dependencies
 *
 * Each defect below was silent: the QA phase reported success while the value
 * it exists to produce never reached the gate. These tests pin the four repairs
 * so a future refactor cannot quietly restore the dark path.
 *
 *   C-1  readStdinSync returns an object; qa-phase-stop called .match() on it,
 *        threw TypeError, and swallowed it — M11-M15 never collected.
 *   C-2  the qa gate required qaCriticalCount, which no metric ID produced, so
 *        the gate could never return 'pass'.
 *   C-3  unified-stop built a blank context, so every qa guard evaluated
 *        against undefined and recordQaResult wrote nulls over measurements.
 *   H-1  Chrome detection read MCP_SERVERS, which Claude Code never sets, so
 *        L3-L5 were skipped on 100% of runs.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bkit-qa-wiring-'));
fs.mkdirSync(path.join(tmpDir, '.bkit', 'state'), { recursive: true });

// Point every path-aware module at the sandbox.
const platformPath = require.resolve('../../lib/core/platform');
const origPlatform = require(platformPath);
require.cache[platformPath] = {
  id: platformPath,
  filename: platformPath,
  loaded: true,
  exports: { ...origPlatform, PROJECT_DIR: tmpDir },
};
const origProjectDirEnv = process.env.CLAUDE_PROJECT_DIR;
const origChromeEnv = process.env.BKIT_CHROME_MCP;
const origMcpServersEnv = process.env.MCP_SERVERS;
process.env.CLAUDE_PROJECT_DIR = tmpDir;
delete process.env.BKIT_CHROME_MCP;
delete process.env.MCP_SERVERS;

const io = require('../../lib/core/io');
const mc = require('../../lib/quality/metrics-collector');
const gates = require('../../lib/quality/gate-manager');
const sm = require('../../lib/pdca/state-machine');
const chrome = require('../../lib/qa/chrome-bridge');

let passed = 0, failed = 0, total = 0, skipped = 0;
const failures = [];

function assert(id, condition, message) {
  total++;
  if (condition) { passed++; console.log(`  PASS: ${id} - ${message}`); }
  else { failed++; failures.push({ id, message }); console.error(`  FAIL: ${id} - ${message}`); }
}

console.log('\n=== qa-pipeline-wiring.test.js ===\n');

// --- C-1: readHookText always yields regex-safe text ---

assert('QW-001', typeof io.readHookText === 'function', 'readHookText is exported');
assert('QW-002', typeof io.readHookText({ session_id: 'x' }) === 'string',
  'Object payload returns a string, not the object');
assert('QW-003', typeof io.readHookText(null) === 'string', 'null payload returns a string');
assert('QW-004', typeof io.readHookText(undefined) === 'string', 'undefined payload returns a string');
assert('QW-005', io.readHookText('already text') === 'already text', 'String payload passes through');

// The original crash, reproduced: .match() on whatever the helper returns must
// not throw for any payload shape a hook can receive.
let matchThrew = false;
try {
  io.readHookText({ hook_event_name: 'Stop' }).match(/pass\s*rate[^0-9]*(\d+)/i);
} catch (_) {
  matchThrew = true;
}
assert('QW-006', !matchThrew, '.match() on the result never throws (the C-1 crash)');

// Transcript extraction: assistant text only — thinking and tool_use blocks are
// not reported results and would produce false metric hits.
const transcriptPath = path.join(tmpDir, 'transcript.jsonl');
fs.writeFileSync(transcriptPath, [
  JSON.stringify({ type: 'user', message: { content: 'run qa' } }),
  JSON.stringify({
    type: 'assistant',
    message: { content: [
      { type: 'thinking', thinking: 'Pass Rate: 11%' },
      { type: 'tool_use', name: 'Bash', input: { command: 'echo "Pass Rate: 22%"' } },
      { type: 'text', text: 'QA complete. Pass Rate: 97.5% — Critical: 0' },
    ] },
  }),
  '',
].join('\n'));

const text = io.readHookText({ transcript_path: transcriptPath });
assert('QW-007', text.includes('Pass Rate: 97.5%'), 'Assistant text block is extracted');
assert('QW-008', !text.includes('11%'), 'thinking block is excluded');
assert('QW-009', !text.includes('22%'), 'tool_use block is excluded');
assert('QW-010', io.readHookText({ transcript_path: '/nonexistent/x.jsonl' }).length > 0,
  'Unreadable transcript falls back to a string instead of throwing');

// --- C-2: qaCriticalCount has a metric behind it, so the qa gate can pass ---

assert('QW-011', mc.METRIC_SPECS.M16 !== undefined, 'M16 metric spec exists');
assert('QW-012', mc.METRIC_ID_TO_GATE_NAME.M16 === 'qaCriticalCount',
  'M16 maps to the gate metric name qaCriticalCount');
assert('QW-013', mc.GATE_NAME_TO_METRIC_ID.qaCriticalCount === 'M16',
  'Inverse mapping resolves qaCriticalCount');

const FEATURE = 'qa-wiring-feature';
mc.collectMetric('M11', FEATURE, 100, 'qa-lead');          // qaPassRate
mc.collectMetric('M14', FEATURE, 0, 'qa-debug-analyst');   // runtimeErrorCount
mc.collectMetric('M16', FEATURE, 0, 'qa-lead');            // qaCriticalCount

const gateMetrics = mc.toGateFormat(FEATURE);
assert('QW-014', gateMetrics && gateMetrics.qaCriticalCount === 0,
  'toGateFormat emits qaCriticalCount');

const clean = gates.checkGate('qa', {
  feature: FEATURE,
  projectLevel: 'Dynamic',
  metrics: gateMetrics,
});
assert('QW-015', clean.verdict === 'pass',
  'A clean QA run now reaches verdict pass (was structurally impossible)');

// Every pass condition must still be enforced — the fix supplies the metric,
// it does not weaken the gate.
const dirty = gates.checkGate('qa', {
  feature: FEATURE,
  projectLevel: 'Dynamic',
  metrics: { ...gateMetrics, qaCriticalCount: 2 },
});
assert('QW-016', dirty.verdict === 'fail', 'A critical failure still blocks the qa gate');

// --- C-3: loadContext hydrates the QA slice the guards read ---

// unified-stop only reaches the state machine for a feature that already has a
// pdca-status entry (that is where it reads the feature name from), so the
// fixture mirrors that: status entry present, measurements in quality-metrics.
// requireDocs:false — the L3 doc gate is not what is under test here.
require('../../lib/pdca/status')
  .updatePdcaStatus(FEATURE, 'qa', { qaRetryCount: 1 }, { requireDocs: false });

const ctx = sm.loadContext(FEATURE) || sm.createContext(FEATURE);
assert('QW-017', ctx.qaPassRate === 100 && ctx.qaCriticalCount === 0,
  'loadContext hydrates qaPassRate/qaCriticalCount from collected metrics');
assert('QW-018', typeof ctx.maxQaRetries === 'number' && ctx.maxQaRetries > 0,
  'loadContext supplies maxQaRetries so the retry escape hatch can fire');

// --- H-1: Chrome detection no longer depends on an env var CC never sets ---

const noSignal = chrome.checkChromeAvailable();
assert('QW-019', noSignal.available === false && noSignal.source === 'none',
  'No signal present reports unavailable with an explicit source');

process.env.BKIT_CHROME_MCP = '1';
assert('QW-020', chrome.checkChromeAvailable().available === true,
  'BKIT_CHROME_MCP=1 override turns detection on');
process.env.BKIT_CHROME_MCP = '0';
assert('QW-021', chrome.checkChromeAvailable().available === false,
  'BKIT_CHROME_MCP=0 override turns detection off');
delete process.env.BKIT_CHROME_MCP;

chrome.recordChromeProbe(true, { probedWith: 'tabs_create_mcp' });
const probed = chrome.checkChromeAvailable();
assert('QW-022', probed.available === true && probed.source === 'runtime-probe',
  'A recorded runtime probe is the authoritative signal');

// The probe outranks a stale negative environment, which is the whole point:
// only the agent can observe whether Chrome MCP actually answers.
process.env.MCP_SERVERS = '';
assert('QW-023', chrome.checkChromeAvailable().available === true,
  'Runtime probe wins over an empty MCP_SERVERS environment');
delete process.env.MCP_SERVERS;

// --- Cleanup ---
delete require.cache[platformPath];
if (origProjectDirEnv === undefined) delete process.env.CLAUDE_PROJECT_DIR;
else process.env.CLAUDE_PROJECT_DIR = origProjectDirEnv;
if (origChromeEnv === undefined) delete process.env.BKIT_CHROME_MCP;
else process.env.BKIT_CHROME_MCP = origChromeEnv;
if (origMcpServersEnv === undefined) delete process.env.MCP_SERVERS;
else process.env.MCP_SERVERS = origMcpServersEnv;
fs.rmSync(tmpDir, { recursive: true, force: true });

// --- Summary ---
console.log(`\nResults: ${passed}/${total} passed, ${failed} failed, ${skipped} skipped`);
if (failures.length > 0) {
  console.log('Failures:');
  failures.forEach(f => console.log(`  - ${f.id}: ${f.message}`));
}

module.exports = { passed, failed, total, skipped, failures };
