/**
 * enh-420-422-binary-equivalence.test.js — the binary measurement, written down.
 *
 * ENH-420/421/422 (assigned in cycle #35, landed in v2.1.37).
 *
 * The /bkit:cc-version-analysis workflow certifies "Breaking 0" by counting
 * hook-contract markers across installed Claude Code builds. Cycles #35, #36 and
 * #37 each rebuilt that measurement by hand, and twice got the command form
 * wrong before getting it right — a needle beginning with `-` swallowed as an
 * option, a misspelled symbol returning a silent 0 that read as absence. The
 * script exists so the fourth cycle starts from a measurement rather than from
 * a reconstruction.
 *
 * These tests skip when no Claude Code binaries are installed, which is the
 * usual case on a CI runner: the native installer keeps one file per version
 * under ~/.local/share/claude/versions, and an npm install has none. Skipping is
 * the honest outcome there — the alternative is a test that asserts nothing and
 * reports green.
 *
 * @module test/regression/enh-420-422-binary-equivalence.test
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const eq = require('../../scripts/cc-binary-equivalence');

const installed = eq.installedVersions();
const HAVE_BINARIES = installed.length > 0;
const skip = HAVE_BINARIES ? false : 'no Claude Code binaries installed under ~/.local/share/claude/versions';

test('the marker set names the surfaces bkit actually depends on', () => {
  // No binary needed: this is the contract the script measures.
  const all = eq.allNeedles([]);
  for (const required of [
    'hookSpecificOutput', 'permissionDecision', 'permissions.deny',
    '"PreToolUse"', '"PostToolUse"', '"SubagentStart"',
    'run_in_background', 'CLAUDE_CODE_FORK_SUBAGENT', 'forked_skill_depth_cap',
  ]) {
    assert.ok(all.includes(required), `marker set is missing ${required}`);
  }
});

test('spelling families exist so a silent 0 is legible', () => {
  // ERRATA-37-6: `runInBackground`, `forkGate` and `isForkGateEnabled` all
  // measured 0 in cycle #37, and 0 was read as "the feature is gone". The real
  // symbols were `run_in_background` and `isForkSubagentEnabled`. Reporting the
  // family together makes "I typed it wrong" distinguishable from "it is gone".
  const families = eq.SPELLING_FAMILIES;
  const flat = Object.values(families).flat();
  assert.ok(flat.includes('run_in_background') && flat.includes('runInBackground'),
    'the background-run family must carry both the real symbol and the plausible miss');
  assert.ok(flat.includes('isForkSubagentEnabled') && flat.includes('forkGate'),
    'the fork-gate family must carry both');
});

test('counting in one read agrees with the grep form previous cycles ran by hand', { skip }, () => {
  const file = path.join(eq.VERSIONS_DIR, installed[installed.length - 1]);
  /*
   * The overlapping pair is the load-bearing case. Batching every needle into a
   * single grep would be faster and wrong: with alternation grep takes the
   * leftmost-longest match, so `"PreToolUse"` swallows the `PreToolUse` inside
   * it and the bare needle under-counts. Any method that cannot reproduce both
   * numbers independently is measuring something else.
   */
  /*
   * Four needles, not twelve. Each grep pass reads ~300 MB, so the reference
   * side costs about six seconds per needle and this test would otherwise add a
   * minute and a half to every suite run. Four is enough to establish the
   * property: the overlapping pair, one ordinary marker, and one true zero —
   * a method that agrees on those agrees on the rest by construction, and the
   * full sweep is one `node scripts/cc-binary-equivalence.js` away.
   */
  const sample = ['PreToolUse', '"PreToolUse"', 'hookSpecificOutput', 'tengu_copper_fox'];
  const fast = eq.countAll(file, sample);
  for (const needle of sample) {
    assert.equal(fast[needle], eq.countOccurrences(file, needle),
      `countAll disagrees with grep for ${needle}`);
  }
  assert.ok(fast['PreToolUse'] > fast['"PreToolUse"'],
    'the bare needle must include the quoted occurrences, or the two are not being counted independently');
});

test('a needle that starts with a dash is measured, not parsed as an option', { skip }, () => {
  // ERRATA-37-2: on ugrep a leading `-` is read as a flag and the call returns 0
  // — which is indistinguishable from absence. `-e` is what prevents it.
  const file = path.join(eq.VERSIONS_DIR, installed[installed.length - 1]);
  const n = eq.countOccurrences(file, '--dangerously-skip-permissions');
  assert.ok(Number.isInteger(n) && n >= 0, 'a dash-leading needle must return a count, not throw');
});

test('segment sizes distinguish a payload swap from a native rebuild', { skip }, () => {
  // Cycle #37 measured 2.1.227 -> 228 as byte-identical in __TEXT, __DATA_CONST
  // and __DATA with only __BUN and __LINKEDIT moving. The total file size alone
  // does not tell those apart.
  const file = path.join(eq.VERSIONS_DIR, installed[installed.length - 1]);
  const segs = eq.segmentSizes(file);
  if (segs === null) return; // otool unavailable — not a failure of the script
  for (const required of ['__TEXT', '__BUN', '__LINKEDIT']) {
    assert.ok(Object.prototype.hasOwnProperty.call(segs, required), `missing segment ${required}`);
    assert.ok(Number.isInteger(segs[required]), `${required} filesize must be numeric`);
  }
});

test('the script is executable as a CLI and reports rather than throws', { skip }, () => {
  const { execFileSync } = require('node:child_process');
  const script = path.join(__dirname, '..', '..', 'scripts', 'cc-binary-equivalence.js');
  const out = execFileSync(process.execPath, [script, '--json', installed[installed.length - 1]], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  const parsed = JSON.parse(out);
  assert.ok(parsed.versions && parsed.markers, 'JSON output must carry versions and markers');
  assert.equal(typeof parsed.versions[installed[installed.length - 1]].sha256, 'string');
});

test('the script exists and is registered where a reader would look for it', () => {
  // ENH-420~422 were assigned in cycle #35 and produced nothing; cycle #37 found
  // the file still absent while reconstructing the same measurement by hand for
  // the third time. Asserting the file exists is what keeps that from recurring.
  const script = path.join(__dirname, '..', '..', 'scripts', 'cc-binary-equivalence.js');
  assert.ok(fs.existsSync(script), 'scripts/cc-binary-equivalence.js is missing');
  const src = fs.readFileSync(script, 'utf8');
  assert.match(src, /ERRATA-37-2/, 'the dash-needle erratum must be recorded where it is enforced');
  assert.match(src, /ERRATA-37-6/, 'the spelling erratum must be recorded where it is enforced');
  assert.match(src, /ERRATA-35-1/, 'the strings-diff erratum must be recorded');
});

// ---------------------------------------------------------------------------
// ENH-420 / ENH-422 — the protocol and the provenance record, which are the
// other two thirds of what cycle #35 assigned and cycle #37 found still absent.
// ---------------------------------------------------------------------------

test('ENH-420: the opaque-release protocol is written down in the skill', () => {
  // Cycle #35 met its first opaque release (CC v2.1.226: one non-specific
  // bullet), measured its way out, and assigned ENH-420 to record how. Two
  // cycles later the section was still missing, so cycle #37 re-derived the same
  // procedure by hand for the third time.
  const skill = fs.readFileSync(
    path.join(__dirname, '..', '..', 'skills', 'cc-version-analysis', 'SKILL.md'), 'utf8');
  assert.match(skill, /Opaque Release Protocol/i, 'the protocol section is missing');
  assert.match(skill, /cc-binary-equivalence\.js/,
    'the protocol must name the script that performs the measurement');
  // The trigger has to be stated, or the protocol is advice rather than a rule.
  assert.match(skill, /≤\s*1 bullet|<=\s*1 bullet/,
    'the protocol must state when it applies');
  // And the transfer rule, which is the part that saves the next cycle its work.
  assert.match(skill, /[Tt]ransfer rule/,
    'equivalence transfers the previous cycle\'s judgement; that must be explicit');
});

test('ENH-420: the method errata live next to the method they constrain', () => {
  const skill = fs.readFileSync(
    path.join(__dirname, '..', '..', 'skills', 'cc-version-analysis', 'SKILL.md'), 'utf8');
  // Each of these cost a cycle. Recorded in the errata log alone they were read
  // once; recorded beside the procedure they gate, they are read every time.
  for (const erratum of ['ERRATA-35-1', 'ERRATA-37-2', 'ERRATA-37-6', 'ERRATA-36-6']) {
    assert.ok(skill.includes(erratum), `${erratum} must be stated where the measurement happens`);
  }
});

test('ENH-422: provenance fields are specified, including what was NOT examined', () => {
  const skill = fs.readFileSync(
    path.join(__dirname, '..', '..', 'skills', 'cc-version-analysis', 'SKILL.md'), 'utf8');
  for (const field of ['sha256', 'GIT_SHA', 'BUILD_TIME']) {
    assert.ok(skill.includes(field), `provenance must record ${field}`);
  }
  assert.match(skill, /platforms NOT examined|never "there were no commits"/,
    'the scope limit is the point of the provenance record, not an afterthought');
});
