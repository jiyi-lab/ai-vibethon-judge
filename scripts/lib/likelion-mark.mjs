// 멋쟁이사자처럼 로고 누끼 — public/likelion-logo.jpg (흰 배경 + 단색 오렌지 잉크)에서
// 알파를 뽑아 원하는 색·크기로 찍어내는 공용 모듈. 카드 뒷면·팀 카드가 함께 쓴다.
//
// 원본이 JPG 라 경계에 크로마 서브샘플링 프린지가 남는다. 그래서 "임계값 이상은
// 투명" 식의 하드 컷이 아니라, **휘도를 알파로 환산**하고 RGB 는 잉크색으로
// 통일한다 — 안티에일리어싱이 살아 있는 진짜 누끼가 나오고 색 프린지는 사라진다.

import path from 'node:path';
import sharp from 'sharp';

const SOURCE = path.join(process.cwd(), 'public', 'likelion-logo.jpg');

/** 원본 실측값 (probe): 배경 #f9f9f9, 잉크 #fe5e00. */
const BG_LUMA = 249;
const INK_LUMA = 0.2126 * 254 + 0.7152 * 94 + 0.0722 * 0; // ≈ 121.2
/** 잉크 기본색 — 원본 오렌지. */
export const LIKELION_ORANGE = '#fe5e00';

const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

function parseHex(hex) {
  const h = hex.replace('#', '');
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16));
}

let cached = null;

/**
 * 원본에서 알파 마스크를 뽑아 콘텐츠 bbox 로 잘라 캐시한다.
 * 알파 = (배경휘도 − 픽셀휘도) / (배경휘도 − 잉크휘도), 0~1 클램프.
 */
async function alphaMask() {
  if (cached) return cached;
  const { data, info } = await sharp(SOURCE).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const at = (x, y) => (y * info.width + x) * info.channels;

  const span = BG_LUMA - INK_LUMA;
  const full = new Uint8Array(info.width * info.height);
  let top = null, bottom = null, left = null, right = null;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = at(x, y);
      const a = Math.round(((BG_LUMA - luma(data[i], data[i + 1], data[i + 2])) / span) * 255);
      // JPG 노이즈가 배경에 알파 1~2 를 흩뿌린다 — 바닥/천장을 눌러 깔끔하게
      const clamped = a < 12 ? 0 : a > 243 ? 255 : a;
      full[y * info.width + x] = clamped;
      if (clamped > 0) {
        if (top === null) top = y;
        bottom = y;
        if (left === null || x < left) left = x;
        if (right === null || x > right) right = x;
      }
    }
  }
  if (top === null) throw new Error('로고 원본에서 잉크를 찾지 못했습니다: ' + SOURCE);

  const width = right - left + 1;
  const height = bottom - top + 1;
  const alpha = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) alpha[y * width + x] = full[(top + y) * info.width + (left + x)];
  }
  cached = { alpha, width, height };
  return cached;
}

/**
 * 누끼 로고를 원하는 색·높이로 렌더한다.
 * @param {{ color?: string, height?: number, opacity?: number }} options
 * @returns {Promise<{ buffer: Buffer, width: number, height: number }>}
 */
export async function likelionMark({ color = LIKELION_ORANGE, height, opacity = 1 } = {}) {
  const mask = await alphaMask();
  const [r, g, b] = parseHex(color);
  const rgba = Buffer.alloc(mask.width * mask.height * 4);
  for (let i = 0; i < mask.alpha.length; i++) {
    rgba[i * 4] = r;
    rgba[i * 4 + 1] = g;
    rgba[i * 4 + 2] = b;
    rgba[i * 4 + 3] = Math.round(mask.alpha[i] * opacity);
  }
  let img = sharp(rgba, { raw: { width: mask.width, height: mask.height, channels: 4 } });
  if (height) img = img.resize({ height: Math.round(height) }); // 폭은 비율 유지 자동
  const buffer = await img.png().toBuffer();
  const meta = await sharp(buffer).metadata();
  return { buffer, width: meta.width, height: meta.height };
}

/** 원본 비율 (폭 ÷ 높이) — 배치 계산용. */
export async function likelionMarkAspect() {
  const mask = await alphaMask();
  return mask.width / mask.height;
}
