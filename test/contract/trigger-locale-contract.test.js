#!/usr/bin/env node
'use strict';

/*
 * trigger-locale-contract.test.js — v2.1.34 (issue #129)
 *
 * Two invariants, one on each side of the same trade.
 *
 * The 8-language trigger vocabulary used to exist twice: in code, where bkit's
 * UserPromptSubmit intent-router reads it at no context cost, and in every
 * agent/skill frontmatter `description`, which Claude Code loads for the whole
 * session. The expensive copy was the complete one; the free copy covered only
 * 12 of 34 agents and 16 of 44 skills.
 *
 *   TL-FRONTMATTER  Frontmatter trigger lists stay English-only. Every
 *                   non-English keyword there is charged to the user on every
 *                   session, before they type anything.
 *
 *   TL-COVERAGE     Every agent and skill that has a trigger list has code-side
 *                   multilingual coverage. Without this, trimming frontmatter
 *                   would silently delete the 8-language auto-detection that is
 *                   one of bkit's advertised differentiators.
 *
 * Either invariant alone is a trap. TL-FRONTMATTER on its own removes the
 * capability; TL-COVERAGE on its own lets the duplication creep back.
 */

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const NON_ASCII = /[^\x00-\x7F]/;

const {
  AGENT_TRIGGER_KEYWORDS,
  SKILL_TRIGGER_KEYWORDS,
} = require(path.join(PROJECT_ROOT, 'lib/i18n/trigger-keywords'));

let pass = 0;
const failures = [];
function test(name, fn) {
  try { fn(); pass++; } catch (e) { failures.push(`${name}: ${e.message}`); }
}

/** @returns {string|null} the raw Triggers block text, or null if absent */
function triggerBlock(file) {
  const parts = fs.readFileSync(file, 'utf8').split(/^---$/m);
  if (parts.length < 3) return null;
  const lines = parts[1].split('\n');
  const start = lines.findIndex((l) => /^\s*Triggers:/.test(l));
  if (start === -1) return null;
  const out = [lines[start].replace(/^\s*Triggers:\s*/, '')];
  for (let i = start + 1; i < lines.length; i++) {
    if (!lines[i].trim()) break;
    if (/^\s{0,2}[A-Za-z_-]+:\s/.test(lines[i])) break;
    out.push(lines[i].trim());
  }
  return out.join(' ');
}

const agents = fs.readdirSync(path.join(PROJECT_ROOT, 'agents'))
  .filter((f) => f.endsWith('.md'))
  .map((f) => ({ name: f.replace(/\.md$/, ''), file: path.join(PROJECT_ROOT, 'agents', f) }));

const skills = fs.readdirSync(path.join(PROJECT_ROOT, 'skills'))
  .filter((d) => fs.existsSync(path.join(PROJECT_ROOT, 'skills', d, 'SKILL.md')))
  .map((d) => ({ name: d, file: path.join(PROJECT_ROOT, 'skills', d, 'SKILL.md') }));

// ---------------------------------------------------------------------------
// TL-FRONTMATTER — no non-English keywords on the always-resident surface
// ---------------------------------------------------------------------------
for (const { name, file, kind } of [
  ...agents.map((a) => ({ ...a, kind: 'agent' })),
  ...skills.map((s) => ({ ...s, kind: 'skill' })),
]) {
  const block = triggerBlock(file);
  if (block === null) continue;
  test(`TL-FRONTMATTER ${kind}/${name} trigger list is English-only`, () => {
    const offenders = block
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s && NON_ASCII.test(s));
    assert.deepStrictEqual(
      offenders,
      [],
      `non-English trigger keywords in frontmatter: ${offenders.join(', ')}. ` +
        `These are loaded into context for the entire session on every run. ` +
        `Add them to lib/i18n/trigger-keywords.js instead, where the intent-router ` +
        `matches them at no context cost.`
    );
  });
}

// ---------------------------------------------------------------------------
// TL-COVERAGE — the capability still exists, in code
// ---------------------------------------------------------------------------
function assertCoverage(kind, name, file, table) {
  const block = triggerBlock(file);
  if (block === null) return; // internal component with no trigger surface
  test(`TL-COVERAGE ${kind}/${name} has multilingual keywords in code`, () => {
    const entry = table[name];
    assert.ok(
      entry,
      `no entry in lib/i18n/trigger-keywords.js. Frontmatter carries English ` +
        `only by design, so without a code-side entry this ${kind} has no ` +
        `non-English routing at all.`
    );
    const languages = Object.keys(entry).filter((l) => l !== 'en' && entry[l].length > 0);
    assert.ok(
      languages.length > 0,
      `entry exists but has no non-English keywords — 8-language auto-detection ` +
        `would not fire for this ${kind}`
    );
  });
}

for (const { name, file } of agents) assertCoverage('agent', name, file, AGENT_TRIGGER_KEYWORDS);
for (const { name, file } of skills) assertCoverage('skill', name, file, SKILL_TRIGGER_KEYWORDS);

test('TL-FLOOR the trigger-block parser still finds trigger surfaces', () => {
  /*
   * Both loops above `continue` when `triggerBlock(file)` returns null, so a
   * parser that regressed to returning null for EVERY file would silently
   * delete every per-agent and per-skill case — and the suite would print a
   * green summary having asserted nothing at all. That is the exact shape of
   * the defects this release is about, sitting inside the file that checks for
   * them.
   *
   * The floors are set well below the current counts so ordinary additions and
   * removals never trip them; only a collapse does.
   */
  const withBlock = (list) => list.filter(({ file }) => triggerBlock(file) !== null).length;
  const agentsWithTriggers = withBlock(agents);
  const skillsWithTriggers = withBlock(skills);

  assert.ok(
    agentsWithTriggers >= 20,
    `only ${agentsWithTriggers} of ${agents.length} agents produced a trigger block. `
      + 'The parser is broken and every TL-FRONTMATTER / TL-COVERAGE case silently vanished.'
  );
  assert.ok(
    skillsWithTriggers >= 20,
    `only ${skillsWithTriggers} of ${skills.length} skills produced a trigger block. `
      + 'The parser is broken and every TL-FRONTMATTER / TL-COVERAGE case silently vanished.'
  );
});

// ---------------------------------------------------------------------------
// TL-ROUTE — routing actually resolves for a prompt in each language
// ---------------------------------------------------------------------------
test('TL-ROUTE a non-English prompt reaches the RIGHT agent', () => {
  /*
   * v2.1.34 — this asserted only that *some* agent resolved.
   *
   * Truthiness is nearly free to satisfy: any table with one broad keyword per
   * language passes it. It passed while the router was sending security prompts
   * to the code analyzer in three languages, because "an agent was returned" was
   * all it ever checked. Measured before the fix:
   *
   *   "보안 취약점 점검해줘"                  → code-analyzer
   *   "necesito una revisión de seguridad" → code-analyzer
   *   "bitte Sicherheit prüfen"            → gap-detector
   *
   * Two independent causes, both now closed: the router returned the
   * first-declared match rather than the strongest (lib/intent/trigger.js), and
   * code-analyzer claimed the bare word "security" in eight languages although
   * its trigger is the compound "security scan".
   *
   * Every probe below is a case where one agent has strictly stronger evidence
   * than any other. Genuinely ambiguous prompts — "vérifier la sécurité" is a
   * dead heat between the verb and the noun — are deliberately absent: a test
   * that pins an arbitrary tie-break would block the next legitimate table edit
   * for no reason.
   */
  const { matchImplicitAgentTrigger } = require(path.join(PROJECT_ROOT, 'lib/intent/trigger'));
  const probes = [
    ['ko', '설계대로 구현됐는지 검증해줘', 'bkit:gap-detector'],
    ['ja', 'ギャップ分析をお願い', 'bkit:gap-detector'],
    ['zh', '请做差距分析', 'bkit:gap-detector'],
    ['ko', '보안 취약점 점검해줘', 'bkit:security-architect'],
    ['es', 'necesito una revisión de seguridad', 'bkit:security-architect'],
    ['de', 'bitte Sicherheit prüfen', 'bkit:security-architect'],
    ['it', 'controlla la sicurezza', 'bkit:security-architect'],
    ['ja', 'セキュリティを確認して', 'bkit:security-architect'],
    ['zh', '检查安全', 'bkit:security-architect'],
    ['ko', '보안 스캔 돌려줘', 'bkit:code-analyzer'],
    ['ko', '완료 보고서 작성해줘', 'bkit:report-generator'],
    ['fr', 'architecture du composant React', 'bkit:frontend-architect'],
    ['it', 'configurare Kubernetes', 'bkit:infra-architect'],
  ];

  const wrong = [];
  for (const [lang, msg, expected] of probes) {
    const got = matchImplicitAgentTrigger(msg);
    const agent = got && got.agent;
    if (agent !== expected) {
      wrong.push(`[${lang}] ${JSON.stringify(msg)} → ${agent || 'null'} (expected ${expected})`);
    }
  }
  assert.deepStrictEqual(
    wrong, [],
    `misrouted prompts:\n  ${wrong.join('\n  ')}\n`
      + 'Routing to the wrong specialist is not a softer failure than routing nowhere — '
      + 'the user gets a confident answer from an agent that was never asked for.'
  );
});

test('TL-ROUTE the strongest match wins, not the first-declared', () => {
  /*
   * The direct lock on the ranking rule. A regression to first-match-wins would
   * leave every probe above still routing SOMEWHERE, so this states the
   * mechanism rather than an outcome: an agent matching two specific keywords
   * must beat one matching a single generic word, whatever the table order.
   */
  const { matchImplicitAgentTrigger } = require(path.join(PROJECT_ROOT, 'lib/intent/trigger'));
  const { AGENT_TRIGGER_PATTERNS, scoreMultiLangPattern } =
    require(path.join(PROJECT_ROOT, 'lib/intent/language'));

  const msg = '보안 취약점 점검해줘';
  const winner = matchImplicitAgentTrigger(msg).agent.replace(/^bkit:/, '');
  const winnerScore = scoreMultiLangPattern(msg, AGENT_TRIGGER_PATTERNS[winner]).score;

  const stronger = Object.entries(AGENT_TRIGGER_PATTERNS)
    .filter(([name]) => name !== winner)
    .map(([name, patterns]) => [name, scoreMultiLangPattern(msg, patterns).score])
    .filter(([, score]) => score > winnerScore);

  assert.deepStrictEqual(
    stronger, [],
    `the router chose ${winner}, but ${stronger.map(([n, s]) => `${n} (${s})`).join(', ')} `
      + 'matched more strongly. That is first-match-by-declaration-order, which is '
      + 'what v2.1.34 replaced.'
  );
});

test('TL-GREEDY-SEC no agent but security-architect claims a bare security term', () => {
  /*
   * The other half of the misrouting. `security scan` is a compound; splitting
   * it and keeping the head word gave code-analyzer an equal claim on the word
   * that names another agent's entire purpose. Same defect shape as the bkend-*
   * narrowing below, so it gets the same guard.
   */
  const BARE = new Set([
    'security', '보안', 'セキュリティ', '安全',
    'seguridad', 'sécurité', 'sicherheit', 'sicurezza', 'segurança',
  ]);
  const offenders = [];
  for (const [name, langs] of Object.entries(AGENT_TRIGGER_KEYWORDS)) {
    if (name === 'security-architect') continue;
    for (const [lang, words] of Object.entries(langs)) {
      for (const word of words) {
        if (BARE.has(String(word).toLowerCase())) offenders.push(`${name}.${lang}: ${word}`);
      }
    }
  }
  assert.deepStrictEqual(
    offenders, [],
    `bare security terms claimed by another agent: ${offenders.join(', ')}. `
      + 'Keep the compound (e.g. "security scan"); the bare word belongs to the agent it names.'
  );
});

// ---------------------------------------------------------------------------
// TL-SYNC — the two English trigger surfaces must not drift apart
//
// English now lives in two places on purpose: frontmatter `Triggers:`, which is
// what Claude Code's own agent/skill selection reads, and the `en:` key in
// lib/i18n/trigger-keywords.js, which is what bkit's intent-router matches.
// Nothing compared them, so they could drift silently and the two routing paths
// would disagree for English prompts — one more "configured but wrong" state of
// the kind this release exists to remove.
//
// The rule runs frontmatter -> router, which is the direction that carries the
// user-facing promise: a trigger a definition ADVERTISES must actually route.
// The reverse is not required — the router legitimately carries extra synonyms
// that were curated for matching (`sprint phase`, `static site`) and would only
// bloat the always-resident surface if copied back. Requiring equality would
// trade a real guarantee for a cosmetic one.
// ---------------------------------------------------------------------------
function assertEnglishSync(kind, name, file, table) {
  const block = triggerBlock(file);
  if (block === null) return;
  const entry = table[name];
  if (!entry || !Array.isArray(entry.en)) return;

  test(`TL-SYNC ${kind}/${name} advertised English triggers actually route`, () => {
    const routed = entry.en.map((w) => String(w).toLowerCase().trim()).filter(Boolean);
    const advertised = block
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s && !/[^\x00-\x7F]/.test(s) && !s.startsWith('/'));

    const unroutable = advertised.filter((phrase) => !routed.some((word) => phrase.includes(word)));
    assert.deepStrictEqual(
      unroutable,
      [],
      `the ${kind} advertises these triggers in its frontmatter, but nothing in `
        + `lib/i18n/trigger-keywords.js matches them, so typing one does not route here: `
        + `${unroutable.join(' | ')}`
    );
  });
}

for (const { name, file } of agents) assertEnglishSync('agent', name, file, AGENT_TRIGGER_KEYWORDS);
for (const { name, file } of skills) assertEnglishSync('skill', name, file, SKILL_TRIGGER_KEYWORDS);

// ---------------------------------------------------------------------------
// TL-CLEAN — a keyword that cannot match is worse than a missing one
//
// The one-time extraction that seeded the table produced two silent defects.
// The last keyword on each `Triggers:` line captured the sentence-ending
// period, so `"제어."` could never match a prompt containing 제어 — 39 keywords
// were dead while looking alive. And two single-character CJK keywords (`팀`,
// `갭`) were fragments rather than triggers, the same greedy-match class as the
// bare `기능` that made the help skill capture "회원가입 기능 만들어줘".
//
// Question marks are legitimate: `맞아?` and `es correcto?` are deliberate
// trigger phrases, not punctuation accidents.
// ---------------------------------------------------------------------------
const CJK_CHAR = /[가-힯぀-ヿ一-鿿]/;

for (const [kind, table] of [
  ['agent', AGENT_TRIGGER_KEYWORDS],
  ['skill', SKILL_TRIGGER_KEYWORDS],
]) {
  test(`TL-CLEAN ${kind} keywords carry no trailing sentence punctuation`, () => {
    const offenders = [];
    for (const [name, langs] of Object.entries(table)) {
      for (const [lang, words] of Object.entries(langs)) {
        for (const word of words) {
          if (/[.,;:]$/.test(word)) offenders.push(`${name}.${lang}: ${JSON.stringify(word)}`);
        }
      }
    }
    assert.deepStrictEqual(
      offenders,
      [],
      `these keywords end in punctuation and can never match a normal prompt: ${offenders.join(', ')}`
    );
  });

  test(`TL-CLEAN ${kind} keywords are not single CJK characters`, () => {
    const offenders = [];
    for (const [name, langs] of Object.entries(table)) {
      for (const [lang, words] of Object.entries(langs)) {
        for (const word of words) {
          if (CJK_CHAR.test(word) && word.trim().length <= 1) {
            offenders.push(`${name}.${lang}: ${JSON.stringify(word)}`);
          }
        }
      }
    }
    assert.deepStrictEqual(
      offenders,
      [],
      `one character is a fragment, not a trigger — it matches inside ordinary prose: ${offenders.join(', ')}`
    );
  });

  test(`TL-CLEAN ${kind} keywords are non-empty and unique per language`, () => {
    const offenders = [];
    for (const [name, langs] of Object.entries(table)) {
      for (const [lang, words] of Object.entries(langs)) {
        assert.ok(Array.isArray(words), `${name}.${lang} is not an array`);
        if (words.length === 0) offenders.push(`${name}.${lang} is empty`);
        const seen = new Set();
        for (const word of words) {
          if (typeof word !== 'string' || !word.trim()) offenders.push(`${name}.${lang} blank keyword`);
          const key = String(word).toLowerCase();
          if (seen.has(key)) offenders.push(`${name}.${lang} duplicate ${JSON.stringify(word)}`);
          seen.add(key);
        }
      }
    }
    assert.deepStrictEqual(offenders, [], offenders.join(', '));
  });
}

// ---------------------------------------------------------------------------
// TL-GREEDY — no trigger keyword is generic enough to hijack unrelated prompts
//
// Moving the vocabulary into code surfaced a keyword that had been inert in
// frontmatter: the /bkit help skill claimed a bare `기능` ("feature"), so
// "회원가입 기능 만들어줘" routed to the help skill instead of /dynamic. A help
// surface must never be the greediest matcher, and single common words are how
// that happens.
// ---------------------------------------------------------------------------
test('TL-GREEDY realistic prompts route to the right place, not to /bkit help', () => {
  const { matchImplicitSkillTrigger } = require(path.join(PROJECT_ROOT, 'lib/intent/trigger'));
  /** Prompts that are plainly not asking for help, in several languages. */
  const notHelp = [
    '회원가입 기능 만들어줘',
    '로그인 기능 만들어줘',
    '이 기능 배포해줘',
    'add a login feature',
    'ログイン機能を作って',
    '添加登录功能',
  ];
  const hijacked = notHelp.filter((p) => {
    const hit = matchImplicitSkillTrigger(p);
    return hit && (hit.skill === 'bkit:bkit' || hit.skill === 'bkit');
  });
  assert.deepStrictEqual(
    hijacked,
    [],
    `the /bkit help skill captured prompts that were not asking for help: ` +
      `${hijacked.join(' | ')}. Narrow its keywords to specific phrases.`
  );
});

test('TL-GREEDY vendor-specific skills name their vendor in every keyword', () => {
  /*
   * The bkend-* skills document one BaaS product. Their English triggers always
   * led with the vendor token ("bkend auth", "bkend table"), but the non-English
   * side had lost it during extraction — leaving bare 인증, 로그인, 회원가입,
   * 테이블, 데이터. Those are ordinary words in any project, so the moment the
   * trailing-period cleanup made them matchable, "회원가입 기능 만들어줘" began
   * routing to a vendor documentation skill instead of bkit's general fullstack
   * path. A narrow surface must not be the greediest matcher.
   */
  const offenders = [];
  for (const [name, langs] of Object.entries(SKILL_TRIGGER_KEYWORDS)) {
    if (!name.startsWith('bkend-')) continue;
    for (const [lang, words] of Object.entries(langs)) {
      for (const word of words) {
        if (!/bkend/i.test(word)) offenders.push(`${name}.${lang}: ${JSON.stringify(word)}`);
      }
    }
  }
  assert.deepStrictEqual(
    offenders,
    [],
    `vendor-specific keywords that would capture generic prompts: ${offenders.join(', ')}`
  );
});

test('TL-GREEDY a generic auth request does not reach a vendor docs skill', () => {
  const { matchImplicitSkillTrigger } = require(path.join(PROJECT_ROOT, 'lib/intent/trigger'));
  const generic = ['회원가입 기능 만들어줘', 'add a signup feature', '로그인 화면 만들어줘'];
  const captured = generic.filter((p) => {
    const hit = matchImplicitSkillTrigger(p);
    return hit && /bkend-/.test(String(hit.skill));
  });
  assert.deepStrictEqual(
    captured,
    [],
    `a bkend-* docs skill captured a generic request: ${captured.join(' | ')}`
  );
});

test('TL-GREEDY an actual help request still reaches /bkit', () => {
  const { matchImplicitSkillTrigger } = require(path.join(PROJECT_ROOT, 'lib/intent/trigger'));
  for (const prompt of ['bkit 도움말', 'bkit help', '기능 목록 보여줘']) {
    const hit = matchImplicitSkillTrigger(prompt);
    assert.ok(
      hit && String(hit.skill).includes('bkit'),
      `"${prompt}" no longer reaches the help skill — narrowing went too far`
    );
  }
});

if (failures.length > 0) {
  console.error(`\n✗ trigger-locale-contract: ${failures.length} failing assertion(s)`);
  for (const f of failures) console.error(`    ✗ ${f}`);
  console.error(`\npass:${pass} fail:${failures.length} skip:0`);
  process.exit(1);
}
console.log(`✓ trigger-locale-contract — pass:${pass} fail:0 skip:0`);
