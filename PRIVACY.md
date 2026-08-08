# Privacy Policy — bkit (Vibecoding Kit)

**Last updated:** March 8, 2026
**Version:** 1.6.1
**License:** Apache 2.0

## Overview

bkit is an open-source Claude Code plugin that runs entirely on your local machine. It does not collect, transmit, or store any personal data. This document explains what bkit does and does not do with your information.

## How bkit Works

bkit operates as a local plugin within Claude Code. All processing happens on your machine:

- **Skills** provide structured workflows (PDCA, code review, development pipeline)
- **Agents** coordinate AI-assisted tasks (gap analysis, report generation)
- **Hooks** respond to Claude Code lifecycle events (session start, tool use)

No part of bkit communicates with external servers.

## Data Stored Locally

| Data | Location | Purpose |
|------|----------|---------|
| PDCA status | `.bkit/state/memory.json` | Track current feature progress |
| Agent memory | `.claude/agent-memory/` | Persist agent context across sessions |
| Plan/Design/Report docs | `docs/` | PDCA workflow documents |
| Configuration | `bkit.config.json` | Plugin settings |
| Runtime state | `.bkit/runtime/` | Session-level temporary state |

All data remains in your project directory. You can inspect, modify, or delete any of these files at any time.

## What bkit Does NOT Do

- Does not collect personal information (name, email, IP address, device ID)
- Does not send telemetry, analytics, or usage data to any server **by default**
- Does not read, store, or transmit API keys (existence-checked only, never read)
- Does not include third-party tracking libraries or dependencies
- Does not use cookies, local storage, or browser-based tracking

## Opt-in Telemetry (OpenTelemetry)

> Corrected in v2.1.33 (ENH-404). This page previously stated that bkit "does
> not make network requests of any kind", which was not accurate once
> `lib/infra/telemetry.js` was added.

bkit ships an **opt-in** OpenTelemetry exporter. It is inert unless you set an
endpoint yourself:

- **Off by default.** With `OTEL_EXPORTER_OTLP_ENDPOINT` unset, bkit makes no
  network requests at all.
- **When you set that variable**, bkit posts OTLP spans describing PDCA phase
  transitions, quality-gate results, and token counts to the endpoint *you*
  chose — typically a collector you run. bkit never sends data to POPUP STUDIO
  or any third party.
- The payload carries workflow metadata (phase names, gate scores, durations),
  not your source code, prompts, or model responses.
- To turn it off again, unset `OTEL_EXPORTER_OTLP_ENDPOINT`. See
  `lib/infra/telemetry.js` for the exact fields.

## Claude Code's Feedback Survey

Independently of bkit, Claude Code may offer to attach your session transcript
when you submit feedback. Consenting uploads that transcript to Anthropic, which
can include your `CLAUDE.md`, skill and agent definitions, and MCP tool
descriptions. bkit neither triggers nor sees this; it is mentioned here because
those files are bkit artifacts and you should know what consenting includes.

## Claude Code and Anthropic

bkit runs inside Claude Code, which is operated by Anthropic. Your interactions with Claude (prompts, responses, tool calls) are governed by [Anthropic's Privacy Policy](https://www.anthropic.com/privacy) and [Terms of Service](https://www.anthropic.com/terms). bkit has no access to or control over how Anthropic processes this data.

## GDPR and CCPA

Since bkit collects zero personal data, there is nothing to request, export, or delete under GDPR, CCPA, or similar regulations. If you have concerns about data processed by Claude Code itself, contact Anthropic directly.

## Verifying These Claims

bkit is fully open source under the Apache 2.0 license. You can verify every claim in this document:

1. **Search the codebase** for network calls: `grep -r "fetch\|axios\|http\|request" lib/`
2. **Inspect hook scripts** in `hooks/` and `scripts/` — all operate on local files
3. **Review agent definitions** in `agents/` — no external endpoints
4. **Check dependencies** — bkit has zero third-party runtime dependencies

Repository: [github.com/popup-studio-ai/bkit-claude-code](https://github.com/popup-studio-ai/bkit-claude-code)

## Changes to This Policy

If this policy changes, the update will be reflected in this file with a new date and version number. Since bkit collects no data, changes are unlikely.

## Contact

For questions about this privacy policy or the bkit plugin:

- **GitHub Issues:** [github.com/popup-studio-ai/bkit-claude-code/issues](https://github.com/popup-studio-ai/bkit-claude-code/issues)
- **Organization:** Popup Studio AI
