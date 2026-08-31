// 카드 뒷면 에셋에 구워진 지난 행사 브랜딩 교체 —
// 원본(capsule-match ANIMAL LEAGUE)의
//   · 하단 락업: 시연용 가상 학교 "멋사대학"  → **멋쟁이사자처럼** 워드마크 (누끼)
//   · 대형 워드마크: "ANIMAL LEAGUE"          → **AI VIBETHON**
//
// 원본 PNG 는 손대지 않고 새 버전 파일로 내보낸다 (프로젝트의 -ver2 관례).
//   card-back-Q-ver2.png  → card-back-Q-ver3.png   (물음표 카드: 빈 슬롯·표 뒷면)
//   card-back-0624.png    → card-back-0624-ver2.png (R2 추첨 셔플 뒷면)
//
// 교체 자리는 전부 단색 배경이라 (실측: Q #1b0a00, 0624 #000000) 그 색으로 덮고
// 같은 자리에 새 요소를 얹는다. 배경이 단색이 아니면 중단한다 — 좌표가 틀어졌다는 뜻이다.
//
// 대형 워드마크의 원본 서체는 ANIMAL LEAGUE 전용 커스텀(사자 귀가 달린 A·G)이라
// 다시 쓸 수 없다. 윈도우 기본 탑재 중 가장 가까운 좁고 두꺼운 Impact 로 조판한다.
//
// 실행: node scripts/generate-card-backs.mjs

import path from 'node:path';
import sharp from 'sharp';
import { likelionMark } from './lib/likelion-mark.mjs';

const pub = (name) => path.join(process.cwd(), 'public', name);

/** 디스플레이 서체 — 원본 워드마크처럼 좁고 두껍다. */
const DISPLAY = 'Impact, Haettenschweiler, sans-serif';

/**
 * 실측(probe)한 원본 위치.
 *   band     = 덮을 영역, sample = 배경색을 읽을 지점 (덮을 영역 바깥의 여백)
 *   mark     = 하단 멋쟁이사자처럼 락업 배치
 *   wordmark = 대형 워드마크 배치 (없으면 건너뜀)
 * Impact 실측: 대문자 cap height ≈ font-size × 0.82, "VIBETHON"@125 = 480×103, "AI"@125 = 96×99.
 */
const JOBS = [
  {
    src: 'card-back-Q-ver2.png',
    out: 'card-back-Q-ver3.png',
    band: { x: 200, y: 1368, w: 640, h: 108 }, // 원본 락업 bbox x379~652 / y1396~1439
    sample: { x: 220, y: 1330 },
    mark: { color: '#e77127', height: 44, centerX: 520, centerY: 1418 },
  },
  {
    src: 'card-back-0624.png',
    out: 'card-back-0624-ver2.png',
    band: { x: 110, y: 786, w: 380, h: 62 }, // 원본 락업 bbox x219~376 / y805~830
    sample: { x: 130, y: 770 },
    mark: { color: '#e8641e', height: 26, centerX: 300, centerY: 818 },
    wordmark: {
      // 원본 ANIMAL LEAGUE bbox x89~510 / y293~585 (두 줄: 293~428, 439~585)
      band: { x: 50, y: 275, w: 500, h: 330 },
      sample: { x: 60, y: 250 },
      color: '#e77127',
      centerX: 300,
      centerY: 439, // 원본 블록의 세로 중심
      size: 125, // "VIBETHON" 자연폭 480 — 카드 폭 600 안에서 최대치
      lines: ['AI', 'VIBETHON'],
      lineGap: 22,
    },
  },
];

const hex = (r, g, b) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');

/** 밴드가 정말 단색인지 확인 — 아니면 좌표가 틀어진 것이므로 덮으면 안 된다. */
function assertFlat(label, px, band, sample) {
  const bg = px(sample.x, sample.y);
  const corners = [
    [band.x + 2, band.y + 2],
    [band.x + band.w - 3, band.y + 2],
    [band.x + 2, band.y + band.h - 3],
    [band.x + band.w - 3, band.y + band.h - 3],
  ].map(([x, y]) => px(x, y));
  if (!corners.every((c) => c.every((v, i) => Math.abs(v - bg[i]) <= 2))) {
    throw new Error(
      `${label}: 덮을 밴드의 배경이 단색이 아닙니다 (${hex(...bg)} vs ${corners.map((c) => hex(...c)).join(', ')}). ` +
        '밴드 좌표를 다시 재거나 배경을 따로 합성해야 합니다.',
    );
  }
  return bg;
}

const patchOf = (band, bg) =>
  sharp({
    create: { width: band.w, height: band.h, channels: 4, background: { r: bg[0], g: bg[1], b: bg[2], alpha: 1 } },
  })
    .png()
    .toBuffer();

for (const job of JOBS) {
  const srcPath = pub(job.src);
  const { data, info } = await sharp(srcPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = (x, y) => {
    const i = (y * info.width + x) * info.channels;
    return [data[i], data[i + 1], data[i + 2]];
  };

  const layers = [];

  // 1. 하단 로고 락업
  const bg = assertFlat(`${job.src} 락업`, px, job.band, job.sample);
  const mark = await likelionMark({ color: job.mark.color, height: job.mark.height });
  layers.push(
    { input: await patchOf(job.band, bg), left: job.band.x, top: job.band.y },
    {
      input: mark.buffer,
      left: Math.round(job.mark.centerX - mark.width / 2),
      top: Math.round(job.mark.centerY - mark.height / 2),
    },
  );

  // 2. 대형 워드마크
  let wordmarkNote = '';
  if (job.wordmark) {
    const w = job.wordmark;
    const wbg = assertFlat(`${job.src} 워드마크`, px, w.band, w.sample);

    const cap = w.size * 0.82; // Impact 대문자 높이 실측 비율
    const blockH = w.lines.length * cap + (w.lines.length - 1) * w.lineGap;
    const firstBaseline = w.centerY - blockH / 2 + cap;
    // 좌표는 카드 기준으로 쓰고, translate 로 밴드 좌표계에 옮겨 그린다
    const texts = w.lines
      .map(
        (line, i) =>
          `<text x="${w.centerX}" y="${Math.round(firstBaseline + i * (cap + w.lineGap))}" ` +
          `text-anchor="middle" font-family="${DISPLAY}" font-size="${w.size}" fill="${w.color}">${line}</text>`,
      )
      .join('');
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w.band.w}" height="${w.band.h}" viewBox="0 0 ${w.band.w} ${w.band.h}">` +
      `<g transform="translate(${-w.band.x}, ${-w.band.y})">${texts}</g></svg>`;

    layers.push(
      { input: await patchOf(w.band, wbg), left: w.band.x, top: w.band.y },
      { input: await sharp(Buffer.from(svg)).png().toBuffer(), left: w.band.x, top: w.band.y },
    );
    wordmarkNote = `, 워드마크 ${w.lines.join('/')} @${w.size}`;
  }

  await sharp(srcPath).composite(layers).png().toFile(pub(job.out));
  console.log(`${job.src} → ${job.out}  (배경 ${hex(...bg)}, 로고 ${mark.width}×${mark.height}${wordmarkNote})`);
}
