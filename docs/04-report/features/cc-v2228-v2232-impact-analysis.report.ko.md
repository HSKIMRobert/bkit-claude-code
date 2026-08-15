# CC v2.1.228 → v2.1.232 영향 분석 보고서 (사이클 #37)

> `/bkit:cc-version-analysis` 워크플로 산출물
> 작성일: 2026-08-14 · baseline: CC v2.1.227 · target: CC v2.1.232
> bkit 버전: v2.1.37 (`.claude-plugin/plugin.json`)

---

## Executive Summary

이번 구간의 헤드라인은 **CC v2.1.232가 인터랙티브 세션에서 서브에이전트 fork를 기본
활성화했고, 그 부작용으로 모델이 전경(foreground) 실행을 요청할 수단 자체를 잃었다**는
것이다. CC는 fork가 켜지면 Agent 툴 스키마에서 `run_in_background` 파라미터를 **제거**한다.
이것은 추론이 아니라 CC 공식 문서의 명시적 서술이며(`sub-agents.md:1064`), 이 보고서를
작성한 세션 자신이 그 상태에서 실행되었다.

bkit에 대한 영향은 두 갈래로 **정확히 갈린다**.

- **스킬 경로는 안전하다.** v2.1.31이 8개 `context: fork` 스킬에 넣은 `background: false`는
  232에서 그대로 유효하다. 바이너리 실측으로 확정했다 — 스킬의 배경실행 결정 함수는
  fork 게이트를 **호출하지 않으며**, 227/228/231/232 네 빌드에서 논리가 동일하다.
- **Agent 툴 경로는 열화한다.** bkit sprint가 Task 툴 결과를 동기적으로 기다리는 지점이
  **5곳** 있고, fork 모드에서 이들은 크래시가 아니라 `no_output` / `no_json` /
  `agentSpawner returned invalid output`으로 **결정론적으로 열화**한다.

한편 **훅 계약은 전량 불변**이다. 마커 10종을 4개 바이너리에서 재측정해 Breaking 0을
인증했고, **누적 연속 호환은 170 → 171**로 올린다.

가장 불편한 발견은 CC가 아니라 bkit 자체에 있다. **ENH-420~439 중 19개가 착지하지
않았다.** 원장 번호는 473까지 올라갔지만 그것은 v2.1.36/37이 *다른* 작업에 440~473을
배정했기 때문이며, 사이클 #35·#36이 도출한 개선안은 거의 그대로 남아 있다. 특히
`cc-version-checker.js`에 **상한이 없어 오늘 v2.1.232 사용자는 `ok` 판정을 받는다** —
이번 사이클이 fork 기본값 변경을 미검증으로 분류했음에도 그렇다.

### 4-관점 가치 표

| 관점 | 이번 구간의 값 |
|---|---|
| **사용자** | 인터랙티브 세션에서 bkit sprint 게이트 측정이 조용히 실패하지 않고 `no_output`으로 정직하게 실패한다. 다만 실패한다. |
| **개발자** | 스킬 방어는 손댈 필요 없음이 바이너리로 확정 — 불필요한 작업 회피. Agent 경로 5곳만 좁혀서 대응 가능. |
| **운영** | `~/.claude/projects/<project>/memory/`가 retention sweep에서 제외되도록 v2.1.228이 수정. 이 워크플로의 롤링 상태가 정확히 그 경로에 있다. |
| **품질** | 인터랙티브 라이브 커버리지가 **0**임이 드러났다. 하네스는 `-p` 전용이라 fork 기본값을 원리적으로 검출할 수 없다. |

---

## 1. 검증 게이트 (Phase 1.5)

메인 세션이 총계를 **먼저** 확정한 뒤 조사 에이전트에 전제로 제공했다(ERRATA-31-1 절차).
이로써 **4사이클 연속 카운트 errata 0**을 유지한다.

| 필드 | 조사자 보고 | raw 검증 | 출처 | 판정 |
|---|---|---|---|---|
| v2.1.232 bullets | 49 | 49 | raw CHANGELOG.md | match |
| v2.1.231 bullets | 1 | 1 | raw CHANGELOG.md | match |
| v2.1.230 bullets | 섹션 부재 | **섹션 부재 + npm 미게시** | CHANGELOG + `npm view … versions` | match |
| v2.1.229 bullets | 32 | 32 | raw CHANGELOG.md | match |
| v2.1.228 bullets | 18 | 18 | raw CHANGELOG.md | match |
| **총계** | **100** | **100** | 합 | **match** |

**R-2 확정 — v2.1.230은 스킵된 버전이다.** 3중 확인: CHANGELOG 섹션 부재 ·
`npm view @anthropic-ai/claude-code versions`에 미등재 · `~/.local/share/claude/versions/`에
바이너리 부재. 문서 누락이 아니라 버전 자체가 존재하지 않는다.

**npm 게시 시각 (실측)**

| 버전 | 게시 시각 (UTC) |
|---|---|
| 2.1.227 | 2026-08-10T20:56:57Z |
| 2.1.228 | 2026-08-11T17:45:45Z |
| 2.1.229 | 2026-08-12T19:28:48Z |
| 2.1.231 | 2026-08-13T08:27:21Z |
| 2.1.232 | 2026-08-13T21:30:53Z |

**dist-tags**: `latest`=2.1.232 · `next`=2.1.232 · `stable`=**2.1.223** (직전 사이클 2.1.220에서 이동)

---

## 2. 관련 문서

- 직전 보고서: `docs/04-report/features/cc-v2226-v2227-impact-analysis.report.{ko,en}.md`
- 결함 대응 이력: `CHANGELOG.md` `[2.1.36]`, `[2.1.37]`
- 모니터링 가이드: `docs/06-guide/cc-version-monitoring.guide.md`
- ADR 0006 (Empirical Validation Gate), ADR 0014, ADR 0016

---

## 3. CC 버전 변경사항 조사

### 3.1 분포

| 버전 | bullets | HIGH | MED | LOW | bkit 관련 |
|---|---|---|---|---|---|
| 2.1.232 | 49 | 2 | 8 | 39 | 8 |
| 2.1.231 | 1 | 0 | 0 | 1 | 0 |
| 2.1.229 | 32 | 2 | 4 | 26 | 6 |
| 2.1.228 | 18 | 2 | 3 | 13 | 5 |
| **합** | **100** | **6** | **15** | **79** | **17** |

### 3.2 HIGH 항목 6건

| ID | verbatim (선두) | 영향 |
|---|---|---|
| 232-01 | `Subagent forking is now on by default: a subagent_type: "fork" subagent inherits the full…` | 본 사이클 헤드라인 |
| 232-29 | `Fixed a startup race that could silently unregister a plugin marketplace due to concurrent writes…` | bkit 마켓플레이스 등록 소실 위험 |
| 229-02 | `Added server-supplied Claude Code hook support for self-hosted runner sessions…` | 훅 provenance 확장 (계약은 불변) |
| 229-28 | `Changed /commit-push-pr so git/gh commands with dangerous flags … no longer auto-approved` | bkit 가드레일과 겹침/공백 |
| 228-08 | `Fixed session cleanup deleting contents inside a project's memory folder` | 이 워크플로의 롤링 상태 경로 |
| 228-09 | `Fixed background plugin-cache cleanup deleting a plugin's cache when its only version is a symlinked…` | bkit 개발 체크아웃 |

### 3.3 232-01 fork 기본값 — 바이너리 확정

**메인 세션이 조사자 주장을 전량 재현했다** (ERRATA-32-5 충족).

기본값 플립의 바이트 근거 — 최종 폴스루가 `"disabled"`에서 `"default"`로 바뀌었다:

```js
// 2.1.231 — 최종 폴스루 "disabled"
function SO_(){ if(Cme())return"disabled";
  if(Q.CLAUDE_CODE_FORK_SUBAGENT===!0)return"env";
  if(Q.CLAUDE_CODE_FORK_SUBAGENT===!1)return"disabled";
  if(kn())return"disabled";
  if(rt(bO_,!1))return"gb_rollout";      // bO_ = "tengu_copper_fox", 기본 false
  return"disabled" }

// 2.1.232 — 최종 폴스루 "default" (= 활성)
function Yrb(){ if(Y.CLAUDE_CODE_FORK_SUBAGENT===!0)return"env";
  if(Nn())return"disabled";              // Nn() = !isInteractive()
  return"default" }
```

독립 확증 — 롤아웃 게이트가 **개명이 아니라 삭제**되었다:

| 마커 | 227 | 228 | 231 | 232 |
|---|---|---|---|---|
| `tengu_copper_fox` | 2 | 2 | 2 | **0** |
| `copper_fox` | 2 | 2 | 2 | **0** |
| `CLAUDE_CODE_FORK_SUBAGENT` | 4 | 4 | 4 | **7** |
| `forkSubagent` | 0 | 0 | 0 | **5** |
| `run_in_background` | 49 | 49 | 49 | 50 |
| `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS` | 6 | 6 | 6 | 6 |

**232에서 fork가 꺼지는 조건은 정확히 3가지뿐이다**: 비인터랙티브(`-p`/SDK) ·
coordinator 모드 · `CLAUDE_CODE_FORK_SUBAGENT=0`.

공식 문서가 이를 명시한다 (`sub-agents.md:1059`, verbatim):

> "Claude Code turns fork mode on by default in interactive sessions and leaves it off by
> default in non-interactive mode with `-p` and in the Agent SDK. **The interactive default
> requires Claude Code v2.1.232 or later.**"

그리고 결정적으로 (`sub-agents.md:1064`, verbatim):

> "Claude Code runs the subagents Claude spawns in the background, forks and named subagents
> alike… **Claude Code also removes the Agent tool's `run_in_background` parameter, so Claude
> can't ask for the foreground.**"

**이 문장은 본 보고서 작성 세션에서 실증되었다.** 이 세션의 Agent 툴 스키마 파라미터는
`description / isolation / model / prompt / subagent_type` 뿐이며 `run_in_background`가 없다.
조사 에이전트 호출은 백그라운드로 실행되었고 결과는 후속 턴 알림으로 도착했다.

우선순위 (`sub-agents.md:793-798`): ① `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1` → 전경
(fork 모드 무관) ② in-process teammate 스폰 → 전경 ③ fork 모드 on → 배경, 전경 요청 불가
④ fork 모드 off → 기본 배경, 필요 시 전경 요청 가능.

`Agent(fork)` deny 규칙은 **fork만 막고 배경실행은 유지**한다(`:1071`). 즉 권한 규칙은
완화책이 되지 못한다.

### 3.4 229-28 `/commit-push-pr` — 실제 데니리스트 56 패턴

CHANGELOG의 "etc."가 숨긴 실체. 231/232 바이너리에서 추출:

```js
hli=["git commit *--fil*","git commit * -F*","git commit *--te*","git commit * -t*",
     "git commit *--pathspec-fr*","git commit *--no-veri*","git commit *--no-g*",
     "git commit *--am*","git commit *--allow-empty*","git commit *--reu*","git commit *--ree*"],
gli=["git push *--force*","git push * -f*","git push *--de*","git push * -d*","git push * :**",
     'git push *":**',"git push *':**","git push * +*",'git push *"+*',"git push *'+*",
     "git push *--pu*","git push * -o*","git push *--m*","git push *--pru*",
     "git push *--no-veri*","git push *--rece*","git push *--e*"],
yli=["gh pr create *--repo*","gh pr create * -R*","gh pr create *--body-file*", …],
_li=["git checkout *--f*","git checkout * -f*"],
bli=["git add --f*","git add * --f*","git add -f*","git add * -f*","git add --c*","git add * --c*"],
Dqp=["gh pr edit *--repo*", …]
ySH=cYe([...bli,...hli,..._li,...gli,...yli,...Dqp]);   // Bash(x)+PowerShell(x) 2배 = 112 규칙
```

허용리스트도 동시 축소되었다: `git commit *` → `git commit -m *`,
`gh pr create *` → `gh pr create --title * --body *`.

### 3.5 231 — 총칭 1줄이나 실체가 착지한 릴리스

231의 CHANGELOG는 MCP OAuth 수정 1줄뿐이지만, **`launcher_hooks` 검증기가 실제로 착지한
바이너리가 231이다** (0/0/**30**/30, 메인 재현). 총칭 릴리스를 무변화로 읽으면 안 된다
(ERRATA-37-5).

```js
// 2.1.231
m5v=/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,62}\.(py|sh)$/,
h5v=new Set(["Stop","SubagentStop","UserPromptSubmit","SessionStart","SessionEnd",
             "PreToolUse","PostToolUse","PreCompact","Notification"]);
```

`SubagentStart`는 이 집합의 멤버가 **아니므로** 카운트가 36으로 고정되며, 이것이 231
델타 귀속의 결정적 판별자다.

---

## 4. bkit 영향 분석

### 4.1 아키텍처 실측 (사이클 #37)

| 항목 | 값 | 측정 명령 |
|---|---|---|
| Agents | 34 | `ls -1 agents/*.md \| wc -l` |
| Skills | 44 | `ls -1d skills/*/ \| wc -l` |
| Lib 모듈 | 199 | `find lib -name '*.js' \| wc -l` |
| Lib subdirs | 22 | `ls -1d lib/*/ \| wc -l` |
| Scripts | 66 | `find scripts -name '*.js' \| wc -l` |
| `test/` | 344 | `find test -name '*.test.js' \| wc -l` |
| `tests/` | 33 | `find tests -name '*.test.js' \| wc -l` |
| plugin 버전 | 2.1.37 | `.claude-plugin/plugin.json` |

**정의 주의**: scripts는 세는 방식에 따라 62/66/67로 갈린다. errata가 아니라 정의 차이다.

### 4.2 스킬 경로 — 영향 없음 (바이너리 확정)

스킬의 배경실행 결정은 **별도 함수**이며 fork 게이트를 호출하지 않는다. 메인이 3개
버전에서 재현했다:

```js
// 227  function lQo(e,t){ if(t||Ev()||Rn())return!1; return e.background??!0 }
// 231  function xai(e,t){ if(t||Vv()||kn())return!1; return e.background??!0 }
// 232  function Xyi(e,t){ if(t||k0()||Nn())return!1; return e.background??!0 }
```

참조 대상은 스킬 자신의 `background`, `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS`, 비인터랙티브
뿐이다. fork 게이트 `HRe()` 호출 **0회**.

문서도 일치한다 (`skills.md:339`): `background`는 `context: fork` 전용이며 기본 `true`,
`false`는 호출 턴 안에서 결과를 기다린다는 뜻.

**따라서 v2.1.31의 완화는 232에서 유효하며, 스킬 frontmatter는 손댈 필요가 없다.**

대상 8개 스킬 (실측): `phase-1-schema`, `phase-2-convention`, `phase-3-mockup`,
`phase-4-api`, `phase-5-design-system`, `phase-8-review`, `skill-status`, `zero-script-qa`.

> **정정**: 롤링 메모리의 "9 스킬 `background: false`"는 오기다. 실측 **8**이며, 9는
> qa-phase가 fork 집합을 떠나기 *전*의 수다 (ERRATA-37-4).

### 4.3 Agent 툴 경로 — 결정론적 열화 5곳

bkit이 Task 툴 결과를 동기적으로 소비하는 지점 (전부 메인 직접 확인):

| # | 위치 | 코드 | fork 모드에서의 결과 |
|---|---|---|---|
| ① | `lib/application/quality-gates/measure-router.js:426` | `agentResult = await runner({ subagent_type, prompt })` | `:309` `typeof agentResult.output !== 'string'` → `reason:'no_output'` |
| ② | `lib/application/sprint-lifecycle/measure-gate.usecase.js:104` | `await routerImpl.measureGate(gateKey, sprint, {agentTaskRunner})` | ①로 전파 |
| ③ | `lib/application/sprint-lifecycle/master-plan.usecase.js:392` | `const result = await d.agentSpawner({...})` | `:396-398` 하드 실패 `agentSpawner returned invalid output` |
| ④ | `lib/infra/sprint/gap-detector.adapter.js:118` | `await o.agentTaskRunner({subagent_type:'gap-detector'})` | `:125-126` `matchRate:0, measured:true` |
| ⑤ | `lib/infra/sprint/auto-fixer.adapter.js:69` | `await o.agentTaskRunner({subagent_type:'pdca-iterator'})` | `:75` `fixedTaskIds:[], error` |

호스트 어댑터 `scripts/lib/sprint-handler-shared.js:478-481`:

```js
return async ({ subagent_type, prompt }) => {
  const result = await host.invokeTaskTool({ subagent_type, prompt });
  return { output: (result && result.text) || '' };
};
```

그리고 문서화된 계약 `skills/sprint/SKILL.md:257`이 동기 패턴을 가르친다:

```js
return { text: await callTaskTool({ subagent_type, prompt }) };
```

`agents/sprint-orchestrator.md:64-66`은 `Task({...}) — await completion`을 3회 반복한다.
이것이 bkit이 대외 광고하는 차별화 #3 **"Sequential Dispatch"** 의 구현 서술이다.

**완화 요인 (과장 금지)**: 5곳 전부 크래시나 데이터 손상이 아니라 **정직한 측정 실패**로
떨어진다. 그리고 **bkit은 `run_in_background`를 어디에도 넘기지 않는다** — 저장소 전체
런타임 코드 0건(유일한 2건은 과거 보고서 산문). 따라서 파라미터 제거 자체는 무해하며,
남는 위험은 **결과 전달 시점**이다.

**단, ④는 별개 결함이다.** 같은 파일 `:88-89`가 `no_agent_runner`에 대해
`matchRate:null, measured:false`라는 정직한 인코딩을 쓰는데, `:125-126`은 러너 오류를
`matchRate:0, measured:true`로 기록한다. 측정하지 못한 것을 0점으로 측정했다고 기록하는
것으로 ENH-410/412와 같은 계열이다.

### 4.4 232-43 입력 리다이렉션 — 순수 이득

`permissions.md:407`: "PreToolUse hooks run **before the permission prompt**". 즉 권한 검사는
훅 **이후**이므로 `tool_input.command` 원문은 불변이다. bkit은 이미 대응되어 있다 —
`destructive-detector.js:421`이 `<`를 세그먼트 경계로 취급한다. **변경 불요.**

### 4.5 228-17 Write 툴 — bkit 표면 0

`tools-reference.md:466-472`가 경계를 명시한다: Opus 4.6 / Haiku 4.5 **이하**는 여전히
read 선행 필수, 그 이후 모델은 Edit과 동일 규칙. bkit 핀 모델(Opus 5 / Sonnet 5 / Fable 5 /
Haiku 5)은 전부 "newer"에 해당한다. 툴 레이어 강제는 존속하고, `scripts/pre-write.js`에는
read 추적 코드가 **없다**(실측). **표면 0.**

### 4.6 228-08 memory 폴더 — 코드 영향 0, 운영 영향 HIGH

`memory.md`가 228 수정을 반영해 `~/.claude/projects/<project>/memory/`가 retention sweep에서
**제외됨**을 명시한다. bkit 런타임 코드 영향은 없다. 그러나 **이 워크플로의 롤링 상태가
정확히 그 경로에 있다.** v2.1.227 이하에서 소실 위험이 있었다. 사이클 #36에서 관측된
메모리 stale(ERRATA-36-2)과의 인과는 **미검증**이며 추정하지 않는다.

### 4.7 232-29 마켓플레이스 경쟁 조건 — 실노출

`~/.claude/plugins/known_marketplaces.json`에 `claude-plugins-official`과
`bkit-marketplace` 2개가 동시 기록되어 있어 경쟁 조건 성립 요건을 충족한다. bkit 런타임은
이 파일을 **읽지 않으므로** 자체 감지가 불가능하다. 232가 이를 고쳤다는 것은 순수 이득이나,
**232 미만 사용자는 bkit 마켓플레이스 등록이 조용히 사라질 수 있다** — ENH-437(KNOWN_BAD)의
근거를 하나 더 보탠다.

부수 확인: `additionalMarketplaces` / `allowedMarketplaces` 별칭이 232 바이너리에 신규
등장(0/0/0/**9**, 0/0/0/**4**). `CUSTOMIZATION-GUIDE.md:1755,1779,1783`은 구 키만 안내한다.

---

## 5. 호환성 평가

### 5.1 훅 계약 인증 — Breaking 0

**메인 세션이 마커 10종을 4개 바이너리에서 독립 재측정했다.**
명령: `grep -a -o -F -e '<needle>' -- <binary> | wc -l`

| 마커 | 227 | 228 | 231 | 232 |
|---|---|---|---|---|
| `hookSpecificOutput` | 124 | 124 | 124 | 124 |
| `continueOnBlock` | 3 | 3 | 3 | 3 |
| `permissionDecision` | 34 | 34 | 34 | 34 |
| `permissions.deny` | 9 | 9 | 9 | 9 |
| `forked_skill_depth_cap` | 2 | 2 | 2 | 2 |
| `bashCommandClamp` | 42 | 42 | 42 | 42 |
| `hook_event_name` | 78 | 78 | 78 | 78 |
| `stop_hook_active` | 7 | 7 | 7 | 7 |
| `"SubagentStart"` | 13 | 13 | 13 | 13 |
| `launcher_hooks` | 0 | 0 | **30** | **30** |

227 열은 직전 사이클 실측치와 전부 일치한다 — 두 독립 측정이 재현되었다.

**판정: 이벤트 어휘 · 입력 페이로드 스키마 · `hookSpecificOutput` union 전부 바이트 동일.
Breaking 0.** 실질 변경 2건은 모두 additive다:
- 231 `launcher_hooks` 허용목록 (신규 표면, 기존 계약 무변)
- 232 부모-에이전트 인식 훅 스코핑 — **누가** 발화하는가만 바뀌고 페이로드·차단 의미론 불변

> **누적 연속 호환: 170 → 171 인증.**

**부수**: `continueOnBlock` 3/3/3/3 — 사이클 #36의 "prompt 타입 훅 정의 전용이며 bkit의
command 타입 훅 28개에서 도달 불가"라는 결론이 227~232 전 구간에서 재확인되었다.
**ENH-432 철회 유지.**

### 5.2 크기 · 세그먼트

| 버전 | bytes | `__TEXT` | `__BUN` | `__LINKEDIT` |
|---|---|---|---|---|
| 227 | 294,700,704 | 71,524,352 | 219,070,464 | 2,545,312 |
| 228 | 298,977,312 | **71,524,352** | 223,313,920 | 2,578,464 |
| 231 | 303,439,136 | 71,077,888 | 228,163,584 | 2,616,608 |
| 232 | 314,779,248 | 74,178,560 | 236,322,816 | 2,700,912 |

**227→228은 네이티브 영역이 바이트 동일**하다 — 페이로드 교체만 일어났다. 231·232는 진짜
네이티브 재빌드다.

### 5.3 ADR 0006 트랙 판정

**`defer`.** 사유는 Skip Criteria 3 — "미검증 상위 거동(unverified upstream behavior)".
fork 기본값이 bkit이 의존하는 계약을 바꾸었으나 인터랙티브 실증이 미완이다.

- `RECOMMENDED_VERSION = '2.1.220'` **유지(HOLD)**
- **단, 유지만으로는 부작위다.** `cc-version-checker.js:305-311`에는 `<MIN → error`,
  `<RECOMMENDED → warn`, `else ok` 3분기뿐이고 **상한이 없다.** 오늘 v2.1.232 사용자는
  `ok` 판정을 받는다.
- `release_drift_score` = |stable 2.1.223 − RECOMMENDED 2.1.220| = **3** (0~3 구간, 고지 불요).
  **이 지표는 상한 부재 위험을 표현하지 못한다.**

---

## 6. 브레인스토밍 결과 (Plan Plus)

### 6.1 의도 탐색

**이 업그레이드에서 bkit이 얻을 수 있는 최대 가치는?**
"안 해도 되는 일"의 확정이다. fork 기본값 변경은 v2.1.31급 대응을 요구하는 것처럼 보였고
실제로 그렇게 시작했으나, 바이너리 실측이 스킬 경로의 안전을 확정하면서 대응 범위가 8개
스킬 + 44개 스킬 전수 점검에서 **Agent 스폰 5곳**으로 줄었다.

**놓치면 안 되는 critical change는?**
`run_in_background` 파라미터 제거다. 이것은 완화책의 선택지를 좁힌다 — 코드로는 대응할 수
없고 환경변수뿐이다.

**기존 workaround를 대체할 수 있는 native 기능은?**
229-28의 56패턴 데니리스트가 bkit 가드레일과 부분적으로 겹친다. 다만 CC 쪽은
`/commit-push-pr` 스킬 **스코프 한정**이고 bkit은 전역 Bash 훅이므로 대체 관계가 아니라
보완 관계다. 겹침을 이유로 bkit 가드를 제거해서는 안 된다.

### 6.2 대안 탐색 — Agent 스폰 열화 대응

| 안 | 내용 | 평가 |
|---|---|---|
| **A** | `CLAUDE_CODE_FORK_SUBAGENT=0`을 문서로 권고 | 사용자 환경 강제, bkit이 CC 기본값을 되돌리라고 요구하는 모양새. **비권장** |
| **B** | 5곳의 실패 메시지를 fork 모드 인지형으로 개선 | 저비용, 정직. 사용자가 원인을 안다. **권장** |
| **C** | 모델에게 후속 턴에서 결과를 주입하도록 SKILL.md 지침 개정 | 근본적이나 인터랙티브 실증 선행 필요 |
| **D** | 아무것도 안 함 | 실패가 결정론적이고 정직하므로 최악은 아님. 그러나 `④ matchRate:0` 오기록은 별도로 고쳐야 함 |

**결론: B + C(실증 후)**. A는 채택하지 않는다.

### 6.3 YAGNI 검토

| 후보 | 판정 |
|---|---|
| `bashCommandClamp` 채택 | **DROP** — 42/42/42/42 고정, 에이전트 frontmatter 16필드에 없어 도달 불가 |
| 232-45 Cowork @-import 대응 | **DROP** — bkit `@import`는 자체 리졸버(`lib/import-resolver.js`), CC 것이 아님 |
| 228-17 Write 툴 대응 | **DROP** — bkit 표면 0 |
| 228-09 심링크 캐시 대응 | **DROP** — 캐시가 실체 복사본, 개발은 `--plugin-dir` 경유 |
| 232-07 GitLab / 229-04 command 소스 | **DROP** — 무영향 |
| fork 스킬 8개 재점검 | **DROP** — 바이너리로 안전 확정 |

### 6.4 이번 사이클의 최상위 발견은 CC가 아니라 원장이다

**ENH-420~439 중 착지한 것은 ENH-424 하나뿐이다.** 19개가 미착지 상태다.

```
미착지: 420 421 422 423 425 426 427 428 429 430 431 432 433 434 435 436 437 438 439
```

원장 최고 번호가 473인 것은 v2.1.36/37이 *다른* 작업(가드레일 정밀도, 권한 모드)에
440~473을 배정했기 때문이다. 즉 **번호는 자라는데 사이클이 도출한 개선안은 쌓이기만
한다.** 이번 사이클이 신규 번호를 더 찍는 것은 이 문제를 악화시킨다.

**따라서 이 보고서는 미착지 번호를 재개하고, 진짜 신규만 474부터 배정한다.**

이월 항목 실측 확인:

| ENH | 상태 | 증거 |
|---|---|---|
| 420~422 | 미착지 | `scripts/cc-binary-equivalence.js` 부재 |
| 432 | 미착지 | `marketplace.json:36`이 여전히 차별화 #5로 `PostToolUse continueOnBlock` 광고 |
| 434 | 미착지 | `skills_preload:`가 4개 에이전트에 잔존 (bkend-expert, bkit-impact-analyst, code-analyzer, pdca-iterator) — 나머지 19개는 올바른 `skills:` 사용 |
| 435 | **부분 해소** | Lib 199 ✓ · Hook Events 21 ✓ · blocks 24 ✓ · Scripts 62(표기) vs 66(실측) ✗ |
| 436 | 미착지 | `cc-v2225-v2226-impact-analysis.report.ko.md`에 `.en.md` 짝 없음 |
| 437 | 미착지 | `cc-version-checker.js:305-311` 상한 없음 |

`skills_preload`는 CC 공식 문서에 **0회** 등장하며, `sub-agents.md:285-300`이 확정한 에이전트
frontmatter 16필드에도 없다. 실제 필드는 `skills:`다.

---

## 7. 구현 제안 (ENH)

### 7.1 재개 (미착지 이월 — 신규 번호를 소각하지 않는다)

| ENH | P | 내용 | 근거 |
|---|---|---|---|
| **437** | **P0** | `cc-version-checker`에 KNOWN_BAD 상한 도입 | `:305-311` 3분기에 상한 없음 → 232 사용자가 오늘 `ok`. 232-29 마켓플레이스 경쟁 조건이 232 미만에서 미수정인 점도 근거 |
| **432** | **P1** | 차별화 #5 `PostToolUse continueOnBlock` 철회 + 테스트를 행동 단언으로 전환 | `continueOnBlock` 3/3/3/3, bkit 훅 28개 전부 command 타입 → 도달 불가 재확인. `marketplace.json:36` 대외 광고 잔존 |
| **434** | **P1** | `skills_preload:` → `skills:` (4 에이전트) | CC 문서 0회, 16필드 미포함. bkit 자체가 19개 에이전트에서 올바로 사용 중(자기모순) |
| **433** | **P1** | `outputAllow(msg,'PostToolUse')` 허공 쓰기 | 이월. **선행조건: PostToolUse 외 8개 이벤트 가시성 실측** — 추론 일괄치환 금지 |
| **420~422** | **P1** | `scripts/cc-binary-equivalence.js` 신설 | 부재 확인. 이번 사이클도 바이너리 측정을 매번 수작업 재구성했다 |
| **435** | **P2** | `marketplace.json` Scripts 카운트 62 → 66 | 나머지는 해소됨 |
| **436** | **P3** | `cc-v2225-v2226` 보고서 `.en.md` 생성 | CLAUDE.md 이중언어 규칙 위반 |

### 7.2 신규 (474부터)

| ENH | P | 내용 | 근거 |
|---|---|---|---|
| **474** | **P0** | 인터랙티브 라이브 커버리지 신설 | `test/qa-harness-full-live.js:166`이 `-p` 전용 → fork 모드 OFF. `test/e2e/permission-mode-matrix.test.js`는 `execFile`로 훅만 직접 실행(CC 미기동). `test/e2e/*.sh`도 CC 미기동. **fork 기본값을 원리적으로 검출 불가.** ADR 0006 Skip Criteria 3 해소의 선행조건 |
| **475** | **P1** | Agent 스폰 5곳의 실패 메시지를 fork 모드 인지형으로 | 6.2안 B. `measure-router.js:426`, `measure-gate.usecase.js:104`, `master-plan.usecase.js:392`, `gap-detector.adapter.js:118`, `auto-fixer.adapter.js:69` |
| **476** | **P1** | `gap-detector.adapter.js:125-126` 러너 오류를 `matchRate:null, measured:false`로 | 같은 파일 `:88-89`의 정직한 인코딩과 모순. ENH-410/412 계열 |
| **477** | **P1** | `--amend` / `--no-verify` / `git add -f` / `git checkout -f` 가드 부재 | bkit 16규칙 중 해당 0개(perl 확인). CC는 56패턴 도입. 단 CC는 `/commit-push-pr` 스코프 한정이므로 bkit 전역 가드는 여전히 필요 |
| **478** | **P2** | `sprint/SKILL.md:257` + `sprint-orchestrator.md:64-66`의 동기 계약 서술 개정 | fork 모드에서 성립하지 않는 패턴을 문서가 가르치고 있음. **474 실증 후 착수** |
| **479** | **P2** | `CUSTOMIZATION-GUIDE.md:1755,1779,1783`에 신규 별칭 병기 | `additionalMarketplaces` / `allowedMarketplaces` |
| **480** | **P3** | `agents/pipeline-guide.md:21` `when_to_use:` 제거 | 에이전트 16필드에 없음(스킬 전용) → 무음 무시. ENH-434 동일 계열 |

### 7.3 우선순위 근거

**P0가 2건뿐인 이유**: fork 대응(ENH-475)을 P0로 올리지 않았다. bkit이
`run_in_background`를 넘기지 않으므로 스키마 변경이 무해하고, 실패가 결정론적이며,
**실제 파손 여부가 아직 미측정**이기 때문이다. 미측정 상태에서 P0를 찍는 것은 사이클 #36의
ENH-432 오류(검증 없이 P0 배정 후 철회)를 반복하는 것이다. 대신 **측정 수단 자체(ENH-474)를
P0로 올린다.**

**ENH-437이 P0인 이유**: 이것은 새 위험이 아니라 **사이클 #36이 이미 P1으로 지정했으나
착지하지 않은 항목**이며, 그 사이 CC는 5개 릴리스를 더 냈다. 체커에 상한이 없다는 것은
bkit이 "미검증"이라고 판정한 버전의 사용자에게 아무 신호도 주지 않는다는 뜻이다.

---

## 8. GitHub Issues 모니터링

### 8.1 추적 세트 22건 — 20 OPEN / 2 CLOSED

**228~232 5개 릴리스에서 행동 계열 해소 0건.** 닫힌 2건은 47분 간격의 문서 이슈뿐이다.

| # | state | 요지 |
|---|---|---|
| 84302 | OPEN | Killed PreToolUse hook → CLI가 게이트된 툴을 ALLOW (fail-open) |
| 84701 | OPEN | Task 서브에이전트 Bash에 PreToolUse deny 미강제 |
| 84632 | OPEN | if-scoped PreToolUse 무조건 발화, 차단 안 됨 |
| 84697 | OPEN | 특정 경로 deny 규칙이 Write/Edit에 조용히 미강제 |
| 84926 | OPEN | PreToolUse 페이로드에 호출자 신원 없음 |
| 84685 / 84493 | OPEN | worktree 격리가 세션 전역 |
| 84892 / 84925 / 84960 | OPEN | 2.1.224 회귀 3건 |
| 84589 | OPEN | `permissionDecision:'defer'` → 툴 결과 소실 |
| 84969 | OPEN | `permissions.ask`의 `:*` 위치 의존 무음 무시 |
| **84939** | **CLOSED** 08-11 | [DOCS] plugin install이 `bun install`/`npm ci` 무음 실행 |
| 84863 / 84906 | OPEN | 샌드박스·권한 매처 |
| **84656** | **CLOSED** 08-11 | [DOCS] PreToolUse 훅 계약의 timeout/spawn-failure 미명시 |
| 78406 / 68110 / 64436 | OPEN | 문서·재귀 스폰·OTEL |
| 85665 | OPEN | 2.1.227 인터랙티브 transcript JSONL 미기록 |
| 85669 | OPEN | 첨부 프롬프트에서 UserPromptSubmit 훅 미발화 |
| 85700 | OPEN | Edit이 성공 보고 후 디스크에 미기록 (worktree + PreToolUse) |

**PreToolUse fail-open 계열(84302/84701/84697/84589)이 전부 미해결**이라는 점이 중요하다.
bkit의 방어 레이어는 이 계열 위에 서 있다.

### 8.2 창 총계 (절단 없음 증명)

`gh api -X GET search/issues -f q='repo:anthropics/claude-code is:issue created:2026-08-11..2026-08-14' -f per_page=1 --jq '.total_count'`

- 신규 **971** / 종결 **480**
- 일별: 08-11 **292** · 08-12 **280** · 08-13 **314** · 08-14 **85**(부분일)
- **292+280+314+85 = 971 — 범위 총계와 정확 일치. 절단 없음.**

### 8.3 #85765 — 본 사이클 핵심 이슈 (메인 독립 검증)

`gh issue view 85765 --repo anthropics/claude-code --json number,title,state,createdAt,labels`

- **번호 85765 · OPEN · created 2026-08-11T08:55:24Z**
- **라벨**: `bug`, `has repro`, `platform:linux`, `area:agents`, `area:agent-sdk`
- **제목**: `Agent(run_in_background: false) does not block — returns spawn metadata instead of the agent's result (v2.1.227)`

이 이슈는 **227에서 파라미터를 넘길 수 있었을 때조차 블로킹되지 않았음**을 보고한다.
232는 그 파라미터를 아예 제거했다. 즉 bkit의 Agent 스폰 동기 가정은 232 이전부터
불안정했을 가능성이 있다 — **미검증이며 추정하지 않는다.**

### 8.4 #85699 — bkit v2.1.37과 충돌 아님, 상보

- OPEN, created 2026-08-11T03:08:15Z, 코멘트 0, 명시 버전 2.1.227 단독
- 요지: 세션이 자기 실효 권한 모드를 알 수 없다. 본문 verbatim: "Claude Code knows each
  session's effective permission mode… **It does not expose it to the model running in that
  session.**"

**bkit 판정**: #85699는 **모델 컨텍스트** 층 결함이다. bkit v2.1.37이 고친 것은 **훅 페이로드**
층이며 CC는 훅에 `permission_mode`를 정상 전송한다. **bkit v2.1.37은 #85699에 막히지 않고
228~232에서 무효화되지 않는다.**

### 8.5 신규 감시 7건

| # | 날짜 | 요지 | bkit 관련성 |
|---|---|---|---|
| **86478** | 08-13 | `bypassPermissions` defaultMode와 `--permission-mode` 플래그 무시 | **bkit이 읽는 `permission_mode` 값 자체가 틀릴 수 있음** — v2.1.37 직결 |
| **86405** | 08-13 | 서브에이전트 툴콜에서 Pre/PostToolUse 미발화 | #84701 evolved form 후보. 232의 부모-에이전트 스코핑 변경과 관련 가능 |
| 86499 | 08-13 (v2.1.231) | 병렬 백그라운드 서브에이전트 5+ 에서 stall-watchdog 연쇄 실패 | fork 기본값과 직결 |
| 86000 | 08-12 (v2.1.228) | 모든 Bash 명령이 자식 프로세스 없이 hang | |
| 86627 | 08-14 | 데스크톱이 플러그인 스킬을 설치 해시로 네임스페이스 → `/plugin:skill` 파손 | bkit #125 계열 재발 |
| 86564 | 08-14 | `claude plugin update <name>` bare name 실패 | |
| 85893 | 08-11 | 비활성 플러그인의 PostToolUse가 여전히 실행 | |

**R-3 후보**: #86405를 #84701의 evolved form으로 제출한다. 다만 창 내 hook 신규 111건 중
상위 12건만 조회했으므로 **전수 분류는 미완**이며, evolved form 번호 확정은 보류한다.

---

## 9. 결론 (Verdict)

**Breaking Changes 0 — 마이그레이션 불요.** 훅 계약은 227~232 전 구간에서 바이트 동일하며,
누적 연속 호환을 **170 → 171**로 인증한다.

**그러나 "호환"과 "안전"은 다르다.** CC v2.1.232는 계약을 바꾸지 않고 **기본값을 바꿈으로써**
bkit의 Sequential Dispatch 구현 가정을 흔들었다. 스킬 경로는 v2.1.31의 대응 덕에 무사하고,
Agent 경로 5곳은 결정론적으로 열화한다. 이 열화가 실사용에서 어떤 형태로 나타나는지는
**아직 측정되지 않았고, 측정할 수단이 없다** — 하네스가 `-p` 전용이라 fork 모드를 원리적으로
켤 수 없기 때문이다.

**ADR 0006 판정: `defer`** (Skip Criteria 3, 미검증 상위 거동).
`RECOMMENDED_VERSION = '2.1.220'` **유지**.

**행동 권고 순서**:
1. **ENH-474 (P0)** — 인터랙티브 라이브 커버리지. 이것 없이는 다음 사이클도 같은 자리에서
   `defer`를 반복한다.
2. **ENH-437 (P0, 재개)** — 체커 상한. 유지 결정을 사용자에게 전달할 유일한 통로다.
3. 나머지는 P1 이하.

**이번 사이클의 가장 불편한 발견은 CC 쪽이 아니다.** ENH-420~439 중 19개가 미착지 상태이며,
사이클이 도출한 개선안이 착지하지 않은 채 번호만 늘고 있다. 분석의 가치는 착지로만 실현된다.

---

## 10. ERRATA (사이클 #37)

| ID | 등급 | 내용 |
|---|---|---|
| **37-1** | **CRITICAL** | 조사 에이전트가 **미수신 서브에이전트 결과를 사실처럼 인용**했다. 한 세션에서 **3회** 발생(GitHub 이슈 / 바이너리 `launcher_hooks` / #85765 본문). 조사자가 자진 신고했고, 메인이 재측정하자 **내용은 우연히 맞았다** — 그러나 맞았다는 것이 절차를 정당화하지 않는다. ERRATA-36-1은 서브에이전트 전용이 아니라 **조사자 자신에게도 적용된다.** 부가 증폭 요인: 조사자가 **본 보고서를 전달하지 않은 채 정정문만 먼저 보냈다** — 메인이 검증할 기반 없이 정정을 받는 상태가 되었다. |
| **37-2** | HIGH | ugrep 7.5.0에서 **`-`로 시작하는 needle이 옵션으로 파싱되어 무음 0 반환.** `grep -a -o -F -e 'NEEDLE'` 또는 `-F -- 'NEEDLE'` 필수. |
| **37-3** | HIGH | **CHANGELOG의 리터럴 플래그명으로 바이너리를 diff하면 실제 변경을 놓친다.** 229-28의 실체는 절단 글롭(`*--no-veri*`)이라 리터럴 `--no-verify` 검색에 잡히지 않는다. |
| **37-4** | MED | 롤링 메모리의 "9 스킬 `background: false`"는 오기. **실측 8** (9는 qa-phase가 fork 집합을 떠나기 전의 수). |
| **37-5** | MED | **총칭 1줄 릴리스를 무변화로 읽지 말 것.** 231은 CHANGELOG상 1 bullet이나 `launcher_hooks` 검증기가 실제로 착지한 바이너리다(0/0/30/30). |
| **37-6** | MED | **needle 철자 오류는 조용한 0을 만들고, 0은 "부재"로 오독된다.** `runInBackground`/`forkGate`/`isForkGateEnabled`는 4빌드 전부 0이지만 실제 심볼은 `run_in_background`/`isForkSubagentEnabled`/`getForkSubagentSource`다. **철자 후보를 복수로 측정할 것.** |
| **37-7** | HIGH | **롤링 메모리가 ENH 원장을 431로 기록했으나 실제는 473이었다**(ERRATA-36-2 재발). 더 중요한 것은 그 격차의 성격이다 — 번호는 42 늘었지만 **사이클 #35/#36 산출물은 19개가 미착지**다. 메모리는 번호만 추적하고 **착지 여부를 추적하지 않는다.** |

### 검증 체크리스트

- [x] raw GitHub CHANGELOG.md 취득 및 총계 선확정 (메인)
- [x] bullet 카운트 교차 검증 (조사자 vs raw) — **일치, errata 0**
- [x] v2.1.230 부재 3중 확인
- [x] 바이너리 주장 메인 재현 — fork 게이트 · 스킬 background · 마커 10종 **전량 일치**
- [x] `sub-agents.md:1059/1064` verbatim 독립 취득
- [x] #85765 / #85699 `gh` 독립 조회
- [x] 5개 Agent 스폰 호출부 소스 직접 확인
- [x] ENH 원장 실측 (473) 및 **미착지 19건 식별**
- [ ] 인터랙티브 fork 모드 실증 — **ENH-474로 이월**
- [ ] PostToolUse 외 8개 이벤트 stdout 가시성 — #36에서 이월
- [ ] 창 내 hook 신규 111건 전수 R-3 분류

---

## 11. 미검증 (추정으로 메우지 않음)

1. fork 모드 ON 인터랙티브 세션에서 Task 결과가 **실제로** 어떻게 반환되는가 — ENH-474
2. #85765 본문·재현 코드 (번호·제목·상태·라벨만 확보)
3. `plugin-marketplaces.md` / `settings.md` / `plugins.md` 미조회
4. `~/.claude/plugins/cache/.../2.1.36`의 심링크 여부 직접 확인 (간접 증거 기반)
5. 228-08 memory 폴더 수정과 사이클 #36 메모리 stale의 인과
6. 창 내 hook 신규 111건 전수 분류
7. #36 이월 전량: PostToolUse 외 8개 이벤트 가시성 · `bashCommandClamp` 도달성 ·
   `disallowedTools`의 plugin agent 실강제 · 타 플랫폼 바이너리 동등성
