# ai-vibethon

**AI 바이브톤 심사·토너먼트 운영 도구**.
스크린 · 심사 · 운영 3개 화면으로 브래킷 진행과 심사를 관리합니다.

2026 LIKELION UNIV. 14th Hackathon 본선(8/25, 코엑스 마곡)용으로 만든 도구를 이어서 쓰고 있습니다 —
화면에 남아 있던 지난 행사 브랜딩(ANIMAL LEAGUE)은 2026-08-31 에 AI VIBETHON 으로 교체했습니다.

| 문서 | 내용 |
|------|------|
| [docs/SPEC.md](docs/SPEC.md) | **요구사항 단일 출처** — 토너먼트 규칙, 데이터 모델, 화면 명세 |
| [docs/HANDOFF.md](docs/HANDOFF.md) | **현재 진행 상황과 다음 작업** — 작업 시작 전 여기부터 |
| [CONTRIBUTING.md](CONTRIBUTING.md) | 브랜치 · 커밋 · 릴리스 전략 |

에셋과 컴포넌트는 `capsule-match` 프로젝트에서 가져왔고, **git 히스토리는 이어받지 않았습니다.**

## 실행

```bash
npm install
npm run dev
```

http://localhost:3000 을 열면 확인용 인덱스 페이지가 보입니다.
`app/page.tsx` 는 에셋이 잘 넘어왔는지 보려고 만든 임시 페이지라 그대로 갈아엎어도 됩니다.

## 스택

Next.js 16.2.9 / React 19 / Tailwind CSS v4 / three.js (@react-three/fiber, drei)

> ⚠️ Next.js 16은 이전 버전과 규약이 다릅니다 (middleware → proxy 등).
> 코드를 쓰기 전에 `node_modules/next/dist/docs/` 의 해당 문서를 먼저 확인하세요. `AGENTS.md` 참고.

## 배포 (Vercel + Supabase)

데이터 저장소는 **Supabase**(관리형 Postgres), 호스팅은 **Vercel**. 앱은 브라우저에서
DB 를 직접 건드리지 않는다 — 모든 접근이 서버 API 라우트를 거친다.

### 왜 기존 프로젝트에 얹는가

Supabase 무료 플랜은 **활성 프로젝트 2개가 계정 전체 한도**(조직별이 아니다)라
이 행사용 프로젝트를 새로 만들 수 없었다. 그래서 다른 용도로 쓰던 기존 프로젝트에
얹되, 호스트 프로젝트가 이 앱 때문에 위험해지지 않도록 두 겹으로 나눈다.

| 나눈 것 | 무엇을 막는가 |
|---------|---------------|
| **스키마** `vibethon` | 테이블 이름 충돌, 호스트의 `public` 과 뒤섞임 |
| **role** `vibethon_app` | 키가 새도 `vibethon` 밖으로는 아무것도 못 한다 |

**role 분리가 본체다.** 스키마만 나누는 것으로는 권한이 전혀 줄지 않는다 —
`service_role` 은 그 프로젝트 DB **전체**의 마스터 키라, 그 키를 이 앱과 Vercel
환경변수에 넣는 순간 행사 앱이 뚫렸을 때 호스트 프로젝트 데이터까지 열린다.

### 1. Supabase

1. 기존 프로젝트의 **SQL Editor** 에 `supabase/schema.sql` 전체를 붙여넣고 Run.
   스키마·전용 role·테이블 2개·권한·RLS 정책이 한 번에 만들어진다 (멱등, 여러 번 실행해도 안전).
2. **Settings > API > Exposed schemas** 에 `vibethon` 을 추가한다.
   PostgREST 가 서빙할 스키마 목록이다 — 추가해도 grant 없는 role 은 여전히 못 읽는다.
3. **Settings > API > JWT Settings** 에서 **JWT Secret** 을 복사해 전용 키를 발급한다.

   ```bash
   SUPABASE_JWT_SECRET='...' node scripts/mint-supabase-key.mjs --ref <project-ref>
   ```

   > ⚠️ JWT 시크릿을 jwt.io 같은 웹사이트에 붙여넣지 말 것 — 그 자체가 유출이다.
   > 이 스크립트는 로컬에서 표준 crypto 모듈로만 서명하고 아무 데도 전송하지 않는다.
   > 인자로 넘기지도 말 것 (`ps` 목록과 셸 히스토리에 남는다).

4. **Settings > Data API > Project URL** 을 복사한다.

### 2. Vercel

1. GitHub 저장소를 Import — Next.js 는 자동 감지되므로 빌드 설정은 건드리지 않는다.
2. **Settings > Environment Variables** 에 두 개를 등록한다 (Production / Preview / Development 전부).

   | 이름 | 값 |
   |------|-----|
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
   | `SUPABASE_VIBETHON_KEY` | 3번에서 발급한 토큰 |

3. Deploy.

`main` 에 머지하면 자동 재배포된다. 당일 롤백은 Deployments 에서 직전 배포를 Promote.

> **대체 경로** — 프로젝트가 새 비대칭 서명 키만 쓰고 있어 JWT Secret 을 못 구하면,
> `SUPABASE_SERVICE_ROLE_KEY` 에 service_role 키를 넣어도 동작한다.
> 다만 그건 호스트 프로젝트까지 열리는 키를 한 벌 더 두는 것이라 위 표의 보호가 사라진다.
> 스키마 분리만 남는다는 점을 알고 쓸 것.

### 3. 배포 후 확인

- [ ] `/` · `/judge` · `/admin` 세 화면 200
- [ ] `GET /api/state` 응답에 `judgeCode` · `adminPin` 이 **없다**
- [ ] 운영 화면 PIN 로그인 → 팀 8개 등록 → 심사위원 명단 등록
- [ ] 경기 시작 → 심사 제출 → 결과 공개까지 한 바퀴 (여기까지 되면 전용 role 권한이 충분하다는 뜻)
- [ ] **심사 코드와 운영 PIN 변경** — 초기값(`ANIMAL` / `0825`)이 저장소에 그대로 있다.
      운영 화면 설정 탭에서 바꾼다. PIN 은 6자리 이상 권장
- [ ] 리허설 데이터를 넣었다면 본 행사 전 **전체 초기화**

### 행사가 끝나면

호스트 프로젝트에서 이 앱의 흔적만 통째로 지울 수 있다 (`supabase/schema.sql` 맨 아래).

```sql
drop schema vibethon cascade;
revoke vibethon_app from authenticator;
drop role vibethon_app;
```

### 환경 변수가 없으면

로컬은 `ai-vibethon.local.json` 파일 저장소로 자동 폴백해서 Supabase 없이도 개발할 수 있다
(`.env.local` 을 만들면 즉시 Supabase 로 붙는다). **Vercel 에서는 폴백하지 않고 에러를 낸다** —
읽기 전용 파일시스템이라 첫 쓰기에서 터지고, 설령 써지더라도 람다 인스턴스마다 서로 다른
대진표를 들게 되기 때문이다. 환경 변수 누락을 행사 중이 아니라 첫 요청에서 알아채기 위한 장치다.

## 에셋 (`public/`)

| 경로 | 내용 |
|------|------|
| `characters/char_01~80.png` | 캐릭터 이미지 80종 |
| `char_00.png` | 사자 (시연용으로 쓰던 별도 캐릭터) |
| `logos/*.png` | 대학 로고 80종 — `lib/universityLogos.ts` 가 학교명으로 매핑 |
| `card-back-Q-ver3.png`, `card-back-0624-ver2.png` | **현재 쓰는 카드 뒷면** — 하단 락업이 멋쟁이사자처럼 |
| `card-back-0624.png`, `card-back-Q.png`, `card-back-Q-ver2.png` | 원본 뒷면 (하단 락업이 시연용 가상 학교 "멋사대학") — 재생성 원본이라 보존 |
| `team-cards/team_01~08.png` | 팀 카드 — `scripts/generate-team-cards.mjs` 로 생성 |
| `likelion-logo.jpg` | 멋쟁이사자처럼 워드마크 원본 (흰 배경) — 누끼는 `scripts/lib/likelion-mark.mjs` 가 뜬다 |
| `holo-pattern.png` | `ResultCard` 홀로그램 오버레이 |
| `main.1_background_ver3.png`, `main.2_background_ver2.png`, `mo-background_ver2.png` | 메인 배경 (PC / 모바일) |
| `검표원 사자 배경보정.mp4`, `검표원_더미이미지0624.webp` | 사자 영상 + 포스터 이미지 |

## 에셋 재생성 (`scripts/`)

이미지 에셋 일부는 스크립트로 굽는다 (sharp 필요).

```bash
node scripts/generate-team-cards.mjs            # 기본 명단으로 팀 카드 8장
node scripts/generate-team-cards.mjs 1팀 2팀 …   # 팀명을 직접 줄 수도 있다
node scripts/generate-card-backs.mjs            # 카드 뒷면의 하단 로고 락업 교체
```

팀 카드는 **팀명을 이미지에 굽는다** — 운영 화면에서 팀명을 바꿨다면 다시 구워야 한다.
파일명이 그대로라 이미 열어둔 브라우저는 옛 카드를 캐시에서 계속 쓴다.
다시 구운 뒤에는 강력 새로고침(Ctrl+Shift+R) 한 번.

## 컴포넌트 (`components/`)

| 컴포넌트 | 설명 | 쓰는 에셋 |
|----------|------|-----------|
| `SpinningCard3D` | three.js 3D 회전 카드. 기울기를 `tiltRef` / `zTiltRef` 로 받아 리렌더 없이 제어 | 카드 뒷면 2종 |
| `TicketIntro` | 사자 영상이 들어간 인트로 화면 | 사자 mp4 + webp |
| `CodeInput` | 5칸 코드 입력. 붙여넣기 자동 분배, 에러 시 흔들림 | — |
| `UniversitySelect` | 학교 그리드(PC) / 리스트(모바일) | `logos/*` |
| `LoadingOverlay` | 블러 로딩 오버레이 | — |
| `CornerGlow` | 모서리 글로우 배경 장식 | — |

`UniversitySelect` 는 `lib/types.ts` 의 최소 `University` 타입(`id`, `name`, `assigned_character_id`)만 씁니다.
원본의 DB 스키마는 가져오지 않았으니 새 데이터 소스에 맞춰 확장하세요.

### 되살릴 수 있는 컴포넌트

`CardCarousel`(원호 캐러셀)과 `ResultCard`(홀로그램 카드)는 초기 커밋에는 있었지만,
이 앱에서 쓰지 않는 데다 React 19 컴파일러 룰을 위반해 CI를 막아서 뺐습니다.
동작을 확인할 화면이 없는 상태에서 고치는 것보다, 실제로 필요해질 때 되살리며 함께 고치는 편이 안전합니다.

```bash
git show 0017ca7:components/ResultCard.tsx > components/ResultCard.tsx
git show 0017ca7:components/CardCarousel.tsx > components/CardCarousel.tsx
```

되살릴 때 고쳐야 할 것 — `ResultCard`: 자기 참조 `tick` 콜백(선언 전 접근),
effect 내 `setSparks`. `CardCarousel`: mount 감지·인트로 회전의 effect 내 setState, 렌더 경로의 `Date.now()`.

## 가져오지 않은 것

배정 로직과 이벤트 로깅은 원본 서비스 전용이라 제외했습니다.
Supabase 연동과 관리자 페이지는 그 뒤 이 저장소에서 새로 만들었습니다 (위 **배포** 참고).
데이터가 필요해지면 `@supabase/supabase-js` 를 새로 붙이면 됩니다.
