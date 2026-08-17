#!/bin/bash
# scripts/qa/pre-release-check.sh
# bkit pre-release quality scanner — run 5 pattern scanners
# Usage: bash scripts/qa/pre-release-check.sh [--json] [--scanner NAME]
#
# Exit codes:
#   0 — No critical issues found
#   1 — Critical issues found (release blocked)
#   2 — Script error

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Where bkit's own scanner code lives. Always relative to this script.
BKIT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# What gets scanned. These are two different things, and conflating them was the
# bug: SCAN_ROOT used to be BKIT_ROOT, so a user running this from their own
# project got a report about bkit's source instead of their code — a clean report
# that said nothing about the thing they were about to release.
SCAN_ROOT="${CLAUDE_PROJECT_DIR:-$PWD}"

FORMAT="console"
SCANNER=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --json) FORMAT="json"; shift ;;
    --scanner) SCANNER="$2"; shift 2 ;;
    --root) SCAN_ROOT="$(cd "$2" && pwd)"; shift 2 ;;
    --self) SCAN_ROOT="$BKIT_ROOT"; shift ;;
    --help|-h)
      echo "Usage: $0 [--json] [--scanner NAME] [--root DIR] [--self]"
      echo ""
      echo "Scans \$CLAUDE_PROJECT_DIR (or the current directory) by default."
      echo ""
      echo "Options:"
      echo "  --json           Output results as JSON"
      echo "  --scanner NAME   Run a specific scanner (dead-code, config-audit, completeness, shell-escape, wiring)"
      echo "  --root DIR       Scan DIR instead of the default"
      echo "  --self           Scan bkit's own source (what this script used to do unconditionally)"
      echo "  --help           Show this help"
      echo ""
      echo "Scanners:"
      echo "  dead-code     — Detect stale require/import targets and unused exports"
      echo "  config-audit  — Detect config/code inconsistencies"
      echo "  completeness  — Detect skill/agent declaration gaps"
      echo "  shell-escape  — Detect \$N substitution conflicts in shell blocks"
      echo "  wiring        — Detect exported-but-never-called functions"
      exit 0
      ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

if [ -n "$SCANNER" ]; then
  node -e "
    const qa = require('${BKIT_ROOT}/lib/qa');
    qa.runScanner('${SCANNER}', { rootDir: '${SCAN_ROOT}' })
      .then(r => {
        if ('${FORMAT}' === 'json') {
          console.log(JSON.stringify(r, null, 2));
        } else {
          console.log(qa.formatScannerReport('${SCANNER}', r.issues));
        }
        process.exit(r.summary.critical > 0 ? 1 : 0);
      })
      .catch(e => { console.error(e.message); process.exit(2); });
  "
else
  node -e "
    const qa = require('${BKIT_ROOT}/lib/qa');
    qa.runAllScanners({ rootDir: '${SCAN_ROOT}' })
      .then(r => {
        if ('${FORMAT}' === 'json') {
          console.log(JSON.stringify(r, null, 2));
        } else {
          const reporter = require('${BKIT_ROOT}/lib/qa/reporter');
          console.log(reporter.formatSummaryReport(r));
          for (const [name, result] of Object.entries(r.scanners)) {
            if (result.issues.length > 0) {
              console.log(reporter.formatScannerReport(name, result.issues));
            }
          }
        }
        process.exit(r.hasCritical ? 1 : 0);
      })
      .catch(e => { console.error(e.message); process.exit(2); });
  "
fi
