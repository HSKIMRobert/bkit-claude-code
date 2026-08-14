# v2.1.37 — 결정 표면 인벤토리: bkit이 도구 호출을 멈출 수 있는 모든 경로

> 기능: `v2137-permission-mode` · PDCA 단계: analysis (plan 이전 조사)
> 대상 릴리스: v2.1.37 · 브랜치: `feat/v2.1.37-permission-mode-awareness`
> 측정 환경: Claude Code **v2.1.231**, bkit **v2.1.36**, Node v22, darwin 24.6.0

## 1. 이 인벤토리가 필요한 이유

`claude --dangerously-skip-permissions`로 실행해도 `PreToolUse`에서 계속 멈춘다는 사용자
보고가 있었다. 어떤 변경을 제안하기 전에 **bkit이 무엇을, 어디서, 어떤 근거로 멈출 수
있는지**부터 확정한다 — 눈에 띈 증상 하나가 아니라 결함 계열 전체를 겨냥하기 위해서다.

아래 모든 항목은 인용한 라인을 **읽고**, 실행 가능한 경로는 **실행해서** 확인했다. 이름만
보고 추론한 항목은 없다.

## 2. 모든 것을 규정하는 발견

```
$ grep -rn "permission_mode" scripts lib hooks agents skills
(0건)
```

Claude Code는 **모든** 훅 이벤트의 공통 입력 필드로 `permission_mode`를 보낸다
(`"default" | "plan" | "acceptEdits" | "auto" | "dontAsk" | "bypassPermissions"`).
bkit은 이를 어디서도 읽지 않는다. `lib/core/io.js parseHookInput()` (:317-331)은
`toolName`, `filePath`, `content`, `command`, `oldString` 다섯 필드만 추출하며
`permission_mode`는 그 안에 없다.

결과: §3의 모든 결정 표면이, 사용자가 최대 감독을 요청했든 확인 절차를 명시적으로 껐든
똑같이 동작한다.

## 3. 인벤토리

### 3.1 **도구 호출**을 멈출 수 있는 표면

| # | 표면 | file:line | 방출하는 결정 | `permission_mode` 읽음 | 검증 방법 |
|---|---|---|---|---|---|
| S1 | Destructive Detector — critical | `scripts/unified-bash-pre.js:311` | `outputBlockWithContext` 경유 `decision:'block'` | 아니오 | 실행 |
| S2 | Heredoc 우회 가드 — critical | `scripts/unified-bash-pre.js:377` | `decision:'block'` | 아니오 | 읽기 + 단위테스트 |
| S3 | Push Event Guard — deny 판정 | `scripts/unified-bash-pre.js:456` | `decision:'block'` | 아니오 | 읽기 |
| S4 | Memory Enforcer — directive deny | `scripts/unified-bash-pre.js:589` | `decision:'block'` | 아니오 | 읽기 |
| S5 | Destructive Detector — ask 등급 | `scripts/unified-bash-pre.js:664` | `hookSpecificOutput.permissionDecision:'ask'` | 아니오 | 실행 |
| S6 | Phase-9 배포 가드 | `scripts/unified-bash-pre.js:144` | `decision:'block'` | 아니오 | 읽기 |
| S7 | Zero-Script-QA bash 가드 | `scripts/unified-bash-pre.js:183` | `decision:'block'` | 아니오 | 읽기 |
| S8 | Permission Manager deny (Write/Edit) | `scripts/pre-write.js:404-405` | `decision:'block'` **+ `process.exit(2)`** | 아니오 | 읽기 |
| S9 | Scope limiter hard-deny | `scripts/pre-write.js:444` | `decision:'block'` | 아니오 | 읽기 |
| S10 | PermissionRequest always-deny | `scripts/permission-request-handler.js:110` | `decision.behavior:'deny'` | 아니오 | 읽기 |

S1–S9의 페이로드 생성은 `lib/core/io.js`에 있다:
`outputBlock` (:388), `outputBlockWithContext` (:416), `outputAsk` (:477).
셋 다 조건 없이 방출하며, 페이로드나 모드를 인자로 받지 않는다.

### 3.2 도구 호출이 **아닌** 것을 멈추는 표면

| # | 표면 | file:line | 효과 | 범위 포함? |
|---|---|---|---|---|
| S11 | PreCompact 가드 | `scripts/context-compaction.js:77` | `process.exit(2)`로 compaction 차단 | 아니오 — 도구 호출이 아니고 권한 의미론이 없음 |
| S12 | Stop 훅 continuation | `lib/core/io.js:571` `outputStopSurface` | `decision:'block'`이 턴을 **계속**시킴 | 아니오 — 극성이 반대. Stop에서 `decision:'block'`은 *계속 진행*을 뜻함 (`lib/domain/ports/cc-payload.port.js:26-34`에 문서화) |

### 3.3 차단하지 **않음**이 확인된 표면

| 표면 | 근거 |
|---|---|
| `scripts/lint-skill-md.js` | `process.exit(0); // never block` (:120); 네 개 종료 지점 모두 0 |
| `pre-write.js` destructive detector | advisory 전용. 측정: *내용*에 재귀 삭제가 언급된 Write는 `Destructive operation detected: G-001`을 컨텍스트로 내보내고 exit 0 — 쓰기는 진행됨 |
| `pre-write.js` Permission Manager (실사용) | `DEFAULT_PERMISSIONS` (`lib/permission-manager.js:34-39`)에 `Write(...)`/`Edit(...)` 패턴이 없어 `checkPermission('Write', path)`가 도구 레벨 `Write: 'allow'`로 떨어짐. S8은 코드상 도달 가능하지만 출하 기본값으로는 도달 불가 |

## 4. 확정한 호스트 계약 사실

| 사실 | 출처 |
|---|---|
| PreToolUse 훅은 권한 프롬프트 **이전**에 실행된다; 훅 출력은 거부하거나, 프롬프트를 강제하거나, 프롬프트를 건너뛸 수 있다 | `code.claude.com/docs/en/permissions` § Extend permissions with hooks |
| exit 2로 종료한 훅은 **권한 규칙 평가 이전에** 호출을 중단시킨다 | 같은 절 |
| `bypassPermissions`에서도 프롬프트되는 것: 명시적 `ask` 규칙, 조직이 `ask`로 설정한 커넥터 도구, `requiresUserInteraction` MCP 도구, 루트/홈 삭제 circuit breaker. **훅은 그 목록에 없다 — 면제라서가 아니라 더 앞 단계에서 작동하기 때문이다** | `code.claude.com/docs/en/permission-modes` § Skip all checks |
| `permission_mode`는 모든 훅 이벤트의 공통 필드다 | `code.claude.com/docs/en/hooks` § Hook input |
| `--dangerously-skip-permissions`에서도 훅의 `ask`는 존중된다 | **측정**, §5 |

## 5. 측정

### 5.1 bkit 없이도 CC는 bypassPermissions에서 훅 `ask`를 존중한다

`permissionDecision:'ask'`만 반환하는 훅 하나만 둔 임시 프로젝트를 헤드리스로 실행:

```
claude -p --dangerously-skip-permissions "Run the bash command: echo HELLO_FROM_BASH"
```

결과 JSON (CC v2.1.231):

```json
"permission_denials":[{"tool_name":"Bash","tool_input":{"command":"echo HELLO_FROM_BASH"}}]
```

bypass 모드에서 `echo` 하나가 멈췄다. 이로써 **메커니즘**은 호스트 계약에 속하며 bkit 고유
원인이 아님이 분리된다.

### 5.2 페이로드가 `bypassPermissions`라고 말하는데도 bkit은 ask/deny를 낸다

`"permission_mode":"bypassPermissions"`를 실은 합성 PreToolUse 페이로드를 출하 훅에 투입:

| 명령 | bkit 출력 |
|---|---|
| `npm run build` | allow |
| `git status` | allow |
| `git commit -m fix` | allow |
| `npm test` | allow |
| `docker compose down -v` | allow |
| `git checkout main` | allow |
| `cat .env.example` | allow |
| `rm -rf ./tmp/build` | **ask** (G-001) |
| `rm -rf node_modules` | **ask** (G-001) |
| `git commit -m 'fix' && git push origin main` | **ask** (G-004) |
| `npm remove lodash react vue axios dayjs` | **ask** (G-007) |
| `grep -rn delete src a b c d e` | **ask** (G-007) |

### 5.3 조사 도중 관측된 실제 차단

§5.2를 구성하던 중 조사자 본인의 `Bash` 호출이 S1에 의해 거부되었다:

```
Blocked: bkit Destructive Detector: this command matches rule G-001 (Recursive delete)
and is blocked as critical.
```

문제의 명령은 JSON 테스트 페이로드 안에 `rm -rf`라는 문자가 들어 있던 `printf | node`였다.
아무것도 삭제하지 않는다. §6.2의 오탐 계열이 평범한 작업 세션에서 스스로 재현된 사례다.

## 6. 발견 사항

**F1 — 근본 원인 (확정).** 어떤 결정 표면도 `permission_mode`를 참조하지 않기 때문에,
bkit은 사용자가 명시적으로 비활성화한 확인 절차를 되살린다. 호스트는 문서대로 동작하고
있으며, 명시된 의사를 무시하는 쪽은 bkit이다.

**F2 — 등급은 동등하지 않다.** S5(`ask`)는 질문을 한다. S1–S4와 S6–S10(`deny`)은 아예
거부한다. `bypassPermissions`에서 둘 다 완화하는 설계는 질문만 완화하는 설계보다 훨씬 큰
결정이다. 여기서 가정하지 않고 설계 단계에서 결론 낸다.

**F3 — 잔존 오탐 (측정됨, F1과 별개).** G-007 패턴
`/\b(rm|del|delete|remove)\b.*(\s+\S+){5,}/i` (`lib/control/destructive-detector.js:113`)는
단일 명령 세그먼트 안에 `delete`나 `remove`라는 **단어**와 토큰 5개 이상이 있으면 걸린다 —
읽기 전용 명령도 포함(§5.2의 `grep -rn delete …`). 이슈 #148은 v2.1.36에서 세그먼트 간
사례를 고쳤고, 세그먼트 내부 사례는 남아 있다.

**F4 — 등급 없는 부분문자열 가드.** S6은 명령 어디든 `--force`와 `production`이라는 맨
부분문자열이 있으면 차단한다. S7은 `rm -r`, `TRUNCATE`, `DELETE FROM` 등에 대해 같은 일을
한다. 둘 다 대상 등급화 없이, ask 계층 없이 즉시 거부하며, 어떤 스킬/에이전트가 활성인지에만
좌우된다.

**F5 — 한 개념에 출력 형태가 둘.** S1–S4, S6–S9는 레거시 최상위 `decision:'block'`을 쓴다.
문서화된 PreToolUse 형태는 `hookSpecificOutput.permissionDecision:'deny'`다. 레거시 형태는
현재 동작한다(§5.3이 호스트에 도달한다는 증거). 따라서 활성 결함이 아니라 일관성 문제다.

**F6 — 무인 실행은 답할 수 없다.** 외부 이슈 #148은 `PreToolUse` 질문에 답할 사람이 없어
건당 약 15분의 사망 시간이 발생했다고 기록한다. `bypassPermissions`는 지켜보는 사람이 없다는
가장 강한 신호이며, 그래서 F1은 성가심이 아니라 비용이다.

**F7 — 하위 호환 범위는 바이너리 조사로 확정되지 않는다.** `strings`는 v2.1.227/228/231
바이너리에서 `permission_mode`를 찾지만, 페이로드 패킹이 다른 v2.1.226에서는 대조 마커
`hook_event_name`조차 **0건**이다. 따라서 이 조사는 2.1.226 이하에 대해 아무것도 말해주지
않으며, 여기서 어떤 하한도 주장할 수 없다. bkit의 런타임 최소는 2.1.78이므로, 구현은
`permission_mode` 부재를 "알 수 없음"으로 취급하고 현재 동작을 유지해야 한다 —
`background_tasks`에 이미 쓰인 것과 같은 fail-safe 패턴(`lib/core/io.js:74-79`)이다.

## 6b. 가정이 아니라 측정한 호스트 의미론

### 6b.1 `permission_mode`는 모든 모드에서 그대로 전달된다

stdin을 덤프하는 훅 하나를 모드별로 한 번씩 헤드리스 실행 (CC v2.1.231):

| 요청한 모드 | 수신한 `permission_mode` | 페이로드 키 |
|---|---|---|
| `default` | `"default"` | `cwd, effort, hook_event_name, permission_mode, prompt_id, session_id, tool_input, tool_name, tool_use_id, transcript_path` |
| `plan` | `"plan"` | 동일 |
| `acceptEdits` | `"acceptEdits"` | 동일 |
| `dontAsk` | `"dontAsk"` | 동일 |
| `bypassPermissions` | `"bypassPermissions"` | 동일 |

`--dangerously-skip-permissions`는 `"bypassPermissions"`를 만든다(§5.1). `auto`는 계정
자격이 필요해 이 환경에서 측정하지 못했다 — 따라서 측정이 아니라 정책으로 처리하며, 그
사실을 사용 지점에 명시한다.

### 6b.2 bkit이 읽는 두 필드는 페이로드에 존재하지 않는다

위 키 목록이 전부다. PreToolUse 페이로드 최상위에 `bypassPermissions`도
`permissionDecision`도 없는데, 두 곳에서 읽고 있다:

| 읽는 지점 | 읽는 값 | 런타임 실제 값 |
|---|---|---|
| `scripts/pre-write.js:340` | `ctx.input.bypassPermissions` | 항상 `undefined` → `false` |
| `scripts/unified-bash-pre.js:630` | `input.permissionDecision` | 항상 `undefined` → `'allow'`로 기본값 |

**F8 — ENH-263 가드는 도달 불가다.** `lib/domain/guards/enh-263-claude-write.js:47`은
`ctx.bypassPermissions`가 참이 아니면 `{hit:false}`를 반환하는데, 그 값을 세팅하는 유일한
경로가 위의 항상-`false` 읽기다. 이 가드는 프로덕션에서 한 번도 발화한 적이 없다. 올바른
출처는 `permission_mode === 'bypassPermissions'`이므로 F1 수정이 이 가드를 되살린다 —
그래서 F8은 부수 효과가 아니라 의도적으로 다뤄야 한다. `lib/domain/ports/cc-payload.port.js:21`이
CC가 보내지 않는 `permissions` 객체를 문서화하고 있고, 잘못된 필드명의 출처다.

**F9 — 가드 수명주기가 선언만 되고 적용되지 않는다.** 두 회귀 가드 모두 CC ≥ 2.1.118에서
true를 반환하는 `removeWhen(ccVersion)`을 export하는데,
`lib/cc-regression/defense-coordinator.js:24-58`은 이를 호출하지 않는다. CC v2.1.231에서 이
가드들은 113 릴리스 전에 고쳐진 회귀를 설명하고 있다. F9를 적용하지 않은 채 F8만 되살리면,
더 이상 존재하지 않는 회귀에 대한 귀속(attribution)을 방출하기 시작한다.

### 6b.3 답할 사람이 없는 곳에서 훅 `ask`는 곧 거부다

같은 최소 ask-훅으로 헤드리스 측정:

| 모드 | 결과 |
|---|---|
| `bypassPermissions` | `permission_denials` = 1, 명령 미실행 |
| `dontAsk` | `permission_denials` = 1, 명령 미실행 |
| `acceptEdits` | `permission_denials` = 1, 명령 미실행 |

F6의 형태를 구체적으로 확인해준다: 비대화형 실행에서 bkit의 `ask`는 질문이 아니라 물음표가
붙은 거부다. `dontAsk`는 대화형에서도 같은 해석이 문서로 뒷받침된다 — 그 모드는 "프롬프트가
뜰 모든 도구 호출을 자동 거부한다"(`permission-modes` § dontAsk).

## 7. 이 인벤토리의 범위 밖

- `deny`를 완화해도 되는가 — 설계 결정(F2). 설계 단계로 이월.
- G-004/G-007 규칙 정밀화(F3)와 부분문자열 가드(F4) — 연관 표면 스윕에서 포함 여부를 판단.
- S11/S12 — 권한 의미론이 없는 다른 메커니즘.

## 7b. 연관 표면 스윕

수정은 보고된 사례가 아니라 결함 계열을 겨냥해야 한다는 메인테이너 규칙에 따라 구현 후 수행.

**F10 — 위험한 문자열을 *검색*하는 것이 *수행*하는 것으로 등급 매겨졌다. 범위 포함, 수정
완료(ENH-473).** 이번 릴리스를 작성하는 동안 두 번 재현됐다: 규칙 패턴 두 개를 찾는 `grep`이
"Recursive delete; SQL table drop"으로 거부됐다. `grep`에는 쓰기 모드가 없으므로 그 명령은
아무것도 삭제할 수 없다. F3의 한 층 위다 — F3은 G-007이 *단어*를 삭제 명령으로 읽는 것을
막았고, F10은 어떤 규칙이든 검색 *인자*를 작업으로 읽는 것을 막는다.

면제 조건은 엄격하게 제한된다. 실패 방향이 위음성이기 때문이다. 두 조건이 모두 성립해야
한다: 명령 머리가 쓰기 모드 없는 검색 도구이고(`echo`는 의도적으로 제외 — `echo "…" | sh`가
시작되는 방식이다), 세그먼트에 인용부호 **밖**의 셸 메타문자가 없어야 한다. 인용부호 인식은
핵심이다: `grep -rlE "DROP|rm" lib`은 정규식 안에 `|`를 담고 있고, 이를 파이프로 읽으면 이
오탐의 가장 흔한 형태를 고치지 못한 채 고쳤다고 주장하게 된다. 짝이 맞지 않는 인용부호는
탈출로 간주한다 — 확신을 갖고 파싱할 수 없는 세그먼트는 신뢰해서는 안 되기 때문이다.

음성 대조군 5개가 함께 출하된다 — 실제 셸 파이프, 스크립트로의 리다이렉트, `echo` 페이로드,
명령 치환, 짝 없는 인용부호 — 각각 실제 파괴적 문자열을 싣고 있다. 이 대조군의 초기 초안은
페이로드가 없는 명령을 써서, 잡혀서가 아니라 비어 있어서 통과했다. 이슈 #148이 경고한 그
가짜 초록불이, 그 자신의 회귀 잠금 안에서 재현된 것이다.

**F11 — 같은 파괴 정책의 세 번째 선언. 범위 밖, 기록만.**
`lib/permission-manager.js:34-39`의 `DEFAULT_PERMISSIONS`는 `Bash(rm -rf*): deny`,
`Bash(git push --force*): deny`와 `ask` 규칙 두 개를 선언한다. Bash에 대해 이를 참조하는 곳은
없다: 유일한 호출자인 `pre-write.js`는 `Write`/`Edit`를 묻는데 이 테이블에는 해당 패턴이 없어
`Write: 'allow'`로 떨어진다. `bkit.config.json`의 `permissions` 블록(ENH-458에 의해 선언적)과
Destructive Detector 자체까지 합치면 같은 정책이 세 곳에 진술되어 있고, 그중 강제하는 것은
하나뿐이다. 이를 통합하는 일은 자체 blast radius와 자체 테스트를 가진 별도 변경이며, 행동
매트릭스를 증거로 삼는 릴리스 안에서 함께 하면 양쪽 모두 혼탁해진다.

**중복이 아닌 것.** `lib/defense/heredoc-detector.js`는 detector가 의도적으로 생략하는 heredoc
형태를 담당하고, `lib/core/io.js`의 패턴 문자열은 대체안 제안 텍스트다. 둘 다 두 번째 규칙
테이블이 아니다.

## 8. 재현 자산

§5를 뒷받침하는 측정 스크립트는 테스트 단계에서 `test/e2e/external-dogfood/`로 옮겨져 영구
회귀 잠금이 된다. 이슈 #148이 세운 관행을 따른다: 같은 실행에서 진짜 파괴적 명령이 여전히
멈추지 않는 한 초록불은 무의미하므로, 음성 대조군을 함께 출하한다.
