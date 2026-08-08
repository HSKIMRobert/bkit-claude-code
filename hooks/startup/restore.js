/**
 * bkit Vibecoding Kit - SessionStart: Restore Module (v2.0.0)
 *
 * Handles PLUGIN_DATA restoration, corrupted file detection,
 * and backup integrity verification.
 */

const { debugLog } = require('../../lib/core/debug');

/**
 * Run PLUGIN_DATA restore.
 * Restores state files from ${CLAUDE_PLUGIN_DATA} backup if primary files are missing.
 * @param {object} _input - Hook input (unused, reserved for future use)
 * @returns {{ restored: string[], errors: string[] }} Restore result
 */
function run(_input) {
  const result = { restored: [], errors: [] };

  try {
    const { restoreFromPluginData } = require('../../lib/core/paths');
    const restoreResult = restoreFromPluginData();
    if (restoreResult.restored.length > 0) {
      debugLog('SessionStart', 'Restored from PLUGIN_DATA backup', {
        restored: restoreResult.restored
      });
      result.restored = restoreResult.restored;
    }
    /*
     * ENH-383 (v2.1.33): surface why a restore did not happen.
     *
     * `restoreFromPluginData()` has always returned a `skipped` array with the
     * reason, and every caller discarded it. The most important reason — that
     * the shared backup directory now holds a different project's state, which
     * before v2.1.33 meant this project's backup had been overwritten and lost
     * — was computed, returned, and thrown away at every call site. Users saw
     * a session start with no state and no explanation.
     *
     * Routine cases ("no backup directory" on a fresh install) stay in the
     * debug log; anything describing a conflict is promoted so it reaches the
     * caller's result and can be shown.
     */
    const skipped = Array.isArray(restoreResult.skipped) ? restoreResult.skipped : [];
    if (skipped.length > 0) {
      debugLog('SessionStart', 'PLUGIN_DATA restore skipped', { skipped });
      const notable = skipped.filter((s) => !/^no backup directory$/i.test(s));
      if (notable.length > 0) {
        result.warnings = (result.warnings || []).concat(notable);
      }
    }
  } catch (e) {
    debugLog('SessionStart', 'PLUGIN_DATA restore skipped', { error: e.message });
    result.errors.push(e.message);
  }

  return result;
}

module.exports = { run };
