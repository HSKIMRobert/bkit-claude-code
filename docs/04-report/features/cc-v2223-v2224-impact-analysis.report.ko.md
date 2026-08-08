# CC v2.1.223 → v2.1.224 영향 분석 보고서 (사이클 #33)

- **작성일**: 2026-08-07
- **범위**: CC CLI v2.1.223 → v2.1.224 (단일 버전, 31 bullets)
- **분석 성격**: 분석 전용 (analysis-only). 저장소 코드는 일절 수정하지 않음
- **선행 사이클**: [cc-v2222-v2223-impact-analysis.report.ko.md](./cc-v2222-v2223-impact-analysis.report.ko.md)
- **ENH 배정**: ENH-398 ~ ENH-409 (원장 최고 380 실측, 381~397 예약 존중)

---

## Executive Summary

v2.1.224는 bkit 런타임 계약을 하나도 깨지 않았다(**Breaking 0**, 연속 호환 **167**). 그러나 이번 사이클의 가치는 호환성 확인이 아니라 **bkit이 CC가 방금 고친 결함 클래스를 또다시 공유한다는 사실을 실행 증거로 확인한 것**이다. 사이클 #32에 이어 **2회 연속**이다.

CC v2.1.224의 두 bullet이 조사 방향을 지시했다.

- **bullet 13** — "같은 플러그인이 여러 프로젝트에 설치될 때 plugin install 레코드가 **조용히 손상**되던 문제"
- **bullet 10** — "sandbox filesystem deny 항목이 후행 슬래시로 작성되면 **조용히 우회 가능**하던 문제"

두 방향 모두에서 bkit이 동일 클래스의 결함을 갖고 있음이 **메인 세션 재현으로 확인**되었다. 특히 bullet 13 대응 결함은 이 머신의 디스크에서 **이미 발생한 피해**로 실증되었다 — 추정이 아니라 관측이다.

### 4-관점 가치 평가

| 관점 | 평가 | 근거 |
|---|---|---|
| **호환성** | ✅ 안전 | 31 bullets 중 hook payload 스키마·frontmatter·MCP 프로토콜·plugin manifest를 깨는 항목 0건. 마이그레이션 불요 |
| **보안/무결성** | 🔴 **자체 결함 노출** | G-1(백업 clobber, 실피해 관측) / G-2(경로 deny 무배선·정규화 누락) 모두 CRITICAL. 둘 다 **선행 결함**이며 224가 유발한 것이 아님 |
| **기회** | 🟡 제한적 | cross-session `SendMessage`/`ListAgents`는 실기회이나 L4와 상호작용 미검증. `archive` 소스는 YAGNI |
| **상류 신뢰** | 🔴 악화 | 감시 이슈 12건 중 **224가 해결한 것 0건**. PreToolUse 결함이 1건 → **3건 군집**으로 확대. 신규 기능 7건 중 **문서 반영 0건** |

### 이번 사이클 헤드라인 3줄

1. **bkit의 플러그인 데이터 백업이 프로젝트 간 서로를 덮어쓰고 있으며, 이 머신에서 이미 발생했다.** `~/.claude/plugins/data/bkit-bkit-marketplace/backup/meta.json`의 `projectDir`가 `tene-studio`로 찍혀 있다 — 그 슬롯을 쓰던 다른 프로젝트의 백업은 영구 소실됐고, 복원 시 사용자는 "다른 프로젝트 백업이라 건너뜀"이라는 **원인을 오도하는 메시지**만 받는다.
2. **bkit에는 Write/Edit에 대해 경로 기반 거부를 실제로 집행하는 코드 경로가 없다.** scope 판정이 `outputAllow`로 나가고(`pre-write.js:393`), Bash 경로의 scope 블록은 **완전한 dead code**(`unified-bash-pre.js:454-461`)다. 사이클 #32 F-1과 동일 클래스의 3번째 인스턴스.
3. **CC 문서가 224가 제거한 기능을 여전히 광고한다.** `sub-agents.md:898`은 "at most 200 subagents … **the limit can't be turned off**"이라 쓰지만, 224 바이너리는 카운팅 기계를 전부 삭제했고 `CLAUDE_CODE_MAX_SUBAGENTS_PER_SESSION`은 **알로우리스트에만 남은 좀비 env var**다.

---

## §1. 버전 범위 및 조사 방법

### 1.1 3중 소스

| 소스 | 값 | 취득 방법 |
|---|---|---|
| raw CHANGELOG.md | v2.1.224 섹션 = **31 bullets** | `curl -sL raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md` + `perl` 기계 추출 |
| GitHub release tag | 동일 31 bullets, `published_at` 2026-08-07T04:00:59Z | `gh api repos/anthropics/claude-code/releases/tags/v2.1.224` |
| npm registry | `latest`=`next`=2.1.224, `stable`=**2.1.220** | `npm view @anthropic-ai/claude-code dist-tags --json` |
| 로컬 바이너리 | 2.1.222 / 2.1.223 / **2.1.224** 동시 보유 → 직접 diff 가능 | `ls ~/.local/share/claude/versions/` |

**대칭차집합 = 0** (raw CHANGELOG ↔ GH release body 완전 동일). ERRATA-30-1 기준 충족.

### 1.2 npm 연속성

| 항목 | 값 |
|---|---|
| 게시 간격 | 220→221 **239.08h(9.96일 동결)** · 221→222 22.35h · 222→223 26.23h · **223→224 26.76h** |
| npm 게시 | 2026-08-07T01:36:32.682Z (GitHub release보다 **2h24m 선행**) |
| R-1 (무음 publish) | **음성** — 태그와 npm `time` 1:1 일치. 단 224는 일시적 선행 창 존재, 현재 해소 |
| R-2 (semver skip) | **음성** — v2.1.215~224 연속, 결번 없음 |
| stable drift | `stable`=2.1.220, `latest`=2.1.224 → **스프레드 4** |

**`stable`이 2.1.220에 4버전째 고정된 것의 해석**: 2.1.220은 9.96일 게시 동결 **직전의 마지막 릴리스**다. 동결 해제 후 221~224가 하루 간격으로 쏟아졌으나 `stable`은 움직이지 않았다. 즉 2.1.220은 **"동결 전 known-good 앵커"로 의도적으로 붙들려 있는 것**으로 읽힌다. 정황 증거: 221 회귀(#84521 Windows ECONNRESET), 222 회귀(#84182·#84530·#84452 worktree) 신고가 다수 OPEN이다.

---

## §2. 변경 카탈로그

### 2.1 카테고리 분포 (31 bullets)

| 카테고리 | 수 | 비고 |
|---|---|---|
| Added | 7 | self-hosted-runner, archive 소스, paste confirm, Bedrock region prefix, crossSessionInbound/dialogExpiry, sandbox credential-masking, cross-session SendMessage |
| Fixed | 15 | 그중 Remote Control 계열 5건, sandbox 2건, plugin 1건, 세션 경로 1건 |
| Improved | 3 | fullscreen scrollback, Remote Control 2건 |
| Removed | 1 | **200-subagent-per-session spawn cap** |
| Changed | 5 | managed settings, feedback-survey 업로드 확대, Bash description, paste renumber, Remote Control archive |
| `[VSCode]` 태그 | 2 | 위 분류에 포함. **연속 배치가 아님**(ERRATA-33-1) |

> **구조 주의 (ERRATA-33-1)**: v2.1.224 CHANGELOG 섹션에는 `### Added`/`### Fixed` 같은 **하위 제목이 존재하지 않는다.** 평문 bullet 리스트 하나이며, 위 분류는 각 bullet의 **첫 단어(동사)에서 파생**한 것이다. "CHANGELOG의 Added 절에 따르면"이라고 서술하면 구조 날조가 된다.

### 2.2 bkit 교차 항목 (9건)

| # | bullet | bkit 접점 | 판정 |
|---|---|---|---|
| 13 | plugin install 레코드 프로젝트 간 무음 손상 | `lib/core/paths.js` 백업 레이어 | 🔴 **동일 클래스 자체 결함 (G-1)** |
| 10 | sandbox deny 후행 슬래시 무음 우회 | `lib/control/scope-limiter.js`, `scripts/pre-write.js` | 🔴 **동일 클래스 자체 결함 (G-2)** |
| R1 | 200-subagent spawn cap 제거 | `lib/core/constants.js:52` MAX_TEAMMATES=10 | 🟡 roster 오버플로 노출 (G-5) |
| 5·7 | crossSessionInbound / cross-session SendMessage·ListAgents | L4 Full-Auto, `lib/orchestrator/team-protocol.js` | 🟡 기회 + 미검증 리스크 |
| 12 | mid-turn MCP tools 이름 announce | `servers/bkit-*-server/index.js` | 🟢 자동 이득 |
| 8 | 200자 초과 경로 세션 디렉터리 교차 | `.bkit/**` 경로 길이 | 🟢 무영향(실측 최장 175자) |
| 11 | sandbox violation 상세가 Bash 결과 노출 | `lib/core/io.js` 훅 출력 프로토콜 | 🟢 레이어 상이, 충돌 없음 |
| 2 | archive plugin source + SHA-256 pinning | `.claude-plugin/marketplace.json` | ⚪ YAGNI (DROP) |
| C(survey) | feedback-survey가 system prompt+tool 정의 업로드 | `PRIVACY.md` | 🟡 고지 필요 |

### 2.3 무영향 / 직교 (22건)

Remote Control 계열 8건, paste 계열 3건, Wayland 클립보드, feedback survey 전송 실패, VSCode 2건, managed settings, Bedrock region prefix, self-hosted-runner, fullscreen scrollback 등. bkit은 CLI·훅 레이어에서만 동작하므로 원격/TUI/IDE 표면과 교차하지 않는다.

### 2.4 문서화되지 않은 서브시스템 작업 (바이너리 전용)

| 관측 | 223 → 224 | 소속 |
|---|---|---|
| `fail-open` 리터럴 | 7 → 13 | **전부 sandbox credential-masking** (bullet 6 소속, 별건 아님) |
| 훅 인접 `SIGKILL` | 0 → 5 | **전부 self-hosted-runner** (checkout/post-session/spawn-runner 훅) |
| `hookTimeout` | 0 → 7 | **전부 self-hosted-runner** CLI 플래그 |
| `self-hosted-runner` | 0 → 64 | 신규 대형 서브시스템 |
| 피처게이트 unique `tengu_*` | **1770 → 1801 (+31)** | 혼합 |
| `per-session` | 15 → 30 | 혼합 |

> **ERRATA-33-4 (신규, 프로세스)**: 224의 문자열 델타 상당수가 **self-hosted-runner라는 신규 대형 서브시스템에 흡수**된다. 본 분석에서 `fail-open` 증가와 훅 인접 `SIGKILL` 출현을 각각 "미문서화 훅 신뢰성 작업"으로 추정했다가 **컨텍스트 추출 후 둘 다 철회**했다. 델타 기반 추론은 반드시 **소속(neighborhood) 확인 후에만** 채택할 것.

---

## §3.0 원본 검증 게이트 (Phase 1.5 — MANDATORY)

### 3.0.1 검증 표

| 필드 | 에이전트 보고 | raw 검증 | 출처 | 판정 |
|---|---|---|---|---|
| Added | 7 | 7 | raw CHANGELOG (동사 파생) | ✅ match |
| Fixed | 15 | 15 | raw CHANGELOG | ✅ match |
| Improved | 3 | 3 | raw CHANGELOG | ✅ match |
| Removed | 1 | 1 | raw CHANGELOG | ✅ match |
| Changed | 5 | 5 | raw CHANGELOG | ✅ match |
| **Total bullets** | **31** | **31** | 합 + `wc -l` | ✅ match |
| raw ↔ GH release | — | 대칭차집합 **0** | `diff <(sort raw) <(sort gh)` | ✅ match |

메인 세션이 bullet 총계를 **먼저** 확정한 뒤 조사 에이전트에게 전제로 제공했으므로, 이번 사이클에서는 카운트 관련 errata가 발생하지 않았다.

### 3.0.2 ERRATA-33-1 (신규) — CHANGELOG에는 하위 제목이 없다

v2.1.224 섹션은 `## 2.1.224` 아래 **평문 bullet 리스트 하나**이며 `### Added`/`### Fixed`가 없다. 카테고리는 첫 단어에서 파생된 것이다. 또한 `[VSCode]` 2건은 **연속되어 있지 않고**, 두 항목 사이에 태그 없는 bullet이 끼어 있다 → "끝에서 2개 잘라내면 VSCode 항목"이라는 처리는 오작동한다.

### 3.0.3 ERRATA-33-2 (신규, HIGH) — `gh issue list --limit`가 무음 절단한다

실측:

```
gh api -X GET search/issues -f q='repo:anthropics/claude-code created:2026-08-05..2026-08-08' -f per_page=1 --jq '.total_count'
→ 727

gh issue list --repo anthropics/claude-code --limit 300 --search 'created:2026-08-05..2026-08-08' --json number | (길이)
→ 300
```

**경고 없이 300에서 잘린다.** 창 총계는 반드시 `search/issues`의 `total_count` 또는 `--paginate`로 구할 것. 사이클 #32의 "창 내 총 이슈 997건"도 같은 방식으로 산출됐을 수 있어 **재검증 대상**으로 표시한다.

### 3.0.4 ERRATA-33-3 (신규) — `gh search issues`는 미인용 토큰을 AND 결합한다

`subagent spawn limit` 검색이 0건인데도 **#78406이 정확히 그 주제**다. 다단어 쿼리의 0건은 **부재 증명이 아니다**. 부재를 주장하려면 단일 토큰 또는 인용 구문으로 재검색할 것.

### 3.0.5 ERRATA-33-4 (신규, 프로세스) — 델타 추론 전 소속 확인

§2.4 참조. 신규 대형 서브시스템이 들어온 릴리스에서는 문자열 카운트 델타가 그쪽으로 흡수되므로, **증감만 보고 결론내지 말 것**.

### 3.0.6 ERRATA-33-5 (신규, HIGH) — 서브에이전트 CRITICAL 주장에 자동화 레벨 맥락이 누락됐다

bkit-impact-analyst는 §C-4에서 `src/.env` → `allowed:true`를 **"가장 단순한 실증 입력, 우회 기교 불필요"**로 제시하며 자동화 레벨을 명시하지 않았다. 메인 세션 재현 결과:

```
=== L0 ===                                  === L4 ===
src/.env            allowed=false            src/.env            allowed=true
src/config/.env.production  false            src/config/.env.production  true
src/server.key      false                    src/server.key      true
lib/keys/private.pem false                   lib/keys/private.pem true
src/.ENV            false                    src/.ENV            true
src//../.env        false                    src//../.env        true
src/../.git/config  false                    src/../.git/config  true
docs/../.env        **true**                 docs/../.env        **true**
.env                false (DENIED_PATH)      .env                false (DENIED_PATH)
```

**L0에서는 allowlist(`NOT_IN_SCOPE`)가 대부분을 우연히 막는다.** 에이전트가 "L0에서도 뚫린다"고 든 근거 중 실제로 L0에서 뚫리는 것은 **`docs/../.env` 단 하나**다. 결함 자체는 실재하나 **서술이 과장**됐다. 향후 스코프/권한 관련 주장에는 **자동화 레벨을 반드시 명시**할 것. (결함 재서술은 §4.1 참조 — CRITICAL 판정은 유지된다.)

### 3.0.7 ERRATA-33-6 (신규) — CHANGELOG 문구가 구현을 의역한다

bullet: *"Changed the Bash tool description to always note that command output is displayed **to the model**, not reliably to the user"*

실측: 해당 문장은 223·224 **바이트 동일**이며 원문은 `to the model`이 아니라 **`to you`**다.

```
2.1.223: "Command output is displayed to you, not reliably to the user."  (3회, 삼항 분기 내)
2.1.224: "Command output is displayed to you, not reliably to the user."  (2회, 무조건)
```

즉 변경 실체는 **문구 수정이 아니라 조건부 삽입 → 무조건 삽입(게이팅 제거)**이다. CHANGELOG의 "Changed the … description"은 오해를 부른다. 관측 사실로만 기록한다.

---

## §4. bkit 영향 분석

### 4.1 G-2 — 경로 기반 deny가 실제로 아무것도 차단하지 않는다 (**CRITICAL, 재현 완료**)

CC bullet 10은 "deny 항목이 후행 슬래시면 조용히 우회 가능"을 고쳤다. bkit을 실측한 결과 후행 슬래시는 **문제의 일부일 뿐**이었다.

#### (a) 판정이 `outputAllow`로 나간다 — 차단 배선 없음

`scripts/pre-write.js` (메인 세션 직접 확인):

```
336:     outputEmpty();
350:     outputBlock(perm.denyReason);
351:     process.exit(2);
393:     outputAllow(contextParts.join(' | '), 'PreToolUse');
```

`outputBlock` + `exit(2)`는 **오직 350–351행**, Permission Manager deny 경로에만 존재한다. scope 판정(`:376`)과 destructive 판정(`:372`)은 `contextParts`에 **조언 텍스트로 push**된 뒤 393행에서 **allow와 함께** 방출된다. 사이클 #32 F-1(`unified-bash-pre.js` destructive 차단배선 누락)과 **동일 클래스의 3번째 인스턴스**다.

#### (b) Bash 경로의 scope 블록은 완전한 dead code

`scripts/unified-bash-pre.js:451-461` (메인 세션 직접 확인):

```js
// ============================================================
// v2.0.0: Scope Limiter (Control Module)
// ============================================================
if (!blocked) {
  try {
    const sl = require('../lib/control/scope-limiter');
    const ac = require('../lib/control/automation-controller');
    const level = ac.getCurrentLevel();
    // Scope check available for path-targeting commands
  } catch (_) {}
}
```

`sl`과 `level`은 할당된 뒤 **이후 어디에서도 참조되지 않는다.** 주석이 "Scope check available"이라 적혀 있어 코드를 읽는 사람에게 방어가 있다는 인상을 준다.

#### (c) 정규화 누락 — `docs/../.env`가 **L0에서도** 통과

`lib/control/scope-limiter.js`는 `:151`에서 `path.resolve()` 결과를 계산하지만 루트 이탈 검사에만 쓰고, `:168`에서 **원문(`filePath`)으로부터 매칭 문자열을 다시 파생**한다. 그 결과 `..`·`./`·`//`·후행 슬래시가 정규화되지 않는다.

재현(메인 세션):

```
L0: {"input":"docs/../.env","allowed":true,"rule":null}
L4: {"input":"docs/../.env","allowed":true,"rule":null}
```

`docs/`가 allowlist에 있으므로 접두사 매칭이 성립하고, 실제 대상이 루트 `.env`라는 사실은 검사되지 않는다. **최엄격 레벨에서도 뚫린다.**

기존 테스트가 놓친 이유: `test/security/path-traversal.test.js:43,75`는 `docs/../../.env`(2단계 상승, 루트 **밖**)만 검증한다. 이건 `PATH_TRAVERSAL`로 잡힌다. **루트 안으로 되돌아오는 1단계 `docs/../.env`는 미검증**이다.

#### (d) deny 패턴이 루트 앵커라 서브디렉터리를 못 덮는다 — **L4 한정**

`DEFAULT_SCOPE.deniedPaths`의 `.env*`, `*.key`, `*.pem`은 `_globMatch`에서 `[^/]*`로 컴파일되어 슬래시를 넘지 못한다.

```
L4: src/.env → allowed=true    |  루트 .env → allowed=false (DENIED_PATH)
L4: lib/keys/private.pem → true |  루트 private.pem → false (DENIED_PATH)
```

**L0~L3에서는 allowlist가 좁아 `NOT_IN_SCOPE`로 우연히 막힌다**(ERRATA-33-5). 그러나 **L4에서는 allowlist가 사실상 전면 허용이므로 deny 패턴이 유일한 방어**이고, 그 deny가 루트 앵커라 서브디렉터리의 모든 비밀 파일이 통과한다. bkit이 L4를 "Full-Auto"로 광고하는 만큼 이 레벨의 방어 공백은 실질적이다.

#### (e) Permission Manager는 대타가 될 수 없다

`lib/permission-manager.js`의 `DEFAULT_PERMISSIONS`는 `Write: 'allow'`, `Edit: 'allow'`이며 `.env`/`.pem`/`.key`/`secrets` 경로 로직이 **0건**이다. `context-hierarchy.js`가 제거된 뒤 `checkPermission`은 항상 이 테이블로 폴백한다.

#### (f) 감사 원장이 또 오염된다

`scripts/pre-write.js:216-236`이 `action:'destructive_blocked'`, `result:'blocked'`를 **하드코딩**한다. 실제로는 허용된 작업이다. 사이클 #32 F-5(감사 하드코딩)가 Bash 경로뿐 아니라 **Write 경로에도 동일하게 존재**함이 확인됐다.

#### (g) 테스트가 위양성 안전감을 준다

`test/security/scope-limiter.test.js` SL-015는 `certs/private.pem`이 L4에서 `allowed===false`임을 단언한다. 그러나 실제 반환은 `rule:"NOT_IN_SCOPE"` — `*.pem` deny가 **작동해서**가 아니라 allowlist에 없어서 false다. 테스트가 `rule`을 검사하지 않으므로 **`*.pem` deny가 완전히 깨져도 스위트는 green**이다.

> **판정: CRITICAL.** 단 §3.0.6에 따라 정확히 서술하면 — *"L4에서는 서브디렉터리 비밀 파일이 전면 통과하며, 모든 레벨에서 allowlist 접두사를 이용한 1단계 traversal(`docs/../.env`)이 통과한다. 그리고 어떤 레벨에서도 scope 판정은 애초에 차단으로 배선되어 있지 않다."*

### 4.2 G-1 — 플러그인 데이터 백업이 프로젝트 간 서로를 덮어쓴다 (**CRITICAL, 실피해 관측**)

CC bullet 13은 "같은 플러그인이 여러 프로젝트에 설치될 때 install 레코드가 조용히 손상"을 고쳤다. bkit은 **자기 백업 레이어에서 정확히 같은 결함**을 갖는다.

#### (a) 경로에 프로젝트 세그먼트가 없다

`lib/core/paths.js:31-36` (메인 세션 직접 확인):

```js
// v1.6.2: ${CLAUDE_PLUGIN_DATA} persistent backup (ENH-119)
pluginData: () => process.env.CLAUDE_PLUGIN_DATA || null,
pluginDataBackup: () => {
  const pd = process.env.CLAUDE_PLUGIN_DATA;
  return pd ? path.join(pd, 'backup') : null;
},
```

백업 파일명도 고정이다(`pdca-status.backup.json`, `memory.backup.json`). 즉 **동일 플러그인 설치를 쓰는 모든 프로젝트가 하나의 슬롯을 공유**한다.

#### (b) 이 머신에서 이미 발생했다 — 관측 증거

분석 에이전트는 `CLAUDE_PLUGIN_DATA`의 런타임 값을 관측하지 못해 이 항목을 "미검증 1순위"로 남겼다. 메인 세션이 디스크에서 직접 확인했다:

```
/Users/kaykim/.claude/plugins/data/bkit-bkit-marketplace/backup/meta.json
{ "projectDir": "/Users/kaykim/Documents/GitHub/agent-kay-it/tene-studio",
  "timestamp": "2026-08-07T02:50:37.871Z", "bkitVersion": "2.1.32" }

/Users/kaykim/.claude/plugins/data/bkit-inline/backup/meta.json
{ "projectDir": "/Users/kaykim/Documents/GitHub/agent-kay-it/bkit-claude-code",
  "timestamp": "2026-08-07T04:40:07.952Z", "bkitVersion": "2.1.32" }
```

- 네임스페이싱은 **플러그인 설치 식별자별**(`bkit-bkit-marketplace` / `bkit-inline`)이고 **프로젝트별이 아니다**.
- `bkit-bkit-marketplace` 슬롯은 오늘 **tene-studio**가 점유했다. 그 슬롯을 쓰던 다른 프로젝트의 백업은 **이미 소실**됐다.
- `pdca-status.backup.json` 크기가 6,924 bytes vs 29,235 bytes로 서로 다른 프로젝트 상태임이 확인된다.

#### (c) 가드는 잘못된 복원만 막고, 덮어쓰기는 막지 못한다

`restoreFromPluginData()`(`:292-317`)는 `meta.projectDir`가 현재 프로젝트와 다르면 복원을 건너뛴다(#48, v2.0.1). 이 가드는 **오염 전파는 막지만 데이터 소실은 막지 못한다.** 게다가 사용자가 받는 메시지는:

```
skipped: ["backup belongs to different project: /Users/.../tene-studio"]
```

진실은 *"당신의 백업은 다른 프로젝트에 의해 덮어써졌다"*인데, 메시지는 *"이 백업은 원래 남의 것"*이라고 말한다 → **원인 오도**.

`backupToPluginData()`는 `lib/pdca/status-core.js`에서 **모든 `savePdcaStatus()`·메모리 저장마다 자동 호출**되므로, 두 프로젝트를 병행하는 순간 상시 발생한다.

#### (d) ENH-383 산식은 재산정이 필요하다

ENH-383(미출하, `perl` 실측 CHANGELOG 0건)은 fork/worktree "state void"를 **가드 거부**로 모델링한다. 실제 원인은 둘이며 **동일한 메시지를 낸다**:

| 원인 | 사용자에게 보이는 메시지 | ENH-383 현재 모델 |
|---|---|---|
| 워크트리라서 realpath 불일치 | `backup belongs to different project` | ✅ 커버 |
| **다른 프로젝트가 백업을 덮어씀** | `backup belongs to different project` (동일!) | ❌ 미커버 |

detector를 그대로 구현하면 **오귀인**한다.

> **판정: CRITICAL** (분석 에이전트의 HIGH에서 상향). 상향 근거: 추정이 아니라 **이 머신에서 이미 발생한 데이터 소실**이 관측됐고, 트리거가 "두 프로젝트에서 bkit 사용"이라는 일상적 조건이다.

### 4.3 G-5 — spawn cap 제거는 기회가 아니라 roster 오버플로 노출

CC가 200-subagent 캡을 제거했다. bkit은 이 캡에 의존하지 않았으므로(부재 증명: `totalSpawned|spawnedCount|MAX_AGENTS|MAX_SPAWN|spawnCount` 등이 `lib/`·`scripts/`에서 0건) 직접 영향은 없다. 차별화 #3(Sequential Dispatch)도 `sub-agent-dispatcher.js`가 개수 상한 없이 **전략만 반환**하므로 count-agnostic이며 **스트릭 무영향**이다.

실제 노출은 다른 곳이다:

- `MAX_TEAMMATES = 10` (`lib/core/constants.js:52`, 집행 `lib/team/state-writer.js:259-268`)
- `removeTeammate`는 **프로덕션 호출 0건** — roster는 `cleanupAgentState()`(Stop)까지 **단조 증가**
- `agents/cto-lead.md`는 **18개** `Task()` 타겟을 선언

cap 제거 + v2.1.219 depth-3 기본값이면 한 턴에 10개 초과 spawn이 현실적이다. spawn 자체는 성공하고 **bkit이 기록만 놓친다**(`droppedTeammates` 증가) → 대시보드·팀 상태가 실제와 괴리된다. 차단은 아니므로 **P2**.

### 4.4 CC 측 결함: 좀비 env var와 문서-구현 능동 모순

메인 세션 바이너리 실측(223 vs 224 정확 문자열 카운트):

| 심볼 | 223 | 224 | 의미 |
|---|---|---|---|
| `spawn limit` | 4 | **0** | 에러 메시지 삭제 |
| `getTotalAgentSpawns` | 7 | **0** | 카운터 조회 삭제 |
| `incrementTotalAgentSpawns` | 8 | **0** | 카운터 증가 삭제 |
| `subagent_count_cap` | 2 | **0** | 텔레메트리 이벤트 삭제 |
| `forked_skill_spawn_cap` | 3 | **0** | 삭제 |
| `forked_skill_depth_chain_cap` | 3 | **0** | 삭제 |
| `forked_skill_depth_cap` | 2 | **2** | **depth 제한은 존치** (CHANGELOG 주장과 일치) |
| `CLAUDE_CODE_MAX_SUBAGENTS_PER_SESSION` | 8 | **3** | **잔존 3건은 전부 env var 알로우리스트** |

잔존 3건의 컨텍스트를 추출한 결과, 전부 `["CLAUDE_CODE_MAX_RETRIES","CLAUDE_CODE_MAX_SUBAGENTS_PER_SESSION","CLAUDE_CODE_MAX_TOOL_USE_CONCURRENCY",…]` 형태의 **인정 env var 목록**이며 이를 소비하는 로직은 0건이다.

→ **좀비 env var**: 사용자가 설정해도 아무 효과가 없고, CC는 "알려진 설정"으로 조용히 받아들이며 경고하지 않는다.

그리고 상류 문서는 제거된 기능을 **여전히 광고**한다 (`curl -sL code.claude.com/docs/en/sub-agents.md`):

```
898: By default, Claude can spawn at most 200 subagents per session. To raise the limit,
     set `CLAUDE_CODE_MAX_SUBAGENTS_PER_SESSION` to any positive whole number;
     there is no upper bound, but the limit can't be turned off. Requires v2.1.212 or later.
902: When Claude reaches the limit, the Agent tool fails with `Subagent spawn limit reached`…
```

문서는 "**끌 수 없다**"고까지 단언하는데 224는 그 기계를 통째로 삭제했다. 추적 중이던 **#78406(spawn cap env var 문서 누락)의 성격이 바뀐다** — 이제는 누락이 아니라 **stale 문서가 없는 기능을 지시하는 능동적 모순**이다.

### 4.5 상류 이슈: PreToolUse 결함이 3건 군집으로 확대

**v2.1.224가 해결한 bkit 감시 이슈는 12건 중 0건이다.**

| # | 제목(요약) | 상태 | 224 해결? |
|---|---|---|---|
| **84302** | PreToolUse command 훅 kill 시 CLI가 fail-open ALLOW | OPEN | ❌ |
| **84701** | PreToolUse **deny 판정이 Task 서브에이전트 Bash에 미적용** | OPEN (신규) | ❌ |
| **84632** | **`if` 스코프 훅이 무조건 발화하고 차단은 안 함**, stale "blocked"를 한 턴 늦게 보고 | OPEN (신규) | ❌ |
| 84656 | `[DOCS]` PreToolUse 훅 timeout/spawn-failure 결과 미기재 | OPEN (신규) | ❌ |
| 84258 / 83953 / 84027 / 84452 | worktree 계열 4건 | OPEN | ❌ |
| 84217 / 84439 / 79560 / 83848 / 68110 / 78406 / 64436 | 기존 감시 | OPEN | ❌ |
| 84135 | worktree env-var 보간 Bash 거부 | CLOSED / **NOT_PLANNED** | ❌ **수정 아님** — 트리아지 타임아웃으로 신고자 자가 종결, 내용은 **#84452로 OPEN 생존** |

**#84632는 bkit에 직접 닿는다.** 메인 세션 재현:

```
$ perl -ne 'print "$.: $_" if /"if"\s*:/' hooks/hooks.json
30:             "if": "Write(skills/**/SKILL.md)"
286:            "if": "Write|Edit(docs/**/*.md)",
```

bkit은 `if` 스코프 훅을 정확히 **2개** 사용한다. 상류 버그가 사실이면 이 두 훅은 스코프 밖에서도 발화하고, 차단은 하지 않으며, 한 턴 늦은 "blocked"를 보고한다.

또한 `hooks.md`에는 **PreToolUse command 훅이 timeout에 도달했을 때 툴이 차단되는지 허용되는지에 대한 서술 자체가 없다.** 명시된 것은 Agent SDK 콜백 훅 경로뿐(`:1473`)이고, 대조군인 `UserPromptSubmit`은 동등 서술이 존재한다(`:1229`). → **PreToolUse를 보안 게이트로 쓰는 모든 구성(= bkit 방어 전량)에서 훅이 멈추거나 죽었을 때의 거동이 문서상 미정의**다.

### 4.6 CC 훅 이벤트 커버리지 (불변)

- CC 훅 이벤트 **31개** (문서 3중 교차검증), bkit 등록 **22개** → **70.97% 불변**
- 미등록 9종: WorktreeCreate, WorktreeRemove, PostToolBatch, PermissionDenied, Setup, Elicitation, ElicitationResult, DirectoryAdded, MessageDisplay — 전부 문서상 실재
- `BackgroundTaskProgress`는 223·224 바이너리에서 **0회**, 문서에서도 0회 → **여전히 존재하지 않음**(과거 분석의 날조 재확인)
- 바이너리 스팟체크 25종 중 `PostToolUse` 41→42, `SessionStart` 25→26만 미세 증가 → **신규 이벤트 아님**

### 4.7 RECOMMENDED_VERSION — 두 에이전트가 상충, 메인 세션 판정: **보류**

| 주체 | 권고 | 근거 |
|---|---|---|
| cc-version-researcher | **보류** | `RECOMMENDED_VERSION='2.1.220'` = npm `stable` → **drift 0**. 상향하면 상류 stable을 앞지름 |
| bkit-impact-analyst | 2.1.224로 상향 | bullet 10·13이 방어/무결성 개선이고 통합 표면 회귀 없음 |

**메인 세션 판정: 보류(조사 측 채택).** 근거:

1. npm `stable`이 2.1.220에 **4버전째 고정**이며, 이는 9.96일 동결 직전의 known-good 앵커로 읽힌다.
2. 221·222 회귀 신고가 다수 **OPEN**이다(#84521, #84182, #84530, #84452).
3. 224가 bkit 감시 이슈를 **0건** 해결했다.
4. bkit 방어 전량이 PreToolUse에 있는데 **#84302·#84701·#84632 3건군이 전부 OPEN**이다.

→ 사이클 #32의 **ENH-395(2.1.223 상향)도 함께 보류**를 권고한다. bkit의 보수적 권장이 상류 stable과 정확히 일치하는 현 상태는 우연이 아니라 올바른 정렬이다.

---

## §5. ENH 로드맵 (Phase 3 브레인스토밍)

### 5.1 Intent Discovery

- **이번 업그레이드에서 bkit이 얻을 최대 가치는?** 신기능 채택이 아니라 **CC가 고친 결함 클래스를 거울삼아 자기 결함을 찾는 것**이다. 2사이클 연속으로 이 방법이 CRITICAL을 산출했다.
- **놓치면 안 되는 critical change는?** 없다(Breaking 0). 대신 **놓치면 안 되는 자체 결함이 2건**이다.
- **기존 workaround를 대체할 native 기능은?** cross-session `SendMessage`/`ListAgents`가 Agent Teams 메시지 버스를 대체할 수 있으나, L4 상호작용이 미검증이라 이번 사이클에서는 채택하지 않는다.

### 5.2 ENH 번호 배정

- 원장(CHANGELOG.md) 최고 = **380** (`perl` 실측, 고유 104개)
- #31 제안 ENH-381~387, #32 제안 ENH-388~397은 **출시 0건이나 예약 유지**
- **#33은 398부터 배정**

### 5.3 YAGNI 검토

| ENH | 지금 필요한가? | 안 하면? | 판정 |
|---|---|---|---|
| 398~401 (경로 deny) | ✅ | L4에서 비밀 파일 무방비, 감사 원장 오염 지속 | **통과** |
| 402~403 (백업 clobber) | ✅ | 이미 발생 중인 데이터 소실 지속 | **통과** |
| 404 (PRIVACY.md) | ✅ | 문서가 **현재 사실과 다름** | **통과** |
| 405 (roster) | 🟡 | 대시보드 부정확 (기능 손상 아님) | P2 강등 |
| 406 (config 캐시 키) | 🟡 | 현재 무해(1훅=1프로세스), 장기 실행 시 실결함 | P2 강등 |
| 407 (`servers/` 표기) | 🟡 | Docs=Code 드리프트 | P2 |
| 408 (cross-session) | ❌ | CC 동작 미검증, L4 무인성 훼손 위험 | **P3 Deferred** |
| 409 (archive 소스) | ❌ | git 채널 정상 작동 중 | **DROP** |

### 5.4 우선순위 배정

| ENH | 우선 | 제목 | 영향 파일 | 테스트 영향 |
|---|---|---|---|---|
| **398** | **P0** | pre-write의 scope/destructive 판정을 실제 차단으로 배선 + 감사 `result` 하드코딩 제거 | `scripts/pre-write.js:216-236, 372-376, 392-393` | 신규 integration: deny 판정 → `decision:'block'` 단언 |
| **399** | **P0** | `checkPathScope`가 `resolved` 기반으로 매칭 (`..`·`./`·`//`·후행 슬래시·대소문자) | `lib/control/scope-limiter.js:151, 168, 89-97` | 신규 security TC: **`docs/../.env` L0/L4**, `src//../.env` |
| **400** | **P0** | deny 패턴 서브디렉터리 커버리지(`**/.env*`, `**/*.key`, `**/*.pem`) + 케이스 무시 | `lib/control/scope-limiter.js:20` | **`src/.env`(L4)**, `lib/keys/private.pem`, `src/.ENV` 회귀 TC |
| **401** | **P1** | evasion 테스트 스위트 신설 + **모든 deny TC에 `rule` 필드 단언 추가** | `test/security/scope-limiter.test.js`, `path-traversal.test.js` | 기존 SL-014/015 수정(현재 위양성) |
| **402** | **P0** | `${CLAUDE_PLUGIN_DATA}/backup`을 프로젝트별 네임스페이싱 + clobber 감지 | `lib/core/paths.js:31-36, 223-279, 286-349` | 2프로젝트 교차 백업 시나리오 |
| **403** | **P1** | ENH-383 산식 재산정 — "가드 거부" vs "백업 덮어씀"을 구분해 사유 문자열 분기 | `lib/core/paths.js:312-317`, `lib/core/worktree-detector.js` | 두 사유 구분 단언 |
| **404** | **P1** | `PRIVACY.md` 갱신 — (a) opt-in OTLP 네트워크 전송 명시, (b) CC feedback-survey 동의 시 CLAUDE.md·스킬·에이전트·MCP tool 정의 업로드 고지 | `PRIVACY.md:19, 36-37, 54` | docs-code 정합 스캔 |
| **405** | **P2** | MAX_TEAMMATES 오버플로 가시화 또는 완료 teammate 프루닝 | `lib/core/constants.js:52`, `lib/team/state-writer.js:259-268` | 11번째 spawn TC |
| **406** | **P2** | `lib/core/config.js` 캐시 키를 `PROJECT_DIR`로 스코프 | `lib/core/config.js` | 캐시 격리 unit TC |
| **407** | **P2** | Docs=Code: `mcp-servers/` → `servers/` 표기 정정, 19 tools 수치 검증 자동화 | 에이전트 정의·docs | `scripts/validate-plugin.js` 경로 단언 |
| **408** | **P3 Deferred** | cross-session `SendMessage`/`ListAgents` 도입 + bypassPermissions 승인 보류를 5번째 auto-pause 트리거로 | `lib/orchestrator/team-protocol.js` | 도입 시 신규 |
| **409** | **DROP** | `archive` plugin source + SHA-256 pinning | — | — |

> **ENH-398·399·400은 동일 결함군이므로 한 PR로 묶을 것.** 부분 수정 시 우회 경로가 남는다. 재현 입력(`src/.env` @L4, `docs/../.env` @L0)을 **먼저 실패 TC로 커밋**한 뒤 수정하는 순서를 권한다.
>
> **분석 에이전트 대비 변경**: ENH-402를 P1 → **P0**로 상향(§4.2 실피해 관측), ENH-409를 P3 → **DROP**(YAGNI 명확).

### 5.5 철학 준수

| ENH | Automation First | No Guessing | Docs=Code | 판정 |
|---|---|---|---|---|
| 398 | ✅ 자동 차단이 곧 자동화 | ✅ 재현 출력 기반 | ✅ `pre-write.js` 헤더의 "explicit danger는 예외"와 구현을 일치시킴 | PASS |
| 399 | ✅ | ✅ node 실행 출력 | ✅ scope-limiter JSDoc의 "normalize path" 주석을 사실로 | PASS |
| 400 | ✅ | ✅ | ✅ "L0 = docs와 .bkit만" 광고를 사실로 | PASS |
| 401 | ✅ TC가 게이트 | ✅ | ✅ | PASS |
| 402 | ✅ 백업 자동성 유지 | ✅ **디스크 실측 완료** | ✅ | PASS |
| 403 | ✅ | ✅ | ✅ | PASS |
| 404 | ➖ 문서 | ✅ telemetry.js 실측 | ✅ **현재 위반 상태를 해소** | PASS |
| 405~407 | ✅ | ✅ | ✅ | PASS |
| 408 | ⚠️ L4 무인성 훼손 가능 | ❌ CC 동작 미확인 | ➖ | Deferred |

### 5.6 테스트 영향

현행 실측: `test/` **292개** + `tests/` **55개** = **347개**.

사이클 #32에서 확인된 **테스트 배선 결함이 여전히 유효**하다 — `test/run-all.js:33`의 `TEST_DIR=__dirname`(=`test/`)이며 `tests/` 문자열이 0회, CI(`contract-check.yml`)도 `tests/`를 실행하지 않고 `package.json`이 부재하다. **55개(16%)가 러너·CI 양쪽 밖**이다. ENH-392(사이클 #32 제안, 미출시)가 여전히 필요하다.

ENH-401은 이 문제와 맞물린다 — 새 evasion TC를 `tests/`에 두면 **실행되지 않는다**. `test/security/` 아래에 둘 것.

---

## §6. 상시 추적 항목

### 6.1 차별화 streak

- **연속 호환 166 → 167** (v2.1.34 ~ v2.1.224, Breaking 0)
- **차별화 #6(방어 스택)**: 명목 streak 유지(224에 bkit 코드 수정 bullet 0건)이나 **실질 훼손은 사이클 #32보다 악화**. #32의 F-1/F-2/F-3(Bash 경로)에 더해 **G-2(Write 경로)**가 확인되어, 무음 우회가 **양쪽 툴 경로 모두**에 존재한다. ENH-388~390·398~400 완료 전까지 "구조적 면역" 대외 문구는 **사용하지 말 것**.
- **차별화 #3(Sequential Dispatch)**: count-agnostic 확인 → spawn cap 제거와 직교, **영향 없음**.
- **차별화 #1(Memory Enforcer)** 인접 신규 이슈: #84536(Plan Mode가 CLAUDE.md 지시 무시), #84486(AGENTS.md 미적용), #84265(에이전트가 자기 메모리 미참조) — 전부 OPEN.

### 6.2 OPEN 이슈 (상류)

기존 감시 12건 **전부 OPEN 유지**(#84135는 CLOSED이나 수정이 아니며 #84452로 생존). 신규 편입:

- **#84701** PreToolUse deny가 Task 서브에이전트 Bash에 미적용 — **최우선**
- **#84632** `if` 스코프 훅 무조건 발화·미차단 — **bkit `hooks/hooks.json:30,286` 직접 노출**
- **#84656** `[DOCS]` PreToolUse timeout 계약 미기재
- #84589 `permissionDecision:'defer'`가 툴을 무음 파킹
- #84011 `additionalContext` 후행 개행 유실 → 매 턴 프롬프트 캐시 미스 (bkit `lib/core/io.js` 사용)
- #84021/#84022 훅 출력 10K 초과 시 무음 폐기
- #84385 Stop 훅 `decision:block`이 "Stop hook error"로 렌더
- #84634/#84318 `permissions.deny Read()` 미강제
- #84685/#84493 worktree 격리 바인딩이 세션 전역 → 동시 서브에이전트 cwd 탈취
- #84262 Skill frontmatter `model`/`effort`가 API 라우팅에 미적용
- #84501 `known_marketplaces.json` BOM 시 플러그인 작업 무음 무한 실패
- **#84183** 2.1.220이 Agent-tool dispatch 억제 지시를 무음 추가 — **bkit 권장버전이 정확히 2.1.220이므로 확인 가치 높음**

### 6.3 감시 이슈 창 통계

2026-08-05~08-08 창 신규 이슈 **727건**(`search/issues` `total_count` 기준). 커뮤니티 PR 30건 중 **merged 0건** — 저장소는 사실상 issue 전용이다.

### 6.4 미검증 (다음 사이클 우선)

1. **#84302 fail-open 실증** — bkit 훅 timeout(5000ms) 초과 시 실제 거동. 문서에 계약 자체가 없으므로(§4.5) 실측만이 답이다.
2. **#84632 `if` 스코프 훅 실거동** — bkit `hooks.json:30,286`이 실제로 스코프 밖에서 발화하는지.
3. **#84701 서브에이전트 Bash deny 미적용** — bkit이 서브에이전트를 대량 사용하므로 영향 최대.
4. **cross-session 메시지 × L4 Full-Auto** — bkit이 `SendMessage`를 쓰지 않으므로 현재는 도달 불가이나, ENH-408 검토 전 필수.
5. **#84524가 COMPLETED로 닫혔는데 대응 bullet이 없다** — `Agent-type Stop hook runs 42+ minutes despite "timeout": 240`. bkit #139(unified-stop 15.5분 stall) 계열. 미공개 수정인지 트리아지 오분류인지 판별 필요.
6. 사이클 #32의 "창 내 총 이슈 997건"을 ERRATA-33-2 방식으로 **재검증**.
7. `SubagentStart`/`SubagentStop`이 depth 2/3에서 발화하는지 (사이클 #30 이월, 미해결).

---

## §7. 결론

### 7.1 CC 호환성

**v2.1.224는 안전하다.** 31 bullets 중 bkit 런타임 계약을 깨는 항목이 하나도 없다. 연속 호환 **167**. 마이그레이션 작업 불요. 자동 이득 3건(MCP 이름 announce, 긴 경로 세션 격리, CC 측 install 레코드 무결성).

### 7.2 가장 먼저 할 일 (ENH 착수 전)

1. **`bkit-bkit-marketplace` 백업 슬롯의 현재 소유자를 확인하고 사용자에게 알릴 것.** 지금 그 슬롯은 tene-studio가 갖고 있다. 이 슬롯에 의존하던 다른 프로젝트가 있다면 백업은 이미 없다.
2. **ENH-398/399/400을 단일 PR로.** 재현 입력을 실패 TC로 먼저 커밋할 것.
3. **ENH-404(PRIVACY.md)는 코드 변경 없이 즉시 가능**하며, 현재 문서가 사실과 다른 상태(`PRIVACY.md:37` "Does not make network requests of any kind" vs `lib/infra/telemetry.js`의 opt-in OTLP POST)이므로 우선 처리 가치가 높다.
4. **RECOMMENDED_VERSION은 2.1.220 유지.** ENH-395(2.1.223 상향)도 보류.

### 7.3 이번 사이클의 성격

사이클 #32와 #33은 같은 방법론이 연속으로 성과를 낸 사례다: **CC가 무엇을 고쳤는지를 읽고, 같은 결함 클래스가 bkit에 있는지 실행으로 확인한다.** #32는 "무음 우회"(bullet: 권한 은닉)를 거울로 삼아 Bash 경로 결함 3건을 찾았고, #33은 "무음 손상"(bullet: plugin 레코드)과 "무음 우회"(bullet: deny 후행 슬래시)를 거울로 삼아 Write 경로 결함과 백업 clobber를 찾았다.

주목할 점은 **#33의 최대 발견이 코드 분석이 아니라 디스크 관측에서 나왔다**는 것이다. 분석 에이전트는 `CLAUDE_PLUGIN_DATA` 값을 몰라 해당 항목을 "미검증, 강등 가능"으로 남겼다. 메인 세션이 실제 파일시스템을 확인하자 **이미 발생한 피해**가 드러났다. ERRATA-32-5(서브에이전트 주장은 재현 후 채택)는 이번에 **양방향으로 작동**했다 — 한 주장은 과장으로 판명되어 재서술됐고(§3.0.6), 다른 주장은 추정에서 **실증으로 승격**됐다(§4.2).

---

## 부록 A — 검증 커맨드 (재현용)

```bash
# Phase 1.5 이중 소스 (기계적 카운트 — WebFetch로 세지 말 것: ERRATA-31-1/32-1)
curl -sL https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md -o /tmp/cc.md
perl -ne 'if(/^## 2\.1\.224\s*$/){$i=1;next} if(/^## /){$i=0} print if $i' /tmp/cc.md \
  | perl -ne 'print if /^- /' > /tmp/raw224.txt && wc -l < /tmp/raw224.txt      # → 31

# 대칭차집합 (0이어야 함)
gh api repos/anthropics/claude-code/releases/tags/v2.1.224 --jq '.body' \
  | perl -ne 'print if /^- /' > /tmp/gh224.txt
diff <(sort /tmp/raw224.txt) <(sort /tmp/gh224.txt)

# 창 총계는 search/issues로 — gh issue list는 무음 절단 (ERRATA-33-2)
gh api -X GET search/issues -f q='repo:anthropics/claude-code created:2026-08-05..2026-08-08' \
  -f per_page=1 --jq '.total_count'                                              # → 727

# 바이너리 정확 리터럴 카운트 (윈도우 diff 금지 — ERRATA-31-2)
cd ~/.local/share/claude/versions/
for v in 2.1.223 2.1.224; do perl -0777 -ne '
  for my $s ("spawn limit","getTotalAgentSpawns","CLAUDE_CODE_MAX_SUBAGENTS_PER_SESSION"){
    my $c=0;my $q=0; while(($q=index($_,$s,$q))>=0){$c++;$q++} print "$s: $c\n" }' $v; done

# 상류 문서가 제거된 기능을 광고하는지
curl -sL https://code.claude.com/docs/en/sub-agents.md \
  | perl -ne 'print "$.: $_" if /at most 200|MAX_SUBAGENTS_PER_SESSION/'

# G-2 재현 — 자동화 레벨을 반드시 명시할 것 (ERRATA-33-5)
node -e 'const sl=require("./lib/control/scope-limiter");
for (const lvl of [0,4]) for (const p of ["src/.env","docs/../.env","lib/keys/private.pem"])
  console.log("L"+lvl, p, JSON.stringify(sl.checkPathScope(p,lvl)));'
# → L0 src/.env allowed=false(NOT_IN_SCOPE) / L4 src/.env allowed=true
# → L0·L4 모두 docs/../.env allowed=true

# G-2 배선 부재 증명 (부재 증명은 perl로만 — ERRATA-32-2)
perl -ne 'print "$.: $_" if /outputBlock|process\.exit\(2\)|outputAllow/' scripts/pre-write.js
perl -ne 'print "$.: $_" if $.>=451 && $.<=461' scripts/unified-bash-pre.js   # dead block

# G-1 실피해 관측 — 추정이 아니라 디스크 확인
cat ~/.claude/plugins/data/*/backup/meta.json

# bkit의 if-스코프 훅 (상류 #84632 노출면)
perl -ne 'print "$.: $_" if /"if"\s*:/' hooks/hooks.json                        # → 2건
```

## 부록 B — 아키텍처 실측 (독립 재측정)

| 항목 | 값 | 명령 |
|---|---|---|
| agents | 34 | `ls -1 agents/ \| wc -l` |
| skills | 44 | `ls -1 -d skills/*/ \| wc -l` |
| hook 이벤트 | 22 | `node -e 'console.log(Object.keys(require("./hooks/hooks.json").hooks).length)'` |
| hook matcher 블록 | 25 | `node -e '…reduce((a,v)=>a+v.length,0)'` |
| scripts | 67 | `ls -1 scripts/ \| wc -l` |
| lib 모듈(.js) | 195 | `find lib -name '*.js' \| wc -l` |
| 테스트 | 292 (`test/`) + 55 (`tests/`) = **347** | `find … -name '*.test.js' \| wc -l` |
| ENH 원장 최고 | **380** (고유 104개) | `perl -ne 'while(/ENH-(\d+)/g){print "$1\n"}' CHANGELOG.md \| sort -n \| uniq \| tail -1` |
| plugin version | 2.1.32 | `jq -r '.version' .claude-plugin/plugin.json` |

모든 수치는 분석 에이전트 보고와 **독립 재측정 결과가 일치**했다.
