# v2137-permission-mode QA 보고서

| | |
|---|---|
| 기능 | `v2137-permission-mode` |
| 대상 릴리스 | v2.1.37 |
| 브랜치 | `feat/v2.1.37-permission-mode-awareness` |
| 런타임 | Claude Code **v2.1.231**, Node v22.22, darwin 24.6.0 |
| 판정 | **QA_PASS** |

## 1. 무엇을 증명해야 했나

이 릴리스는 bkit을 **의도적으로 더 조용하게** 만든다. 여기엔 특정한 위험이 따른다 — 밖에서
보면 조용해진 것과 고장난 것이 똑같이 보인다는 것이다. 그래서 QA 계획은 하나의 규칙 위에
세워졌다: 이제 무언가가 *허용된다*는 모든 단언은, 같은 실행에서 진짜 파괴적 명령이 여전히
*멈춰야* 의미가 있다.

추론이 아니라 증거로 답해야 했던 세 질문:

1. 답할 사람이 없는 곳에서 ask 계층이 실제로 물러나는가?
2. 모든 critical 거부가 모든 모드에서 살아남는가?
3. bkit이 여전히 동작하는가 — 단위 테스트가 아니라 실제 Claude Code 세션에서, 전부?

## 2. Node 스위트

`node test/run-all.js`

| 카테고리 | 결과 |
|---|---|
| Unit | 1980 / 1980 |
| Integration | 611 / 611 |
| Security | 267 / 267 |
| Regression | 796 / 796 |
| Performance | 157 / 161 (4 skip) |
| Philosophy | 140 / 140 |
| UX | 185 / 185 |
| E2E (node) | 151 / 151 |
| Architecture | 100 / 100 |
| Controllable AI | 80 / 80 |
| Behavioral | 45 / 45 |
| Contract | 760 / 761 (1 skip) |
| **합계** | **5277 TC · 5271 PASS · 1 FAIL · 5 SKIP** |

유일한 실패는 `live-run-freshness` LRF-3이었다: 이번 릴리스에서 `hooks/hooks.json`이 바뀌어
(설명에 버전이 들어 있다) 기록된 호스트 통합 증거가 출하물을 더 이상 설명하지 못하게 됐다.
게이트가 제 일을 한 것이다. 단언을 완화하지 않고
`node test/qa-harness-full-live.js --layer hooks --record`로 **재기록**해 해소했다.

비교 기준선: 이 트리에서 v2.1.36은 **4364 TC / 0 FAIL**이었다. +913 중 89개는 이번 릴리스의
신규 테스트, 824개는 존재했지만 아무 데서도 실행되지 않던 것들이다(§5).

## 3. 라이브 QA — 실제 Claude Code 세션

`bash test/qa-harness-live-claude-p.sh` — 각 케이스는 격리된 프로젝트 디렉터리에서
`claude -p --plugin-dir <repo>`를 실행한다.

**결과: 18 / 18 PASS.**

| 그룹 | 케이스 |
|---|---|
| 슬래시 명령으로 스킬 도달 | `/bkit`, `/bkit:pdca status`, `/bkit:sprint list`, `/bkit:control`, `/bkit:bkit-explore` — 5 PASS |
| MCP 서버 | 라이브 세션에서 `bkit_pdca_status` 응답 — PASS |
| 에이전트 디스패치 | `code-analyzer` 스폰 및 보고 — PASS |
| 8개국어 자동감지 | 한국어 프롬프트 라우팅 정확 — PASS |
| 강제(Enforcement) | 6 PASS (§4 참조) |
| 훅 디스패치 | 라이브에서 10개 이벤트 관측: SessionStart, UserPromptExpansion, UserPromptSubmit, Stop, SessionEnd, PreToolUse, PostToolUse, PostToolUseFailure, SubagentStart, SubagentStop — PASS |
| 세션 타이틀 강제 안 함 (#77) | PASS |

## 3b. 전 표면 라이브 QA — 출하되는 모든 기능

위 절은 표본이다. 이 절은 아니다: `--layer` 없이 실행한
`node test/qa-harness-full-live.js`가 네 레이어 전부를 실제 Claude Code 세션으로 돌린다.

**결과: 139 / 140 PASS**, CC v2.1.231.

| 레이어 | 케이스 | 결과 | 무엇이 증명되나 |
|---|---|---|---|
| skills | 44 + 인벤토리 | **44 / 45** | 모든 스킬이 해석되고 응답한다. 인벤토리 케이스는 호스트 자체 디버그 로그의 `Loaded N skills from plugin bkit`를 읽으므로, 디렉터리 전체가 등록 실패해도 통과할 수 없다 |
| agents | 34 | **34 / 34** | 모든 에이전트가 디스패치된다 — 모델의 산문이 아니라 훅 원장의 `SubagentStart`로 단언 |
| hooks | 23 | **23 / 23** | 21개 이벤트 전부가 디스패치 관측됨 |
| mcp | 38 | **38 / 38** | 두 서버의 19개 도구 전부 |

유일한 미달은 `cc-version-analysis`가 600초 예산을 넘긴 것이다. 직후 격리 측정:
**exit 0, 1330초**, Phase 1 조사 완료 및 산출물 기록. 이 스킬은 Claude Code 릴리스를
문서·블로그·GitHub에 걸쳐 조사한다. 분 단위가 정상 형태다. 결과를 해명하는 대신 하네스
예산을 측정치 위로 올렸다 — "not necessarily broken"을 싣고 다니는 QA 보고서는 독자에게
그 보고서를 할인해서 읽으라고 가르치는 셈이다.

**이 절이 존재하는 이유.** 이 보고서의 앞선 초안은 18건 표본을 표제로 내세우면서 무엇을
빼놓았는지 말하지 않았다. 44개 스킬 중 5개, 34개 에이전트 중 1개, 19개 MCP 도구 중 1개만
라이브로 실행했었다. 그 안의 숫자는 사실이었고, 그것이 준 인상은 사실이 아니었다.

## 3c. bkit 자신의 QA 스킬이 이 저장소에서 찾아낸 것

전 표면 스윕이 bkit 자신에게 `/bkit:qa-phase`를 실행했고, 리포트를 남겼다. 판정은
**CONDITIONAL PASS — 제품 결함 0, 테스트 인프라 결함 1** 이었고, 그 결함이 바로 이번
릴리스가 QA를 통과하는 과정에서 저지른 실수 두 건의 근본 원인이다.

**`lib/core/platform.js:47`**

```js
const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || process.cwd();
```

`PROJECT_DIR`는 모듈 로드 시점 상수이고, bkit의 모든 상태 읽기·쓰기가 이를 경유한다. 따라서
테스트가 자기를 격리하려고 하는 두 가지 — `process.chdir(tmpDir)`, 저장소 루트 아래 픽스처
작성 — 은 **동작할 수 없다**: 상수는 둘 중 어느 것보다 먼저 얼어붙었고, `loadFresh()`는 대상
모듈의 require 캐시는 무효화하지만 `platform.js`는 그러지 않는다.

직접 관측된 결과:

- **동일한 `--unit` 실행 두 번이 다른 결과**를 냈다: 4 FAIL / 2 SKIP, 그다음 3 FAIL / 1 SKIP.
  같은 입력에 답이 달라지는 스위트는 릴리스를 게이팅할 수 없다.
- 테스트가 실제 프로젝트에 썼다: `trust-profile.json`(점수 72 / L3), 체크포인트 3개,
  `pdca-status.json`이 ~0.7 KB에서 5.6 KB로 증가.
- 실패 시 픽스처 유출 — `TC-F4-1-U5`는 단언 *뒤에* 백업을 복원하므로, 던지는 단언이 복원을
  건너뛴다.

**테스트 너머로 중요한 이유**: `trust-profile.json`은 L0–L4 자동화 게이트와 파괴적 작업
가드레일을 구동한다. 유출된 프로파일은 bkit이 묻지 않고 하는 일을 바꾼다. 그 실행에서 새
임시 프로젝트가 trustScore 72 / L3로 해석됐다 — 문서상 기본값은 38 / L0 — 코드 버그가 아니라
컨텍스트를 넘어 상태가 새어 들어왔기 때문이다.

**이 보고서 자신의 숫자도 그 발견에 의해 한정된다.** §2의 0-FAIL 실행은 실제였고 여기서
재현됐지만, 같은 결함이 이 스위트의 앞선 두 실행이 서로 어긋나게 만든 원인이다. §2는 트리의
속성이 아니라 "이 머신에서, 이 실행들에서 0 FAIL"로 읽어야 한다.

**v2.1.37에서 고치지 않는다.** 테스트 인프라이고, blast radius가 상태를 건드리는 모든
테스트이며, 행동 변경 릴리스에 끼워 넣으면 양쪽 모두 혼탁해진다. 입력 계약 게이트와 함께
v2.1.38로 이월.

## 4. 새 계약, 라이브 실측

강제 그룹이 이번 릴리스가 증명되는 지점이다. 이 그룹은 **완화가 아니라 재구성**됐다: 이전
버전은 전부를 `acceptEdits`에서 돌렸는데 이번 릴리스가 그 모드를 억제 모드로 만들었으므로,
그냥 두었다면 보호 단언이 동어반복이 될 뻔했다.

| 단언 | 결과 |
|---|---|
| PreToolUse가 재귀 삭제에 ask/deny 반환 (모드 필드 없음) | PASS |
| 결정이 발화한 규칙 이름을 명시 | PASS |
| **`bypassPermissions`에서 확인 요청이 올라오지 않음** | PASS |
| **음성 대조군: `bypassPermissions`에서도 critical 삭제는 여전히 거부** | PASS |
| 파괴적 명령 미실행 (감독 세션, `--permission-mode default`) | PASS |
| 감독 세션에서 `guard-target` 생존 | PASS |
| 비밀 파일 쓰기 거부 | PASS |
| `config/.env` 미생성 | PASS |

셋째와 넷째 행이 이번 릴리스를 한 줄로 요약한다: 질문은 물러나고, 거부는 물러나지 않는다.

## 5. 커버리지 공백 해소

스윕 결과 **`test/run-all.js`에도 어떤 워크플로에도 등록되지 않은 테스트 파일 148개**를
찾았다. 수동 실행: 147개 통과, 1개 실패 — `component-inventory`였고, 두 문서가 여전히 198이라
말하는 동안 이번 릴리스가 lib 모듈을 추가한 것을 잡아내고 있었다.

148개 전부 등록했다. 이것은 v2.1.36이 한 릴리스 전에 적어둔 실패다 — "두 러너가 all tests의
의미에 대해 어긋나는 것이 공백이 숨는 방식" — 다만 이들은 **양쪽 모두에서** 빠져 있었다.

**여전히 미커버, 수정 대신 기록**: `test/qa-harness-live-claude-p.sh`는 `.sh` 파일이라 아무
데서도 참조되지 않는다. 위 스윕은 `*.test.js`만 매칭해서 자기 자신을 잡지 못했다.

## 6. 스위트 밖에서 실행한 게이트

| 게이트 | 결과 |
|---|---|
| `scripts/docs-code-sync.js` | PASS — drift 0 |
| `scripts/validate-plugin.js` | PASS |
| `scripts/check-deadcode.js` | PASS |
| `scripts/check-domain-purity.js` | PASS |
| `scripts/check-guards.js` | PASS |
| `scripts/check-test-tracking.js` | PASS — untracked 0 |
| `test/contract/invocation-inventory.test.js` | PASS |
| `test/contract/component-inventory.test.js` | PASS (문서 카운트 교정 후) |
| `tests/qa/bkit-full-system.test.js` | PASS |

**ESLint**: CI에서 실행되지 않으며, 변경 파일들의 `no-console` 지적은 HEAD의 같은 파일에도
동일하게 존재한다. 신규 도메인 모듈은 lint 클린. 흡수하지 않고 그대로 보고한다.

## 7. 재현 매트릭스 — 전/후

7개 permission mode × 21개 명령, 출하 훅에 투입
(`test/e2e/permission-mode-matrix.test.js`):

| | 전 | 후 |
|---|---|---|
| 멈춘 benign 명령 | 14 | **0** |
| 여전히 거부되는 음성 대조군 | 49/49 | **49/49** |
| 모드별로 달라지는 ask 등급 행 | 0 — 모든 열이 동일 | 4 / 4 |
| `absent` 열이 `default`와 일치 | 해당 없음 | 예 — 구버전 Claude Code 영향 없음 |

## 8. 잔여 리스크

- **`auto` 모드는 와이어에서 한 번도 관측하지 못했다.** 이 환경에 없는 계정 자격이 필요하다.
  정책적으로 사람이 있는 것으로 취급(억제 안 함)하며, 측정된 것처럼 암시하지 않고 결정
  지점에 그 사실을 코드로 적어두었다.
- **`permission_mode`의 하한을 확정하지 못했다.** 바이너리 조사는 v2.1.227/228/231에서 이를
  찾았지만, 페이로드 패킹이 다른 v2.1.226에서는 대조 마커 `hook_event_name`조차 찾지 못했다 —
  따라서 구버전에 대해 아무 말도 하지 않는다. 그래서 부재는 "알 수 없음, 아무것도 바꾸지 않음"
  으로 취급하며, `absent` 열로 검증했다.
- **`acceptEdits` 결정(D2)은 메인테이너의 것**이며 셋 중 가장 넓다. 다만 그 모드에서도
  Claude Code는 비파일시스템 Bash에 자체 프롬프트 정책을 적용하므로, bkit의 질문을 없앤다고
  해서 호출이 무감독이 되지는 않는다.
