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
DB 를 직접 건드리지 않는다 — 모든 접근이 서버 API 라우트를 거치고 service_role 키만 쓴다.

### 1. Supabase

1. 프로젝트를 만든다.
2. **SQL Editor** 에 `supabase/schema.sql` 전체를 붙여넣고 Run (여러 번 실행해도 안전).
3. 값 두 개를 복사한다.
   - **Settings > Data API > Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **Settings > API Keys > service_role (secret)** → `SUPABASE_SERVICE_ROLE_KEY`

> ⚠️ `service_role` 은 RLS 를 우회하는 마스터 키다. `NEXT_PUBLIC_` 접두사를 붙이면
> 번들에 실려 브라우저로 내려간다 — 절대 붙이지 말 것.
>
> ⚠️ 무료 티어는 일주일간 요청이 없으면 프로젝트가 일시정지된다.
> 행사 2~3일 전과 전날에 대시보드를 한 번씩 열어 깨워둔다.

### 2. Vercel

1. GitHub 저장소(비공개)를 만들고 `main` 을 푸시한다.
2. Vercel 에서 Import — Next.js 는 자동 감지되므로 빌드 설정은 건드리지 않는다.
3. **Settings > Environment Variables** 에 위 두 값을 등록한다
   (Production / Preview / Development 전부).
4. Deploy.

`main` 에 머지하면 자동 재배포된다. 당일 롤백은 Vercel 대시보드 Deployments 에서
직전 배포를 Promote.

### 3. 배포 후 확인

- [ ] `/` · `/judge` · `/admin` 세 화면 200
- [ ] `GET /api/state` 응답에 `judgeCode` · `adminPin` 이 **없다**
- [ ] 운영 화면 PIN 로그인 → 팀 8개 등록 → 심사위원 명단 등록
- [ ] 경기 시작 → 심사 제출 → 결과 공개까지 한 바퀴
- [ ] **심사 코드와 운영 PIN 변경** — 초기값(`ANIMAL` / `0825`)이 저장소에 그대로 있다.
      운영 화면 설정 탭에서 바꾼다. PIN 은 6자리 이상 권장
- [ ] 리허설 데이터를 넣었다면 본 행사 전 **전체 초기화**

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
