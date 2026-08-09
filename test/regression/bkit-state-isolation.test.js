#!/usr/bin/env node
'use strict';
/**
 * bkit-state-isolation.test.js — Regression guard for v2.1.26 I-14 (FR-07).
 *
 * Placed under test/regression/ alongside issue-130/issue-118/issue-119 so the
 * "tests write into the developer's real .bkit" bug class cannot recur silently.
 *
 * Bug class (v2126-issue-response design §4 I-10..I-13, audit TOPIC 5):
 *   - lib/pdca/batch-orchestrator.js hardcoded PROJECT_DIR for batch state.
 *   - scripts/sprint-handler.js handleSprintAction DROPPED deps.projectRoot
 *     (getInfra only consulted args), so even mkdtemp-rooted tests
 *     (test/contract/v2113-sprint-contracts.test.js SC-05) leaked sprint
 *     state + registry rows (e.g. 'sc05-test') into the real .bkit.
 *   - lib/audit/audit-logger.js resolved .bkit/audit exclusively from
 *     getPlatform().PROJECT_DIR, ignoring any injected root.
 *
 * This guard verifies BOTH levels:
 *   (a) UNIT — with an injected tmp root, the three write paths
 *       (batch-orchestrator state, sprint registry via handleSprintAction,
 *       audit-logger append) land ONLY under the tmp root; the real .bkit is
 *       recursively hashed before/after each call set and must be identical.
 *   (b) META — the real .bkit is hashed, the 5 converted suites of I-13 run
 *       as child processes, and the hash must be identical afterwards.
 *
 * Ambient-churn note: a live Claude Code session with bkit hooks active may
 * asynchronously touch a small set of session-runtime files while this test
 * runs (fire-and-forget PostToolUse writers). Those files are excluded from
 * the hash so the guard is deterministic; they are NOT test-write paths.
 * Everything else in .bkit — state/, audit/, runtime/active-skill.json — is
 * covered. A .bkit-absent checkout (fresh clone) hashes to 'ABSENT' and
 * passes trivially.
 */

const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..', '..');
const REAL_BKIT = path.join(REPO, '.bkit');

// Session-runtime files churned by a live CC session's own hooks (ambient
// noise, not test writes) — excluded from the integrity hash. Keep this list
// MINIMAL: every exclusion is a coverage hole.
const AMBIENT_CHURN = new Set([
  path.join('runtime', 'agent-state.json'),
  path.join('runtime', 'hook-reachability.json'),
  path.join('runtime', 'loop-counters.json'),
]);

let pass = 0, fail = 0;
const failures = [];
function tc(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else {
    fail++; failures.push(`${name}${detail ? ' :: ' + detail : ''}`);
    console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`);
  }
}

/**
 * Recursively hash the real .bkit: sorted relative paths + per-file sha256,
 * folded into one digest. Returns 'ABSENT' when .bkit does not exist.
 */
function hashRealBkit() {
  if (!fs.existsSync(REAL_BKIT)) return 'ABSENT';
  const files = [];
  (function walk(dir) {
    for (const name of fs.readdirSync(dir).sort()) {
      const p = path.join(dir, name);
      const st = fs.lstatSync(p);
      if (st.isDirectory()) walk(p);
      else if (st.isFile()) files.push(p);
    }
  })(REAL_BKIT);
  const h = crypto.createHash('sha256');
  for (const f of files) {
    const rel = path.relative(REAL_BKIT, f);
    if (AMBIENT_CHURN.has(rel)) continue;
    h.update(rel);
    h.update('\0'); // NUL separator, as an escape — never a raw byte in source
    h.update(crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'));
    h.update('\n');
  }
  return h.digest('hex');
}

function listUnder(root) {
  const out = [];
  if (!fs.existsSync(root)) return out;
  (function walk(dir) {
    for (const name of fs.readdirSync(dir).sort()) {
      const p = path.join(dir, name);
      const st = fs.lstatSync(p);
      if (st.isDirectory()) walk(p);
      else out.push(path.relative(root, p));
    }
  })(root);
  return out;
}

// ============================================================================
// Level (a) — UNIT: injected tmp root, real .bkit untouched per call set
// ============================================================================

async function unitLevel() {
  console.log('\n--- Level (a): unit — injected tmp root ---');

  // --- a1. batch-orchestrator (I-10) ---------------------------------------
  {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bkit-iso-batch-'));
    const before = hashRealBkit();
    try {
      const bo = require(path.join(REPO, 'lib/pdca/batch-orchestrator'));
      const { plan } = bo.createBatchPlan(['iso-guard-batch-feature'], { projectRoot: tmp });
      tc('a1: createBatchPlan returns a plan under injection', !!(plan && plan.batchId));
      const batchFile = path.join(tmp, '.bkit', 'state', 'batch', plan.batchId + '.json');
      tc('a1: batch state file lands under the injected tmp root',
        fs.existsSync(batchFile), 'missing ' + batchFile);
      // Round-trip through the injected root (status + cancel + resume paths).
      const status = bo.getBatchStatus(plan.batchId, { projectRoot: tmp });
      tc('a1: getBatchStatus resolves the injected root',
        status !== null && typeof status.progress === 'number');
      const after = hashRealBkit();
      tc('a1: real .bkit hash unchanged by batch-orchestrator calls',
        before === after, before + ' -> ' + after);
    } finally {
      try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_e) { /* ignore */ }
    }
  }

  // --- a2. sprint registry + state + audit via handleSprintAction (I-11) ---
  {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bkit-iso-sprint-'));
    const before = hashRealBkit();
    try {
      const handler = require(path.join(REPO, 'scripts/sprint-handler'));
      const initRes = await handler.handleSprintAction('init', {
        id: 'iso-guard-sprint',
        name: 'IsoGuard',
        features: ['f1'],
        context: { WHY: 'x', WHO: 'x', RISK: 'x', SUCCESS: 'x', SCOPE: 'x' },
      }, { projectRoot: tmp });
      tc('a2: sprint init ok under injected root',
        initRes && initRes.ok === true, JSON.stringify(initRes));

      const stateFile = path.join(tmp, '.bkit', 'state', 'sprints', 'iso-guard-sprint.json');
      tc('a2: sprint state file lands under tmp', fs.existsSync(stateFile));

      const indexFile = path.join(tmp, '.bkit', 'state', 'sprint-status.json');
      let indexHasRow = false;
      try {
        const idx = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
        indexHasRow = !!(idx.entries && idx.entries['iso-guard-sprint']);
      } catch (_e) { indexHasRow = false; }
      tc('a2: registry row (sprint-status.json) lands under tmp — the SC-05 leak',
        indexHasRow, 'no iso-guard-sprint entry in ' + indexFile);

      const today = new Date().toISOString().slice(0, 10);
      const tmpAudit = path.join(tmp, '.bkit', 'audit', today + '.jsonl');
      let auditHasEvent = false;
      try {
        auditHasEvent = fs.readFileSync(tmpAudit, 'utf8').includes('iso-guard-sprint');
      } catch (_e) { auditHasEvent = false; }
      tc('a2: SprintCreated audit entry lands under tmp (I-12 threading)',
        auditHasEvent, 'no iso-guard-sprint audit line in ' + tmpAudit);

      const marker = path.join(tmp, '.bkit', 'runtime', 'active-skill.json');
      tc('a2: active-skill marker lands under tmp (I-11 marker threading)',
        fs.existsSync(marker));

      const statusRes = await handler.handleSprintAction('status',
        { id: 'iso-guard-sprint' }, { projectRoot: tmp });
      tc('a2: status round-trips through the injected root',
        statusRes && statusRes.ok === true && statusRes.sprint &&
        statusRes.sprint.id === 'iso-guard-sprint');

      const after = hashRealBkit();
      tc('a2: real .bkit hash unchanged by sprint init/status',
        before === after, before + ' -> ' + after);
      tc('a2: iso-guard-sprint did NOT leak into the real .bkit',
        !fs.existsSync(path.join(REAL_BKIT, 'state', 'sprints', 'iso-guard-sprint.json')));
    } finally {
      try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_e) { /* ignore */ }
    }
  }

  // --- a3. audit-logger direct write (I-12) ---------------------------------
  {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bkit-iso-audit-'));
    const before = hashRealBkit();
    try {
      const al = require(path.join(REPO, 'lib/audit/audit-logger'));
      al.writeAuditLog({
        actor: 'system',
        action: 'config_changed',
        category: 'system',
        target: 'iso-guard-audit',
        targetType: 'config',
        details: { note: 'I-14 isolation guard probe' },
        result: 'success',
      }, { projectRoot: tmp });

      const today = new Date().toISOString().slice(0, 10);
      const tmpAudit = path.join(tmp, '.bkit', 'audit', today + '.jsonl');
      let found = false;
      try { found = fs.readFileSync(tmpAudit, 'utf8').includes('iso-guard-audit'); }
      catch (_e) { found = false; }
      tc('a3: writeAuditLog honors injected projectRoot', found,
        'entry not found in ' + tmpAudit);

      const entries = al.readAuditLogs({ projectRoot: tmp });
      tc('a3: readAuditLogs honors injected projectRoot',
        entries.some((e) => e.target === 'iso-guard-audit'));

      const after = hashRealBkit();
      tc('a3: real .bkit hash unchanged by injected audit write',
        before === after, before + ' -> ' + after);
      // Only .bkit/audit may exist under tmp for this probe — nothing stray.
      const written = listUnder(path.join(tmp, '.bkit'));
      tc('a3: probe wrote only the audit jsonl under tmp',
        written.length === 1 && written[0] === path.join('audit', today + '.jsonl'),
        JSON.stringify(written));
    } finally {
      try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_e) { /* ignore */ }
    }
  }
}

// ============================================================================
// Level (b) — META: run the 5 I-13 suites; real .bkit must be identical
// ============================================================================

const I13_SUITES = [
  'test/unit/sprint-handler/default-level-warning.test.js',
  'test/unit/sprint-handler/annotate-action.test.js',
  'test/integration/config-sync.test.js',
  'test/integration/module-chain.test.js',
  'test/unit/batch-orchestrator.test.js',
];

function metaLevel() {
  console.log('\n--- Level (b): meta — 5 I-13 suites leave real .bkit identical ---');
  const before = hashRealBkit();
  for (const rel of I13_SUITES) {
    const abs = path.join(REPO, rel);
    const r = spawnSync('node', [abs], { cwd: REPO, encoding: 'utf8', timeout: 120000 });
    tc(`b: suite passes — ${rel}`, r.status === 0,
      'exit ' + r.status + ' :: ' + ((r.stdout || '') + (r.stderr || '')).slice(-400));
  }
  const after = hashRealBkit();
  tc('b: real .bkit hash identical across the 5 suites',
    before === after, before + ' -> ' + after);
}

// ============================================================================

(async function main() {
  console.log('bkit-state-isolation.test.js — v2.1.26 I-14 guard (FR-07)');
  console.log('real .bkit: ' + (fs.existsSync(REAL_BKIT) ? 'present' : 'ABSENT (trivially isolated)'));
  await unitLevel();
  metaLevel();
  console.log(`\n${pass} passed, ${fail} failed (total ${pass + fail})`);
  if (fail > 0) {
    failures.forEach((f) => console.error('  - ' + f));
    process.exit(1);
  }
  process.exit(0);
})().catch((e) => {
  console.error('FATAL: ' + (e && e.stack || e));
  process.exit(2);
});
