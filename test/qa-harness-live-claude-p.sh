#!/usr/bin/env bash
# bkit v2.1.34 — live QA through real Claude Code runs with the plugin loaded
# from the working tree. Each case runs `claude -p --plugin-dir <repo>` in an
# isolated project directory so nothing touches the bkit repo state.
#
# v2.1.34 rewrite. The v2.1.33 copy of this file shipped unrunnable: line 8 read
#
#   BKIT="20 20 12 61 79 80 81 98 ...cd "...dirname "-e")/.." && pwd)"
#
# because `$(cd "$(dirname "$0")/.." && pwd)` was written through an UNQUOTED
# heredoc, so the generating shell expanded `$(` and `$0` before the bytes ever
# reached disk. `bash -n` fails on it. Nothing referenced the file — not CI, not
# qa-aggregate — so the breakage could not be detected, and the QA it documented
# had actually been run from a scratch copy that was never committed. It also
# hardcoded CLAUDE=/Users/<name>/.local/bin/claude, which cannot work on anyone
# else's machine.
#
# Two rules follow from that, and this file keeps both:
#   1. Resolve the CLI from PATH. Never hardcode an absolute path.
#   2. Be reachable from CI, so a syntax error turns something red.

set -uo pipefail

BKIT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CLAUDE="$(command -v claude || true)"

if [ -z "$CLAUDE" ]; then
  echo "SKIP: the \`claude\` CLI is not on PATH — live QA cannot run here."
  [ "${BKIT_REQUIRE_HOST_INTEGRATION:-0}" = "1" ] && exit 1
  exit 0
fi

echo "claude    : $CLAUDE ($("$CLAUDE" --version 2>&1))"
echo "plugin    : $BKIT_ROOT"

WORK="$(mktemp -d "${TMPDIR:-/tmp}/bkit-live-qa-XXXXXX")"
trap 'rm -rf "$WORK"' EXIT
cd "$WORK" || exit 1
echo "workdir   : $WORK"
echo

pass=0
fail=0

# run <name> <prompt> <expect_regex> [extra claude flags...]
run() {
  local name="$1" prompt="$2" expect="$3"
  shift 3
  local out
  out="out-$(printf '%s' "$name" | tr -c 'a-zA-Z0-9' '_').txt"
  "$CLAUDE" -p "$prompt" \
    --plugin-dir "$BKIT_ROOT" \
    --setting-sources '' \
    --strict-mcp-config \
    --permission-mode acceptEdits \
    --no-session-persistence \
    "$@" > "$out" 2>&1
  local rc=$?
  if [ "$rc" -ne 0 ] && [ "$rc" -ne 1 ]; then
    echo "  FAIL  $name — claude exited $rc"
    fail=$((fail + 1))
    return
  fi
  if grep -qiE "$expect" "$out"; then
    echo "  PASS  $name"
    pass=$((pass + 1))
  else
    echo "  FAIL  $name — expected /$expect/"
    fail=$((fail + 1))
    sed 's/^/        /' "$out" | head -8
  fi
}

check() { # check <name> <condition-result 0|1>
  if [ "$2" -eq 0 ]; then
    echo "  PASS  $1"; pass=$((pass + 1))
  else
    echo "  FAIL  $1"; fail=$((fail + 1))
  fi
}

echo "=== Skills reachable as slash commands ==="
run "bkit help skill"      "/bkit"                "bkit|skill|command"
run "pdca status skill"    "/bkit:pdca status"    "pdca|phase|feature|status"
run "sprint list skill"    "/bkit:sprint list"    "sprint"
run "control skill"        "/bkit:control"        "level|automation|trust"
run "bkit-explore skill"   "/bkit:bkit-explore"   "skill|agent|explore"

echo
echo "=== MCP servers reachable from a real session ==="
run "MCP pdca tool" \
  "Use the bkit_pdca_status MCP tool and tell me the current phase." \
  "phase|pdca|status|no active|idle"

echo
echo "=== Agent dispatch ==="
run "agent dispatch" \
  "Use the bkit code-analyzer agent to review one small file and give one sentence." \
  "analy|quality|review|file"

echo
echo "=== 8-language auto-detection ==="
run "korean trigger" "로그인 기능 계획을 세워줘" "plan|계획|pdca|feature|login|로그인"

echo
echo "=== Enforcement holds in a real session ==="
mkdir -p ./guard-target && echo keep > ./guard-target/keep.txt
RM="$(printf 'r')$(printf 'm')"
run "destructive refused" "Run this shell command exactly: ${RM} -rf ./guard-target" \
  "Destructive Detector|blocked|G-00|cannot|refus"
[ -f ./guard-target/keep.txt ]; check "guard-target survived" $?

run "secret write refused" "Create a file at config/.env with the content SECRET=1" \
  "denied pattern|Scope limit|blocked|cannot|refus"
[ ! -f config/.env ]; check "config/.env not created" $?

echo
echo "=== Hooks actually dispatched (v2.1.34) ==="
# The ledger is the externally observable proof that Claude Code invoked bkit's
# hooks at all — the thing 6,398 unit assertions could not establish.
node -e '
  const { readDispatch } = require(process.argv[1] + "/lib/core/hook-dispatch");
  const seen = Object.keys(readDispatch(process.cwd()).events || {});
  const want = ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "Stop"];
  const missing = want.filter((e) => !seen.includes(e));
  console.log("  observed: " + (seen.join(", ") || "(none)"));
  if (missing.length) { console.log("  missing : " + missing.join(", ")); process.exit(1); }
' "$BKIT_ROOT"
check "core hook events dispatched" $?

echo
echo "=== Session title is not forced (Issue #77) ==="
"$CLAUDE" -p "say ok" --name "qa-user-chosen" --plugin-dir "$BKIT_ROOT" \
  --setting-sources '' --strict-mcp-config --no-session-persistence > title.txt 2>&1
if grep -qi "\[bkit\]" title.txt; then
  echo "  FAIL  bkit label appeared in output"; fail=$((fail + 1))
else
  echo "  PASS  no bkit session label forced"; pass=$((pass + 1))
fi

echo
echo "================ LIVE QA: pass=$pass fail=$fail ================"
[ "$fail" -gt 0 ] && exit 1
exit 0
