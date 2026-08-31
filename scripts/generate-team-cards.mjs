// 팀 카드(public/team-cards/team_NN.png) 생성 —
// 캐릭터 카드(public/characters/char_NN.png)와 **같은 카드 패밀리**로 맞춘 디자인이다.
// 대진표·표 공개 화면에서 두 종류가 나란히 보이므로 문법이 어긋나면 바로 티가 난다.
//
// 원본 캐릭터 카드에서 가져온 규칙:
//   · 640×960, 곡률 36 (= 폭 5.7% / 높이 3.8% — components/ui.tsx CARD_RADIUS 와 같은 값)
//   · 단색 브랜드 배경 (그라데이션 아님)
//   · 좌상단에 배경보다 훨씬 진한 톤의 대형 디스플레이 워드마크
//   · 하단 좌측 멋쟁이사자처럼 락업, 하단 우측 흰 알약 라벨
// 배경/워드마크 색 5쌍은 캐릭터 카드에서 실측한 값이고, 8팀을 채우려고 3쌍을
// 같은 톤으로 추가했다.
//
// 실행: node scripts/generate-team-cards.mjs ["1팀" "2팀" ...]
//   인자를 주면 그 이름으로, 없으면 아래 기본 명단으로 만든다.
//   팀명은 이미지에 굽는다 — 운영 화면에서 팀명을 바꿨다면 다시 돌려야 한다.

import { mkdirSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { likelionMark } from './lib/likelion-mark.mjs';

const outDir = path.join(process.cwd(), 'public', 'team-cards');
mkdirSync(outDir, { recursive: true });

const DEFAULT_TEAMS = ['1팀', '2팀', '4팀', '5팀', '6팀', '7팀', '8팀', '9팀'];
const teams = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_TEAMS;

/** [배경, 워드마크] — 앞 5쌍은 캐릭터 카드 실측값. R1 인접 대진끼리 색이 겹치지 않는 순서. */
const PALETTE = [
  ['#e4659c', '#991c21'], // 핑크 (char_01)
  ['#009adf', '#0b3990'], // 블루 (char_04)
  ['#62b454', '#0c5a33'], // 그린 (char_05)
  ['#e77127', '#872223'], // 오렌지 (char_02)
  ['#594d99', '#080b3a'], // 퍼플 (char_03)
  ['#12a3a8', '#063f4a'], // 틸 (추가)
  ['#d94f4a', '#6d1417'], // 레드 (추가)
  ['#d9a022', '#6b3d0c'], // 골드 (추가)
];

const W = 640;
const H = 960;
const R = 36;
const PAD = 52;

/** 디스플레이 서체 — Impact 는 윈도우 기본 탑재이고 원본 워드마크처럼 좁고 두껍다. */
const DISPLAY = 'Impact, Haettenschweiler, \'Arial Narrow Bold\', sans-serif';
/** 본문/라벨 — 한글이 섞이므로 폴백까지 굵은 계열로 */
const LABEL = '\'Arial Black\', \'Malgun Gothic\', sans-serif';

const escapeXml = (s) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));

/** 대략적인 글자 폭(em) — 알약 크기 계산용. 한글은 1em, 라틴/숫자는 좁다. */
const advanceEm = (text) =>
  [...text].reduce((sum, ch) => {
    if (/\s/.test(ch)) return sum + 0.3;
    if (/[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(ch)) return sum + 1.0;
    if (/[0-9]/.test(ch)) return sum + 0.62;
    return sum + 0.66;
  }, 0);

const mark = await likelionMark({ color: '#ffffff', height: 30, opacity: 0.92 });

for (const [index, name] of teams.entries()) {
  const [bg, deep] = PALETTE[index % PALETTE.length];

  // 히어로 — 캐릭터 카드의 일러스트 자리를 팀 번호가 대신한다.
  // 번호가 없는 이름(예: "레드팀")이면 이름 전체를 히어로로 쓴다.
  // Impact 는 숫자가 너무 좁아 히어로로는 빈약하다 (실측 "7"@420 = 159px) — 히어로만 Arial Black.
  const digits = name.match(/\d+/)?.[0] ?? null;
  const heroText = digits ?? name;
  const heroSize = digits ? (digits.length === 1 ? 460 : 400) : 220;
  const heroMaxW = 500;
  // Arial Black 실측: 숫자 1글자 ≈ 0.58em, 한글 ≈ 1.0em
  const heroNaturalW = advanceEm(heroText) * heroSize * (digits ? 0.94 : 1);
  const heroFit = heroNaturalW > heroMaxW ? ` textLength="${heroMaxW}" lengthAdjust="spacingAndGlyphs"` : '';

  // 하단 우측 알약 라벨 — 캐릭터 카드의 동물 이름 알약과 같은 자리·같은 문법
  const labelSize = 42;
  const labelW = Math.max(126, Math.round(advanceEm(name) * labelSize) + 60);
  const labelH = 68;
  const labelX = W - PAD - labelW;
  const labelY = H - PAD - labelH;

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
      <defs>
        <clipPath id="card"><rect width="${W}" height="${H}" rx="${R}" ry="${R}"/></clipPath>
        <radialGradient id="sheen" cx="22%" cy="14%" r="78%">
          <stop offset="0" stop-color="#ffffff" stop-opacity="0.10"/>
          <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.55" stop-color="#000000" stop-opacity="0"/>
          <stop offset="1" stop-color="#000000" stop-opacity="0.10"/>
        </linearGradient>
        <filter id="heroShadow" x="-25%" y="-25%" width="150%" height="150%">
          <feDropShadow dx="0" dy="14" stdDeviation="16" flood-color="#000000" flood-opacity="0.20"/>
        </filter>
      </defs>

      <g clip-path="url(#card)">
        <rect width="${W}" height="${H}" fill="${bg}"/>
        <rect width="${W}" height="${H}" fill="url(#sheen)"/>
        <rect width="${W}" height="${H}" fill="url(#floor)"/>

        <!-- 워드마크 — 캐릭터 카드의 ANIMAL / LEAGUE 자리 -->
        <g fill="${deep}" font-family="${DISPLAY}" font-size="140" font-weight="400">
          <text x="${PAD}" y="190">AI</text>
          <!-- 140 에서 VIBETHON 자연폭이 538 ≈ 본문 폭(536) — 자간만 미세 조정해 좌우를 맞춘다
               (spacingAndGlyphs 로 늘리면 획 두께가 AI 와 달라진다) -->
          <text x="${PAD}" y="316" textLength="${W - PAD * 2}" lengthAdjust="spacing">VIBETHON</text>
        </g>

        <!-- 히어로 -->
        <text x="${W / 2}" y="738" text-anchor="middle" font-family="${LABEL}" font-size="${heroSize}"
              font-weight="900" fill="#ffffff" filter="url(#heroShadow)"${heroFit}>${escapeXml(heroText)}</text>

        <!-- 하단 알약 라벨 -->
        <rect x="${labelX}" y="${labelY}" width="${labelW}" height="${labelH}" rx="${labelH / 2}" fill="#ffffff"/>
        <text x="${labelX + labelW / 2}" y="${labelY + labelH / 2 + labelSize * 0.36}" text-anchor="middle"
              font-family="${LABEL}" font-size="${labelSize}" font-weight="900" fill="${bg}">${escapeXml(name)}</text>
      </g>
    </svg>
  `;

  await sharp(Buffer.from(svg))
    .composite([{ input: mark.buffer, left: PAD, top: Math.round(H - PAD - labelH / 2 - mark.height / 2) }])
    .png()
    .toFile(path.join(outDir, `team_${String(index + 1).padStart(2, '0')}.png`));

  console.log(`team_${String(index + 1).padStart(2, '0')}.png  ${name}  ${bg}`);
}
