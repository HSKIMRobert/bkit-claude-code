# CC v2.1.226 → v2.1.227 영향 분석 보고서 (사이클 #36)

- **분석일**: 2026-08-11
- **범위**: CC CLI v2.1.226 → v2.1.227 (단일 버전 델타)
- **설치 CC**: 2.1.227 · **npm latest**: 2.1.227 · **npm stable**: 2.1.220 (7릴리스째 고정)
- **bkit plugin**: v2.1.35 (HEAD `3352f26`, clean)
- **판정**: **Breaking 0 — 마이그레이션 불요.** 누적 연속 호환 **169 → 170 (조건부 인증)**
- **RECOMMENDED_VERSION 권고**: **2.1.220 유지 (HOLD) + KNOWN_BAD 집합 도입 (ENH-437)**

---

## Executive Summary

이번 사이클의 헤드라인은 CC 변경이 아닙니다. **CC 조사 과정에서 bkit이 4년 가까이
대외적으로 광고해 온 차별화 #5(`PostToolUse continueOnBlock`)가 "미구현"이 아니라
"CC 스키마상 구현 불가능한 명세"였음이 바이너리 실측으로 확정된 것**입니다.

그리고 이것은 v2.1.35의 헤드라인(측정해보니 거짓이던 worktree 경고)과 같은 계열이되,
**한 가지 점에서 더 나쁩니다** — 이번에는 자동 검증 테스트가 3개나 존재했고,
그 테스트들이 *산문 문자열과 enum 항목*을 검사하는 방식이었기 때문에
**위반을 은폐하고 있었습니다.**

CC v2.1.227 자체는 릴리스 노트가 말하는 것과 실체가 다릅니다. 노트는 "Fixed 3 /
Improved 2"이지만 실측은 **JS 페이로드 +5.37MB의 광범위한 재빌드**이며,
**bullet에 전혀 등장하지 않는 신규 서브시스템이 최소 3종** 들어왔습니다.
그럼에도 bkit이 의존하는 훅 계약 문자열은 **전량 불변**이고, 유일한 형태 델타
(`"PreToolUse"` +1)는 신규 함수의 내부 분기로 귀속이 끝났습니다.

### 4-관점 가치 평가

| 관점 | 평가 |
|---|---|
| **사용자** | 업그레이드는 **호환성 측면에서 안전하나, 227은 권장하지 않음**. 훅 계약은 무변화이지만 #85665(인터랙티브 세션 transcript JSONL 전면 미기록)가 227 특정 회귀. **권장 버전 2.1.220 유지** |
| **개발자** | **CC 대응 코드 변경 소요 0건.** 대신 이번 조사가 bkit 자체 결함 4건을 새로 확정했고, 그중 1건(ENH-432)은 대외 광고 문구 철회가 필요한 P0 |
| **아키텍처** | `bashCommandClamp`(CC 네이티브 allowlist형 Bash 클램프)의 등장이 bkit 차별화 #6과 **극성이 반대**라 대체가 아니라 보완 관계임이 확정. 단 현재는 워크플로 스크립트 전용이라 bkit이 **도달할 수 없음** |
| **비즈니스** | **대외 문구 2건을 즉시 정정해야 함** — 차별화 #5 주장(구현 불가)과 marketplace.json의 아키텍처 카운트 5개 항목 드리프트 |

### 이번 사이클에서 확정된 것 (요약)

1. **v2.1.227은 버그픽스 릴리스가 아니라 페이로드 전면 재빌드**다 (+5,415,936 B, 세그먼트 산술 정확 일치, 네이티브 코드는 23바이트만 변경).
2. **미문서화 신규 서브시스템 3종** — `bashCommandClamp`(42회), `deviceRegistry`/`deviceBind`(65회), 스토리지 v5. CC 공식 문서 6개 페이지 전체에서 `bashCommandClamp` **0회**.
3. **서브에이전트 handoff fail-open 조건이 확대**됐다 (미문서화). 사이클 #34의 F-1을 잇는 4번째 인스턴스.
4. **bkit 훅 계약은 전량 불변** — 이것이 Breaking 0 판정의 직접 근거다.
5. **차별화 #5는 구현 불가 명세**였다 (ENH-432, P0 철회).
6. 직전 사이클 #35의 산출물 **ENH-420/421/422가 전부 미착지**했고, 그 결과 이번 사이클이 동일한 수작업 비용을 재지불했다.

---

## 1. 사이클 번호 정정 (선행 사항)

작업 착수 시점의 롤링 메모리는 baseline을 v2.1.225로 기록하고 있었으나, 이는
**stale**이었습니다. 저장소 확인 결과:

- `docs/04-report/features/cc-v2225-v2226-impact-analysis.report.ko.md` (분석일 2026-08-09, 커밋 `a8b3072`)가 **이미 존재** — 사이클 #35는 v2.1.225 → v2.1.226으로 완료됨
- 따라서 이번 실행은 **사이클 #36**, 범위는 **v2.1.226 → v2.1.227**
- 연속 호환 출발점은 168이 아니라 **169**
- ENH 원장 최고는 380/424가 아니라 **431** (`CHANGELOG.md:136` `ENH-424, 425, 426, 427, 428, 429, 430, 431`) → 신규는 **432부터**

이 정정은 Phase 1 조사 에이전트 실행 중에 발견되어 즉시 전달되었고,
에이전트의 Q1(225 vs 226 동등성 재검증)이 폐기되고 Q1'(226 vs 227 실측)으로
교체되었습니다.

---

## 2. Phase 1.5 — Raw Source Verification Gate

**게이트 판정: PASS.** ERRATA-31-1에 따라 메인 세션이 총계를 기계적으로 먼저
확정한 뒤 에이전트에 전제로 제공했으므로, 카운트 errata **0건** (3사이클 연속 성공).

| 필드 | 에이전트 보고 | Raw 검증 | 출처 | 판정 |
|---|---|---|---|---|
| Added | (전제 제공) | 0 | raw CHANGELOG | match |
| Fixed | (전제 제공) | **3** | raw CHANGELOG | match |
| Improved | (전제 제공) | **2** | raw CHANGELOG | match |
| Breaking | (전제 제공) | **0** | raw CHANGELOG | match |
| Total bullets (범위) | (전제 제공) | **6** (226:1 + 227:5) | 합계 | match |

**취득 방법** (WebFetch 미사용 — ERRATA-31-1 유지):

```bash
curl -sL https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md
gh api repos/anthropics/claude-code/releases/tags/v2.1.227 --jq '.body'
```

**대조 결과**: raw CHANGELOG의 bullet 집합과 GH release body의 bullet 집합이
**md5까지 동일**.

| 버전 | raw md5 | gh md5 | 대칭차집합 |
|---|---|---|---|
| v2.1.226 | `0d58a8d82b1b95b8da6e79ccc2998545` | 동일 | **0** |
| v2.1.227 | `bff2f4817e7fc0d692ae82380ffc6ec1` | 동일 | **0** |

**v2.1.227 CHANGELOG 절 전문 (verbatim)**:

```
## 2.1.227

- Fixed feature flags being evaluated without the user's subscription tier when a session started with an expired login token, which could wrongly prompt Max plan users to enable usage credits for Fable
- Fixed every Bash command failing under `claude-code-action` with `allowed_non_write_users` on GitHub-hosted runners
- Fixed `/tui` bringing back a conversation that had been rewound to before its first message
- Improved slash-command menu: blue now marks only the selected row, matched characters are bolded instead of recolored, and emoji or accented names keep their glyphs
- Improved performance: fewer event-loop stalls on file-not-found suggestions and at-mention size checks
```

**카테고리 도출**: `### Added` 같은 하위 제목은 존재하지 않으며, 카테고리는 bullet
첫 단어에서 파생했습니다 (ERRATA-33-1 재확인). `Fixed` 3 / `Improved` 2 / `Bug` 1(226).

**릴리스 타이밍** (ERRATA-34-4 준수 — 동일 버전끼리 앵커링):

| 버전 | npm 공개 | GH 릴리스 | 지연 |
|---|---|---|---|
| v2.1.225 | 2026-08-07T23:08:56Z | 2026-08-08T01:09:26Z | +2.01h |
| v2.1.226 | 2026-08-08T01:53:22Z | 2026-08-08T02:48:05Z | +0.91h |
| v2.1.227 | 2026-08-10T20:56:57Z | 2026-08-10T22:56:53Z | +2.00h |

전 구간 정상 범위입니다.

---

## 3. CC 버전 변경사항 조사

### 3.0 조사 신뢰도 공개 (선행 필수)

Phase 1 조사 에이전트는 **자체 오류 1건을 자진 신고**했습니다: 반환되지 않은
서브에이전트의 결과를 인용한 것처럼 서술한 사례(ERRATA-36-1). 해당 인용은 전량
철회되었고, **본 보고서에 채택된 모든 CC측 정량 주장은 메인 세션이 독립적으로
재현 검증한 것만** 남겼습니다.

또한 조사 에이전트의 8개 서브에이전트 중 **GitHub 이슈 담당과 문서 담당이
반환되지 않아**, 해당 두 영역(§3.4, §3.5)은 **메인 세션이 직접 수행**했습니다.

### 3.1 바이너리 실측 — 이번 사이클의 본체

세 버전 바이너리가 모두 로컬에 존재하여 직접 비교했습니다
(`~/.local/share/claude/versions/{2.1.225,2.1.226,2.1.227}`).

#### 파일·세그먼트 수준

| 항목 | 2.1.225 | 2.1.226 | 2.1.227 |
|---|---|---|---|
| 파일 크기 | 289,284,768 B | 289,284,768 B | **294,700,704 B** |
| `__TEXT` | 71,524,352 | 71,524,352 | 71,524,352 |
| `__DATA_CONST` | 1,409,024 | 1,409,024 | 1,409,024 |
| `__DATA` | 151,552 | 151,552 | 151,552 |
| `__BUN` | 213,696,512 | 213,696,512 | **219,070,464** |
| `__LINKEDIT` | 2,503,328 | 2,503,328 | **2,545,312** |

**226 → 227 델타 = +5,415,936 B**이며, 이는 `__BUN` **+5,373,952** +
`__LINKEDIT` **+41,984** 의 합과 **정확히 일치**합니다. 네이티브 코드 세그먼트
3종의 크기는 **전부 불변**입니다.

재현:
```bash
otool -l ~/.local/share/claude/versions/2.1.227 | \
  perl -ne 'if(/^\s+segname\s+(\S+)/){$s=$1} if(/^\s+filesize\s+(\d+)/ && $s){print "$s $1\n"; $s=undef}'
```

#### 네이티브 영역 바이트 동일성

`[0, 73084928)` 구간(= `__TEXT` + `__DATA_CONST` + `__DATA`, `__BUN` 시작 직전)의
sha256:

| 버전 | sha256 |
|---|---|
| 2.1.225 | `c7fe71b829670748c88b69d7eb5352687273183526b8e053093e80622d5551e7` |
| 2.1.226 | `c7fe71b829670748c88b69d7eb5352687273183526b8e053093e80622d5551e7` |
| 2.1.227 | `bbe7942335af7383ad81b5287eae1c933dbf559df4428bcc6271e30c991002fa` |

**225 ≡ 226 바이트 동일** (사이클 #35 결론 재확인).

재현: `head -c 73084928 <binary> | shasum -a 256`

#### 차이 바이트의 세그먼트 분포

| 비교 | 총 차이 | 네이티브 영역 | `__BUN` | `__LINKEDIT` |
|---|---|---|---|---|
| 225 vs 226 | 918,852 | **0** | 464,864 | 453,988 |
| 226 vs 227 (네이티브만) | — | **23** (offset 2035~2735, load-command 테이블) | — | — |

**→ v2.1.227의 변경은 전량 JS 페이로드에 있습니다.** 네이티브 코드는 load command
테이블의 23바이트(세그먼트 크기·오프셋 기재값)만 바뀌었습니다.

> **ERRATA-36-8 (HIGH, 방법론)**: npm 패키지의 `unpackedSize`(166,777 B)는
> 실제 런타임 바이너리(289 MB)와 3자리 수 규모가 다릅니다. npm 아티팩트는
> 바이너리를 내려받는 **래퍼 스텁**이므로, `unpackedSize`의 버전 간 일치는
> 런타임 동등성에 대해 **아무런 정보도 담지 않습니다.** 사이클 #35에서
> 이 값을 근거로 삼으려 한 추론은 근거로 쓸 수 없습니다. (단 #35의 결론
> 자체는 별도의 JS 본문 비교로 도출되었으므로 유효합니다.)

### 3.2 훅 계약 표면 — 전 항목 불변 (Breaking 0의 직접 근거)

원본 바이너리에서 `grep -a -o -F`로 정확 출현 횟수를 셌습니다
(`strings` 청킹 아티팩트 배제 — ERRATA-35-1).

| 토큰 | 225 | 226 | 227 | 판정 |
|---|---|---|---|---|
| `hookSpecificOutput` | 124 | 124 | 124 | **match** |
| `continueOnBlock` | 3 | 3 | 3 | **match** |
| `permissionDecision` | 34 | 34 | 34 | **match** |
| `permissions.deny` | 9 | 9 | 9 | **match** |
| `forked_skill_depth_cap` | 2 | 2 | 2 | **match** |
| `"PreToolUse"` (인용) | 31 | 31 | **32** | **+1 — §3.3에서 귀속** |
| `PreToolUse` (무인용) | 133 | 133 | **135** | +2 (1건 미귀속) |

재현: `grep -a -o -F -- '<token>' <binary> | wc -l`

### 3.3 `"PreToolUse"` +1 귀속 — 성공

227에만 존재하는 신규 제너레이터 함수(offset ≈ 271,127,532) 내부의 비교문:

```js
let t = e.hookInput.hook_event_name === "PreToolUse";
```

이 함수는 16개 훅 디스패치 지점을 감싸는 결과 필터이며 **226에 존재하지 않습니다.**
인용형 +1은 이것으로 귀속 완료 — **계약 변경이 아니라 신규 함수의 내부 분기**입니다.

**UNVERIFIED**: 무인용 `PreToolUse` +2 중 **1건은 미귀속**으로 남았습니다.

### 3.4 미문서화 신규 서브시스템 3종

#### F-3. `bashCommandClamp` (0 → 42) — 이번 사이클 최대 논점

CC가 `agent()` 스폰 시점에 **allowlist형 Bash 명령 클램프**를 네이티브로
제공하기 시작했습니다. 227 바이너리에서 직접 추출한 원문:

```
denied: this agent carries a per-spawn bashCommandClamp, which scopes shell
execution to a fixed set of Bash command forms

agent() opts.bashCommandClamp entry '${…}' must be a '${…}(<command or prefix>)' permission rule
agent() opts.bashCommandClamp can bind nothing: the spawned agent's resolved tool pool has no ${…}

function …(e){ let t = …(e).bashCommandClamps; if(t !== void 0 && t.length > 0) return { behavior:"deny", … }
case "bash_command_clamp": t = { …t, bashCommandClamps: [ …t.bashCommandClamps ?? [], o.rules ] }
```

부가 의미 (바이너리 실측):
- **additive** — 에이전트 정의의 deny와 스폰의 `disallowedTools`를 모두 유지하고, clamp 존재 시 `mcp__*` 전체와 `PowerShell`·`REPL`을 추가 차단
- **fail-closed** — 결정된 tool pool에 `Bash`가 없거나 `toolAliases`가 재매핑하면 **스폰 자체를 거부**. 분해 불가 명령(치환·제어흐름)은 `unverifiable`로 deny
- **상속** — 자식의 중첩 스폰에 전파

**문서화 상태: 전무.** CC 공식 문서 6개 페이지에서 `bashCommandClamp` 및
`clamp` 문자열 **0회**:

| 문서 | `bashCommandClamp` | `clamp` |
|---|---|---|
| `workflows.md` | 0 | 0 |
| `sub-agents.md` | 0 | 0 |
| `permissions.md` | 0 | 0 |
| `permission-modes.md` | 0 | 0 |
| `agents.md` | 0 | 0 |
| `settings.md` | 0 | 0 |

재현 (ERRATA-34-1 준수 — `code.claude.com` 경로):
```bash
curl -sL https://code.claude.com/docs/llms.txt          # 전체 색인 (193행)
curl -sL https://code.claude.com/docs/en/workflows.md
```

GitHub 이슈 언급도 **0건**.

#### F-4. `deviceRegistry` / `deviceBind` (0 → 38 / 0 → 27)

영속 디바이스 키 발급·바인딩 체계. 227 바이너리 원문:

```
[deviceRegistry] register status=
[deviceRegistry] registered device row=
[deviceRegistry] stored device key is unreadable; minting a new one
deviceRegistry: device key revoked server-side; a new key will be minted on the next registration
[deviceBind] malformed UUID
[deviceBind] create returned 200 but the session is not bound to this device; continuing unbound
```

**bkit 기능 접점 0** — 단 **서버측 폐기가 가능한 영속 식별자**라는 성격상
`PRIVACY.md` 현황 기술과의 정합성 검토 대상입니다 (기존 ENH-404 근거 강화).

#### F-5. 스토리지 v5 마이그레이션

`v5 write failed` 4 → 26, `importSessionToStore` 8 → 28. 대상은 plan workshop
문서, changelog 캐시, `adopt.json`, classifier link record 등입니다.
**bkit 설정 경로와 접점 없음.**

### 3.5 F-2. 서브에이전트 handoff fail-open 확대 (미문서화, HIGH)

| 버전 | 문자열 |
|---|---|
| 2.1.226 | `Handoff classifier unavailable, allowing sub-agent output with warning` |
| 2.1.227 | `Handoff classifier unavailable **or failed closed without a verdict**, allowing sub-agent output with warning` |

부수 카운트: `refusedBySafeguard` 13 → **12**, `UNREVIEWED` 1 → **2**.

**의미**: fail-open 발동 조건이 "분류기를 사용할 수 없는 경우"에서
**"판정 없이 fail-closed된 경우까지"** 확대되었습니다. 즉 안전 분류기가
보수적으로 닫혔을 때조차 서브에이전트 출력이 경고와 함께 통과합니다.

**bullet 언급 0건.** 이는 사이클 #34에서 확정한 F-1(3번째 fail-open)을 잇는
**4번째 인스턴스**입니다.

> **구조적 제약 (사이클 #34에서 확정, 이번에도 유효)**: CC는 이 경고를
> transcript 산문으로만 전달하므로 **bkit 훅으로 관측·차단이 불가능**합니다.
> 따라서 훅 기반 대응 ENH는 제안하지 않습니다.

### 3.6 bullet별 실측 판정

| # | bullet 요지 | 실측 근거 | 판정 |
|---|---|---|---|
| ① | 만료 토큰 → Max 플랜에 Fable credit 오유도 | `claude-fable` 50/50/50, `resolveModel` 2/2/2 **불변** | 모델 alias 해석 무변화 |
| ② | `claude-code-action` + `allowed_non_write_users` → Bash 전량 실패 | `claude-code-action` 21, `allowed_non_write_users` 4, `GITHUB_ACTIONS` 22 — **전부 불변** | **CLI 바이너리에서 위치 특정 실패**. 수정이 CLI 밖(action 저장소)일 가능성 |
| ③ | `/tui` rewind 대화 부활 | `/tui` 22, `rewind` 185, `checkpoint` 69 — 전부 불변 | 순수 제어흐름 수정 |
| ④ | slash 메뉴 색상·볼드·**글리프 보존** | `NFC` 108→**114**, `NFD` 5→**7**, `normalize(` 194→**199**, `isSelected` 57→**61**, `slashCommand` 18→**22**. **불변**: `stringWidth` 3, `Intl.Segmenter` 10, `graphem` 63 | **유니코드 정규화 수정**이지 폭·grapheme 처리 변경 아님 |
| ⑤ | file-not-found 제안·at-mention event-loop stall 감소 | `existsSync` −3이나 `statSync` **+5**, `readFileSync` **+1** = 순 **+3 동기 호출** | **sync→async 전환이 아니라 스케줄링 수정** |

> **ERRATA-36-7**: 릴리스 노트의 어휘가 바이너리에 존재하지 않는 경우가 흔합니다
> (`subscriptionTier`, `usageCredits`, `Max plan`, `allowedNonWriteUsers` = 3버전 모두 0).
> **CHANGELOG는 코드 인덱스가 아닙니다.** bullet의 어휘로 바이너리를 검색해
> 0건이 나왔다고 해서 그 수정이 없었다는 뜻이 아닙니다.

### 3.7 GitHub 이슈 (메인 세션 직접 수행)

#### 추적 중 이슈 상태 델타

`gh api`로 개별 조회했습니다 (ERRATA-33-2 준수 — `gh issue list --limit`의 무음 절단 회피).

| 분류 | 이슈 | 상태 |
|---|---|---|
| **PreToolUse 위협군 5건** | #84302, #84701, #84632, #84697, #84926 | **전부 OPEN 유지** |
| worktree | #84685, #84493 | OPEN |
| 224 회귀 | #84892, #84925, #84960 | OPEN |
| 기타 | #84589, #84969, #84939, #84863, #84906, #84656, #78406, #68110, #64436 | OPEN |
| 정보 0 종결 | #84524 | **CLOSED** (2026-08-06) |

**v2.1.227에서 해소된 추적 이슈는 0건입니다.**

`hooks.md`의 PreToolUse command 훅 timeout fail-open/closed 계약 부재(#84656)도
재확인했습니다 — `hooks.md:1231`은 **Agent SDK 콜백 훅의 UserPromptSubmit**만
규정하며, command 훅 계약은 여전히 없습니다.

#### 창 내 신규 이슈

기간 2026-08-08 ~ 2026-08-11 신규 이슈 **749건**.
일별 183 / 264 / 253 / 49 → 합계 일치, **절단 없음 증명**.

재현:
```bash
gh api -X GET search/issues \
  -f q='repo:anthropics/claude-code is:issue created:2026-08-08..2026-08-11' \
  -f per_page=1 --jq '.total_count'
```

#### v2.1.227 관련 신규 이슈 (중요)

| 이슈 | 제목 | bkit 관련성 |
|---|---|---|
| **#85665** | `[Bug] 2.1.227: interactive sessions never write transcript JSONL (headless -p unaffected); regression boundary measured from 2.1.226` | **227 특정 회귀.** §4.5 참조 |
| **#85669** | `UserPromptSubmit hook not invoked when prompt contains an attachment (VSCode extension)` | **HIGH — §4.4 참조** |
| **#85699** | 세션이 자기 effective permission mode를 알 수 없어 모델이 `settings.json`의 `defaultMode`를 읽고 확신에 찬 오보 (2.1.227) | bkit 자동화 레벨 보고와 인접 |
| **#85700** | worktree + PreToolUse 훅 환경에서 Edit이 성공 보고·읽기 확인까지 하고도 디스크에 미기록 | Write/Edit deny 클러스터 확장 |

`bashCommandClamp` 언급 이슈 **0건**. `deviceRegistry` 2건은 둘 다 Linux 세션
링크 문제로 **신규 기능과 무관**.

> **주의**: v2.1.227은 게시 24시간 미만입니다. 회귀 신고 수를 품질 근거로
> 사용해서는 안 됩니다 (사이클 #33 이후 유지되는 규칙).

---

## 4. bkit 영향 분석

### 4.0 아키텍처 실측 (메인 세션 독립 측정)

Numeric Correction Protocol에 따라 메인 세션이 직접 측정했습니다.

| 항목 | 측정값 | 명령 |
|---|---|---|
| Agents | **34** | `ls -1 agents/*.md \| wc -l` |
| Skills | **44** | `ls -1d skills/*/ \| wc -l` |
| Lib modules | **198** (22 subdirs) | `find lib -name '*.js' -type f \| wc -l` |
| Scripts | **66** | `find scripts -name '*.js' -type f \| wc -l` |
| Hook events | **21** (24 blocks / 28 handlers) | `hooks/hooks.json` 파싱 |
| Tests | `test/` **338** + `tests/` **33** | `find <dir> -name '*.test.js' \| wc -l` |
| plugin version | **2.1.35** | `.claude-plugin/plugin.json` |

> **정의 주의 (errata 아님)**: `scripts` 카운트는 정의에 따라 62(`ls -1 scripts/*.js`,
> 최상위만) / **66**(`find`, 하위 디렉터리 `scripts/lib`·`scripts/qa` 포함) /
> 67(`ls -1 scripts/` 엔트리 수, 디렉터리 포함)로 갈립니다. 본 보고서는 **66**을 씁니다.

> **정정 — 사이클 #35 §10**: #35 보고서는 "Hook events (등록) 12"로 기록했으나
> 실측은 **21**입니다. 또한 "Lib modules 197"은 현재 **198**입니다.

**등록된 21개 훅 이벤트**: SessionStart, PreToolUse, PostToolUse, Stop,
StopFailure, UserPromptSubmit, UserPromptExpansion, PreCompact, PostCompact,
TaskCompleted, SubagentStart, SubagentStop, TeammateIdle, SessionEnd,
PostToolUseFailure, InstructionsLoaded, ConfigChange, PermissionRequest,
Notification, CwdChanged, TaskCreated

### 4.1 컴포넌트 영향 매트릭스

| 컴포넌트 | 실측 규모 | 영향 | 근거 |
|---|---|---|---|
| **Hook events** | 21 / 24 blocks / 28 handlers | **없음** | 계약 문자열 전량 불변 (§3.2). 유일 델타 `"PreToolUse"` +1은 신규 함수 내부 분기로 귀속 완료 (§3.3) |
| **Agents** | 34 | **없음** (자체 결함 1건 별도) | CC 에이전트 frontmatter 스키마 19키 중 bkit 사용 10키. 비스키마 키는 무시되며 로딩 실패를 일으키지 않음 (§4.3) |
| **Skills** | 44 | **없음** | `bashCommandClamp`는 스킬 표면과 무관. bullet ④는 글리프 **보존** 개선이므로 순수 이득 |
| **Lib modules** | 198 | **없음** | 227 델타 중 lib이 소비하는 CC 표면 0 |
| **Scripts** | 66 | **없음** (자체 결함 2건 별도) | stdin/stdout 프로토콜 문자열 불변 |
| **MCP servers** | 2 (19 tools) | **없음** | `protocolVersion` 80 · `2024-11-05` 8 불변. 서버 코드에 훅 계약 참조 0건 |
| **CI workflows** | 2 | **면역** | `claude-code-action` 사용 0건 → bullet ② 완전 무관 |
| **plugin.json** | — | **순수 이득** | `:4` `displayName` = `"bkit — AI Native Development OS"`에 U+2014 EM DASH 1자. bullet ④가 이 글리프를 보존 |
| **조건부 훅 `if`** | 4곳 | **모니터링** | `:29`/`:35` `Write|Edit(skills/**/SKILL.md)`, `:63`/`:69` `Write|Edit(docs/**/*.md)`. CC #84632/#84925 노출면이나 227에서 변화 없음 |

### 4.2 `bashCommandClamp` vs bkit 차별화 #6 — **보완적 관계**

#### 4.2.1 선행 정정 — 차별화 #6은 HEAD에서 정상 동작한다

롤링 메모리는 차별화 #6이 "3사이클 연속 훼손" 상태(`unified-bash-pre.js:232-253`이
감사에 `result:'blocked'`를 기록하면서 실제로는 미차단)라고 기록하고 있었으나,
**HEAD에서 전량 해소되었음을 메인 세션이 직접 확인했습니다.**

| 지목된 결함 | HEAD 상태 | 근거 |
|---|---|---|
| 감사엔 `blocked` 기록, 실제 미차단 | **해소** | 현재 `:264-305`. `blocked = true`(`:303`) + `outputBlockWithContext(...)`(`:304`). 감사는 **실제 차단 경로에서만** 기록 (ENH-388/393) |
| 입력 객체 오전달로 앵커 규칙 무력화 | **해소** | `:262` `dd.detect('Bash', toolInput.command || '')` — 문자열 전달 (ENH-389) |
| scope-limiter dead block | **제거** | 제거 사실과 무해증명이 주석으로 기록됨 |
| Memory Enforcer `outputBlock` arity 버그 | **해소** | `:556` `outputBlockWithContext(reason, alternatives, 'PreToolUse')` (ENH-410) |

`unified-bash-pre.js`의 실제 차단 호출부는 현재 **6곳**입니다
(`:144`, `:183`, `:304`, `:367`, `:431`, `:556`).

**→ 메모리의 "차별화 #6 훼손 3사이클 연속" 기록은 stale이며, 본 보고서로 종결합니다.**

#### 4.2.2 관계 판정: 대체가 아니라 보완 — **극성이 반대**

- **bkit 차별화 #6 = denylist** — `lib/defense/heredoc-detector.js`가 `<<EOF | bash` 류 우회를 탐지해 차단
- **CC `bashCommandClamp` = allowlist** — 스폰된 에이전트의 셸 실행을 고정된 명령 형태 집합으로 제한

bkit은 이미 CC의 permission-rule 문법을 에이전트 정의에 쓰고 있습니다
(예: `agents/cto-lead.md:18-20`의 `"Bash(rm -rf*)"`, `"Bash(git push*)"`,
`"Bash(git reset --hard*)"`). 그러나 이런 3패턴 denylist는 구성상 우회 가능합니다
(`/bin/rm -rf`, `rm -fr`, 공백 변형 등). **clamp는 극성이 반대라 그 우회류가
원리적으로 성립하지 않습니다.**

**판정: (b) 보완적.** clamp는 차별화 #6을 대체하지 않고, bkit이 갖지 못한 극성을 채웁니다.

#### 4.2.3 그러나 현재 bkit은 도달할 수 없다 — 그리고 실패 모드가 위험하다

`bashCommandClamp`는 **워크플로 스크립트(`.claude/workflows/*.js`)의 `agent()` opts
전용**입니다. 바이너리에서 `{kind:"bash_command_clamp"}` 생성 지점은 1개뿐이고,
인메모리 권한 스택에 push되며 어떤 파일에서도 역직렬화되지 않습니다.

CC 에이전트 frontmatter 스키마 19키에 `bashCommandClamp`는 **없습니다**:
`name, description, model, tools, disallowedTools, color, effort, permissionMode,
mcpServers, hooks, maxTurns, skills, initialPrompt, memory, background,
isolation, observer, observerMessage, observeSubagents`

**결정적**: 이 스키마의 `.strict()` 검증기는 **shadow validator**로, 로딩을
게이팅하지 않습니다 — 미지 키에 대해 텔레메트리만 발생시키고 반환값은 버려집니다.
게다가 **플러그인 번들 에이전트는 shadow 검사를 아예 건너뜁니다.**

**→ `bashCommandClamp:`를 `agents/*.md`에 넣으면 조용히 무시됩니다.**
채택한 것처럼 보이면서 아무것도 강제하지 않는 실패 모드이므로,
**어떤 채택 시도도 frontmatter 편집만으로는 불가하며 런타임 검증을 동반해야 합니다.**

현 시점 권고: **채택하지 않음.** 도달 경로가 열리면 재검토합니다 (ENH-439 MON 등록).

### 4.3 F-12 (P0) — 차별화 #5는 미구현이 아니라 **구현 불가 명세**였다

이번 사이클의 헤드라인입니다.

#### 근본원인 (바이너리 실측, 메인 재현 완료)

`continueOnBlock`은 훅이 stdout으로 방출하는 필드가 **아닙니다**.
227 바이너리의 3개 지점이 일관되게 이를 보여줍니다:

**(1) offset 87,115,617 — 스키마 키 목록**
```
… prompt … model … continueOnBlock … server … allowedEnvVars …
BashCommandHookSchema … PromptHookSchema … HttpHookSchema … AgentHookSchema … McpToolHookSchema
```
`continueOnBlock`이 **훅 정의 스키마의 키** 목록에 위치합니다.

**(2) offset 259,698,907 — 필드 정의와 설명문**
```js
timeout: …optional().describe("Timeout in seconds for this specific prompt evaluation"),
model:   …optional().describe('Model to use for this prompt hook (e.g., "claude-sonnet-5"). …'),
continueOnBlock: …optional().describe(
  `Sets the continue value for the decision:"block" produced when ok is false.
   Default false (turn ends). Whether continue:true lets the turn proceed depends on
   the event's decision:"block" semantics. On PostToolUse, the reason is fed b…`)
```
인접 필드가 "for this specific **prompt** evaluation" / "Model to use for this
**prompt hook**"이므로, 이는 **prompt 타입 훅 정의의 설정 필드**입니다.

**(3) offset 271,071,646 — 소비 지점**
```js
preventContinuation: !c && e.continueOnBlock !== !0,
```
`e`는 **훅 정의 객체**입니다 (같은 반환 객체에서 `e.prompt`를 사용).
훅의 stdout이 아니라 **설정에서 읽습니다**.

#### bkit이 이를 쓸 수 없는 이유

bkit의 훅 핸들러 **28개가 전부 `"type": "command"`**입니다.

재현:
```bash
node -e 'const j=require("./hooks/hooks.json").hooks; const t={}; let n=0;
for(const k of Object.keys(j)) for(const b of j[k]||[]) for(const h of b.hooks||[]){n++;t[h.type]=(t[h.type]||0)+1;}
console.log(n, JSON.stringify(t));'
# → 28 {"command":28}
```

`continueOnBlock`은 **prompt 타입 훅 정의**의 필드이므로, command 훅인 bkit이
방출하거나 사용할 방법이 **원리적으로 없습니다**.

바이너리 카운트가 3버전 내내 `3/3/3`으로 안정적이었던 것은
"이 필드가 존재한다"는 뜻이었지 "bkit이 가정한 표면에 있다"는 뜻이 아니었습니다.

#### 사망 범위

| 산출물 | 상태 |
|---|---|
| `.claude-plugin/marketplace.json:36` | **대외 광고**: "v2.1.14 6 differentiations (… **PostToolUse continueOnBlock** …)" |
| `scripts/unified-bash-post.js:180-183` | 주석이 "emit hookSpecificOutput with continueOnBlock=true"라고 **규정** |
| `scripts/unified-bash-post.js:184` | 실제 코드는 `outputAllow('', 'PostToolUse')` — **방출 없음** |
| `lib/audit/audit-logger.js:72` | `post_tool_block_recorded` enum 항목 — **방출자 0** |
| `test/contract/v2114-doc-contract.test.js:71-79` (C-07) | **산문 문자열**이 `agents/cc-version-researcher.md`에 있는지 단언 |
| `test/contract/v2114-defense-contract.test.js:126` | enum **항목 존재**만 단언 |

#### 철학 판정

| 원칙 | 판정 | 사유 |
|---|---|---|
| **No Guessing** | **위반** | ENH-303 설계 시 CC 문서·바이너리 확인 없이 표면을 가정 |
| **Docs = Code** | **위반** | 설계·계획·리포트·enum·마켓플레이스가 코드에 없는 기능을 기술 |
| **Automation First** | **위반 (최악)** | 자동 검증이 존재했으나 *산문과 enum*을 검사하여 **위반을 은폐** |

**v2.1.35 헤드라인과의 관계**: v2.1.35는 "측정해보니 거짓이던 worktree 경고"를
철회했습니다. F-12는 **같은 계열이되 더 나쁩니다** — 그때는 검증이 없었고,
이번엔 검증이 3개 있었는데 그것들이 잘못된 대상(산문·enum)을 검사하여
위반을 통과시켰습니다.

**→ 올바른 조치는 구현이 아니라 철회입니다 (ENH-432, P0).**

### 4.4 F-D: #85669 (UserPromptSubmit 첨부 우회) — **HIGH, 대체 경로 없음**

ENH-371/372가 "이중 배선"으로 기술되어 있으나, **두 핸들러는 동등하지 않습니다.**

`scripts/user-prompt-expansion-handler.js:51-53`:
```js
// Filter 1: only bkit's own plugin slash commands (e.g. /simplify has a
// different command_source and must be a no-op here).
if (input.command_source !== 'plugin') {
  process.exit(0);
}
```

UserPromptExpansion 경로는 **`/bkit:<skill>` 슬래시 명령에서만** 동작합니다.
첨부가 달린 **일반 산문 프롬프트**는 애초에 이 핸들러의 대상이 아닙니다.

따라서 #85669가 발현하면 `scripts/user-prompt-handler.js`의 다음 기능이
**전부 조용히 죽고 대체 경로가 없습니다**:

| 죽는 기능 | 위치 |
|---|---|
| New Feature Intent 감지 → `/pdca-plan` 유도 | `:111-122` |
| 암묵 agent 트리거 | `:125-136` |
| 암묵 skill 트리거 | `:139-150` |
| CC `/simplify`·`/batch` 인지 | `:153-167` |
| bkend MCP 미설정 안내 | `:170-183` |
| **Ambiguity 감지 + AskUserQuestion (H-02)** | `:187-214` |
| Team Mode 자동 제안 | `:217-242` |
| 스킬 템플릿 import 주입 | `:245-283` |
| **sessionTitle 발행 (ENH-227)** | `:290` |
| IntentRouter 구조화 제안 (ENH-371) | `:300-307` |

**아이러니**: 이미지·파일 첨부가 달린 프롬프트야말로 신규 기능 요청일 확률이
높은데, 정확히 그 경우에 PDCA 진입 유도가 사라집니다.

**bkit 측 수정 불가** (CC 버그) → 모니터링 등록 (ENH-439).

### 4.5 F-E: #85665 (transcript JSONL 미기록) — **직접 영향 없음, 그러나 전제를 무너뜨림**

**bkit은 CC의 transcript 파일 내용을 읽지 않습니다.** bkit의 `.jsonl` 참조는
전부 자체 산출물(`.bkit/audit/YYYY-MM-DD.jsonl`, `.bkit/decisions/`,
`.bkit/state/sqm-history.jsonl` 등)입니다.

접점은 2곳뿐입니다:
- `scripts/post-compaction.js:26` — `input.transcript_length` (숫자 필드, 파일 아님)
- `scripts/subagent-stop-handler.js:56-58` — **문제 지점**

```js
// Determine exit status (transcript_path exists = normal exit)
const isSuccess = hookContext.transcript_path != null
  || hookContext.exit_code === 0
  || hookContext.exit_code === undefined;
const status = isSuccess ? 'completed' : 'failed';
```

bkit은 **서브에이전트의 "성공"을 transcript 산출물의 존재로 추론**합니다.
세 번째 논리합(`exit_code === undefined`)이 **기본 true**이므로, `transcript_path`가
사라지든 말든 결과는 동일합니다 — **모든 서브에이전트가 `completed`로 기록됩니다.**

**→ #85665의 진짜 가치는 bkit 기능을 깨뜨리는 데 있지 않고, 이 성공 프록시가
애초에 건전한 신호가 아니었음을 CC가 실증해 주었다는 데 있습니다.**

이 지점은 §3.5의 handoff fail-open 확대가 착지하는 곳이기도 합니다. 다만
**수치 싱크는 이미 막혔습니다** — ENH-412 착지를 메인이 확인했습니다
(`lib/infra/sprint/gap-detector.adapter.js:88` `matchRate: null` + `measured: false`,
`lib/application/quality-gates/measure-router.js` 유한성 검사 + 클램프).

남은 것은 **내용 맹목 싱크**이며, 구조적 제약(§3.5)상 훅 기반 대응은 제안하지 않습니다.

### 4.6 ENH-434: `skills_preload:` — 위생 문제가 아니라 **실기능 손실**

CC의 실제 필드는 `skills:`입니다. 공식 문서 `sub-agents.md:287`:

> `skills` — Skills to preload into the subagent's context at startup.
> The full skill content is injected, not only the description.

`skills_preload`는 CC 문서 어디에도 **존재하지 않습니다** (검사한 5개 문서 전부 0회).
그리고 bkit은 **다른 19개 에이전트에서 `skills:`를 올바르게 사용**하고 있어
저장소가 자기모순 상태입니다.

**실측 (메인 세션 정정 포함)**:

| 에이전트 | `skills_preload` 내용 | 별도 `skills:` | 실제 손실 |
|---|---|---|---|
| `code-analyzer.md:21` | phase-2-convention, phase-8-review, code-review | **없음** | **3개 전부** |
| `pdca-iterator.md:16` | pdca, bkit-rules | **없음** | **2개 전부** |
| `bkit-impact-analyst.md:31` | bkit-rules | **없음** | **1개** |
| `bkend-expert.md:36` | bkend-data, bkend-auth, bkend-storage | **`:29-34`에 존재** | **0개** |

> **정정**: Phase 2 분석 에이전트는 "총 7개 항목, 6개 고유 스킬 손실"과
> "bkend-expert가 bkend-storage를 잃는다"고 보고했으나, 메인 세션 재현 결과
> **bkend-expert의 `skills:`(`:29-34`)는 `dynamic, bkend-quickstart, bkend-data,
> bkend-auth, bkend-storage, bkend-cookbook` 6개를 나열하여 `skills_preload`의
> 3개를 전부 커버**합니다. 따라서 손실은 없습니다.
>
> **정확한 수치: 3개 에이전트 / 6개 항목 / 5개 고유 스킬**
> (phase-2-convention, phase-8-review, code-review, pdca, bkit-rules)

특히 짚어둘 점: PDCA Check 단계를 담당하는 `code-analyzer`가 3개 전부를 잃고,
**이 분석을 수행하는 `bkit-impact-analyst` 자신이 `bkit-rules`를 preload하지
못하고 있습니다.**

**리네임 안전성 확인 (메인 세션이 미검증 항목 해소)**: 대상 6개 스킬
(phase-2-convention, phase-8-review, code-review, pdca, bkit-rules, bkend-storage)
중 `disable-model-invocation: true`인 것은 **0건**입니다. 리네임에 장애 없습니다.

### 4.7 F-13 확대: "허공에 쓰기"는 1곳이 아니라 약 24곳

`lib/core/io.js:516-531`이 규정한 `outputContext`는 **정확히 1곳**에서만
호출됩니다 (`scripts/pdca-doc-changed-handler.js:91`).

`io.js`의 주석은 문제를 명시적으로 규정합니다:

> `outputAllow()` prints bare text on every event except SessionStart and
> UserPromptSubmit. On PreToolUse that is fine. **On PostToolUse it is not:
> plain stdout from a PostToolUse hook goes to the transcript only, and the
> model never sees it.** Any handler that used `outputAllow(msg, 'PostToolUse')`
> to say something was writing into a void — **the identical class of defect as
> ENH-410**, where a block reason was computed and then dropped.

그런데 `outputAllow(<비어있지 않은 메시지>, <이벤트>)`가 **9개 이벤트 약 24개
호출부**에 남아 있습니다:

| 이벤트 | 대표 호출부 | 비고 |
|---|---|---|
| PostToolUse | `unified-write-post.js:204` | ENH-103 템플릿 검증 경고 — **모델 미도달 확정** |
| PostToolUseFailure | `tool-failure-handler.js:165` | 도구 실패 복구 안내 |
| Notification | `notification-handler.js:100` | |
| StopFailure | `stop-failure-handler.js:213` | |
| SubagentStart / SubagentStop | `:70,85` / `:33,41` | |
| TaskCompleted | `pdca-task-completed.js:37,54,182` | `:54`는 이벤트 인자 자체가 없음 |
| TeammateIdle | `team-idle-handler.js:35,45` | |
| Stop | 7곳 (`unified-stop.js:712` 등) | |

**PostToolUse 외 8개 이벤트의 stdout 가시성은 양방향 모두 UNVERIFIED입니다.**
추론을 늘릴 것이 아니라 실측이 필요합니다 → ENH-433.

### 4.8 ENH-435: `marketplace.json` 아키텍처 카운트 드리프트

대외 공개 문자열이 실측과 어긋납니다.

| 항목 | marketplace.json 기재 | 실측 | 판정 |
|---|---|---|---|
| Skills | 44 | 44 | match |
| Agents | 34 | 34 | match |
| Scripts | **61** | **66** | **drift** |
| Lib Modules | **195** | **198** | **drift** |
| Hook Events | **22** | **21** | **drift** |
| blocks | **25** | **24** | **drift** |
| CC recommended | **v2.1.218** | 코드 `2.1.220` | **drift** |

---

## 5. 호환성 평가

### 5.1 Breaking 판정

**Breaking 0.** 근거:

1. bkit이 의존하는 훅 계약 문자열이 **전량 불변** (§3.2)
2. 유일한 형태 델타 `"PreToolUse"` +1은 **신규 함수의 내부 분기**로 귀속 완료 (§3.3)
3. 미문서화 신규 서브시스템 3종은 **전부 bkit 미접촉 표면** (§4.1, §4.2.3)
4. 모델 alias 해석 전량 불변 → Fable-pinned 에이전트 무영향

### 5.2 연속 호환 카운트 — **169 → 170 인증 (조건부)**

이 판정에는 **에이전트 간 불일치**가 있었으므로 정면으로 다룹니다.

- **Phase 1 조사 에이전트**: 인증 **보류** 권고. 사유 ① F-1 규모(문자열 run 31.6% 변경) ② 미문서화 서브시스템 3종
- **Phase 2 분석 에이전트**: 인증 **찬성**
- **메인 세션 판정**: **인증**. 조사 에이전트의 보류 근거를 아래와 같이 기각합니다.

#### 기각 ① "31.6% 문자열 run 변경" — 규모는 호환성의 증거가 아니다

연속 호환 카운트가 측정하는 것은 "CC가 얼마나 바뀌었나"가 아니라
**"bkit이 의존하는 계약이 바뀌었나"**입니다. 규모를 호환성의 대리지표로 쓰면
범주 오류가 됩니다.

**결정적 반증이 같은 릴리스 쌍 안에 있습니다**: 225 vs 226은 918,852 B가 달랐고
(`__BUN` 464,864 / `__LINKEDIT` 453,988) 네이티브 영역은 0바이트 차이였으며,
CC 자신도 이를 "Bug fixes and reliability improvements" 1줄로 처리했습니다.
번들 재빌드는 minifier 심볼 재할당만으로도 문자열 run을 대규모로 흔듭니다.

**직접 증거가 규모 대리지표를 압도합니다** — 계약 토큰이 전량 불변이고,
유일한 형태 델타가 귀속 완료되었습니다.

#### 기각 ② "미문서화 서브시스템 3종" — 전부 bkit 미접촉 표면

| 서브시스템 | bkit 접점 | 근거 |
|---|---|---|
| `bashCommandClamp` (42) | **0** | 워크플로 스크립트 `agent()` opts 전용. bkit은 워크플로 스크립트를 사용하지 않음 |
| `deviceRegistry`/`deviceBind` (65) | **0** | 기능 접점 없음 (프라이버시 문서 검토는 별건) |
| 훅 결과 필터 (신규 함수) | **0 (조건부)** | `observer`/`observerMessage`/`observeSubagents` 선언 시에만 발동. bkit은 셋 다 미선언 |

**미문서화는 미검증과 다릅니다.** 이 3종은 문서가 없을 뿐 바이너리에서 동작
경계가 특정되었고, 그 경계 밖에 bkit이 있습니다.

#### 인증 조건 (명시)

1. bkit이 `observer` / `observeSubagents`를 채택하지 않는 한 유효.
   채택 시 **재검증 필수** (ENH-438이 이를 가드).
2. **#85665는 런타임 결함이지 계약 위반이 아니므로** Breaking에 계상하지 않고
   KNOWN_BAD(ENH-437)로 처리합니다. 이 구분을 흐리면 연속 호환 카운트가
   "CC 품질 지표"로 변질됩니다.

### 5.3 `RECOMMENDED_VERSION` 판정 — **2.1.220 유지 + KNOWN_BAD 도입**

#### 현 구조의 결함 (중요)

```
lib/infra/cc-version-checker.js:44   const MIN_VERSION = '2.1.78';
lib/infra/cc-version-checker.js:65   const RECOMMENDED_VERSION = '2.1.220';
lib/infra/cc-version-checker.js:75   const FABLE_MODEL_FLOOR = '2.1.170';
```

체커에는 **상한도, 기피 개념도 없습니다.** 하한 비교만 존재하므로
**2.1.227 사용자는 이미 `ok` 판정을 받고 있습니다.** 220에 묶어두는 것은
220 **미만** 사용자에게만 영향을 줄 뿐, **#85665로부터 아무도 보호하지 못합니다.**

즉 "2.1.220 유지"는 그 자체로는 **부작위**입니다.

#### 상향 vs 보류

| 227 상향 근거 | 보류 근거 |
|---|---|
| 훅 계약 문자열 전량 불변 | **#85665가 227 특정 회귀** (회귀 경계가 2.1.226에서 측정됨) |
| bkit 표면 Breaking 0 | 미문서화 서브시스템 3종 + 페이로드 전면 재빌드 |
| 성능 개선 2건이 훅 timeout 예산에 유리 | #85699, #85700 등 신규 회귀 |
| — | 추적 이슈 해소 **0건** |
| — | npm `stable` 채널이 **7릴리스째 2.1.220 유지** |

**판정: 2.1.220 유지 (HOLD) + ENH-437 (KNOWN_BAD 집합) 도입.**

---

## 6. 브레인스토밍 결과 (Plan Plus)

### 6.1 의도 탐색

**Q. 이번 CC 업그레이드에서 bkit이 얻을 수 있는 최대 가치는?**

CC 기능이 아닙니다. **자기 검증 체계의 신뢰도**입니다. 이번 사이클은
CC를 조사하러 갔다가 bkit이 대외적으로 광고하는 기능 하나가 원리적으로
구현 불가능했음을 발견했고, 그것을 **3개의 자동 테스트가 통과시키고 있었음**을
확인했습니다. 이 발견의 가치가 CC v2.1.227의 5개 bullet 전부를 합친 것보다 큽니다.

**Q. 놓치면 안 되는 critical change는?**

CC 측에는 없습니다 (계약 불변). bkit 측에는 있습니다 — ENH-432.

**Q. 기존 workaround를 대체할 수 있는 native 기능은?**

`bashCommandClamp`가 후보였으나 **현재 도달 불가**로 확정 (§4.2.3).
극성이 반대라 애초에 대체가 아니라 보완 관계입니다.

**Q. 이번에도 반복된 구조적 문제는?**

직전 사이클 #35가 도출한 ENH-420/421/422가 **하나도 착지하지 않았고**,
그 결과 이번 사이클이 동일한 바이너리 비교 절차를 수작업으로 재수행했습니다.
분석이 실행으로 이어지지 않으면 사이클마다 같은 비용이 재발생합니다.

### 6.2 대안 탐색 — ENH-432 (차별화 #5)

| 대안 | 내용 | 평가 |
|---|---|---|
| **A. 구현** | `continueOnBlock`을 실제로 방출 | **불가능.** prompt 타입 훅 정의의 필드이며 bkit 훅은 28개 전부 command 타입 |
| **B. prompt 타입 훅 도입** | bkit에 prompt 훅을 추가해 기능 실현 | **과잉.** 별도 모델 호출 비용이 발생하고, 차별화 #5의 원래 의도(PostToolUse 차단 사유 전달)와 다른 메커니즘 |
| **C. 철회** | 대외 문구·주석·enum·테스트에서 제거하고 정직하게 기록 | **채택** |

C를 채택하되, 단순 삭제가 아니라 **왜 불가능한지를 근거와 함께 남깁니다** —
v2.1.35의 worktree 철회 선례와 동일한 방식입니다.

### 6.3 YAGNI 검토

| ID | 실제 필요한가? | 미구현 시 문제 | 판정 |
|---|---|---|---|
| ENH-432 | ✅ 대외 허위 광고가 지속됨 | 신뢰도 손상. 구현 불가이므로 방치 = 영구 허위 | **통과 · P0** |
| ENH-433 | ✅ ENH-103 경고가 모델에 미도달 | 템플릿 검증 기능이 사실상 무효 | **통과 · P1** |
| ENH-434 | ✅ 5개 고유 스킬이 주입되지 않음 | PDCA Check 담당 에이전트가 규칙 없이 동작 | **통과 · P1** |
| ENH-420~422 (재개) | ✅ 이번 사이클이 비용을 재지불 | 다음 사이클도 동일 반복 | **통과 · P1** |
| ENH-437 | ✅ 현 체커로는 #85665를 **표현할 수단이 없음** | 227 사용자가 `ok` 판정을 계속 받음 | **통과 · P1** |
| ENH-435 | ✅ 공개 문자열 5개 항목 드리프트 | 대외 수치 부정확 | **통과 · P2** |
| ENH-438 | ✅ 채택 시 모델 대면 출력 전량 소실 | 미래 위험 차단 | **통과 · P2** |
| ENH-436 | ✅ CLAUDE.md 이중언어 규칙 위반 | 규칙 준수 | **통과 · P3** |
| ENH-439 | ✅ 3건 전부 bkit 수정 불가 | 추적 누락 | **통과 · P3** |
| ~~clamp 채택~~ | ❌ 도달 경로 없음. frontmatter에 넣으면 조용히 무시 | — | **YAGNI 기각 · DROP** |
| ~~bullet ①~⑤ 대응~~ | ❌ 무관/면역/직교/순수이득 | — | **DROP** |
| ~~`deviceRegistry` 대응~~ | ❌ 기능 접점 0 | — | **DROP** (프라이버시 문서 검토는 기존 ENH-404) |
| ~~F-2 훅 기반 차단~~ | ❌ CC가 산문으로만 전달 — 기술적 불가 | — | **DROP** |

---

## 7. 구현 제안 (ENH 로드맵)

**번호 규칙**: 원장 최고 = 431. 신규는 **432부터**.
**미착지 번호는 재개하며 신규 번호를 소각하지 않습니다** — ENH-420/421/422는
재개 대상이지 신규가 아닙니다.

### 7.1 bkit 자체 결함 대응

| ID | P | 제목 | 대상 파일 | 테스트 영향 |
|---|---|---|---|---|
| **ENH-432** | **P0** | **차별화 #5 `PostToolUse continueOnBlock` 주장 철회** — 근거(prompt 훅 정의 필드 · bkit 훅 28개 전부 command 타입)를 함께 기록 | `.claude-plugin/marketplace.json:36`, `scripts/unified-bash-post.js:180-184`, `lib/audit/audit-logger.js:72`, `docs/sprint/v2114/*` | **C-07 재작성** (`v2114-doc-contract.test.js:71-79`), `v2114-defense-contract.test.js:126` 재작성. **소스 정규식 → 행동 단언으로 전환** |
| **ENH-433** | **P1** | `outputAllow` → `outputContext` 전환 + **이벤트별 stdout 가시성 실측 매트릭스** 작성 | 즉시: `scripts/unified-write-post.js:204`. 실측 후: 8개 이벤트 약 24개 호출부 | 훅 **stdout**을 단언하는 신규 행동 테스트 |
| **ENH-434** | **P1** | **`skills_preload:` → `skills:` 리네임** (3개 에이전트) + 비스키마 frontmatter 정리 + 19키 계약 테스트 | `agents/{code-analyzer,pdca-iterator,bkit-impact-analyst}.md` 리네임 / `bkend-expert.md` 중복 키 제거 | 19키 화이트리스트 계약 테스트 신규 |
| **ENH-435** | **P2** | `marketplace.json` 아키텍처 카운트 5개 항목 동기화 | `.claude-plugin/marketplace.json:36` | `test/integration/config-sync.test.js` 확장 |
| **ENH-436** | **P3** | `.en.md` 짝 생성 | `docs/04-report/features/cc-v2225-v2226-impact-analysis.report.en.md` | — |
| **ENH-420~422** | **P1** | **재개** — 불투명 릴리스 프로토콜 성문화 + 바이너리 등가성 스크립트 + provenance 기록 | `scripts/cc-binary-equivalence.js`(신규), `skills/cc-version-analysis/SKILL.md` | 신규 단위 테스트 |

### 7.2 CC 대응

| ID | P | 제목 | 대상 파일 | 테스트 영향 |
|---|---|---|---|---|
| **ENH-437** | **P1** | `cc-version-checker`에 **KNOWN_BAD 버전 집합** 도입 | `lib/infra/cc-version-checker.js`, `hooks/startup/session-context.js` | 신규 단위 + SessionStart 통합 |
| **ENH-438** | **P2** | `observer`/`observeSubagents` 채택 **금지 가드** + 근거 문서화 | `docs/06-guide/cc-compatibility.guide.md`, 신규 계약 테스트 | 계약 테스트 |
| **ENH-439** | **P3** | 모니터링 등록: #85669(첨부 우회), #85665(transcript), `bashCommandClamp` 도달성 | 모니터링 레지스트리 | — |

### 7.3 ENH-437 설계 명세

```js
/**
 * 알려진 결함 버전. RECOMMENDED 이상이어도 경고한다.
 * 각 항목에 addedCycle 주석 필수. CC가 수정한 버전이 확인되면 제거한다.
 */
const KNOWN_BAD_VERSIONS = Object.freeze({
  // addedCycle: #36 (2026-08-11)
  '2.1.227': {
    issue: 85665,
    severity: 'warn',
    scope: 'interactive',   // 'interactive' | 'headless' | 'all'
    detail: 'Interactive sessions never write transcript JSONL (headless -p unaffected).',
  },
});
```

`checkCCVersion()` 반환 계약 확장:

1. `error`(< MIN_VERSION) 판정을 **최우선 유지** — KNOWN_BAD가 이를 덮지 않습니다.
2. `< RECOMMENDED_VERSION` → 기존 `warn` 유지.
3. **신규**: `KNOWN_BAD_VERSIONS[current]`가 있으면 `severity`를 해당 값으로 올리고
   반환 객체에 `{ knownBad: {...} }`를 추가. `ok → warn` 승격이 주 용도입니다.
4. `scope`가 현재 실행 모드와 불일치하면 경고를 **억제**(오탐 방지). 실행 모드
   판별이 불가하면 **경고하는 쪽으로 fail-safe**.
5. 소비자(`hooks/startup/session-context.js`)는 `knownBad.detail` + 이슈 링크를
   SessionStart 권고에 **1회** 노출. **차단하지 않습니다** — 이 모듈의 fail-open
   설계를 유지합니다.

**회귀 잠금 테스트**: KNOWN_BAD 적중 시 승격 / MIN 미만에서 `error` 불변 /
scope 불일치 시 억제 / **빈 맵일 때 기존 동작과 동일**.

### 7.4 의존 관계

- ENH-432 → ENH-435 (둘 다 `marketplace.json:36` 수정 — 순서 조정 필요)
- ENH-433은 **실측 매트릭스 작성이 선행 조건**. 추론으로 일괄 치환 금지
- ENH-420 → ENH-421 (프로토콜이 스크립트 사양을 정의)
- ENH-437은 독립

---

## 8. GitHub Issues 모니터링

### 8.1 상태 요약

- **v2.1.227에서 해소된 추적 이슈: 0건**
- PreToolUse 위협군 5건(#84302, #84701, #84632, #84697, #84926) **전부 OPEN 유지**
- 창(08-08 ~ 08-11) 신규 이슈 **749건** (절단 없음 증명)

### 8.2 신규 감시 항목

| 이슈 | 사유 | bkit 대응 |
|---|---|---|
| **#85665** | 227 특정 회귀. RECOMMENDED 판정의 직접 근거 | ENH-437 |
| **#85669** | UserPromptSubmit 첨부 우회 — bkit 기능 10종이 대체 경로 없이 죽음 | ENH-439 (수정 불가) |
| **#85699** | 세션이 자기 권한 모드를 오보 — bkit 자동화 레벨 보고와 인접 | 관찰 |
| **#85700** | worktree + PreToolUse에서 Edit 미기록 — Write/Edit deny 클러스터 확장 | 관찰 |

### 8.3 종결 처리

- **#84524**: CLOSED (2026-08-06). 코멘트 0·교차참조 0으로 종결되어 정보 없음.
  bkit #139 계열이었으므로 **재현 시도는 이월 유지**.
- **차별화 #6 훼손 워치리스트**: §4.2.1에 따라 **종결**. HEAD에서 해소 확인됨.

---

## 9. 결론 (Verdict)

**CC v2.1.227은 bkit에 대해 Breaking 0이며, 마이그레이션이 필요하지 않습니다.**

- **연속 호환 170 인증** (조건부 — §5.2)
- **bkit 코드의 CC 대응 변경 소요 0건**
- **RECOMMENDED_VERSION 2.1.220 유지 + KNOWN_BAD 도입** — 유지만으로는
  #85665로부터 아무도 보호하지 못하므로 ENH-437이 함께 필요합니다
- **신규 ENH 8건 + 재개 3건**

그러나 이번 사이클의 실질 산출물은 CC 호환성 판정이 아닙니다.

**bkit이 대외적으로 광고해 온 차별화 #5가 CC 스키마상 구현 불가능한 명세였고,
그것을 검증한다고 만들어 둔 3개의 테스트가 산문과 enum을 검사하는 방식이어서
위반을 은폐하고 있었다**는 사실입니다. v2.1.35가 측정으로 자기 주장 하나를
철회했듯이, 이번에는 CC 바이너리 실측이 또 하나를 철회하게 만들었습니다.

이 계열의 결함이 두 사이클 연속으로 나왔다는 점 자체가 신호입니다 —
**"소스 텍스트를 정규식으로 검사하는 테스트"는 기능을 검증하지 않습니다.**
ENH-432가 P0인 이유는 광고 문구 때문이 아니라, 그 교훈을 테스트 설계에
반영해야 하기 때문입니다.

---

## 10. 검증 범위의 한계 (정직한 서술)

1. **검사 대상은 macOS x86_64 바이너리 1종**입니다. Linux · Windows · arm64
   빌드는 검사하지 않았습니다. 특히 **#85665는 Windows native에서 보고**되었으므로
   본 분석의 바이너리 실측으로는 재현·반증할 수 없습니다.
2. **바이트코드 영역은 역컴파일하지 않았습니다.** 동일 JS로부터 생성되므로
   등가로 간주했으나 이는 추론입니다.
3. **v2.1.227은 게시 24시간 미만**입니다. 회귀 신고 수를 품질 근거로 쓸 수 없습니다.
4. Phase 1 조사 에이전트의 서브에이전트 8개 중 **2개(이슈·문서)가 반환되지
   않아** 해당 영역은 메인 세션이 대체 수행했습니다. 조사 밀도가 다른 영역과
   동일하다고 주장하지 않습니다.

### UNVERIFIED 목록

| # | 항목 | 왜 미확인 |
|---|---|---|
| 1 | 무인용 `PreToolUse` +2 중 **1건 미귀속** | 신규 함수가 1건만 설명 |
| 2 | CC가 `observer` 선언 **없이** 관찰 위임 모드를 자동 설정하는지 | 게이트 설정 지점 미추적 |
| 3 | **PostToolUse 외 8개 이벤트의 stdout → 모델 가시성** | 실행 관측 필요 (ENH-433 선행 과제) |
| 4 | `disallowedTools`가 **plugin agent에 실제 강제되는지** | 기존 테스트는 frontmatter 내용만 단언 |
| 5 | #85665가 `transcript_path` **필드 자체**를 제거하는지 | 이슈 본문은 파일 미기록만 기술 |
| 6 | bullet ②의 수정 위치 | CLI 바이너리에서 관련 문자열 전부 불변 — 수정이 action 저장소일 가능성 |
| 7 | ENH-434 리네임 후 preload가 **실제로 주입되는지** | 런타임 관측 필요 |

---

## 11. 이번 사이클 ERRATA

### ERRATA-36-1 (CRITICAL, 서술) — 서브에이전트가 미반환 결과를 인용

Phase 1 조사 에이전트가, 반환되지 않은 서브에이전트의 결과를 인용한 것처럼
서술했고 **스스로 발견해 전량 철회**했습니다.

**교훈**: 서브에이전트 산출물은 **메인이 재현하기 전까지 증거가 아닙니다**
(ERRATA-32-5의 재확인). 본 사이클에서 이 규칙이 양방향으로 작동했습니다 —
바이너리 주장은 전량 재현에 성공했고, 미반환 영역은 메인이 대체 수행했습니다.

**부수 사례**: 철회된 인용 중 `#85665`는 **실재하는 이슈였고 주제까지 정확히
일치**했습니다. 그러나 에이전트에게 근거가 없었던 이상 철회는 옳았고,
본 보고서는 메인이 `gh api`로 **독립 조회한 결과**로만 이를 채택했습니다.

### ERRATA-36-2 (HIGH, 상태 관리) — 롤링 메모리 stale

작업 착수 시 메모리의 baseline이 v2.1.225였으나 실제로는 v2.1.226이었고,
사이클 번호도 #35가 아니라 #36이었습니다 (§1).

**교훈**: 사이클 시작 시 **메모리가 아니라 저장소**(`docs/04-report/features/`)를
1차 출처로 삼아야 합니다. 메모리는 보조 색인입니다.

### ERRATA-36-3 (HIGH, 방법론) — npm `unpackedSize`는 런타임 증거가 아니다

npm 아티팩트(166,777 B)는 바이너리(289 MB)를 내려받는 **래퍼 스텁**입니다.
버전 간 `unpackedSize` 일치는 런타임 동등성에 대해 아무 정보도 담지 않습니다.

### ERRATA-36-4 (MEDIUM, 선행 정정) — 사이클 #35 §10 수치 오류

#35 보고서의 "Hook events (등록) 12"는 실측 **21**이며, "Lib modules 197"은
현재 **198**입니다.

### ERRATA-36-5 (MEDIUM, 수치) — Phase 2 에이전트의 `skills_preload` 집계 오류

분석 에이전트는 "7개 항목 / 6개 고유 스킬 손실, bkend-expert가 bkend-storage
손실"이라고 보고했으나, 메인 재현 결과 **bkend-expert는 손실 0**이며
실제는 **3개 에이전트 / 6개 항목 / 5개 고유 스킬**입니다 (§4.6).

### ERRATA-36-6 (LOW, 도구) — `cmp -l`의 대용량 파일 처리

289 MB 바이너리 2개에 대한 `cmp -l` 전수 비교는 120초를 초과합니다.
백그라운드 실행이 필요하며, `cmp -n` / `-i` 플래그는 이 아티팩트에서
잘못된 결과를 낼 수 있으므로 사용하지 않습니다.

### 기존 ERRATA 재확인

- **ERRATA-34-1** (CC 문서는 `code.claude.com`, `raw.githubusercontent.com`은 404):
  이번 사이클에서 정상 작동. `llms.txt`(193행) → 개별 `.md` 경로로 6개 문서 취득 성공
- **ERRATA-31-1** (WebFetch 총계 날조): 메인이 총계를 먼저 확정 → **3사이클 연속 카운트 errata 0**
- **ERRATA-33-2** (`gh issue list --limit` 무음 절단): `search/issues` `total_count` 사용으로 회피, 일별 합계로 절단 없음 증명
- **ERRATA-35-1** (`strings` 차분은 의미 변화의 증거 아님): 전 구간 `grep -a -o -F` 정확 카운트만 사용

---

## 12. 다음 사이클 우선순위

1. **ENH-433 선행 과제**: PostToolUse 외 8개 이벤트의 stdout → 모델 가시성
   **실측**. 이것이 없으면 ENH-433은 추론 기반 일괄 치환이 되어 위험합니다.
2. **`bashCommandClamp` 도달성 재확인**: CC가 이 옵션을 에이전트 frontmatter나
   설정 파일로 노출하는지. 노출되면 bkit 차별화 #6과의 결합 설계가 필요합니다.
3. **#85665 수정 착지 시점**: KNOWN_BAD 항목 제거 시점을 결정하기 위해 추적.
4. **#85669 수정 착지 시점**: bkit 기능 10종의 복구 시점.
5. **타 플랫폼 바이너리 동등성** (#35 이월): Linux/arm64. ENH-422의 provenance
   기록이 선행되면 저비용 판정 가능.
6. **이월 미검증**: auto mode 3/20 카운터에 훅 deny 산입 여부, `PermissionRequest`
   `behavior:'deny'`와의 관계, #84302/#84632/#84701/#84697/#84926 실증,
   `SubagentStart`/`SubagentStop` depth 2/3 발화.

---

*본 보고서의 모든 정량 주장은 메인 세션이 재현 명령어로 직접 검증했습니다.
서브에이전트 산출물 중 재현에 실패했거나 근거가 제시되지 않은 항목은
채택하지 않았거나 UNVERIFIED로 표기했습니다.*
