# v2.1.35 보안 하드닝 + 워크트리 정확성 — 설계 문서

> **요약**: 외부에서 들어온 `execSync` → `execFileSync` 하드닝 패치(PR #146)를 머지했고,
> 그것을 재현하는 과정에서 같은 파일에 이미 출하되어 있던 결함 2건이 드러났다. 평범한
> 체크아웃이 linked worktree로 오탐되고, 그 파일이 출력하는 경고문이 bkit 자신의 훅에
> 대해 사실과 다르다. 이번 릴리스는 두 가지를 바로잡고, child_process 마이그레이션을
> 저장소 전체로 완결하며, 전부를 회귀 테스트로 잠근다.
>
> **프로젝트**: bkit — AI Native Development OS
> **버전**: 2.1.35 (타깃)
> **작성일**: 2026-08-10
> **상태**: 승인 대기
> **브랜치**: `feat/v2.1.35-security-hardening` (단일 브랜치, `026378f`에서 분기)
> **선행**: [@anupamme](https://github.com/anupamme)의 PR #146, `026378f`로 머지됨

---

## Context Anchor

| 항목 | 내용 |
|---|---|
| **WHY** | 보안 패치가 프로젝트 외부에서 들어왔다. 머지 자체는 옳았으나, 패치의 전제(HIGH 등급 명령 주입)는 재현에서 살아남지 못했고, 정작 그 파일에 있던 무관한 결함 2건이 살아남았다. bkit이 내건 원칙은 *No Guessing*이다. 대응은 도장 찍기가 아니라 실측이어야 한다. |
| **WHO** | 저장소 하위 디렉터리에서 bkit을 실행하는 모든 사용자(워크트리 오탐), git worktree 안에서 작업하는 모든 사용자(근거 없이 그만두라는 안내를 받음), 그리고 `lib/qa/test-runner.js`가 이미 선언해 둔 child_process 정책에 기대는 메인테이너. |
| **RISK** | 지금 bkit이 출력하는 안내문은 멀쩡히 동작하는 워크플로에서 사용자를 이탈시킨다. 반대로 탐지 자체를 없애는 방식으로 고치면 프로젝트 스코프 `.claude/` 설정에 대한 진짜 신호까지 버리게 된다. |
| **SUCCESS** | 8개 컨텍스트 탐지 매트릭스 불일치 0건, 안내문은 실측된 내용만 진술, 출하 코드의 모든 `child_process` 호출이 argv 배열 전달, 그리고 이 전부가 되돌려지면 회귀 테스트가 실패. |
| **SCOPE** | `lib/core/worktree-detector.js`, 잔여 7개 `child_process` 셸 호출부, 신규 계약 테스트 1건, 신규 유닛 테스트 1건, 문서·버전 동기화. **범위 밖**으로 명시: `WorktreeCreate`/`WorktreeRemove` 등록(§6 참조). |

---

## 1. 근거

아래 모든 주장은 코드를 읽은 결과가 아니라 **기록된 실행 결과**다. 하네스는
신규 `test/unit/worktree-detector.test.js`와 §1.3의 라이브 프로브다.

### 1.1 semgrep 지적은 취약점으로 재현되지 않는다

PR #146은 `javascript.lang.security.detect-child-process`를 HIGH 등급으로 인용한다:
"함수 인자 `args`로부터 child_process 호출이 감지됨."

`safeGit(...)` 호출부 3곳은 전부 모듈 내부 문자열 리터럴
(`'rev-parse --show-toplevel'`, `'rev-parse --git-dir'`, `'rev-parse --git-common-dir'`)을
넘긴다. 호출자가 통제하는 값은 `args`에 도달하지 않는다. 이 지적은 *패턴*에 대해서는
참이고, 이 호출부의 *위험*에 대해서는 거짓이다.

그럼에도 마이그레이션은 옳으며 유지·확대한다. `execFileSync`는 셸을 아예 거치지 않으므로
미래의 호출자가 그 프리미티브를 되살릴 수 없다. 이는 이미 프로젝트가 선언한 정책이다 —
`lib/qa/test-runner.js:9-13`에 *"C1 fix (audit): use execFileSync (no shell) so testDir
can never reach a shell."* 주석이 있다. 7개 호출부가 그 정책을 받지 못했을 뿐이다.

### 1.2 평범한 체크아웃이 linked worktree로 오탐된다 (ENH-424)

git 2.39.5에서 8개 컨텍스트 실측. `BASE`는 PR #146 이전, `PR146`은 현재 `main`,
`FIX`는 §2의 설계안이다.

| 컨텍스트 | 기대값 | BASE | PR146 | FIX |
|---|---|---|---|---|
| main 저장소 최상위 | false | false | false | false |
| **main 저장소 하위 디렉터리** | false | **true ❌** | **true ❌** | false |
| linked worktree 최상위 | true | true | true | true |
| linked worktree 하위 디렉터리 | true | true | true | true |
| submodule 작업 디렉터리 | false | false | false | false |
| bare 저장소 | false | false | false | false |
| 비-git 디렉터리 | false | false | false | false |
| **main을 가리키는 심볼릭 링크 경로** | false | **true ❌** | **true ❌** | false |

**근본 원인.** `git rev-parse --git-dir`는 절대 경로를 반환하지만,
`--git-common-dir`는 **현재 작업 디렉터리 기준** 상대 경로를 반환한다. PR #146 이전
코드는 둘 다 `toplevel` 기준으로 resolve했다.

```js
const absGitDir = path.resolve(toplevel, gitDir);      // 이미 절대경로 — 문제없음
const absCommon = path.resolve(toplevel, gitCommonDir); // '../../.git'을 틀린 기준으로
```

`main/sub/deep`에서 git은 `--git-common-dir`를 `../../.git`으로 내놓는다. 이는
`sub/deep` 기준으로는 옳고 `main/` 기준으로는 무의미하다. 따라서 두 경로는 결코 같아지지
않고, 모든 하위 디렉터리가 워크트리처럼 보인다. PR #146은 `path.resolve` 호출을 아예
제거하고 git의 원시 출력을 비교하는데, 같은 케이스가 다른 이유(절대 vs 상대 문자열)로
실패한다.

이는 **기존부터 있던 결함**으로 v2.1.12부터 출하되었다. PR #146이 만든 것도, 고친 것도
아니다.

### 1.3 안내문이 bkit 자신의 훅에 대해 틀렸다 (ENH-425 — 헤드라인)

현재 bkit이 기록하는 메시지:

> `git worktree detected — Claude Code hooks may not fire (issue #46808). Run bkit from the primary repository if hook-driven automation is required.`

독립된 문제가 두 개다.

**(a) 인용된 이슈는 닫혔고, 대상이 다른 로딩 경로다.**
[anthropics/claude-code#46808](https://github.com/anthropics/claude-code/issues/46808)은
**closed as not planned** 상태다. 주제는 프로젝트 레벨 `.claude/settings.json`이며,
Claude Code가 이를 프로세스 작업 디렉터리 기준으로 해석하기 때문에 `.claude/`가
추적되지 않거나 gitignore된 워크트리에서는 그 파일이 없는 것이다. bkit은 훅을 그렇게
출하하지 않는다. bkit의 훅은 플러그인 `hooks/hooks.json`에서 오며,
[공식 훅 레퍼런스](https://code.claude.com/docs/en/hooks)는 이를 플러그인 활성화 시
로드되는 **별개의 설정 소스**로 명시한다.

**(b) 실측: bkit의 훅은 linked worktree에서 발화한다.** linked worktree 안에서
`claude -p --plugin-dir <bkit> --strict-mcp-config --no-session-persistence` 세션을
1회 실행하고, 같은 저장소의 primary 체크아웃에서 대조군을 1회 실행한 뒤 bkit 자신의
dispatch 원장에서 읽어냈다.

| | linked worktree | primary 체크아웃 |
|---|---|---|
| 발화된 이벤트 | `SessionStart`, `InstructionsLoaded`, `UserPromptSubmit`, `Stop`, `SessionEnd` | **동일 집합** |
| `.bkit/` 생성 | 예 | 예 |
| 워크트리 안내문 기록 | **예** | 아니오 |

관측 가능한 어떤 방식으로도 훅은 저하되지 않았다. bkit은 갖고 있지도 않은 문제를 이유로
사용자에게 워크플로를 포기하라고 안내해 왔고, 심지어 거절되어 고쳐지지 않을 이슈를
가리키고 있었다.

### 1.4 플래그 파일이 bkit 자신의 경로 리졸버를 우회한다 (ENH-426)

bkit의 다른 모든 상태 경로는 `STATE_PATHS.runtime()` → `getPlatform().PROJECT_DIR`
(`process.env.CLAUDE_PROJECT_DIR || process.cwd()`, `lib/core/platform.js:47`)를 거친다.
`worktree-detector.js`만 맨 `process.cwd()`로 플래그 경로를 만든다. §1.2와 겹치면,
하위 디렉터리에서 시작된 세션은 그 하위 디렉터리에 아무도 읽지 않는
`.bkit/runtime/worktree-warning.flag`를 흘린다.

PR #146은 여기에 더해 이 줄을 `cwd` 파라미터에서 `process.cwd()`로 바꿔,
`detectAndWarn(cwd)`가 자기 인자를 무시하게 만들었다. 유일한 호출부
(`hooks/startup/context-init.js:72`)가 무인자라 관측되는 고장은 없지만, 계약은 깨졌다.

### 1.5 셸 호출부 7곳이 남아 있다 (ENH-427, ENH-428)

| 파일:줄 | 명령 | 변수 보간 | 평가 |
|---|---|---|---|
| `lib/defense/push-event-guard.js:150` | `git remote get-url --push ${remoteName}` | **있음** — 사용자의 Bash 명령에서 파싱 | 현재는 `REMOTE_REGEX`(`[\w./-]+`)와 `shellEscape()`로 방어됨. 다만 export된 함수라 다른 호출자에게는 정규식이 보장이 되지 못함 |
| `scripts/_v2119-s0-measure.js:185` | `gh issue list --search "author:${handle} …"` | **있음** — `DEFAULT_DOGFOODERS`, 현재는 리터럴 `['pruge']` | 큰따옴표 셸 문자열 안에 직접 보간. 목록이 하드코딩이라 안전할 뿐 |
| `lib/infra/cc-bridge.js:55` | `claude --version 2>/dev/null` | 없음 | `stdio`가 이미 제공하는 리다이렉트를 셸로 처리 |
| `hooks/startup/session-context.js:171` | `claude --version` | 없음 | 위와 중복 구현 |
| `scripts/check-test-tracking.js:94` | `git ls-files` | 없음 | — |
| `scripts/_v2119-s0-measure.js:289` | `git rev-parse HEAD` | 없음 | — |
| `scripts/lib/sprint-handler-shared.js:193` | `git rev-parse HEAD` | 없음 | `cwd` 미지정, 프로세스 것을 상속 |

별개로 CC 버전 탐지가 **세 번** 구현되어 있다. 위 두 `execSync` 호출부와,
이미 `spawnSync('claude', ['--version'])`를 쓰는 `lib/infra/cc-version-checker.js:212`.
올바른 구현은 이미 트리 안에 있다.

### 1.6 이 파일에 대한 테스트가 없다

`CHANGELOG.md`(v2.1.12)는 *"`test-scripts/unit/worktree-detector.test.js`
(jest, 2 suites / 6 tests)"* 신설을 기록한다. 그 경로는 존재하지 않고,
`test-scripts/` 디렉터리 자체가 없으며, 저장소 전체 검색에서 워크트리 관련 테스트가
0건이다. 디렉터리 이동 과정에서 유실되었거나 애초에 들어오지 않았다. 어느 쪽이든 이
파일은 22개 릴리스 동안 무검증으로 출하되었고, 그래서 §1.2가 그만큼 오래 살아남았다.

---

## 2. 설계

### 2.1 `inspectWorktree()` — git에게 절대 경로를 요구한다

```js
function inspectWorktree(cwd = process.cwd()) {
  let gitDir = null;
  let gitCommonDir = null;

  // git >= 2.31 은 절대 경로를 직접 내놓으므로 기준 디렉터리 문제 자체가 사라진다.
  // 한 번의 호출이 두 값을 순서대로 반환한다.
  const absolute = safeGit(
    ['rev-parse', '--path-format=absolute', '--git-dir', '--git-common-dir'], cwd,
  );
  if (absolute) {
    const lines = absolute.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length >= 2) { [gitDir, gitCommonDir] = lines; }
  }

  // git < 2.31 폴백. git은 이 값들을 toplevel이 아니라 CWD 기준으로 내놓는다 —
  // toplevel 기준으로 resolve한 것이 모든 하위 디렉터리를 워크트리로 보이게 만든 원인이다.
  if (!gitDir || !gitCommonDir) {
    const rawDir = safeGit(['rev-parse', '--git-dir'], cwd);
    const rawCommon = safeGit(['rev-parse', '--git-common-dir'], cwd);
    if (rawDir) gitDir = path.resolve(cwd, rawDir);
    if (rawCommon) gitCommonDir = path.resolve(cwd, rawCommon);
  }

  const toplevel = safeGit(['rev-parse', '--show-toplevel'], cwd);
  if (!toplevel || !gitDir || !gitCommonDir) {
    return { isWorktree: false, toplevel, gitDir, gitCommonDir };
  }
  // 심볼릭 링크 체크아웃(macOS의 /tmp -> /private/tmp)이 서로 다른 디렉터리로 읽히면 안 된다.
  return {
    isWorktree: realpath(gitDir) !== realpath(gitCommonDir),
    toplevel, gitDir, gitCommonDir,
  };
}
```

명시해 둘 결정 세 가지:

- **반환값의 절대 경로를 복원한다.** 여전히 절대 경로를 약속하고 있는 JSDoc·모듈
  docstring과 일치시키고, 하위 도구가 플래그 파일에서 읽는 값과도 일치시킨다.
- **`realpath`는 비교에만 적용하고 반환값에는 적용하지 않는다.** 진단 파일은 git이
  실제로 보고한 경로를 기록해야 한다.
- **폴백은 `cwd` 기준으로 resolve한다.** git이 실제로 사용한 기준점이다.

### 2.2 안내문은 실측한 것만 말한다 (ENH-425)

탐지 자체는 **유지한다**. linked worktree라는 사실은 여전히 알릴 가치가 있다. 프로젝트
스코프 `.claude/settings.json`과 gitignore된 `.claude/`는 거기서 실제로 부재할 수 있기
때문이다. 바뀌는 것은, 메시지가 bkit의 훅을 고장난 것처럼 서술하지 않고, 거절된 이슈를
살아있는 결함처럼 인용하지 않으며, 워크트리를 떠나라고 권하지 않는다는 점이다.

플래그 파일에 `bkitHooksAffected: false`와, 그 주장을 실측한 Claude Code 버전을 담는
`verifiedOn` 필드를 추가한다. 다음 사람이 그 진술이 아직 유효한지 판단할 수 있어야지,
신뢰로 물려받아서는 안 된다.

심각도는 `WARNING`에서 정보성 한 줄로 낮춘다. 실제로 linked worktree가 탐지된 경우에만
stderr에 기록되며, §2.1 이후 그 빈도는 크게 줄어든다.

### 2.3 상태 경로는 리졸버를 거친다 (ENH-426)

플래그 경로는 `path.join(STATE_PATHS.runtime(), 'worktree-warning.flag')`가 되어, 다른
모든 bkit 상태 파일과 동일하게 `CLAUDE_PROJECT_DIR`를 존중한다. `detectAndWarn(cwd)`는
자신의 `cwd`를 `inspectWorktree()`로 전달하며 더 이상 조용히 무시하지 않는다.

### 2.4 저장소 전체 `execFileSync` (ENH-427)

잔여 7곳 전부 argv 배열로 이전한다. `push-event-guard.js`는 호환을 위해 정규식과
`shellEscape` export를 유지하되, 더는 안전을 그것들에 의존하지 않는다.
`_v2119-s0-measure.js`는 `--search`를 단일 argv 요소로 넘겨 handle이 인용 문자열을
끝낼 수 없게 한다.

신규 계약 테스트(`test/contract/child-process-policy.test.js`)는 출하 코드가
템플릿 리터럴이나 문자열 결합으로 `execSync`/`exec`를 호출하면 실패한다. 규칙이 기계적이라
누군가 §1.5를 기억해야만 지켜지는 구조가 아니다.

### 2.5 CC 버전 탐지 통합 (ENH-428)

`cc-bridge.js`와 `session-context.js`가 각자 셸을 띄우는 대신 기존
`lib/infra/cc-version-checker.js` 구현에 위임한다. 하나의 질문에 대한 세 개의 구현이
하나가 된다.

### 2.6 회귀 스위트 (ENH-429)

`test/unit/worktree-detector.test.js`가 §1.2의 8개 컨텍스트 토폴로지를 임시 디렉터리에
구성하고 각각의 판정을 단언한다. **음성 대조군**을 포함한다. PR #146 이전의
`path.resolve(toplevel, …)`이든 #146의 원시 문자열 비교든 되살리면 스위트가 반드시
실패해야 하며, 안내문에 플러그인 훅이 "may not fire"라는 주장이 없음을 단언한다.

---

## 3. 사용자 경험 변화

| 이전 | 이후 |
|---|---|
| 하위 디렉터리에서 bkit을 시작하면 워크트리 경고가 출력되고 쓸모없는 플래그 파일이 생성됨 | 경고 없음. 평범한 체크아웃을 평범한 체크아웃으로 인식 |
| git worktree에서 작업하면 훅이 "발화하지 않을 수 있다"며 main 체크아웃으로 돌아가라고 안내 | 실제로 위험한 것(프로젝트 스코프 `.claude/` 설정)을 알리고, bkit 자신의 훅은 영향 없음을 CC 버전과 함께 실측 근거로 안내 |
| 경고문이 closed-as-not-planned 이슈를 살아있는 것처럼 인용 | 현재 재현되는 내용만 인용 |

---

## 4. 테스트 계획

| 레벨 | 대상 | 통과 조건 |
|---|---|---|
| Unit | 8 컨텍스트 탐지 매트릭스 | 불일치 0 |
| Unit | 음성 대조군(구 구현 2종) | 어느 쪽이든 되살리면 스위트 실패 |
| Contract | `child-process-policy` | 출하 코드의 셸 보간 호출부 0 |
| Contract | 기존 스위트 | 현재 기준선 대비 회귀 없음 |
| Host (L6) | linked worktree에서 `claude -p --plugin-dir` + 대조군 | 발화 이벤트 집합 동일, 안내문이 §2.2와 일치 |
| Full QA | 전 스킬 / 에이전트 / 훅 이벤트 / MCP 툴 | Phase 4 하네스 기준 |

---

## 5. 리스크

| 리스크 | 완화 |
|---|---|
| git < 2.31에서 `--path-format=absolute` 미지원 | 명시적 폴백 경로. 테스트에서 폴백 분기를 강제 실행 |
| 안내문을 완화하면 진짜 워크트리 문제를 가릴 수 있음 | 탐지는 유지. 철회하는 것은 *bkit 훅에 대한 주장*뿐이며, 그것도 실측에 근거해 철회 |
| §1.3의 실측은 특정 CC 버전에 한정됨 | `verifiedOn`에 버전 기록. L6 테스트가 기록값을 신뢰하지 않고 매번 재측정 |
| child_process 스윕으로 7개 파일을 건드리는 churn | 각각 동작 변화 없는 기계적 argv 변환이며, 계약 테스트가 결과를 고정 |

---

## 6. 명시적 이월

**`WorktreeCreate` / `WorktreeRemove` 등록.** CHANGELOG v2.1.33이 ENH-396/418로
이월을 기록해 두었다: *"confirmed supported by Claude Code, deferred for the hook-count
cascade."* 이번에 발견된 어떤 것도 그 판단을 바꾸지 않는다. 이번 릴리스는 워크트리에 대한
**틀린 주장을 제거**하는 것이지 워크트리 생명주기 관리를 추가하는 것이 아니다. 상시
로드되는 훅 이벤트를 둘 더 등록하는 컨텍스트 비용을 정당화할 근거가 이번 릴리스에는 없다.
조용히 누락시키지 않고 기록으로 남긴다.

**ENH-383 / ENH-403 상태 정정.** v2.1.33 사이클의 분석 문서들은 ENH-383을 미출하로
기술한다. 지금은 절반만 참이다. `skipped[]` 노출 절반은
`hooks/startup/restore.js:29`와 `lib/core/paths.js:365`에 (둘 다 v2.1.33 라벨로) 출하되었고,
ENH-403의 두 원인 구분 메시지는 `paths.js:379-387`에 있으며 v2.1.33 CHANGELOG에 등재되어
있다. ENH-383의 남은 절반 — *"`worktree-detector.js` 메시지가 이제 오도한다"* — 이 바로
§1.3이며, 이번 릴리스가 그것을 닫는다.

---

## 7. 추적성

| ID | 항목 | 파일 |
|---|---|---|
| ENH-424 | 워크트리 탐지 기준 디렉터리 정확성 | `lib/core/worktree-detector.js` |
| ENH-425 | 안내문 정확성, #46808 인용 은퇴 | `lib/core/worktree-detector.js` |
| ENH-426 | `STATE_PATHS.runtime()` 경유 플래그 경로, `cwd` 존중 | `lib/core/worktree-detector.js` |
| ENH-427 | 저장소 전체 `execFileSync` + 정책 계약 | 7개 파일 + `test/contract/child-process-policy.test.js` |
| ENH-428 | CC 버전 탐지 통합 | `lib/infra/cc-bridge.js`, `hooks/startup/session-context.js` |
| ENH-429 | worktree-detector 테스트 커버리지 복원 | `test/unit/worktree-detector.test.js` |
| ENH-430 | SB-011 플래키 제거(살아있는 프로젝트 상태 대신 고정 상태를 읽음) | `test/philosophy/security-by-default-v2.test.js` |
| ENH-431 | 테스트 매니페스트는 존재하는 파일만 나열, 부재 시 실패 처리 | `test/run-all.js`, `test/contract/test-manifest-integrity.test.js` |

### ENH-430 — 읽어서가 아니라 돌려서 발견한 것

이 브랜치의 첫 전체 집계가 실패 1건을 보고했다:
`SB-011 … (control: 38, engine: 50)`. 두 번째 집계는 0건이었다. 이 단언은 69줄에서
`initState`를 잡고 153줄에서 트러스트 엔진을 읽는데, 둘 다 개발자의 살아있는
`.bkit/state/`를 본다. 그리고 **바로 이 저장소에서 돌고 있는 bkit 세션**이 그 사이에
`trust-profile.json`을 다시 쓴다(mtime으로 확인). v2.1.33은 이미 이 단언에서 하드코딩
상수를 제거하며 *"누적된 로컬 상태에 따라 통과하거나 실패하는 테스트는 테스트가 아니다"*
라고 적어 두었다. 상수는 없앴고 상태 의존은 남겼다.

이제 두 값 모두 빈 `CLAUDE_PROJECT_DIR`로 고정된 자식 프로세스 한 번에서 읽는다. 두 읽기가
원자적이 되고, 기대값이 새 클론·도그푸딩 머신·CI에서 모두 같아진다. 3회 연속 38/38로
결정적임을 실측했다.
