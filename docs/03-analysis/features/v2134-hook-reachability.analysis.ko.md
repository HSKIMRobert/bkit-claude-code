# v2.1.34 — 훅 도달성 분석

> **사이클**: 결함 대응 · **브랜치**: `feat/v2.1.34-defect-response`
> **방법**: 모든 발견은 실제 Claude Code 런타임(v2.1.226)에서
> `claude -p --plugin-dir`로 재현했으며, 문서 추론으로 판정한 항목은 없다.

## 이 문서가 존재하는 이유

bkit은 354개 테스트 파일에서 6,398개 단언을 통과시키는 동안, 출하된 기능 8개가
프로덕션에서 죽어 있었다. 그 8개 모두 자기 테스트를 통과했다. 모든 테스트가 bkit
자신의 함수를 직접 호출했기 때문이다. `test/contract/l2-smoke.test.js`는 그 경계를
헤더에 스스로 적어두었다 — *"실제 CC 런타임을 필요로 하지 않는다"*.

핸들러를 호출하는 테스트는 핸들러가 동작함을 증명한다. 호스트가 그것을 부르는지는
증명하지 못한다. 그런데 훅에서는 후자만이 유일하게 중요한 성질이다.

이 분석은 그 사각지대가 무엇을 가리고 있었는지, 각 항목을 어떻게 재현했는지,
무엇이 바뀌었는지를 기록한다.

## 발견

### F1 — 훅 타임아웃이 22개 이벤트 전부에서 1000배 초과

`hooks.json`의 `timeout`은 **초** 단위다(command 훅 기본값 600). bkit은 전 구간에
밀리초를 적었다.

| 선언값 | bkit 의도 | 실제 |
|---|---|---|
| `5000` (PreToolUse, PostToolUse) | 5초 | **83분** |
| `10000` (Stop) | 10초 | **2시간 46분** |
| `3000` (UserPromptSubmit) | 3초 | 50분 |
| `1500` (SessionEnd) | 1.5초 | 60초 상한으로 클램프 |

**재현.** 5초간 블로킹하는 probe 훅을 선언값만 바꿔 3회 실행:

| 선언값 | 결과 |
|---|---|
| `3000` | 완주 — 살해되지 않음 |
| `30` | 완주, `elapsedMs: 5009` — **판별자. ms였다면 30ms에 즉사** |
| `2` | 살해됨. CC 로그 `Slow PreToolUse hooks: 2260ms` |

**결과.** 이것이 이슈 #139("Stop 훅이 자기 10초 타임아웃을 넘겨 약 15분 stall")의
근본원인이다. 타임아웃은 애초에 10초였던 적이 없으므로 아무것도 그것을 취소하지
않았다. v2.1.30은 해당 핸들러의 stdin 블로킹(증상)을 고쳤고, 단위 오류는 모든
이벤트에 장전된 채로 남았다.

### F2 — `FileChanged` 핸들러는 v2.1.1부터 v2.1.33까지 한 번도 실행되지 않았다

독립적인 원인 3개, 각각 확인됨:

1. **`if`는 교대(alternation)를 받지 않는다.** 블록은
   `if: "Write|Edit(docs/**/*.md)"`를 선언했다. `if`는 정확히 하나의 permission
   rule만 담으며, 공식 문서는 바로 그 문자열을 무효 예시로 명시한다. 동일 문자열을
   **유효한** tool 이벤트에 붙여도 훅이 죽는 것을 확인했으므로, 문법 자체가 독립
   원인이다.
2. **`if`는 tool 이벤트에서만 평가된다** — `PreToolUse`, `PostToolUse`,
   `PostToolUseFailure`, `PermissionRequest`, `PermissionDenied`. 그 외 이벤트에서
   `if`를 선언한 훅은 아예 실행되지 않는다. `FileChanged`는 tool 이벤트가 아니다.
3. **`FileChanged`의 matcher는 감시할 리터럴 파일명을 지정한다**(영숫자, `_`, `|`).
   이 핸들러에 필요한 경로 글로브는 그 이벤트에서 표현 자체가 불가능하다 — 앞의 두
   결함과 무관하게 목적이 도달 불가였다.

**재현.** 변수를 하나씩만 바꾼 통제 매트릭스:

| 설정 | 발화 |
|---|---|
| `PostToolUse` on `Edit`, `if` 없음 | 2 (베이스라인) |
| `PostToolUse` on `Edit`, `if: "Edit(docs/**/*.md)"` | 2 (단일 규칙은 정상) |
| `PostToolUse` on `Edit`, `if: "Write\|Edit(docs/**/*.md)"` | **0** |
| `FileChanged`, `if` 없음 | 0 |
| `FileChanged`, bkit 출하 설정 | 0 |

**증거의 경계.** 헤드리스 `-p` 모드에서 `FileChanged`는 세션 중 외부 쓰기와 Claude
자신의 `Edit` 양쪽 모두에 발화하지 않았고, CC는 skills/commands 디렉터리와
`settings.json`에만 워처를 만들었다. **대화형 동작은 미검증이다** — 사용한 환경에서
PTY 할당이 불가능했다. 원인 (3)만으로 결론이 성립하므로, 판단이 이 공백에 의존하지
않는다.

**대응.** 기능을 `PostToolUse(Write|Edit)`로 이전했고, 실제 세션에서 발화를
확인했다. `FileChanged`는 `deprecation-registry.json`에 명시적으로 퇴역 등록했다.

### F3 — 헤드라인 품질 게이트가 존재하지 않는 기능에 100%를 보고했다

빈 디렉터리, 설계문서 없음, 구현 없음, 어디에도 등장하지 않는 기능명:

```
M1_matchRate: { current: 100, threshold: 90, passed: true }
kpi.matchRate: 100
```

두 계층이 "아무도 측정하지 않음"을 "전부 일치함"으로 바꾸고 있었다.
`gap-detector.adapter.js`는 `agentTaskRunner`가 주입되지 않으면
`{matchRate: 100, gaps: []}`를 반환했고, `iterate-sprint.usecase.js`의 기본값도
같았다. CLI 진입점은 빈 `deps`를 넘기며, 서브프로세스는 Task 도구에 닿을 수 없다.

같은 실행에서 `S2_featureCompletion`과 `S4_archiveReadiness`는 정상적으로
실패했다 — bkit이 그 위에 세워진 게이트만 fail-open이었다.

**대응.** 두 계층 모두 측정 부재를 보고하고(`matchRate: null`, `measured: false`),
게이트는 `passed: false`를 기록한다 — **`null`이 아니다.** `auto-pause.js`와
`advance-phase.usecase.js`가 모두 `passed === false`만 검사하므로, `null`은
"해당 없음"으로 읽혀 스프린트가 그대로 통과해 버린다.

### F4 — `once: true`는 조용히 무시되고 있었다

`once`는 skill frontmatter에 선언된 훅에서만 존중된다. 재현: `--session-id`로 세션을
시작한 뒤 resume하니 SessionStart가 2회 발화했다.

### F5 — 툴 표면의 절반이 미커버였다

`if`는 규칙 하나만 담으므로, `Write|Edit` matcher 아래의
`if: "Write(skills/**/SKILL.md)"`는 `Write`만 커버했다 — `SKILL.md`를 Edit으로
고치면 린트가 돌지 않았다. `PostToolUse`는 `Write`만 매칭해서
`unified-write-post.js`(PDCA 추적, 템플릿 검증, reachability ping)가 `Edit`에서
전혀 실행되지 않았다. 기존 파일 수정은 대부분 Edit이다.

### F6 — v2.1.33의 live QA 하네스가 실행 불가 상태로 출하됐다

`test/qa-harness-live-claude-p.sh:8`이 커밋된 형태:

```
BKIT="20 20 12 61 79 80 81 98 ...cd "...dirname "-e")/.." && pwd)"
```

작성자는 `$(cd "$(dirname "$0")/.." && pwd)`를 의도했으나 **인용되지 않은
heredoc**으로 파일을 생성해, 디스크에 닿기 전에 생성 셸이 `$(`를 라인번호 목록으로,
`$0`를 `-e`로 확장했다. `bash -n`이 거부한다.

이것이 드러나지 않은 이유는 그 파일을 **아무것도 참조하지 않았기** 때문이다 — CI도,
`qa-aggregate`도. 그 하네스가 뒷받침한 QA 리포트는 커밋되지 않은 스크래치 사본으로
실행된 것이었다. 절대 홈 디렉터리 경로도 하드코딩되어 있었다.

### F7 — 테스트 9곳이 결함을 강제하고 있었다

스위트는 F1과 F4를 놓친 정도가 아니라, 일부가 그것을 **요구**하고 있었다.

| 단언 | 요구한 내용 |
|---|---|
| `CC-009` | 초 단위 필드에 `stopTimeout >= 5000` — Stop 훅이 최소 83분 돌 것 |
| `HF-018` / `HF-019` | 두 경계 모두 밀리초 해석 |
| `A10-5` | 모든 타임아웃이 `1000..30000` 범위 — 즉 16분~8시간 |
| `HIS-08`, `A10-3` | `once: true`가 존재할 것 |
| `issue-129-description-budget` | 스프린트 스킬이 frontmatter에 한국어 키워드를 유지할 것 — #129가 문제 삼은 상시 비용 그 자체 |
| `LS-006~009`, `VS-011~015`, `TRIG-*` | frontmatter에 다국어 키워드가 있을 것 |

테스트는 버그를 막는 만큼 확실하게 버그를 붙잡아 둘 수도 있다.

### F8 — 파괴적 명령 우회 4건

출하된 규칙에 현실적인 페이로드를 넣어보니 `eval "$(echo <b64> | base64 -d)"`,
`find / -type f -delete`, `dd if=/dev/zero of=/dev/disk0`, `curl … | sh`가 모두
`allow`를 반환했다. 어느 것도 기존 규칙과 토큰을 공유하지 않는다 — 거부목록의
구조적 약점이다.

### F9 — 가드 2개가 정상 작업을 차단했다

둘 다 이번 릴리스 작업 중 실제로 발생했다. 차단 패턴을 단지 **언급한** 커밋 메시지와,
본문에 `Write|Edit`가 들어간 `python3 - <<'PY'`가 critical로 거부됐다 — 디텍터가
heredoc 본문을 명령줄로 읽었기 때문이다. 별개로 `G-001`은 대상과 무관하게
`rm -r`를 매칭해서, 범위가 지정된 임시 디렉터리 정리를 `/` 삭제와 똑같이 거부하면서
"경로를 좁히라"고 안내했다 — 규칙이 그 안내를 실행 불가능하게 만들고 있었다.

### F10 — 조용한 실패가 코드베이스의 관습이었다

훅 계층의 catch 블록 333개 중 **188개가 흔적 없이 삼킨다**. 다수는 정당한
best-effort다 — 부기(bookkeeping) 실패로 세션을 죽여선 안 된다. 그러나 모든 실패가
조용한 계층은 밖에서 볼 때 정상과 고장이 구분되지 않는 계층이고, 그것이 F2, F5와
과거 8건의 결함을 가능하게 한 조건이었다.

## 구조적으로 바뀐 것

**여섯 번째 검증 계층.** L1~L5는 전부 bkit 자신의 코드를 호출한다. L6은 실제
`claude -p --plugin-dir` 세션을 구동하고, 공용 stdin 리더에서 스탬프되는 새 append-only
원장을 읽어 **밖에서** CC가 각 훅을 디스패치했는지 단언한다(훅당 0.69ms. 잠금 기반
read-modify-write는 5.04ms로 측정되어 기각했다 — 훅이 건강함을 증명하는 기구가
훅을 느리게 만드는 원인이 되어선 안 된다).

이 계층은 존재한 지 몇 분 만에 아홉 번째 결함을 찾았다: `session-start.js`가 훅
페이로드를 아예 읽지 않아 `source`도 볼 수 없었다.

**제거가 감사 가능해졌다.** 훅 이벤트는 `deprecatedIn`과 사유를 담은
`deprecation-registry.json` 항목을 통해서만 `hooks.json`을 떠날 수 있다(ADR 0014
패턴). 조용한 제거는 여전히 계약 테스트를 실패시킨다.

**수치가 등록이 아니라 동작을 서술한다.** 22 events / 25 blocks → 21 / 24.

## 잔여 리스크

- `FileChanged`의 대화형 발화는 미검증이다(PTY 불가). 퇴역 결정은 matcher 문법에
  근거하며, 이는 독립적으로 충분하다.
- 파괴적 규칙은 여전히 거부목록이다. F8은 실증된 구멍 4개를 막았을 뿐 목록을
  완전하게 만들지 않았고, 문서도 더는 그렇게 주장하지 않는다.
- L6 계층의 opt-in은 CI 배선 테스트로 보호한다. bkit에는
  `validate-plugin --strict`가 `continue-on-error: true`로 11개 릴리스간 아무것도
  검증하지 않은 전례가 있기 때문이다.
