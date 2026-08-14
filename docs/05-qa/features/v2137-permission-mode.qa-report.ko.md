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
