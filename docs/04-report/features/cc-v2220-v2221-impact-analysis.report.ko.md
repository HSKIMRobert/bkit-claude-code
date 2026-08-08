# CC v2.1.220 → v2.1.221 영향 분석 보고서 (사이클 #31)

| 항목 | 값 |
|---|---|
| 분석 일자 | 2026-08-04 |
| CC 범위 | v2.1.220 → **v2.1.221** (신규 범위는 221 단독) |
| 설치 CC / npm latest | 2.1.221 / 2.1.221 |
| npm dist-tags | `latest=2.1.221`, `next=2.1.221`, `stable=2.1.220` |
| bkit 버전 | 2.1.32 |
| bullet 수 | **39** (Breaking **0**) |
| 판정 | **호환 (COMPATIBLE)** — 연속 호환 **164** 릴리스 |
| 신규 ENH | ENH-381 ~ ENH-387 (제안, **미구현**) |

---

## Executive Summary

v2.1.221은 v2.1.220과 성격이 정반대입니다. 220은 사실상 no-op(바이너리 +0.0062%,
피처게이트 1754/1754 동일)이었던 반면, 221은 **+13.7 MB (+5.14%)**, 39 bullets,
신규 `reason:` 리터럴 +33개(제거 0)의 실질 릴리스입니다. npm 게시 간격도
220→221이 약 **10일**로, 같은 구간의 다른 인접쌍(~1일, 219→220은 7시간)과 확연히
다릅니다.

bkit 관점의 헤드라인은 **`btw` 이름 충돌 수정(bullet #18)** 입니다. CC는
`local-jsx` 내장명령 88개를 갖는데, bkit의 44개 스킬명 중 정확히 하나 — `btw` —
가 그와 충돌합니다. 주목할 점은 **bkit이 이 문제를 CC보다 한 릴리스 먼저 독자적으로
발견해 v2.1.32에서 완화했다**는 것입니다(`CHANGELOG.md:161-166`). 따라서 이번
수정은 bkit에 새 의존이나 새 버전 하한을 만들지 않습니다.

호환성은 깨끗합니다. `claude plugin validate .`가 경고 0으로 통과하고, CC 훅 이벤트
집합은 31=31로 동일하며, 스킬 frontmatter `context:`/`background:` 파싱도 불변이라
bkit의 8개 fork 스킬은 영향받지 않습니다. Breaking은 0건입니다.

다만 이번 사이클은 **CC 변경이 유발한 결함이 아니라, CC 변경이 드러낸 bkit 자체
결함 3건**을 노출했습니다: (1) 완화가 끝나지 않아 런타임에서 여전히 잘못된 명령을
출력하는 `btw` 안내, (2) CC의 실제 effort enum보다 좁아서 최고 효율 세션을 중간
단계로 격하시키는 방어 가드, (3) `/fork`가 기본으로 워크트리를 만들게 되면서
도달 가능해진 bkit 상태 공백. 세 건 모두 CC 우회책이 아니라 bkit 내부 정합성
문제입니다.

### 4-관점 가치 평가

| 관점 | 평가 |
|---|---|
| **사용자** | `/btw list` 같은 잘못된 안내가 런타임에 출력되는 문제가 확인됨(ENH-381). 221 자체는 zsh `[[ ]]` 권한우회 수정 등으로 순증 이득. |
| **유지보수** | ENH 번호 이중 부킹(ERRATA-31-5) 재발 — 보고서 문서와 출시 원장이 ENH-374~377에 서로 다른 의미를 부여. 번호 SSoT를 원장(CHANGELOG)으로 고정 필요. |
| **아키텍처** | bkit의 regex 기반 Bash 방어가 CC의 토크나이저 결함(zsh `[[ ]]`)에 **구조적으로 면역**임이 재확인. 파이프 매처 회피와 동일한 "관례에 의한 회피" 패턴. |
| **비용/리스크** | REMOTE-GATE-DRIFT 미해소 — 중첩 depth 기본값은 여전히 원격 게이트(`tengu_hazel_trellis`)로 서버측 변경 가능. 버전 고정으로 방어 불가. |

---

## §1. 버전 범위 및 조사 방법

3중 소스 교차검증을 적용했습니다.

| # | 소스 | 취득 방법 |
|---|---|---|
| 1 | raw CHANGELOG.md | `curl raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md` |
| 2 | GitHub release body | `gh api repos/anthropics/claude-code/releases/tags/v2.1.221 --jq .body` |
| 3 | 설치본 바이너리 직독 | `~/.local/share/claude/versions/{2.1.220,2.1.221}` |

3번 소스는 사이클 #30에서 신설했습니다. Mach-O 단일 파일이지만 JS 번들이 평문
임베드되어 zod 스키마·기본값·피처게이트·문서 문자열을 직독할 수 있습니다.

**npm 연속성 (R-1 / R-2)**

2.1.210~2.1.221 정수 갭 워크 결과 **누락 버전 0건**(12/12 존재)으로 R-1(무언의
게시)은 **CLEAN**입니다. 이는 사이클 #30에서 미평가로 남았던 항목을 이번에 해소한
것입니다. R-2(220→221 연속성)도 CLEAN입니다.

```
2.1.210  2026-07-14T19:39:21     2.1.216  2026-07-20T20:19:37
2.1.211  2026-07-15T19:24:07     2.1.217  2026-07-21T19:55:38
2.1.212  2026-07-16T19:20:24     2.1.218  2026-07-22T19:55:32
2.1.213  2026-07-17T22:26:26     2.1.219  2026-07-24T16:11:49
2.1.214  2026-07-18T00:13:41     2.1.220  2026-07-24T23:11:21
2.1.215  2026-07-19T00:53:37     2.1.221  2026-08-03T22:16:25
```

---

## §2. 변경 카탈로그

### 2.1 카테고리 분포 (39 bullets)

두 원본 모두 **소제목 없는 평면 목록**입니다. 아래 분류는 각 bullet의 선두 동사에서
본 분석이 부여한 것으로, 원본에 존재하는 구분이 아닙니다.

| 카테고리 | 수 |
|---|---|
| Added | 4 |
| Fixed | 17 |
| Improved | 5 |
| Changed | 11 |
| Reduced | 1 |
| Removed | 1 |
| **합계** | **39** |
| **Breaking** | **0** |

### 2.2 bkit 교차 항목

| # | 변경 | 영향 | bkit 표면 |
|---|---|---|---|
| 18 | 내장명령과 동명인 플러그인/조직 스킬이 비대화형 세션에서 호출 불가 → 수정 | **HIGH** | `skills/btw/SKILL.md` (유일 충돌) |
| 5 | zsh가 `[[ ]]` 정규식 조건절에 숨긴 명령을 실행하던 Bash 권한검사 우회 → 수정 | **HIGH** | 차별화 #6 (heredoc), Layer-6 방어 |
| 34 | `/fork` 세션이 원본 체크아웃 대신 자체 워크트리를 생성 | **HIGH** | `lib/core/paths.js`, `worktree-detector.js`, `.bkit/state/*` |
| 30 | `/plugin` 설치 플러그인이 `/reload-plugins` 없이 즉시 활성화 | LOW | 문서 참조만 (모두 *편집 후* 리로드 문맥) |
| 28 | 백그라운드 세션이 commit·push하고 CLAUDE.md git 지침을 따름 | MEDIUM | `lib/defense/push-event-guard.js` (ENH-298) |
| 11 | thinking 비활성 상태에서 effort `xhigh`/`max` 시 WebSearch 400 → 수정 | MEDIUM | **CC effort enum ⊋ bkit enum**을 드러냄 |
| 3 | `claude plugin validate`에 마켓플레이스명 경고 추가 | LOW | `marketplace.json` — **경고 0으로 통과 확인** |
| 31 | 플러그인이 `skills` 경로로 `"."`를 수용 | LOW | `plugin.json`에 `skills` 키 자체가 없음 |
| 8 | `-p` 모드에서 `--mcp-config` MCP 서버 미연결 → 수정 | LOW | bkit은 매니페스트로 서버 제공, `.mcp.json` 부재 |
| 15 | `CLAUDE_CODE_RESUME_INTERRUPTED_TURN=0` falsy 미존중 → 수정 | LOW | 레포 전체 참조 0건 |

### 2.3 IMMUNE / 직교 (24건)

VSCode Focus view, Vim 모드 2건, sandbox `mask`(Linux/WSL), PowerShell 인용 경로,
Bedrock+AWS SSO, Stats 패널, emoji 자동완성, Claude in Chrome, Gateway `model`
검증, Monitor, `/status` 세션 종류, `/ultrareview`, Windows kernel32 시작,
thinking 토글, @-멘션 Esc, SDK MCP `constructor` 크래시, TLS 업로드, 지출한도
문구, wake-from-sleep 토큰 경합, 세션 이름 변경, "Plugins changed" 알림, Vertex
tool search, auto-mode 캐시 2건 — bkit 표면 없음.

### 2.4 문서화되지 않은 서브시스템 작업 (bullet 없음, 바이너리 전용)

CHANGELOG에 대응 bullet이 **없는** 두 클러스터가 바이너리에 나타납니다. 다음 사이클
감시 대상입니다.

- **MCP 클러스터 (신규 게이트 7종)**: `tengu_mcp_protocol_negotiation_{stdio,http,claudeai}`,
  `tengu_mcp_discovery_{cache,source}`, `tengu_mcp_listen_reopen`,
  `tengu_mcp_skills_funnel` + `skills-capable`/`channel-capable` 능력 마커(각 0→7).
- **org-memory 클러스터 (신규 게이트 4종)**: `tengu_org_memory_*`. bkit 차별화 #1
  (Memory Enforcer) 인접 표면.

---

## §3.0 원본 검증 게이트 (Phase 1.5 — MANDATORY)

| 항목 | 원본 검증값 | 소스 | 판정 |
|---|---|---|---|
| raw CHANGELOG.md §2.1.221 bullets | **39** | `sed -n '3,44p'` + `grep -cE '^\s*[-*] '` | 측정 |
| GitHub release body bullets | **39** | `gh api … --jq .body` + `grep -c` | 측정 |
| 합집합 | **39** | `comm` (정렬된 bullet 텍스트) | — |
| GH − CHANGELOG | **0** | `comm -13` | 일치 |
| CHANGELOG − GH | **0** | `comm -23` | 일치 |
| 소제목별 분할 | **N/A — 소제목 미존재** | 양쪽 원본 | ERRATA-31-1 참조 |

**게이트 통과.** 사이클 #30(219: CHANGELOG 24 vs GH body 27)과 달리 두 문서 소스가
정확히 일치했습니다. ERRATA-30-1의 합집합 규칙을 적용했으나 델타가 없었습니다.

### ERRATA-31-1 — WebFetch가 문서 구조를 날조 (신규, HIGH)

Phase 1.5의 WebFetch 두 건이 **모두** 잘못된 총계와 존재하지 않는 구조를 반환했습니다.

| 소스 | WebFetch 주장 | 실측 |
|---|---|---|
| raw CHANGELOG.md | "총 31개" | **39** |
| GitHub release 태그 | "총 58개", `Feature Additions(4)/Bug Fixes(20)/Improvements(11)/Additional Changes(8)` | **39**, `## What's changed` 단일 제목, **소제목 없음** |

한 번의 게이트 실행에서 독립적 결함 3가지가 동시에 발생했습니다. (1) 총계 둘 다 오류,
(2) GitHub 쪽은 자기모순(주장 58 / 자기 소제목 합 43 / 실제 나열 39), (3) 소제목
분류 자체가 **날조**. bullet **본문 텍스트는 양쪽 모두 정확**했고, 오염된 것은
수량·구조 주장뿐입니다.

**규칙 변경 (SKILL.md Phase 1.5 프로토콜 3단계를 대체):** bullet 수와 문서 구조는
반드시 기계적 추출(`gh api --jq .body` / `curl` + `grep -c` + `comm`)로 확정하고,
WebFetch에 세어 달라고 요청해서는 안 됩니다. WebFetch는 verbatim 본문 회수 용도로만
유효합니다.

### ERRATA-31-2 — minified 번들의 윈도우 diff는 위양성 (신규)

키워드 주변 N자 윈도우를 두 minified 번들 간에 diff하면, 식별자 리네이밍이 모든
바이트 오프셋을 이동시키기 때문에 허위 추가가 보고됩니다. 이번에 heredoc 가드
문자열 2건을 "221 신규"로 잘못 잡았고, 정확 리터럴 카운트로 220에도 동일 개수(2=2)
존재함을 확인했습니다.

**규칙:** 바이너리 소스 주장은 **정확 문자열 출현 횟수**(`index()` 루프)로만 하고,
집합 비교는 추출된 리터럴 대상으로만 수행합니다.

### ERRATA-31-3 — `/fork` 강등은 그 자체가 반증됨

Phase 1 에이전트가 bullet #34를 HIGH→MEDIUM으로 강등하며 `isolation:"worktree"`
0/0, `worktree`+`fork` 동시출현 32/32, `WorktreeCreate` 83/83을 근거로 들었습니다.
이 프로브들은 변경 이전부터 존재하던 기반 코드를 셀 뿐 변경 자체에 둔감합니다.
실제 신규 문구로 재측정하면 결정적입니다.

| 리터럴 | 2.1.220 | 2.1.221 |
|---|---|---|
| `create a new worktree of your own with` | **0** | **4** |
| `This conversation was forked from a session that is still working in this checkout` | **0** | **2** |
| `a linked worktree the original session is still working in` | **0** | **1** |
| `own-worktree` | 2 | 4 |

**221 신규 확정.** HIGH 복원. 교훈: 부재 증명에는 변경 자체를 겨냥한 문자열을 써야
하며, 주변 기반 코드 카운트는 근거가 되지 못합니다.

### ERRATA-31-4 — VSCode 범위 bullet은 CLI 바이너리로 검증 불가

`Toggle Focus view` 0/0, `Focus view` 12/12. VSCode 확장은 CLI 바이너리와 별개
산출물이므로 **CLI 바이너리의 부재를 VSCode bullet의 반증으로 삼아서는 안 됩니다.**

### ERRATA-31-5 — ENH 번호 이중 부킹 (신규, 프로세스 결함)

사이클 #30 **보고서 문서**와 **출시 원장**이 같은 번호에 다른 의미를 부여했습니다.

| 번호 | 보고서 문서 (`…report.en.md:420-425`) | 실제 출시 (`CHANGELOG.md`) |
|---|---|---|
| ENH-374 | SubagentStart 계약 정합 | Stop 계열 `background_tasks` 게이팅 |
| ENH-375 | `MAX_TEAMMATES` 정리 | CC 버전 감지 Strategy 0 |
| ENH-376 | `registerSpawn` positional args | 로스터 아이덴티티 |
| ENH-377 | `DirectoryAdded` 등록 (**P3 보류**) | `MAX_TEAMMATES` 단일소스 + locked RMW |

결과적으로 **ENH-377이 이중 부킹**되었고, 사이클 #30 항목 중 진짜 미구현으로 남은
`DirectoryAdded` 등록은 **유효한 번호가 없는 고아 상태**입니다.

**추가 정정:** 본 분석 착수 시 메모리는 "최고 ENH = 371, 신규는 372부터, 372~377은
전부 미구현"으로 기록되어 있었으나 **전부 틀렸습니다**. 원장 실측 결과 ENH-372~380
9건이 v2.1.32(2026-07-28)에 **구현·출시 완료**되었습니다
(`CHANGELOG.md:19,37,56,80,96,114`). 최고 소비 번호는 **ENH-380**이며 신규 후보는
**ENH-381**부터입니다. 번호 SSoT는 원장(CHANGELOG)으로 고정해야 합니다.

---

## §4. bkit 영향 분석

### 4.1 C1 — `btw` 이름 충돌 (헤드라인)

CC 바이너리에서 `local-jsx` 타입 내장명령 **88개**를 추출해 bkit 44개 스킬명과
교집합을 구하면 정확히 하나 — **`btw`** — 가 나옵니다. 접미사 관례로 비껴간 근접
사례: `plan-plus`(vs `plan`), `mobile-app`(vs `mobile`), `desktop-app`(vs
`desktop`), `skill-status`(vs `status`), `code-review`(vs `review`).

**bkit이 CC보다 먼저 발견했습니다.** `CHANGELOG.md:161-166`(v2.1.32, 2026-07-28)은
bare `/btw`가 "Unknown command"가 아니라 "isn't available in this environment"를
반환한다는 점(= CC가 이름을 알고 게이팅한다는 증거)을 기록하고, 28개 사용자 호출
가능 스킬 전수 조사로 이것이 유일한 충돌임을 확인한 뒤 네임스페이스 형태
`/bkit:btw`로 완화했습니다.

- **221 이전에 `/bkit:btw`가 깨져 있었나? → 아니오.** 네임스페이스 형태는 v2.1.220에서
  end-to-end 동작이 검증되어 있습니다. bullet #18은 **bare 이름 가려짐**만 대상으로 합니다.
- **새 버전 하한이 생기나? → 아니오.** bkit은 bare 형태에 의존하지 않으므로 이득이
  없고 하한도 없습니다. **bare 형태로 되돌리지 말 것**을 권고합니다 — 네임스페이스
  형태는 버전·모드 무관하게 동작합니다.
- **잔여 리스크 (확정):** v2.1.32 수정이 SKILL.md **frontmatter**와 cto-lead 팁에만
  적용되고 **본문과 형제 표면에는 미적용**입니다. 6개 표면이 여전히 bare 형태를
  광고하며, 그중 하나는 **런타임에 사용자에게 출력**합니다:
  `scripts/cto-stop.js:101` — `` `Use /btw list to review, /btw promote {id} to create skills.\n` ``
  (직접 확인). 나머지: `skills/btw/SKILL.md`(본문 14곳), `skills/bkit/SKILL.md:81,147`,
  `commands/bkit.md:282`, `skills/skill-create/SKILL.md:142`,
  `agents/skill-needs-extractor.md:120`. → **ENH-381**
- **잔여 리스크 (미검증):** bullet #18은 **비대화형** 세션 한정입니다. 대화형 TUI에서는
  내장 `btw`가 실행 가능하므로 bare `/btw`는 여전히 CC 내장으로 해석될 가능성이
  큽니다. 이는 현재의 가시적 거부보다 **더 나쁜 실패 양식**(무음 오작동)입니다.
  실험 필요: 221에서 `claude -p --plugin-dir . '/btw test'` 와 대화형 TUI `/btw test`
  각각 확인. 본 사이클에서는 미실행.

### 4.2 C2 — effort enum 불일치 (CC 변경이 드러낸 bkit 결함)

bullet #11이 effort `xhigh`/`max`를 언급하면서 bkit 가드의 enum이 좁다는 사실이
드러났습니다. 바이너리로 CC의 실제 enum을 확정했습니다:

| enum | 값 | 바이너리 출현 |
|---|---|---|
| 런타임 effort (전체) | `low, medium, high, xhigh, max` | `["low","medium","high","xhigh","max"]` **8회** |
| 영속(persisted) effort | `low, medium, high, xhigh` | `["low","medium","high","xhigh"]` 9회, "Persisted effort level for supported models" |

bkit 측 (`lib/domain/guards/invariant-10-effort-aware.js:24`):

```js
const VALID_EFFORT_LEVELS = Object.freeze(['low', 'medium', 'high']);
```

`normalize()`(`:98-103`)는 `xhigh`/`max`를 모두 `'medium'`으로 낙착시킵니다. 즉
CC의 **최고** 추론 효율로 도는 세션이 bkit의 **중간** 방어 상세도를 받습니다.

**정확히 하기 — 무음 실패는 아닙니다.** `check()`(`:72-88`)가 동시에
`kind: 'out-of-range'`, `severity: 'HIGH'` 소견을 발화합니다. 다만 그 note가
`'effort.level out of range — defense modules will degrade safely'`(`:84`)로,
`xhigh`/`max`에 대한 하향 격하를 "safely"라 부르는 것은 부정확합니다. 또한 고효율
세션마다 상시 HIGH 소견이 발화되므로 경보 소음이 됩니다. → **ENH-382**

### 4.3 C3 — `/fork` 워크트리: 상태 공백과 봉쇄된 복구 경로

체인 전체가 검증되었습니다.

1. bkit 상태는 전부 `${PROJECT_DIR}/.bkit/` 아래로 해석됩니다 (`lib/core/paths.js:19-21`,
   `STATE_PATHS` 30여 항목 `:23-76`).
2. `.bkit/`는 gitignore 대상입니다 (`.gitignore:58`).
3. 따라서 `/fork`가 만든 워크트리는 `.bkit/`가 **없는** 새 체크아웃입니다.
   `ensureBkitDirs()`(`paths.js:92-106`)가 빈 골격을 조용히 재생성하고,
   `initPdcaStatusIfNotExists()`(`hooks/startup/context-init.js:84`)가 빈 PDCA 상태를
   초기화합니다. fork는 PDCA phase·메모리·신뢰 프로파일·체크포인트·감사추적이 전무한
   제로 상태로 시작합니다.
4. **복구 경로가 설계상 봉쇄되어 있습니다.** `restoreFromPluginData()`
   (`lib/core/paths.js:286-321`, SessionStart의 `hooks/startup/restore.js:20-21`에서 배선)는
   #48 교차 프로젝트 가드(`:292-317`)를 적용해 `meta.projectDir`를 현재 `PROJECT_DIR`와
   `realpathSync` 정규화 비교하고, 다르면
   `{restored: [], skipped: ['backup belongs to different project: …']}`를 반환합니다.
   **워크트리는 경로가 다릅니다.** 즉 프로젝트 A→B 유출을 막는 가드가 fork의 자기 부모
   상태 복구까지 막으며, 그 사실이 사용자에게 노출되지 않습니다(스킵 사유는 반환될 뿐).
5. **기존 경고는 이 경우를 다루지 않습니다.** `lib/core/worktree-detector.js:58-84`
   (`hooks/startup/context-init.js:68-81`에서 배선)는 링크된 워크트리에서 발화하지만,
   메시지(`:69-72`)는 이슈 #46808("훅이 발화하지 않을 수 있음 — 주 저장소에서 실행")에
   관한 것으로 상태 부재를 언급하지 않습니다. 게다가 그 권고("주 저장소에서 실행")는
   **CC의 새 시스템 프롬프트가 fork에 지시하는 바와 정면 충돌**합니다.

즉 잠재 결함이 v2.1.221에서 **기본 경로로 도달 가능**해졌습니다. → **ENH-383**

**미검증 (설계 전 확인 필요):** `backupToPluginData()`(`:223-279`)가 매 백업마다
`meta.projectDir`를 현재 `PROJECT_DIR`로 재기록(`:271`)하고 SessionEnd
(`scripts/session-end-handler.js:40-41`)에서 호출됩니다. `CLAUDE_PLUGIN_DATA`가 원본
세션과 fork 사이에 공유된다면 fork의 SessionEnd가 `meta.projectDir`를 워크트리로
돌려놓아 **원본 세션의 복구까지 거부**될 수 있습니다. `CLAUDE_PLUGIN_DATA`의 스코프
(세션별/프로젝트별/플러그인별)를 확인하기 전에는 이 시나리오를 전제로 설계하면 안 됩니다.

### 4.4 C4 — SubagentStart는 9개 필드를 보냄 (7개 아님)

221 바이너리에서 직독한 base spread:

```js
{session_id:n, transcript_path:BD(n), cwd:Ot(), prompt_id:cRt()??void 0,
 permission_mode:e, agent_id:r?.agentId, agent_type:o, effort:a}
```

`effort`는 문자열이 아니라 `{level: …}` **객체**이며,
`getAppState().effortValue`를 기반으로 `permissionLayers`의 `kind === "effort"`
항목이 덮어씁니다. `hook_event_name` 포함 총 **9개** 필드입니다.

여전히 부재(사이클 #30과 동일): `agent_name`, `model`, `team_name`, `tool_input`,
`depth`, `parent_agent_id`, `parent_tool_use_id`.

`scripts/subagent-start-handler.js:92-96`의 계약 주석은 **7개만** 열거하며
`permission_mode`와 `effort`를 누락합니다. → **ENH-385**

**사이클 #30의 미해결 질문 종결:** "SubagentStart가 depth 2+에서 발화하는가?" →
**예.** 같은 파일 `:92-93`이 v2.1.220 실측 캡처로 depth-1과 depth-2 스폰이 동일 필드
집합을 산출함을 기록하고 있습니다. 다만 페이로드에 depth/parent 필드가 없으므로
**발화는 확인되었으나 중첩 트리 재구성은 여전히 불가능**합니다.

### 4.5 C5 — zsh `[[ ]]` 수정: bkit은 구조적으로 면역

bkit의 Bash 방어는 토크나이즈하지 않고 명령 문자열 전체를 regex 스캔합니다
(`lib/control/destructive-detector.js:34-126`의 12개 비앵커 정규식,
`lib/defense/heredoc-detector.js:89-208`의 22개 패턴). CC 버그는 *토큰화된 AST 위의
권한 순회*에 있었고(220에도 `DoubleBracketOpen`/`Close` 렉서 토큰이 이미 존재했으므로
수정 지점은 순회 로직), 파서에서 토큰을 숨기는 단어분리 트릭은 **리터럴 바이트를
regex로부터 숨기지 못합니다**. 파이프 매처 회피와 동일한 "관례에 의한 회피"입니다.

**차별화 #6(heredoc)은 변경 불요.** #58904는 여전히 CLOSED/NOT_PLANNED이고, 바이너리
heredoc 가드 리터럴은 2=2로 불변이며, 39개 bullet 중 해당 수정은 0건입니다.

### 4.6 C6 — 플러그인 라이프사이클 · MCP

전부 Neutral로 판정했습니다.

- **즉시 활성화(#30):** bkit의 `/reload-plugins` 참조 3곳
  (`skills/bkit-rules/SKILL.md:268`, `commands/bkit.md:292`,
  `skills/claude-code-learning/SKILL.md:259`)은 모두 개발 중 *편집 후* 리로드 문맥이며
  설치 후 활성화가 아닙니다. 어느 것도 틀리게 되지 않습니다.
- **마켓플레이스명 경고(#3):** `marketplace.json:3` = `bkit-marketplace`,
  `plugin.json:2` = `bkit`. CC 2.1.221에서 `claude plugin validate .` → **통과, 경고 0**.
  경험적으로 종결.
- **`"."` skills 경로(#31):** `plugin.json`에 `skills` 키가 아예 없음. 해당 없음.
- **MCP:** 두 서버 모두 `protocolVersion: '2024-11-05'`를 하드코딩하고
  (`servers/bkit-pdca-server/index.js:719-725`,
  `servers/bkit-analysis-server/index.js:408-414`) `skills`를 광고하지 않으므로
  `tengu_mcp_skills_funnel`·`skills-capable`은 bkit에 대해 불활성입니다(CC가
  `skills/list`를 보내지 않음). **감시 항목 1건**: `tengu_mcp_protocol_negotiation_stdio` —
  bkit은 클라이언트 요청 버전을 echo하지 않고 고정 버전을 응답합니다. MCP 의미론상
  서버가 지원 버전으로 응답하는 것은 적법하나, 향후 협상 게이트가 하한을 강제하면
  이 라인이 깨집니다. ENH 아님, 모니터 항목.

---

## §5. ENH 로드맵 (Phase 3 브레인스토밍)

### 5.1 Intent Discovery

- **이번 업그레이드에서 bkit이 얻을 최대 가치는?** 새 기능 채택이 아니라 **자기 정합성
  회복**입니다. 221이 새로 만든 문제는 없고, 이미 있던 3건을 드러냈습니다.
- **놓치면 안 되는 critical change는?** 없습니다. Breaking 0, 훅 이벤트 31=31,
  스킬 파싱 불변. 유일하게 기본 동작이 바뀐 `/fork` 워크트리조차 bkit 코드를 깨지
  않고, 다만 잠재 공백을 도달 가능하게 만들 뿐입니다.
- **기존 workaround를 대체할 native 기능은?** 없습니다. 차별화 3종(heredoc·병렬캐시·
  플러그인훅유실)은 전부 미수정이고, `btw` 완화는 네임스페이스라 CC 수정과 무관하게
  계속 유효합니다.

### 5.2 Alternative Exploration — ENH-383 (fork 상태 공백)

| 안 | 내용 | 평가 |
|---|---|---|
| A | **탐지 + 경고**: `worktree-detector`를 확장해 상태 부재를 감지하고, 복구가 #48 가드로 거부됐음을 명시 | **채택** — 최소 구현, 잘못된 기존 권고 수정 포함 |
| B | 워크트리 간 상태 동기화 | 기각 — 기능이지 수정이 아님. `CLAUDE_PLUGIN_DATA` 스코프 미확인 상태에서 설계 불가 |
| C | #48 가드에 워크트리 예외 추가 | 기각 — 교차 프로젝트 유출 방어를 약화. 부모-fork 관계를 신뢰 가능하게 판별할 수단이 현재 없음 |
| D | 무조치 | 기각 — CC 시스템 프롬프트가 사용자를 이 경로로 능동적으로 몰고 있음 |

A안 채택 시에도 `restoreFromPluginData`의 스킵 사유를 **사용자에게 노출**하는 것이
핵심입니다(현재는 반환만 되고 표시되지 않음).

### 5.3 YAGNI 검토

| ENH | 지금 필요한가? | 안 하면? | 판정 |
|---|---|---|---|
| 381 | 예 | 런타임이 사용자에게 동작하지 않는 명령을 계속 안내 | **Accept** |
| 382 | 예 | 최고효율 세션에서 방어 상세도 격하 + 상시 HIGH 경보 소음 | **Accept** |
| 383 | 예 | 221이 기본으로 유도하는 경로에서 상태 무음 소실 | **Accept (경고 범위 한정)** |
| 384 | 예 | 권고 버전이 no-op 핫픽스(220)에 고정됨 | **Accept** |
| 385 | 예 | 손으로 재검증한 계약 기록이 부정확 → ENH-376이 없애려던 드리프트 재발 | **Accept** |
| 386 | 아니오 | 없음 — 현재 어떤 방어 모듈도 subagent 스코프 effort로 분기하지 않음 | **Defer** |
| 387 | 아니오 | 없음 — bkit에 다중 워크트리 규칙이 없어 대응 불가한 조건만 노출 | **Defer** |

### 5.4 우선순위 배정

| ENH | P | 내용 | 주요 파일 |
|---|---|---|---|
| **ENH-381** | **P1** | bare `/btw` → `/bkit:btw` 전파 완료 (런타임 출력 1곳 포함 6개 표면) | `scripts/cto-stop.js:101`, `skills/btw/SKILL.md`(14곳), `skills/bkit/SKILL.md:81,147`, `commands/bkit.md:282`, `skills/skill-create/SKILL.md:142`, `agents/skill-needs-extractor.md:120` |
| **ENH-382** | **P1** | `VALID_EFFORT_LEVELS`에 `xhigh`/`max` 추가, out-of-range를 하향격하 대신 상향 처리, note 문구 수정 | `lib/domain/guards/invariant-10-effort-aware.js:24,72-88,98-103`, `docs/adr/0010-effort-aware-invariant.md` |
| **ENH-383** | **P1** | fork 워크트리 상태 공백 탐지·경고 + 복구 거부 사유 노출 | `lib/core/worktree-detector.js:58-84`, `lib/core/paths.js:292-317`, `hooks/startup/context-init.js:68-81` |
| **ENH-384** | P2 | `RECOMMENDED_VERSION` 2.1.220 → 2.1.221 + 문서 동기화 | `lib/infra/cc-version-checker.js:49-65`, `README.md` |
| **ENH-385** | P3 | SubagentStart 계약 주석 7→9 필드, stale 픽스처 수정 | `scripts/subagent-start-handler.js:92-96`, `test/contract/l2-smoke.test.js:74-75` |
| ENH-386 | P2 | *(Deferred)* SubagentStart `effort.level` 소비 → 서브에이전트별 방어 상세도 | `scripts/subagent-start-handler.js:110-116` |
| ENH-387 | P3 | *(Deferred)* `WorktreeCreate`/`WorktreeRemove` 등록 | `hooks/hooks.json` |

**고아 항목:** 사이클 #30의 `DirectoryAdded` 등록은 ERRATA-31-5로 유효 번호를
잃었습니다. 재번호 부여가 필요하나, 본 사이클에서는 여전히 YAGNI(멀티루트 규칙 부재)로
보류합니다.

### 5.5 철학 준수

| ENH | Automation First | No Guessing | Docs=Code | 판정 |
|---|---|---|---|---|
| 381 | 중립 (grep 검증 가능한 불변식 추가) | **Pass** — bare 형태 파손이 실측 재현·기록됨 | **Pass — 핵심 사유** | Accept |
| 382 | Pass (무음 격하 제거) | **Pass** — CC enum을 바이너리로 확정(`["low","medium","high","xhigh","max"]` 8회) | Pass (ADR 0010 동시 수정) | Accept |
| 383 | Pass (무음 공백 → 자동 경고) | Pass (체인 전 링크 확인). ⚠️ `CLAUDE_PLUGIN_DATA` 스코프는 **미검증** — 이를 전제로 설계 금지 | Pass (`worktree-detector.js:69-72` 메시지가 현재 오도) | Accept |
| 384 | 중립 | Pass — validate 통과, 훅 31=31, breaking 0 | Pass (README/CHANGELOG 동기화 필수) | Accept |
| 385 | 중립 | Pass (페이로드 직독) | **Pass** | Accept |

> **주의:** ENH-382의 No Guessing 판정은 Phase 2 시점에는 "조건부"였습니다.
> Phase 2 분석가는 Bash 미보유로 CC enum을 확인할 수 없어 bullet 텍스트에만 의존했고,
> 본 세션이 바이너리로 확정하여 게이트를 해소했습니다.

### 5.6 테스트 영향 (전체 스위트 = 347 파일)

- **v2.1.221 자체로 깨지는 테스트: 0건.** `RECOMMENDED_VERSION`을 단언하는 테스트가
  없고(레포 전체 6개 참조 전부 `lib/infra/cc-version-checker.js` 내부, `test/` 0건),
  CC 훅 이벤트 수를 단언하는 테스트도 없으며(31=31), bare `/btw` 해석에 의존하는
  테스트도 없습니다.
- **ENH-382 착수 시 설계상 깨지는 테스트 1건:**
  `tests/contract/v2114-e-defense-contract.test.js:60-67`(C-05)이
  `VALID_EFFORT_LEVELS`를 정확히 `['low','medium','high']` 3항목으로 고정하고
  frozen 여부까지 단언합니다. 이는 의도된 계약이므로 확장은 **수정이 아니라 계약
  개정**으로 다루어야 합니다.
- **기존 stale 픽스처 1건 발견:** `test/contract/l2-smoke.test.js:74-75`가
  `{"subagent_type":"cto-lead"}`를 핸들러에 주입하지만 CC가 보내는 필드는
  `agent_type`입니다(`scripts/subagent-start-handler.js:111`). 핸들러가 fail-open이라
  통과할 뿐, 실제 계약을 검증하지 못하고 있습니다.
- **신규 필요 테스트:** 워크트리 상태 공백(L2, ENH-383), 상이 `projectDir` 복구 스킵
  (`test/integration/session-restore.test.js` 확장), bare `/btw` grep 불변식(L1,
  ENH-381), effort enum 케이스(`tests/qa/v2114-invariant-10-effort-aware.test.js` 확장).

---

## §6. 상시 추적 항목

### 차별화 streak

세 이슈 모두 여전히 CLOSED/NOT_PLANNED이며 39개 bullet 중 해당 코드 수정 0건 →
**전부 +1 연장**.

| 이슈 | 상태 | 최종 갱신 |
|---|---|---|
| #58904 heredoc 파이프 우회 | closed/**not_planned** | 2026-07-06 |
| #56293 병렬 팀 캐시 회귀 | closed/**not_planned** | 2026-06-02 |
| #57317 플러그인 PostToolUse 훅 유실 | closed/**not_planned** | 2026-06-06 |

> **기록할 뉘앙스:** 221은 인접 Bash 권한 벡터(zsh `[[ ]]`)를 **수정했습니다**. 즉
> 우회 강화 영역은 활발히 작업되는 반면 bkit의 특정 벡터만 계속 미커버 상태입니다.
> 이는 해자를 약화시키는 게 아니라 강화하는 사실입니다.

### OPEN 이슈

| 이슈 | 상태 | 최종 갱신 | 비고 |
|---|---|---|---|
| #68110 재귀 무한 팬아웃 | open | 2026-07-21 | 중첩 depth 3 기본값의 근거이자 반증 |
| #78406 spawn cap env var 문서 누락 | open | 2026-07-17 | bkit은 공식문서 의존 불가 |
| #64436 백그라운드 OTEL 유실 | open | 2026-07-08 | bkit 자체 file-ledger로 우회 |

### 감시 항목

- **REMOTE-GATE-DRIFT (지속)** — 중첩 depth 기본값은 여전히
  `env var → tengu_hazel_trellis → 폴백 3` 경로입니다(221에서 리터럴 카운트 2=2,
  구조 동일). 릴리스 없이 서버측 변경 가능하므로 **버전 고정으로 방어 불가**하며,
  `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` 명시가 유일한 결정론적 통제입니다.
- **SUBAGENT-HOOK-CONTRACT (지속, 범위 확대)** — 필드 수가 7이 아니라 9임이 확정.
  depth/parent 부재로 트리 재구성 불가는 불변.
- **MCP 프로토콜 협상 (신규)** — `tengu_mcp_protocol_negotiation_stdio` 대비, bkit 두
  서버의 하드코딩 `2024-11-05`.
- **org-memory 클러스터 (신규)** — 게이트 4종, bullet 없음. 차별화 #1 인접.
- **CC 훅 커버리지** — CC 31개 중 bkit 22개 = **71%** (불변). 미등록 9:
  PostToolBatch, PermissionDenied, Setup, Elicitation, ElicitationResult,
  WorktreeCreate, WorktreeRemove, DirectoryAdded, MessageDisplay.

---

## §7. 결론

**bkit은 CC v2.1.221과 호환됩니다.**

- `claude plugin validate .` → 통과, 경고 0 (2.1.221에서 직접 실행)
- CC 훅 이벤트 집합 31 = 31, bkit 22개 등록 전부 유효
- 스킬 frontmatter `context:`/`background:` 파싱 불변 → 8개 fork 스킬 무영향
  (`/fork` 변경은 세션 레벨의 **다른** 메커니즘)
- 중첩 depth 통제 220과 동일 → v2.1.32의 ENH-372/373/374 작업은 계속 유효·충분
- 39 bullets 중 Breaking **0**
- npm 연속성 R-1·R-2 CLEAN

→ **연속 호환 164 릴리스** (v2.1.34 ~ v2.1.221).

**`RECOMMENDED_VERSION`을 2.1.220 → 2.1.221로 올릴 것을 권고합니다 (ENH-384).**
근거: (1) 221은 bkit 인접 버그(`btw` 부류)와 Bash 권한우회를 수정해 사용자에게
순증 이득, (2) 테스트 무영향(레포 내 상수 참조 6건 전부 구현 파일 내부, `test/` 0건),
(3) 220은 no-op 핫픽스였고 221이 실질 릴리스, (4) npm `stable`이 2.1.220,
`latest`/`next`가 2.1.221이므로 stable보다 한 단계 앞서는 기존 채택 방식과 일치.

두 가지 조건: README·CHANGELOG 문서 동기화를 함께 출하할 것(Docs=Code), 그리고
`lib/infra/cc-version-checker.js:49-58` 주석에 사유를 기록하되 **`btw` 수정은 사유가
아님**(bkit은 bare 형태에 의존하지 않음)을 명기하여 새 하한이 생기지 않음을 분명히 할 것.

### 가장 먼저 할 일 (ENH 아님)

1. **ENH 번호 SSoT를 원장으로 고정** — ERRATA-31-5 재발 방지. 메모리·보고서 문서가
   아니라 `CHANGELOG.md`가 유일 출처.
2. **미검증 3건 확인** — (a) 221 대화형 TUI에서 bare `/btw`의 실제 해석,
   (b) `CLAUDE_PLUGIN_DATA` 스코프, (c) 비대화형 백그라운드 세션에서
   `push-event-guard`의 `action === 'ask'` 경로 거동.

> 본 스킬은 **분석 전용**입니다. ENH-381~387은 제안이며 구현은 별도 PDCA 사이클의
> 몫입니다. 본 사이클에서 코드·버전 변경은 수행하지 않았습니다.

---

## 부록 A — 검증 커맨드 (재현용)

```bash
# Phase 1.5 이중 소스 (기계적 카운트 — WebFetch로 세지 말 것)
curl -sL https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md -o CHANGELOG.md
sed -n '3,44p' CHANGELOG.md > ch-221.txt
gh api repos/anthropics/claude-code/releases/tags/v2.1.221 --jq '.body' > gh-body-221.txt
grep -cE '^\s*[-*] ' ch-221.txt gh-body-221.txt          # 39, 39
comm -3 <(grep -E '^\s*[-*] ' ch-221.txt  | sed -E 's/^\s*[-*] //' | sort) \
        <(grep -E '^\s*[-*] ' gh-body-221.txt | sed -E 's/^\s*[-*] //' | sort)   # 빈 출력

# 카테고리 분포
for w in Added Fixed Improved Changed Reduced Removed; do
  printf "%-10s %s\n" "$w" "$(grep -cE "^\s*[-*] \[?[A-Za-z]*\]? ?$w " gh-body-221.txt)"
done

# 바이너리 정확 리터럴 카운트 (윈도우 diff 금지 — ERRATA-31-2)
cnt(){ perl -e '$s=shift;$f=shift;open(F,"<:raw",$f);local $/;$d=<F>;$c=0;$p=0;
  while(($p=index($d,$s,$p))>=0){$c++;$p++} print "$c\n";' "$1" "$2"; }
cd ~/.local/share/claude/versions
cnt 'create a new worktree of your own with' 2.1.220   # 0
cnt 'create a new worktree of your own with' 2.1.221   # 4
cnt '["low","medium","high","xhigh","max"]' 2.1.221     # 8
cnt 'tengu_hazel_trellis' 2.1.220; cnt 'tengu_hazel_trellis' 2.1.221   # 2, 2

# 피처게이트 집합 비교
for v in 2.1.220 2.1.221; do
  perl -ne 'while(/tengu_[a-z0-9_]+/g){print "$&\n"}' $v | sort -u > /tmp/gates-$v.txt
done
comm -23 /tmp/gates-2.1.220.txt /tmp/gates-2.1.221.txt   # 제거 28
comm -13 /tmp/gates-2.1.220.txt /tmp/gates-2.1.221.txt   # 추가 24

# CC 내장명령(local-jsx) 88개 추출 후 bkit 스킬명과 교집합
perl -e 'open(F,"<:raw",shift); local $/; $d=<F>; %n=(); $p=0;
  while(($p=index($d,"local-jsx",$p))>=0){ $s=$p-600; $s=0 if $s<0;
    $w=substr($d,$s,700); while($w=~/name:"([a-z0-9][a-z0-9:_-]{1,28})"/g){$n{$1}=1} $p++ }
  print join("\n", sort keys %n),"\n";' 2.1.221 > /tmp/cc-builtins.txt
comm -12 <(sort -u /tmp/cc-builtins.txt) \
         <(find skills -name SKILL.md -exec sh -c 'grep -m1 "^name:" "$1" | sed "s/^name: *//"' _ {} \; | sort)
# → btw

# 아키텍처 실측
ls -1 agents/*.md | wc -l                    # 34
find skills -name SKILL.md | wc -l           # 44
find lib -name '*.js' | wc -l                # 195
find scripts -name '*.js' | wc -l            # 66
find test tests -name '*.test.js' | wc -l    # 347  (test/ 와 tests/ 둘 다 존재)

# ENH 번호 SSoT (원장)
grep -oE 'ENH-3[0-9]{2}' CHANGELOG.md | sort -u -t- -k2 -n | tail -3   # ENH-378..380

# 상시 추적
for n in 68110 78406 64436 58904 56293 57317; do
  gh api repos/anthropics/claude-code/issues/$n \
    --jq '"#\(.number) \(.state)\(if .state_reason then "/"+.state_reason else "" end) \(.updated_at[0:10])"'
done

# npm 연속성 (R-1 정수 갭 워크)
npm view @anthropic-ai/claude-code time --json | python3 -c "
import json,sys; t=json.load(sys.stdin)
print([f'2.1.{i}' for i in range(210,222) if f'2.1.{i}' not in t] or 'no gaps')"
```
