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

Supabase 연동, 배정 로직, 관리자 페이지, 이벤트 로깅은 원본 서비스 전용이라 제외했습니다.
데이터가 필요해지면 `@supabase/supabase-js` 를 새로 붙이면 됩니다.
