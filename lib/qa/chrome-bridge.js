/**
 * Chrome MCP Bridge — Wrapper for Chrome MCP tools with availability check
 * @module lib/qa/chrome-bridge
 * @version 2.1.1
 *
 * Provides graceful fallback when Chrome MCP is not available.
 * Used by qa-lead agent for L3-L5 test execution.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

let _core = null;
function getCore() {
  if (!_core) { _core = require('../core'); }
  return _core;
}

/** Chrome MCP tool names exposed to qa-lead for L3-L5. */
const CHROME_MCP_TOOLS = [
  'tabs_create_mcp', 'navigate', 'form_input', 'find',
  'get_page_text', 'read_console_messages', 'read_network_requests',
  'gif_creator',
];

/** Server-name fragment that identifies the Chrome MCP server. */
const CHROME_SERVER_HINT = 'claude-in-chrome';

/**
 * @typedef {Object} ChromeAvailability
 * @property {boolean} available - Chrome MCP is accessible
 * @property {string} reason - Availability reason
 * @property {string[]} tools - Available Chrome MCP tool names
 * @property {string} source - Which detection strategy decided the answer
 */

function _projectDir() {
  return process.env.CLAUDE_PROJECT_DIR || process.cwd();
}

function _readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    return null;
  }
}

/**
 * Look for a Chrome MCP server registration in the files that declare MCP
 * servers. Config presence means "configured", not "connected" — it is weaker
 * evidence than the runtime probe, which is why it is checked last.
 * @returns {boolean}
 * @private
 */
function _configDeclaresChrome() {
  const root = _projectDir();
  const candidates = [
    path.join(root, '.mcp.json'),
    path.join(root, '.claude', 'settings.json'),
    path.join(root, '.claude', 'settings.local.json'),
    path.join(os.homedir(), '.claude.json'),
    path.join(os.homedir(), '.claude', 'settings.json'),
  ];

  for (const file of candidates) {
    const json = _readJson(file);
    if (!json) continue;

    const names = [
      ...Object.keys(json.mcpServers || {}),
      ...(Array.isArray(json.enabledMcpjsonServers) ? json.enabledMcpjsonServers : []),
    ];
    if (names.some((n) => String(n).includes(CHROME_SERVER_HINT))) return true;

    // ~/.claude.json nests per-project overrides one level down.
    const projects = json.projects && typeof json.projects === 'object' ? json.projects : {};
    for (const entry of Object.values(projects)) {
      const nested = Object.keys((entry && entry.mcpServers) || {});
      if (nested.some((n) => String(n).includes(CHROME_SERVER_HINT))) return true;
    }
  }
  return false;
}

/**
 * Check Chrome MCP availability.
 *
 * Detection used to be a single line — `process.env.MCP_SERVERS` — and Claude
 * Code does not set that variable. It was therefore false on every run, so
 * L3/L4/L5 were skipped 100% of the time even with Chrome MCP connected, and
 * qa-lead's own docs described that skip as normal fallback, which made a
 * permanently-dark half of the test matrix look like a feature.
 *
 * Strategies, most authoritative first:
 *   1. Runtime probe recorded by qa-lead in `.bkit/runtime/qa-capabilities.json`.
 *      Only the agent holds the Chrome MCP tools, so only the agent can observe
 *      whether they actually answer. A hook process cannot.
 *   2. `BKIT_CHROME_MCP=1|0` — explicit operator override, both directions.
 *   3. `MCP_SERVERS` env (kept for back-compat with any harness that sets it).
 *   4. MCP config files declaring a `claude-in-chrome` server.
 *
 * @returns {ChromeAvailability}
 */
function checkChromeAvailable() {
  const { debugLog } = getCore();

  const decide = (available, reason, source) => {
    debugLog('QA-Chrome', available ? 'Chrome MCP available' : 'Chrome MCP not available',
      { reason, source });
    return { available, reason, source, tools: available ? CHROME_MCP_TOOLS : [] };
  };

  // Strategy 1: runtime probe written by qa-lead (ground truth)
  const cap = _readJson(path.join(_projectDir(), '.bkit', 'runtime', 'qa-capabilities.json'));
  if (cap && cap.chromeMcp && typeof cap.chromeMcp.available === 'boolean') {
    return decide(
      cap.chromeMcp.available,
      `Runtime probe by qa-lead at ${cap.chromeMcp.checkedAt || 'unknown time'}`,
      'runtime-probe'
    );
  }

  // Strategy 2: explicit override
  const override = (process.env.BKIT_CHROME_MCP || '').trim().toLowerCase();
  if (override === '1' || override === 'true') {
    return decide(true, 'BKIT_CHROME_MCP override set to on', 'env-override');
  }
  if (override === '0' || override === 'false') {
    return decide(false, 'BKIT_CHROME_MCP override set to off', 'env-override');
  }

  // Strategy 3: MCP_SERVERS env (back-compat)
  if ((process.env.MCP_SERVERS || '').includes(CHROME_SERVER_HINT)) {
    return decide(true, 'Chrome MCP detected via MCP_SERVERS environment', 'env-mcp-servers');
  }

  // Strategy 4: MCP config files
  if (_configDeclaresChrome()) {
    return decide(true, 'Chrome MCP server declared in MCP configuration', 'mcp-config');
  }

  return decide(
    false,
    'Chrome MCP (claude-in-chrome) not found via runtime probe, override, environment, or MCP config',
    'none'
  );
}

/**
 * Record the result of a live Chrome MCP probe.
 *
 * qa-lead calls this (or writes the same file) once it has actually tried a
 * Chrome MCP tool, turning a guess into an observation for every later reader.
 *
 * @param {boolean} available - Whether Chrome MCP tools responded
 * @param {Object} [details] - Optional extra context to persist
 * @returns {boolean} Whether the capability file was written
 */
function recordChromeProbe(available, details = {}) {
  const { debugLog } = getCore();
  const file = path.join(_projectDir(), '.bkit', 'runtime', 'qa-capabilities.json');
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const current = _readJson(file) || {};
    current.chromeMcp = {
      available: !!available,
      checkedAt: new Date().toISOString(),
      ...details,
    };
    fs.writeFileSync(file, JSON.stringify(current, null, 2));
    return true;
  } catch (e) {
    debugLog('QA-Chrome', 'Failed to record Chrome probe', { error: e && e.message });
    return false;
  }
}

/**
 * @typedef {Object} ChromeBridge
 * @property {boolean} available
 * @property {function(string): Promise<Object>} navigate - Navigate to URL
 * @property {function(string, string): Promise<Object>} formInput - Input to form
 * @property {function(string): Promise<string>} getPageText - Get page text
 * @property {function(): Promise<string[]>} getConsoleMessages - Read console
 * @property {function(): Promise<Object[]>} getNetworkRequests - Read network
 * @property {function(): Promise<void>} noop - No-op for unavailable state
 */

/**
 * Create Chrome bridge instance
 * Returns noop functions when Chrome is unavailable (graceful degradation)
 *
 * @returns {ChromeBridge}
 */
function createChromeBridge() {
  const status = checkChromeAvailable();

  if (!status.available) {
    return {
      available: false,
      navigate: async () => ({ success: false, reason: 'Chrome MCP unavailable' }),
      formInput: async () => ({ success: false, reason: 'Chrome MCP unavailable' }),
      getPageText: async () => '',
      getConsoleMessages: async () => [],
      getNetworkRequests: async () => [],
      noop: async () => {},
    };
  }

  // When available, Chrome MCP tools are invoked by qa-lead agent directly
  // This bridge provides the availability status for test-runner decisions
  return {
    available: true,
    navigate: async (url) => ({ success: true, url }),
    formInput: async (selector, value) => ({ success: true, selector, value }),
    getPageText: async () => '(delegated to qa-lead Chrome MCP tools)',
    getConsoleMessages: async () => [],
    getNetworkRequests: async () => [],
    noop: async () => {},
  };
}

module.exports = {
  CHROME_MCP_TOOLS,
  checkChromeAvailable,
  recordChromeProbe,
  createChromeBridge,
};
