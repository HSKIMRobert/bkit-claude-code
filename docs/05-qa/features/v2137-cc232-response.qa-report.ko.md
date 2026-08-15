# v2137-cc232-response QA 보고서

| | |
|---|---|
| 기능 | `v2137-cc232-response` (CC v2.1.228 → v2.1.232 영향 대응) |
| 대상 릴리스 | v2.1.37 |
| 브랜치 | `feat/v2.1.37-permission-mode-awareness` (PR #150) |
| 런타임 | Claude Code **v2.1.232**, Node v26, darwin 24.6.0 |
| 판정 | **QA_PASS** |

## 1. 무엇을 증명해야 했는가

이번 대응은 계약이 깨진 게 아니라 **bkit 아래에서 기본값이 바뀐** 것이 대부분입니다. 그래서
리스크의 성격이 다릅니다 — 바뀐 기본값은 오류도, 실패한 테스트도, 불평도 만들지 않습니다.
조용히 틀린 숫자를 만들거나, 조용히 발화를 멈춘 가드를 만듭니다.

따라서 계획은 세 질문을 중심으로 세웠고, 각각 근거로만 답할 수 있습니다.

1. **훅 계약이 실제로 유지되었는가?** "테스트가 통과했는가"가 아닙니다 — 그 테스트들은
   v2.1.232가 존재하기 전에 작성되었습니다.
2. **새 fork 기본값 아래에서 bkit이 정직하게 동작하는가?** 구체적으로: 측정할 수 없는
   게이트가 점수 대신 **점수 없음**을 보고하는가?
3. **v2.1.232 실세션에서 bkit 전체가 여전히 동작하는가** — 모든 스킬, 에이전트, 훅 이벤트,
   MCP 툴?

계획 전체를 관통한 규칙 하나는 이슈 #148에서 이어받았습니다. **무언가가 이제 통과한다는
단언은, 실패해야 할 것이 같은 실행에서 여전히 잡히지 않으면 무가치합니다.** 아래 모든
블록에 대조군이 있습니다.

## 2. Node 스위트

`node test/run-all.js`

| 분류 | 결과 |
|---|---|
| Unit | 1980 / 1980 |
| Integration | 611 / 611 |
| Security | 267 / 267 |
| Regression | 796 / 796 |
| Performance | 157 / 161 (4 skip) |
| Philosophy | 140 / 140 |
| UX | 185 / 185 |
| E2E (Node) | 151 / 151 |
| Architecture | 100 / 100 |
| Controllable AI | 80 / 80 |
| Behavioral | 45 / 45 |
| Contract | 760 / 761 (1 skip) |
| **합계** | **5,272 / 5,277 — 0 FAIL, 5 skip** |

신규 회귀 스위트 4종은 전부 **수정 전 트리에서 실제로 실패함을 실증**했습니다. 수정 후
통과만 확인하는 것으로는 그 테스트가 결함을 잡는다는 증거가 되지 않습니다.

| 스위트 | 수정 전 결과 |
|---|---|
| `enh-477-git-destruction-guards` | 19개 단언 중 10개 실패 |
| `agent-frontmatter-fields` | 6개 단언 중 4개 실패 |
| `enh-475-476-unmeasured-honesty` | (신규 동작; iterate 루프가 더는 사이클을 소모하지 않음을 단언) |
| `enh-433-hook-output-visibility` | (신규 동작; 출력이 아니라 **전달**을 단언) |

## 3. 훅 계약 — Breaking 0 주장의 근거

`~/.local/share/claude/versions` 아래 **실제 바이너리 4개**에서 측정했습니다. CHANGELOG
추론이 아닙니다.

`grep -a -o -F -e '<needle>' -- <binary> | wc -l`

| 마커 | 227 | 228 | 231 | 232 |
|---|---|---|---|---|
| `hookSpecificOutput` | 124 | 124 | 124 | 124 |
| `permissionDecision` | 34 | 34 | 34 | 34 |
| `permissions.deny` | 9 | 9 | 9 | 9 |
| `forked_skill_depth_cap` | 2 | 2 | 2 | 2 |
| `bashCommandClamp` | 42 | 42 | 42 | 42 |
| `hook_event_name` | 78 | 78 | 78 | 78 |
| `stop_hook_active` | 7 | 7 | 7 | 7 |
| `"SubagentStart"` | 13 | 13 | 13 | 13 |
| `continueOnBlock` | 3 | 3 | 3 | 3 |
| `launcher_hooks` | 0 | 0 | **30** | **30** |

227 열이 직전 사이클의 독립 측정과 정확히 일치합니다 — **서로 다른 두 측정이 일치한다는
점**이 이 열을 신뢰할 수 있게 만듭니다.

유일한 이동은 `launcher_hooks`이고, **가산적**(v2.1.231의 서버 공급 훅 허용목록 신설)이며
기존 필드를 하나도 바꾸지 않습니다. **Breaking 0. 누적 연속 호환 171.**

이 측정은 이제 재구성이 아니라 `scripts/cc-binary-equivalence.js`입니다. 수작업 방식과의
동등성은 지름길을 배제하는 겹침 쌍으로 단언합니다 — `PreToolUse` 140과 `"PreToolUse"` 34를
독립적으로 계수.

## 4. 라이브 QA — 실제 Claude Code v2.1.232 세션

`node test/qa-harness-full-live.js` — 모든 케이스가 작업 트리를 로드한 실제
`claude -p --plugin-dir` 세션입니다.

| 레이어 | 통과 | 실패 |
|---|---|---|
| skills | 45 | 0 |
| agents | 34 | 0 |
| hook events | 23 | 0 |
| MCP tools | 38 | 0 |
| **fork mode** | **5** | **0** |
| **합계** | **145** | **0** |

에이전트 디스패치는 출력에 오류 문자열이 없다는 것이 아니라 **훅 디스패치 원장**
(`SubagentStart`의 `agent_type`)으로 증명합니다. 이전 버전의 그 레이어는 34/34를 보고하면서
아무것도 증명하지 못했을 것입니다.

### 4.1 fork 레이어 — 이번 릴리스가 닫은 공백

다른 모든 케이스는 `-p`로 실행되고, `-p`가 바로 Claude Code가 fork 모드를 **끄는** 지점입니다.
죽은 표면을 찾으려고 만든 하네스가 정작 **기본값이 바뀐 표면에 도달할 수 없었습니다.**
`CLAUDE_CODE_FORK_SUBAGENT=1`은 비인터랙티브에서도 fork 모드를 켜므로, 스크립트 세션을
인터랙티브 기본값과 같은 코드 경로에 올립니다.

| 단언 | 결과 |
|---|---|
| fork 게이트가 살아있음: Agent 툴에 `run_in_background` 없음 | PASS |
| 측정 불가 게이트가 **점수 없음**을 보고 | PASS |
| 실패 메시지가 fork 모드를 유력 원인으로 지목 | PASS |
| v2.1.232에서 SessionStart 어드바이저리가 노출됨 | PASS |
| 완화 설정 시 어드바이저리가 조용해짐 | PASS |

**첫 번째 단언이 사활적입니다.** 게이트가 실제로 켜졌음을 증명하지 않으면, 그 아래 모든
단언이 fork 모드 **꺼짐** 상태에 대해 공허하게 통과합니다 — 하네스가 없애려고 만들어진
"죽은 표면은 샘플링 안 된 표면과 똑같아 보인다"는 실패가 한 층 위에서 재현되는 것입니다.

**단언하지 않은 것**에 주의하십시오: fork 모드에서 sprint 측정이 성공한다는 것은 단언하지
않습니다. 구조상 성공하지 않습니다 — 결과가 턴이 끝난 뒤에 도착하기 때문입니다. 단언하는
것은 **그 실패가 정직하다**는 것입니다.

## 5. CI 게이트, 푸시 전 로컬 실행

`contract-check.yml` 워크플로가 실행하는 22개 명령을 이 트리에서 그대로 실행했습니다.
**22 / 22 PASS** — `check-domain-purity`, `check-guards`, `docs-code-sync`,
`check-deadcode`, 이중 베이스라인 계약 비교 2건(v2.1.9 · v2.1.16), L2 smoke,
L2 hook attribution, L3 MCP compat/runtime, L6 live-run freshness,
`validate-plugin --strict` 포함.

푸시 전에 실행한 것은 의도적입니다. CI 실패는 재푸시와 두 번째 워크플로 실행을 뜻하고,
이 저장소의 Actions 예산은 유한합니다.

## 6. 가드레일 정밀도 — 카운트가 아니라 대조군

`git clean`, `checkout -f`, reflog 만료가 이제 가드됩니다(규칙 16 → 19). "신규 3규칙,
오탐 0"이라는 주장은 그 자체로 아무것도 증명하지 않으므로, 같은 실행에서 다음을 단언합니다.

| 대조군 유형 | 결과 |
|---|---|
| 기존 규칙 전부 여전히 발화 (G-001, G-002, G-003, G-006, G-008, G-009, G-015) | 7 / 7 |
| v2.1.36의 오탐 제거 성과 유지 (`git status`, `npm install --force`, `grep -rn delete a b c d e`, `ls -la ./certs/server.pem` 등) | 9 / 9 |
| **의도적 미보호**를 부재가 아니라 단언으로 (`--amend`, `--no-verify`, `git add -f build/`) | 3 / 3 |

마지막 행이 존재하는 이유는, 1년 뒤 denylist에서 "의도적으로 안 넣었다"와 "빠뜨렸다"가
구분되지 않기 때문입니다.

G-005는 **양방향** 모두 수정했고 양방향 모두 단언합니다. 이제 `cat .env`, `./.env`,
`foo/.env`, `config.env.production`에는 발화하고, `process.env.PORT`,
`import.meta.env.VITE_KEY`, `.envrc`에는 발화하지 않습니다.

## 7. 이번 QA가 다루지 **않은** 것

범위를 적어두지 않으면 "범위가 없었던 것"으로 읽히므로 명시합니다.

1. **플랫폼 1종.** 모든 바이너리 측정은 macOS x86_64입니다. Linux · Windows · arm64
   빌드는 검사하지 않았습니다.
2. **fork 모드는 환경변수로 도달했지, 인터랙티브 세션으로 도달한 것이 아닙니다.**
   Claude Code가 `CLAUDE_CODE_FORK_SUBAGENT=1`을 같은 게이트를 켜는 것으로 문서화하고
   있고 레이어가 게이트 활성을 증명하지만, 진짜 인터랙티브 세션을 구동한 것은 아닙니다 —
   스크립트 하네스는 인터랙티브가 될 수 없습니다.
3. **ENH-482는 의도적으로 미측정입니다.** Stop 스크립트 중 `outputStopSurface`를 쓰는
   것이 하나도 없어 unified-stop의 next-action 힌트가 모델에 도달한 적이 없습니다.
   전달 가능한 유일한 채널은 모든 clean stop을 continuation으로 만듭니다. 제품 결정이므로
   여기서 결론 내지 않고 메인테이너에게 남깁니다.
4. **PostToolUse 외 8개 이벤트의 stdout 가시성은 Claude Code 문서에서 취했습니다.**
   문서가 이벤트별로 규칙을 명시하고 있으나, 각각을 라이브 프로브로 확인한 것은 아닙니다.

## 8. 판정

**QA_PASS.**

- Node 스위트 5,272 / 5,277 — 0 fail
- 라이브 QA 145 / 145 — 0 fail, 실제 Claude Code v2.1.232 세션
- CI 게이트 22 / 22 로컬 통과
- 훅 계약 4개 빌드에서 바이트 동일 → **Breaking 0**, 연속 호환 **171**
- 신규 회귀 스위트 전부 수정 전 트리에서 실패 실증

릴리스는 리뷰 준비가 되었습니다. **머지는 메인테이너의 결정입니다.**
