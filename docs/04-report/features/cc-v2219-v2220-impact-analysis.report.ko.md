# CC v2.1.219 → v2.1.220 영향 분석 보고서 (사이클 #30)

- **분석 일자**: 2026-07-28
- **범위**: CC CLI v2.1.219, v2.1.220 (baseline v2.1.218 = 사이클 #29)
- **bkit 버전**: v2.1.31 (34 Agents / 44 Skills / 22 Hook Events / 346 test files)
- **총 변경 범위**: **28 bullets** (219 = 27, 220 = 1)
- **Breaking**: 0 · **마이그레이션 필요**: 없음
- **누적 연속 호환**: **163** (v2.1.34 ~ v2.1.220)

---

## Executive Summary

CC v2.1.219는 **v2.1.217의 결정을 정면으로 되돌렸습니다**. 217은 중첩 서브에이전트
스폰을 기본 비활성화했고, 사이클 #28은 이를 bkit 설계의 상류 검증(vindication)으로
기록했습니다. 219는 **중첩 depth를 기본 3으로 되돌렸고**, opt-out 방식으로 전환했습니다.

이 역전이 중요한 이유는 세 가지입니다.

1. **원인 이슈가 아직 열려 있습니다.** #68110("General-purpose sub-agents recursively
   spawn unbounded child agents, causing exponential fan-out and massive token burn")은
   **2026-07-21 갱신, 여전히 OPEN**입니다. v2.1.219는 그 3일 뒤 빌드되었습니다.
   CC는 미해결 이슈가 기술한 바로 그 동작을 기본값으로 되돌렸습니다.
2. **기본값이 버전으로 고정되지 않습니다.** 설치본 바이너리 검사 결과 depth 기본값은
   `env var → 원격 피처 게이트 tengu_hazel_trellis → 하드코딩 폴백 3` 순으로 해석됩니다.
   해석 함수명이 `getFeatureValue_CACHED_MAY_BE_STALE`입니다. 즉 **CC 릴리스 없이,
   CHANGELOG 항목 없이, 서버 측에서 실효 depth가 바뀔 수 있습니다.**
3. **bkit에 선언된 순환 스폰 경로가 2개 있습니다.** depth 1 시절에는 도달 불가능한
   죽은 간선이었으나 이제 합법적 스폰 체인입니다.

동시에, 이 역전은 bkit의 방어 장치가 **작동한 적이 없다**는 사실을 드러냈습니다.
LB-003(에이전트 재귀 A→B→A, `action: abort`)은 정확히 이 상황을 위해 설계되었지만
**프로덕션 호출 지점이 0건**입니다.

v2.1.220은 별개입니다. 219→220 바이너리 diff 결과 실질 변경은 4건(빌드 메타데이터,
텔레메트리 필드 1개, 경고 문구 1개, 마침표 1개)뿐이며, bkit이 통합하는 표면은
전부 동일합니다.

### 4-관점 가치 평가

| 관점 | 평가 |
|---|---|
| **사용자** | 중립~부정. `model: opus` 에이전트 10개가 통보 없이 Opus 5(1M)로 전환 — 능력은 향상되나 비용 특성이 바뀜. 팀 패널은 이미 부정확(아래 ENH-374) |
| **개발자(메인테이너)** | 부정. 문서 3개소가 사실과 어긋남(ENH-372), 방어 장치 1개가 죽어 있음(ENH-373), 훅 계약 불일치 1개 확정(ENH-374) |
| **아키텍처** | 혼합. bkit의 "1-level 순차 dispatch" 규약은 이제 **CC 제약이 아니라 bkit 자체 관례**로 강등됨 — 강제 수단을 스스로 마련해야 함 |
| **전략** | 부정적 신호. 원격 피처 게이트로 인해 **버전 고정이 동작 고정을 보장하지 못하는** 새로운 변경 벡터 확인 |

---

## §1. 버전 범위 및 조사 방법

| 항목 | 값 |
|---|---|
| 설치 CC | 2.1.220 (native installer) |
| npm latest / stable | 2.1.220 / 2.1.212 |
| 이전 baseline | 2.1.218 (사이클 #29) |
| 분석 범위 | v2.1.219, v2.1.220 |

**조사 방법 3중화**:
1. raw `CHANGELOG.md` (`curl` + `awk` 섹션 절단 + `grep -cE "^- "`)
2. GitHub release tag body (`gh api repos/anthropics/claude-code/releases/tags/v*`)
3. **설치본 바이너리 직접 검사** (`~/.local/share/claude/versions/{218,219,220}`,
   Mach-O 단일 파일이나 JS 번들이 평문으로 임베드되어 zod 스키마·기본값·문서 문자열
   직독 가능)

3번은 이번 사이클에서 처음 도입했으며, 문서로 확인 불가능했던 항목 4건을 확정했습니다.

> **바이너리 근거의 한계**: 출하 아티팩트의 구현 문자열은 "코드가 무엇을 하는가"에
> 대해 문서보다 강한 증거이나, Anthropic이 공표한 계약이 아닙니다. 필드명과 기본값은
> 통보 없이 바뀔 수 있습니다.

---

## §2. 변경 카탈로그

### 2.1 카테고리 분포 (GitHub release body 기준, 27 bullets)

| 분류 | 건수 |
|---|---|
| Added | 9 |
| Fixed | 10 |
| Changed | 3 (+ #27 무접두 1건 = 실질 4) |
| Improved | 2 |
| Removed / Updated | 1 / 1 |
| **Breaking** | **0** |

### 2.2 bkit 교차 항목 (HIGH/MEDIUM)

| # | Bullet (요약) | 영향 | bkit 판정 |
|---|---|---|---|
| 27 | 중첩 서브에이전트 기본 depth 3 (was 1), `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH=1`로 비활성화 | **HIGH** | **노출 — ENH-372/373/374** |
| 1 | Claude Opus 5 기본 Opus 모델, 1M 컨텍스트, fast mode $10/$50 per Mtok | MEDIUM | 별칭 사용으로 자동 수혜, 코드 변경 불요 |
| 3 | `DirectoryAdded` 훅 신설 | MEDIUM | 미등록 — ENH-377 (P3 보류) |
| 25 | Opus 4.7 fast mode 제거 | LOW | 주석 stale 2개소 |
| 8 | `claude mcp list`/`/mcp` 오류 상세 + 공백 경고 | LOW | 진단 시너지, 조치 불요 |

### 2.3 IMMUNE / 직교 (대표)

| # | Bullet | 근거 |
|---|---|---|
| 2 | `sandbox.network.strictAllowlist` | `.claude-plugin/`·`lib/`·`hooks/`에 `sandbox` 참조 0건 |
| 5·21·24 | `workflowSizeGuideline` / dynamic workflow 크기 | bkit은 CC dynamic workflow 미사용 (자체 `lib/pdca/workflow-engine.js`는 무관한 YAML 엔진) |
| 22 | managed MCP allowlist `${VAR}` 해석원 변경 | bkit의 유일한 `${VAR}`는 `plugin.json:23,28`의 `${CLAUDE_PLUGIN_ROOT}`, managed allowlist 아님 |
| 4 | headless stream-json `mcp_server_errors` | bkit은 플러그인 매니페스트로 서버 배포, `--mcp-config` 미사용 |
| 6 | stream-json 중첩 서브에이전트 forwarding | bkit은 stream-json 미소비 |
| 9·11·12 | self-hosted runner 3건 | bkit은 runner 설정 미출하 |
| 13·14·17·18·23 | `/model` 표시, GNU screen, Vim, 스크린리더 | TUI 표면 |
| 15·19 | Remote Control | 미사용 |
| 16 | `CLAUDE_CODE_GIT_BASH_PATH` (Windows) | bkit은 해당 env var 미설정, 훅이 `node` 직접 호출 |
| 20 | `claude --teleport` | 미사용 |

---

## §3.0 원본 검증 게이트 (Phase 1.5 — MANDATORY)

| 필드 | raw CHANGELOG.md | GitHub release body | 판정 |
|---|---|---|---|
| Added (219) | 8 | **9** | **errata** |
| Fixed (219) | 8 | **10** | **errata** |
| Improved (219) | 2 | 2 | match |
| Changed/Removed/Updated (219) | 6 | 6 | match |
| Breaking (219) | 0 | 0 | match |
| **Total (219)** | **24** | **27** | **errata** |
| Total (220) | 1 | 1 | match |

### ERRATA-30-1 — CHANGELOG.md가 GitHub release body의 진부분집합

`comm`으로 정렬 대조한 결과 GitHub release body에만 존재하는 bullet 3건 확인,
역방향 차집합은 0건:

- `Fixed a permission you approved while a self-hosted runner was restarting being dropped when the session resumed, so the approved action now runs`
- `Fixed a SIGTERM arriving while a self-hosted runner was starting up leaving a stale active row until the lease expired; it now deregisters cleanly`
- `Added structured failure categories to self-hosted runner spawn and session failures, so hook errors, runner crashes and config errors can be told apart`

**규칙 변경**: 사이클 #29까지의 메모리 지침은 "raw CHANGELOG.md가 authoritative,
raw-wins"였습니다. 이번에 처음 뒤집혔습니다. 누락된 3건이 모두 self-hosted runner
관련이라는 점에서 CHANGELOG.md가 해당 카테고리를 의도적으로 제외했을 가능성이 있으나,
근거는 없습니다. **향후 규칙: 두 소스의 합집합을 범위로 삼고, 차집합은 errata로 기록.**

### 검증된 수치 정정

| 항목 | 최초 주장 | 재측정 | 출처 |
|---|---|---|---|
| 테스트 파일 수 | 291 | **346** | `find test tests -name "*.test.js"` — 최초 측정이 `tests/` 디렉터리 누락 |
| 마지막 ENH 번호 | 367 | **371** | repo 전역 `grep -rhoE "ENH-[0-9]{3}"` (368 dual-floor / 369 MCP manifest / 370 Fable retune / 371 slash-path) |
| CC 훅 이벤트 총수 | 30 (공식 문서) | **31** | 바이너리 enum 배열 직독 |

---

## §4. bkit 영향 분석

### 4.1 C1 — 중첩 서브에이전트 기본 depth 3 (헤드라인)

#### (a) 되살아난 간선

depth 1 제약 하에서 죽어 있던 선언이 이제 실행 가능합니다.

| 진입점 | depth 0 | depth 1 | depth 2 | depth 3 |
|---|---|---|---|---|
| `@cto-lead` | cto-lead | sprint-orchestrator | sprint-qa-flow | qa-monitor |
| `@cto-lead` | cto-lead | pm-lead | pm-discovery | — |
| `/sprint master-plan` | main | sprint-master-planner | pm-lead / cto-lead / qa-lead | pm-discovery 등 |

**선언된 순환 2개 (실측 확인)**:

| 순환 | 근거 |
|---|---|
| cto-lead ↔ sprint-master-planner | `agents/cto-lead.md:45` `Task(sprint-master-planner)` ↔ `agents/sprint-master-planner.md:27` `Task(cto-lead)` |
| pm-lead ↔ sprint-master-planner | `agents/pm-lead.md:28` ↔ `agents/sprint-master-planner.md:25` |

#### (b) 팬아웃 규모

cto-lead는 frontmatter에 `Task()` 대상 18개를 선언합니다. 그 18개의 `Task()` 선언
합계는 42개(sprint-orchestrator 7 / sprint-master-planner 7 / pm-lead 6 / qa-lead 6 /
qa-strategist 4 등). 단일 `@cto-lead` 호출의 최악 도달 범위가
**18 → 18 + 42 = 60 스폰(depth 2)**으로 확대되며, 위 순환으로 depth 3은 무한입니다.

`maxTurns: 30~50` + `effort: high` + Opus 5 $10/$50 per Mtok 조건에서 실질 비용 사건입니다.
CC의 bullet #21(dynamic workflow 기본 "15 에이전트 미만")이 바로 이 위험의 인정이지만,
bkit은 CC dynamic workflow를 쓰지 않으므로 **그 보호를 전혀 받지 못합니다**.

#### (c) 기본값이 버전으로 고정되지 않음

바이너리에서 확인한 해석 순서:

```
CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH (env)
  → 원격 피처 게이트 tengu_hazel_trellis (getFeatureValue_CACHED_MAY_BE_STALE)
    → 하드코딩 폴백 3
```

독립 확인: `tengu_hazel_trellis` 문자열 존재, `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`
5개소, 한도 도달 메시지 verbatim.

> `Subagent nesting limit reached (depth ${m} of ${g}). Complete this task directly using your tools instead of spawning another agent. If the user explicitly requested deeper nesting, ask them to raise CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH.`

**함의**: CHANGELOG의 "기본 3"은 폴백일 뿐 실효값이 아닙니다. 실효 depth는 릴리스
없이 서버 측에서 변경 가능하고, 동일 버전의 서로 다른 세션 간에도 다를 수 있습니다.
**env var 명시가 유일한 결정론적 통제 수단입니다.**

이는 R-Series에 없는 새로운 변경 벡터입니다. R-1(무공지 npm publish)과 달리
아티팩트 자체가 바뀌지 않으므로 **버전 고정이 방어가 되지 않습니다**.

#### (d) bkit이 중첩 차단에 의존하던 지점

**문서 3개소 — Docs=Code 위반 (v2.1.219 시점부터 사실과 어긋남)**:

| 위치 | 현재 문구 |
|---|---|
| `agents/cto-lead.md:66-67` | "The Task() tools below work as 1-level subagents within this session (NOT nested spawn)." |
| `agents/cto-lead.md:69-71` | "When invoked as a subagent, Task() tools are **blocked by CC's nested spawn restriction**." |
| `agents/pm-lead.md:48,50` | "work as 1-level subagents." / "Task() tools are **blocked**." |
| `lib/orchestrator/team-protocol.js:43` | "Required for 1-level sub-agent Task tool spawn." |

두 에이전트의 해당 절 제목은 "CC v2.1.69+ Architecture Note" — 150 릴리스 stale입니다.

**방어 장치가 죽어 있음**: `lib/control/loop-breaker.js`의 LB-003
("Agent recursion", "A→B→A agent call pattern", `maxCount: 3`, `action: 'abort'`,
`:55-60`)은 정확히 이 상황을 위한 규칙입니다. 그러나:

- `recordAction('agent_call', …)` **프로덕션 호출 지점 0건**. 실측 결과 프로덕션
  호출은 `scripts/unified-write-post.js:230`의 `'file_edit'`와
  `scripts/unified-bash-post.js:102`의 `'bash_command'` 둘뿐이며, `'agent_call'`은
  `test/unit/loop-breaker.test.js:71-72`에만 존재합니다.
- 부수 발견: `'bash_command'`는 `recordAction`의 switch(`:182-210`,
  `pdca_iteration`/`file_edit`/`agent_call`/`error` 4개 case)에 **없어 무음 no-op**입니다.
- `agentCallStack`은 의도적으로 프로세스 로컬입니다(`:18`에 명시). 중첩 스폰은
  각각 별도 훅 프로세스이므로, **설령 배선하더라도 프로세스 간 재귀를 관측할 수 없습니다.**
  그 설계 근거는 중첩이 차단되던 시절에 쓰였고, depth-3 기본값이 전제를 무효화했습니다.

**Sequential Dispatch(차별화 #3)는 영향 없음**: `lib/orchestrator/sub-agent-dispatcher.js:9-18`은
#56293(병렬 스폰 prefix-cache miss)를 대상으로 하며 **너비(breadth)** 관심사입니다.
깊이(depth)와 직교합니다. 다만 "1-level만 dispatch"라는 전제는 이제 CC 제약이 아니라
bkit 자체 관례로 강등되었습니다.

### 4.2 C2 — SubagentStart 훅 계약 불일치 (신규 확정)

바이너리에서 SubagentStart 페이로드 **생성 지점**을 직독했습니다:

```js
hook_event_name:"SubagentStart", agent_id:e, agent_type:t}
```

여기에 베이스 훅 입력(`session_id`, `transcript_path`, `cwd`, `prompt_id?`,
`permission_mode?`, `agent_id?`, `agent_type?`, `effort?`)이 합성됩니다.
**`agent_name`·`model`·`team_name`·`tool_input`은 전송되지 않습니다.**

`scripts/subagent-start-handler.js`가 읽는 값과 대조:

| 코드 | 읽는 필드 | 실제 귀결 |
|---|---|---|
| `:56` | `agent_name` → `agentId` → `tool_input?.name` → `'unknown'` | `agent_name` 부재 → **`agentId`로 낙착**. 로스터 이름이 사람이 못 읽는 ID |
| `:66-71` | `model` → `tool_input?.model` → `'sonnet'` | **항상 `'sonnet'`**. 34개 중 18개(opus 10 · fable 6 · haiku 2) 오표시 |
| `:93-95` | `tool_input?.prompt` | `currentTask` 항상 `null` |
| `:60-62` | `team_name` → `tool_input?.team_name` → `''` | `initAgentState`에 빈 팀명 |

**연쇄 효과 — 상한이 확정적으로 터짐**: 키가 인스턴스 고유 `agent_id`이므로
`addTeammate`의 이름 기반 중복 제거(`lib/team/state-writer.js:204`)가 **한 번도
발동하지 않습니다.** 따라서 depth-3 팬아웃(최대 60 스폰)에서 `MAX_TEAMMATES = 10`
(`state-writer.js:26`) 상한이 확정적으로 도달하고, `:224-227`은
`debugLog(...); return;` — **사용자 노출도 감사 기록도 없이 무음 누락**됩니다.

**상수 3중 불일치 (실측)**:

| 위치 | 값 |
|---|---|
| `lib/core/constants.js:52` | `MAX_TEAMMATES = 10` |
| `lib/team/state-writer.js:26` | `MAX_TEAMMATES = 10` (constants.js를 import하지 않고 **재정의**) |
| `bkit.config.json:211` / `:215-216` | `maxTeammates: 5` / Dynamic 3 · Enterprise 5 |
| `lib/team/coordinator.js:35,43` | 기본 `4` |

**경합**: `writeAgentState`(`state-writer.js:97-148`)는 tmp+rename으로 **쓰기 1회는
원자적**이나, 읽기(`:197`)와 쓰기(`:231`) 사이가 프로세스 간 직렬화되지 않습니다.
동시 중첩 SubagentStart 훅 2개가 같은 로스터를 읽고 각자 append 후 기록하면
마지막 승자만 남습니다. 대조적으로 `lib/control/loop-breaker.js:14-15`는
"locked RMW so concurrent hook fires never lose an increment"를 명시 — 프리미티브는
있으나 state-writer가 쓰지 않습니다.

> **미검증 잔여**: depth 2+에서 SubagentStart가 **발화하는지** 자체는 바이너리
> 문자열만으로 확정할 수 없습니다. 다만 페이로드에 depth·parent 필드가 없음은
> 확정이므로, **발화하든 안 하든 bkit은 중첩 트리를 재구성할 수 없습니다.**
> 1회 실행으로 페이로드를 캡처하면 확정됩니다.

### 4.3 C3 — Opus 5 기본 전환

**모델 핀은 영향 없음.** bkit의 34개 에이전트는 전부 별칭(`opus`/`sonnet`/`fable`/`haiku`)을
사용하며 별칭 해석은 CC 책임입니다. repo 전역 유일한 전체 모델 ID는
`lib/domain/guards/enh-264-token-threshold.js:22`의
`['claude-sonnet-4-6','claude-sonnet-4-5']`이며 sonnet 한정으로 올바르게 범위 지정되어
있습니다(`:20-21`에 "Sonnet 5 intentionally excluded … No Guessing" 명시).
Opus 5는 이를 트리거할 수 없습니다.

**컨텍스트 예산 가정 없음.** `lib/`의 토큰 모듈(`pdca/token-report.js`,
`cc-regression/token-accountant.js`, `domain/ports/token-meter.port.js`)은 CC가 준
사용량 수치를 **통과 집계**할 뿐 윈도우 크기를 가정하지 않습니다. 1M 전환에 구조적으로 면역입니다.

**바이너리 확인 — `claude-opus-5[1m]` 실재**: 모델 ID 테이블에 `claude-opus-5`와
`claude-opus-5[1m]` 두 항목 존재. `claude-mythos-5`도 `claude-fable-5`와 별개로 존재.
`claude-opus-5-fast`는 **없음**(현 세대 fast mode는 API 설정이지 별도 모델이 아님).
bkit은 별칭을 쓰므로 조치 불요.

**`FABLE_MODEL_FLOOR = '2.1.170'` 유지 타당**: bullet #10은 "Requires usage credits"
라벨의 **표시** 버그(stale cache)이며 별칭 가용성 변경이 아닙니다.

**stale 주석 (LOW)**: `lib/domain/ports/token-meter.port.js:22`,
`lib/cc-regression/token-accountant.js:57,67`이 "Opus 4.7"을 언급 — bullet #25가
4.7을 fast mode에서 제거했습니다.

**문서 drift 확인**: `lib/infra/cc-version-checker.js:47`은 `RECOMMENDED_VERSION = '2.1.218'`
이나 `docs/04-report/claude-model-alignment.report.ko.md:144,312`는 여전히
`RECOMMENDED=2.1.198`로 기술. 해당 문서는 완료된 릴리스의 기록물이므로 시점 스냅샷으로
볼 여지가 있으나, `:144`는 설계-구현 match-rate 표 안에 있어 Docs=Code 채점 대상입니다.

### 4.4 C4 — `DirectoryAdded` (스키마 확정)

바이너리에서 zod 스키마 직독:

```js
S.object({
  hook_event_name: S.literal("DirectoryAdded"),
  directory: S.string(),   // 추가된 디렉터리의 절대 경로
  source: S.enum(["slash_command","register_repo_root"])
})
```

- **matcher 지원 확인**: `fieldToMatch:"source", values:["slash_command","register_repo_root"]`
  — `CwdChanged`(matcher 미지원)와 달리 source별 스코핑이 가능합니다.
- **차단 불가**: 샌드박스 설정 갱신 **이후** 발화하므로 등록을 거부할 수 없습니다.
  비정상 종료 코드는 디버그 로그(및 `/add-dir` 경로에서 실패 카운트 + `systemMessage`)만 남깁니다.
- 동반 SDK 제어 요청 `register_repo_root`는 `reload_claude_md` / `reload_plugins` /
  `reload_skills` 옵션을 가집니다 — SDK 호스트가 세션 중 플러그인·스킬 리로드를 강제할 수 있습니다.

**bkit 커버리지**: CC 31개 이벤트 중 bkit 22개 등록 = **71%**. 미등록 9개는
`PostToolBatch`, `PermissionDenied`, `Setup`, `Elicitation`, `ElicitationResult`,
`WorktreeCreate`, `WorktreeRemove`, `DirectoryAdded`, `MessageDisplay`.

### 4.5 v2.1.220 — 바이너리 diff

| 항목 | 값 |
|---|---|
| 크기 | 266,381,200 → 266,397,712 (**+16,512, +0.0062%**) |
| 정렬-고유 문자열 | 227,059 → 227,423 |
| 필터링 후 실질 차이 | **4건** |

1. 빌드 메타데이터 (`VERSION`/`BUILD_TIME`/`GIT_SHA`, 빌드 간격 18h53m)
2. 신규 술어 `isEntitlementOverlayUnavailable()` — 기존 텔레메트리 페이로드 2개에
   `entitlement_blind` 필드 추가. 제어 결정이 아닌 텔레메트리 인자에서 종료
3. auto-mode 권한 분류기 경고 문구 1건 (`the bare retry succeeded` → `the retry without it succeeded`)
4. `disableAllHooks` 설정 스키마 설명의 마침표 1개

**bkit 통합 표면 전부 동일**: 피처 게이트 1,754/1,754 · zod 마커 전부 일치 ·
`hook_event_name` 13 · `DirectoryAdded` 30 · `SPAWN_DEPTH` 5 · `hookSpecificOutput` 40 ·
`mcpServers` 86 · `disableAllHooks` 14 · fork/background 표면(`run_in_background` 32,
`isBackgroundAgent` 18) 전부 동일.

> **방법의 한계**: 문자열 델타 없는 순수 제어흐름 변경(**실제 버그픽스 대부분이 여기 해당**),
> 숫자 리터럴 *값* 변경, 데이터 전용 변경, 재정렬은 보이지 않습니다.
> 네거티브 결과 신뢰도 약 95%(명명된 표면 한정), 성격 규정 신뢰도 약 65%.

---

## §5. ENH 로드맵 (Phase 3 브레인스토밍)

> ENH 번호는 실측 정정에 따라 **ENH-372**부터 시작합니다 (기존 최고 = ENH-371).
> 본 스킬은 **analysis-only** — 아래 항목은 전부 **제안이며 미구현**입니다.

### 5.1 Intent Discovery

- **이번 업그레이드에서 얻을 최대 가치**: Opus 5 자동 수혜(무비용) + `DirectoryAdded`
  스키마 확정(향후 재조사 불필요)
- **놓치면 안 되는 변경**: bullet #27. 기본값 역전 + 원격 게이트 + 미해결 #68110의 조합
- **native가 대체할 workaround**: 없음

### 5.2 Alternative Exploration — ENH-373 (중첩 봉쇄)

| 안 | 내용 | 평가 |
|---|---|---|
| **A** | `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH=1` 명시 고정 (문서 + 세션 공지) | **채택 권고**. 유일한 결정론적 수단. 원격 게이트 무력화 |
| B | 순환 간선 2개 제거 (`sprint-master-planner`에서 `Task(cto-lead)`/`Task(pm-lead)` 삭제) | **A와 병행 권고**. A가 실패해도 무한 재귀만은 차단 |
| C | LB-003 배선 (`recordAction('agent_call')` 호출) | **단독으로는 부적절**. 프로세스 로컬이라 중첩 재귀 관측 불가 — 먼저 영속 카운터로 전환 필요 |
| D | 무조치 (CC 기본값 신뢰) | **탈락**. 기본값이 원격 가변이므로 신뢰 대상이 아님 |

### 5.3 YAGNI 검토

| 항목 | 실제 필요? | 미구현 시 문제 | 차기 CC가 해결? | 판정 |
|---|---|---|---|---|
| ENH-372 (문서 정정) | ✅ | 사용자를 없는 제약으로 오도 | ❌ | **통과** |
| ENH-373 (중첩 봉쇄) | ✅ | 순환 2개 + 60 스폰 + 죽은 가드 | ❌ (#68110 OPEN) | **통과** |
| ENH-374 (훅 계약) | ✅ | 모델 오표시 + 상한 무음 누락 | ❌ (bkit 측 결함) | **통과** |
| ENH-375 (상수 3중 불일치) | ⚠️ | 혼동, 즉각 장애는 아님 | ❌ | 통과(낮음) |
| ENH-376 (positional args) | ⚠️ | 현재 런타임 호출자 없음(latent) | ❌ | 통과(낮음) |
| ENH-377 (`DirectoryAdded`) | ❌ | bkit이 multi-root 미지원 — 조치 불가한 문제만 노출 | 해당 없음 | **P3 보류** |

> ENH-377 판정 근거 변경: 사이클 초기에는 "스키마 미검증 → No Guessing 위반"이
> 탈락 사유였으나 바이너리 검사로 **해소**되었습니다. 남은 탈락 사유는 순수 YAGNI —
> bkit에 다중 루트 상태 우선순위 규칙이 없어 이벤트를 받아도 행동할 수 없습니다.

### 5.4 우선순위 배정

| ENH | 우선순위 | 근거 CC bullet | 내용 | 영향 파일 |
|---|---|---|---|---|
| **ENH-372** | **P0** | #27 | 중첩 차단 서술 3개소 정정 + "CC v2.1.69+" 절 제목 재기준 | `agents/cto-lead.md:62-71`, `agents/pm-lead.md:44-51`, `lib/orchestrator/team-protocol.js:43` |
| **ENH-373** | **P0** | #27 | 안 A+B 병행: env var 명시 고정 + 순환 간선 2개 제거 | `agents/sprint-master-planner.md:25,27`, 세션 공지(`hooks/startup/session-context.js`), 문서 |
| **ENH-374** | **P1** | #27 | SubagentStart 계약 정합: 전송되지 않는 4필드 의존 제거, `agent_type` 기반 표시명, 상한 도달 사용자 노출 | `scripts/subagent-start-handler.js:56,60-71,93-95`, `lib/team/state-writer.js:204,224-227` |
| **ENH-375** | P2 | — | `MAX_TEAMMATES` 3중 불일치 정리 + `constants.js` 단일 출처화 + locked RMW 적용 | `lib/team/state-writer.js:26,97-148`, `lib/core/constants.js:52`, `bkit.config.json:211` |
| **ENH-376** | P3 | — | `registerSpawn`의 positional 호출 ↔ `addTeammate(teammateInfo)` 시그니처 불일치 (latent) | `lib/orchestrator/team-protocol.js:76` |
| **ENH-377** | P3 | #3 | `DirectoryAdded` 등록 — **스키마 확정 완료, multi-root 규칙 마련 후 재검토** | `hooks/hooks.json`, `scripts/cwd-changed-handler.js` |

### 5.5 철학 준수

| ENH | Automation First | No Guessing | Docs=Code | 판정 |
|---|---|---|---|---|
| ENH-372 | 중립 | 통과 (CHANGELOG로 반증됨) | **통과 — 본질** | 채택 |
| ENH-373 | 통과 (자동 가드레일) | 통과 (바이너리 근거 + #68110 OPEN) | 통과 | 채택 |
| ENH-374 | 통과 (무음 누락 제거) | 통과 (페이로드 생성 지점 직독) | 통과 | 채택 |
| ENH-375 | 중립 | 통과 (실측 3중 불일치) | 통과 | 채택(낮음) |
| ENH-376 | 중립 | 통과 (시그니처 검증) | 통과 | 보류 |
| ENH-377 | 중립 | **통과(해소됨)** | 중립 | **P3 보류 — YAGNI** |

### 5.6 테스트 영향 (전체 스위트 = 346 파일)

| ENH | 테스트 영향 |
|---|---|
| ENH-372 | `test/philosophy/docs-equals-code*.test.js` — "blocked" 문구를 grep하는 단언이 없는지 확인 |
| ENH-373 | 신규 L1: 순환 간선 부재 단언(frontmatter 그래프 검사). `test/architecture/` 적합 |
| ENH-374 | `test/contract/hook-input-schema.test.js` 확장 — CC가 실제 전송하는 필드만 의존하는지 계약 고정. `test/unit/team-modules.test.js:148`은 현재 `typeof`만 단언 → 실 로스터 단언 필요 |
| ENH-375 | 신규 L2 동시성 테스트 (프로세스 2개 동시 addTeammate) |
| ENH-376 | `test/contract/orchestrator.test.js:85-86`에 로스터 내용 단언 추가 |

---

## §6. 상시 추적 항목

| 항목 | 상태 | 근거 |
|---|---|---|
| **#58904 heredoc-pipe 우회** | **CLOSED / NOT_PLANNED** (2026-07-06) | 미수정 — bkit Layer-6 차별화 **streak intact, +2 연장** |
| **#56293 병렬 캐시 회귀** | **CLOSED / NOT_PLANNED** (2026-06-02) | 미수정 — Sequential Dispatch 차별화 **intact, +2 연장** |
| **#57317 플러그인 훅 유실** | **CLOSED / NOT_PLANNED** (2026-06-06) | 미수정 — ACTIVE 유지 |
| **#64436 background OTEL 유실** | **OPEN** (2026-07-08) | bkit 자체 file-ledger라 직접 노출 없음, watch 유지 |
| **#68110 재귀 무한 팬아웃** | **OPEN** (2026-07-21) | **격상**. v2.1.219(2026-07-24 빌드)가 미해결 상태에서 depth-3 기본값 복원 |
| **#78406 spawn cap 문서 누락** | **OPEN** (2026-07-17) | CC 공식 문서가 여전히 env var 미기술 → bkit은 문서에 의존 불가 |
| MF-2 (RECOMMENDED stale) | **해소** | v2.1.31에서 `2.1.198` → `2.1.218` bump 완료. 현 drift 2 |
| MF-3 (네임스페이싱) | **RESOLVED (CC-native)** 유지 | 변경 없음 |
| FORK-SKILL-BG-DEFAULT | **해소** | ENH-367이 v2.1.31에 구현 — fork 스킬 8개 `background: false`, `qa-phase`는 `context: fork` 제거. 220 diff에서 fork/background 표면 무변화 확인 |

### 신규 감시 항목

| ID | 내용 |
|---|---|
| **REMOTE-GATE-DRIFT (신규)** | 원격 피처 게이트(`tengu_hazel_trellis` 등)에 의한 동작 표류. **버전 고정으로 방어 불가**한 새 변경 벡터. R-Series에 별도 클래스 신설 검토 필요 |
| **SUBAGENT-HOOK-CONTRACT (신규)** | `SubagentStart` 페이로드가 `{agent_id, agent_type}` + 베이스뿐. bkit이 4개 미전송 필드에 의존 중 (ENH-374로 해소 예정) |
| **NEST-DEPTH-DEFAULT (신규)** | CC 기본 중첩 depth. 현재 폴백 3, 원격 가변. ENH-373 처리 시 결정론화 |

---

## §7. 결론

- **Breaking 0, 마이그레이션 불요.** 연속 호환 **163** (v2.1.34 ~ v2.1.220).
- **권장 CC 버전: `2.1.218` 유지 (변경 없음).** 근거는 사이클 초기 판단(220 불투명성)이
  아니라 — 그 불투명성은 바이너리 diff로 해소되었습니다 — **ENH-373 미처리** 때문입니다.
  219를 수용한다는 것은 depth-3 기본값 + 원격 게이트 + 선언된 순환 2개 + 죽은 LB-003을
  함께 수용한다는 뜻입니다. ENH-373이 반영되면 `2.1.220`은 깨끗한 목표가 되며
  drift는 6 → 2로 개선됩니다.
- `MIN_VERSION='2.1.78'`, `FABLE_MODEL_FLOOR='2.1.170'`, `FEATURE_VERSIONS.contextFork='2.1.113'`
  전부 변경 불요.
- 차별화 streak 3종(#56293 · #57317 · #58904) **전부 +2 연장** — 28 bullets 중 해당
  코드 수정 항목 없음.
- **28-사이클 연속 0-ENH streak 종료 후보**: ENH-372는 순수 사실 정정으로 위험이 없고,
  ENH-373은 미해결 #68110과 원격 게이트라는 외부 근거를 가집니다. 다만 본 스킬은
  analysis-only이므로 **구현은 별도 PDCA 사이클의 몫**입니다.

### 가장 먼저 할 일 (ENH 아님)

**depth-2 `SubagentStart` 페이로드 1회 캡처.** `BKIT_DEBUG` 활성 상태에서 중첩 스폰을
한 번 유발해 (a) depth 2+에서 발화하는지 (b) `agent_name`/`model`이 정말 부재한지를
확인하면, ENH-374의 범위가 확정되고 ENH-373의 긴급도가 정량화됩니다. 실험 1회로
두 항목이 동시에 해소됩니다.

---

## 부록 A — 검증 커맨드 (재현용)

```bash
# Phase 1.5 이중 소스
curl -sL https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md -o cc.md
awk '/^## 2\.1\.219$/{f=1;next} /^## /{f=0} f' cc.md | grep -cE "^- "     # 24
gh api repos/anthropics/claude-code/releases/tags/v2.1.219 --jq '.body' \
  | grep -cE "^- "                                                        # 27

# 아키텍처 실측
ls -1 agents/*.md | wc -l                                                 # 34
ls -1d skills/*/ | wc -l                                                  # 44
find test tests -name "*.test.js" | wc -l                                 # 346
grep -rhoE "ENH-[0-9]{3}" --include="*.md" --include="*.js" . | sort -u | tail -1   # ENH-371

# 바이너리 검증
BIN=~/.local/share/claude/versions/2.1.220
grep -aoE '\["PreToolUse","PostToolUse"[^]]{0,700}\]' "$BIN" | tr ',' '\n' | wc -l  # 31
grep -aoE 'hook_event_name:"SubagentStart"[^;]{0,300}' "$BIN"
grep -aoE 'fieldToMatch:"source",values:\["slash_command","register_repo_root"\]' "$BIN"
grep -ac "tengu_hazel_trellis" "$BIN"

# 상시 추적
for n in 58904 57317 64436 56293 68110 78406; do
  gh issue view $n --repo anthropics/claude-code \
    --json number,state,stateReason,updatedAt,title
done
```
