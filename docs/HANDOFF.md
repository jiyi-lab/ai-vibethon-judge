# 인수인계 — 현재 상태와 다음 작업

**행사일 2026-08-25** (코엑스 마곡) · **기능 프리즈 8/22**

새 세션에서 이어받을 때 이 문서부터 읽는다. 요구사항은 [SPEC.md](./SPEC.md)가 단일 출처다.

---

## 지금까지 된 것

### 프로젝트 기반
- Next.js 16.2.9 / React 19 / Tailwind v4 / three.js 셋업 완료, 빌드 통과
- `capsule-match` 프로젝트에서 **에셋 185개(13.6MB)** 이관 — 캐릭터 80종, 대학 로고 80종,
  카드 뒷면, 배경, 사자 영상. 참조 경로 전수 검증 완료
- 재사용 컴포넌트 6종 이관: `SpinningCard3D` `TicketIntro` `CodeInput` `UniversitySelect`
  `LoadingOverlay` `CornerGlow`
- **git 히스토리는 이어받지 않음** (원본에 평문 비밀값이 있어서)

### 개발 프로세스
- 브랜치·커밋·릴리스 전략 → [../CONTRIBUTING.md](../CONTRIBUTING.md)
- CI: PR마다 타입체크 · 린트 · 빌드 (Node 24)
- `main` 보호: PR 필수, squash 전용, force-push 금지, CI 통과 필수, 관리자 우회 허용

### 백엔드
- `supabase/schema.sql` 작성 완료 — 테이블 2개 (`tournament_state`, `votes`)
- `.env.local` 값 채워짐 (URL + service_role 키)

### 토너먼트 로직 (2026-08-16)
- `lib/tournament.ts` — 순수 함수 완성. 초기 브래킷 팩토리, Fisher–Yates 추첨,
  상태 전이 전부 (`startMatch` `revealResult` `drawRound2` `setFinal` `updateTeam`
  `setJudgeCode` `setAdminPin` `reset`) + 가드 (`TournamentError` 코드 기반)
- `lib/tournament.test.ts` — 단위 테스트 27개, `npm test` (Node 24 내장 러너, 의존성 없음)
- CI 에 Test 단계 추가

---

## ⚠️ 사람이 직접 확인할 것

- Supabase 프로젝트 생성 + `.env.local` 채우기 — **완료**
- **`supabase/schema.sql` 을 SQL Editor 에서 Run 했는지 확인** (안 했으면 서버 레이어가 첫 호출에서 실패)

> 무료 티어는 **일주일간 요청이 없으면 프로젝트가 일시정지**된다.
> 행사 2~3일 전과 전날에 대시보드를 한 번씩 열어 깨워둘 것.

---

## 다음 작업 (순서대로)

### 1. ~~토너먼트 로직~~ — 완료 (`lib/tournament.ts` + 테스트 27개)

### 2. ~~서버 레이어~~ — 완료 (`lib/supabaseAdmin.ts` `lib/state.ts` `lib/auth.ts`)
- 실제 Supabase 에 스모크 테스트 통과 (초기 행 생성 · 비밀값 제거 · rev 잠금 · 초기화)
- 운영 세션: PIN 을 서비스 롤 키로 HMAC 한 파생 토큰 쿠키(`al_admin`, 18h).
  PIN 변경 시 기존 세션 자동 무효화. 심사 코드는 세션 없이 제출마다 대조
- `schema.sql` Supabase 적용 확인됨 (2026-08-16)

### 3. ~~API 라우트~~ — 완료

| 경로 | 인증 | 용도 |
|------|------|------|
| `GET /api/state` | 공개 | 공개 스냅샷 (비밀값·명단 제거). CDN 캐시 `s-maxage=2` |
| `POST /api/judge/auth` | 심사 코드 | 코드 검증 → 심사위원 명단 반환 (이름 선택용) |
| `POST /api/vote` | 심사 코드 | 제출 upsert. 명단 밖 명의 403 · live 아닌 경기 409 · ts 서버 스탬프 |
| `POST /api/admin/auth` | PIN | 로그인 (DELETE = 로그아웃) |
| `GET /api/admin/state` | 쿠키 | 운영용 스냅샷 (명단·심사코드·트랙 경고 포함) |
| `POST /api/admin/action` | 쿠키 | 액션 단일 진입점. 응답에 최신 운영 스냅샷 포함 |
| `GET /api/admin/votes?matchId=` | 쿠키 | 집계 (행 + tally) |

- 응답 규약: `{ ok: true, ... }` / `{ ok: false, error: { code, message } }` — 가드 위반은 409 + code
- `proxy.ts`: `/api/admin/*` 쿠키 존재 1차 가드, 최종 판정은 각 핸들러의 `isAdminSession()`
- `admin/action` 액션: `startMatch` `revealResult` `drawRound2` `setFinal` `updateTeam`
  `setJudgeCode` `setAdminPin`(쿠키 재발급 포함) `addJudge` `removeJudge` `reset`(votes 선삭제)
- 실서버 스모크 20개 시나리오 통과 (한글 명의 표기 흔들림 포함). DB 는 초기 상태로 정리됨
- 잡무 완료: 웹폰트 셀프호스트(SUIT next/font/local + Anton next/font/google),
  `animal-league` 로 개명, `--font-suit`/`--font-display` 토큰

### 4. 화면 3개
독립적이라 병렬 진행 가능. 각각 별도 브랜치·PR.

- `app/admin/page.tsx` → **운영** — **완료** (PIN 입장 · 경기 진행/팀 관리/설정 탭,
  실시간 집계 4초 폴링 + 동표 경고, 캐릭터 픽커, 확인 다이얼로그, 상태별 스크린샷 9장)
- `app/judge/page.tsx` → **심사** — **완료** (코드 → 명단 이름 선택 입장, sessionStorage 복원,
  라운드별 로컬 타이머, 대형 탭 카드, R2 영상 대체, 대리 입력, done 시 폼 자동 초기화)
- `app/page.tsx` → **스크린** — **완료** (좌우 수렴형 대진표, 추첨 전 점선/후 실선 동적 연결,
  LIVE 배너, 결과 공개 연출 3초, 우승 테이크오버, 모바일 세로 스택, reduced-motion 존중)
- 공용 조각은 `components/ui.tsx` (TrackBadge · CharacterArt · TRACK_COLORS).
  admin 은 자기 사본을 갖고 있음 — 리팩터 PR 로 통합 예정
- ⚠️ 폴링 클라이언트는 반드시 `fetch(..., { cache: 'no-store' })` — /api/state 의
  SWR 캐시 헤더를 브라우저도 존중해 낡은 스냅샷을 물고 늘어진 전례가 있음 (viewer·judge 수정됨)

트랙 컬러 잠정값이 `globals.css` 에 토큰으로 들어감 (`--track-*`). 확정 시 여기만 바꾸면 됨.

### 5. ~~검증~~ — 완료 (2026-08-18)
SPEC §8 전 항목을 실서버 시나리오 16건으로 실주행, **16/16 통과** (SPEC §8 검증 기록 참조).
동표 경고(2:2)·심사 폼 자동 초기화는 실제 화면으로, 가드 9종은 API 로 확인.
남은 것: 행사 전 코드·PIN 변경 (사람 몫), 리허설 후 초기화 실행 (사람 몫).

### 6. 행사 준비
- Vercel 프로젝트 연결 + env 설정 (사람 몫)
- 리허설 전 `v0.9.0-rehearsal` 태그
- 리허설 후 **전체 초기화** (리허설 데이터 제거)
- **행사 전 심사 코드·운영 PIN 변경** (공개 저장소 초기값 그대로 금지, PIN 6자리 이상)
- 심사위원 명단 등록 (운영 화면 설정 탭)
- 전날 `v1.0.0` 태그
- 오프라인 폴백 경로(운영 노트북 로컬 실행) 리허설 때 검증 — 운영 화면은 노트북 본체에서

---

## 이미 내린 결정 (다시 논의하지 말 것)

| 결정 | 이유 |
|------|------|
| **Supabase** (Oracle VM 아님) | 11일 남았고 실사용은 하루. VM 은 OS·TLS·Postgres·백업을 전부 떠안아야 해서 마감을 위협 |
| **모든 접근을 서버 API 라우트 경유, anon 키 미사용** | 브라우저에 DB 키가 안 내려감 → 참가자가 대진·표를 직접 조작할 경로 차단 (SPEC §7) |
| **전역 상태를 `jsonb` 단일 문서로** | R2 추첨처럼 슬롯 여러 개가 동시에 바뀌는 동작이 있어, 정규화하면 중간 상태가 스크린에 노출됨 |
| **`rev` 낙관적 잠금** | 운영자 여러 명이 동시에 눌러도 덮어쓰기 사고 방지 |
| **초기 브래킷을 SQL 아닌 TS 에 정의** | 두 곳에 두면 반드시 어긋남 |
| **squash 머지 전용** | 당일 롤백 단위가 커밋 하나로 딱 떨어짐 |
| **CI Node 24** | 로컬과 동일하게 고정 |
| **`CardCarousel`·`ResultCard` 제거** | 이 앱이 안 쓰고 렌더할 화면이 없어 React 19 룰 수정을 검증할 수 없었음. 복구법은 README 에 기재 |
| **결과 취소 없음** (2026-08-16) | `done` 은 종착 상태. 공개가 곧 현장 발표라 롤백해도 발표를 못 되돌리고, 하위 대진 무효화 정책 문제도 함께 사라짐. 대신 공개 버튼에 확인 다이얼로그 필수. 최후 수단은 전체 초기화 |
| **팀 캐릭터는 학교별 매핑** (2026-08-16) | 각 학교에 맞는 캐릭터 이미지를 팀에 매핑. `Team.character` 에 이미지 키(`char_NN`) 저장. 필요한 이미지는 담당자가 추가 예정 |
| **심사위원 명단제** (2026-08-17) | 상태에 `judges` 배열. 명단 밖 명의 제출은 서버가 거부 — 심사 코드가 새어도 가짜 표 차단. 입장은 코드 검증 → 명단에서 이름 선택 (SPEC §3) |
| **초기 코드·PIN 은 수동 변경** (2026-08-17) | 강제 로직 없이 리허설 체크리스트로 관리. 행사 전 운영 화면에서 변경 (PIN 6자리 이상 권장) |
| **캐릭터는 학교 자동 배정 + 수동 변경** (2026-08-18, 8/17 결정 갱신) | 담당자가 실배정 데이터(학교 80 ↔ 캐릭터 80)를 제공해 `lib/characterMap.ts` 로 코드화. 팀 관리에서 학교 입력 시 자동 배정, 픽커로 수동 변경 가능. 8/17 의 '매핑 테이블 없음'은 데이터가 없던 시점의 결정 |
| **배포는 Vercel** (2026-08-17) | GitHub 연동 자동 배포 + CDN 캐시로 폴링 부하 흡수. 계정·env 연결은 사람 몫 |

---

## 미결 사항 (사람이 정해야 함)

- **브랜드 컬러 토큰 · 트랙별 컬러 4종** 실제 값 (잠정값으로 운영 가능)
- **트랙 표기명** — 화면에 `SJF`/`AAC`/`LIKELION`/`OPEN` 그대로 쓸지, 풀네임으로 쓸지
- **실제 팀 명단 · 심사위원 명단** — 저장소에 커밋하지 말 것 (운영 화면에서 입력)

## 배포 (2026-08-18 완료)

- **URL: https://animal-league-nine.vercel.app** — main 머지 시 자동 재배포
- 원격 스모크 통과: 화면 3개 200 · 비밀값 누출 없음 · CDN 캐시 HIT(X-Vercel-Cache) ·
  가드 3종(심사 코드 401 / proxy 401 / PIN 401) · 프로젝터 해상도 실렌더 확인
- 당일 화면 주소: 스크린 `/` · 심사 `/judge` · 운영 `/admin`
- 8/22 프리즈 후에는 **머지 중단이 곧 배포 동결**. 당일 롤백은 Vercel 대시보드
  Deployments 에서 이전 배포 Promote (main 히스토리는 PR 단위라 대상 찾기 쉬움)

---

## 새 세션에서 시작하기

```bash
cd C:\Users\tlstk\Desktop\animal-league
git switch main && git pull
claude
```

첫 프롬프트 예시:

> `docs/HANDOFF.md` 와 `docs/SPEC.md` 읽고, 다음 작업부터 이어서 해줘.

`CONTRIBUTING.md` 의 브랜치·커밋 규칙을 따를 것. `main` 직접 커밋은 PR 없이 막혀 있다.
