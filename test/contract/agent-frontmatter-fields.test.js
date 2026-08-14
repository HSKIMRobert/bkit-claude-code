/**
 * agent-frontmatter-fields.test.js — every agent frontmatter key is a key Claude
 * Code actually reads.
 *
 * ENH-434 / ENH-480 (v2.1.37).
 *
 * Claude Code documents exactly sixteen agent frontmatter fields
 * (code.claude.com/docs/en/sub-agents, "Supported frontmatter fields"). A key
 * outside that set is not an error: plugin-bundled agents skip frontmatter
 * validation entirely, so Claude Code loads the agent and silently ignores the
 * key. That silence is the whole problem — a declaration that looks like
 * configuration, reads like configuration, and does nothing.
 *
 * Six such keys had accumulated across twenty-three declarations:
 *
 *   skills_preload (4)      the real field is `skills`; `skills_preload` appears
 *                           nowhere in Claude Code's documentation. Three agents
 *                           had no `skills` key at all, so six preload entries
 *                           covering five distinct skills never loaded. bkit was
 *                           already using the correct `skills` field in nineteen
 *                           other agents, which is what made this hard to see.
 *   linked-from-skills (10) a reverse index of which skills bind to this agent.
 *                           The forward binding is live — twenty-four skills
 *                           declare `agent:`/`agents:` — so this duplicated a
 *                           working link with a dead one.
 *   imports (4)             shared template preloads. lib/import-resolver.js is
 *                           written to handle agent files, but all three of its
 *                           callers pass a skill path or bkit.config.json, and
 *                           Claude Code — not bkit — is what loads an agent
 *                           definition, so bkit has no point at which it could
 *                           inject the content. The templates are real; the
 *                           references moved into the agent bodies, which are
 *                           loaded.
 *   context / mergeResult   `context: fork` is a SKILL field. The scan that
 *   (2 + 2)                 reads it (hooks/startup/context-init.js) walks
 *                           skills/*​/SKILL.md, so on an agent it did nothing —
 *                           two agents appeared to be fork agents and were not.
 *   when_to_use (1)         delegation guidance, which is what `description` is
 *                           for. Merged into it.
 *
 * This test asserts the field set, not any file's text, so it keeps holding as
 * agents are added.
 *
 * @module test/contract/agent-frontmatter-fields.test
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const AGENTS_DIR = path.join(__dirname, '..', '..', 'agents');

/**
 * The sixteen fields Claude Code documents for agent frontmatter.
 * Source: code.claude.com/docs/en/sub-agents — "Supported frontmatter fields".
 */
const CC_AGENT_FIELDS = new Set([
  'name', 'description', 'tools', 'disallowedTools', 'model', 'permissionMode',
  'maxTurns', 'skills', 'mcpServers', 'hooks', 'memory', 'background', 'effort',
  'isolation', 'color', 'initialPrompt',
]);

/** Read every agent file once. */
function readAgents() {
  return fs.readdirSync(AGENTS_DIR)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((file) => {
      const source = fs.readFileSync(path.join(AGENTS_DIR, file), 'utf8');
      const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      return { file, source, frontmatter: match ? match[1] : null };
    });
}

/** Top-level frontmatter keys, hyphen-tolerant, comments and list items excluded. */
function topLevelKeys(frontmatter) {
  const keys = [];
  frontmatter.split(/\r?\n/).forEach((line, i) => {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_-]*):/);
    if (m) keys.push({ key: m[1], line: i + 2 });
  });
  return keys;
}

test('every agent has parseable frontmatter with the two required fields', () => {
  const agents = readAgents();
  assert.ok(agents.length > 0, 'no agents found');
  for (const { file, frontmatter } of agents) {
    assert.ok(frontmatter, `agents/${file}: no YAML frontmatter block`);
    const keys = topLevelKeys(frontmatter).map((k) => k.key);
    assert.ok(keys.includes('name'), `agents/${file}: missing required \`name\``);
    assert.ok(keys.includes('description'), `agents/${file}: missing required \`description\``);
  }
});

test('no agent declares a frontmatter key Claude Code does not read', () => {
  const offenders = [];
  for (const { file, frontmatter } of readAgents()) {
    if (!frontmatter) continue;
    for (const { key, line } of topLevelKeys(frontmatter)) {
      if (!CC_AGENT_FIELDS.has(key)) offenders.push(`agents/${file}:${line} → ${key}`);
    }
  }
  assert.deepEqual(offenders, [],
    'These keys are silently ignored by Claude Code. Either use the documented field '
    + 'that does what you meant, or move the intent into the agent body, which is loaded:\n  '
    + offenders.join('\n  '));
});

test('the retired keys do not come back', () => {
  // Named explicitly so a reintroduction fails with the reason attached rather
  // than only as "unknown key".
  const retired = ['skills_preload', 'linked-from-skills', 'imports', 'context', 'mergeResult', 'when_to_use'];
  for (const { file, frontmatter } of readAgents()) {
    if (!frontmatter) continue;
    const keys = new Set(topLevelKeys(frontmatter).map((k) => k.key));
    for (const dead of retired) {
      assert.ok(!keys.has(dead),
        `agents/${file} declares \`${dead}\`, which Claude Code ignores (ENH-434/ENH-480). `
        + (dead === 'skills_preload' ? 'Use `skills`.' : 'Move the intent into the agent body.'));
    }
  }
});

test('the three agents that lost skill preloading now declare `skills`', () => {
  // The measured loss: 3 agents, 6 entries, 5 distinct skills. bkend-expert also
  // declared skills_preload but its `skills` key already covered all three
  // entries, so it lost nothing and is deliberately not asserted here.
  const expected = {
    'bkit-impact-analyst.md': ['bkit-rules'],
    'code-analyzer.md': ['phase-2-convention', 'phase-8-review', 'code-review'],
    'pdca-iterator.md': ['pdca', 'bkit-rules'],
  };
  for (const [file, skills] of Object.entries(expected)) {
    const source = fs.readFileSync(path.join(AGENTS_DIR, file), 'utf8');
    const block = source.match(/^skills:\r?\n((?:\s+-\s.*\r?\n)+)/m);
    assert.ok(block, `agents/${file}: expected a \`skills:\` list`);
    const declared = block[1].split(/\r?\n/)
      .map((l) => (l.match(/^\s+-\s+(.+?)\s*$/) || [])[1])
      .filter(Boolean);
    for (const skill of skills) {
      assert.ok(declared.includes(skill),
        `agents/${file}: \`skills\` must include ${skill} — it was declared under `
        + 'skills_preload, which never loaded anything');
    }
  }
});

test('every skill named in an agent `skills` list exists on disk', () => {
  // A preload entry naming a skill that is not there fails silently the same way
  // the wrong field name did.
  const skillsDir = path.join(__dirname, '..', '..', 'skills');
  const available = new Set(fs.readdirSync(skillsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory()).map((d) => d.name));
  const missing = [];
  for (const { file, frontmatter } of readAgents()) {
    if (!frontmatter) continue;
    const block = frontmatter.match(/^skills:\r?\n((?:\s+-\s.*\r?\n?)+)/m);
    if (!block) continue;
    for (const line of block[1].split(/\r?\n/)) {
      const name = (line.match(/^\s+-\s+(.+?)\s*$/) || [])[1];
      if (!name) continue;
      // Plugin-scoped and third-party names are out of scope for a disk check.
      if (name.includes(':')) continue;
      if (!available.has(name)) missing.push(`agents/${file} → ${name}`);
    }
  }
  assert.deepEqual(missing, [], `agent \`skills\` entries naming no skill directory:\n  ${missing.join('\n  ')}`);
});

test('`context: fork` appears only where something reads it — skills, not agents', () => {
  // hooks/startup/context-init.js scans skills/*/SKILL.md for this key. Two
  // agents declared it and were never forked as a result.
  for (const { file, frontmatter } of readAgents()) {
    if (!frontmatter) continue;
    assert.doesNotMatch(frontmatter, /^context:\s*fork/m,
      `agents/${file}: \`context: fork\` is a skill field; on an agent nothing reads it`);
  }
});
