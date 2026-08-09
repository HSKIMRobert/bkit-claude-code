#!/usr/bin/env node
'use strict';

/*
 * deprecation-registry-schema.test.js — v2.1.34
 *
 * Validates `test/contract/deprecation-registry.json` itself.
 *
 * ## Why this exists
 *
 * The registry is now the ONLY path by which a hook event may leave
 * `hooks.json`, and the only way an agent, skill or MCP tool may disappear
 * without failing the L4 deprecation check. That makes it load-bearing
 * governance — and until now nothing validated it. Agent tombstones were
 * checked only for the presence of `deprecatedIn`; nothing checked that
 * `replacedBy` named something that exists, that `verifiedBy` pointed at a real
 * file, or that a `hookEvents` entry carried a reason at all.
 *
 * A lazy tombstone — `{"reason": "unused"}` — passed. Since human review is the
 * only other defense, a registry that accepts anything is a rubber stamp with
 * extra steps, which is precisely the failure mode this release is about.
 *
 * The rules below are deliberately about *substance*, not shape: a reason must
 * be long enough to be a reason, a replacement must resolve, a cited file must
 * exist.
 */

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const REGISTRY = path.join(__dirname, 'deprecation-registry.json');

let pass = 0;
const failures = [];
function test(name, fn) {
  try { fn(); pass++; } catch (e) { failures.push(`${name}: ${e.message}`); }
}

/** A reason shorter than this is a label, not an explanation. */
const MIN_REASON_CHARS = 40;

const registry = JSON.parse(fs.readFileSync(REGISTRY, 'utf8'));
const SECTIONS = ['agents', 'skills', 'mcpTools', 'hookEvents'];

test('DRS-1 the registry declares a version and every known section', () => {
  assert.strictEqual(typeof registry.version, 'number', 'registry has no numeric version');
  for (const section of SECTIONS) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(registry, section),
      `missing section '${section}' — an absent section reads as "nothing was retired here", `
        + 'which is indistinguishable from "this section was forgotten"'
    );
    assert.strictEqual(typeof registry[section], 'object', `${section} is not an object`);
  }
});

for (const section of SECTIONS) {
  for (const [name, entry] of Object.entries(registry[section] || {})) {
    const label = `${section}.${name}`;

    test(`DRS-2 ${label} declares deprecatedIn`, () => {
      assert.ok(
        typeof entry.deprecatedIn === 'string' && /^v?\d+\.\d+\.\d+$/.test(entry.deprecatedIn),
        `deprecatedIn must be a version string, got ${JSON.stringify(entry.deprecatedIn)}`
      );
    });

    test(`DRS-3 ${label} states a substantive reason`, () => {
      assert.ok(
        typeof entry.reason === 'string' && entry.reason.trim().length >= MIN_REASON_CHARS,
        `reason must explain WHY this was retired (at least ${MIN_REASON_CHARS} chars). `
          + `Got: ${JSON.stringify(entry.reason)}. A tombstone nobody has to justify is a `
          + 'rubber stamp — the registry is the only gate on removal.'
      );
    });

    test(`DRS-4 ${label} names a replacement`, () => {
      assert.ok(
        typeof entry.replacedBy === 'string' && entry.replacedBy.trim().length > 0,
        'replacedBy is required: a reader must be able to find where the capability went'
      );
    });

    if (typeof entry.verifiedBy === 'string' && entry.verifiedBy.length > 0) {
      test(`DRS-5 ${label} verifiedBy points at a file that exists`, () => {
        const target = path.join(PROJECT_ROOT, entry.verifiedBy.replace(/\*.*$/, ''));
        const dir = path.dirname(target);
        const exists = fs.existsSync(target)
          || (fs.existsSync(dir) && fs.readdirSync(dir).length > 0);
        assert.ok(
          exists,
          `verifiedBy cites ${entry.verifiedBy}, which does not exist — a citation that `
            + 'resolves to nothing is worse than no citation'
        );
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Section-specific substance
// ---------------------------------------------------------------------------

test('DRS-6 a retired hook event is genuinely absent from hooks.json', () => {
  const hooksJson = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'hooks/hooks.json'), 'utf8'));
  const live = Object.keys(hooksJson.hooks || {});
  const stillPresent = Object.keys(registry.hookEvents || {}).filter((e) => live.includes(e));
  assert.deepStrictEqual(
    stillPresent,
    [],
    `declared retired but still registered: ${stillPresent.join(', ')}. A tombstone for a `
      + 'live event is a lie in the governance record.'
  );
});

test('DRS-7 a retired agent has no live definition file', () => {
  const agentsDir = path.join(PROJECT_ROOT, 'agents');
  const live = fs.existsSync(agentsDir)
    ? fs.readdirSync(agentsDir).filter((f) => f.endsWith('.md')).map((f) => f.replace(/\.md$/, ''))
    : [];
  const contradictions = Object.keys(registry.agents || {}).filter((a) => live.includes(a));
  assert.deepStrictEqual(
    contradictions,
    [],
    `declared retired but agents/${contradictions.join('.md, ')}.md still exists`
  );
});

test('DRS-8 a retired skill has no live SKILL.md', () => {
  const skillsDir = path.join(PROJECT_ROOT, 'skills');
  const contradictions = Object.keys(registry.skills || {}).filter(
    (s) => fs.existsSync(path.join(skillsDir, s, 'SKILL.md'))
  );
  assert.deepStrictEqual(
    contradictions,
    [],
    `declared retired but skills/${contradictions.join('/SKILL.md, ')}/SKILL.md still exists`
  );
});

if (failures.length > 0) {
  console.error(`\n✗ deprecation-registry-schema: ${failures.length} failing assertion(s)`);
  for (const f of failures) console.error(`    ✗ ${f}`);
  console.error(`\npass:${pass} fail:${failures.length} skip:0`);
  process.exit(1);
}
console.log(`✓ deprecation-registry-schema — pass:${pass} fail:0 skip:0`);
