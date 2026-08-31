'use client';

// 화면 공용 조각 — 심사(judge)·스크린(viewer)이 함께 쓴다.
// admin 은 자기 사본을 갖고 있다 (화면 간 PR 을 섞지 않는 규칙 때문에 여기로 옮기는
// 리팩터는 별도 PR 로 미룸 — CONTRIBUTING "PR 단위").

import Image from 'next/image';
import universityLogos from '@/lib/universityLogos';
import type { Track } from '@/lib/tournament';

/**
 * AI VIBETHON 워드마크 (2026-08-31) — 지난 행사(ANIMAL LEAGUE)의 공식 로고 SVG 를 대체.
 * 전용 로고 파일이 없어 디스플레이 서체(Anton)로 조판한다.
 *
 * viewBox 는 종전 로고와 같은 1256×204 로 고정한다 — 호출부가 전부 `h-2.5 w-auto` 처럼
 * **높이로만** 크기를 잡고 있어서, 비율이 바뀌면 여섯 군데 화면의 폭이 한꺼번에 틀어진다.
 * 서체 자연폭이 뷰박스와 정확히 같을 수는 없으므로 textLength 로 폭을 고정한다
 * (이 크기에서는 몇 % 자간 조정이라 눈에 띄지 않고, 폰트 로드 전 폴백에서도 폭이 유지된다).
 * path 가 아니라 text 라 fill 은 그대로 currentColor 를 상속한다 — 색은 text-* 로 정한다.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 1256 204" fill="currentColor" role="img" aria-label="AI VIBETHON" className={className}>
      <text
        x="0"
        y="196"
        textLength="1256"
        lengthAdjust="spacingAndGlyphs"
        fontSize="248"
        fontFamily="var(--font-anton), var(--font-suit), Impact, sans-serif"
      >
        AI VIBETHON
      </text>
    </svg>
  );
}

export const TRACK_COLORS: Record<Track, string> = {
  SJF: 'var(--track-sjf)',
  AAC: 'var(--track-aac)',
  LIKELION: 'var(--track-likelion)',
  OPEN: 'var(--track-open)',
};

export function TrackBadge({ track }: { track: Track }) {
  // 알약 배지 대신 도트 + 텍스트 — 배지가 화면마다 반복되면 스티커처럼 보인다.
  // 2xl(프로젝터)에서 한 단계 확대 (8/22 무대 가독성 — 11px 는 홀 거리에서 장식이었다)
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 text-[11px] font-bold 2xl:text-[13px]"
      style={{ color: TRACK_COLORS[track] }}
    >
      <span className="h-1.5 w-1.5 rounded-full 2xl:h-2 2xl:w-2" style={{ background: TRACK_COLORS[track] }} aria-hidden />
      {track}
    </span>
  );
}

/**
 * 학교 로고 + 학교명 + 트랙 도트 — 학교가 이 대회 정체성의 절반이라 묻히면 안 된다.
 * 로고는 어두운 배경에서 뭉개지지 않게 흰 원형 칩에 담는다. 글씨가 좁아 잘려도
 * 로고가 학교를 말해준다. 로고 매핑이 없는 학교는 이름만 표시.
 */
export function SchoolTag({
  school,
  track,
  size = 'md',
  trackFrom2xl = false,
}: {
  school: string;
  track?: Track;
  size?: 'sm' | 'md' | 'lg';
  /** 브래킷 컴팩트 티어(xl)용 — 트랙 배지가 축소 불가라 좁은 카드에서 튀어나온다. 2xl 부터만 표시 */
  trackFrom2xl?: boolean;
}) {
  const logo = universityLogos[school];
  // 로고·텍스트는 2xl(프로젝터)에서 한 단계 확대 (8/22 무대 가독성)
  const logoCls =
    size === 'lg' ? 'h-6 w-6 2xl:h-8 2xl:w-8' : size === 'md' ? 'h-[19px] w-[19px] 2xl:h-6 2xl:w-6' : 'h-4 w-4 2xl:h-5 2xl:w-5';
  const textCls =
    size === 'lg' ? 'text-base lg:text-lg 2xl:text-2xl' : size === 'md' ? 'text-sm 2xl:text-base' : 'text-[13px] 2xl:text-[15px]';

  return (
    // flex + max-w-full: inline-flex 는 부모보다 넓어질 수 있어 좁은 카드에서 밖으로 튀어나온다.
    // 학교명 span 의 min-w-0 이 핵심 — flex item 의 min-width:auto 기본값 때문에
    // 이게 없으면 truncate 가 무시되고 전체 폭이 내용만큼 벌어진다.
    <span className={`flex min-w-0 max-w-full items-center gap-1.5 text-white/75 ${textCls}`}>
      {logo && (
        <span className={`relative shrink-0 overflow-hidden rounded-full bg-white/95 ${logoCls}`}>
          <Image src={logo} alt="" fill sizes="32px" className="object-contain p-px" />
        </span>
      )}
      {/* 말줄임 유지 (8/22 확정 — 줄바꿈 시도는 카드 높이가 들쭉해져 번복.
          로고가 학교를 대신 말해주고, 미관이 우선이라는 운영자 판단) */}
      <span className="min-w-0 truncate break-keep">{school}</span>
      {track && (
        <span className={trackFrom2xl ? 'hidden 2xl:inline-flex' : 'inline-flex'}>
          <TrackBadge track={track} />
        </span>
      )}
    </span>
  );
}

/**
 * 카드 에셋(640×960)은 곡률 36px 이 이미지에 구워져 있다 — 폭의 5.7%, 높이의 3.8%.
 * 컨테이너가 고정 px 곡률이면 크기에 따라 에셋과 어긋난다 (디자이너 피드백 8/18:
 * "카드 에셋과 박스의 곡률이 다르게 보임"). % 곡률로 어떤 크기에서도 일치시킨다.
 * 사용처는 전부 aspect-2/3 전제 — 가로/세로 % 가 이 비율로 계산되어 있다.
 */
export const CARD_RADIUS = '5.7% / 3.8%';

/**
 * 테두리 있는 카드 상자용 곡률 — 바깥 radius = 카드 곡률 + 테두리 두께.
 * CSS 는 overflow 클리핑의 안쪽 곡선을 (바깥 radius − border 폭)으로 만들기 때문에,
 * 이렇게 줘야 안쪽 곡선이 정확히 CARD_RADIUS 가 되어 에셋의 베이크 곡률과
 * 갭 없이 밀착한다. 바깥 radius 에 CARD_RADIUS 를 그대로 쓰면 안쪽이
 * (곡률 − 테두리)로 좁아져 카드 모서리와 부딪힌다 (8/22).
 */
export const cardRadiusWithBorder = (borderPx: number) =>
  `calc(5.7% + ${borderPx}px) / calc(3.8% + ${borderPx}px)`;

// 팀 카드는 scripts/generate-team-cards.mjs 로 다시 구우면 **파일명은 그대로고
// 내용만 바뀐다** — 이미 열어둔 브라우저는 옛 카드를 캐시에서 계속 쓴다.
// 다시 구운 뒤에는 강력 새로고침(Ctrl+Shift+R) 한 번이 필요하다.
// (next/image 는 로컬 경로의 쿼리스트링을 images.localPatterns 없이는 거부하므로
//  ?v= 식 버전 태그는 쓸 수 없다.)
export function characterImageSrc(characterKey: string): string {
  return characterKey.startsWith('team_')
    ? `/team-cards/${characterKey}.png`
    : `/characters/${characterKey}.png`;
}

export function CharacterArt({
  characterKey,
  className,
  sizes = '160px',
}: {
  characterKey: string | null;
  className?: string;
  sizes?: string;
}) {
  return (
    <div
      className={`relative overflow-hidden border border-white/10 bg-white/5 ${className ?? ''}`}
      style={{ borderRadius: CARD_RADIUS }}
    >
      {characterKey ? (
        <Image src={characterImageSrc(characterKey)} alt="" fill sizes={sizes} className="object-cover" />
      ) : (
        // 빈 슬롯 = 물음표 카드 에셋 (8/23 운영자 — 회색 "?" 박스 대신 실물 카드 뒷면)
        <Image src="/card-back-Q-ver3.png" alt="" fill sizes={sizes} className="object-cover opacity-80" />
      )}
    </div>
  );
}
