#!/usr/bin/env node
'use strict';

/**
 * scripts/lint-skill-md.js — v2.1.19 S2 F2-5 SKILL.md authoring linter
 *
 * Invoked by PreToolUse hook (hooks/hooks.json `if: Write(skills/*\/SKILL.md)`)
 * when a SKILL.md file is being written. Performs invariant check using the
 * F2-2 checker logic (scripts/check-skills-docs-code-sync.js). On failure,
 * emits stderr warning (does NOT block write — F2-5 design ADR S2-004).
 *
 * Usage (as hook): node scripts/lint-skill-md.js (reads PreToolUse JSON from stdin)
 * Usage (manual):  node scripts/lint-skill-md.js --skill <name>
 *
 * Exit: 0 always (warning-only, never blocks write).
 */

const path = require('path');
const { readStdinSync } = require('../lib/core/io');

// v2.1.32: resolve the checker from this script's own directory, not
// `process.cwd()`.
//
// The checker is one of bkit's own modules, but cwd is the *user's* project. The
// previous `require(path.join(process.cwd(), 'scripts/check-skills-docs-code-sync.js'))`
// therefore only resolved when Claude Code happened to be running inside the
// bkit repository itself. In any other project this threw MODULE_NOT_FOUND at
// module load — before main() could run — so the hook exited 1 with an uncaught
// stack trace on every `Write` to a `skills/*/SKILL.md` path, contradicting the
// "Exit: 0 always (warning-only, never blocks write)" contract documented above.
//
// Loaded lazily and guarded so that a checker that is missing or fails to load
// degrades to a silent no-op, which is what a warning-only linter should do.
let _checker = null;
let _checkerLoadFailed = false;

function getChecker() {
  if (_checker || _checkerLoadFailed) return _checker;
  try {
    _checker = require(path.join(__dirname, 'check-skills-docs-code-sync.js'));
  } catch (_) {
    _checkerLoadFailed = true;
  }
  return _checker;
}

/*
 * v2.1.34: use the shared bounded reader instead of `fs.readFileSync(0)`.
 *
 * `fs.readFileSync(0, 'utf8')` blocks until stdin reaches EOF, with no timeout.
 * Claude Code can hold the write-end open well past a hook's own deadline —
 * that is issue #139, where a hook stalled a session for ~15 minutes. v2.1.30
 * replaced the pattern centrally in lib/core/io.js, but this handler kept its
 * own copy and so kept the stall. Going through the shared reader also stamps
 * the hook-dispatch ledger, which is what proves this hook is reachable at all.
 */
function readStdinJSON() {
  try {
    const payload = readStdinSync();
    return payload && Object.keys(payload).length > 0 ? payload : null;
  } catch (_) { return null; }
}

function extractSkillNameFromPath(filePath) {
  if (!filePath) return null;
  const m = filePath.match(/skills\/([\w-]+)\/SKILL\.md$/);
  return m ? m[1] : null;
}

function lintBySkillName(skillName) {
  if (!skillName) return { ok: true, warnings: ['no skill name resolved'] };
  const checker = getChecker();
  if (!checker || typeof checker.evaluateSkillInvariant !== 'function') {
    return { ok: true, skill: skillName, warnings: ['checker unavailable — lint skipped'] };
  }
  let result;
  try {
    result = checker.evaluateSkillInvariant(skillName);
  } catch (e) {
    return { ok: true, skill: skillName, warnings: [`checker threw: ${e.message}`] };
  }
  return {
    ok: result.invariantPass,
    skill: skillName,
    warnings: result.failures || [],
  };
}

function main() {
  // Manual mode: --skill <name>
  const args = process.argv.slice(2);
  const skillIdx = args.indexOf('--skill');
  if (skillIdx >= 0 && args[skillIdx + 1]) {
    const result = lintBySkillName(args[skillIdx + 1]);
    console.log(JSON.stringify(result, null, 2));
    process.exit(0); // warning-only mode
  }

  // Hook mode: read PreToolUse JSON from stdin
  const payload = readStdinJSON();
  if (!payload) {
    // No stdin input — silent no-op (graceful for direct invocation without args)
    process.exit(0);
  }
  // Extract file_path from tool_input
  const filePath = (payload.tool_input && payload.tool_input.file_path) || null;
  const skillName = extractSkillNameFromPath(filePath);
  if (!skillName) {
    // Not a SKILL.md write — silent pass
    process.exit(0);
  }
  const result = lintBySkillName(skillName);
  if (!result.ok) {
    process.stderr.write(`[bkit:lint-skill-md] ${skillName} SKILL.md invariant warning:\n`);
    for (const w of result.warnings) {
      process.stderr.write(`  - ${w}\n`);
    }
    process.stderr.write(`(warning only — write proceeds; see scripts/check-skills-docs-code-sync.js for full CI)\n`);
  }
  process.exit(0); // never block
}

if (require.main === module) main();

module.exports = { extractSkillNameFromPath, lintBySkillName };
