---
template: sprint-master-plan
version: 1.0
description: Sprint Master Plan — bkit v2.1.33 Defect Response
variables:
  feature: v2133-defect-response
  displayName: bkit v2.1.33 Defect Response
  date: 2026-08-08
  author: kay kim (maintainer) + sprint-master-planner
  trustLevel: L2
  duration: 7 work units (S1–S7), multi-session
---

# bkit v2.1.33 Defect Response — Sprint Master Plan

> **Sprint ID**: `v2133-defect-response`
> **Date**: 2026-08-08
> **Author**: kay kim (maintainer) + sprint-master-planner
> **Trust Level (시작)**: L2 — `design`까지 자동 진행; `do` 진입에는 사용자 명시 승인 필요
> **예상 기간**: 7개 작업 단위(S1–S7), 다세션 진행
> **브랜치**: `feat/v2.1.33-defect-response` (단일 브랜치; 커밋/푸시 최소화)
> **Master Plan template**: bkit v2.1.13 (Sprint 4 Presentation 산출)
> **버전 노트**: 목표 버전 **v2.1.33**은 메인테이너 지시 사항. "에이전트는 버전을 올리지 않는다"는 리포 규칙은 이 스프린트에 한해 메인테이너 결정으로 명시적으로 예외 처리됨(본 문서에 기록). 재논의 금지.

---

## 0. Executive Summary

| 항목 | 내용 |
|------|------|
| **Mission** | 검증 완료된 결함 백로그 ENH-388~416(STILL-VALID 21건)과 사용자 요구 세션-UX 재설계(Issue #77 재오픈)를 마감하고, 모든 수정이 **게이팅** 테스트로 보호되는 bkit v2.1.33 출시 — "FAIL을 보고하면서 exit 0 하는 테스트"의 종결. |
| **Anti-Mission** | 신규 기능 없음. RECOMMENDED_VERSION 인상 없음(두 사이클 연속 분석에 따라 2.1.220 유지). CC v2.1.225 subagent fail-open에 대한 훅 기반 완화 없음(구조적으로 불가능 — prose 계층만). 기존 docs 소급 번역 없음. |
| **Core Primitives** | 10개 feature → 단일 브랜치 위 7개 순차 작업 단위(S1–S7); 단위별 8-phase 라이프사이클; 증명-우선 순서(테스트 게이팅이 모든 enforcement 수정보다 먼저 착지). |
| **Trust Level** | L2 — `prd → plan → design` 자동 진행; **작업 단위별 `do` 진입 시 사용자 승인 대기**. main으로의 PR 머지는 별도의 두 번째 승인 게이트. |
| **Auto-pause 조건** | 4 triggers 활성 (QUALITY_GATE_FAIL / ITERATION_EXHAUSTED / BUDGET_EXCEEDED / PHASE_TIMEOUT) |
| **Success Criteria** | 5건(§6) + Definition of Done(§14) |

**"증명 우선"인 이유**: 현재 테스트 인프라에는 서로 독립적인 3개의 비게이팅 계층이 있다(ENH-411). S1 이전에 enforcement 수정(F3–F7)을 머지하면, 빌드를 실패시킬 수 없는 테스트가 그 수정을 "보호"하게 된다 — 보호가 없는 것과 구별 불가. 따라서 `proof-infrastructure`는 나머지 전부의 강한 선행 조건이다.

---

## 1. Context Anchor (Plan → Design → Do 전파)

| Key | Value |
|-----|-------|
| **WHY** | 두 힘이 수렴한다. (a) **사용자**: 여러 사용자가 각자 세션 이름 강제를 중단해 달라고 요청 — 메인테이너 원문: "다른 사용자로부터 같은 요청을 여러번 받았으니까 세션에 이름 강제하는거 하지 말라고 한거야". Issue #77(2026-04-15 close)은 강제 동작 3건을 보고했고, 3건 모두 여전히 기본 ON. (b) **증거**: CC 버전 영향분석 #33–#34 사이클이 재현·file:line 검증된 결함 원장(ENH-388~416)을 산출 — bkit의 두 헤드라인 차별점인 Memory Enforcer deny 경로와 Design↔Code matchRate 게이트가 각각 잘못된 reason을 출력하고(ENH-410) NaN에서 판정 불능이며(ENH-412), 이를 잡아야 할 테스트 스위트는 빌드를 실패시키지 못한다(ENH-411/416). |
| **WHO** | (1) 모든 기존 bkit 사용자 — 세션-UX 재설계는 전원의 기본 동작을 바꾼다. (2) 메인테이너 — 향후 변경을 신뢰하려면 게이팅 CI가 필요. (3) 후속 cc-version-analysis 사이클 — 정정된 원장(ERRATA-34-6 재기술)과 RECOMMENDED_VERSION 유지 근거를 소비. |
| **WHAT (도메인)** | 10개 feature: `session-ux-redesign`, `proof-infrastructure`, `io-block-contract`, `bash-path-enforcement`, `write-path-enforcement`, `plugin-data-isolation`, `gate-numeric-hygiene`, `subagent-trust-boundary`, `docs-privacy-sync`, `residual-p2-p3` — 모두 `.bkit/state/master-plans/v2133-defect-response.json`에 등록됨. |
| **WHAT NOT** | RECOMMENDED_VERSION 인상(ENH-395 전반부 / 384 — 의도된 유지, 결함 아님); ENH-386(394 착지 후에만 재평가); ENH-408(미검증 CC 동작 의존); ENH-409(드롭); 기존 docs 소급 rename/번역; CC의 subagent-handoff 거부 prose에 대한 훅 기반 관측 일체. |
| **RISK** | (1) CI 게이팅 활성화는 숨겨진 실패(AL-007, TE-001/TE-025, flaky v2112 invariant)를 먼저 고치지 않으면 즉시 빌드를 빨갛게 만든다 — S1 내부 순서가 하중을 받는다. (2) 세션-UX 재설계는 전 사용자 대상 동작 변경; context injection을 단순 기본 OFF 하면 8개 언어 자동감지·모호성 감지·PDCA 상태 인지가 조용히 죽는다. (3) bash/write 경로의 실제 차단 복원(388/398)은 정상 명령에 대한 오탐 가능. (4) 장수 단일 브랜치의 main 대비 드리프트. 전체 목록: §9. |
| **SUCCESS** | STILL-VALID 21건 전부 close 또는 사유 기록 후 명시적 defer; 테스트 스위트 게이팅(고의 실패가 CI를 빨갛게 — 가정이 아니라 시연으로 증명); 세션 title/dashboard/context-injection이 무조건 기본값 대신 PDCA 사용 감지로 구동; 명시 승인 하에 main 머지; 태그 `v2.1.33` + 영문 GitHub Release note. |
| **SCOPE (정량)** | 10 features / STILL-VALID 21 ENH (P0 7 · P1 7 · P2 4 · P3 3) + 고아 2건 + 분할 1건(395b) / 7개 작업 단위 / 대략 토큰 추정 총 ≈ 385K, 단위당 ≤ 100K (`lib/application/sprint-lifecycle/context-sizer.js` 기본값 기반 휴리스틱 — 추정이지 측정 아님) / 기간은 다세션, 재개 가능(§12). |
| **OUT-OF-SCOPE** | §13 Deferred 참조: 395a(버전 유지), 386, 408, 409; SUPERSEDED 381→391, 382→394, 384→395, 387→396; NEEDS-RECHECK 3건. 원장 최대 출시 ENH = **380**; 381–416 중 출시된 것 없음. |

**분석 규율 (이 스프린트 전 phase에 구속력)**:
- **절대 추측하지 않는다** — 모든 결함 주장은 design 문서나 커밋 메시지에 들어가기 전에 재현되어야 한다. 이 계획의 내용은 전부 이미 재현됨; 이후 *추가*되는 것은 측정 방법을 명시해야 한다.
- 부재 증명은 grep이 아닌 **perl** 사용(이 머신의 `grep`은 ugrep 7.5.0으로 `-E` false negative 존재). 다중 파일 `perl -ne`는 `$.`가 파일별로 리셋되지 않으므로 반드시 `close ARGV if eof;` 포함.
- 모든 scope/permission 주장은 적용되는 자동화 레벨(L0–L4)을 명시해야 한다. 기준선: bkit의 PreToolUse 훅 deny 경로(`unified-bash-pre.js`, `pre-write.js`)는 **L0–L4 전 레벨**에서 실행된다(훅은 무조건 실행); `SPRINT_AUTORUN_SCOPE` L2는 스프린트 phase 자동 진행만 관장하며 훅 enforcement와 무관.

---

## 2. Features (sprint 구성 작업 묶음)

| # | Feature | 우선순위 | ENH / 출처 | 상태 | 작업 단위 |
|---|---------|--------|------------|------|-----------|
| 1 | `proof-infrastructure` | P0 | ENH-411, ENH-416, 숨은 실패 수정, ERRATA-34-6 재기술 | pending | S1 |
| 2 | `io-block-contract` | P0 | ENH-410 (388/398의 상류 노드) | pending | S2 |
| 3 | `bash-path-enforcement` | P0 | ENH-388+389+390+393 (원자적 묶음) + 고아 A | pending | S2 |
| 4 | `write-path-enforcement` | P0 | ENH-398+399+400+401 (원자적 묶음) | pending | S3 |
| 5 | `plugin-data-isolation` | P0/P1 | ENH-402 (P0) → 403 → 383, + 396 | pending | S4 |
| 6 | `gate-numeric-hygiene` | P1 | ENH-412 | pending | S5 |
| 7 | `subagent-trust-boundary` | P1 | ENH-413 (prose 계층만) | pending | S5 |
| 8 | `session-ux-redesign` | P0 (사용자 요구) | Issue #77 재오픈; 메인테이너가 선택한 재설계 | pending | S6 |
| 9 | `docs-privacy-sync` | P1/P2/P3 | ENH-404 (P1), 407 (P2), 397 (P3), + 생성기 이중언어 발견 | pending | S7 |
| 10 | `residual-p2-p3` | P2/P3 | ENH-394, 405, 406, 385, 414, 415, 395b, 고아 B | pending | S7 |

우선순위 노트: `session-ux-redesign`은 메인테이너 지시와 최고 사용자 가시성으로 P0이지만, enforcement 체인에 의존성이 없고 S1의 게이팅 테스트 및 경험적 probe(§3 S6)의 이득을 받으므로 *순서상* S6에 배치. 우선순위와 실행 순서는 의도적으로 다르다.

---

## 3. Sprint 분해, 순서, 의존성 그래프

### 3.1 순서 (고정 제약 — 재협상 금지)

```
S1 proof-infrastructure
 └─→ S2 io-block-contract + bash-path-enforcement   (공유 파일: scripts/unified-bash-pre.js)
      └─→ S3 write-path-enforcement                 (수정된 outputBlockWithContext 계약 소비)
           └─→ S4 plugin-data-isolation             (402가 403보다 먼저 — paths.js:312-317 동일 라인)
                └─→ S5 gate-numeric-hygiene + subagent-trust-boundary
                     └─→ S6 session-ux-redesign
                          └─→ S7 docs-privacy-sync + residual-p2-p3
```

의존성 그래프 (feature 레벨 인접 리스트, state JSON `dependencyGraph`용):

```json
{
  "io-block-contract":        ["proof-infrastructure"],
  "bash-path-enforcement":    ["io-block-contract"],
  "write-path-enforcement":   ["io-block-contract", "bash-path-enforcement"],
  "plugin-data-isolation":    ["write-path-enforcement"],
  "gate-numeric-hygiene":     ["plugin-data-isolation"],
  "subagent-trust-boundary":  ["plugin-data-isolation"],
  "session-ux-redesign":      ["gate-numeric-hygiene", "subagent-trust-boundary"],
  "docs-privacy-sync":        ["session-ux-redesign"],
  "residual-p2-p3":           ["session-ux-redesign"]
}
```

자명하지 않은 두 간선의 근거:
- **F3이 F4/F5보다 먼저**: `io.js:346 outputBlock(reason)`은 ENH-410, ENH-388, **그리고** ENH-398의 공유 상류다. 410을 먼저 고치지 않으면 388/398의 "차단 복원" 작업이 잘못된 reason 문자열을 출력한다(`reason`이 리터럴 `'deny'`에 바인딩 — 실행 증명: `{"decision":"block","reason":"deny"}`, exit 0). #34 사이클은 410→398/399/400은 연결했지만 388 연결을 놓쳤다; 본 계획이 복원한다.
- **402가 403보다 먼저**: 둘 다 `lib/core/paths.js:312-317`을 수정한다; 403의 reason 문자열 분리는 402의 프로젝트-세그먼트 네임스페이싱이 "다른 프로젝트"를 정의한 뒤에야 의미가 있다.

### 3.2 단위별 상세

---

#### S1 — `proof-infrastructure` (반드시 최우선 착지)

**목표**: 테스트 실패를 보이게 만든다. S1 이후, 실패하는 테스트는 `node test/run-all.js`를 non-zero로, CI를 빨갛게 만든다 — 고의 스크래치 실패로 시연 후 제거.

**내부 순서 (하중 부담 — 리스크 R1 참조)**: 게이팅 계층을 켜기 *전에* 숨은 실패를 먼저 고친다.

1. **숨은 실패 (선행 수정)**:
   - `test/unit/audit-logger.test.js` **AL-007**: `ACTION_TYPES has 29 entries` 단언; 라이브 측정값 **40**; `.claude/CLAUDE.md`와 audit 스킬은 **19** — 3자 드리프트 → **메인테이너가 Source of Truth 결정**(승인 게이트 결정 D1, §11). 계획 기본 권고: 코드(40)가 SoT; 테스트는 40 단언; 문서는 S7에서 수정.
   - `test/unit/trust-engine.test.js` **TE-001, TE-025**: 기본 trust score 40 불일치 — 테스트를 출시 기본값(측정치)에 맞추거나, 메인테이너가 달리 정하면 출시 기본값을 스펙에 맞춤(결정 D2).
   - `test/contract/v2112-deep-qa-invariants.contract.test.js`: **flaky** (연속 2회 측정: `PASS 4308/Errors 0` vs `PASS 4307/Errors 1`). 비결정성의 근본 원인 규명; S1 예산 내 수정 불가 시 사유 기록 후 격리 + 후속 티켓 — 새로 게이팅되는 스위트 안의 flaky 테스트는 이후 모든 단위를 오염시킨다.
2. **ENH-411 — 3개 비게이팅 계층 전부 폐쇄** (하나만 고치는 것은 알려진 함정; 파이프가 *가장 덜* 중요):
   - ① 테스트 파일이 FAIL 시 non-zero exit (오늘 측정: `node test/unit/trust-engine.test.js` → FAIL 2건에도 exit 0);
   - ② `test/contract/scripts/qa-aggregate.js`에 실패 시 `process.exit(1)` 추가 (현재 `process.exit` 호출 **0개**);
   - ③ `.github/workflows/contract-check.yml:74` — `node …/qa-aggregate.js | tail -10`이 pipefail 없는 기본 `bash -e` 아래에서 exit code를 가린다; 파이프 제거 또는 `shell: bash` + `set -o pipefail`. 또한 `:98-99` `continue-on-error: true`가 `:96` 주석 "v2.1.21+: strict (continue-on-error: false)"와 모순 — 11개 마이너 버전 동안 불일치 지속; 값을 주석에 맞춤(strict).
3. **ENH-416 — 한 번도 실행되지 않는 22개 파일**: `tests/contract`(19) + `tests/unit`(3)은 어디서도 실행되지 않는다. `test/run-all.js:33` `const TEST_DIR = __dirname;`이며 파일 내 `tests/` 참조 **0회**(perl 검증). 22개 파일을 `test/`로 이관(선호; 단일 트리 유지) 또는 러너에 `tests/` 인식 추가 — 결정 D3, 기본: 이관.
   **ERRATA-34-6 재기술 (2회 확인, 구속력)**: 기존 주장 "55개 파일이 러너+CI 밖"은 틀렸다. `qa-aggregate.js:20`은 `tests/qa`를 `'qa-legacy'`로 포함(33개 파일, 실행되나 비게이팅 → ENH-411의 문제)하고 `contract-check.yml:84`는 `tests/qa/bkit-full-system.test.js`를 직접 실행(게이팅). **55개 중 34개는 실행됨; 22개만 전혀 실행 안 됨.** ENH-392의 전제는 이에 따라 재기술: [22 never-run → ENH-416] + [33 run-but-non-gating → ENH-411].

4. **ENH-417 — 스프린트 Stop 훅이 허위 완료를 보고** *(2026-08-08 추가; 이 계획을 만드는 도중 실제로 발생·재현. ENH-411·ENH-412와 동일한 "허위 녹색" 클래스이므로 S1에 배치)*:
   `/sprint master-plan v2133-defect-response` 실행 직후 `✅ Sprint "v2133-defect-response" — report → archived`가 출력되었고, 본문은 `final-qa-i18n-docs-sync`(2026-06-02에 마지막으로 갱신된 스프린트) 데이터였다. 디스크 확인: `.bkit/state/sprints/v2133-defect-response.json`이 **존재하지 않음** — 아무것도 아카이브되지 않았다. 3중 연쇄 원인, 전부 코드 확인:
   - `scripts/sprint-skill-stop.js:141` `if (sprint && !sprintId) sprintId = sprint.id;` — marker에서 `sprintId`가 해소되었으나 `loadSprint`가 null을 반환하고 `:139` `latestActiveSprint()` 폴백이 **다른** 스프린트를 실어 오면 ID가 교정되지 않는다. 따라서 `:182` 헤더는 *요청한* ID를, 본문(`summary`, `sprint.phase`)은 *폴백* 스프린트를 출력한다.
   - `scripts/sprint-skill-stop.js:46` `READONLY_ACTIONS = ['status','watch','list','help']`에 `master-plan`이 없다. master-plan은 어떤 스프린트도 진행시키지 않는데 폴백 경로가 애초에 발동한다.
   - 아카이브가 `status`를 정리하지 않는다: `latestActiveSprint`(`:96`)는 `s.status === 'active'`로 거르지만 **7개 스프린트 상태 파일 중 6개가 `status:'active'` + `phase:'archived'`**(실측)이므로, 폴백은 구조적으로 오래전에 끝난 스프린트를 반환한다.
   수정 범위: `sprint-skill-stop.js:46,138-141`; `lib/application/sprint-lifecycle/archive-sprint.usecase.js`의 `status` 전이; stale 상태 파일 6건 일회성 마이그레이션. 회귀 TC: 요청 ID가 해소되지 않을 때 훅이 그 ID 아래에 **다른** 스프린트의 요약을 렌더링해서는 안 된다.

**진입 조건**: 스프린트 승인; `feat/v2.1.33-defect-response` 체크아웃.
**종료 조건**: (a) 고의 스크래치 실패 → 러너 exit ≠ 0 이고 CI job 빨강(증명 실행 후 되돌림); (b) 게이팅 하에서 전체 스위트 green; (c) flaky 테스트 수정 또는 사유 기록 격리; (d) ERRATA-34-6 재기술이 S1 리포트에 기록; (e) ENH-417 회귀 TC가 헤더/본문 불일치 불가능함을 증명.
**Quality gates**: `do`에서 M2/M3/M5/M7; `iterate`에서 M1 = 100.
**테스트 영향**: 이 단위 자체가 테스트 영향; 이후 모든 단위가 게이팅을 상속.
**롤백**: workflow + 러너 커밋 revert; 숨은 실패 수정은 독립적으로 유지해도 안전.

---

#### S2 — `io-block-contract` + `bash-path-enforcement` (단일 작업 단위; 파일 공유)

**목표**: Memory Enforcer deny 경로(차별점 #1)가 실제로 차단하고 *이유*를 말하게 한다.

**F3 `io-block-contract` (ENH-410)** — 단위 내 선행:
- `lib/core/io.js:346` `outputBlock(reason)`은 파라미터 **1개**; `scripts/unified-bash-pre.js:439`는 **3개**(`'deny', reason, 'PreToolUse'`)로 호출. `:416-419`에서 구성한 풍부한 reason(지시문, `rule`, `source`, 매칭 패턴, "Edit {source} or scope the command if intentional")이 버려진다. 수정: 의도된 피호출자 `io.js:374` `outputBlockWithContext(reason, alternatives, hookEvent)` 호출.
- 데드 코드 정리 (명시적으로 **보안 수정 아님** — `io.js:343` 주석이 exit(0)은 의도된 graceful deny라 명시): `unified-bash-pre.js:440` `blocked = true` 도달 불가; `pre-write.js:351` `process.exit(2)` 도달 불가 — 후자는 `pre-write.js` 이중 터치 방지를 위해 **S3로 이연**(§8 충돌 행렬).
- 테스트 false positive 교체: `test/integration/hook-wiring.test.js:141-144`(HW-014)는 소스 텍스트 정규식 `/(?:block|deny|getBlockMessage|outputBlock|outputAllow)/` — arity, 도달성, 출력 JSON 형태를 감지할 수 없음. 행위 테스트로 교체: fixture stdin으로 훅 spawn, 출력 JSON 형태와 reason 내용 단언.
- Docs=Code 기원 노트: `docs/sprint/v2114/sub-sprint-4-e-defense.report.md:111`은 존재한 적 없는 2-인자 `outputBlock('deny', reason)` 시그니처를 명세. 역사적 문서는 그대로 둠(소급 수정 없음); 정정은 본 스프린트 리포트에 기록.

**F4 `bash-path-enforcement` (원자적 묶음 {ENH-388, 389, 390} + 393 — 원본 리포트가 분할 금지: "같은 코드 경로의 같은 결함")**:
- **388**: `scripts/unified-bash-pre.js:232-253` — `blocked`를 설정하지 않고, `outputBlock*`을 호출하지 않으며, `:244`에서 audit `result:'blocked'`를 하드코딩하고, `:249`에서 차단 없이 `incrementStat('destructiveBlocked')` 발화. 수정된 `outputBlockWithContext`로 실제 차단 복원.
- **389** (메인 세션 재현 완료): `:236`이 `dd.detect('Bash', { command: toolInput.command })` — **객체** — 를 전달하는데 `lib/control/destructive-detector.js:131` JSDoc은 `@param {string} toolInput`, `:135`는 `JSON.stringify(toolInput || '')` 폴백. 패턴이 `{"command":"…"}`에 매칭 — 시작 앵커 붕괴, JSON 이스케이프 유입. 원시 command 문자열 전달로 수정.
- **390**: `lib/defense/heredoc-detector.js:115-207,219` — 구분자가 `\w+`; 경로 접두사 / 따옴표 / 백슬래시 / 래퍼 단어(`command`, `nice`, `exec`) 허용 추가; `$VAR` 인터프리터 → unknown-interpreter → critical; 구분자는 `[^\s|;&<>]+`로.
- **393**: audit `result`는 실제 결과 반영; `incrementStat('destructiveBlocked')`은 실제 차단 조건부(원본이 388 흡수 허용 — 여기서 흡수).
- **고아 A (ENH 번호 없음)**: `unified-bash-pre.js:454-461` scope-limiter 데드 블록(`sl`과 `level` 할당 후 미참조). 어떤 ENH 대상 파일 표에도 없음. **계획 결정: ENH-388 작업 항목에 명시적으로 편입**(동일 파일, 동일 단위); 메인테이너가 대안으로 후보 번호 ENH-419 부여 가능(결정 D4). *(417은 스프린트 Stop 허위보고 결함, 418은 고아 B가 선점.)*

**진입 조건**: S1 종료 조건 충족(게이팅 가동).
**종료 조건**: 행위 테스트로 증명 — (a) 파괴적 명령 → `rule`/`source` 포함 풍부한 reason과 함께 `{"decision":"block", …}` 출력; (b) detector가 문자열 수신; (c) heredoc 회피 fixture 세트(경로 접두사, 따옴표, 백슬래시, 래퍼 단어, `$VAR`) 전부 감지; (d) audit `result`가 실제 결과와 일치; (e) 정상 명령 코퍼스는 여전히 허용(오탐 가드). 모든 테스트는 `test/` 아래 배치(`tests/` 금지).
**Quality gates**: `do`에서 M2/M3/M5/M7; `iterate`에서 M1; `qa`에서 M3 = 0.
**테스트 영향**: HW-014 교체; `test/integration/`과 `test/security/`에 신규 행위·회피 스위트.
**롤백**: S2 커밋 단일 revert로 이전(비차단) 동작 복원 — 이전 동작이 곧 결함이므로 비상시 전용.

---

#### S3 — `write-path-enforcement` (원자적 묶음 {ENH-398, 399, 400} + 401)

**목표**: Write deny 경로가 실제로 강제한다; 원본 리포트: "한 PR로 묶을 것. 부분 수정 시 우회 경로가 남는다" (단일 브랜치 번역: 나눌 수 없는 하나의 작업 단위).

- **398**: `scripts/pre-write.js` — 현재 유일한 실제 차단은 `:345-351`의 Permission Manager; destructive `:371-372`, blast `:373-374`, scope `:375-376`은 전부 `contextParts.push` → `:392-393 outputAllow`. 세 경로 모두 (이제 수정된) 차단 경로에 배선. `:229`의 audit `result:'blocked'` 하드코딩도 함께 수정. 이연된 ENH-410 데드 코드 정리 완료: `:351 process.exit(2)` 도달 불가.
- **399**: `lib/control/scope-limiter.js:151`이 `path.resolve()`를 계산하지만 `:153` 루트 이탈 검사에만 사용; `:168`은 **원시** `filePath`에서 매칭 문자열을 재유도 — `..`, `./`, `//`, 후행 슬래시, 대소문자 미정규화. 정규화된 resolved 경로로 매칭.
- **400**: `scope-limiter.js:20` `deniedPaths: ['.env*','*.key','*.pem','**/secrets/**','.git/**','node_modules/**']` — 앞 3개는 루트 앵커로 하위 디렉토리 미커버. 앵커 해제(예: `**/.env*`, `**/*.key`, `**/*.pem`) + 하위 디렉토리 커버 증명 테스트.
- **401**: `test/security/scope-limiter.test.js:133-141` SL-014/015는 `r.allowed === false`만 단언하고 `rule` 필드는 단언하지 않음(`test/security` 전체 perl 검증) — 망가진 `*.pem` deny도 통과. `rule` 단언 + 회피 스위트 추가(`sub/dir/.env`, `a/../.env`, `./x.key`, `X.PEM` 대소문자, 후행 슬래시, `//`). **배치 규칙: `test/security/` — `tests/` 아래 신규 파일은 절대 실행되지 않는다.**
- 상류 맥락 (기술만, 행동 없음): CC에도 동일 결함 클래스가 열려 있음(#84697, #84634, #84318) — **두 계층 모두 현재 비강제** 상태이나 독립적으로 발생했으므로 CC 업그레이드가 bkit 쪽을 고쳐주지 않는다. L0–L4 전 레벨 적용(훅 enforcement).

**진입 조건**: S2 종료(수정된 `outputBlockWithContext` 계약 가용).
**종료 조건**: 회피 스위트 green; `rule` 필드 단언; 하위 디렉토리 `.env` 쓰기 고의 시도가 올바른 rule로 차단; 정상 쓰기 코퍼스 무영향.
**Quality gates**: M2/M3/M5/M7 · M1 · M3=0.
**테스트 영향**: `test/security/scope-limiter.test.js` 확장; 신규 회피 스위트.
**롤백**: 단일 revert; S2와 동일한 비상시 전용 주의.

---

#### S4 — `plugin-data-isolation` (ENH-402 → 403 → 383, + 396)

**목표**: 프로젝트 간 백업 clobbering 중단 (#33 사이클에서 실제 디스크 피해 관측: `~/.claude/plugins/data/bkit-bkit-marketplace/backup/meta.json`이 `projectDir: …/tene-studio`를 보유한 채 `bkit-inline` 슬롯이 본 리포를 점유).

- **402 (P0, 선행 — `paths.js:312-317`에서 403과 충돌)**: `lib/core/paths.js:31-36` `pluginDataBackup()` = `path.join(pd, 'backup')` — 프로젝트 세그먼트 없음; 네임스페이스가 프로젝트가 아닌 플러그인 설치 id 단위. 프로젝트 유래 세그먼트 추가. **설계 질문(D5)**: 기존 단일 슬롯 백업의 마이그레이션/호환 읽기 — migrate-on-first-touch vs legacy 무시; 기본 권고: read-fallback + write-new-path.
- **403**: `paths.js:312-317`의 단일 reason 문자열 `backup belongs to different project: X`는 원인을 오귀속 — 가드는 잘못된 *restore*만 막을 뿐 *overwrite*는 막을 수 없다. "가드가 거부함(다른 프로젝트 restore)" vs "당신의 백업이 다른 프로젝트에 의해 덮어써짐"으로 분리.
- **383**: `lib/core/worktree-detector.js:58-84` 메시지가 issue #46808만 언급; `paths.js:292-317`은 노출 경로 없는 `skipped: [...]` 반환. `skipped[]`를 사용자 가시 계층으로 노출; 메시지 확장.
- **396** (387 대체): `WorktreeCreate` / `WorktreeRemove` 훅 등록 — 현재 리포 전체 perl 검증 0회. 설계에서 먼저 bkit이 대상으로 하는 CC 버전에 해당 이벤트가 존재하는지 확인(바이너리/문서 probe로 측정, 가정 금지).

**진입 조건**: S3 종료.
**종료 조건**: 하나의 플러그인 설치를 공유하는 두 프로젝트가 서로의 백업을 더 이상 clobber하지 않음(2개 fixture 프로젝트 디렉토리 통합 테스트); reason 문자열 분리; `skipped[]` 노출; 396 훅 등록 또는 probe 증거와 함께 명시적 defer.
**Quality gates**: M2/M3/M5/M7 · M1 · M3=0.
**테스트 영향**: 이중 프로젝트 백업 신규 통합 fixture.
**롤백**: revert로 구 경로 스킴 복원; 마이그레이션 fallback으로 revert 비파괴.

---

#### S5 — `gate-numeric-hygiene` + `subagent-trust-boundary`

**F7 `gate-numeric-hygiene` (ENH-412)** — bkit의 헤드라인 제품 주장(matchRate 게이트)은 판정 가능해야 한다:
- `lib/infra/sprint/gap-detector.adapter.js:106` `matchRate: typeof parsed.matchRate === 'number' ? parsed.matchRate : 0` — clamp 없음; `typeof NaN === 'number'`는 true. **실행 증명**: NaN은 `>=90`과 `<90`을 모두 false로 → 게이트는 **실패가 아니라 판정 불능**; `999`도 clamp 없이 통과. 수정: `Number.isFinite` 가드 + [0,100] clamp; 무효 입력 → 사유 로깅과 함께 명시적 게이트 FAIL(무음 0 금지, 판정 불능 금지).
- 동일 클래스: `lib/application/quality-gates/measure-router.js:308-328` — 동일하게 수정.
- 폭발 반경: `iterate-sprint.usecase.js` 루프 종료, `kpi.matchRate`, `qualityGates.M1_matchRate.passed`. 회귀 테스트는 두 경로에 NaN / 999 / "85"(문자열) / undefined 주입.

**F8 `subagent-trust-boundary` (ENH-413)** — prose 계층만:
- 맥락: CC v2.1.225가 subagent handoff 분류기에 세 번째 fail-open 추가(`refusedBySafeguard` 0→13, `UNREVIEWED` 0→1, CHANGELOG 14개 항목 전부에 미기재). CC 자체 문구: 거부는 "subagent 자신의 transcript 내용에 반응한다(**그 내용은 subagent가 통제한다**)".
- **구조적 한계 (구속력 있는 설계 제약)**: CC는 이 경고를 구조화된 훅 필드가 아닌 부모 transcript의 prose로 전달 → bkit 훅은 관측도 차단도 불가. **훅 기반 완화는 계획하지 않는다.**
- 작업: "subagent의 주장은 채택 전 메인 세션에서 재현한다" 규칙 전파 — 현재 `skills/cc-version-analysis/SKILL.md:197-236`과 `agents/bkit-impact-analyst.md:125-134`에만 존재 — 실제로 subagent를 파견하는 5개 오케스트레이터(`cto-lead` [`Task()` 권한 18개], `pm-lead`, `qa-lead`, `sprint-orchestrator`, `sprint-master-planner`)와 `skills/pdca`, `skills/sprint`, `.claude/CLAUDE.md`로 확장(현재 전부 **부재** — 검증 완료).
- `scripts/subagent-stop-handler.js:56-59` `isSuccess`는 내용을 전혀 검사하지 않고 기본 TRUE — 설계에서 보수적 내용 인지 검사를 평가; 안전한 방안이 없으면 사유를 기록하고 prose 계층만 유지.
- **정직한 긴장 (모든 하류 문서에 명시)**: 이것은 자동 강제 불가. 계약 테스트는 각 파일에 규칙 문단이 *존재*하는지만 단언할 수 있다 — 그것이 상한이며, 강제를 암시하는 대신 계획이 이를 명시적으로 말한다.

**진입 조건**: S4 종료. **종료 조건**: 두 수치 경로에서 NaN/999/문자열/undefined 회귀 테스트 green; 8개 대상 파일 전부에 규칙 문단 존재 + 존재 단언 계약 테스트; 정직한 긴장 문구 포함.
**Quality gates**: M2/M3/M5/M7 · M1 · M3=0. **롤백**: 두 feature 독립 revert 가능.

---

#### S6 — `session-ux-redesign` (사용자 주도, 최고 가시성)

**목표**: 메인테이너가 선택한 **재설계** 구현 — 3개의 독립 opt-out 대신, 사용자가 실제로 PDCA를 사용하는지 감지하여 세 동작 모두를 그것으로 구동. Issue #77 재오픈(2026-04-15 close; 강제 동작 3건 보고, 첫 번째만 부분 대응, 3건 모두 여전히 기본 ON):

1. 세션 타이틀 덮어쓰기 — `lib/core/config.js:179` `ui.sessionTitle.enabled` 기본 `true`
2. 세션 시작 ASCII 대시보드 — `lib/core/config.js:184` `ui.dashboard.enabled` 기본 `true`
3. UserPromptSubmit 컨텍스트 주입 — `lib/core/config.js:191` `ui.contextInjection.enabled` 기본 `true`

**감지 설계와 무관하게 고쳐야 하는 재현된 근본 원인** (동작 1):
- **핑퐁 재발행**: `lib/core/session-title-cache.js:190-197` `isSameAsCached`가 `rec.action === (action ?? null)` 비교. Stop 훅들(`pdca-skill-stop`, `plan-plus-stop`, `iterator-stop`, `gap-detector-stop`)은 `action:'PLAN'|'ACT'|…`로 발행하지만 `scripts/user-prompt-handler.js:95,290`은 action 없이 `generateSessionTitle({ sessionId })` 호출 → `null`. skill-stop ↔ user-prompt 교대마다 캐시 미스 → 재발행.
- **bkit이 CC의 문서화된 해법을 무시**: CC 문서 `hooks.md:1039` 원문 — `sessionTitle`을 출력하는 훅은 사용자가 명시 설정한 타이틀 덮어쓰기를 피하기 위해 `session_title`을 먼저 확인할 수 있다. `session_title`은 **SessionStart** 입력에 문서화(`hooks.md:1032`), **UserPromptSubmit**에는 바이너리로 확인(`X8t()`가 `session_title: jT(Ft())` 구성)되나 해당 이벤트에는 **미문서화** — 의존 전 경험적 probe 필수. **perl 부재 증명: `session_title`은 bkit `lib/`, `scripts/`, `hooks/` 전체에서 0회 출현.**
- `hooks.md:1060`: SessionStart의 `sessionTitle` 출력은 `startup`/`resume`/`fork`에 적용, `clear`/`compact`에서는 **무시**.
- CC는 `customTitle`(사용자 설정)과 `aiTitle`(자동)을 분리 추적; 우선순위 `agentName || customTitle || aiTitle || summary || …`.

**설계 작업 (순서대로)**:
1. **경험적 probe 최우선 (추측 금지)**: 스크래치 UserPromptSubmit 훅으로 stdin을 덤프하여 이 CC 버전에서 `session_title` 존재/형태를 코드 의존 전에 검증. probe 방법 + 출력을 design 문서에 기록.
2. PDCA 사용 감지기: 신호 정의(예: `.bkit/state/` 하위 PDCA 상태 파일, `docs/01-plan/` 활동, 최근 pdca 스킬 호출), 히스테리시스, 감지기 → {title, dashboard, injection} 활성 상태 매핑.
3. `session_title` 존중: 사용자가 타이틀 설정 시(customTitle 존재) 절대 덮어쓰지 않음 — L0–L4 전 자동화 레벨에서.
4. 감지 결과와 무관하게 핑퐁 수정(`user-prompt-handler`에서 `action` 전달, 또는 null에 대해 `isSameAsCached`를 action 비민감으로).
5. **제약 (구속력)**: context injection 기본 OFF가 **PDCA 사용자에 대해** 8개 언어 자동감지, 모호성 감지, PDCA 상태 인지를 조용히 비활성화해서는 안 된다 — 감지기가 PDCA 사용 중에는 이들을 살려둬야 한다.
6. 마이그레이션: **모든 기존 사용자**의 동작 변경 → CHANGELOG 마이그레이션 노트 + README/CUSTOMIZATION-GUIDE opt-in 문서(문서는 S7 sync에서 착지, 초안은 여기서).

**진입 조건**: S5 종료. **종료 조건**: probe 증거 기록; 감지기 설계+구현+테스트(PDCA 사용자 fixture는 3개 유지; 비PDCA fixture는 0개); `session_title` 설정 시 타이틀 덮어쓰기 없음; 핑퐁 회귀 테스트(stop/prompt 교대 → 단일 발행); 마이그레이션 노트 초안.
**Quality gates**: `design`에서 M4+M8(M8 ≥ 85); M2/M3/M5/M7 · M1 · M3=0. **롤백**: config 기본값은 단일 커밋; revert로 현재(강제) 동작 복원.

---

#### S7 — `docs-privacy-sync` + `residual-p2-p3` (마감 단위)

**F9 `docs-privacy-sync`**:
- **ENH-404 (P1)**: `PRIVACY.md:37` "Does not make network requests of any kind" vs `lib/infra/telemetry.js:11,27-28,153,193-198`의 opt-in OTLP HTTP POST. CC의 피드백 설문이 동의 시 CLAUDE.md/스킬/에이전트/MCP 도구 정의를 업로드하는 것도 공개. 사실대로 재작성.
- **ENH-397 (P3)**: `CUSTOMIZATION-GUIDE.md:1481` `decision:"allow"` 표기 — 잘못된 안내; 정정.
- **ENH-407 (P2)**: `agents/bkit-impact-analyst.md:70` `mcp-servers/` 표기, 실제 디렉토리는 `servers/`; "19 tools" 카운트 검사 자동화(스크립트 또는 계약 테스트).
- **요구사항 #8 문서 동기화 대상 (전부 영어)**: `README.md`, `CUSTOMIZATION-GUIDE.md`, `AI-NATIVE-DEVELOPMENT.md`, `CHANGELOG.md`, `bkit.config.json`, `.claude-plugin/`, `hooks/`, `bkit-system/` — S1–S6 출하분 전체와 동기화, S6 마이그레이션 노트 포함.
- **신규 발견 (편입, 결정 D6)**: 스프린트 master-plan 생성기 자체가 언어 접미사 **없이** `docs/01-plan/features/<id>.master-plan.md`를 기록하여 본 리포의 이중언어 docs 규칙을 위반(바로 이 스프린트의 스켈레톤이 그 사례). 결정: 생성기를 `.en.md`/`.ko.md` 쌍 출력으로 수정 vs 생성 문서 예외 처리. 기본 권고: 생성기 수정; state 스키마의 `masterPlanPath`도 함께 갱신.

**F10 `residual-p2-p3`**:
- **394** (382 대체): `lib/domain/guards/invariant-10-effort-aware.js:24` `Object.freeze(['low','medium','high'])` — CC의 `xhigh`/`max` 누락; 범위 밖 값은 현재 다운그레이드, 업그레이드로 변경해야 함.
- **405**: `lib/core/constants.js:52` `MAX_TEAMMATES = 10`; `lib/team/state-writer.js:259-268`이 아무도 읽지 않는 `droppedTeammates` 기록(perl 검증); `removeTeammate` 프로덕션 호출자 0. 배선 또는 제거.
- **406**: `lib/core/config.js:34,103` 캐시 키 `bkit-config`/`bkit-full-config`가 `PROJECT_DIR` 스코프 아님 — 스코프 적용. (충돌 노트: `config.js`는 S6에서도 수정 — S6 선행; §8 참조.)
- **385**: `scripts/subagent-start-handler.js:91-96` 주석이 7개 필드만 나열, `permission_mode`와 `effort` 누락; `test/contract/l2-smoke.test.js:74-75`는 `{"subagent_type":"cto-lead"}` 주입하나 실제 필드는 `agent_type` — 둘 다 수정.
- **414**: `scripts/permission-request-handler.js:110,153-157` deny에 reason 필드 없음 — 추가.
- **415**: `test/helpers/mcp-client.js` `'2025-03-26'` vs 프로덕션 서버 양쪽 `'2024-11-05'` — 둘 다 CC 지원 협상 목록에 포함 → 런타임 영향 0, 순수 위생; 정렬.
- **395b (defer된 395에서 분할)**: `RECOMMENDED_VERSION` 단언 회귀 테스트 추가(현재 `test/`에서 단언 0회) — 2.1.220 *유지*는 지속(§13), *테스트*는 출하.
- **고아 B**: #30 사이클의 `DirectoryAdded` 훅 등록이 ERRATA-31-5로 ENH 번호를 상실; perl 검증 0회. **계획 결정: 후보 ENH-418 부여, S7 design에서 범위 확인; CC 측 지원을 측정할 수 없으면 사유 기록 후 드롭**(결정 D7).

**진입 조건**: S6 종료. **종료 조건**: 모든 문서 동기화 대상 갱신(영어); PRIVACY.md 사실화; residual 항목 각각 close 또는 사유 기록 defer; CHANGELOG `## [2.1.33]` 섹션 완성(버전 헤딩은 메인테이너 지시 — 헤더 노트 참조).
**Quality gates**: M2/M3/M5/M7 · M1 · M3=0 · 이후 스프린트 전체에 대한 report phase M10/S2/S4.
**롤백**: 문서 전용 + 독립 소규모 수정; 항목별 revert.

### 3.3 대략 토큰 예산 (휴리스틱, 측정 아님)

| 단위 | 추정 | 근거 |
|------|------|------|
| S1 | ~60K | 22개 파일 이관 + workflow + 숨은 실패 4건 수정 |
| S2 | ~70K | 스크립트 2 + lib 모듈 2 + 행위/회피 스위트 |
| S3 | ~60K | 스크립트 1 + lib 모듈 1 + 회피 스위트 |
| S4 | ~45K | paths/worktree + 이중 프로젝트 fixture |
| S5 | ~35K | 소규모 수치 수정 2 + 8개 파일 prose 전파 |
| S6 | ~70K | probe + 감지기 설계 + 캐시/핸들러 변경 |
| S7 | ~55K | 광범위 문서 동기화 + 소규모 residual 8건 |
| **합계** | **~395K** | 전 단위가 기본 예산 100K 이하 (`sprint.contextSizing.maxTokensPerSprint`) |

---

## 4. Sprint Phase Roadmap (작업 단위별)

| Phase | 활성 시점 | 산출물 | Quality Gates |
|-------|---------|--------|---------------|
| prd | 단위 시작 | PRD 문서 (본 계획 §3.2에서 S-단위 범위 도출) | M8 |
| plan | PRD 후 | Plan 문서 | M8 |
| design | Plan 후 | 코드베이스 분석 + 재현 증거 포함 Design 문서 | M4, M8 (≥85) |
| **do** | Design 후 + **사용자 명시 승인 (L2 게이트)** | 구현 | M2, M3, M5, M7 |
| iterate | matchRate < 100 시 | matchRate 100% | M1 (100%) |
| qa | iterate 후 | S1 게이팅 하 전체 스위트 실행 + 기능 QA | M3 (=0), S1 (=100) |
| report | qa 후 | 단위 리포트 + 메모리 파일 갱신(§12) | M10, S2, S4 |
| archived | report 후 | 단위별 terminal | - |

S1 게이트 해석 노트: 이것은 웹 앱이 아닌 플러그인 인프라 스프린트 — 7-Layer dataFlowIntegrity 검사는 단위별 훅 체인 흐름(stdin → 핸들러 → lib → 출력 JSON → CC 동작)으로 해석한다.

---

## 5. Quality Gates 활성화 매트릭스

| Gate | prd | plan | design | do | iterate | qa | report |
|------|-----|------|--------|----|---------|----|--------|
| M1 matchRate (=100) | | | | | ✓ | | |
| M2 | | | | ✓ | | | |
| M3 criticalIssues (qa에서 =0) | | | | ✓ | | ✓ | |
| M4 | | | ✓ | | | | |
| M5 | | | | ✓ | | | |
| M7 | | | | ✓ | | | |
| M8 designCompleteness (≥85) | ✓ | ✓ | ✓ | | | | |
| M10 | | | | | | | ✓ |
| S1 dataFlowIntegrity (=100, 훅 체인 해석) | | | | | | ✓ | |
| S2 | | | | | | | ✓ |
| S4 | | | | | | | ✓ |

이 스프린트 특이 사항: S1 착지 이후에는 **CI 게이트 자체가 quality gate** — 어떤 단위도 `contract-check.yml`이 빨간 상태로 `qa`를 종료할 수 없다.

---

## 6. Success Metrics (5건)

| # | Metric | Target | 측정 방법 |
|---|--------|--------|----------|
| 1 | matchRate (Design ↔ Code) 단위별 | 100% | gap-detector (ENH-412 이후: NaN-safe, clamp 적용) |
| 2 | criticalIssueCount | 0 | code-analyzer |
| 3 | 게이팅 증명 | 고의 실패 → CI 빨강 (S1에서 시연, 이후 유지) | 스크래치 실패 실행 + revert |
| 4 | ENH 원장 마감 | STILL-VALID 21/21 close 또는 사유 기록 defer | §13 원장 vs S7 리포트 |
| 5 | 기능 QA (요구사항 #8) | 전체 통과 | `--plugin-dir .` 사용 `claude -p` 시나리오 (§14) |

---

## 7. Auto-Pause Triggers (4 활성)

| Trigger | 조건 | 사용자 결정 옵션 |
|---------|------|----------------|
| QUALITY_GATE_FAIL | M3 > 0 OR S1 < 100 | fix & resume / forward fix / abort |
| ITERATION_EXHAUSTED | iter ≥ 5 AND matchRate < 90 | forward fix / carry / abort |
| BUDGET_EXCEEDED | cumulativeTokens > budget | budget 증액 & resume / abort / archive |
| PHASE_TIMEOUT | phase 진행 시간 > config.phaseTimeoutHours | timeout 연장 / force-advance / abort |

ENH-412 이후 노트: 이 트리거들의 matchRate 비교는 S5 이후에야 NaN-safe가 된다; 그 전까지는 non-finite matchRate 판독을 수동으로 QUALITY_GATE_FAIL로 취급.

---

## 8. 파일 충돌 행렬 (단일 브랜치 — 충돌은 단위 순서로 해소)

| 파일 | 접촉 항목 | 해소 |
|------|-----------|------|
| `scripts/unified-bash-pre.js` | ENH-388, 389, 393, 410(호출부 :439), 고아 A(:454-461) | **단일 작업 단위(S2), 하나의 일관된 변경 세트** — 단위 간 분할 절대 금지 |
| `scripts/pre-write.js` | ENH-398(S3) + ENH-410 데드 `process.exit(2)` :351 | 410의 pre-write 부분을 **S3로 이연** — 파일은 한 번만 터치 |
| `lib/core/io.js` | ENH-410 (피호출 계약) | S2 전용; S3은 수정된 계약을 소비만, 수정 안 함 |
| `lib/core/paths.js` | ENH-402, 403(둘 다 :312-317), 383(:292-317) | S4 내부 순차: **402 → 403 → 383** |
| `lib/core/config.js` | F1 ui 기본값(:179,184,191 — S6) + ENH-406 캐시 키(:34,103 — S7) | S6 선행; S7은 S6 상태 위에서 작업; 라인 범위는 분리되나 동일 파일 — S7 design에서 기본값 로딩 상호작용 검증 |
| `test/security/scope-limiter.test.js` | ENH-401 | S3 전용 |
| `test/integration/hook-wiring.test.js` | HW-014 교체 | S2 전용 |
| `.github/workflows/contract-check.yml` | ENH-411 (:74, :96-99) | S1 전용 |
| `CHANGELOG.md` / `README.md` / `CUSTOMIZATION-GUIDE.md` | S6이 마이그레이션 노트 초안; S7(F9)이 전체 문서 동기화 통합 | 최종 텍스트는 S7에서 한 번 착지 |
| `scripts/user-prompt-handler.js` | F1 (:95, :290) | S6 전용 |

---

## 9. Risks & Mitigation (리스크 레지스터)

| # | 리스크 | 가능성 | 영향 | 대응 |
|---|--------|--------|------|------|
| R1 | CI 게이팅 활성화가 즉시 빌드를 빨갛게 만듦(exit code가 전파되는 순간 숨은 실패 AL-007, TE-001/TE-025, flaky v2112 invariant 노출) | 순서 오류 시 확실 | 높음 — 이후 전 단위 차단 | S1 내부 순서가 구속력: ENH-411의 3개 계층을 켜기 **전에** 숨은 실패 수정; flaky 테스트는 수정 또는 사유 기록 격리 |
| R2 | 세션-UX 재설계가 **모든 기존 사용자**의 동작을 변경; 부주의한 기본 OFF는 8개 언어 감지 / 모호성 감지 / PDCA 상태 인지를 조용히 제거 | 부주의 설계 시 높음 | 높음 — 사용자 신뢰 | PDCA 사용 감지기가 PDCA 사용자의 기능을 유지(구속력 제약 S6-5); CHANGELOG 마이그레이션 노트; README/CUSTOMIZATION-GUIDE opt-in 문서; UserPromptSubmit의 미문서화 `session_title` 의존 전 경험적 probe |
| R3 | 실제 차단 복원(388/398)이 정상 명령/쓰기에 오탐 유발 | 중간 | 중상 — L0–L4 전 레벨 워크플로 파손(훅 무조건 실행) | S2/S3 종료 조건에 정상 허용 코퍼스 테스트; 풍부한 reason 문자열(410 이후)이 어떤 rule/source가 발화했고 어떻게 스코프할지 안내 |
| R4 | 다세션에 걸친 장수 단일 브랜치의 main 드리프트 | 중간 | 중간 | 커밋 최소화; 세션 시작 시 rebase 정책 결정; 메모리 파일 롤링 상태(§12) |
| R5 | ENH-412 수정이 iterate 루프 종료 동작 변경(기존 판정 불능 게이트가 실패하기 시작) | 중간 | 중간 | NaN/999/문자열/undefined 회귀 테스트; 새 실패는 회귀가 아닌 드러난 진실로 취급 — 단, 수용 전 각각 감사 |
| R6 | subagent trust boundary는 자동 강제 불가; 이해관계자가 강제된다고 오인 가능 | 중간 | 중간 — 거짓 안전감 | 모든 산출물에 정직한 긴장 문구 필수; 계약 테스트는 문단 존재만 단언하며 그 사실을 명시 |
| R7 | 신규 테스트를 `tests/`에 배치하면 조용히 영원히 미실행 | 중간(습관) | 높음 — S1 무효화 | 전 단위 종료 조건에 배치 규칙 명시; S1에서 러너 수준 검사 추가 또는 `tests/` 모호성 자체 제거(D3) |
| R8 | AL-007 SoT 결정(19 vs 29 vs 40)을 일방적으로 잘못 내림 | 낮음 | 중간 | S1 design 게이트에서 메인테이너 결정 D1; 기본 권고는 문서화하되 가정하지 않음 |
| R9 | 백업 경로 마이그레이션(402)이 revert 시 또는 구버전에서 기존 단일 슬롯 백업 파손 | 낮음 | 중간 | read-fallback + write-new-path 설계(D5); revert 비파괴 |
| R10 | UserPromptSubmit의 `session_title`은 바이너리 확인이나 미문서화 — CC가 예고 없이 변경 가능 | 중하 | 중간 | S6 design에서 probe; 우아한 강등(부재 → 해당 신호에 대해 현행 유지); design 문서에 미문서화 의존성으로 기록 |

---

## 10. Cross-Sprint Dependency (외부)

- **입력**: #33/#34 사이클 CC 버전 영향분석 원장(ENH-388~416, ERRATA-34-6); Issue #77 이력; 메인테이너 지시(버전 v2.1.33, 단일 브랜치, L2, 재설계 선택).
- **하류 소비 출력**: 정정된 원장 재기술(ERRATA-34-6)이 다음 cc-version-analysis 사이클에 공급; S1 게이팅 인프라가 이후 모든 스프린트의 기준선; RECOMMENDED_VERSION 유지 근거(§13)가 다음 사이클 재평가로 이월.
- **명시적 비의존**: 이 스프린트의 어떤 것도 CC 릴리스를 기다리지 않는다; CC 측 쌍둥이 결함(#84697/#84634/#84318, #84302/#84701/#84632)은 추적 대상일 뿐 차단 요소가 아니다.

---

## 11. 승인 게이트 & 결정 사항 (L2 프로토콜)

**구조적 게이트**:
1. **작업 단위별 `do` 진입 (L2 범위)** — `design` 후 자동 진행 정지; 구현 시작 전 사용자 승인. S1–S7 각각 적용.
2. **main으로의 PR 머지** — 사용자 명시 승인 필수. 머지 후: git 태그 `v2.1.33` + 하이라이트와 사용자 경험 변화를 담은 **영문** GitHub Release note(세션-UX 재설계가 UX 헤드라인; enforcement 복원과 CI 게이팅이 신뢰성 헤드라인).

**대기 중인 메인테이너 결정 (지정된 design 게이트에서 해소 — 기본값은 권고이지 가정이 아님)**:

| ID | 결정 | 게이트 | 기본 권고 |
|----|------|--------|-----------|
| D1 | ACTION_TYPES SoT: 19(문서) vs 29(테스트) vs 40(라이브 코드) | S1 design | 코드(40)가 SoT; 문서는 S7에서 수정 |
| D2 | Trust 기본 점수: 테스트를 출시값 40에 맞춤 vs 출시 기본값 변경 | S1 design | 테스트를 출시값에 맞춤 |
| D3 | ENH-416: 22개 파일 `test/` 이관 vs 러너에 `tests/` 인식 추가 | S1 design | 이관(단일 트리, R7 영구 제거) |
| D4 | 고아 A(`unified-bash-pre.js:454-461`): ENH-388 편입 vs ENH-419 부여 | S2 design | 388 편입(동일 파일, 동일 단위) |
| D5 | ENH-402 백업 마이그레이션: read-fallback vs legacy 무시 | S4 design | read-fallback + write-new-path |
| D6 | master-plan 생성기 이중언어 출력: 생성기 수정 vs 생성 문서 예외 | S7 design | 생성기 수정(`.en.md`/`.ko.md` 출력) |
| D7 | 고아 B(`DirectoryAdded`): ENH-418 부여 vs 사유 기록 드롭 | S7 design | CC 지원 probe 선행; 측정 가능하면 부여 |

---

## 12. 다세션 재개 프로토콜

롤링 상태는 에이전트 메모리 파일 **`v2133-defect-response-progress.md`**에 유지(`v2132-cc219-nesting-progress.md`와 동일 패턴).

**모든 세션 종료 시 (또는 단위 `report` phase)** 메모리 파일 갱신 항목:
- 현재 단위(S1–S7) + phase + `feat/v2.1.33-defect-response` 위 마지막 커밋 해시
- 미해결 메인테이너 결정(D1–D7)과 상태
- 새로 측정된 사실(측정 방법 포함 — 추측 금지)
- 콜드 재개 가능할 만큼 정밀한 다음 행동

**모든 세션 시작 시**:
1. 메모리 파일 읽기; 2. 브랜치에서 `git log --oneline -10` (코드 상태는 메모리보다 git이 권위); 3. 현재 단위에 대해 본 master plan §3.2 재독; 4. 메모리의 주장을 실행 전 워킹 트리로 검증(파일/라인을 지목하는 메모리는 과거에 대한 주장이지 현재가 아님).

충돌 규칙: 워킹 트리 > git 이력 > 메모리 파일 > 본 계획의 시점 스냅샷 서술.

---

## 13. Deferred / Out of Scope (재논의 금지)

| 항목 | 상태 | 사유 |
|------|------|------|
| **ENH-395a / 384** — `RECOMMENDED_VERSION`을 `2.1.220` 위로 인상 | **유지 (의도된 것, 결함 아님)** | #33과 #34 사이클 모두 유지 권고: npm `stable`이 정확히 2.1.220(드리프트 0); v2.1.225는 watch-list 이슈 0건 해소; 인상 시 #84892와 #84925 회귀 유입. |
| **ENH-395b** — `RECOMMENDED_VERSION` 회귀 테스트(현재 단언 0) | **범위 내 → S7/F10** | 395의 유효한 절반, 분할됨. |
| **ENH-386** | Deferred | 394 착지 후에만 재평가. |
| **ENH-408** | Deferred | 미검증 CC 동작 의존 — "추측 금지" 위반이 됨. |
| **ENH-409** | Dropped | 원장 기준. |
| SUPERSEDED | 381→391, 382→394, 384→395, 387→396 | 원장. |
| NEEDS-RECHECK | 3건 | 향후 포함 전 재측정. |

원장 스냅샷: STILL-VALID 21 (P0 7 / P1 7 / P2 4 / P3 3), SUPERSEDED 4, NEEDS-RECHECK 3, DROPPED 1. 최대 출시 ENH = **380**; 본 계획 시점에 381–416 중 출시된 것 없음.

---

## 14. Definition of Done (v2.1.33 릴리스 게이트)

1. STILL-VALID 21건 전부: 게이팅 테스트와 함께 close, 또는 사유 기록 defer(§13 갱신).
2. **게이팅 증명**: 고의 실패가 `node test/run-all.js`를 non-zero로, CI를 빨갛게 만든다(S1에서 시연; 릴리스 시점에도 참).
3. **기능 QA (요구사항 #8)**: `--plugin-dir .` 사용 `claude -p` 시나리오로 전 구간 통과 — 훅 deny 경로(bash + write, 풍부한 reason 포함), 백업 격리(이중 프로젝트), 세션-UX 감지기(PDCA·비PDCA fixture), 스프린트 게이트 수치.
4. **문서 동기화 완료 (전부 영어)**: `README.md`, `CUSTOMIZATION-GUIDE.md`, `AI-NATIVE-DEVELOPMENT.md`, `CHANGELOG.md`, `bkit.config.json`, `.claude-plugin/`, `hooks/`, `bkit-system/` — 세션-UX 마이그레이션 노트 포함; PRIVACY.md 사실화(ENH-404).
5. 언어 정책 준수: 코드/주석/커밋/PR 영어; 신규 `docs/` 파일은 `.en.md`+`.ko.md` 이중언어 쌍; 8개 언어 트리거 키워드 목록 불변.
6. 단일 브랜치 `feat/v2.1.33-defect-response`, 커밋 최소화; **main PR 머지는 사용자 명시 승인**; 이후 태그 `v2.1.33` + 영문 GitHub Release note(하이라이트 + 사용자 경험 변화).
7. 메모리 파일 `v2133-defect-response-progress.md` 최종 상태 기록(RELEASED 마커), v2.1.32 패턴 준용.

---

## 15. Resume / Abort 흐름

| 상황 | 절차 |
|------|------|
| Auto-pause 후 resume | `/sprint resume v2133-defect-response` — 정지 사유 해소 검증; §12 프로토콜 재독 |
| 신규 세션 콜드 스타트 | §12 세션 시작 시퀀스(메모리 → git → 계획) |
| 사용자 abort | `/sprint archive v2133-defect-response` — terminal state; 메모리 파일에 abort 사유 + 마지막 정상 커밋 기록 |

---

## 16. Sprint 추적 (Living document)

본 master plan은 스프린트 진행 중 누적 KPI 갱신과 phase 전이 시 history append를 받는다; archive 시 readonly 전환. 단위 수준 상태 변화는 `.bkit/state/master-plans/v2133-defect-response.json`(`sprints[]`, §3.1의 `dependencyGraph`)에 미러링. 알려진 후속 과제: state JSON의 `masterPlanPath`가 현재 접미사 없는 경로를 가리킴 — 결정 D6과 함께 갱신.

---

**Next Phase**: 작업 단위 S1(`proof-infrastructure`)의 `prd` — §3.2-S1에서 범위를 도출해 `docs/01-plan/features/v2133-defect-response.prd.{en,ko}.md` 초안 작성, L2 하에서 `plan`·`design`까지 자동 진행 후 `do` 진입 전 사용자 승인 대기.

> **Status**: Draft v1.0 — pending review.
