#!/usr/bin/env node
/**
 * subagent-start-handler.js - SubagentStart Hook Handler (v1.5.3)
 *
 * Subagent가 spawn될 때:
 * 1. Call initAgentState() if agent-state.json doesn't exist
 * 2. Register new teammate via addTeammate()
 * 3. status: "spawning"
 *
 * Design Reference: docs/02-design/features/team-visibility.design.md Section 5.1
 */


// v2.1.12 Sprint C-2 (#9/#10/#8): bare-require guard — when this script
// is require()-d instead of executed as a hook entrypoint, return
// immediately so no stale stdout (decisions, advisory messages) is emitted
// without a real hook payload. CommonJS module body is implicitly an IIFE,
// so top-level return is valid.
if (require.main !== module) { module.exports = {}; return; }

const path = require('path');
const { readStdinSync, outputAllow } = require('../lib/core/io');
const { debugLog } = require('../lib/core/debug');
const { getPdcaStatusFull } = require('../lib/pdca/status');

const KNOWN_MODEL_TIERS = ['opus', 'sonnet', 'haiku', 'fable'];
const DEFAULT_MODEL_TIER = 'sonnet';

/**
 * ENH-376 — Resolve a teammate's model tier from its agent definition.
 *
 * CC does not include `model` in the SubagentStart payload (verified against
 * CC v2.1.220), so the previous `hookContext.model || … || 'sonnet'` chain
 * always resolved to 'sonnet' and mislabelled every non-sonnet agent — 18 of
 * bkit's 34 ship as opus/fable/haiku. The agent's own frontmatter is the
 * authoritative source, so read it instead of guessing.
 *
 * `agent_type` arrives either bare ("gap-detector") or plugin-namespaced
 * ("bkit:gap-detector"); both map to `agents/<name>.md`.
 *
 * Fail-open: an unreadable or unknown agent falls back to the previous default
 * so the roster still renders.
 *
 * @param {string} agentType
 * @returns {string} one of KNOWN_MODEL_TIERS
 */
function resolveAgentModel(agentType) {
  if (!agentType || typeof agentType !== 'string') return DEFAULT_MODEL_TIER;
  const bare = agentType.includes(':') ? agentType.split(':').pop() : agentType;
  if (!/^[a-z0-9-]+$/i.test(bare)) return DEFAULT_MODEL_TIER;
  try {
    const { parseFrontmatterFile } = require('../lib/util/frontmatter');
    const fm = parseFrontmatterFile(path.join(__dirname, '..', 'agents', `${bare}.md`));
    const declared = typeof fm.model === 'string' ? fm.model.trim() : '';
    return KNOWN_MODEL_TIERS.includes(declared) ? declared : DEFAULT_MODEL_TIER;
  } catch (_) {
    return DEFAULT_MODEL_TIER;
  }
}

function main() {
  debugLog('SubagentStart', 'Hook started');

  let hookContext = {};
  try {
    const input = readStdinSync();
    hookContext = typeof input === 'string' ? JSON.parse(input) : input;
  } catch (e) {
    debugLog('SubagentStart', 'Failed to parse context', { error: e.message });
    outputAllow('SubagentStart processed.', 'SubagentStart');
    return;
  }

  // State writer lazy load (from team module)
  let stateWriter = null;
  try {
    const teamModule = require('../lib/team');
    stateWriter = {
      initAgentState: teamModule.initAgentState,
      addTeammate: teamModule.addTeammate,
      readAgentState: teamModule.readAgentState,
    };
  } catch (e) {
    debugLog('SubagentStart', 'State writer not available', { error: e.message });
    outputAllow('SubagentStart processed.', 'SubagentStart');
    return;
  }

  // Extract agent info from hook context.
  //
  // ENH-376: the SubagentStart payload is narrower than this handler assumed.
  // Captured verbatim on CC v2.1.220 (depth-1 and depth-2 spawns produce an
  // identical field set):
  //   session_id, transcript_path, cwd, prompt_id, agent_id, agent_type,
  //   hook_event_name
  // There is no `agent_name`, no `model`, no `team_name` and no `tool_input`.
  // Every fallback chain that reached for those therefore always landed on its
  // last branch: the roster displayed the opaque agent_id as the teammate name,
  // every teammate was labelled 'sonnet' regardless of its actual pin (18 of
  // bkit's 34 agents are not sonnet), currentTask was always null, and the team
  // name was always ''.
  //
  // `agent_id` is a per-instance opaque handle (e.g. "add73775f6d1701e0") and
  // `agent_type` is the readable agent name (e.g. "gap-detector"). So identity
  // comes from agent_id and display comes from agent_type.
  //
  // Note the payload carries no depth or parent field either — depth-1 and
  // depth-2 spawns are indistinguishable — so the roster is intentionally flat.
  // Reconstructing the nesting tree is not possible from this event.
  const agentId = hookContext.agent_id || null;
  const agentType = hookContext.agent_type || 'agent';
  // Display name: prefer the readable type, fall back to the id only when CC
  // omitted the type.
  const agentName = agentType !== 'agent' ? agentType : (agentId || 'unknown');
  const sessionId = hookContext.session_id || '';

  // Team name is not part of the SubagentStart contract; carry over whatever an
  // already-initialised state holds rather than overwriting it with ''.
  const teamName = '';

  // Model is not part of the SubagentStart contract either. Resolve it from the
  // agent definition instead of defaulting every teammate to 'sonnet'.
  const model = resolveAgentModel(agentType);

  // Initialize if agent-state.json doesn't exist
  const existingState = stateWriter.readAgentState();
  if (!existingState || !existingState.enabled) {
    const pdcaStatus = getPdcaStatusFull();
    const feature = pdcaStatus?.primaryFeature || '';
    const featureData = pdcaStatus?.features?.[feature];

    stateWriter.initAgentState(teamName, feature, {
      pdcaPhase: featureData?.phase || 'plan',
      orchestrationPattern: 'leader',
      ctoAgent: 'fable',
      sessionId,
    });
  }

  // Add teammate.
  //
  // ENH-376: `agentId` is the identity key — it is unique per spawned instance,
  // so two concurrent runs of the same agent (now reachable since CC v2.1.219
  // nests to depth 3) no longer collapse into one roster row. `name` stays the
  // readable label. `currentTask` is omitted rather than derived from
  // `tool_input`, which SubagentStart does not carry.
  try {
    stateWriter.addTeammate({
      id: agentId,
      name: agentName,
      role: agentType,
      model: model,
      currentTask: null,
    });
  } catch (e) {
    debugLog('SubagentStart', 'Failed to add teammate (non-fatal)', {
      error: e.message,
    });
  }

  const response = {
    systemMessage: `Subagent ${agentName} spawned`,
    hookSpecificOutput: {
      hookEventName: "SubagentStart",
      agentId,
      agentName,
      agentType,
      teamName,
    }
  };

  console.log(JSON.stringify(response));
  process.exit(0);
}

main();
