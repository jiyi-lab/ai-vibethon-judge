#!/usr/bin/env node
// UI 스크린샷 캡처 — PR 첨부용 (CONTRIBUTING.md "PR와 스크린샷" 참고).
//
//   node scripts/shot.mjs <url> <slug> [--desktop|--mobile|--screen]
//
//   node scripts/shot.mjs http://localhost:3000/admin admin-live
//   → docs/screenshots/admin-live-desktop.png (1440×900)
//   → docs/screenshots/admin-live-mobile.png  (390×844)
//
// 뷰포트 플래그를 주면 해당 크기만 찍는다.
// --screen 은 프로젝터 기준 1920×1080 (스크린 화면 전용).
//
// 의존성 없음 — npx 가 playwright CLI 를 내려받아 실행한다.
// 최초 1회 브라우저 설치: npx playwright install chromium

import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const VIEWPORTS = {
  desktop: '1440,900',
  mobile: '390,844',
  screen: '1920,1080',
};

const args = process.argv.slice(2);
const flags = args.filter((a) => a.startsWith('--')).map((a) => a.slice(2));
const [url, slug] = args.filter((a) => !a.startsWith('--'));

if (!url || !slug) {
  console.error('사용법: node scripts/shot.mjs <url> <slug> [--desktop|--mobile|--screen]');
  process.exit(1);
}

const targets = flags.length > 0 ? flags : ['desktop', 'mobile'];
const dir = 'docs/screenshots';
mkdirSync(dir, { recursive: true });

for (const kind of targets) {
  const size = VIEWPORTS[kind];
  if (!size) {
    console.error(`알 수 없는 뷰포트: --${kind} (desktop | mobile | screen)`);
    process.exit(1);
  }
  const out = `${dir}/${slug}-${kind}.png`;
  const result = spawnSync(
    'npx',
    [
      'playwright', 'screenshot',
      `--viewport-size=${size}`,
      '--wait-for-timeout=2500', // 폴링 첫 응답·폰트 로드를 기다린다
      url, out,
    ],
    { stdio: 'inherit', shell: process.platform === 'win32' },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
  console.log(`저장됨: ${out}`);
}
