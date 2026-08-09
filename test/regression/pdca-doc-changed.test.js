#!/usr/bin/env node
'use strict';

/*
 * pdca-doc-changed.test.js — v2.1.34
 *
 * `scripts/pdca-doc-changed-handler.js` shipped from v2.1.1 to v2.1.33 and
 * produced output exactly zero times, for FIVE independent reasons. Each one
 * alone was sufficient; fixing any four would have changed nothing observable.
 *
 *   1. It was registered on `FileChanged`, whose matcher names literal files on
 *      disk — a path glob like `docs/**\/*.md` is not expressible there.
 *   2. It declared `if: "Write|Edit(...)"`, and `if` holds exactly ONE
 *      permission rule; there is no `|` alternation.
 *   3. `if` is evaluated only on tool events, and FileChanged is not one, so a
 *      hook declaring `if` on that event never runs at all.
 *   4. It emitted through `outputAllow(msg, 'PostToolUse')`, which prints bare
 *      text — and bare stdout from a PostToolUse hook reaches the transcript
 *      only, never the model.
 *   5. It read `pdcaStatus.currentPhase`, a key the v3.0 state schema does not
 *      have. The phase lives at `features[primaryFeature].phase`, so the guard
 *      it used to decide whether to speak was permanently false.
 *
 * A test asserting "the file parses" or "the function is exported" would have
 * been green through all five. This one runs the shipped script the way the
 * host runs it and reads what came out.
 */

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');
const HANDLER = path.join(ROOT, 'scripts', 'pdca-doc-changed-handler.js');
const HOOKS_JSON = path.join(ROOT, 'hooks', 'hooks.json');

let pass = 0;
const failures = [];
function test(name, fn) {
  try { fn(); pass++; } catch (e) { failures.push(`${name}: ${e.message}`); }
}

/** Run the handler as the host does; return parsed stdout or null. */
function run(filePath, toolName = 'Write') {
  const res = spawnSync(process.execPath, [HANDLER], {
    input: JSON.stringify({ tool_name: toolName, tool_input: { file_path: filePath } }),
    encoding: 'utf8',
    timeout: 15000,
    env: { ...process.env, BKIT_HOOK_DISPATCH_RECORD: '0' },
  });
  const raw = (res.stdout || '').trim();
  if (!raw) return { parsed: null, raw };
  try { return { parsed: JSON.parse(raw), raw }; } catch (_) { return { parsed: null, raw }; }
}

/**
 * Whether a PDCA cycle is currently in a phase where a design change matters.
 * The handler is deliberately silent outside those phases, so every assertion
 * about it speaking has to be conditional on this — otherwise the suite would
 * go green on a repository whose PDCA state happens to be idle, proving nothing.
 */
function inActivePhase() {
  try {
    const { getPdcaStatusFull, getFeatureStatus } = require(path.join(ROOT, 'lib', 'pdca', 'status'));
    const primary = getPdcaStatusFull()?.primaryFeature;
    const phase = primary ? getFeatureStatus(primary)?.phase : null;
    return ['do', 'check', 'act', 'report'].includes(String(phase || '').toLowerCase());
  } catch (_) { return false; }
}

const ACTIVE = inActivePhase();

test('PDC-1 registered on a tool event, not FileChanged', () => {
  const hooks = JSON.parse(fs.readFileSync(HOOKS_JSON, 'utf8'));
  assert.ok(
    !('FileChanged' in (hooks.hooks || {})),
    'FileChanged is back in hooks.json. Its matcher names literal files; a path '
      + 'glob cannot be expressed there, so this handler cannot be served by it.'
  );
  const post = JSON.stringify(hooks.hooks?.PostToolUse || []);
  assert.match(
    post, /pdca-doc-changed-handler/,
    'the handler is not registered on PostToolUse — it has no event that can reach it'
  );
});

test('PDC-2 the `if` rules name one tool each, with no alternation', () => {
  const hooks = JSON.parse(fs.readFileSync(HOOKS_JSON, 'utf8'));
  const handlers = [];
  for (const block of hooks.hooks?.PostToolUse || []) {
    for (const h of block.hooks || []) {
      if (String(h.command || '').includes('pdca-doc-changed-handler')) handlers.push(h);
    }
  }
  assert.ok(handlers.length >= 2,
    `expected one handler per tool (Write and Edit); found ${handlers.length}`);
  for (const h of handlers) {
    if (!h.if) continue;
    assert.ok(
      !/^\s*\w+(\s*\|\s*\w+)+\s*\(/.test(h.if),
      `if: "${h.if}" uses "|" alternation. The field holds exactly ONE permission `
        + 'rule; the alternated form suppresses the hook silently.'
    );
  }
});

test('PDC-3 a PDCA doc write produces additionalContext, not bare text', () => {
  const { parsed, raw } = run('docs/02-design/example.design.md');
  if (!ACTIVE) {
    assert.strictEqual(raw, '',
      'the cycle is not in do/check/act/report, so the handler must stay silent');
    return;
  }
  assert.ok(parsed, `expected JSON, got bare text: ${JSON.stringify(raw.slice(0, 120))}. `
    + 'Plain stdout from a PostToolUse hook reaches the transcript only — the model never sees it.');
  const ctx = parsed.hookSpecificOutput?.additionalContext;
  assert.ok(ctx, `no hookSpecificOutput.additionalContext in ${raw.slice(0, 160)}`);
  assert.match(ctx, /gap-detector/, 'the suggestion does not name what to run');
});

test('PDC-4 the Edit path is covered, not just Write', () => {
  const { parsed, raw } = run('docs/01-plan/example.plan.md', 'Edit');
  if (!ACTIVE) { assert.strictEqual(raw, ''); return; }
  assert.ok(parsed?.hookSpecificOutput?.additionalContext,
    'editing a plan document produced nothing. Through v2.1.33 the PostToolUse matcher '
      + 'was "Write" alone, so every Edit to a design doc went unseen.');
});

test('PDC-5 non-PDCA files stay silent', () => {
  const { raw } = run('README.md');
  assert.strictEqual(raw, '', `README.md triggered the handler: ${raw.slice(0, 120)}`);
});

test('PDC-6 the phase is read from a key the state schema actually has', () => {
  /*
   * The direct lock on defect 5. `currentPhase` and `session.currentPhase` are
   * absent from the v3.0 schema; reading either yields undefined forever, and
   * the handler's guard is then permanently false regardless of the real phase.
   */
  const src = fs.readFileSync(HANDLER, 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(
    !/pdcaStatus\?\.currentPhase|session\?\.currentPhase/.test(code),
    'the handler reads a phase key that does not exist on the v3.0 state schema'
  );
  assert.match(
    code, /primaryFeature/,
    'the phase must be resolved through the primary feature — that is where it lives'
  );
});

if (failures.length > 0) {
  console.error(`\n✗ pdca-doc-changed: ${failures.length} failing assertion(s)`);
  for (const f of failures) console.error(`    ✗ ${f}`);
  console.error(`\npass:${pass} fail:${failures.length} skip:0`);
  process.exit(1);
}
console.log(`✓ pdca-doc-changed — pass:${pass} fail:0 skip:0${ACTIVE ? '' : ' (idle-phase mode)'}`);
