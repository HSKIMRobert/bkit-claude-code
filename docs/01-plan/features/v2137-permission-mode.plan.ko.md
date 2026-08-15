# v2137-permission-mode 계획 문서

| | |
|---|---|
| 기능 | `v2137-permission-mode` |
| 대상 릴리스 | v2.1.37 |
| 브랜치 | `feat/v2.1.37-permission-mode-awareness` |
| 단계 | plan |
| 분석 | [`v2137-permission-mode.analysis.ko.md`](../../03-analysis/features/v2137-permission-mode.analysis.ko.md) |

## Executive Summary

| 관점 | 내용 |
|---|---|
| **문제** | `claude --dangerously-skip-permissions`로 실행해도 bkit이 세션을 계속 중단시킨다. Claude Code가 모든 훅 이벤트에 실어 보내는 `permission_mode` 필드를 bkit이 어디서도 읽지 않아, 사용자가 명시적으로 끈 확인 절차를 되살리기 때문이다. 무인 실행에서 그 확인에는 답할 사람이 없으므로 에이전트는 실패하는 대신 멈춰 선다. |
| **해결** | 도메인 정책 모듈 하나가 호스트의 permission mode와 결정의 등급을 받아 방출 여부를 판단한다. "지켜보는 사람이 없다"는 뜻의 세 모드에서 ask 등급은 억제되고, critical 거부는 어떤 경우에도 억제되지 않는다. 같은 코드 경로에서 발견된 결함 3건을 함께 고친다. |
| **기능·UX 변화** | `--dangerously-skip-permissions`, `dontAsk`, `acceptEdits`에서 bkit은 더 이상 묻지 않는다. `default`와 `plan`에서는 아무것도 바뀌지 않는다. `rm -rf /`, force push, `curl … \| sh`, SQL drop은 모든 모드에서 계속 거부된다. |
| **핵심 가치** | bkit의 가드레일이 절대적이지 않고 **명시된 의사에 비례**하게 된다. 올바른 작업을 거부하는 가드는 사람들이 꺼버리고, 그러면 아무것도 지키지 못한다 — v2.1.34가 G-001에 적었고 v2.1.36이 이슈 #148에 적용한 원칙을, 이번엔 규칙 위 계층에 적용한다. |

## Context Anchor

| 키 | 값 |
|---|---|
| **WHY** | 권한을 명시적으로 건너뛴 채 실행하는 사용자가 매 세션 `PreToolUse`에서 멈췄다. 측정된 원인: bkit의 결정 표면 10곳 중 `permission_mode`를 참조하는 곳이 0개. |
| **WHO** | bkit을 무인으로 돌리는 모든 사용자 — Trust Level 3/4 스프린트, `claude -p` 파이프라인, CI, 그리고 bkit이 스스로 권장하는 `/sprint start` 풀오토 경로. |
| **RISK** | 과도한 완화는 실제 안전망을 없앤다. 완화 대상: 등급 분리 — `ask`는 완화, `critical`은 절대 불가 — 및 모든 테스트 실행에 포함되는 음성 대조군. |
| **SUCCESS** | 재현 매트릭스에서 ask 등급 행이 모드별로 달라지고, `deny` 행은 7개 모드 전부에서 불변이며, 음성 대조군은 100% 계속 차단됨. |
| **SCOPE** | F1(모드 인지) + F8/F9(죽은 가드, 미적용 수명주기) + F3/F4(규칙 정밀화). 메인테이너 결정 D1. |

## 1. 개요

### 1.1 목적

bkit의 모든 결정 표면이 호스트의 permission mode를 인지하게 하고, 애초에 표면이 발화할
일이 드물도록 가드레일 규칙을 정밀화한다.

### 1.2 배경

전체 인벤토리와 측정치는 분석 문서를 참조. 이 계획을 규정하는 세 사실:

1. Claude Code는 `PreToolUse` 훅을 권한 프롬프트 **이전**에 실행한다. 따라서 훅의 결정은
   `bypassPermissions`가 우회할 수 있는 대상이 아니다. 호스트는 문서대로 동작하고 있다.
2. `grep -rn "permission_mode" scripts lib hooks agents skills` → 0건. 명시된 의사를
   무시하는 쪽은 bkit이다.
3. 비대화형 실행에서 훅 `ask`는 곧 거부다 — `bypassPermissions`, `dontAsk`, `acceptEdits`
   모두에서 실측.

### 1.3 관련 문서

- 분석: `docs/03-analysis/features/v2137-permission-mode.analysis.{en,ko}.md`
- 설계: `docs/02-design/features/v2137-permission-mode.design.{en,ko}.md`
- 선례: 이슈 #148 → v2.1.36 가드레일 정밀화 (`test/e2e/external-dogfood/sinclair-seo-148-guardrail-precision.test.js`)
- 정책: ADR 0016 — Destructive Detector는 런타임에 비활성화할 수 없다

## 2. 범위

### 2.1 포함

| ID | 항목 |
|---|---|
| **F1** | `permission_mode`를 읽고, 결정 표면 10곳 전부에서 ask 등급 결정을 그에 따라 게이팅 |
| **F8** | ENH-263 가드에 CC가 보내지 않는 페이로드 필드 대신 `permission_mode`를 공급. 원인이 된 `cc-payload.port.js` 타입 정의 교정 |
| **F9** | defense coordinator에서 `removeWhen(ccVersion)`를 적용해 은퇴한 회귀 가드가 발화하지 않도록 함 |
| **F3** | G-007이 단지 `delete`/`remove`라는 단어를 포함한 읽기 전용 명령에 발화하지 않도록 |
| **F4** | phase-9 배포 가드와 Zero-Script-QA 가드가 맨 부분문자열로 즉시 거부하지 않고 대상을 등급화하도록 |

### 2.2 제외

| 항목 | 이유 |
|---|---|
| `S11` PreCompact `exit 2` | 도구 호출이 아니라 compaction을 막음. 권한 의미론 없음 |
| `S12` Stop 훅 continuation | Stop에서 `decision:'block'`은 *계속*을 뜻함. 극성이 반대 |
| `decision:'block'` → `hookSpecificOutput.permissionDecision:'deny'` 마이그레이션(F5) | 레거시 형태가 실증적으로 동작함. 스키마 마이그레이션은 별도의 검증 가능한 변경이며, 섞으면 이번 릴리스의 증거가 혼탁해짐 |
| 릴리스 전 버전 상향 | 버전은 릴리스 시점에 메인테이너가 부여. 여기서는 목표값으로만 기록 |

## 3. 요구사항

### 3.1 기능 요구사항

| ID | 요구사항 |
|---|---|
| FR-1 | `parseHookInput()`이 호스트의 permission mode를 정규화된 값으로 노출 |
| FR-2 | 순수 정책 함수가 `(mode, grade) → emit \| suppress`를 매핑, I/O 없음 |
| FR-3 | `ask` 등급 결정은 `bypassPermissions`, `dontAsk`, `acceptEdits`에서 억제 |
| FR-4 | `critical` 등급 거부는 **모든** 모드에서 예외 없이 방출 |
| FR-5 | `permission_mode`가 없거나 미인식 값이면 `default`로 취급 — 현행 동작 |
| FR-6 | 억제된 결정도 모드와 발화했을 규칙과 함께 감사 로그에 기록해, 억제가 은밀하지 않고 관측 가능하도록 |
| FR-7 | ENH-263 가드가 실제 모드를 읽고, 두 회귀 가드가 `removeWhen()`을 존중 |
| FR-8 | G-007이 단어 뒤에 우연히 오는 토큰이 아니라 삭제 **피연산자**를 센다 |
| FR-9 | phase-9 및 QA 부분문자열 가드가 매치를 등급화하고 동일한 정책을 경유 |

### 3.2 비기능 요구사항

| ID | 요구사항 |
|---|---|
| NFR-1 | 훅 핫패스에 I/O 추가 없음 — 정책은 순수 함수 |
| NFR-2 | 훅 콜드스타트가 기존 성능 테스트 예산 이내 |
| NFR-3 | FR-5를 통해 bkit 런타임 하한(CC 2.1.78)까지 하위 호환 |
| NFR-4 | 코드·주석·메시지는 영어(프로젝트 규칙), `docs/`는 이중 언어 |
| NFR-5 | Destructive Detector는 런타임 비활성화가 계속 불가능 (ADR 0016 / IV-09) |

## 4. 성공 기준

### 4.1 완료 정의

| SC | 기준 | 증거 |
|---|---|---|
| SC-1 | 재현 매트릭스의 ask 등급 행이 모드별로 달라짐 | 매트릭스 출력 |
| SC-2 | 모든 음성 대조군이 7개 모드 전부에서 계속 차단됨 | 매트릭스, 49/49 |
| SC-3 | 변경 전 측정된 benign-but-blocked 14셀이 0으로 | 매트릭스 |
| SC-4 | 전체 스위트가 베이스라인 이상: 4364 TC, 0 실패 | `node test/run-all.js` |
| SC-5 | 라이브 `claude -p --plugin-dir .` 실행이 새 동작을 종단 확인 | QA 보고서 |
| SC-6 | `scripts/docs-code-sync.js`가 drift 0 보고 | CI |

### 4.2 품질 기준

- 모든 규칙 변경은 같은 테스트 파일 안에 음성 대조군을 동반한다.
- 어떤 발견도 추론만으로 종결하지 않는다. 각각 측정치 또는 인용된 라인을 갖는다.

## 5. 리스크와 완화

| 리스크 | 가능성 | 영향 | 완화 |
|---|---|---|---|
| 완화가 사용자가 의존하던 보호를 제거 | 중 | 고 | 등급 분리(D3): `ask`만 완화. 음성 대조군이 실행마다 강제 |
| `acceptEdits` 포함(D2)이 지켜보는 사용자가 원했던 확인을 억제 | 중 | 중 | 메인테이너가 수용. 단 `acceptEdits`에서 CC는 비파일시스템 Bash에 자체 프롬프트 정책을 계속 적용하므로, bkit의 ask 제거가 호출을 무감독으로 만들지는 않음 |
| ENH-263 부활(F8)이 113 릴리스 전 고쳐진 회귀에 대한 귀속을 방출 | F9 누락 시 높음 | 저 | F9가 바로 이를 막기 위해 같은 범위에 포함됨 |
| G-007 축소(F3)가 위음성을 유발 | 중 | 고 | 패턴을 좁히기 전에 진짜 대량 삭제에 대한 음성 대조군을 먼저 추가 |
| 억제가 비가시화됨 | 중 | 중 | FR-6: 억제된 모든 결정에 감사 항목 기록 |

## 6. 영향 분석

### 6.1 변경 리소스

| 리소스 | 변경 |
|---|---|
| `lib/domain/policy/permission-mode-policy.js` | 신규 — 순수 결정 정책 |
| `lib/core/io.js` | `parseHookInput` + 출력 헬퍼 3종이 모드를 수용 |
| `scripts/unified-bash-pre.js` | 결정 지점 7곳이 모드를 전달, 부분문자열 가드 2개 등급화 |
| `scripts/pre-write.js` | 결정 지점 2곳이 모드를 전달, ENH-263 컨텍스트 교정 |
| `scripts/permission-request-handler.js` | 모드 인지 deny |
| `lib/control/destructive-detector.js` | G-007 피연산자 계수 |
| `lib/cc-regression/defense-coordinator.js` | `removeWhen()` 적용 |
| `lib/domain/ports/cc-payload.port.js` | 실측 페이로드에 맞게 타입 정의 교정 |

### 6.2 현재 소비자

28개 훅 핸들러 전부가 `lib/core/io.js`를 로드한다. 출력 헬퍼는 선택적 후행 파라미터를
얻으므로, 기존 호출부는 전부 그대로 컴파일되고 모드가 없으면 현행 동작을 유지한다(FR-5).
구조적으로 가산적(additive) 변경이다.

### 6.3 검증

재현 매트릭스(전/후) · 전체 node 스위트 · 라이브 `claude -p --plugin-dir .` ·
`docs-code-sync` · GitHub Actions `contract-check` 및 `cc-regression-reconcile`.

## 7. 아키텍처 고려사항

메인테이너가 **옵션 B**를 선택(D4): `lib/domain/policy/` 아래 순수 모듈 신설, `lib/core/io.js`가
참조. 기존 `lib/domain/guards/` 패턴(순수 도메인 함수, FS·네트워크 없음)과 일치하며, 결정
테이블 전체를 테스트 가능한 한 곳에 모아 7 모드 × 3 등급을 표본이 아니라 전수로 단언할 수
있게 한다.

옵션 A(각 지점 인라인)와 C(`io.js` 내 숨은 모듈 스코프 상태)는 제시 후 기각. A는 이번 결함의
형태를 그대로 재생산한다 — 하나의 정책이 열 곳에 복제되고, 잊히는 건 열한 번째 지점이다.

## 8. 컨벤션 전제

- 순수 도메인 모듈: `require('fs')`·`child_process`·네트워크 금지 — `test/architecture/`가 단언.
- 신규 코드·주석·감사 문자열은 영어.
- 신규 `docs/` 파일은 `.en.md` + `.ko.md` 형제 쌍으로 출하.

## 9. 다음 단계

`/pdca design v2137-permission-mode` → 구현 → 테스트 → 라이브 QA → 문서 동기화 → PR.

## Version History

| 버전 | 날짜 | 변경 |
|---|---|---|
| 1.0 | 2026-08-14 | 분석 단계 및 메인테이너 결정 D1–D4 이후 최초 계획 |
