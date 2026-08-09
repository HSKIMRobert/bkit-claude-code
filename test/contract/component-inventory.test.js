#!/usr/bin/env node
'use strict';

/*
 * component-inventory.test.js — v2.1.34
 *
 * `CUSTOMIZATION-GUIDE.md` carries a "Component Inventory" table that states,
 * as current fact, how many agents / skills / scripts / lib modules / hook
 * events / MCP tools bkit ships. `AI-NATIVE-DEVELOPMENT.md` restates the lib
 * module count in its architecture diagram.
 *
 * ## Why this exists
 *
 * Nothing checked either of them. `scripts/docs-code-sync.js` — the tool whose
 * whole job is keeping docs and code in step — defaults to a single target,
 * `.claude-plugin/plugin.json`. README.md and CHANGELOG.md are deliberately
 * excluded because they hold immutable at-the-time release snapshots, and that
 * exclusion silently generalised: two files stating CURRENT counts were never
 * in scope at all.
 *
 * By v2.1.34 the table was four releases stale — scripts 61 against a measured
 * 62, lib/ 195 against 198, test files "118+" against 366, and a BKIT_VERSION
 * of 2.1.13 — while `docs-code-sync` reported PASS on every release in between.
 * A sync check that passes because it isn't looking is the same shape as the
 * CI step that stayed green because it always skipped.
 *
 * ## What is enforced
 *
 * The numbers in those tables must equal what `lib/infra/docs-code-scanner.js`
 * measures from the repository right now. The scanner is the same source
 * `docs-code-sync` uses, so there is one definition of each count and the docs
 * either match it or fail.
 *
 * Prose elsewhere in those files is untouched: this reads the inventory rows
 * only, so a sentence describing v2.1.13's additions stays legal history.
 */

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const GUIDE = path.join(PROJECT_ROOT, 'CUSTOMIZATION-GUIDE.md');
const AI_NATIVE = path.join(PROJECT_ROOT, 'AI-NATIVE-DEVELOPMENT.md');

const scanner = require(path.join(PROJECT_ROOT, 'lib', 'infra', 'docs-code-scanner'));

let pass = 0;
const failures = [];
function test(name, fn) {
  try { fn(); pass++; } catch (e) { failures.push(`${name}: ${e.message}`); }
}

const measured = {
  agents: scanner.countAgents(),
  skills: scanner.countSkills(),
  scripts: scanner.countScripts(),
  libModules: scanner.countLibModules(),
  libSubdirs: scanner.countLibSubdirs(),
  mcpServers: scanner.countMCPServers(),
  mcpTools: scanner.countMCPTools(),
  hookEvents: scanner.countHooks().events,
  hookBlocks: scanner.countHooks().blocks,
};

const guide = fs.readFileSync(GUIDE, 'utf8');

/**
 * The value in a `| **Label** | value | …` inventory row.
 * @param {string} label
 * @returns {string|null}
 */
function inventoryCell(label) {
  const row = guide
    .split('\n')
    .find((l) => l.startsWith(`| **${label}**`));
  if (!row) return null;
  return row.split('|')[2].trim();
}

/** First integer in a cell, or null. */
function firstInt(cell) {
  if (cell === null) return null;
  const m = cell.match(/(\d[\d,]*)/);
  return m ? parseInt(m[1].replace(/,/g, ''), 10) : null;
}

const ROWS = [
  ['Agents', 'agents'],
  ['Skills', 'skills'],
  ['Scripts', 'scripts'],
  ['lib/', 'libModules'],
];

for (const [label, key] of ROWS) {
  test(`CI-INV ${label} row matches the repository`, () => {
    const cell = inventoryCell(label);
    assert.ok(cell !== null, `no "${label}" row in the Component Inventory table`);
    const declared = firstInt(cell);
    assert.strictEqual(
      declared,
      measured[key],
      `CUSTOMIZATION-GUIDE.md declares ${declared} for ${label}, repository has `
        + `${measured[key]}. This table states current fact, not release history — `
        + 'update it, or the guide is teaching a number that is not true.'
    );
  });
}

test('CI-INV Hooks row matches hooks.json', () => {
  const cell = inventoryCell('Hooks');
  assert.ok(cell !== null, 'no "Hooks" row in the Component Inventory table');
  const nums = (cell.match(/\d+/g) || []).map(Number);
  assert.ok(
    nums.includes(measured.hookEvents),
    `Hooks row reads "${cell}" but hooks.json registers ${measured.hookEvents} events`
  );
  assert.ok(
    nums.includes(measured.hookBlocks),
    `Hooks row reads "${cell}" but hooks.json holds ${measured.hookBlocks} blocks`
  );
});

test('CI-INV MCP Servers row matches the registry', () => {
  const cell = inventoryCell('MCP Servers');
  assert.ok(cell !== null, 'no "MCP Servers" row');
  const declared = firstInt(cell);
  assert.strictEqual(
    declared, measured.mcpServers,
    `declares ${declared} MCP servers, registry has ${measured.mcpServers}`
  );
});

test('CI-INV BKIT_VERSION row matches bkit.config.json', () => {
  const canonical = JSON.parse(
    fs.readFileSync(path.join(PROJECT_ROOT, 'bkit.config.json'), 'utf8')
  ).version;
  const cell = inventoryCell('BKIT_VERSION');
  assert.ok(cell !== null, 'no "BKIT_VERSION" row');
  assert.ok(
    cell.includes(canonical),
    `the inventory says ${cell}, bkit.config.json says ${canonical}. The row cites `
      + 'that file as the single source of truth, so disagreeing with it is a '
      + 'contradiction on its own terms.'
  );
});

test('CI-INV the inventory heading names the release it was measured in', () => {
  const canonical = JSON.parse(
    fs.readFileSync(path.join(PROJECT_ROOT, 'bkit.config.json'), 'utf8')
  ).version;
  const heading = guide.split('\n').find((l) => l.startsWith('### Component Inventory'));
  assert.ok(heading, 'the Component Inventory heading is gone');
  assert.ok(
    heading.includes(canonical),
    `heading reads "${heading}" — it should name v${canonical}. A "runtime-measured" `
      + 'stamp from an older release invites the reader to trust numbers nobody re-measured.'
  );
});

test('CI-INV AI-NATIVE-DEVELOPMENT.md lib module count matches', () => {
  const src = fs.readFileSync(AI_NATIVE, 'utf8');
  const m = src.match(/\*\*lib\/ \((\d+) modules\)\*\*/);
  assert.ok(m, 'the architecture table no longer states a lib module count');
  assert.strictEqual(
    parseInt(m[1], 10),
    measured.libModules,
    `AI-NATIVE-DEVELOPMENT.md says ${m[1]} lib modules, repository has ${measured.libModules}`
  );
});

test('CI-INV docs-code-sync still does NOT cover these files', () => {
  /*
   * Not a complaint — a boundary marker. If someone later widens
   * `DEFAULT_DOC_TARGETS` to include these files, this test becomes redundant
   * and should be deleted rather than left as a second, divergent definition of
   * the same rule. Two checkers disagreeing about the same number is how the
   * drift this file exists to catch got in.
   */
  const sync = fs.readFileSync(
    path.join(PROJECT_ROOT, 'scripts', 'docs-code-sync.js'), 'utf8'
  );
  const targets = sync.match(/const DEFAULT_DOC_TARGETS = \[([\s\S]*?)\];/);
  assert.ok(targets, 'DEFAULT_DOC_TARGETS is gone from docs-code-sync.js');
  const covered = /CUSTOMIZATION-GUIDE|AI-NATIVE-DEVELOPMENT/.test(targets[1]);
  assert.ok(
    !covered,
    'docs-code-sync now covers these files too. Delete this suite rather than '
      + 'maintaining two definitions of the same counts.'
  );
});

if (failures.length > 0) {
  console.error(`\n✗ component-inventory: ${failures.length} failing assertion(s)`);
  for (const f of failures) console.error(`    ✗ ${f}`);
  console.error(`\npass:${pass} fail:${failures.length} skip:0`);
  process.exit(1);
}
console.log(`✓ component-inventory — pass:${pass} fail:0 skip:0`);
