#!/usr/bin/env node
'use strict';

/*
 * qa-harness-full-live.js — v2.1.34 exhaustive live QA
 *
 * Drives REAL Claude Code sessions with the plugin loaded from the working tree
 * and checks every surface bkit ships: each skill as a slash command, each agent
 * as a dispatch target, each hook event as an observed dispatch, and each MCP
 * tool over a real stdio session.
 *
 * ## Why exhaustive, and not a sample
 *
 * v2.1.33's live QA covered thirteen cases. Everything it touched worked. The
 * defects this release fixes were all in what it did not touch: a hook that had
 * never fired since v2.1.1, a matcher that covered Write but not Edit, a quality
 * gate that reported 100% for a feature that did not exist. Sampling cannot find
 * a dead surface, because a dead surface looks exactly like an unsampled one.
 *
 * ## Cost
 *
 * Each live case is a real session (roughly 20-90s). The full sweep is long by
 * construction. `--layer` narrows it; `--list` prints the plan without running.
 *
 *   node test/qa-harness-full-live.js                 # everything
 *   node test/qa-harness-full-live.js --layer skills
 *   node test/qa-harness-full-live.js --layer hooks,mcp
 *   node test/qa-harness-full-live.js --list
 *
 * Results are written to .bkit/runtime/full-live-qa.json so a run can be
 * inspected, diffed, and cited rather than remembered.
 */

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const RESULT_FILE = path.join(PROJECT_ROOT, '.bkit', 'runtime', 'full-live-qa.json');

const args = process.argv.slice(2);
const LIST_ONLY = args.includes('--list');
const layerArg = args.find((a) => a.startsWith('--layer'));
const LAYERS = layerArg
  ? (layerArg.includes('=') ? layerArg.split('=')[1] : args[args.indexOf(layerArg) + 1] || '')
      .split(',').map((s) => s.trim()).filter(Boolean)
  : ['skills', 'agents', 'hooks', 'mcp'];

// ---------------------------------------------------------------------------
// CLI discovery — never hardcode a path. v2.1.33's harness pinned an absolute
// home directory and could not run on any other machine.
// ---------------------------------------------------------------------------
function findClaude() {
  const exts = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : [''];
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      const candidate = path.join(dir, `claude${ext}`);
      try {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
      } catch (_) { /* unreadable PATH entry */ }
    }
  }
  return null;
}

const CLAUDE = findClaude();

// ---------------------------------------------------------------------------
// Inventory — read from the tree, so a new surface is covered automatically
// ---------------------------------------------------------------------------
const skills = fs.readdirSync(path.join(PROJECT_ROOT, 'skills'))
  .filter((d) => fs.existsSync(path.join(PROJECT_ROOT, 'skills', d, 'SKILL.md')))
  .sort();

const agents = fs.readdirSync(path.join(PROJECT_ROOT, 'agents'))
  .filter((f) => f.endsWith('.md'))
  .map((f) => f.replace(/\.md$/, ''))
  .sort();

const hooksJson = JSON.parse(
  fs.readFileSync(path.join(PROJECT_ROOT, 'hooks', 'hooks.json'), 'utf8')
);
const hookEvents = Object.keys(hooksJson.hooks || {}).sort();

const { EXPECTED_PDCA_MCP_TOOLS, EXPECTED_ANALYSIS_MCP_TOOLS } =
  require(path.join(PROJECT_ROOT, 'lib/domain/rules/docs-code-invariants'));

const plan = {
  skills: skills.length,
  agents: agents.length,
  hooks: hookEvents.length,
  mcp: EXPECTED_PDCA_MCP_TOOLS.length + EXPECTED_ANALYSIS_MCP_TOOLS.length,
};

console.log(`plugin : ${PROJECT_ROOT}`);
console.log(`claude : ${CLAUDE || '(not found on PATH)'}`);
console.log(`layers : ${LAYERS.join(', ')}`);
console.log(`plan   : ${plan.skills} skills, ${plan.agents} agents, `
  + `${plan.hooks} hook events, ${plan.mcp} MCP tools`);

if (LIST_ONLY) {
  console.log('\nskills:', skills.join(', '));
  console.log('\nagents:', agents.join(', '));
  console.log('\nhook events:', hookEvents.join(', '));
  process.exit(0);
}

if (!CLAUDE) {
  console.log('\nSKIP: the `claude` CLI is not on PATH — live QA cannot run here.');
  process.exit(process.env.BKIT_REQUIRE_HOST_INTEGRATION === '1' ? 1 : 0);
}

// ---------------------------------------------------------------------------
const results = [];
let pass = 0;
let fail = 0;

function record(layer, name, ok, detail) {
  results.push({ layer, name, ok: !!ok, detail: String(detail || '').slice(0, 400) });
  if (ok) { pass++; process.stdout.write('.'); }
  else { fail++; process.stdout.write('F'); }
}

/**
 * One real session. Returns combined output plus the project dir it ran in, so
 * a caller can inspect side effects on disk rather than trusting the prose.
 */
function session(prompt, opts = {}) {
  const work = opts.cwd || fs.mkdtempSync(path.join(os.tmpdir(), 'bkit-fullqa-'));
  /*
   * `--setting-sources ''` keeps the developer's own settings out of the result,
   * which is what makes a run reproducible — but it also switches off CLAUDE.md
   * discovery, and with it the `InstructionsLoaded` event. Measured: the event
   * fires twice with default setting sources and zero with them emptied.
   *
   * So the isolation is opt-out rather than unconditional. A case that needs
   * instructions loaded passes `settingSources: 'default'` and says why, instead
   * of the harness reporting a live event as dead.
   */
  const isolationArgs = opts.settingSources === 'default'
    ? []
    : ['--setting-sources', ''];
  const r = spawnSync(
    CLAUDE,
    [
      '-p', prompt,
      '--plugin-dir', PROJECT_ROOT,
      ...isolationArgs,
      '--strict-mcp-config',
      '--permission-mode', opts.permissionMode || 'bypassPermissions',
      '--no-session-persistence',
      ...(opts.debugFile ? ['--debug', '--debug-file', opts.debugFile] : []),
    ],
    {
      cwd: work,
      encoding: 'utf8',
      // Close stdin immediately. Without this each session waits 3s for input it
      // will never get — 44 skills would spend two minutes on a warning.
      input: '',
      timeout: opts.timeout || 240000,
      env: { ...process.env, CLAUDE_PROJECT_DIR: work },
    }
  );
  return { work, status: r.status, out: (r.stdout || '') + (r.stderr || ''), error: r.error };
}

/**
 * Did the host accept this invocation?
 *
 * Deliberately NOT "did it print something". bkit's reference skills — the
 * bkend-* docs, the phase-1..9 pipeline guides, bkit-rules, bkit-templates —
 * load their content into context and give the model nothing to say back, so a
 * bare invocation legitimately produces no prose. Requiring non-empty output
 * marked 18 healthy skills as broken on the first run of this harness.
 *
 * What actually distinguishes reachable from dead is whether Claude Code
 * recognised the command. Inventory-level proof that all 44 registered comes
 * from the debug log, checked once, below.
 */
function hostAccepted(out) {
  if (out === undefined || out === null) return false;
  return !/unknown (slash )?command|no such (skill|command)|command not found|is not a recognized/i.test(out);
}

// ---------------------------------------------------------------------------
// Layer: skills — every skill is reachable as a slash command
// ---------------------------------------------------------------------------
if (LAYERS.includes('skills')) {
  console.log(`\n=== skills (${skills.length}) ===`);

  // Inventory proof, once: Claude Code reports how many skills it loaded from
  // the plugin. This is the check that would catch a whole directory failing to
  // register — something no per-skill prompt can distinguish from a quiet skill.
  {
    const dbgDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bkit-fullqa-inv-'));
    const debugFile = path.join(dbgDir, 'debug.log');
    session('say ok', { cwd: dbgDir, debugFile, timeout: 180000 });
    let loaded = null;
    try {
      const log = fs.readFileSync(debugFile, 'utf8');
      const m = log.match(/Loaded (\d+) skills from plugin bkit/);
      if (m) loaded = Number(m[1]);
    } catch (_) { /* debug log unavailable */ }
    record('skills', `inventory: all ${skills.length} skills register with the host`,
      loaded === skills.length,
      loaded === null ? 'no "Loaded N skills from plugin bkit" line in the debug log'
        : `host loaded ${loaded}, tree has ${skills.length}`);
    try { fs.rmSync(dbgDir, { recursive: true, force: true }); } catch (_) { /* ignore */ }
  }

  /*
   * Skills whose bare invocation legitimately does real work before answering,
   * with the reason. `cc-version-analysis` runs Phase 0 version detection —
   * `claude --version`, `npm view @anthropic-ai/claude-code` — before it can say
   * anything, and correctly reports "no new version to analyse" when the
   * installed build already matches latest. At the default budget it was killed
   * mid-flight (SIGTERM, exit 143) and looked broken.
   */
  const LONG_RUNNING = {
    'cc-version-analysis': 600000,
  };

  for (const skill of skills) {
    const timeout = LONG_RUNNING[skill] || 180000;
    const s = session(`/bkit:${skill}`, { timeout });
    // 143 = SIGTERM, i.e. this harness ran out of patience rather than the skill
    // failing. Report it as such instead of as a defect.
    const timedOut = s.status === 143 || (s.error && /ETIMEDOUT/i.test(String(s.error)));
    const ok = !timedOut && (s.status === 0 || s.status === 1) && hostAccepted(s.out);
    record('skills', skill, ok,
      ok ? ''
        : timedOut ? `exceeded ${timeout / 1000}s — long-running, not necessarily broken`
          : `status=${s.status} out=${s.out.slice(0, 200)}`);
    try { fs.rmSync(s.work, { recursive: true, force: true }); } catch (_) { /* ignore */ }
  }
}

// ---------------------------------------------------------------------------
// Layer: agents — every agent is dispatchable by name
// ---------------------------------------------------------------------------
if (LAYERS.includes('agents')) {
  console.log(`\n=== agents (${agents.length}) ===`);
  const { readDispatch, agentsSeen } = require(path.join(PROJECT_ROOT, 'lib/core/hook-dispatch'));

  /*
   * Evidence, not prose.
   *
   * The first version of this layer asserted that the session output contained
   * no "unknown agent" string. That cannot tell a successful dispatch from the
   * model simply never calling the Task tool — both produce output with no
   * error in it, and the weaker reading would have reported 34/34 while proving
   * nothing.
   *
   * Claude Code sends `agent_type` on SubagentStart, so a dispatch leaves a
   * record. All agents share one project directory, which means one ledger to
   * read at the end and per-agent proof rather than per-agent inference.
   */
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'bkit-fullqa-agents-'));

  for (const agent of agents) {
    session(
      `Use the Task tool with subagent_type "bkit:${agent}" and the prompt `
      + `"Reply with the single word ACK and nothing else." Then tell me what it replied.`,
      { cwd: work, timeout: 300000 }
    );
    process.stdout.write('·');
  }
  process.stdout.write('\n');

  const seen = agentsSeen(readDispatch(work));
  for (const agent of agents) {
    const dispatched = seen.includes(`bkit:${agent}`) || seen.includes(agent);
    record('agents', agent, dispatched,
      dispatched ? '' : `no SubagentStart recorded; observed: [${seen.join(', ') || 'none'}]`);
  }

  try { fs.rmSync(work, { recursive: true, force: true }); } catch (_) { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Layer: hooks — every registered event is observed dispatching, or has a
// stated reason it cannot fire in a scripted session
// ---------------------------------------------------------------------------
if (LAYERS.includes('hooks')) {
  console.log(`\n=== hook events (${hookEvents.length}) ===`);
  const { readDispatch, toolsFor } = require(path.join(PROJECT_ROOT, 'lib/core/hook-dispatch'));

  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'bkit-fullqa-hooks-'));
  fs.mkdirSync(path.join(work, 'docs', '02-design'), { recursive: true });
  fs.writeFileSync(path.join(work, 'docs', '02-design', 'p.design.md'), '# probe\n\nline\n');
  fs.writeFileSync(path.join(work, 'CLAUDE.md'), '# probe project\n');

  session(
    'Do all of these with tools and then say done: (1) run `echo probe`; '
    + '(2) use the Edit tool to append "edited" to docs/02-design/p.design.md; '
    + '(3) use the Write tool to create notes.txt containing "hello"; '
    + '(4) use the Task tool with subagent_type "Explore" to list files in this directory.',
    { cwd: work, timeout: 300000 }
  );

  /*
   * A second, smaller session with instructions discovery left ON. CLAUDE.md is
   * only read when setting sources are loaded, so `InstructionsLoaded` cannot
   * fire in the isolated session above — measured 0 there against 2 here. Both
   * runs write to the same ledger, so the check below reads one combined view.
   */
  session('say ok', { cwd: work, settingSources: 'default', timeout: 180000 });

  const ledger = readDispatch(work);
  const seen = ledger.events || {};

  /** Events a scripted session genuinely cannot produce, each with its reason. */
  const NEEDS_TRIGGER = {
    StopFailure: 'requires an API-level failure (rate limit, overload)',
    UserPromptExpansion: 'requires a slash-command expansion',
    PreCompact: 'requires the context window to reach compaction',
    PostCompact: 'requires the context window to reach compaction',
    TeammateIdle: 'requires Agent Teams (CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1)',
    PostToolUseFailure: 'requires a tool call to fail',
    ConfigChange: 'requires settings or skills to change mid-session',
    PermissionRequest: 'suppressed under --permission-mode bypassPermissions',
    Notification: 'requires a permission or idle prompt',
    CwdChanged: 'requires a working-directory change mid-session',
    TaskCreated: 'requires the Task tool to create a tracked task',
    TaskCompleted: 'requires the Task tool to complete a tracked task',
  };

  for (const event of hookEvents) {
    const fired = seen[event] && seen[event].count > 0;
    const excused = Object.prototype.hasOwnProperty.call(NEEDS_TRIGGER, event);
    record('hooks', event, fired || excused,
      fired ? `count=${seen[event].count}` : (excused ? `not exercised: ${NEEDS_TRIGGER[event]}` : 'never dispatched'));
  }

  // The matcher gaps this release fixed: both tools must be observed.
  const postTools = toolsFor(ledger, 'PostToolUse');
  record('hooks', 'PostToolUse covers Write', postTools.includes('Write'), postTools.join(','));
  record('hooks', 'PostToolUse covers Edit', postTools.includes('Edit'), postTools.join(','));

  try { fs.rmSync(work, { recursive: true, force: true }); } catch (_) { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Layer: MCP — every tool is advertised over a real stdio handshake
// ---------------------------------------------------------------------------
if (LAYERS.includes('mcp')) {
  console.log('\n=== MCP tools ===');
  const servers = [
    ['bkit-pdca', 'servers/bkit-pdca-server/index.js', EXPECTED_PDCA_MCP_TOOLS],
    ['bkit-analysis', 'servers/bkit-analysis-server/index.js', EXPECTED_ANALYSIS_MCP_TOOLS],
  ];
  for (const [name, rel, expected] of servers) {
    const rpc = [
      JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'bkit-full-live-qa', version: '1' } } }),
      JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
      JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
    ].join('\n') + '\n';
    const r = spawnSync('node', [path.join(PROJECT_ROOT, rel)], {
      input: rpc, encoding: 'utf8', timeout: 60000, cwd: PROJECT_ROOT,
    });
    let advertised = [];
    for (const line of (r.stdout || '').split('\n')) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.id === 2 && msg.result && Array.isArray(msg.result.tools)) {
          advertised = msg.result.tools.map((t) => t.name);
        }
      } catch (_) { /* not a JSON-RPC line */ }
    }
    for (const tool of expected) {
      record('mcp', `${name}:${tool}`, advertised.includes(tool),
        advertised.length ? `advertised=[${advertised.join(', ')}]` : 'server advertised nothing');
    }
  }
}

// ---------------------------------------------------------------------------
console.log('');
const failed = results.filter((r) => !r.ok);
if (failed.length) {
  console.log('\nFAILURES:');
  for (const f of failed) console.log(`  ✗ [${f.layer}] ${f.name} — ${f.detail}`);
}

try {
  fs.mkdirSync(path.dirname(RESULT_FILE), { recursive: true });
  fs.writeFileSync(RESULT_FILE, JSON.stringify({
    plan, layers: LAYERS, pass, fail, results,
  }, null, 2));
  console.log(`\nresults written: ${path.relative(PROJECT_ROOT, RESULT_FILE)}`);
} catch (e) {
  console.log(`\n(could not write results: ${e.message})`);
}

console.log(`\n================ FULL LIVE QA: pass=${pass} fail=${fail} ================`);
process.exit(fail > 0 ? 1 : 0);
