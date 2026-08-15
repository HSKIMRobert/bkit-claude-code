# v2137-permission-mode 설계 문서

| | |
|---|---|
| 기능 | `v2137-permission-mode` |
| 대상 릴리스 | v2.1.37 |
| 계획 | [`v2137-permission-mode.plan.ko.md`](../../01-plan/features/v2137-permission-mode.plan.ko.md) |
| 분석 | [`v2137-permission-mode.analysis.ko.md`](../../03-analysis/features/v2137-permission-mode.analysis.ko.md) |
| 아키텍처 | **옵션 B** — 순수 도메인 정책 모듈 신설 (메인테이너 결정 D4) |

## Context Anchor

| 키 | 값 |
|---|---|
| **WHY** | 어떤 결정 표면도 `permission_mode`를 읽지 않아, bkit이 사용자가 명시적으로 끈 확인 절차를 되살린다. |
| **WHO** | bkit을 무인으로 돌리는 모든 사용자 — Trust L3/L4, `claude -p`, CI, `/sprint start` 풀오토. |
| **RISK** | 과도한 완화는 실제 안전망을 없앤다. 등급 분리와 음성 대조군으로 경계를 둔다. |
| **SUCCESS** | ask 등급 행이 모드 의존적으로 바뀌고, deny 행은 7개 모드에서 불변, 음성 대조군 49/49 유지. |
| **SCOPE** | F1 + F8/F9 + F3/F4 (D1). |

## 1. 개요

### 1.1 설계 목표

1. 결정의 방출 가부를 **한 곳**에서 정한다. 그래야 열 개 호출부에 흩어진 표본이 아니라
   테이블 전체를 전수로 단언할 수 있다.
2. 완화의 경계는 모드가 아니라 **등급**이다: 질문은 건너뛸 수 있어도 거부는 그럴 수 없다.
3. 억제는 관측 가능해야 한다. 흔적 없이 조용해진 가드는 고장난 가드와 구별되지 않는다 —
   `lib/core/io.js:640-650`이 이미 문서화한 실패 양식이다.
4. 구조적으로 가산적: 모드가 없으면 현행 동작 ⇒ bkit의 CC 하한(2.1.78)에 영향 없음.

### 1.2 설계 원칙

- 순수 도메인 함수: FS·네트워크·`child_process` 금지 (`test/architecture/`가 단언).
- 규칙 테이블이 deny-vs-ask를 정하는 유일한 장소로 유지된다(v2.1.34 선례). 이 설계는 *ask가
  누군가에게 도달하는지*를 정하는 계층만 추가하며, 그 외에는 아무것도 하지 않는다.
- 결과를 바꿀 수 없는 파라미터는 만들지 않는다. deny 헬퍼는 의도적으로 모드를 받지 **않는다**
  — §2.3 참조.

## 2. 아키텍처

### 2.0 선택된 옵션

A(열 개 지점 인라인)와 C(`io.js` 내 숨은 모듈 스코프 상태)를 제치고 옵션 B를 선택했다. A는
이번 결함의 형태를 그대로 재생산한다 — 하나의 정책이 열 번 복제되고, 잊히는 건 열한 번째
지점이다.

### 2.1 컴포넌트 다이어그램

```
CC 훅 페이로드 ──► lib/core/io.js
                     parseHookInput()  ──► { …, permissionMode }
                             │
                             ▼
       lib/domain/policy/permission-mode-policy.js   (신규, 순수)
                     normalizeMode(raw) ──► Mode
                     resolve({ mode, grade }) ──► { emit, reason }
                     isAskSuppressed(mode) ──► boolean
                             │
       ┌─────────────────────┼──────────────────────┐
       ▼                     ▼                      ▼
scripts/unified-bash-pre.js  scripts/pre-write.js   scripts/permission-request-handler.js
  (결정 지점 7)                (결정 지점 2)            (결정 지점 1)
       │
       └─► audit-logger: 건너뛴 ask마다 `<action>_suppressed` (FR-6)
```

### 2.2 결정 테이블

`grade`는 모드가 아니라 발견 자체의 속성이다:

| 등급 | 의미 | 예시 |
|---|---|---|
| `critical` | 누가 보고 있든 위험한 형태 | `rm -rf /`, force push, `curl … \| sh`, `DROP TABLE`, raw-device 쓰기 |
| `policy` | 사용자가 직접 쓴 규칙, 또는 경로 보안 경계 | Memory Enforcer directive, scope limiter `DENIED_PATH` / `SYMLINK_ESCAPE` / `NULL_BYTE` |
| `ask` | 확인 요청 — 되돌릴 수 있거나 좁게 한정됨 | 범위 지정된 `rm -rf ./build`, `git reset --hard`, 보호 브랜치 push |

| 등급 ＼ 모드 | `default` | `plan` | `auto` | `acceptEdits` | `dontAsk` | `bypassPermissions` | 부재/미인식 |
|---|---|---|---|---|---|---|---|
| `critical` | 방출 | 방출 | 방출 | 방출 | 방출 | 방출 | 방출 |
| `policy` | 방출 | 방출 | 방출 | 방출 | 방출 | 방출 | 방출 |
| `ask` | 방출 | 방출 | 방출 | **억제** | **억제** | **억제** | 방출 |

자명하지 않은 세 열에 대한 주석:

- **`acceptEdits`** (메인테이너 결정 D2). 이 모드는 파일 편집과 흔한 파일시스템 Bash 명령을
  자동 승인하지만 그 밖은 여전히 묻는다. 따라서 bkit의 ask를 억제해도 호출이 무감독이 되지
  않는다 — 비파일시스템 Bash에는 Claude Code 자체 프롬프트 정책이 그대로 적용된다. bkit은
  호스트의 질문 위에 두 번째 질문을 얹는 일을 그만둘 뿐이다.
- **`dontAsk`**는 프롬프트가 뜰 모든 호출을 자동 거부한다고 문서화되어 있다. 이 모드에서
  bkit의 `ask`는 질문이 아니라 회복 수단 없는 거부다. 이를 억제해야 ask 계층이 이름값을 한다.
- **`auto`**는 이 환경에서 측정 불가였다(계정 자격). 사람이 있는 것으로 간주하여 억제하지
  **않는다**. 측정 부재 상태에서 내린 정책적 선택이며, 발견인 척하지 않고 그렇게 기록한다.

### 2.3 deny 헬퍼가 모드를 받지 않는 이유

`critical`과 `policy`는 모든 열에서 방출된다. `outputBlock` / `outputBlockWithContext`의
`mode` 파라미터는 어떤 결과도 바꿀 수 없고, 결과를 바꿀 수 없는 파라미터는 존재하지 않는
정책을 광고한다 — 다음 독자는 거부가 어딘가에서 완화 가능하다고 합리적으로 오해할 것이다.
`outputAsk`만 모드를 인지한다.

### 2.4 두 겹의 방어선

1. **1차 — 호출부에서.** 각 지점이 ask를 올리기 전에 `isAskSuppressed(mode)`를 조회하고,
   `*_suppressed` 감사 항목을 기록한 뒤 진행한다. 감사 컨텍스트(규칙 id, 신뢰도, 명령)가
   있는 곳이 호출부이므로 여기가 제자리다.
2. **2차 — `outputAsk` 내부에서.** 새 호출부가 추가되면서 1단계를 잊더라도 `outputAsk`가
   다시 검사해 ask 대신 allow-with-context로 강등한다. 순수 함수 호출 한 번의 비용으로,
   옵션 A를 기각한 이유인 "잊힌 열한 번째 지점" 실패 양식을 제거한다.

`outputAsk`는 현재 프로세스를 종료한다. 억제 시에는 allow 페이로드를 내보내고 정상 반환하므로
호출부의 잔여 흐름(`if (!blocked) outputAllow(...)`)이 이중 출력하지 않도록 해야 한다. 정상
경로에서는 1차 검사가 헬퍼 도달 자체를 막고, 2차 경로는 호출부가 확인하는 sentinel을 반환한다.

## 3. 데이터 모델

```js
/** @typedef {'default'|'plan'|'acceptEdits'|'auto'|'dontAsk'|'bypassPermissions'} PermissionMode */
/** @typedef {'critical'|'policy'|'ask'} DecisionGrade */
/** @typedef {{ emit: boolean, reason: string }} PolicyVerdict */
```

`normalizeMode(raw)`:
- 인식되는 문자열 ⇒ 그대로
- `'manual'` ⇒ `'default'` (CC가 `manual`을 `default`의 CLI 별칭으로 수용, v2.1.200+)
- 그 밖의 모든 값, `undefined` 포함 ⇒ `'default'` (FR-5)

## 4. API 명세

`lib/domain/policy/permission-mode-policy.js`

| Export | 시그니처 | 동작 |
|---|---|---|
| `PERMISSION_MODES` | `readonly string[]` | 문서화된 6개 값 |
| `ASK_SUPPRESSING_MODES` | `readonly string[]` | `['acceptEdits','dontAsk','bypassPermissions']` |
| `normalizeMode` | `(raw: unknown) => PermissionMode` | 절대 throw 안 함. 미인식 ⇒ `'default'` |
| `resolve` | `({mode, grade}) => PolicyVerdict` | §2.2 테이블에 대한 순수 조회 |
| `isAskSuppressed` | `(raw: unknown) => boolean` | `resolve({mode, grade:'ask'}).emit === false` |

`lib/core/io.js` 변경:

| 함수 | 변경 |
|---|---|
| `parseHookInput` | 반환 객체에 `permissionMode`(정규화됨) 추가 |
| `outputAsk(reason, alternatives, mode)` | 선택적 세 번째 파라미터. 억제 경로는 §2.4 |

## 5. 결합된 수정들의 범위

### 5.1 F8 — ENH-263에 실제 신호를 공급

`scripts/pre-write.js:340`은 `ctx.input.bypassPermissions`를 읽지만 측정된 페이로드에 그런
키가 없어, `lib/domain/guards/enh-263-claude-write.js:47`의 가드는 한 번도 발화한 적이 없다.
`permissionMode === 'bypassPermissions'`로 공급한다. `lib/domain/ports/cc-payload.port.js:21`이
CC가 보내지 않는 `permissions` 객체를 문서화하고 있고 — 잘못된 필드명의 출처다 — 실측 키
목록에 맞게 교정한다.

### 5.2 F9 — 이미 선언된 수명주기를 적용

`lib/cc-regression/defense-coordinator.js`는 두 가드가 export하는 `removeWhen(ccVersion)`를
호출하지 않는다. CC v2.1.231에서 이 가드들은 v2.1.118에 고쳐진 회귀를 설명한다. 코디네이터가
실행 중인 CC 버전을 해석하고 `removeWhen`이 충족된 가드를 건너뛴다. 이것이 없으면 §5.1이
더 이상 존재하지 않는 회귀에 대한 귀속을 방출하기 시작한다 — 둘이 함께 출하되는 이유다.

### 5.3 F3 — G-007은 삭제 *명령*에 매치해야 한다

현재: 세그먼트 단위로 적용되는 `/\b(rm|del|delete|remove)\b.*(\s+\S+){5,}/i`. 동사가 어디에
있어도 되므로 `grep -rn delete src a b c d e`가 매치된다(측정됨).

수정은 규칙 테이블에 이미 있는 `suppressIf` 확장 지점(ENH-445·ENH-447이 쓰는 그 메커니즘)을
사용한다. 선택적 `sudo`와 `VAR=value` 접두사를 걷어내고 `/bin/rm`을 `rm`으로 읽은 뒤, 삭제
동사가 세그먼트의 명령 머리가 아니면 규칙을 물러나게 하는 술어다. `npm remove a b c d e`는
명령 머리가 `npm`이므로 더 이상 매치되지 않는다. 진짜 대량 삭제(`rm a b c d e f`,
`del a b c d e f`)에 대한 음성 대조군을 패턴 축소 **이전에** 추가한다.

### 5.4 F4 — 부분문자열 가드 등급화

| 가드 | 현재 | 이후 |
|---|---|---|
| `handleQaPreBash` (`unified-bash-pre.js:164`) | 자체 9패턴 테이블, 부분문자열이면 deny, 등급 없음 | 공유 Destructive Detector에 위임해 등급화를 상속. QA 컨텍스트의 발견은 최소 `ask`로 취급. 같은 테이블의 두 번째 조악한 사본을 제거 |
| `handlePhase9DeployPre` (`unified-bash-pre.js:127`) | 6개 부분문자열, 하나라도 걸리면 deny, 맨 `--force`·`production` 포함 | 네 개 인프라 패턴은 `critical` 유지. `--force`와 `production`은 `ask` 등급으로. dry-run 플래그(`--dry-run`, `-o yaml`, `plan`)를 단 명령은 발견 없음 |

## 6. 오류 처리

모든 신규 경로는 현행 동작 방향으로 fail-safe다: 정책 모듈 내부의 throw, 잘못된 모드, 필드
부재 모두 `'default'`로 귀결되어 방출된다. 정책 모듈은 I/O가 없으므로 고유 실패 양식이 없다.
호출부는 기존 `try/catch`를 유지해 감사가 결정을 막는 일이 없도록 한다.

## 7. 보안 고려사항

- ADR 0016 / `test/security/integrity-verification.test.js` IV-09는 그대로 유지된다:
  Destructive Detector는 여전히 런타임에 비활성화할 수 없고, 이 설계는 스위치를 추가하지 않는다.
  `bkit.config.json guardrails.destructiveDetection`은 선언적 상태로 남는다.
- `critical`과 `policy`는 어떤 모드로도 도달 불가하며, 단위 테이블에서 직접, E2E 잠금의 음성
  대조군에서 다시 단언된다.
- 억제는 감사된다(FR-6). 따라서 세션을 트레일로 재구성할 수 있다.

## 8. 테스트 계획

| 레벨 | 범위 |
|---|---|
| **Unit** | `resolve()` 7 모드 × 3 등급 = 21 단언, `normalizeMode`의 미인식/부재/`manual` |
| **Contract** | `parseHookInput`이 `permissionMode` 노출, 페이로드 키 목록이 실측과 일치, `outputAsk`의 2차 검사 |
| **Regression** | G-007 명령 머리 술어(양성·음성 대조군), phase-9·QA 등급화, ENH-263 도달성, `removeWhen` 적용 |
| **E2E lock** | 7 모드 × 19 케이스 재현 매트릭스 전체를 음성 대조군과 함께 `test/e2e/external-dogfood/`에 출하 |
| **Live QA** | `claude -p --plugin-dir .`를 `bypassPermissions`와 `default`로 실행해 관측 가능한 차이를 단언 |

## 9. 구현 순서

1. `lib/domain/policy/permission-mode-policy.js` + 단위 테스트
2. `lib/core/io.js` — `parseHookInput`, `outputAsk`
3. `scripts/unified-bash-pre.js` — ask 지점, 이어서 부분문자열 가드 2개 (F4)
4. `scripts/pre-write.js` — ENH-263 컨텍스트 (F8)
5. `scripts/permission-request-handler.js`
6. `lib/control/destructive-detector.js` — G-007 술어 (F3), 대조군 먼저
7. `lib/cc-regression/defense-coordinator.js` + `cc-payload.port.js` (F9)
8. 테스트, 전체 스위트, 라이브 QA, 문서 동기화

## Version History

| 버전 | 날짜 | 변경 |
|---|---|---|
| 1.0 | 2026-08-14 | 메인테이너 결정 D1–D4에 따른 최초 설계 |
