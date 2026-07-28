'use strict';
/**
 * Regression: lock() must not delete a live lock it cannot parse (v2.1.32).
 *
 * `lock()` creates the lock file with `writeFileSync(path, data, { flag: 'wx' })`.
 * That is two steps — create, then write — so a competing process can read the
 * file in between and see zero bytes. The old code treated any unparseable lock
 * as corrupt and deleted it immediately, which put two processes in the critical
 * section at once. Measured against the pre-fix module, 8 concurrent writers to
 * one file produced 6-7 appends instead of 8 on every trial.
 *
 * Staleness is now judged from the lock file's mtime, so a lock mid-creation is
 * waited on rather than removed, while a genuinely abandoned one still recovers
 * after LOCK_STALE_MS.
 *
 * These tests exercise the real primitive with real concurrent processes — a
 * single-process test cannot reproduce the window.
 *
 * 4 TC | console.assert based | no external dependencies
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

let store;
try {
  store = require('../../lib/core/state-store');
} catch (e) {
  console.error('Module load failed:', e.message);
  process.exit(1);
}

let passed = 0, failed = 0, total = 0;
const failures = [];

function assert(id, condition, message) {
  total++;
  if (condition) { passed++; console.log(`  PASS: ${id} - ${message}`); }
  else { failed++; failures.push(`${id}: ${message}`); console.log(`  FAIL: ${id} - ${message}`); }
}

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bkit-lock-'));
const WORKERS = 8;

function cleanup() {
  try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (_) { /* ignore */ }
}

// --- LK-001: concurrent writers all land (mutual exclusion holds) -------------

const targetPath = path.join(tmpRoot, 'shared.json');
fs.writeFileSync(targetPath, JSON.stringify({ n: [] }));

const workerSrc = `
const store = require(${JSON.stringify(path.resolve(__dirname, '../../lib/core/state-store'))});
store.lockedUpdate(process.argv[2], (cur) => {
  const d = (cur && Array.isArray(cur.n)) ? cur : { n: [] };
  d.n.push(process.argv[3]);
  return d;
});
`;
const workerPath = path.join(tmpRoot, 'worker.js');
fs.writeFileSync(workerPath, workerSrc);

// Spawned rather than exec'd: the race only exists between genuinely
// concurrent processes, so a blocking helper would test nothing.
const procs = [];
for (let i = 0; i < WORKERS; i++) {
  procs.push(spawn(process.execPath, [workerPath, targetPath, `id${i}`], { stdio: 'ignore' }));
}

Promise.all(procs.map((p) => new Promise((res) => p.on('exit', res)))).then(() => {
  let result;
  try {
    result = JSON.parse(fs.readFileSync(targetPath, 'utf8'));
  } catch (e) {
    result = { n: [] };
  }

  assert('LK-001', Array.isArray(result.n) && result.n.length === WORKERS,
    `${WORKERS} concurrent lockedUpdate writers all persist (got ${result.n ? result.n.length : 0}/${WORKERS})`);

  const unique = new Set(result.n || []);
  assert('LK-002', unique.size === (result.n || []).length,
    'no duplicate entries — each writer appended exactly once');

  // --- LK-003: an empty lock file is treated as held, not corrupt ------------

  const heldPath = path.join(tmpRoot, 'held.json');
  fs.writeFileSync(heldPath, JSON.stringify({ v: 1 }));
  fs.writeFileSync(heldPath + '.lock', ''); // zero bytes — mid-creation shape

  let threw = false;
  const t0 = Date.now();
  try {
    store.lock(heldPath, 300); // short timeout so the test stays fast
  } catch (_) {
    threw = true;
  }
  const waited = Date.now() - t0;

  assert('LK-003', threw,
    'a fresh zero-byte lock file is waited on and then times out, not deleted and stolen');
  assert('LK-004', waited >= 250,
    `the waiter actually backed off before giving up (waited ${waited}ms)`);

  try { fs.unlinkSync(heldPath + '.lock'); } catch (_) { /* ignore */ }

  cleanup();

  console.log('');
  console.log(`v2132-lock-mutual-exclusion.test.js: ${passed}/${total} PASS, ${failed} FAIL`);
  if (failures.length) {
    console.log('Failures:');
    failures.forEach((f) => console.log('  - ' + f));
  }
  process.exit(failed > 0 ? 1 : 0);
});
