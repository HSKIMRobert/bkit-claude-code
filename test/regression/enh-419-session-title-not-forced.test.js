#!/usr/bin/env node
/*
 * ENH-419 regression — bkit must not force a name on your session
 * (bkit v2.1.33, Issue #77).
 *
 * Reported repeatedly by users, most fully in Issue #77: bkit overwrote the
 * session title on essentially every turn, so a name set in the Claude mobile
 * app or with `/rename` came back as `[bkit] <PHASE> <feature>` moments later.
 * #77 was closed in v2.1.21 by adding a per-session `·<tag>` suffix, which
 * fixed parallel windows rendering the same title but not the overwriting.
 *
 * Two independent causes, both locked below.
 *
 * 1. bkit never read `session_title`. Claude Code supplies the current title to
 *    hooks and its docs name this exact use — "A hook that emits `sessionTitle`
 *    can check `session_title` first to avoid overwriting a title the user set
 *    explicitly" (code.claude.com/docs/en/hooks.md:1039). Confirmed empirically
 *    on CC 2.1.226 that both SessionStart and UserPromptSubmit carry it. A perl
 *    scan of lib/, scripts/ and hooks/ found zero references before v2.1.33.
 *
 * 2. The dedup cache compared `action`, which made the title rewrite itself on
 *    ordinary use: a skill Stop hook publishes with action 'PLAN', the next
 *    user prompt calls with no action at all, the values differ, so it
 *    republishes — and back again on the next skill stop. Simply alternating
 *    between working and typing renamed the session every time.
 *
 * The default is now opt-in as well: bkit does not name sessions unless asked.
 *
 * module: test/regression/enh-419-session-title-not-forced
 *
 * @version 2.1.33
 * @since   2.1.33
 */

'use strict';

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const { generateSessionTitle } = require('../../lib/pdca/session-title');
const cache = require('../../lib/core/session-title-cache');
const { getUIConfig } = require('../../lib/core/config');

let pass = 0;
let fail = 0;
const failures = [];

function assert(id, condition, message) {
  if (condition) {
    pass++;
    console.log(`  PASS: ${id}`);
  } else {
    fail++;
    failures.push({ id, message });
    console.error(`  FAIL: ${id} - ${message}`);
  }
}

console.log('=== ENH-419: bkit must not force a session name ===\n');

// --- Default is opt-in ---
assert('E419-01', getUIConfig().sessionTitle.enabled === false,
  'ui.sessionTitle.enabled must default to false — users asked bkit to stop naming sessions');

const cfgPath = path.join(PROJECT_ROOT, 'bkit.config.json');
const shipped = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
assert('E419-02', shipped.ui.sessionTitle.enabled === false,
  'the shipped bkit.config.json must also default to false, or a fresh install re-enables it');

// --- A title the user set is never replaced ---
const USER_TITLES = ['my-own-title', 'auth refactor', 'Fixing the payment bug', 'e2e-user-title'];
for (const t of USER_TITLES) {
  assert(`E419-03:${t.slice(0, 16)}`,
    generateSessionTitle({ feature: 'f', phase: 'plan', sessionId: 's1', currentTitle: t }) === undefined,
    `a user-set title ("${t}") must suppress publishing — this is the whole of Issue #77`);
}

// --- Claude Code's own auto-title counts as the user's, not ours ---
assert('E419-04',
  generateSessionTitle({ feature: 'f', phase: 'plan', sessionId: 's1', currentTitle: 'Refactoring the auth module' }) === undefined,
  "CC's generated summary must not be replaced either — it is more informative than a phase label");

// --- The action ping-pong is gone ---
const key = { sessionId: 'ping-pong', feature: 'auth', phase: 'plan' };
const store = cache.writeCache({ ...key, action: 'PLAN' }) || cache.readCache();
assert('E419-05',
  cache.isSameAsCached(store, { ...key, action: null }) === true,
  'a cached entry published with an action must still match a later lookup with no action — otherwise every skill-stop/user-prompt alternation republishes the title');
assert('E419-06',
  cache.isSameAsCached(store, { ...key, action: 'ACT' }) === true,
  'a different action alone must not invalidate the cache');
assert('E419-07',
  cache.isSameAsCached(store, { ...key, phase: 'design' }) === false,
  'a phase change must still invalidate the cache — the title is about the work, and that genuinely moved');

// --- The hooks actually pass the current title through ---
for (const rel of ['scripts/user-prompt-handler.js', 'hooks/session-start.js']) {
  const src = fs.readFileSync(path.join(PROJECT_ROOT, rel), 'utf8');
  const code = src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  assert(`E419-08:${path.basename(rel)}`, /currentTitle\s*:/.test(code),
    `${rel} must forward the incoming session_title — without it the guard above can never trigger in production`);
}

// --- Summary ---
const total = pass + fail;
console.log(`\nResults: ${pass}/${total} passed, ${fail} failed`);
if (failures.length > 0) {
  console.log('Failures:');
  failures.forEach((f) => console.log(`  - ${f.id}: ${f.message}`));
}
process.exit(fail > 0 ? 1 : 0);
