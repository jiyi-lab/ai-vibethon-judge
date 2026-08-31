# 브랜치 · 커밋 전략

**8/25 본선 당일 하루짜리 운영 도구**라는 성격에 맞춘 전략이다.
원칙은 두 가지 — *`main`은 언제나 배포 가능해야 하고, 당일에는 되돌릴 수단이 있어야 한다.*

---

## 브랜치

`main` 하나를 기준으로 하는 트렁크 기반. 장수 브랜치(develop 등)는 만들지 않는다.

| 브랜치 | 용도 | 수명 |
|--------|------|------|
| `main` | 항상 배포 가능한 상태 | 영구 |
| `feat/<slug>` | 기능 추가 | 1~2일 |
| `fix/<slug>` | 버그 수정 | 몇 시간 |
| `chore/<slug>` `docs/<slug>` `refactor/<slug>` | 잡무 · 문서 · 리팩터 | 짧게 |
| `hotfix/<slug>` | **행사 당일 긴급 수정** | 즉시 |

```bash
git switch -c feat/judge-screen      # 좋음
git switch -c feat/screens           # 나쁨 — 범위가 뭉뚱그려짐
```

**브랜치는 짧게 유지한다.** 하루 넘게 살아있으면 쪼갤 신호다.
화면 3개(viewer / judge / admin)는 서로 독립적이라 병렬로 진행해도 충돌이 거의 없다.

### main 직접 커밋

원칙적으로 금지하고 PR로 올린다. 예외는 오탈자·README 수정 정도.

---

## 커밋 메시지

[Conventional Commits](https://www.conventionalcommits.org/). 이전 프로젝트에서 쓰던 습관을 그대로 잇는다.

```
<type>(<scope>): <제목>

- 본문은 불릿으로. 무엇을 왜 바꿨는지.
- 어떻게 바꿨는지는 코드가 말하므로 생략.

Co-Authored-By: ...
```

**type** — `feat` `fix` `refactor` `perf` `style` `chore` `docs` `test` `security`

**scope** — 이 프로젝트는 화면·계층이 뚜렷하므로 붙이면 로그가 훨씬 읽힌다.
`viewer` `judge` `admin` `api` `db` `logic` `ui`

**제목** — 영문 소문자, 명령형, 72자 이내. 마침표 없음.

```
feat(judge): add proxy-submission mode for the secretary
fix(admin): block match start when the bracket slot is unresolved
security(api): validate admin PIN server-side on every write
```

**본문** — 기능 커밋은 본문이 필수다. 오탈자·의존성 갱신처럼 자명한 것만 생략한다.

"무엇을 바꿨는지"의 나열은 diff 가 이미 말해준다. 본문이 담아야 하는 건 **diff 에 없는 것**:

1. **왜 이 방식인가** — 판단의 근거. 버린 대안이 있으면 왜 버렸는지까지
   (예: "select 로 잠그지 않은 이유: 목록에 없는 학교가 올 수 있다")
2. **명세·결정 참조** — 행사 규정이나 기록된 결정에서 비롯된 동작은 조항을 단다
   (예: `동표는 경고만 — 자동 결정은 명세 §3 이 금지`)
3. **하지 않은 것** — 의도적으로 뺀 것과 그 이유. 다음 사람(또는 다음 세션의 나)이
   "빠뜨렸나?" 하고 다시 구현하는 것을 막는다
4. **검증** — 실제로 돌린 것과 숫자. "테스트 통과"가 아니라 "단위 테스트 31건 ·
   실서버 시나리오 20건 통과". 안 돌렸으면 안 썼다고 쓴다

나쁜 본문과 좋은 본문:

```
# 나쁨 — diff 를 요약했을 뿐, 판단이 없다
- 집계 패널 추가 (4초 폴링)
- 동표 경고 표시
- 확인 다이얼로그 추가

# 좋음 — 왜 그렇게 했는지가 남는다
- 집계 갱신 실패 시 마지막 정상 값을 유지하고 라벨만 붙인다 — 현장 네트워크
  혼잡에서 집계가 사라지는 것보다 낡은 숫자가 낫다 (명세 §7)
- 동표는 경고 배너만. 자동 결정은 명세 §3 이 금지한다
- 결과 공개에 확인 다이얼로그 강제 — 결과 취소를 없앤 결정(8/16) 때문에
  공개 전 확인이 유일한 오조작 방어선이다
```

---

## PR

### 단위

**PR 하나 = 작업 하나.** 화면 하나, 기능 하나, 결정 묶음 하나.
diff가 500줄을 넘으면 쪼갤 신호다 (에셋·스크린샷·잠금 파일 제외).
서로 다른 화면을 한 PR에 섞지 않는다 — 당일 롤백이 화면 단위로 돼야 한다.

### 본문

`.github/pull_request_template.md` 의 섹션을 채운다. 특히:

- **명세 근거** — SPEC 조항 번호까지. 규정 기반 프로젝트라 "왜"가 곧 조항이다
- **확인한 것** — 실제로 해본 것만 체크. 안 해봤으면 비워 둔다 (거짓 체크가 최악)
- **UI를 바꿨다면 스크린샷 필수** — 아래 규약대로

### 스크린샷 (UI 변경 PR 필수)

화면을 만들거나 바꾼 PR은 **스크린샷 없이 머지하지 않는다.**
리뷰어가 없는 프로젝트라, 스크린샷이 곧 시각적 리뷰 기록이다.

**캡처** — 개발 서버를 띄우고:

```bash
npx playwright install chromium        # 최초 1회
node scripts/shot.mjs http://localhost:3000/admin admin-live
# → docs/screenshots/admin-live-desktop.png (1440×900)
# → docs/screenshots/admin-live-mobile.png  (390×844)
```

- 스크린(viewer) 화면은 `--screen` (1920×1080, 프로젝터 기준)도 찍는다
- 심사(judge) 화면은 `--mobile` 이 주 뷰포트다
- 로그인 뒤 상태처럼 CLI로 못 찍는 화면은 브라우저에서 수동 캡처해 같은 폴더에 넣는다

**규약**

- 파일은 `docs/screenshots/` 에 두고 **PR 브랜치에 함께 커밋**한다 — 커밋에 남는 것이 기록이고,
  PR 의 **Files changed 탭이 추가된 PNG 를 그대로 렌더**해 주므로 그게 1차 리뷰 경로다
- 파일명: `<slug>-<뷰포트>.png`, slug 는 브랜치명에서 따온다 (`feat/admin-screen` → `admin-*`)
- 신규 화면은 **주요 상태별로 전부**: 대기 / live / done / 우승 연출 / 에러·빈 상태
- 기존 화면 변경은 **before / after** 한 쌍
- PR 본문에는 커밋 SHA 고정 **blob URL 링크**를 단다
  (저장소가 private 이라 raw URL 임베드는 404 — 링크는 로그인한 멤버에게 열린다):

```markdown
[admin-live 데스크톱](https://github.com/tlstkdgus/animal-league/blob/<커밋SHA>/docs/screenshots/admin-live-desktop.png)
```

- 본문 안에 이미지를 **인라인으로** 보이고 싶으면 PR 편집창에 파일을 드래그&드롭한다
  (GitHub 이 user-attachments 로 업로드해 private 에서도 렌더된다). 선택 사항
- 화면이 확정되어 다음 상태로 바뀐 옛 스크린샷은 지워도 된다 (히스토리에 남는다)

### 병합

**Squash merge만 사용한다.** `main` 히스토리는 PR 하나당 커밋 하나가 되어,
당일에 문제가 생겼을 때 되돌릴 단위가 명확해진다.

```bash
gh pr create --fill
gh pr merge --squash --delete-branch
```

리뷰어가 없더라도 PR을 거치는 이유는 세 가지다.
CI가 타입체크·빌드·린트를 막아주고, 머지 전에 diff를 스스로 한 번 읽게 되고,
되돌릴 단위가 커밋 하나로 딱 떨어진다.

**머지 전 셀프 리뷰**: `gh pr diff` 를 처음부터 끝까지 한 번 읽는다.
디버그 로그, 주석 처리된 코드, 우연히 딸려 온 파일이 이 단계에서 걸린다.

---

## 태그와 프리즈

당일에 "어제까지 되던 버전"으로 돌아갈 수 있어야 한다.

| 시점 | 태그 | 의미 |
|------|------|------|
| 리허설 직전 | `v0.9.0-rehearsal` | 리허설에 쓴 빌드 |
| 행사 전날 | `v1.0.0` | **당일 운영에 쓸 고정 빌드** |
| 당일 긴급 수정 | `v1.0.1` | hotfix 반영본 |

```bash
git tag -a v1.0.0 -m "본선 당일 운영 빌드"
git push origin v1.0.0
```

**기능 프리즈: 8/22.** 이후로는 `fix/`와 `hotfix/`만 받는다.
새 기능은 아무리 좋아 보여도 다음으로 미룬다 — 당일에 터지는 건 대개 마지막에 넣은 것이다.

### 당일 긴급 수정

```bash
git switch -c hotfix/reveal-button --detach v1.0.0
# 고치고
git commit -m "fix(admin): ..."
# 검증 후 배포, 그 다음에 main으로 병합
```

당일에는 PR·CI를 기다릴 여유가 없을 수 있다. **그때는 절차보다 서비스가 우선이다.**
`main`에 직접 밀어도 되고, 대신 끝나고 반드시 정리한다.

---

## 커밋하지 말아야 할 것

이전 프로젝트에서 학교 코드 80개가 평문으로 공개 저장소에 올라간 적이 있다. 같은 실수를 반복하지 않는다.

- `.env*` — Supabase 키, 운영 PIN, 심사 코드
- `*.local.json` — 로컬 전용 설정
- 실제 팀 명단·심사위원 실명이 담긴 시드 데이터

운영 PIN과 심사 코드는 **DB에 저장하고 운영 화면에서 바꾼다.** 코드에 상수로 박지 않는다.
