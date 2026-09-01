const BASE = 'https://ai-vibethon-judge.vercel.app';
const html = await (await fetch(BASE + '/?cb=' + Math.random())).text();
const srcs = [...html.matchAll(/src="(\/_next\/static\/[^"]+\.js)"/g)].map((m) => m[1]);
for (const s of new Set(srcs)) {
  const js = await (await fetch(BASE + s)).text();
  // 수정본에는 unlockSfx 호출 뒤에 await 가 없다 — 소스맵 대신 특징 문자열로 판정
  if (js.includes('RESUME_TIMEOUT') || /unlockSfx\(\),\s*\w+\(\)/.test(js)) { console.log('DEPLOYED'); process.exit(0); }
}
console.log('not-yet'); process.exit(1);
