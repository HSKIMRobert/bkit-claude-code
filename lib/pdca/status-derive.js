/**
 * The PDCA phase as the documents on disk state it (issue #156).
 *
 * `pdca-status.json` is a cache of something the documents already carry: a
 * `{feature}.plan.md` under the plan directory means that feature reached the
 * plan phase, whoever did or did not record it. Until now the read had no second
 * source, so every way the WRITE can fail surfaced identically as "no phase at
 * all" — a Stop handler that could not resolve the feature, the requireDocs
 * gate skipping, a crashed hook, a session that wrote nowhere.
 *
 * Derivation is a read-only fallback. Nothing here writes, and the stored status
 * still wins wherever it is ahead: `do` has no deliverable of its own, so a
 * feature recorded as `do` must not be pulled back to `design` by a derivation
 * that can only see documents.
 *
 * @module lib/pdca/status-derive
 */

const fs = require('fs');
const path = require('path');

/** Which document proves which PDCA phase.
 *
 * `do` is absent on purpose: it produces source code rather than a document
 * under `docs/`, so it is not derivable and is never returned from here. */
const PHASE_BY_DOC_KIND = {
  pm: 'pm',
  plan: 'plan',
  design: 'design',
  analysis: 'check',
  qa: 'qa',
  report: 'report',
};

function getPaths() {
  return require('../core/paths');
}

function getPhaseModule() {
  return require('./phase');
}

function projectDir() {
  return require('../core/platform').PROJECT_DIR;
}

/**
 * Turn one doc-path template into the directory to list and the pattern that
 * recovers `{feature}` from a filename in it.
 *
 * Templates come from config (`pdca.docPaths.*`), so the literal parts are
 * escaped rather than trusted: a `.` in `{feature}.plan.md` must match a dot and
 * not any character, or `user-authXplan.md` would register as a feature.
 *
 * @param {string} template - e.g. `docs/01-plan/features/{feature}.plan.md`
 * @returns {{dir: string, pattern: RegExp}|null}
 */
function templateMatcher(template) {
  if (typeof template !== 'string' || !template.includes('{feature}')) return null;
  const dir = path.dirname(template);
  const base = path.basename(template);
  if (dir.includes('{feature}')) return null; // a feature-named DIRECTORY is not a shape this reads
  const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\{feature\\\}/g, '(.+)');
  return { dir: path.join(projectDir(), dir), pattern: new RegExp(`^${escaped}$`) };
}

/**
 * Every feature that has a document, and the furthest phase its documents prove.
 *
 * @returns {Object<string, {phase: string, phaseNumber: number, documents: Object<string, string>, source: 'documents'}>}
 */
function deriveFeaturesFromDocs() {
  const { getDocPaths } = getPaths();
  const { getPhaseNumber } = getPhaseModule();
  const docPaths = getDocPaths();
  const out = {};

  for (const [kind, phase] of Object.entries(PHASE_BY_DOC_KIND)) {
    const templates = docPaths[kind];
    if (!Array.isArray(templates)) continue;

    for (const template of templates) {
      const m = templateMatcher(template);
      if (!m) continue;

      let names;
      try {
        names = fs.readdirSync(m.dir);
      } catch {
        continue; // a directory this project does not use
      }

      for (const name of names) {
        const hit = m.pattern.exec(name);
        if (!hit) continue;
        const feature = hit[1];
        const entry = (out[feature] ||= { phase, phaseNumber: 0, documents: {}, source: 'documents' });
        entry.documents[kind] ||= path.join(m.dir, name);
        const n = getPhaseNumber(phase);
        if (n >= entry.phaseNumber) {
          entry.phase = phase;
          entry.phaseNumber = n;
        }
      }
    }
  }

  return out;
}

/**
 * The stored status with document-derived features filled in — what a status
 * surface should read instead of the file alone.
 *
 * Merge rule: whichever source is FURTHER ahead wins, and `source` says which
 * one it was. `status` for a feature the file already carries at an equal or
 * later phase is returned untouched, so nothing a run recorded is overwritten by
 * a weaker derivation.
 *
 * @returns {{features: Object, activeFeatures: string[], primaryFeature: string|null, derivedOnly: string[]}}
 */
function getPdcaStatusView() {
  const core = require('./status-core');
  const stored = core.getPdcaStatusFull() || null;
  const derived = deriveFeaturesFromDocs();

  const features = {};
  const derivedOnly = [];

  for (const [feature, entry] of Object.entries(stored?.features || {})) {
    features[feature] = { ...entry, source: 'status-file' };
  }

  for (const [feature, entry] of Object.entries(derived)) {
    const have = features[feature];
    if (!have) {
      features[feature] = entry;
      derivedOnly.push(feature);
      continue;
    }
    if ((entry.phaseNumber || 0) > (have.phaseNumber || 0)) {
      features[feature] = { ...have, ...entry, documents: { ...(have.documents || {}), ...entry.documents } };
    }
  }

  const active = Array.isArray(stored?.activeFeatures) ? stored.activeFeatures.slice() : [];
  for (const feature of derivedOnly) if (!active.includes(feature)) active.push(feature);

  return {
    features,
    activeFeatures: active,
    primaryFeature: stored?.primaryFeature || derivedOnly[0] || null,
    derivedOnly,
  };
}

module.exports = {
  PHASE_BY_DOC_KIND,
  templateMatcher,
  deriveFeaturesFromDocs,
  getPdcaStatusView,
};
