#!/usr/bin/env node
/*
 * Scope evasion suite (ENH-401, bkit v2.1.33).
 *
 * The existing scope tests asked "was this refused?". This one asks "was it
 * refused BY THE RULE THAT SHOULD HAVE REFUSED IT?", because v2.1.32 shipped a
 * deny list that had quietly stopped working while every test stayed green:
 *
 *   - `.env*`, `*.key`, `*.pem` were root-anchored. `_globMatch` expands `*` to
 *     `[^/]*`, so none could match a path containing a slash. `certs/key.pem`
 *     was still refused — but by NOT_IN_SCOPE, the automation-level allowlist.
 *     Widening that allowlist would silently have exposed every secret in a
 *     subdirectory. Measured at L4 before the fix, `src/.env` was ALLOWED.
 *   - `checkPathScope` resolved the path for its root-escape check and then
 *     matched patterns against the RAW input, so `docs/../.env` resolved into a
 *     denied location while presenting an allowed spelling. Allowed at L0 and L4.
 *
 * Every case here states its automation level explicitly: a scope claim without
 * one is untestable, since L0 and L4 have different allowlists and the same
 * path can be refused at one level and permitted at the other.
 *
 * module: test/security/scope-evasion
 *
 * @version 2.1.33
 * @since   2.1.33
 */

'use strict';

const assert = require('assert');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
process.chdir(PROJECT_ROOT);
const scopeLimiter = require('../../lib/control/scope-limiter');

let pass = 0;
let fail = 0;
const failures = [];

function test(id, name, fn) {
  try {
    fn();
    pass++;
    console.log(`  PASS: ${id} - ${name}`);
  } catch (e) {
    fail++;
    failures.push({ id, name, message: e.message });
    console.error(`  FAIL: ${id} - ${name}\n        ${e.message}`);
  }
}

/**
 * A secret must be refused by DENIED_PATH at every automation level. Being
 * refused by NOT_IN_SCOPE instead is a latent hole, not a pass.
 */
function mustBeDeniedByRule(id, name, filePath) {
  test(id, name, () => {
    for (const level of [0, 1, 2, 3, 4]) {
      const r = scopeLimiter.checkPathScope(filePath, level);
      assert.strictEqual(r.allowed, false,
        `L${level}: "${filePath}" was allowed`);
      assert.strictEqual(r.rule, 'DENIED_PATH',
        `L${level}: "${filePath}" was refused by ${r.rule}, not the deny list — the deny rule is not doing the work`);
    }
  });
}

console.log('=== Scope evasion suite (ENH-401) ===\n');

// --- Traversal spellings that resolve into a denied location ---
mustBeDeniedByRule('EV-01', 'parent traversal into deny list', 'docs/../.env');
mustBeDeniedByRule('EV-02', 'double-slash traversal', 'docs//../.env');
mustBeDeniedByRule('EV-03', 'current-dir prefix', './.env');
mustBeDeniedByRule('EV-04', 'nested traversal', 'docs/features/../../.env');
mustBeDeniedByRule('EV-05', 'redundant segments', 'docs/./../.env');

// --- Secrets below the repository root ---
mustBeDeniedByRule('EV-06', 'dotenv in a subdirectory', 'src/.env');
mustBeDeniedByRule('EV-07', 'environment-suffixed dotenv', 'config/.env.production');
mustBeDeniedByRule('EV-08', 'private key in a subdirectory', 'certs/server.key');
mustBeDeniedByRule('EV-09', 'pem in a subdirectory', 'config/prod.pem');
mustBeDeniedByRule('EV-10', 'deeply nested secret', 'a/b/c/d/.env');
mustBeDeniedByRule('EV-11', 'pkcs12 bundle', 'certs/bundle.p12');

// --- Baselines that must keep working ---
mustBeDeniedByRule('EV-12', 'dotenv at the repository root', '.env');
mustBeDeniedByRule('EV-13', 'key at the repository root', 'server.key');
mustBeDeniedByRule('EV-14', 'secrets directory', 'app/secrets/token.txt');
mustBeDeniedByRule('EV-15', 'git internals', '.git/config');

// --- Rejections that must NOT come from the deny list ---
test('EV-16', 'null byte is its own rule', () => {
  const r = scopeLimiter.checkPathScope('docs/read\0me.md', 4);
  assert.strictEqual(r.allowed, false, 'a null byte must be refused');
  assert.strictEqual(r.rule, 'NULL_BYTE', `expected NULL_BYTE, got ${r.rule}`);
});

// --- No false positives: ordinary work must stay permitted at L4 ---
test('EV-17', 'ordinary source and docs are permitted at L4', () => {
  for (const p of ['lib/core/io.js', 'docs/readme.md', 'test/unit/x.test.js', 'scripts/run.js']) {
    const r = scopeLimiter.checkPathScope(p, 4);
    assert.strictEqual(r.allowed, true,
      `L4: "${p}" should be permitted but was refused by ${r.rule}`);
  }
});

test('EV-18', 'a filename merely containing "env" is not a secret', () => {
  const r = scopeLimiter.checkPathScope('docs/environment-setup.md', 4);
  assert.strictEqual(r.allowed, true,
    `"docs/environment-setup.md" must not be caught by the .env rule (rule=${r.rule})`);
});

// --- Summary ---
const total = pass + fail;
console.log(`\nScope evasion: ${pass}/${total} PASS, ${fail} FAIL`);
if (failures.length > 0) {
  console.log('Failures:');
  failures.forEach((f) => console.log(`  - ${f.id}: ${f.message}`));
}
process.exit(fail > 0 ? 1 : 0);
