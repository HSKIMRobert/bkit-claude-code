#!/usr/bin/env node
'use strict';

/**
 * bkit v2.1.0 Comprehensive Test Runner
 * ~3880+ TC across 12 perspectives
 *
 * Usage:
 *   node test/run-all.js                    # Run all tests (Node layer only, ~2360 TC)
 *   node test/run-all.js --unit             # Run unit tests only (~1100 TC)
 *   node test/run-all.js --integration      # Run integration tests only (~560 TC)
 *   node test/run-all.js --security         # Run security tests only (~250 TC)
 *   node test/run-all.js --regression       # Run regression tests only (~530 TC)
 *   node test/run-all.js --performance      # Run performance tests only (~182 TC)
 *   node test/run-all.js --philosophy       # Run philosophy tests only (60 TC)
 *   node test/run-all.js --ux              # Run UX tests only (~185 TC)
 *   node test/run-all.js --e2e             # Run E2E tests (node portion, ~90 TC)
 *   node test/run-all.js --architecture    # Run architecture tests only (~100 TC)
 *   node test/run-all.js --controllable-ai # Run controllable AI tests only (~80 TC)
 *   node test/run-all.js --behavioral      # Run behavioral tests only (~45 TC) ★NEW
 *   node test/run-all.js --contract        # Run contract tests only (~40 TC) ★NEW
 *
 * For full E2E including claude -p (80 TC):
 *   bash test/e2e/run-e2e.sh
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { generateReport, saveReport } = require('./helpers/report');

const ROOT = path.resolve(__dirname, '..');
const TEST_DIR = __dirname;

const CATEGORIES = {
  unit: {
    name: 'Unit Tests',
    files: [
      'unit/ambiguity.test.js',
      'unit/trigger.test.js',
      'unit/creator.test.js',
      'unit/orchestrator.test.js',
      'unit/coordinator.test.js',
      'unit/runner.test.js',
      'unit/reporter.test.js',
      'unit/other-modules.test.js',
      'unit/post-compaction.test.js',
      'unit/stop-failure.test.js',
      'unit/plugin-data.test.js',
      'unit/constants.test.js',
      'unit/errors.test.js',
      'unit/state-store.test.js',
      'unit/state-machine.test.js',
      'unit/automation-controller.test.js',
      'unit/workflow-parser.test.js',
      'unit/workflow-engine.test.js',
      'unit/circuit-breaker.test.js',
      'unit/resume.test.js',
      'unit/lifecycle.test.js',
      'unit/full-auto-do.test.js',
      'unit/feature-manager.test.js',
      'unit/batch-orchestrator.test.js',
      'unit/destructive-detector.test.js',
      'unit/checkpoint-manager.test.js',
      'unit/loop-breaker.test.js',
      'unit/blast-radius.test.js',
      'unit/trust-engine.test.js',
      'unit/scope-limiter.test.js',
      'unit/audit-logger.test.js',
      'unit/decision-tracer.test.js',
      'unit/explanation-gen.test.js',
      'unit/gate-manager.test.js',
      'unit/metrics-collector.test.js',
      'unit/regression-guard.test.js',
      'unit/ansi.test.js',
      'unit/progress-bar.test.js',
      'unit/workflow-map.test.js',
      'unit/agent-panel.test.js',
      'unit/impact-view.test.js',
      'unit/control-panel.test.js',
      'unit/core-modules.test.js',
      'unit/task-modules.test.js',
      'unit/team-modules.test.js',
      'unit/pdca-modules.test.js',
      'unit/v200-skills.test.js',
      'unit/v200-mcp-servers.test.js',
      'unit/v200-workflows.test.js',
      'unit/session-guide.test.js',
      // v2.1.0 comprehensive test strategy additions
      'unit/paths.test.js',
      'unit/import-resolver.test.js',
      'unit/skill-orchestrator.test.js',
      'unit/skill-name.test.js',
      'unit/hook-reachability.test.js',
      'unit/permission-manager.test.js',
      'unit/strategy.test.js',
      'unit/cto-logic.test.js',
      'unit/task-queue.test.js',
    ],
    expected: 1700,
  },
  integration: {
    name: 'Integration Tests',
    files: [
      'integration/config-sync.test.js',
      'integration/module-chain.test.js',
      'integration/hook-chain.test.js',
      'integration/export-compat.test.js',
      'integration/session-restore.test.js',
      'integration/hook-wiring.test.js',
      'integration/state-machine-flow.test.js',
      'integration/audit-pipeline.test.js',
      'integration/quality-pipeline.test.js',
      'integration/control-pipeline.test.js',
      'integration/common-removal.test.js',
      'integration/mcp-server.test.js',
      'integration/v200-wiring.test.js',
      'integration/v200-dashboard.test.js',
      'integration/v200-common-bridge.test.js',
      'integration/pm-skills-integration.test.js',
      'integration/impact-analysis-section.test.js',
      'integration/context-anchor-propagation.test.js',
      // v2.1.0 hook behavioral tests
      'integration/hook-behavioral-stop.test.js',
      'integration/hook-behavioral-user-prompt.test.js',
      'integration/hook-behavioral-pre-write.test.js',
      // v2.1.0 MCP functional tests
      'integration/mcp-pdca-functional.test.js',
      'integration/mcp-analysis-functional.test.js',
    ],
    expected: 560,
  },
  security: {
    name: 'Security Tests',
    files: [
      'security/agent-frontmatter.test.js',
      'security/config-permissions.test.js',
      'security/runtime-security.test.js',
      'security/destructive-prevention.test.js',
      'security/destructive-rules.test.js',
      'security/automation-levels.test.js',
      'security/checkpoint-integrity.test.js',
      'security/scope-limiter.test.js',
      'security/trust-score-safety.test.js',
      'security/hook-path-quoting.test.js',
      // v2.1.0 security additions
      'security/path-traversal.test.js',
      'security/integrity-verification.test.js',
      'security/hook-security.test.js',
    ],
    expected: 249,
  },
  regression: {
    name: 'Regression Tests',
    files: [
      'regression/pdca-core.test.js',
      'regression/skills-28.test.js',
      'regression/agents-21.test.js',
      'regression/hooks-10.test.js',
      'regression/cc-compat.test.js',
      'regression/agents-effort.test.js',
      'regression/v162-compat.test.js',
      'regression/common-removal.test.js',
      'regression/hook-events.test.js',
      'regression/skills-35.test.js',
      'regression/agents-29.test.js',
      'regression/status-v3-migration.test.js',
      'regression/skills-36.test.js',
      'regression/agents-31.test.js',
      'regression/issue-53-path-quoting.test.js',
      'regression/pr55-handoff-loss.test.js',
      'regression/v208-skills-desc.test.js',
      'regression/v208-version-consistency.test.js',
      // v2.1.0 regression additions
      'regression/agents-32.test.js',
      'regression/skills-37.test.js',
      'regression/agents-effort-32.test.js',
      // v2.1.34 — these ran only under qa-aggregate's directory walk, so
      // `node test/run-all.js` reported a green suite while six regression
      // files it never opened held the locks for this release's defects.
      // Two runners disagreeing about what "all tests" means is how a gap hides.
      'regression/destructive-bypass.test.js',
      'regression/bkit-state-isolation.test.js',
      'regression/hook-failure-observability.test.js',
      'regression/bash-pre-decision.test.js',
      'regression/pdca-doc-changed.test.js',
      'regression/gap-detector-unmeasured.test.js',
    ],
    expected: 610,
  },
  performance: {
    name: 'Performance Tests',
    files: [
      'performance/hook-perf.test.js',
      'performance/core-function-perf.test.js',
      'performance/benchmark-perf.test.js',
      'performance/module-load-perf.test.js',
      'performance/plugin-data-perf.test.js',
      'performance/hook-cold-start.test.js',
      // 'performance/direct-import.test.js' — ENH-167 Phase B: removed, file does not exist (run-all consistency)
      'performance/state-store-perf.test.js',
      'performance/audit-write-perf.test.js',
      'performance/ui-render-perf.test.js',
      // v2.1.0 performance additions
      'performance/mcp-response-perf.test.js',
      'performance/hook-real-execution.test.js',
      'performance/memory-leak.test.js',
    ],
    expected: 182,
  },
  philosophy: {
    name: 'Philosophy Tests',
    files: [
      'philosophy/no-guessing.test.js',
      'philosophy/automation-first.test.js',
      'philosophy/docs-equals-code.test.js',
      'philosophy/security-by-default.test.js',
      'philosophy/no-guessing-v2.test.js',
      'philosophy/automation-first-v2.test.js',
      'philosophy/docs-equals-code-v2.test.js',
      'philosophy/security-by-default-v2.test.js',
    ],
    expected: 138,
  },
  ux: {
    name: 'UX Tests',
    files: [
      'ux/clarification-flow.test.js',
      'ux/team-mode-ux.test.js',
      'ux/pdca-status-ux.test.js',
      'ux/language-support.test.js',
      'ux/executive-summary.test.js',
      'ux/pdca-dashboard.test.js',
      'ux/workflow-map-ux.test.js',
      'ux/impact-view-ux.test.js',
      'ux/agent-panel-ux.test.js',
      'ux/control-panel-ux.test.js',
      'ux/skill-commands.test.js',
      // v2.1.0 UX additions
      'ux/accessibility.test.js',
      'ux/cjk-rendering.test.js',
      'ux/language-detection-full.test.js',
    ],
    expected: 185,
  },
  e2e: {
    name: 'E2E Tests (Node)',
    files: [
      'e2e/eval-benchmark.test.js',
      'e2e/checkpoint-rollback.test.js',
      'e2e/pdca-auto-cycle.test.js',
      'e2e/error-recovery.test.js',
      // v2.1.0 E2E additions
      'e2e/pdca-lifecycle.test.js',
      'e2e/pdca-status-persistence.test.js',
    ],
    expected: 90,
  },
  architecture: {
    name: 'Architecture Tests',
    files: [
      'architecture/state-machine.test.js',
      'architecture/module-dependencies.test.js',
      'architecture/hook-flow.test.js',
      'architecture/data-schema.test.js',
      'architecture/export-completeness.test.js',
    ],
    expected: 100,
  },
  'controllable-ai': {
    name: 'Controllable AI Tests',
    files: [
      'controllable-ai/safe-defaults.test.js',
      'controllable-ai/progressive-trust.test.js',
      'controllable-ai/full-visibility.test.js',
      'controllable-ai/always-interruptible.test.js',
    ],
    expected: 80,
  },
  // v2.1.0 new categories
  behavioral: {
    name: 'Behavioral Tests',
    files: [
      'behavioral/agent-triggers.test.js',
      'behavioral/skill-orchestration.test.js',
      'behavioral/team-coordination.test.js',
    ],
    expected: 45,
  },
  contract: {
    name: 'Contract Tests',
    files: [
      'contract/hook-input-schema.test.js',
      'contract/hook-output-schema.test.js',
      'contract/mcp-protocol.test.js',
    ],
    expected: 40,
  },
};

function parseTestOutput(output, filePath) {
  const lines = output.split('\n');
  let passed = 0, failed = 0, skipped = 0;
  const failures = [];

  // Strategy 1: Look for summary line (most reliable)
  // Formats: "Total: 35 | Pass: 35 | Fail: 0", "Total: 30 | PASS: 30 | FAIL: 0"
  //          "--- Results: 15/15 passed, 0 failed ---" (behavioral/contract)
  const summaryMatch = output.match(/Total:\s*(\d+)\s*\|\s*Pass(?:ed)?:\s*(\d+)\s*\|\s*Fail(?:ed)?:\s*(\d+)/i);
  const resultsMatch = output.match(/Results:\s*(\d+)\s*\/\s*(\d+)\s*passed,\s*(\d+)\s*failed/i);
  /*
   * v2.1.34 — "pass:N fail:N skip:N", the format qa-aggregate reads.
   *
   * This runner and qa-aggregate had different output contracts, so six
   * regression suites written in the aggregate's format contributed roughly ten
   * assertions here instead of seventy-four: the per-line fallback happened to
   * catch a few "✓" lines and dropped the rest. `run-all` printed a green
   * summary while under-counting the very suites that hold this release's
   * regression locks.
   *
   * Two runners disagreeing about what "all tests" means is how a coverage gap
   * hides in plain sight, which is the subject of this whole release.
   */
  const compactMatch = output.match(/\bpass:(\d+)\s+fail:(\d+)\s+skip:(\d+)/i);
  if (compactMatch) {
    passed = parseInt(compactMatch[1]);
    failed = parseInt(compactMatch[2]);
    skipped = parseInt(compactMatch[3]);
    return { passed, failed, skipped, total: passed + failed + skipped, failures };
  }
  if (summaryMatch) {
    const total = parseInt(summaryMatch[1]);
    passed = parseInt(summaryMatch[2]);
    failed = parseInt(summaryMatch[3]);
    skipped = total - passed - failed;
  } else if (resultsMatch) {
    passed = parseInt(resultsMatch[1]);
    const total = parseInt(resultsMatch[2]);
    failed = parseInt(resultsMatch[3]);
    skipped = total - passed - failed;
  } else {
    // Strategy 2: Count individual lines with various formats
    lines.forEach(line => {
      // Format: "  PASS: ID - message" or "  PASS  SEC-AF-001:" or "[PASS]" or "✓"
      if (/^\s*(PASS:|PASS\s{2,}\S)/.test(line) || /\[PASS\]/.test(line)) passed++;
      else if (/✓/.test(line) && !/Summary|Total|Pass Rate|Passed:/.test(line)) passed++;

      if (/^\s*(FAIL:|FAIL\s{2,}\S)/.test(line) || /\[FAIL\]/.test(line)) {
        failed++;
        const match = line.match(/(?:FAIL:|FAIL\s+|\[FAIL\]\s*)(\S+?)[\s:]*-?\s*(.*)/);
        if (match) failures.push({ id: match[1], message: match[2] });
      } else if (/✗/.test(line) && !/Summary|Total|Failed:/.test(line)) {
        failed++;
      }

      if (/SKIP:|\[SKIP\]|⏭/.test(line) && !/Skipped:/.test(line)) skipped++;
    });
  }

  // Strategy 2b: Extract failures from summary sections
  if (failures.length === 0 && failed > 0) {
    lines.forEach(line => {
      const fMatch = line.match(/\[FAIL\]\s*(\S+?):\s*(.*)/);
      if (fMatch) failures.push({ id: fMatch[1], message: fMatch[2] });
      const fMatch2 = line.match(/Assertion failed:\s*(\S+?):\s*(.*)/);
      if (fMatch2 && !failures.find(f => f.id === fMatch2[1])) {
        failures.push({ id: fMatch2[1], message: fMatch2[2] });
      }
    });
  }

  // Strategy 3: Check for box-drawing summary (performance/e2e tests)
  const passedBoxMatch = output.match(/Passed:\s*(\d+)/);
  const failedBoxMatch = output.match(/Failed:\s*(\d+)/);
  const skippedBoxMatch = output.match(/Skipped:\s*(\d+)/);
  if (passedBoxMatch && passed === 0 && failed === 0) {
    passed = parseInt(passedBoxMatch[1]);
    failed = failedBoxMatch ? parseInt(failedBoxMatch[1]) : 0;
    skipped = skippedBoxMatch ? parseInt(skippedBoxMatch[1]) : 0;
  }

  const total = passed + failed + skipped;
  return { passed, failed, total, skipped, failures };
}

function runTestFile(filePath) {
  const fullPath = path.join(TEST_DIR, filePath);
  if (!fs.existsSync(fullPath)) {
    // v2.1.35 (ENH-431): a manifest entry with no file is a failure, not a skip.
    // Returning failed:0 alongside a failure entry is how four orphans left by
    // the v2.1.16 cleanup stayed out of the totals for 19 releases — the report
    // listed them under "Failures" while the verdict counted them as skips.
    return { passed: 0, failed: 1, total: 1, skipped: 0, failures: [{ id: filePath, message: 'File not found' }] };
  }

  try {
    const output = execSync(`node "${fullPath}"`, {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 120000,
      /*
       * v2.1.34 — BKIT_TEST_AGGREGATE, which this runner never set.
       *
       * It spawns every suite back to back, so cold-start budgets pay for the
       * contention exactly as they do under qa-aggregate: the same four
       * hook-cold-start assertions failed here and passed standalone. The flag
       * is what timing-sensitive suites read to widen their bound, and this
       * runner qualifies for it by definition — it is an aggregate run.
       */
      env: { ...process.env, NODE_PATH: ROOT, BKIT_TEST_AGGREGATE: '1' },
    });

    return parseTestOutput(output, filePath);
  } catch (e) {
    const output = (e.stdout || '') + (e.stderr || '');
    const result = parseTestOutput(output, filePath);

    if (result.passed === 0 && result.failed === 0) {
      result.failed = 1;
      result.total = 1;
      result.failures.push({ id: filePath, message: `Execution error: ${e.message}` });
    }

    return result;
  }
}

function runCategory(category) {
  const config = CATEGORIES[category];
  if (!config) {
    console.error(`Unknown category: ${category}`);
    return { passed: 0, failed: 0, total: 0, skipped: 0, failures: [] };
  }

  console.log(`\n${'#'.repeat(60)}`);
  console.log(`# ${config.name} (Expected: ~${config.expected} TC)`);
  console.log(`${'#'.repeat(60)}\n`);

  let totalPassed = 0, totalFailed = 0, totalTC = 0, totalSkipped = 0;
  const allFailures = [];

  config.files.forEach(file => {
    console.log(`--- ${file} ---`);
    const result = runTestFile(file);
    totalPassed += result.passed;
    totalFailed += result.failed;
    totalTC += result.total;
    totalSkipped += result.skipped;
    allFailures.push(...result.failures);
    console.log(`  Subtotal: ${result.passed}/${result.total} PASS\n`);
  });

  const rate = totalTC > 0 ? ((totalPassed / totalTC) * 100).toFixed(1) : '0.0';
  console.log(`${config.name} Total: ${totalPassed}/${totalTC} PASS (${rate}%), ${totalFailed} FAIL, ${totalSkipped} SKIP`);

  return { passed: totalPassed, failed: totalFailed, total: totalTC, skipped: totalSkipped, failures: allFailures };
}

async function main() {
  const args = process.argv.slice(2);
  const startTime = Date.now();

  console.log('='.repeat(60));
  console.log('bkit v2.0.5 Comprehensive Test Runner');
  console.log(`Date: ${new Date().toISOString()}`);
  console.log('='.repeat(60));

  const allResults = {};
  const categoriesToRun = args.length > 0
    ? args.map(a => a.replace('--', '')).filter(c => CATEGORIES[c])
    : Object.keys(CATEGORIES);

  for (const cat of categoriesToRun) {
    allResults[cat] = runCategory(cat);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nTotal execution time: ${elapsed}s`);

  const report = generateReport(allResults);
  const reportPath = path.join(ROOT, 'docs/04-report/features/bkit-v200-test.report.md');
  saveReport(report, reportPath);

  console.log(report);

  const totalFailed = Object.values(allResults).reduce((sum, r) => sum + r.failed, 0);
  process.exit(totalFailed > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('Test runner error:', e);
  process.exit(1);
});
