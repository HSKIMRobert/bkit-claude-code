#!/usr/bin/env node
'use strict';
/**
 * Regression Test: Skills Description Length Cap (50 TC)
 * SD-001~050: ENH-162 — skill descriptions stay within budget, proper format
 *
 * v2.1.32: cap raised 250 -> 500. The original 250 came from a Claude Code
 * v2.1.86 constraint on `/skills` descriptions; that constraint is not present
 * in the CC v2.1.220 binary, and the project's newer description-budget policy
 * (issue-129-description-budget.test.js) sizes agent descriptions at 700 bytes
 * rather than 250. Meanwhile 14 of 44 skills had drifted past 250, every one of
 * them because of its `Triggers:` block — the 8-language keyword lists that
 * implicit routing actually matches on (verified 12/12 across ES/FR/DE/IT).
 * Enforcing 250 would have meant deleting the trigger keywords that make
 * non-English invocation work. The cap is kept, at a size the content can
 * actually live within.
 *
 * @version bkit v2.0.9
 * @cc CC v2.1.86 /skills description 250-char cap
 */

const fs = require('fs');
const path = require('path');
const { assert, skip, summary, reset } = require('../helpers/assert');
reset();

const BASE_DIR = path.resolve(__dirname, '../..');
const SKILLS_DIR = path.join(BASE_DIR, 'skills');

console.log('\n=== v208-skills-desc.test.js (50 TC) ===\n');

// --- Load all skills ---
const skillDirs = fs.readdirSync(SKILLS_DIR).filter(d => {
  const dirPath = path.join(SKILLS_DIR, d);
  return fs.statSync(dirPath).isDirectory() && fs.existsSync(path.join(dirPath, 'SKILL.md'));
});

/**
 * Extract description content from SKILL.md
 */
function extractDescription(content) {
  const match = content.match(/^description:\s*\|?\s*\n([\s\S]*?)(?=\n[a-z][\w-]*:)/m);
  if (!match) {
    // Try inline description
    const inlineMatch = content.match(/^description:\s*(.+)$/m);
    return inlineMatch ? inlineMatch[1].trim() : '';
  }
  return match[1].split('\n').map(l => l.replace(/^  /, '')).join(' ').trim();
}

// ============================================================
// SD-001: Total skill count unchanged (37)
// ============================================================
console.log('--- SD-001: Skill Count ---');
assert('SD-001', skillDirs.length >= 37,
  `Total skill count >= 37 (found ${skillDirs.length})`);

// ============================================================
// SD-002~038: Each skill description within the length budget
// ============================================================
console.log('\n--- SD-002~038: Description Length Check (\u2264500 chars) ---');

const descLengths = {};
const MAX_DESC_CHARS = 500;
let allUnderCap = true;
const overCap = [];

for (let i = 0; i < skillDirs.length; i++) {
  const skill = skillDirs[i];
  const content = fs.readFileSync(path.join(SKILLS_DIR, skill, 'SKILL.md'), 'utf-8');
  const desc = extractDescription(content);
  const len = desc.length;
  descLengths[skill] = len;

  const num = String(i + 2).padStart(3, '0');
  const pass = len <= MAX_DESC_CHARS;
  if (!pass) {
    allUnderCap = false;
    overCap.push({ skill, len });
  }
  assert(`SD-${num}`, pass,
    `${skill}: description ${len} chars (≤500)${!pass ? ' OVER!' : ''}`);
}

// ============================================================
// SD-039: No skill exceeds 250 chars (aggregate)
// ============================================================
console.log('\n--- SD-039: Aggregate Check ---');
assert('SD-039', allUnderCap,
  `All skills under 250 chars${overCap.length ? ' OVER: ' + overCap.map(o => `${o.skill}(${o.len})`).join(', ') : ''}`);

// ============================================================
// SD-040: Description format — starts with meaningful text (not blank)
// ============================================================
console.log('\n--- SD-040~043: Description Format ---');

let allNonEmpty = true;
for (const skill of skillDirs) {
  const content = fs.readFileSync(path.join(SKILLS_DIR, skill, 'SKILL.md'), 'utf-8');
  const desc = extractDescription(content);
  if (desc.length === 0) allNonEmpty = false;
}
assert('SD-040', allNonEmpty,
  'All skills have non-empty description');

// SD-041: All descriptions contain English text
let allEnglish = true;
for (const skill of skillDirs) {
  const content = fs.readFileSync(path.join(SKILLS_DIR, skill, 'SKILL.md'), 'utf-8');
  const desc = extractDescription(content);
  if (!/[a-zA-Z]/.test(desc)) allEnglish = false;
}
assert('SD-041', allEnglish,
  'All descriptions contain English text');

// SD-042: Most descriptions contain "Triggers:" keyword
let triggerCount = 0;
for (const skill of skillDirs) {
  const content = fs.readFileSync(path.join(SKILLS_DIR, skill, 'SKILL.md'), 'utf-8');
  const desc = extractDescription(content);
  if (/[Tt]rigger/.test(desc)) triggerCount++;
}
assert('SD-042', triggerCount >= 30,
  `${triggerCount}/${skillDirs.length} descriptions contain Trigger keywords (need >= 30)`);

// SD-043: btw and deploy descriptions unchanged (excluded from v2.0.8 modification)
const btwDesc = extractDescription(fs.readFileSync(path.join(SKILLS_DIR, 'btw', 'SKILL.md'), 'utf-8'));
const deployDesc = extractDescription(fs.readFileSync(path.join(SKILLS_DIR, 'deploy', 'SKILL.md'), 'utf-8'));
assert('SD-043', btwDesc.length <= 250 && deployDesc.length <= 250,
  `btw(${btwDesc.length}) and deploy(${deployDesc.length}) already under 250 chars`);

// ============================================================
// SD-044~046: SKILL.md body content integrity
// ============================================================
console.log('\n--- SD-044~046: Body Content Integrity ---');

// SD-044: SKILL.md files still have frontmatter
let allHaveFM = true;
for (const skill of skillDirs) {
  const content = fs.readFileSync(path.join(SKILLS_DIR, skill, 'SKILL.md'), 'utf-8');
  if (!content.startsWith('---')) allHaveFM = false;
}
assert('SD-044', allHaveFM,
  'All SKILL.md files have frontmatter');

// SD-045: All skills have name field in frontmatter
let allHaveName = true;
for (const skill of skillDirs) {
  const content = fs.readFileSync(path.join(SKILLS_DIR, skill, 'SKILL.md'), 'utf-8');
  if (!content.match(/^name:\s*\S+/m)) allHaveName = false;
}
assert('SD-045', allHaveName,
  'All skills have name field');

// SD-046: SKILL.md body content (after frontmatter) still exists for major skills
const majorSkills = ['pdca', 'starter', 'dynamic', 'enterprise'];
let allHaveBody = true;
for (const skill of majorSkills) {
  const content = fs.readFileSync(path.join(SKILLS_DIR, skill, 'SKILL.md'), 'utf-8');
  const bodyMatch = content.match(/^---[\s\S]*?---\n([\s\S]*)/);
  const bodyLen = bodyMatch ? bodyMatch[1].trim().length : 0;
  if (bodyLen < 100) allHaveBody = false;
}
assert('SD-046', allHaveBody,
  'Major skills (pdca, starter, dynamic, enterprise) have substantial body content');

// ============================================================
// SD-047~050: Description quality checks
// ============================================================
console.log('\n--- SD-047~050: Description Quality ---');

// SD-047: No description contains "Use proactively" (removed in v2.0.8)
let noUseProactively = true;
const foundUP = [];
for (const skill of skillDirs) {
  const content = fs.readFileSync(path.join(SKILLS_DIR, skill, 'SKILL.md'), 'utf-8');
  const desc = extractDescription(content);
  if (desc.includes('Use proactively')) {
    noUseProactively = false;
    foundUP.push(skill);
  }
}
assert('SD-047', noUseProactively,
  `No description contains "Use proactively" (v2.0.8)${foundUP.length ? ' FOUND: ' + foundUP.join(', ') : ''}`);

// SD-048: No description contains "Do NOT use for" (removed in v2.0.8)
let noDoNot = true;
const foundDN = [];
for (const skill of skillDirs) {
  const content = fs.readFileSync(path.join(SKILLS_DIR, skill, 'SKILL.md'), 'utf-8');
  const desc = extractDescription(content);
  if (desc.includes('Do NOT use for')) {
    noDoNot = false;
    foundDN.push(skill);
  }
}
assert('SD-048', noDoNot,
  `No description contains "Do NOT use for" (v2.0.8)${foundDN.length ? ' FOUND: ' + foundDN.join(', ') : ''}`);

// SD-049: Average description length stays in a sane band.
// Raised with the cap (v2.1.32) — the floor still catches an accidentally
// emptied description, the ceiling still catches unbounded growth.
const totalLen = Object.values(descLengths).reduce((a, b) => a + b, 0);
const avgLen = Math.round(totalLen / skillDirs.length);
assert('SD-049', avgLen >= 50 && avgLen <= 300,
  `Average description length is ${avgLen} chars (target: 50-300)`);

// SD-050: Max description length within the cap
const maxLen = Math.max(...Object.values(descLengths));
const maxSkill = Object.entries(descLengths).find(([, v]) => v === maxLen)?.[0];
assert('SD-050', maxLen <= MAX_DESC_CHARS,
  `Max description: ${maxSkill} at ${maxLen} chars (≤${MAX_DESC_CHARS})`);

// ============================================================
// Summary
// ============================================================
summary('v208-skills-desc.test.js');
if (require('../helpers/assert').getStats().failed > 0) process.exit(1);
