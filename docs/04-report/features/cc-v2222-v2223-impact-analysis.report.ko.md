# CC v2.1.222 → v2.1.223 영향 분석 보고서 (사이클 #32)

- **분석일**: 2026-08-06
- **범위**: Claude Code CLI v2.1.222 + v2.1.223 (40 bullets)
- **직전 baseline**: v2.1.221 (사이클 #31)
- **bkit 버전**: 2.1.32 (브랜치 `feat/v2.1.33-cc221-defect-response`)
- **설치 CC / npm latest**: 2.1.223 / 2.1.223
- **분석 전용** — 이 사이클에서 리포지토리 코드는 **0건** 수정되었습니다.

---

## Executive Summary

> **판정**: CC 측 **Breaking 0건 · 회귀 0건**. 그러나 이번 사이클의 실질 산출물은
> CC 변경 대응이 아니라 **bkit 자체의 확인된 CRITICAL 결함 3건**입니다.
> v2.1.223의 "crafted command could hide parts of itself from permission checks"
> bullet이 조사 방향을 지시했고, **bkit이 CC가 방금 고친 것과 같은 결함 클래스를
> 공유하고 있음**이 실행 증거로 확인되었습니다.

| 관점 | 내용 |
|---|---|
| **CC 호환성** | 🟢 문제 없음. 40 bullets 중 bkit 부착점을 가진 breaking 항목 0건. 연속 호환 **164 → 166** |
| **bkit 자체 건전성** | 🔴 **CRITICAL 3건** — destructive-detector가 Bash 경로에서 전혀 차단하지 않음 / 호출부가 자기 입력을 훼손 / heredoc 가드 우회 7건 |
| **투명성** | 🔴 감사로그가 일어나지 않은 차단을 `result:"blocked"`로 기록 |
| **차별화** | 🟡 #6(heredoc 방어) 주장이 **실질 훼손**. 명목상 streak는 유지되나 코드가 주장을 뒷받침하지 못함 |

### 4-관점 가치 평가

| 관점 | 문제 | 해법 | 기능/UX 효과 | 핵심 가치 |
|---|---|---|---|---|
| **안전** | 파괴적 Bash 명령이 탐지되고도 통과 | 차단 배선 복구(ENH-388) | `rm -rf` / `DROP TABLE`이 실제로 멈춤 | 가드가 광고대로 동작 |
| **정확성** | 객체 전달로 TAB 포함 명령이 탐지 불가 | 문자열 전달 + 공백 정규화(ENH-389) | 탭·제로폭 패딩 회피 차단 | CC v2.1.223과 동일 클래스 방어 |
| **신뢰** | 감사로그·통계가 허구 데이터 | `result`를 실제 결정에 연동 | `/bkit:audit` 리포트가 사실이 됨 | 통제 투명성 회복 |
| **일관성** | 훅이 bare `/btw`·`/code-review` 안내 | 네임스페이스 전파(ENH-391) | 사용자가 의도한 bkit 기능이 실행됨 | 이름 해석 정합 |

---

## §1. 버전 범위 및 조사 방법

### 1.1 3중 소스

| 소스 | 용도 | 비고 |
|---|---|---|
| GitHub release body (`gh api .body`) | bullet 원문 | 기계적 카운트 |
| raw `CHANGELOG.md` (`curl`) | bullet 원문 (권위) | 기계적 카운트 |
| CC 바이너리 직독 (`~/.local/share/claude/versions/{221,222,223}`) | 주장 검증 | perl `index`/정규식 카운트만 |
| 공식 문서 raw `.md` (`curl code.claude.com/docs/en/*.md`) | verbatim 인용 | **신규 채널** — ERRATA-32-1 참조 |

### 1.2 npm 연속성

| 버전 | 게시(UTC) | 직전 대비 간격 |
|---|---|---|
| 2.1.221 | 2026-08-03T22:16:25Z | 239.08 h (220→221) |
| 2.1.222 | 2026-08-04T20:37:17Z | 22.35 h |
| 2.1.223 | 2026-08-05T22:51:13Z | 26.23 h |

- **dist-tags**: `latest` = `next` = **2.1.223**, `stable` = **2.1.220** (불변)
- **drift** (`latest` − `stable`) = **3** — 임계 4 미만이므로 사용자 고지 불요
- **R-1**(릴리스 노트 없는 무음 게시) / **R-2**(정수 건너뜀) 모두 **미발생**
- 10일 공백(220→221) 뒤 22~26시간 간격의 연속 릴리스 — 활발한 작업 구간

---

## §2. 변경 카탈로그

### 2.1 카테고리 분포 (40 bullets)

| 버전 | Added | Fixed | Improved | Changed | Removed | 계 |
|---|---|---|---|---|---|---|
| v2.1.222 | 0 | 16 | 3 | 1 | 1 | **21** |
| v2.1.223 | 3 | 12 | 0 | 4 | 0 | **19** |
| **합계** | 3 | 28 | 3 | 5 | 1 | **40** |

**Breaking 라벨: 0건.**

### 2.2 bkit 교차 항목 (8건)

| ID | 버전 | 항목 | bkit 관련성 |
|---|---|---|---|
| **C1** | 223 | Bash permission bypass (명령 은닉) + 탭/비가시 유니코드 패딩 | **동일 결함 클래스 공유 — §4.1** |
| **C8** | 223 | `/review` → `/code-review` 별칭화 | 이름 충돌 표면 확대 — §4.2 |
| C4 | 223 | 제한된 subagent model 시 부모 모델 대체 경고 | fable/opus 핀 에이전트 8종에 신규 경고 |
| C3 | 223 | 에이전트 `bypassPermissions`가 org 정책 무시 | bkit 34 에이전트 중 선언 **0건** → 무영향 |
| C6 | 223 | 1M 컨텍스트/미인식 model ID 창 강제 | `model: fable` 6종의 인식 여부 **UNVERIFIED** |
| B1 | 222 | PreToolUse auto-allow가 background에서 제한 우회 | **관례로 회피** — §4.4 |
| B2 | 222 | worktree 격리를 file edit + Bash로 확대 | ENH-383(#31) 산식 불변, 수동 우회로 소멸 |
| B4 | 222 | subagent transcript effort 라벨 수정 | effort enum 불일치 미해소 |

### 2.3 무영향 / 직교 (32건)

`/usage`·`/usage-credits` 귀속, HTTPS 프록시 연결 점검, 스트림 idle timeout, claude.ai 커넥터,
파일 워처 크래시, 스크린리더 백스페이스, Vim 레지스터, Bedrock/Vertex 인증, MDM/managed-settings
병합, Remote Control 자동시작, `ultraplan` 제거, 게이트웨이 모델 발견, `/cd` 재개, `git push` 파싱 행,
마켓플레이스 `owner/*` 와일드카드 등 — bkit 부착점 없음.

### 2.4 문서화되지 않은 서브시스템 작업 (bullet 없음, 바이너리 전용)

피처게이트 **1750 → 1761 → 1767** (221→223 순증 +21 / 제거 4).

| 클러스터 | 신규 게이트 | CHANGELOG bullet |
|---|---|---|
| worktree | `tengu_worktree_resume_root_rejected` | 부분 (222 격리 bullet) |
| Remote Control | `tengu_remote_auto_mode_include_destructive_mcp`, `tengu_remote_notification_routed`, `tengu_remote_tool_result_rendered` | 부분 |
| **org-memory** | `tengu_org_memory_connected_mode` | **없음** — 차별화 #1 인접, 감시 유지 |
| auq-park | `tengu_auq_park_interrupted_at_stream_close`, `..._preserve_reverted`, `..._preserved_at_shutdown` | **없음** |
| bridge | `tengu_bridge_inline_image_attachments`, `tengu_bridge_selfheal_heartbeats` | **없음** |
| 코드네임 | `basalt_loom`, `cinder_heron`, `cinder_swift`, `dazzling_floyd`, `parchment_fern`, `harbor_kite_limits` | **없음** |

권한 거부 사유(`reason:`) 고유 리터럴 **525 → 557**. 신규 중 worktree 클러스터 7종
(`invalid-linked-worktree`, `not-a-git-worktree`, `shared-git-dir`, `work-tree-elsewhere`,
`worktree-gone`, `pin-is-own-launch-tree`, `pin-is-protected-checkout`)이 222의 격리 강화를 뒷받침합니다.

`[[ ]]` cond-lexer 휴리스틱이 **교체**되었습니다(221의 `quoted operand contains ]] + command separator`
제거 → 223에 `pattern leaf contains &&`, `pattern leaf contains a potential standalone ]] closer` 신규 2종).

---

## §3.0 원본 검증 게이트 (Phase 1.5 — MANDATORY)

### 3.0.1 검증 표

| 항목 | 에이전트 보고 | raw 실측 | 소스 | 판정 |
|---|---|---|---|---|
| v2.1.222 총 bullets | 21 | **21** | CHANGELOG ∧ release body | match |
| v2.1.223 총 bullets | 19 | **19** | CHANGELOG ∧ release body | match |
| Added / Fixed / Improved / Changed / Removed | 3/28/3/5/1 | **3/28/3/5/1** | 접두어 기계 분류 | match |
| Breaking | 0 | **0** | 라벨 검색 | match |
| CHANGELOG ↔ release body 대칭차집합 | — | **0** (양 버전) | `comm -3` | match |

**ERRATA-30-1(합집합 규칙)** 적용 결과 델타 없음 — 이번 사이클은 두 소스가 완전 일치했습니다.

### 3.0.2 ERRATA-32-1 (신규, HIGH) — WebFetch가 문서 표 행을 무음 절단

ERRATA-31-1(WebFetch가 총계·구조를 날조)의 **절단 변종**. 같은 페이지·같은 행에서:

| 대상 | WebFetch 반환 | raw `.md` 실측 |
|---|---|---|
| `/review` 행 | `Give a fast single-pass, read-only review of a GitHub pull request` | 인자 시그니처 `[PR]` + v2.1.186~201 거동 이력 + 교차링크 3종 포함 전문 |
| `strictKnownMarketplaces` | "Note만 존재"로 보고 (누락) | 전용 표 행 + `#### strictKnownMarketplaces` 전용 섹션 존재 |

→ **문서 verbatim 인용은 raw `.md` + perl/grep을 기본 경로로.** WebFetch 단독 인용은 보고서에 넣지 않습니다.

### 3.0.3 ERRATA-32-2 (신규, HIGH) — 이 머신의 `grep`(ugrep)이 `-E`에서 위음성

메인 세션이 bare `/btw` 잔존 여부를 `grep -rnE '(^|[^:a-z-])/btw\b'`로 조회해 **0건**을 얻었으나,
동일 대상에 perl을 적용하니 `scripts/cto-stop.js:101`(런타임 출력) 포함 **다수**가 나왔습니다.

```
$ grep --version | head -1
ugrep 7.5.0 x86_64-apple-macosx +avx2; -P:pcre2jit
```

→ **모든 부재(absence) 증명은 perl로만.** ERRATA-31-2/31-3(바이너리 부재 증명)의 파일시스템 판.
이 오탐은 하마터면 "ENH-381 완료"라는 정반대 결론으로 이어질 뻔했습니다.

### 3.0.4 ERRATA-32-3 (신규) — `/ultraplan` 문서 지연 주장은 오류

조사 에이전트가 "`/ultraplan`이 여전히 built-in 표에 있음 = docs lag"로 보고했으나,
raw 문서 행 실측 결과 **이미 갱신되어 있었습니다**:

> `/ultraplan <prompt>` | **Removed.** Use [plan mode](...) instead. Previously sent a planning task to a Claude Code on the web session…

→ 문서 지연 확정은 **3건**이되 구성이 다릅니다: `/review` 별칭 미기재 / `owner/*` 와일드카드 미기재
(`settings.md`에 리터럴 0회) / `CLAUDE_CODE_DISABLE_UNKNOWN_MODEL_WINDOW_ENFORCEMENT` 미기재(4개 페이지 0건).

**별건 관측**: v2.1.222가 "Removed ultraplan feature"라고 명시했음에도, `/ultraplan` 명령 디스크립터와
`Usage: /ultraplan <prompt>` 문자열이 **221과 223에서 바이트 동일**하게 남아 있습니다. 문서는 제거를
반영했으나 CLI 바이너리는 반영하지 않았습니다. ERRATA-31-3에 따라 "제거되지 않았다"고 단정하지 않고
**관측 사실로만** 기록합니다 (서버/게이트 레벨 비활성 가능성).

### 3.0.5 ERRATA-32-4 (신규, 프로세스) — #31의 "유일 충돌" 결론은 모집단이 좁았음

사이클 #31은 CC **명령 레지스트리**만 bkit 44 스킬명과 대조해 `btw`를 유일 충돌로 결론지었습니다.
그러나 이름 해석의 실제 모집단은 공식 명령 레퍼런스 **104행 = built-in 90 + bundled Skill 13 + Workflow 1**이며,
`code-review`는 **bundled Skill 클래스**에 있어 레지스트리 대조에서 구조적으로 보이지 않았습니다.

```
$ curl -sL code.claude.com/docs/en/commands.md | perl -ne 'print "$1\n" if /^\|\s*`?\/([a-z0-9][a-z0-9:._-]*)/' | sort -u | wc -l
104
$ comm -12 bkit-skills.txt doc-cmds.txt
btw
code-review
```

→ **충돌은 1건이 아니라 2건.** 향후 대조는 명령 레지스트리가 아니라 **공식 명령 레퍼런스 전체**를 모집단으로 삼습니다.

### 3.0.6 ERRATA-32-5 (신규) — 서브에이전트 주장은 전량 재현 후 채택

Phase 2가 보고한 CRITICAL 3건은 **메인 세션이 독립적으로 재현**한 뒤에만 이 보고서에 실렸습니다
(§4.1 재현 로그). 재현 없이 채택된 항목은 없습니다. 반대로 조사 에이전트의 `/ultraplan` 주장은
재현 과정에서 **반증**되었습니다(ERRATA-32-3).

---

## §4. bkit 영향 분석

### 4.1 F-1/F-2/F-3 — bkit은 CC가 방금 고친 결함 클래스를 공유한다 (**CRITICAL, 헤드라인**)

CC v2.1.223:
> Fixed a Bash permission bypass where a crafted command could hide parts of itself from permission checks
> Fixed permission prompts so commands padded with tabs or invisible Unicode can no longer hide part of the command from the approval dialog

이 두 bullet이 조사 방향을 지시했고, bkit의 Bash 가드에서 **동일 클래스**가 확인되었습니다.

#### F-1 (CRITICAL) — destructive-detector가 Bash 경로에서 **차단하지 않는다**

`scripts/unified-bash-pre.js:232-253`은 critical 판정 시 감사로그 기록과
`incrementStat('destructiveBlocked')`만 수행하고, **`blocked = true`도 `outputBlock*` 호출도 없습니다.**
그대로 `:500`의 `outputAllow()`로 낙하합니다.

같은 파일 30줄 아래 heredoc 가드(`:281-282`)는 두 줄을 정확히 갖고 있어 대조가 명확합니다:

```js
outputBlockWithContext(verdict.reason, verdict.alternatives, 'PreToolUse');
blocked = true;
```

**종단 재현** (훅은 stdin JSON을 파싱해 결정을 출력할 뿐, 명령을 실행하지 않습니다):

| 입력 command | 훅 stdout | 판정 |
|---|---|---|
| `rm -rf /tmp/bkit-probe-nonexistent` | `Bash command validated.` | **ALLOW** |
| `DROP TABLE users;` | `Bash command validated.` | **ALLOW** |
| `git push --force origin main` | `{"decision":"block",...ENH-298 push-event guard...}` | BLOCK — **G-rule이 아니라 별도 가드** |
| `ls -la` | `Bash command validated.` | ALLOW (음성 대조) |

`hooks/hooks.json`의 `PreToolUse` Bash matcher는 **`unified-bash-pre.js` 단 1개** — 보완할 2차 훅이 없습니다.
→ **탐지는 정상 작동하나 배선만 빠져 있습니다.** G-002(force push)만 ENH-298 중복 가드 덕분에 우연히 살아 있고,
G-001/G-009 등은 미집행입니다.

#### F-2 (CRITICAL) — 호출부가 자기 입력을 훼손: **탭 한 글자면 탐지 무력화**

`unified-bash-pre.js:236`은 **객체** `{ command }`를 넘깁니다. 그러나
`lib/control/destructive-detector.js:135`는:

```js
const input = typeof toolInput === 'string' ? toolInput : JSON.stringify(toolInput || '');
```

JSDoc `:131`이 `@param {string} toolInput`로 선언하므로 **계약 위반**입니다.
`JSON.stringify`가 실제 TAB을 `\`+`t` 두 글자로 바꿔 G-rule의 `\s+`/`\b`를 무력화합니다.

**재현** (`dd.detect`를 객체/문자열 두 방식으로 직접 호출):

| 입력 | 훅 실제 경로(객체) | 문자열 직접 전달 |
|---|---|---|
| `rm -rf /tmp/x` | G-001/critical | G-001/critical |
| `rm→-rf→/tmp/x` (TAB) | **NONE** | G-001/critical |
| `DROP TABLE users;` | G-009/critical | G-009/critical |
| `DROP→TABLE users;` (TAB) | **NONE** | G-009/critical |
| `ls -la` | NONE | NONE |

TAB은 셸의 기본 IFS에 포함되므로 이 명령들은 **정상 실행됩니다**. 즉 CC v2.1.223이 자기 승인
다이얼로그에서 고친 "탭 패딩으로 명령 일부 은닉"과 정확히 같은 클래스입니다.

#### F-3 (CRITICAL) — heredoc 가드 우회: 10개 페이로드 중 **7개가 비차단**

근본 원인은 pipe-shell 패턴이 `\|\s*\bbash\b`(`lib/defense/heredoc-detector.js:115`)로
파이프 직후 인터프리터의 **리터럴 단어**를 요구한다는 점입니다.

**재현** (탐지기만 호출, 셸 실행 없음):

| 페이로드 | 가드 판정 | 비고 |
|---|---|---|
| `cat <<EOF \| bash` | **critical** | 양성 대조 — 정상 차단 |
| `cat <<EOF \| /bin/bash` | warning | 허용 |
| `cat <<EOF \| "bash"` | warning | 허용 |
| `cat <<EOF \| \bash` | warning | 허용 |
| `cat <<EOF \| command bash` | warning | 허용 |
| `cat <<EOF \| $X` | warning | 허용 |
| `cat <<\EOF \| bash` | **NO-MATCH** | **감사조차 안 됨** |
| `cat <<'É' \| bash` | **NO-MATCH** | **감사조차 안 됨** |
| `cat <<'EOF' \| bash` | critical | 정상 차단 |
| `cat <<EOF \|→bash` (TAB) | critical | 정상 차단 (JS `\s`가 TAB 포함) |

`warning` 등급은 코드상 **허용 경로**입니다(`unified-bash-pre.js:285` — 감사만 하고 미차단).
따라서 비차단 7건 중 5건은 기록은 남고, 2건은 **기록조차 없습니다.**

내부 비대칭이 결정적 증거입니다: `sub` 벡터는 이미 경로 접두사를 `[\w./-]*`로 허용하는데
(`heredoc-detector.js:93`), **`pipe-shell` 벡터만 그 배려가 없습니다.** 또한 `<<\EOF`는
bash 표준 관용구(`<<'EOF'`와 동치)이며 적대적 입력이 아닙니다 — 델리미터 패턴이 ASCII `\w+`를
요구해 heredoc으로 **인식조차** 하지 못합니다.

**과장 금지 단서**: NBSP/ZWSP는 bash argv 구분자로 불활성이므로 **셸 레벨 우회가 아닙니다.**
SQL 본문이나 따옴표 인자처럼 주변 언어가 허용하는 위치에서만 탐지기 우회 소재가 됩니다.

#### F-5 (HIGH) — 감사로그가 일어나지 않은 차단을 기록

`unified-bash-pre.js:244`의 `result: 'blocked'`는 **하드코딩 리터럴**로, 훅의 실제 결정과 무관합니다.
위 재현 실행이 남긴 실제 원장 항목:

```json
{"actorId":"unified-bash-pre","action":"destructive_blocked","target":"DROP TABLE users;",
 "details":{"rules":["G-009"]},"result":"blocked",...}
```

같은 명령의 훅 stdout은 `Bash command validated.`였습니다. `bkit:audit` 스킬이
`destructive_blocked`를 통제·투명성 보증으로 광고하므로, 하위 리포팅 전체가 허구 데이터를 읽습니다.
`incrementStat('destructiveBlocked')`(`:249`)도 동일하게 부풀려져 trust-score/세션 통계를 오염시킵니다.

#### 차별화 #6에 대한 정직한 재평가

`README`/`CHANGELOG`의 "heredoc-bypass 구조적 면역" 주장은 **명목상 streak는 유지**되지만
(CC 222/223에 해당 코드 수정 bullet 없음) **실질은 훼손**되었습니다. 우회 7건이 존재하는 한
"CC 회귀 자기방어"는 코드가 뒷받침하지 못하는 주장입니다. ENH-390 완료 전까지 대외 문구에서
이 주장의 강도를 낮출 것을 권고합니다.

### 4.2 C8 — `code-review` 이름 충돌: MF-3 종결은 **잘못되었다**

CC v2.1.223이 `/review`를 `/code-review`의 별칭으로 흡수했습니다. 바이너리에서 직접 확인:

- v2.1.221: `{type:"prompt", name:"review", description:"Review a GitHub pull request; for your working diff use /code-review", source:"builtin"}`
- v2.1.223: `name:"review"` **0회** — 명령 레지스트리 100 → 99

두 충돌은 **서로 다른 클래스**입니다:

| 이름 | CC 측 실체 | bkit 측 | CC 의미 | bkit 의미 |
|---|---|---|---|---|
| `btw` | built-in 명령 (문서 표 등재 확인) | `skills/btw/` | 대화에 추가하지 않는 **곁질문 오버레이** | 개선 제안 **수집기** |
| `code-review` | **bundled Skill** (`code-review@claude-code-plugins`) | `skills/code-review/` | diff 버그 헌팅 + effort | 품질/보안/모범사례 리뷰 |

두 경우 모두 **의미가 다르므로**, 사용자가 bare 형태를 입력하면 조용히 다른 기능이 실행됩니다.

사이클 #216-217이 MF-3 종결 근거로 인용한 CC v2.1.216 플러그인 네임프리픽스 수정은
**`/bkit:btw` 해석**을 고쳤을 뿐, **bkit이 bare 형태를 광고하는 문제**는 건드리지 않았습니다.
특히 **런타임 훅 출력** 2곳이 살아 있습니다 — 문서 검토로는 잡히지 않는 최악의 표면입니다:

| 파일:라인 | 출력 | 성격 |
|---|---|---|
| `scripts/cto-stop.js:101` | `Use /btw list to review, /btw promote {id} to create skills.` | **세션 종료 시 런타임 출력** |
| `scripts/code-review-stop.js:38` | `🔄 To re-review after fixes: /code-review [path]` | **런타임 출력** |
| `hooks/startup/session-context.js:619` | 세션 시작 스킬 목록 | **런타임 출력** |

같은 리포 내 모순이 결정적입니다: `agents/cto-lead.md:292-293`은 올바르게 `/bkit:btw list`를 쓰고
"bare `/btw`는 Claude Code 내장에 가려진다"고 **경고까지** 하는데, 정작 세션 종료 시 실행되는 훅은
bare `/btw`를 출력합니다. **네임스페이스 마이그레이션이 에이전트 산문에만 적용되고 훅 출력 문자열에는 누락**된 것입니다.

→ 종결 조건은 "CC가 고쳤다"가 아니라 **"bkit이 bare 형태를 더 이상 방출하지 않는다"**여야 합니다. **MF-3 재개.**

**부수 확증**: `/code-review` 문서 행의 인자 시그니처가 `[low|medium|high|xhigh|max|ultra]` —
아래 4.5 effort enum 항목의 1차 출처 근거입니다.

### 4.3 테스트 배선 결함 — 55개 테스트가 러너·CI 양쪽 밖 (**HIGH**)

| 항목 | 실측 |
|---|---|
| `test/run-all.js` 기준 디렉터리 | `const TEST_DIR = __dirname;` (`:33`) = `test/` |
| `test/run-all.js` 내 `tests/` 문자열 | **0회** |
| `test/` 하위 테스트 파일 | 292 |
| **`tests/` 하위 테스트 파일** | **55** |
| CI(`.github/workflows/contract-check.yml`) | `test/contract/...` 및 개별 스크립트만 실행 — `run-all.js`·`tests/` **미실행** |
| `package.json` | **부재** (npm 스크립트 진입점 없음) |

메모리의 "347 테스트"는 292 + 55의 합계였습니다. 즉 **55개(16%)가 메인 러너와 CI 어디에서도 실행되지 않습니다.**
여기에 차별화 #6의 유일한 테스트 스위트(`tests/qa/v2114-defense-heredoc.test.js`, 53 TC)가 포함됩니다.

더 나쁜 점: 그 53 TC는 **전부 happy-path**이며 우회 TC가 **0건**입니다. 즉 §4.1 F-3의 우회 7건은
테스트가 있었더라도 잡히지 않았을 것입니다. **Automation First 철학 정면 위반.**

### 4.4 B1 — PreToolUse auto-allow 강화: bkit은 관례로 회피

CC 222가 background agent task에서 auto-allow 훅의 tool 제한 우회를 막았습니다. bkit 부착점을 확인한 결과:

bkit의 PreToolUse allow 방출 경로는 3개(`unified-bash-pre.js:500`, `pre-write.js:393`,
`lint-skill-md.js:85,110`)뿐이며, **핵심은 `lib/core/io.js:314-337`의 `outputAllow`가 CC 런타임에서
평문(plain text)만 출력한다**는 점입니다(`:332-336`). `{"permission":"allow"}` 방출은
**Cursor 런타임 전용 분기**(`:317-325`)입니다.

→ **bkit은 CC에 `permissionDecision:"allow"`를 단 한 번도 방출하지 않으므로**, 222가 조이는 경로에
부착점이 없습니다. `hook-matcher-pipe-convention`과 동일한 "관례에 의한 회피"입니다.

단, **반대 방향(소비)은 존재**합니다: `lib/domain/guards/enh-262-hooks-combo.js:43`,
`enh-263-claude-write.js:48`이 들어오는 `permissionDecision==='allow'`를 읽어 CC 회귀를 귀속하며,
`unified-bash-pre.js:482`는 부재 시 `'allow'`를 기본값으로 둡니다. 222 이후 귀속 발화 빈도가 달라질 수
있으나 **귀속 전용이며 절대 차단하지 않습니다**(`:465-467`).

**부수 발견 (Docs=Code 결함)**: `CUSTOMIZATION-GUIDE.md:1481`이 사용자에게
`console.log(JSON.stringify({ decision: "allow" }))`를 안내하는데, PreToolUse에 `decision:'allow'`는
유효 필드가 아닙니다(`lib/domain/ports/cc-payload.port.js:27-36`이 두 enum을 이미 분리 명시). 스테일 문서.

**관련 상류 이슈 (OPEN, 미재현)**: #84302 — PreToolUse command 훅이 kill되면 CLI가 게이트된 툴을
**ALLOW(fail-open)**한다는 보고. bkit 방어는 전량 PreToolUse이고 bkit은 이미 #139에서 Stop 훅이
최대 15.5분 blocking되는 결함을 겪었으므로, 사실이라면 방어 아키텍처의 가정에 영향을 줍니다. **다음 사이클 최우선 검증 항목.**

### 4.5 그 밖의 CC 항목 매핑

| ID | 항목 | 판정 | 근거 |
|---|---|---|---|
| B2 | worktree 격리 확대 | ENH-383 산식 **불변**, 통증만 증가 | `restoreFromPluginData()`가 repo 밖 `${CLAUDE_PLUGIN_DATA}`를 읽어 격리 무관. 단 "main 체크아웃으로 cd 해서 `.bkit/` 복사"라는 수동 우회로가 222에서 차단 |
| B3 | `disable-model-invocation` 거부 개선 | 무영향 | 44 skills frontmatter 사용 **0건** |
| B4 | subagent effort 라벨 | 갭 미해소 | bkit `VALID_EFFORT_LEVELS`(`lib/domain/guards/invariant-10-effort-aware.js:24`) = `['low','medium','high']` vs CC 문서 `[low\|medium\|high\|xhigh\|max]` |
| B5 | org-restricted 모델 alias 강등 | **자동 이득** | bkit `modelOverrides` 미사용. 34 agents = opus 10 / fable 6 / sonnet 15 / haiku 2 |
| B6 | ultraplan 제거 | 무영향 | repo 코드·설정 **0건** |
| B7 | SendMessage permission classifier | 무영향 | bkit dispatcher는 SendMessage가 아니라 **Task spawn** 사용(`lib/orchestrator/team-protocol.js`) |
| B8 | Remote Control repo-local 차단 | 무영향 | `.claude/settings.json`·`settings.local.json` **둘 다 부존재**, `remoteControl` 코드 0건 |
| C2 | workflow `import()` 샌드박스 탈출 | **무관 (이름 충돌뿐)** | bkit `workflow-engine.js` 등은 자체 PDCA 추상화. `lib/` 전체 `import(` 히트는 전부 JSDoc `@typedef`, 런타임 dynamic import 0건 |
| C3 | agent `bypassPermissions` org 정책 | 무영향 | 34 agents 선언 **0건**. 유일 히트 `pre-write.js:286`은 CC 플래그를 **소비**하는 방어 가드 |
| C4 | 제한 모델 경고 추가 | **신규 경고 노이즈** | 8 fork skills는 frontmatter `model:` 0건 → 경고 없음. 그러나 `design-validator`·`gap-detector`(opus) + fable 6종은 org 제한 시 경고 발생 |
| C5 | forked background "already resuming" | 순수 이득 | 8 fork skills 전부 `background: false`(ENH-367) → 경로 미진입 |
| C6 | 1M/미인식 모델 창 강제 | 모니터 | `CLAUDE_CODE_DISABLE_1M_CONTEXT` repo 0 hits. `model: fable` 6종의 CC 인식 여부 **UNVERIFIED** |
| C7 | 비-Anthropic `modelOverrides` 무시 | 무영향 | 설정 0건 |
| C9 | 마켓플레이스 `owner/*` | **기회** | bkit은 `.claude-plugin/marketplace.json` 배포자 — 관리자가 `popup-studio-ai/*`를 한 줄로 허용 가능 |

### 4.6 CC 훅 이벤트 커버리지

CC 2.1.223 바이너리의 플러그인 훅 버킷 초기화 함수 기준 **CC 총 31개 / bkit 등록 22개 = 70.97%** (불변).
레지스트리는 **221→222→223 바이트 동일** → 이번 창에 채택할 신규 훅 없음. 무효 키 0건.

미등록 9개: **`WorktreeCreate`**, **`WorktreeRemove`**, `PostToolBatch`, `PermissionDenied`,
`Setup`, `Elicitation`, `ElicitationResult`, `DirectoryAdded`, `MessageDisplay`.

`WorktreeCreate`/`WorktreeRemove`는 ENH-383(worktree 상태 공백)에 정확히 대응하는 라이프사이클 훅입니다.

> **함정 기록**: `BackgroundTaskProgress`는 **존재하지 않습니다**(2.1.223에서 0회). 이 이름을 나열한
> 과거 분석은 날조입니다. 또한 바이너리에는 29-name 문자열 테이블이 별도로 존재하나 인접 JS 구조가 없는
> raw string pool이므로 **이벤트 수 근거로 인용 금지**.

### 4.7 RECOMMENDED_VERSION

| 항목 | 값 |
|---|---|
| 현재값 | **`'2.1.220'`** — `lib/infra/cc-version-checker.js:65` |
| 동반 상수 | `MIN_VERSION = '2.1.78'` (`:44`) |
| 구현 참조 | 1 파일 / 6 라인 (`:65, 289, 291, 292, 294, 299`) |
| **테스트 참조** | **0 파일 / 0 라인** |
| 문서 참조 | 40 파일 — 전부 서술형, 어서션 아님 |

→ 범프는 1줄 변경, 깨질 테스트 0건. 동시에 **drift를 잡아줄 테스트도 0건**이라
"20 릴리스 동안 아무도 모르게 drift"가 반복 가능합니다. 권장값 **2.1.223**.

---

## §5. ENH 로드맵 (Phase 3 브레인스토밍)

### 5.1 Intent Discovery

- **이 업그레이드에서 bkit이 얻을 최대 가치는?** CC 신기능 채택이 아니라, CC의 권한-은닉 수정이
  가리킨 **자기 결함 발견**입니다. 이번 사이클의 ROI는 전적으로 여기에 있습니다.
- **놓치면 안 되는 변경은?** 없습니다(Breaking 0). 대신 **놓치면 안 되는 자기 결함이 3건**입니다.
- **native가 대체하는 workaround는?** C4(제한 모델 경고)가 v2.1.31 Dual Floor 모델-플로어 자문
  (ENH-368)의 일부를 CC 네이티브로 대체합니다. C9는 배포 정책을 단순화합니다.

### 5.2 ENH 번호 배정 — 이중 부킹 회피

CHANGELOG 원장 실측 결과 최고 발행 번호는 **380**이며, 사이클 #31이 제안한 **ENH-381~387은 출시 0건**입니다.
ERRATA-31-5(번호 SSoT = 원장)를 문자 그대로 적용하면 381이 비어 있으나, #31 제안이 아직 살아 있으므로
그 번호를 재사용하면 **ERRATA-31-5가 경고한 이중 부킹을 그대로 재현**하게 됩니다.

→ **이번 사이클은 ENH-388부터 배정**하고, 381~387은 #31 제안 예약분으로 남깁니다.
원장 SSoT 원칙의 보완: **원장은 "출시된" 번호의 SSoT이고, 예약 레지스터는 "원장 ∪ 미출시 제안"입니다.**
(재배정을 원하시면 유지보수자 판단으로 조정 가능합니다.)

### 5.3 YAGNI 검토

| ENH | 지금 필요한가? | 미구현 시 문제 | 다음 CC가 대신 해주나? | 판정 |
|---|---|---|---|---|
| 388 | **예** | 파괴적 명령이 계속 통과 | 아니오 (bkit 코드) | **통과** |
| 389 | **예** | 탭 한 글자로 탐지 우회 | 아니오 | **통과** |
| 390 | **예** | 차별화 #6 주장이 허위 | 아니오 | **통과** |
| 391 | 예 | 사용자가 다른 기능 실행 | 아니오 (CC는 오히려 이름 확대) | 통과 |
| 392 | **예** | 55 테스트가 영구 미실행 | 아니오 | **통과** |
| 393 | 예 | 감사 데이터 허구 유지 | 아니오 | 통과 (388에 흡수 가능) |
| 394 | 조건부 | 고효율 세션마다 경보 소음 | 부분 (CC enum이 정답 제공) | 통과 |
| 395 | 예 | drift 재발 | 아니오 | 통과 |
| 396 | 아니오 | worktree 상태 공백 지속 | **가능성 있음** — 상류 이슈 4건 진행 중 | **P3 강등** |
| 397 | 아니오 | 스테일 문서 유지 | 아니오 | P3 |

### 5.4 우선순위 배정

| ENH | P | 내용 | 대상 | 검증 |
|---|---|---|---|---|
| **ENH-388** | **P0** | destructive-detector 차단 배선 복구 — `blocked=true` + `outputBlockWithContext` 추가, `result` 필드를 실제 결정에 연동 | `scripts/unified-bash-pre.js:232-253` | 훅 stdout 재현 (§4.1) |
| **ENH-389** | **P0** | `dd.detect('Bash', toolInput.command)`로 **문자열** 전달 + 매칭 전 공백 정규화·제로폭 제거. JSDoc `:131` 계약 정합 | `unified-bash-pre.js:236`, `lib/control/destructive-detector.js:135` | 객체/문자열 대조표 (§4.1) |
| **ENH-390** | **P0** | heredoc pipe-shell 패턴에 경로접두사·따옴표·백슬래시·wrapper word(`command`/`nice`/`exec`) 허용, `$VAR`는 unknown-interpreter→critical, 델리미터 `\w+`→`[^\s\|;&<>]+` | `lib/defense/heredoc-detector.js:115-207, 219` | 우회 7/10 재현 (§4.1) |
| **ENH-391** | **P1** | bare `/btw`·`/code-review` **런타임 출력**을 `/bkit:` 네임스페이스로 전파. MF-3 재개 | `scripts/cto-stop.js:101`, `scripts/code-review-stop.js:38`, `hooks/startup/session-context.js:619`, 관련 SKILL.md | §4.2 |
| **ENH-392** | **P1** | `tests/`(55 파일)를 `test/run-all.js`·CI에 배선 + heredoc evasion TC 추가 | `test/run-all.js:33`, `.github/workflows/contract-check.yml` | §4.3 |
| **ENH-393** | **P1** | 감사로그 `result` 하드코딩 제거 + `incrementStat` 조건 정정 | `unified-bash-pre.js:244, 249` | §4.1 F-5 (ENH-388에 흡수 가능) |
| **ENH-394** | **P2** | `VALID_EFFORT_LEVELS`를 CC enum(`xhigh`/`max` 포함)에 정렬, 격하→상향 | `lib/domain/guards/invariant-10-effort-aware.js:24` | `/code-review` 문서 시그니처 |
| **ENH-395** | **P2** | `RECOMMENDED_VERSION` 2.1.220 → 2.1.223 + **회귀 테스트 신설**(현재 0건) | `lib/infra/cc-version-checker.js:65` | §4.7 |
| **ENH-396** | **P3** | `WorktreeCreate`/`WorktreeRemove` 등록 — worktree 상태 공백 근본 대응 | `hooks/hooks.json` | §4.6 · 상류 이슈 관찰 후 |
| **ENH-397** | **P3** | `CUSTOMIZATION-GUIDE.md:1481`의 `decision:"allow"` 오안내 정정 | 동 파일 | `cc-payload.port.js:27-36` |

### 5.5 철학 준수

| ENH | Automation First | No Guessing | Docs=Code | 판정 |
|---|---|---|---|---|
| 388 | ✅ 수동 확인 없이 실제 차단 | ✅ 훅 stdout 실증 | ✅ 감사로그가 실제 결정 반영 | **PASS** |
| 389 | ✅ | ✅ 대조표 실증 | ✅ JSDoc 계약 정합 | **PASS** |
| 390 | ✅ | ✅ 7/10 재현 | ✅ 차별화 #6 주장과 코드 일치 | **PASS** |
| 391 | ⚠️ 문자열 수정(자동화 아님) | ✅ file:line 실측 | ✅ 에이전트 산문 ↔ 훅 출력 동기화 | PASS |
| 392 | ✅ **현재가 위반 상태** | ✅ `run-all.js:33` 실측 | — | **PASS (최우선 시정)** |
| 393 | ✅ | ✅ 원장 항목 실증 | ✅ | PASS |
| 394 | ✅ | ✅ 문서 시그니처 1차 출처 | ✅ | PASS |
| 395 | ✅ 테스트 신설로 drift 자동 감지 | ✅ | ✅ | PASS |
| 396 | ✅ | ⚠️ 훅 페이로드 스키마 **UNVERIFIED** | ✅ | 조건부 |
| 397 | — | ✅ | ✅ | PASS |

### 5.6 테스트 영향

| 발견 | 위험 어서션 | 조치 |
|---|---|---|
| ENH-388 배선 추가 | `tests/contract/v2114-defense-contract.test.js:125-128`(C-09)는 require 여부만 검사 — 영향 없음 | `test/integration/hook-behavioral-bash-pre.test.js` 재확인 + 신규 behavioral TC |
| ENH-390 | `tests/qa/v2114-defense-heredoc.test.js` 53 TC 전부 happy-path, 우회 TC 0건 → **깨지지 않음(그게 문제)** | evasion TC 신설 |
| ENH-392 | 배선 즉시 55개 파일이 처음 실행됨 — **신규 실패 다수 가능** | 단계적 배선 권장 |
| ENH-394 | `test/regression/agents-effort.test.js`, `agents-effort-32.test.js` — 34 agents가 low/med/high만 사용하므로 enum **확장**은 비파괴 | 신규 TC만 |
| ENH-395 | **0건** | 회귀 테스트 신설 |

---

## §6. 상시 추적 항목

### 6.1 차별화 streak

| # | 근거 이슈 | 상태 | 이번 창 | 실질 판정 |
|---|---|---|---|---|
| #6 heredoc 방어 | #58904 | CLOSED / NOT_PLANNED (봇 자동종료, 2026-07-06) | 코드수정 bullet 0 → 명목 +2 | 🔴 **실질 훼손** (우회 7건) |
| #3 순차 디스패치 | #56293 | CLOSED / NOT_PLANNED (**2026-08-05 — 이번 창 내**) | 코드수정 bullet 0 → +2 | 🟢 유지 |
| #5 PostToolUse continueOnBlock | #57317 | CLOSED / NOT_PLANNED (2026-06-06) | 코드수정 bullet 0 → +2 | 🟢 유지 |

**해석 변경 필요**: 세 이슈 모두 **봇 비활동 자동종료(NOT_PLANNED)** 로 닫혔습니다. 상류가
"고치지 않기로" 한 것이 아니라 **응답 없이 만료**된 것이므로, 해자는 durable하지만 "streak"라는
지표는 이제 "상류가 아직 안 고쳤다"가 아니라 "상류가 더 이상 추적하지 않는다"를 의미합니다.
지표 의미를 보고서에서 재정의해 두었습니다.

### 6.2 OPEN 이슈 (상류)

| # | 내용 | 최종수정 |
|---|---|---|
| 68110 | 범용 서브에이전트 재귀 무한 스폰 | 2026-07-21 |
| 78406 | 세션당 서브에이전트 spawn cap 환경변수 문서 누락 | 2026-07-17 |
| 64436 | 백그라운드 세션의 work-phase OTEL 유실 | 2026-07-08 |

### 6.3 신규 감시 이슈 (2026-08-03~07 창, 전부 OPEN·미재현)

| # | 내용 | bkit 관련성 |
|---|---|---|
| **84302** | PreToolUse command 훅 kill 시 CLI가 게이트된 툴 **ALLOW(fail-open)** | **최우선** — bkit 방어 전량이 PreToolUse, #139 stall 이력 |
| 84258 | worktree 격리가 `git -C <main>` 을 PreToolUse allow 이후에도 하드 차단 | 격리가 훅 결정을 무시 |
| 83953 | 프로젝트 스코프 훅이 worktree에 미도달, `.claude/` gitignore 시 **완전 부재** | ENH-383/396 상류 근거 |
| 84027 | 하네스가 `.claude/settings.local.json`으로 모든 격리 worktree를 더럽혀 자동정리 무력화 | 동일 |
| 84135 | worktree 격리가 env var 보간 Bash 명령을 거부 (222 명시 회귀) | 동일 |
| 84217 | `disable-model-invocation:true` + `context:fork` 스킬의 인자 유실 | bkit fork 8종 (단 bkit은 `disable-model-invocation` 미사용) |
| 84439 | settings.json의 PostToolUse 훅 미등록 | 차별화 #5 인접 |
| 79560 | 내장 `/code-review`가 타 스킬로부터의 호출 거부 | 이름 해석 스레드 |
| 83848 | 백그라운드 서브에이전트 무음 stall, 하네스는 `completed` 보고 | bkit 오케스트레이션 |

참고: 해당 창에 anthropics/claude-code에 생성된 이슈 총 **997건**
(`gh api "search/issues?q=repo:anthropics/claude-code+type:issue+created:2026-08-03..2026-08-07"` → `total_count`).
08-06은 조회 시점 기준 부분값, 08-07은 미도래.

### 6.4 지속 감시

- **REMOTE-GATE-DRIFT**: 중첩 depth = `env var → tengu_hazel_trellis → 폴백 3`. 결정론적 통제는
  `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` 명시가 유일.
- **MCP 프로토콜 협상**: bkit 두 서버가 `protocolVersion:'2024-11-05'` 하드코딩
  (`servers/bkit-pdca-server/index.js:719-725`, `bkit-analysis-server/index.js:408-414`). 현재 불활성.
- **org-memory 클러스터**: `tengu_org_memory_connected_mode` 신규 추가(CHANGELOG bullet 없음). 차별화 #1 인접.

---

## §7. 결론

### 7.1 CC 호환성

| 항목 | 값 |
|---|---|
| Breaking | **0건** |
| 마이그레이션 필요 | **없음** |
| 연속 호환 릴리스 | **164 → 166** (v2.1.34 ~ v2.1.223) |
| 권장 CC 버전 | **v2.1.223** (현재 코드값 2.1.220 → ENH-395) |

### 7.2 가장 먼저 할 일 (ENH 착수 전)

1. **ENH-388/389/390을 하나의 P0 묶음으로 처리하십시오.** 세 건은 같은 코드 경로의 같은 결함
   클래스이며, 개별 수정 시 부분 방어 상태가 오래 지속됩니다.
2. **ENH-392를 그 직전에 배선하십시오.** 배선 없이 P0를 고치면 수정의 정당성을 증명할 테스트가
   여전히 CI 밖에 남습니다. 다만 배선 즉시 55개 파일이 처음 실행되므로 **신규 실패가 다수 나올 수 있습니다** —
   단계적 배선을 권합니다.
3. **차별화 #6 대외 문구를 ENH-390 완료까지 완화하십시오.** 현재 코드가 "구조적 면역" 주장을
   뒷받침하지 못합니다.
4. **`.bkit/audit/`의 기존 `destructive_blocked` 항목을 신뢰하지 마십시오.** ENH-393 이전 데이터는
   실제 차단 여부와 무관합니다.

### 7.3 이번 사이클의 성격

0-new-ENH 성숙도 streak는 **여기서 종료할 것을 권고합니다.** 그 지표의 기본 전제는
"CC 신기능이 이미 bkit에 커버됨"인데, 이번 P0 3건은 CC 기능이 아니라 **bkit 자체 코드의 확인된 결함**입니다.
CC 호환성은 여전히 완벽(Breaking 0, 166연속)하지만, 그것이 bkit 내부 건전성의 증거는 아니라는 점이
이번 사이클의 핵심 교훈입니다.

---

## 부록 A — 검증 커맨드 (재현용)

```bash
# Phase 1.5 이중 소스 (기계적 카운트 — WebFetch로 세지 말 것: ERRATA-31-1/32-1)
gh api repos/anthropics/claude-code/releases/tags/v2.1.223 --jq .body | grep -c '^- '
curl -sL https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md \
  | perl -ne 'print if /^## 2\.1\.223$/../^## (?!2\.1\.223$)/' | grep -c '^- '
# 대칭차집합 (0이어야 함)
comm -3 <(...CHANGELOG bullets|sort) <(...release bullets|sort)

# 부재 증명은 perl로만 — 이 머신의 grep은 ugrep (ERRATA-32-2)
perl -ne 'print "$ARGV:$.: $_" if m{(?<![:\w-])/btw\b}' scripts/*.js hooks/**/*.js

# 바이너리 정확 리터럴 카운트 (윈도우 diff 금지 — ERRATA-31-2)
perl -e '...index() 루프...' ~/.local/share/claude/versions/2.1.223

# 이름 충돌 모집단 = 공식 명령 레퍼런스 전체 (ERRATA-32-4)
curl -sL https://code.claude.com/docs/en/commands.md \
  | perl -ne 'print "$1\n" if /^\|\s*`?\/([a-z0-9][a-z0-9:._-]*)/' | sort -u > doc-cmds.txt
ls -1 skills/ | sort | comm -12 - doc-cmds.txt      # → btw, code-review

# CRITICAL 재현 (훅은 명령을 실행하지 않고 결정만 출력)
node -e 'const{execFileSync}=require("child_process");
 const p=JSON.stringify({tool_name:"Bash",tool_input:{command:"DROP TABLE users;"},
 hook_event_name:"PreToolUse",session_id:"probe",cwd:process.cwd()});
 console.log(execFileSync("node",["scripts/unified-bash-pre.js"],{input:p,encoding:"utf8"}))'
# → "Bash command validated."  (감사로그에는 result:"blocked" 로 기록됨)

# 아키텍처 실측
ls -1 skills/ | wc -l          # 44
ls -1 agents/ | wc -l          # 34
find lib -name '*.js' | wc -l  # 195
ls -1 scripts/ | wc -l         # 67
find test  -name '*.test.js' | wc -l   # 292  (run-all.js 커버)
find tests -name '*.test.js' | wc -l   # 55   (러너·CI 양쪽 밖)

# ENH 번호 SSoT (원장)
perl -ne 'while(/ENH-(\d+)/g){print "$1\n"}' CHANGELOG.md | sort -n | uniq | tail -1   # 380
```
