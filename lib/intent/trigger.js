/**
 * Trigger Matching Module
 * @module lib/intent/trigger
 * @version 2.1.10
 */

const {
  AGENT_TRIGGER_PATTERNS,
  SKILL_TRIGGER_PATTERNS,
  matchMultiLangPattern,
  scoreMultiLangPattern,
} = require('./language');

// Lazy require
let _core = null;
function getCore() {
  if (!_core) {
    _core = require('../core');
  }
  return _core;
}

/**
 * Feature detection patterns (8 languages)
 */
const NEW_FEATURE_PATTERNS = {
  en: ['new feature', 'add feature', 'create feature', 'implement', 'build'],
  ko: ['새 기능', '기능 추가', '기능 만들기', '구현', '개발'],
  ja: ['新機能', '機能追加', '機能を作る', '実装', '開発'],
  zh: ['新功能', '添加功能', '创建功能', '实现', '开发'],
  es: ['nueva función', 'agregar función', 'crear función', 'implementar'],
  fr: ['nouvelle fonction', 'ajouter fonction', 'créer fonction', 'implémenter'],
  de: ['neue Funktion', 'Funktion hinzufügen', 'Funktion erstellen', 'implementieren'],
  it: ['nuova funzione', 'aggiungere funzione', 'creare funzione', 'implementare']
};

/**
 * Pick the entry whose keywords match `userMessage` most strongly.
 *
 * v2.1.34 — replaces first-match-by-declaration-order.
 *
 * `for (const [name, patterns] of Object.entries(TABLE)) if (match) return name`
 * returns whichever candidate the table happens to list first, which has
 * nothing to do with which one the user meant. Measured against the shipped
 * tables before this change:
 *
 *   "보안 취약점 점검해줘"            → code-analyzer   (wanted security-architect)
 *   "necesito una revisión de seguridad" → code-analyzer   (wanted security-architect)
 *   "bitte Sicherheit prüfen"           → gap-detector    (wanted security-architect)
 *
 * In each case the winning agent matched ONE generic word (점검 / revisión /
 * prüfen) while the intended agent matched the specific one (취약점 / seguridad
 * / Sicherheit) — and lost purely on table position. The routing contract test
 * asserted only that *some* agent resolved, so all three were green.
 *
 * Ranking is by total matched-keyword length, then by number of distinct
 * keywords, then by declaration order. Length is the proxy for specificity: a
 * longer keyword carries more intent than a shorter one, and ties fall back to
 * the previous behaviour so nothing that was already unambiguous moves.
 *
 * @param {string} userMessage
 * @param {Object<string, Object>} table - name → multi-language pattern map
 * @returns {string|null} best-matching key, or null when nothing matches
 */
function pickBestMatch(userMessage, table) {
  let best = null;
  let bestScore = 0;
  let bestCount = 0;

  for (const [name, patterns] of Object.entries(table || {})) {
    const { score, count } = scoreMultiLangPattern(userMessage, patterns);
    if (count === 0) continue;
    if (score > bestScore || (score === bestScore && count > bestCount)) {
      best = name;
      bestScore = score;
      bestCount = count;
    }
  }

  return best;
}

/**
 * Match implicit agent trigger from user message
 * @param {string} userMessage
 * @returns {{agent: string, confidence: number} | null}
 */
function matchImplicitAgentTrigger(userMessage) {
  const { debugLog, getConfig } = getCore();

  if (!userMessage) return null;

  const confidenceThreshold = getConfig('triggers.confidenceThreshold', 0.7);
  // v2.1.12 Sprint D (#21 fix): use toFixed(2) to eliminate FP error.
  // Previously, `confidenceThreshold + 0.1` produced 0.7999999999999999
  // (FP precision) which failed the intent-router's `>= 0.8` gate. The
  // intended value was always 0.8 — we now compute it explicitly.
  const computedConfidence = Math.min(1, Number((confidenceThreshold + 0.1).toFixed(2)));

  const agent = pickBestMatch(userMessage, AGENT_TRIGGER_PATTERNS);
  if (!agent) return null;

  const result = { agent: `bkit:${agent}`, confidence: computedConfidence };
  debugLog('intent', 'Matched agent trigger', result);
  return result;
}

/**
 * Match implicit skill trigger from user message
 * @param {string} userMessage
 * @returns {{skill: string, level: string, confidence: number} | null}
 */
function matchImplicitSkillTrigger(userMessage) {
  const { debugLog, getConfig } = getCore();

  if (!userMessage) return null;

  const confidenceThreshold = getConfig('triggers.confidenceThreshold', 0.7);
  // v2.1.12 Sprint D (#21 fix): same FP-precision fix as agent trigger.
  const computedConfidence = Math.min(1, Number((confidenceThreshold + 0.1).toFixed(2)));

  const skill = pickBestMatch(userMessage, SKILL_TRIGGER_PATTERNS);
  if (!skill) return null;

  const levelMap = {
    starter: 'Starter',
    dynamic: 'Dynamic',
    enterprise: 'Enterprise',
    'mobile-app': 'Dynamic'
  };

  const result = {
    skill: `bkit:${skill}`,
    level: levelMap[skill] || 'Dynamic',
    confidence: computedConfidence
  };
  debugLog('intent', 'Matched skill trigger', result);
  return result;
}

/**
 * Detect new feature intent from user message
 * @param {string} userMessage
 * @returns {{isNewFeature: boolean, featureName: string | null, confidence: number}}
 */
function detectNewFeatureIntent(userMessage) {
  const { debugLog } = getCore();

  if (!userMessage) {
    return { isNewFeature: false, featureName: null, confidence: 0 };
  }

  // Check for new feature patterns
  const isNewFeature = matchMultiLangPattern(userMessage, NEW_FEATURE_PATTERNS);

  if (!isNewFeature) {
    return { isNewFeature: false, featureName: null, confidence: 0 };
  }

  // Try to extract feature name
  let featureName = null;

  // Pattern: "feature called X" or "feature named X"
  const namedMatch = userMessage.match(/(?:called|named|이름이?)\s+["']?(\w[\w-]*)["']?/i);
  if (namedMatch) {
    featureName = namedMatch[1];
  }

  // Pattern: quoted name
  const quotedMatch = userMessage.match(/["'](\w[\w-]*)["']/);
  if (!featureName && quotedMatch) {
    featureName = quotedMatch[1];
  }

  const result = {
    isNewFeature: true,
    featureName,
    confidence: featureName ? 0.9 : 0.7
  };

  debugLog('intent', 'Detected new feature intent', result);
  return result;
}

/**
 * Extract feature name from request
 * @param {string} request
 * @returns {string | null}
 */
function extractFeatureNameFromRequest(request) {
  if (!request) return null;

  // Try various extraction patterns
  const patterns = [
    /feature\s+["']?(\w[\w-]*)["']?/i,
    /(?:called|named)\s+["']?(\w[\w-]*)["']?/i,
    /["'](\w[\w-]*)["']/,
    /implement\s+(\w[\w-]*)/i,
    /build\s+(\w[\w-]*)/i
  ];

  for (const pattern of patterns) {
    const match = request.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

module.exports = {
  NEW_FEATURE_PATTERNS,
  matchImplicitAgentTrigger,
  matchImplicitSkillTrigger,
  detectNewFeatureIntent,
  extractFeatureNameFromRequest,
};
