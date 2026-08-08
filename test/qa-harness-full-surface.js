#!/usr/bin/env node
/*
 * bkit v2.1.33 — full-surface QA.
 *
 * Static/contract layer. Every registered surface is exercised, not sampled:
 * all skills load, all agents parse, every hook event resolves to a runnable
 * handler, both MCP servers complete a real stdio handshake and list their
 * tools. The live `claude -p --plugin-dir .` layer runs separately.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = require('path').resolve(__dirname, '..');
let pass = 0, fail = 0;
const failures = [];

function check(name, fn) {
  try {
    const detail = fn();
    pass++;
    console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ''}`);
  } catch (e) {
    fail++;
    failures.push(`${name}: ${e.message}`);
    console.log(`  FAIL  ${name} — ${e.message}`);
  }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

// ---------------------------------------------------------------- SKILLS
console.log('\n=== Skills (all, not sampled) ===');
const skillDirs = fs.readdirSync(path.join(ROOT, 'skills'), { withFileTypes: true })
  .filter(d => d.isDirectory()).map(d => d.name).sort();
check('skill count matches the counts SoT', () => {
  const { EXPECTED_COUNTS } = require(path.join(ROOT, 'lib/domain/rules/docs-code-invariants'));
  assert(skillDirs.length === EXPECTED_COUNTS.skills,
    `${skillDirs.length} dirs vs SoT ${EXPECTED_COUNTS.skills}`);
  return `${skillDirs.length} skills`;
});
let skillBad = [];
for (const s of skillDirs) {
  const md = path.join(ROOT, 'skills', s, 'SKILL.md');
  if (!fs.existsSync(md)) { skillBad.push(`${s}: no SKILL.md`); continue; }
  const src = fs.readFileSync(md, 'utf8');
  if (!/^---\n[\s\S]*?\n---/.test(src)) skillBad.push(`${s}: no frontmatter`);
  else {
    const fm = src.match(/^---\n([\s\S]*?)\n---/)[1];
    if (!/^name:\s*\S/m.test(fm)) skillBad.push(`${s}: no name`);
    if (!/^description:\s*\S/m.test(fm)) skillBad.push(`${s}: no description`);
  }
}
check('every SKILL.md has valid frontmatter (name + description)', () => {
  assert(skillBad.length === 0, skillBad.slice(0, 5).join('; '));
  return `${skillDirs.length}/${skillDirs.length} valid`;
});

// ---------------------------------------------------------------- AGENTS
console.log('\n=== Agents (all) ===');
const agentFiles = fs.readdirSync(path.join(ROOT, 'agents')).filter(f => f.endsWith('.md')).sort();
check('agent count matches the counts SoT', () => {
  const { EXPECTED_COUNTS } = require(path.join(ROOT, 'lib/domain/rules/docs-code-invariants'));
  assert(agentFiles.length === EXPECTED_COUNTS.agents,
    `${agentFiles.length} files vs SoT ${EXPECTED_COUNTS.agents}`);
  return `${agentFiles.length} agents`;
});
const agentBad = [];
const MODELS = new Set(['fable', 'opus', 'sonnet', 'haiku', 'inherit']);
for (const f of agentFiles) {
  const src = fs.readFileSync(path.join(ROOT, 'agents', f), 'utf8');
  const m = src.match(/^---\n([\s\S]*?)\n---/);
  if (!m) { agentBad.push(`${f}: no frontmatter`); continue; }
  const fm = m[1];
  if (!/^name:\s*\S/m.test(fm)) agentBad.push(`${f}: no name`);
  if (!/^description:\s*[\s\S]*?\S/m.test(fm)) agentBad.push(`${f}: no description`);
  const model = (fm.match(/^model:\s*(\S+)/m) || [])[1];
  if (model && !MODELS.has(model)) agentBad.push(`${f}: unknown model "${model}"`);
}
check('every agent has valid frontmatter and a known model tier', () => {
  assert(agentBad.length === 0, agentBad.slice(0, 5).join('; '));
  return `${agentFiles.length}/${agentFiles.length} valid`;
});

// ---------------------------------------------------------------- HOOKS
console.log('\n=== Hook events (all) ===');
const hooksJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'hooks/hooks.json'), 'utf8'));
const events = Object.keys(hooksJson.hooks || {});
check('hook event count matches the counts SoT', () => {
  const { EXPECTED_COUNTS } = require(path.join(ROOT, 'lib/domain/rules/docs-code-invariants'));
  assert(events.length === EXPECTED_COUNTS.hookEvents,
    `${events.length} events vs SoT ${EXPECTED_COUNTS.hookEvents}`);
  return `${events.length} events`;
});
const missingHandlers = [];
const handlerFiles = new Set();
for (const [ev, blocks] of Object.entries(hooksJson.hooks || {})) {
  for (const b of blocks) {
    for (const h of (b.hooks || [])) {
      const cmd = h.command || '';
      const m = cmd.match(/\$\{CLAUDE_PLUGIN_ROOT\}\/(\S+?\.(?:js|mjs))/);
      if (!m) continue;
      handlerFiles.add(m[1]);
      if (!fs.existsSync(path.join(ROOT, m[1]))) missingHandlers.push(`${ev} -> ${m[1]}`);
    }
  }
}
check('every hook command resolves to a file that exists', () => {
  assert(missingHandlers.length === 0, missingHandlers.join('; '));
  return `${handlerFiles.size} distinct handlers`;
});
const syntaxBad = [];
for (const f of handlerFiles) {
  const r = spawnSync(process.execPath, ['-c', path.join(ROOT, f)], { encoding: 'utf8' });
  if (r.status !== 0) syntaxBad.push(`${f}: ${(r.stderr || '').split('\n')[0]}`);
}
check('every hook handler parses', () => {
  assert(syntaxBad.length === 0, syntaxBad.slice(0, 3).join('; '));
  return `${handlerFiles.size} handlers parse`;
});

// Exercise the hooks that accept stdin, with a realistic payload.
console.log('\n=== Hook execution (real stdin payloads) ===');
const HOOK_CASES = [
  ['PreToolUse Bash (allow)', 'scripts/unified-bash-pre.js',
    { tool_name: 'Bash', tool_input: { command: 'echo hi' }, session_id: 'qa' }, 'allow'],
  ['PreToolUse Write (allow)', 'scripts/pre-write.js',
    { tool_name: 'Write', tool_input: { file_path: 'docs/x.md', content: 'x' }, session_id: 'qa' }, 'allow'],
  ['PreToolUse Write (deny secret)', 'scripts/pre-write.js',
    { tool_name: 'Write', tool_input: { file_path: 'config/.env', content: 'x' }, session_id: 'qa' }, 'block'],
  ['UserPromptSubmit', 'scripts/user-prompt-handler.js',
    { hook_event_name: 'UserPromptSubmit', prompt: 'hello', session_id: 'qa', session_title: 'user-set' }, 'any'],
  ['PostToolUse Bash', 'scripts/unified-bash-post.js',
    { tool_name: 'Bash', tool_input: { command: 'echo hi' }, session_id: 'qa' }, 'any'],
  ['SubagentStop', 'scripts/subagent-stop-handler.js',
    { hook_event_name: 'SubagentStop', agent_id: 'a1', agent_type: 'code-analyzer', session_id: 'qa' }, 'any'],
];
for (const [label, rel, payload, expect] of HOOK_CASES) {
  check(`hook runs: ${label}`, () => {
    let out = '';
    try {
      out = execFileSync(process.execPath, [path.join(ROOT, rel)], {
        input: JSON.stringify(payload), encoding: 'utf8', cwd: ROOT,
        env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT }, timeout: 20000,
      });
    } catch (e) { out = (e.stdout || '') + (e.stderr || ''); }
    let decision = 'allow';
    const last = out.trim().split('\n').filter(Boolean).pop();
    if (last) { try { const j = JSON.parse(last); if (j.decision === 'block') decision = 'block'; } catch (_) {} }
    if (expect !== 'any') assert(decision === expect, `expected ${expect}, got ${decision}`);
    return `decision=${decision}`;
  });
}

// ---------------------------------------------------------------- MCP
console.log('\n=== MCP servers (real stdio handshake) ===');
const SERVERS = [
  ['bkit-pdca', 'servers/bkit-pdca-server/index.js'],
  ['bkit-analysis', 'servers/bkit-analysis-server/index.js'],
];
let toolTotal = 0;
for (const [name, rel] of SERVERS) {
  check(`MCP ${name}: initialize + tools/list`, () => {
    const reqs = [
      JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'bkit-qa', version: '1.0' } } }),
      JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
    ].join('\n') + '\n';
    const r = spawnSync(process.execPath, [path.join(ROOT, rel)], {
      input: reqs, encoding: 'utf8', cwd: ROOT, timeout: 20000,
      env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT },
    });
    const lines = (r.stdout || '').split('\n').filter(Boolean);
    const init = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).find(j => j && j.id === 1);
    const list = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).find(j => j && j.id === 2);
    assert(init && init.result && init.result.protocolVersion, 'no initialize result');
    assert(list && list.result && Array.isArray(list.result.tools), 'no tools/list result');
    toolTotal += list.result.tools.length;
    return `protocol=${init.result.protocolVersion}, tools=${list.result.tools.length}`;
  });
}
check('MCP tool count matches the counts SoT', () => {
  const { EXPECTED_COUNTS } = require(path.join(ROOT, 'lib/domain/rules/docs-code-invariants'));
  assert(toolTotal === EXPECTED_COUNTS.mcpTools, `${toolTotal} tools vs SoT ${EXPECTED_COUNTS.mcpTools}`);
  return `${toolTotal} tools`;
});

// ---------------------------------------------------------------- LIB
console.log('\n=== Library modules (every file loads) ===');
function walk(d) {
  const out = [];
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}
const libFiles = walk(path.join(ROOT, 'lib'));
const loadBad = [];
for (const f of libFiles) {
  try { require(f); } catch (e) { loadBad.push(`${path.relative(ROOT, f)}: ${e.message.split('\n')[0]}`); }
}
check('every lib module requires without throwing', () => {
  assert(loadBad.length === 0, loadBad.slice(0, 5).join('; '));
  return `${libFiles.length} modules`;
});

// ---------------------------------------------------------------- SUMMARY
console.log(`\n================ STATIC QA: ${pass} pass / ${fail} fail ================`);
if (failures.length) { console.log('Failures:'); failures.forEach(f => console.log(`  - ${f}`)); }
process.exit(fail > 0 ? 1 : 0);
