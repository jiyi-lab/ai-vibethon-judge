// 스크린(viewer) 효과음 — Web Audio 원샷 재생.
//
// 브라우저 자동재생 정책 때문에 사용자 제스처 전에는 AudioContext 가 suspended 라
// 소리가 나지 않는다. armSfx() 가 첫 포인터/키 입력에서 컨텍스트를 깨운다 —
// 무대 운영 절차: 프로젝터 창을 띄운 뒤 화면을 한 번 클릭(또는 F 전체화면)하면 이후 자동.
// 실패는 전부 조용히 삼킨다 — 소리는 연출 보조일 뿐, 화면 동작을 막으면 안 된다.
//
// 현재 쓰는 샘플은 2종뿐: 칼 스윙(VS 등장) · 탐 히트(표 카드 플립).
// 출처·라이선스는 public/sfx/LICENSE.txt. 쓰지 않게 된 샘플도 파일은 남겨둔다.
// 행사장 네트워크 대비 셀프호스트 (폰트와 같은 이유, layout.tsx 참조).
//
// 추첨 소리(카드 믹싱 셔플 + card-place 플립 폴리)는 8/24 제거 — 현장에서
// 셔플과 4장 동시 플립 폴리가 겹쳐 지저분하게 들렸다. 추첨 구간은 무음.
// 에셋(card-place-*.ogg, freesound_community-card-mixing-48088.mp3)은 유지.
// 칩 클래터(chips-collide-*)+플링·덱 부채꼴(card-fan-1)은 8/23 제거 — 클래터는
// 결과 화면 무음화, 부채꼴은 첫 플립 드럼과 겹침. 공개 화면 소리는 플립 드럼뿐.
// 에셋 파일은 Kenney 팩 일부라 public/sfx 에 남긴다.
//
// ── 간헐적 무음 수정 (2026-08-31) ───────────────────────────────────────
// 종전 구현은 "요청 순간 준비돼 있지 않으면 그냥 안 낸다"였다. 준비가 안 되는 경로가
// 여럿이라 소리가 났다 안 났다 했다:
//   1) 로드 1회 실패 = 영구 무음 — load() 는 한 번만 돌고 재생 경로가 재시도하지 않았다
//   2) 언락 리스너가 버블 단계 — 중간에서 stopPropagation 하는 핸들러 하나에 통째로 막힌다
//   3) suspended 상태로 들어온 재생 요청을 resume 시도도 없이 버렸다
//   4) 탭 복귀·오디오 장치 변경으로 컨텍스트가 suspended/closed 로 떨어지면 회복 경로가 없었다
// 이제 재생 요청은 (a) 준비돼 있으면 즉시, (b) 아니면 깨우고 받아온 뒤 **지각 허용치
// 안에서만** 낸다. 허용치를 넘기면 화면과 어긋나므로 내지 않는 편이 낫다.

// 칼 스윙 (Pixabay Dragon Studio, 2.2초) — 운영자 직접 선곡 (8/23), VS 등장용.
// 종전 hit-orchestra.ogg(Kenney jingles HIT15) 를 대체.
const HIT_SOURCE = '/sfx/dragon-studio-sword-slice-2-393845.mp3';
// 팡파레(fanfare.mp3)·우승 슬램 소리는 8/24 제거 — 파일은 유지 (재도입 시 #52·#79).
// 팡파레는 **음향 콘솔 담당으로 확정** (8/24 운영자 — 8/22 "화면 담당" 폐기,
// 음향팀 큐시트에 결선 팡파레 큐 필요. 운영 안내 아티팩트 v7 반영).
// 시네마틱 탐 히트 (Pixabay fronbondi_skegs, 1.68초) — 운영자 선곡 (8/23),
// **투표 공개의 표 카드 플립**용 ("드럼 히트를 심사위원들 투표 공개할 때" —
// 슬램 아님).
const DRUM_SOURCE = '/sfx/fronbondi_skegs-drum-huge-cinematic-tom-hit-283585.mp3';

/**
 * 재생 요청 후 이 시간 안에 준비되면 낸다. 넘기면 포기 — 플립·VS 등장에 붙는
 * 소리라 늦게 나오면 화면과 어긋나서 오히려 어색하다.
 */
const LATE_TOLERANCE_MS = 900;
/** 로드 재시도 상한 — 네트워크가 죽었을 때 재생마다 fetch 를 때리지 않도록. */
const MAX_LOAD_ATTEMPTS = 5;

let ctx: AudioContext | null = null;
let hitBuffer: AudioBuffer | null = null;
let drumBuffer: AudioBuffer | null = null;
let hitLoading: Promise<void> | null = null;
let drumLoading: Promise<void> | null = null;
let loadAttempts = 0;
let resuming: Promise<void> | null = null;

const now = () => (typeof performance === 'undefined' ? Date.now() : performance.now());

function context(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioContextCtor = window.AudioContext;
  if (!AudioContextCtor) return null;
  // 닫힌 컨텍스트(오디오 장치 변경 등)는 되살릴 수 없다 — 새로 만든다
  if (ctx && ctx.state === 'closed') ctx = null;
  if (!ctx) ctx = new AudioContextCtor();
  return ctx;
}

async function decodeSample(c: AudioContext, url: string): Promise<AudioBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(String(res.status));
  return c.decodeAudioData(await res.arrayBuffer());
}

function loadHit(c: AudioContext): Promise<void> {
  if (hitBuffer) return Promise.resolve();
  if (hitLoading) return hitLoading;
  if (loadAttempts >= MAX_LOAD_ATTEMPTS) return Promise.resolve();
  loadAttempts += 1;
  hitLoading = (async () => {
    try {
      hitBuffer = await decodeSample(c, HIT_SOURCE);
      loadAttempts = 0; // 성공했으면 재시도 카운터를 되돌린다
    } catch {
      /* 다음 재생 요청이 다시 시도한다 */
    } finally {
      hitLoading = null;
    }
  })();
  return hitLoading;
}

function loadDrum(c: AudioContext): Promise<void> {
  if (drumBuffer) return Promise.resolve();
  if (drumLoading) return drumLoading;
  if (loadAttempts >= MAX_LOAD_ATTEMPTS) return Promise.resolve();
  loadAttempts += 1;
  drumLoading = (async () => {
    try {
      drumBuffer = await decodeSample(c, DRUM_SOURCE);
      loadAttempts = 0; // 성공했으면 재시도 카운터를 되돌린다
    } catch {
      /* 다음 재생 요청이 다시 시도한다 */
    } finally {
      drumLoading = null;
    }
  })();
  return drumLoading;
}

/** 샘플 로드 — 실패해도 다음 요청이 다시 시도한다 (진행 중 프라미스는 공유). */
function load(c: AudioContext): Promise<void> {
  return Promise.all([loadHit(c), loadDrum(c)]).then(() => undefined);
}

/** suspended 컨텍스트 깨우기 — 요청이 겹쳐도 resume 은 한 번만 건다. */
function wake(c: AudioContext): Promise<void> {
  if (c.state === 'running') return Promise.resolve();
  if (!resuming) {
    resuming = c
      .resume()
      .catch(() => {}) // 제스처 전이면 거부된다 — 다음 요청에서 다시 시도
      .finally(() => {
        resuming = null;
      });
  }
  return resuming;
}

function prime(c: AudioContext): void {
  try {
    const gain = c.createGain();
    gain.gain.value = 0.00001;
    const osc = c.createOscillator();
    osc.frequency.value = 440;
    osc.connect(gain).connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + 0.03);
  } catch {
    /* 프라임 실패도 화면을 막으면 안 된다 */
  }
}

/**
 * 재생 게이트 — 준비돼 있으면 같은 프레임에 바로, 아니면 깨우고 받아온 뒤
 * 지각 허용치 안에서만 실행한다. 준비가 안 됐어도 로드는 걸어두므로 다음
 * 요청부터는 즉발로 나간다.
 */
function schedule(run: (c: AudioContext) => void): void {
  const c = context();
  if (!c) return;
  if (c.state === 'running') {
    run(c);
    return;
  }
  const requestedAt = now();
  void Promise.all([wake(c), load(c)]).then(() => {
    if (c.state !== 'running') return; // 아직 제스처 전 — 조용히 포기
    if (now() - requestedAt > LATE_TOLERANCE_MS) return; // 너무 늦었다
    run(c);
  });
}

/**
 * 화면 마운트 시 1회 호출 — 버퍼 프리로드 + 제스처 언락 리스너 등록.
 * 반환된 정리 함수를 useEffect cleanup 으로 넘기면 된다.
 *
 * 리스너는 **캡처 단계**로 단다: 버블 단계면 중간에서 stopPropagation 하는 핸들러
 * 하나에 언락이 통째로 막힌다. 탭 복귀에서도 한 번 깨운다 (백그라운드에서
 * 컨텍스트를 suspended 로 내리는 브라우저가 있다).
 */
export function armSfx(): (() => void) | undefined {
  const c = context();
  if (!c) return undefined;
  void load(c);
  void wake(c); // 자동재생 허용 환경(scripts/stage-launch.bat)에서는 이것만으로 켜진다

  const unlock = () => {
    void wake(c).then(() => {
      prime(c);
      void load(c);
    });
  };
  const events = ['pointerdown', 'mousedown', 'touchstart', 'click', 'keydown'] as const;
  for (const type of events) addEventListener(type, unlock, { capture: true, passive: true });
  const onVisible = () => {
    if (document.visibilityState === 'visible') unlock();
  };
  document.addEventListener('visibilitychange', onVisible);

  return () => {
    for (const type of events) removeEventListener(type, unlock, { capture: true });
    document.removeEventListener('visibilitychange', onVisible);
  };
}

/**
 * 브라우저 자동재생 정책에 막혀 있는지.
 *
 * 샘플 로드 실패는 클릭으로 풀 수 있는 문제가 아니므로 배지 조건에 섞지 않는다.
 * 배지는 "사용자 제스처가 필요하다"는 신호로만 쓴다.
 */
export function sfxBlocked(): boolean {
  if (!ctx) return false;
  return ctx.state !== 'running';
}

/** 배지 클릭 등 명시적 언락 — 클릭 자체가 제스처라 여기서 resume 이 통한다. */
export async function unlockSfx(): Promise<boolean> {
  const c = context();
  if (!c) return false;
  await wake(c);
  void load(c);
  return c.state === 'running';
}

/**
 * 임팩트 붐 — 샘플 없이 합성 (서브 사인 드롭 + 로우패스 노이즈 버스트).
 * 우승 슬램 배선은 8/24 제거 — 지금은 VS 칼 스윙 로드 전 폴백으로만 쓰인다.
 */
function playImpact(c: AudioContext, volume = 1): void {
  try {
    const t = c.currentTime;
    // 서브 붐 — 100Hz → 38Hz 드롭, 0.55초 감쇠
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(100, t);
    osc.frequency.exponentialRampToValueAtTime(38, t + 0.4);
    const oscGain = c.createGain();
    oscGain.gain.setValueAtTime(0.7 * volume, t);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
    osc.connect(oscGain).connect(c.destination);
    osc.start(t);
    osc.stop(t + 0.6);
    // 타격감 — 0.2초 노이즈 버스트를 로우패스로 둔탁하게
    const noise = c.createBufferSource();
    const buf = c.createBuffer(1, Math.ceil(c.sampleRate * 0.2), c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    noise.buffer = buf;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    const noiseGain = c.createGain();
    noiseGain.gain.setValueAtTime(0.5 * volume, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    noise.connect(lp).connect(noiseGain).connect(c.destination);
    noise.start(t);
  } catch {
    /* 소리 실패가 화면을 막으면 안 된다 */
  }
}

/**
 * 대결 포커스(VS) 등장 — 칼 스윙 샘플 + 서브 드롭 (8/23 운영자 선곡으로
 * 오케스트라 히트에서 교체 — "칼소리는 VS 나올 때"). 어택은 칼 스윙이,
 * 무게감은 저역 사인 드롭이 담당한다. 샘플이 아직 로드 전이면 합성 붐 폴백.
 */
export function playVersus(): void {
  schedule((c) => {
    if (!hitBuffer) {
      playImpact(c, 0.75);
      return;
    }
    try {
      const t = c.currentTime;
      const src = c.createBufferSource();
      src.buffer = hitBuffer;
      const gain = c.createGain();
      gain.gain.value = 0.8;
      src.connect(gain).connect(c.destination);
      src.start(t);
      // 저역 보강 — 히트 아래 깔리는 서브 드롭
      const osc = c.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(90, t);
      osc.frequency.exponentialRampToValueAtTime(40, t + 0.35);
      const oscGain = c.createGain();
      oscGain.gain.setValueAtTime(0.4, t);
      oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
      osc.connect(oscGain).connect(c.destination);
      osc.start(t);
      osc.stop(t + 0.55);
    } catch {
      /* 소리 실패가 화면을 막으면 안 된다 */
    }
  });
}

/**
 * 표 카드 플립 — 시네마틱 탐 히트 샘플 (8/23 운영자 선곡: "드럼 히트를 심사위원들
 * 투표 공개할 때"). 투표 공개 화면의 카드가 한 장씩 뒤집히는 순간마다 1회 —
 * 1.6초 간격 연타라 꼬리(1.68초)가 살짝 겹치는 건 의도된 리듬.
 */
export function playDrum(): void {
  schedule((c) => {
    if (!drumBuffer) {
      playImpact(c, 0.45);
      return;
    }
    try {
      const src = c.createBufferSource();
      src.buffer = drumBuffer;
      const gain = c.createGain();
      gain.gain.value = 0.9;
      src.connect(gain).connect(c.destination);
      src.start();
    } catch {
      /* 소리 실패가 화면을 막으면 안 된다 */
    }
  });
}
