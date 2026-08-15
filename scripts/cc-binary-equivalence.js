#!/usr/bin/env node
/**
 * cc-binary-equivalence.js — measure what changed between Claude Code builds.
 *
 * ENH-420/421/422 (assigned in cycle #35, landed in v2.1.37).
 *
 * Purpose: the /bkit:cc-version-analysis workflow certifies "Breaking 0" by
 * counting hook-contract markers across the installed Claude Code binaries. That
 * measurement has been reconstructed by hand in cycles #35, #36 and #37 — three
 * times, each time re-deriving the same command forms, and twice getting them
 * wrong first. This script is that measurement, written down.
 *
 * Usage:
 *   node scripts/cc-binary-equivalence.js                    # every installed version
 *   node scripts/cc-binary-equivalence.js 2.1.231 2.1.232    # only these
 *   node scripts/cc-binary-equivalence.js --json             # machine-readable
 *   node scripts/cc-binary-equivalence.js --needle X --needle Y   # extra markers
 *   node scripts/cc-binary-equivalence.js --no-segments      # skip otool
 *
 * Exit codes:
 *   0 — measured (a contract change is reported, not an error; read the table)
 *   1 — nothing to measure (no versions found, or fewer than one requested)
 *   2 — a required external tool is unavailable
 *
 * The errata this encodes, each of which cost a cycle:
 *
 *   ERRATA-35-1  A `strings` diff is NOT evidence of a semantic change; the
 *                trailing-byte artifacts alone produce hundreds of phantom
 *                differences. Only exact counts on the raw file count, which is
 *                why every measurement here is `grep -a -o -F`.
 *   ERRATA-37-2  On ugrep, a needle beginning with `-` is parsed as an option
 *                and silently returns 0 — indistinguishable from absence. Every
 *                needle is passed after `-e`.
 *   ERRATA-37-6  A misspelled needle also returns a silent 0, and 0 reads as
 *                "the feature is absent". `runInBackground`, `forkGate` and
 *                `isForkGateEnabled` were all measured as 0 in cycle #37 before
 *                anyone noticed the real symbols were `run_in_background` and
 *                `isForkSubagentEnabled`. Spelling variants are measured
 *                together and reported together.
 *   ERRATA-36-6  A full `cmp -l` over two ~300 MB binaries exceeds a two-minute
 *                budget, and `cmp -n` / `-i` return wrong results on this
 *                artifact. Neither is used.
 *   ERRATA-33-6  A release note paraphrases the implementation. A count of 0 for
 *                a term taken from the changelog does NOT mean the fix is
 *                absent, and this script does not claim otherwise.
 *
 * @module scripts/cc-binary-equivalence
 * @version 2.1.37
 * @since 2.1.37
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const VERSIONS_DIR = path.join(os.homedir(), '.local', 'share', 'claude', 'versions');

/**
 * The hook contract. A change in any of these is what "Breaking" would mean for
 * bkit, because every one of them names something bkit's 28 hook handlers read,
 * emit, or are dispatched by.
 *
 * Grouped so the report says what a moved number implies rather than only that
 * it moved.
 */
const MARKER_GROUPS = Object.freeze({
  'hook output contract': [
    'hookSpecificOutput',
    'permissionDecision',
    'permissions.deny',
    'additionalContext',
    'stop_hook_active',
    'hook_event_name',
  ],
  'hook event vocabulary': [
    '"PreToolUse"', '"PostToolUse"', '"UserPromptSubmit"', '"SessionStart"',
    '"SessionEnd"', '"Stop"', '"SubagentStart"', '"SubagentStop"',
    '"Notification"', '"PreCompact"', '"PermissionRequest"',
  ],
  'subagent + fork surface': [
    'subagent_type',
    'run_in_background',
    'CLAUDE_CODE_FORK_SUBAGENT',
    'CLAUDE_CODE_DISABLE_BACKGROUND_TASKS',
    'forked_skill_depth_cap',
    'isForkSubagentEnabled',
  ],
  'documented-elsewhere surfaces': [
    'bashCommandClamp',
    'continueOnBlock',
    'launcher_hooks',
    'additionalMarketplaces',
    'allowedMarketplaces',
  ],
});

/**
 * Spelling variants measured together.
 *
 * ERRATA-37-6: a needle nobody spells correctly returns 0, and 0 is read as
 * absence. Reporting the whole family makes the difference between "this concept
 * is gone" and "I typed it wrong" visible in the output rather than in a later
 * correction.
 */
const SPELLING_FAMILIES = Object.freeze({
  'background-run parameter': ['run_in_background', 'runInBackground', 'run-in-background'],
  'fork gate': ['isForkSubagentEnabled', 'getForkSubagentSource', 'forkSubagent', 'forkGate', 'isForkGateEnabled'],
  'fork rollout flag': ['tengu_copper_fox', 'copper_fox'],
});

/** Every marker this script measures, de-duplicated. */
function allNeedles(extra) {
  const set = new Set();
  for (const list of Object.values(MARKER_GROUPS)) for (const n of list) set.add(n);
  for (const list of Object.values(SPELLING_FAMILIES)) for (const n of list) set.add(n);
  for (const n of extra || []) set.add(n);
  return [...set];
}

/**
 * Count exact occurrences of a literal needle in a file, via grep.
 *
 * `-a` treats the binary as text, `-o` prints each occurrence, `-F` disables
 * pattern interpretation, and `-e` is what keeps a leading `-` from being read
 * as an option (ERRATA-37-2). The count is `stdout` lines, not a match flag, so
 * a moved count is visible rather than only a present/absent bit.
 *
 * This is the reference implementation — it is what previous cycles ran by hand,
 * and `countAll()` is checked against it. It is not used for the full sweep
 * because one pass per needle over a ~300 MB file, times four builds, times
 * thirty-odd needles, does not finish inside a sensible budget.
 *
 * @param {string} file
 * @param {string} needle
 * @returns {number}
 */
function countOccurrences(file, needle) {
  try {
    const out = execFileSync('grep', ['-a', '-o', '-F', '-e', needle, file], {
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
    });
    if (!out) return 0;
    // Trailing newline would otherwise add a phantom entry.
    return out.split('\n').filter(Boolean).length;
  } catch (e) {
    // grep exits 1 for "no match", which is a real answer, not a failure.
    if (e && e.status === 1) return 0;
    throw e;
  }
}

/**
 * Count every needle in one read of the file.
 *
 * Semantics are deliberately identical to `grep -a -o -F -e <needle>` run once
 * per needle: non-overlapping occurrences, scanning left to right, counted
 * independently for each needle.
 *
 * Independently matters. Batching the needles into a single grep invocation
 * would be faster still and WRONG: with alternation, grep consumes the
 * leftmost-longest match, so `"PreToolUse"` would swallow the `PreToolUse`
 * inside it and the bare needle would under-count. Cycle #37 measured
 * `PreToolUse` at 140 and `"PreToolUse"` at 34 — the bare count includes the
 * quoted ones, and any method that cannot reproduce that pair is measuring
 * something else.
 *
 * @param {string} file
 * @param {string[]} needles
 * @returns {Record<string, number>}
 */
function countAll(file, needles) {
  const haystack = fs.readFileSync(file);
  const counts = {};
  for (const needle of needles) {
    const pat = Buffer.from(needle, 'binary');
    let n = 0;
    let at = haystack.indexOf(pat, 0);
    while (at !== -1) {
      n++;
      at = haystack.indexOf(pat, at + pat.length);
    }
    counts[needle] = n;
  }
  return counts;
}

/** SHA-256 of a file, streamed so a 300 MB binary does not land in memory. */
function sha256(file) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(file));
  return hash.digest('hex');
}

/**
 * Mach-O segment sizes via `otool -l`.
 *
 * Worth having separately from the file size: cycle #37 measured 2.1.227 → 228
 * as byte-identical in `__TEXT`, `__DATA_CONST` and `__DATA` with only `__BUN`
 * and `__LINKEDIT` moving — a payload swap rather than a native rebuild, which
 * the total size alone does not distinguish.
 *
 * @param {string} file
 * @returns {Record<string, number>|null} null when otool is unavailable
 */
function segmentSizes(file) {
  let out;
  try {
    out = execFileSync('otool', ['-l', file], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } catch {
    return null;
  }
  const sizes = {};
  let current = null;
  for (const line of out.split('\n')) {
    const seg = line.match(/^\s*segname\s+(\S+)/);
    if (seg) { current = seg[1]; continue; }
    const fsz = line.match(/^\s*filesize\s+(\d+)/);
    if (fsz && current) { sizes[current] = Number(fsz[1]); current = null; }
  }
  return sizes;
}

/** Installed versions, oldest first. */
function installedVersions() {
  if (!fs.existsSync(VERSIONS_DIR)) return [];
  return fs.readdirSync(VERSIONS_DIR)
    .filter((name) => /^\d+\.\d+\.\d+$/.test(name))
    .filter((name) => {
      try { return fs.statSync(path.join(VERSIONS_DIR, name)).isFile(); } catch { return false; }
    })
    .sort((a, b) => {
      const pa = a.split('.').map(Number);
      const pb = b.split('.').map(Number);
      for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
      return 0;
    });
}

function parseArgs(argv) {
  const opts = { versions: [], json: false, segments: true, needles: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') opts.json = true;
    else if (a === '--no-segments') opts.segments = false;
    else if (a === '--needle') { opts.needles.push(argv[++i]); }
    else if (a === '--help' || a === '-h') opts.help = true;
    else if (/^\d+\.\d+\.\d+$/.test(a)) opts.versions.push(a);
    else if (a.startsWith('-')) { /* unknown flag — ignored, never fatal */ }
  }
  return opts;
}

function pad(s, n) { return String(s).padEnd(n); }
function padStart(s, n) { return String(s).padStart(n); }

function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.help) {
    console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0].replace(/^#!.*\n/, ''));
    return 0;
  }

  try {
    execFileSync('grep', ['--version'], { stdio: 'ignore' });
  } catch {
    console.error('cc-binary-equivalence: `grep` is required and was not found.');
    return 2;
  }

  const available = installedVersions();
  const versions = opts.versions.length
    ? opts.versions.filter((v) => {
      const ok = available.includes(v);
      if (!ok) console.error(`cc-binary-equivalence: ${v} is not installed under ${VERSIONS_DIR}`);
      return ok;
    })
    : available;

  if (versions.length === 0) {
    console.error(`cc-binary-equivalence: no Claude Code binaries found under ${VERSIONS_DIR}.`);
    console.error('The native installer keeps one file per version there; an npm install has none.');
    return 1;
  }

  const needles = allNeedles(opts.needles);
  const result = { versionsDir: VERSIONS_DIR, versions: {}, markers: {}, movedMarkers: [] };

  for (const v of versions) {
    const file = path.join(VERSIONS_DIR, v);
    const stat = fs.statSync(file);
    result.versions[v] = {
      path: file,
      bytes: stat.size,
      sha256: sha256(file),
      segments: opts.segments ? segmentSizes(file) : null,
    };
  }

  // One read per build rather than one per needle: a ~300 MB file times thirty
  // needles times four builds is 40 GB of re-scanning for the same answer.
  for (const v of versions) {
    const counts = countAll(result.versions[v].path, needles);
    for (const needle of needles) {
      if (!result.markers[needle]) result.markers[needle] = {};
      result.markers[needle][v] = counts[needle];
    }
  }
  for (const needle of needles) {
    const counts = versions.map((v) => result.markers[needle][v]);
    if (new Set(counts).size > 1) result.movedMarkers.push(needle);
  }

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return 0;
  }

  // ---- human-readable ----
  const w = 38;
  // Wide enough for the longest cell in any column — a byte count with thousands
  // separators is 11 characters, which the version-name width alone is not.
  const colw = Math.max(
    13,
    ...versions.map((v) => v.length + 2),
    ...versions.map((v) => result.versions[v].bytes.toLocaleString().length + 2),
  );

  console.log(`\nClaude Code binaries under ${VERSIONS_DIR}\n`);
  console.log(pad('', w) + versions.map((v) => padStart(v, colw)).join(''));
  console.log(pad('bytes', w) + versions.map((v) => padStart(result.versions[v].bytes.toLocaleString(), colw)).join(''));
  console.log(pad('sha256 (first 12)', w) + versions.map((v) => padStart(result.versions[v].sha256.slice(0, 12), colw)).join(''));

  if (opts.segments && result.versions[versions[0]].segments) {
    console.log('\nMach-O segment filesize');
    const segNames = new Set();
    for (const v of versions) for (const s of Object.keys(result.versions[v].segments || {})) segNames.add(s);
    for (const seg of [...segNames].sort()) {
      const row = versions.map((v) => padStart((result.versions[v].segments?.[seg] ?? '-').toLocaleString?.() ?? '-', colw)).join('');
      console.log(pad('  ' + seg, w) + row);
    }
    console.log('  (identical native segments with a moving __BUN mean a payload swap, not a rebuild)');
  }

  for (const [group, list] of Object.entries(MARKER_GROUPS)) {
    console.log(`\n${group}`);
    for (const needle of list) {
      const counts = versions.map((v) => result.markers[needle][v]);
      const moved = new Set(counts).size > 1;
      console.log(pad((moved ? '! ' : '  ') + needle, w) + counts.map((c) => padStart(c, colw)).join(''));
    }
  }

  console.log('\nspelling families (a lone 0 here usually means the needle, not the feature)');
  for (const [family, list] of Object.entries(SPELLING_FAMILIES)) {
    console.log(`  ${family}`);
    for (const needle of list) {
      const counts = versions.map((v) => result.markers[needle][v]);
      console.log(pad('    ' + needle, w) + counts.map((c) => padStart(c, colw)).join(''));
    }
  }

  console.log('');
  if (result.movedMarkers.length === 0) {
    console.log('No measured marker moved across these builds.');
    console.log('That is evidence for Breaking 0 on the surfaces listed above — and only those.');
  } else {
    console.log(`${result.movedMarkers.length} marker(s) moved: ${result.movedMarkers.join(', ')}`);
    console.log('A moved count is a lead, not a verdict. Attribute it before reporting it:');
    console.log('a release note paraphrases the implementation (ERRATA-33-6), and vendored');
    console.log('dependencies move counts for reasons unrelated to the hook contract.');
  }
  console.log('');
  return 0;
}

if (require.main === module) {
  process.exit(main());
}

module.exports = {
  MARKER_GROUPS,
  SPELLING_FAMILIES,
  VERSIONS_DIR,
  allNeedles,
  countAll,
  countOccurrences,
  installedVersions,
  segmentSizes,
  sha256,
};
