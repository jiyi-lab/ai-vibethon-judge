'use client';

// 스크린(viewer) 화면 — 명세 §6.1. 무대 프로젝터(1920×1080)와 참가자 폰이 대상.
//
// 레이아웃은 피라미드형 대진표다 (2026-08-20 결정, 8/18 수렴형을 뒤집음):
// 결승(상) ← 준결승 2(중) ← R1 8팀 개별 카드(하). 수렴형은 좌우 사이드의 R1 이
// 같은 사이드 준결승으로 고정 진출하는 것처럼 읽혔는데 R2 는 랜덤 추첨이다.
// 그래서 하단(R1)↔중단(R2)은 선으로 잇지 않고, 추첨 후 승자 슬롯에 진출 배지로
// 표기한다. 중간 "랜덤 추첨" 안내 밴드는 넣지 않는다 (8/20 피드백: 시각 소음).
//
// 입력 요소 없음. 3초 폴링 + rev 가드, 실패 시 마지막 정상 스냅샷 유지 (명세 §7).
// 결과 공개 연출은 직전 스냅샷과의 status diff 로 감지한 1회성 애니메이션 (~3초),
// prefers-reduced-motion 이면 정지 상태로 표시만 한다.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { CharacterArt, TRACK_COLORS, Wordmark, characterImageSrc } from '@/components/ui';
import { armSfx, playDrum, playVersus, sfxBlocked, unlockSfx } from '@/lib/sfx';
import { isAnnounced, roundRankings, topTeamsForRound, winningTeamId, type Match, type Team } from '@/lib/tournament';
import type { CSSProperties, ReactNode } from 'react';

type PublicState = { teams: Team[]; matches: Match[]; rev: number };

// ------------------------------------------------------------
// 데이터 헬퍼
// ------------------------------------------------------------

function teamAt(state: PublicState, index: number | null): Team | null {
  return index === null ? null : (state.teams[index] ?? null);
}

function teamName(state: PublicState, index: number | null): string {
  if (index === null) return '선정팀 대기';
  return state.teams[index]?.team || `팀 ${index + 1}`;
}

const byId = (state: PublicState, id: string) => state.matches.find((m) => m.id === id)!;

// ------------------------------------------------------------
// 경기 카드
// ------------------------------------------------------------

function TeamRow({
  state,
  index,
  match,
  side,
  size,
}: {
  state: PublicState;
  index: number | null;
  match: Match;
  side: 'A' | 'B';
  size: 'md' | 'lg';
}) {
  const team = teamAt(state, index);
  const isWinner = match.status === 'done' && match.winner === side;
  const lg = size === 'lg';

  return (
    // xl(1280~1535)은 컴팩트 밀도 — 카드 최소 폭이 열 폭을 넘으면 이웃 카드 위로 배어 나온다.
    // 2xl 부터 프로젝터용 크기로 확장.
    <div
      className={`flex items-center gap-2.5 rounded-lg px-2 transition-colors 2xl:gap-3.5 2xl:px-3 ${lg ? 'py-2.5 2xl:py-3' : 'py-2 2xl:py-2.5'}`}
      style={isWinner ? { background: 'var(--orange-glow)' } : undefined}
    >
      <CharacterArt
        characterKey={team?.character ?? null}
        className={lg ? 'aspect-2/3 w-11 2xl:w-16' : 'aspect-2/3 w-10 2xl:w-14'}
        sizes={lg ? '64px' : '56px'}
      />
      <div className="min-w-0 flex-1">
        {/* 팀명은 자르지 않는다 — 2줄 줄바꿈 + 길이 조건 스케일.
            짧은 이름은 프로젝터 가독성 우선으로 크게, 11자 이상(최대 20자)은 한 단계
            줄여서 2줄 안에 온전히 들어가게 한다. 자른 팀명은 무대에서 틀린 이름이다. */}
        <div
          className={`line-clamp-2 font-extrabold leading-tight tracking-tight ${nameSize(teamName(state, index), lg)}`}
        >
          {teamName(state, index)}
        </div>
      </div>
      {isWinner && (
        <span className="shrink-0 rounded bg-(--orange) px-1.5 py-0.5 text-[11px] font-extrabold text-white">우세</span>
      )}
    </div>
  );
}

/**
 * 팀명 길이 조건 글자 크기 — 20자(실운영 최대)가 2줄에 들어가는 값.
 * xl 은 컴팩트, 2xl 부터 프로젝터 크기.
 */
function nameSize(name: string, lg: boolean): string {
  if (lg) return name.length > 10 ? 'text-base 2xl:text-xl' : 'text-xl 2xl:text-[26px]';
  return name.length > 10 ? 'text-sm 2xl:text-[17px]' : 'text-lg 2xl:text-[22px]';
}

function VsDivider() {
  return (
    <div className="flex items-center gap-2 px-3" aria-hidden>
      <div className="h-px flex-1 bg-white/6" />
      <span className="text-[9px] font-extrabold text-white/20">VS</span>
      <div className="h-px flex-1 bg-white/6" />
    </div>
  );
}

function MatchCard({
  state,
  match,
  size = 'md',
  undrawnLabel,
}: {
  state: PublicState;
  match: Match;
  size?: 'md' | 'lg';
  undrawnLabel?: string;
}) {
  const live = match.status === 'live';
  const unresolved = match.a === null || match.b === null;

  return (
    <div
      className={`viewer-card relative rounded-xl border p-1.5 ${live ? 'card-live' : ''}`}
      style={{
        borderColor: live
          ? 'var(--live)'
          : match.status === 'done'
            ? 'rgba(236,108,1,0.30)'
            : 'rgba(255,255,255,0.08)',
        background: 'linear-gradient(180deg, var(--surface2) 0%, var(--surface) 100%)',
      }}
    >
      <div className="flex items-center justify-between px-3 pb-0.5 pt-1.5">
        <span className="font-en text-[11px] font-bold text-white/30">{match.id}</span>
        {live && (
          <span className="live-pulse rounded bg-(--live) px-1.5 py-0.5 text-[10px] font-extrabold text-white">
            LIVE
          </span>
        )}
      </div>
      {unresolved && undrawnLabel ? (
        <div className="m-2 grid h-24 place-items-center rounded-lg border border-dashed border-white/10 text-sm font-bold text-white/25">
          {undrawnLabel}
        </div>
      ) : (
        <>
          <TeamRow state={state} index={match.a} match={match} side="A" size={size} />
          <VsDivider />
          <TeamRow state={state} index={match.b} match={match} side="B" size={size} />
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// 대진표 (lg 이상 — 프로젝터)
// ------------------------------------------------------------

/**
 * R1 개별 팀 카드 — 피라미드 하단. 세로형 (캐릭터 위, 팀명·학교 아래).
 * done 이면 승자 하이라이트 + 승 마크, 패자 dim (MatchCard 의 상태 표현과 동일 문법).
 */
function TeamSolo({
  state,
  index,
  match,
  side,
}: {
  state: PublicState;
  index: number | null;
  match: Match;
  side: 'A' | 'B';
}) {
  const team = teamAt(state, index);
  const isWinner = match.status === 'done' && match.winner === side;

  return (
    <div
      className="w-34 rounded-xl border p-2.5 pb-3 text-center transition-colors 2xl:w-44"
      style={{
        borderColor: isWinner ? 'rgba(236,108,1,0.55)' : 'rgba(255,255,255,0.1)',
        background: isWinner
          ? 'var(--orange-glow)'
          : 'linear-gradient(180deg, var(--surface2) 0%, var(--surface) 100%)',
      }}
    >
      <CharacterArt
        characterKey={team?.character ?? null}
        className="mx-auto aspect-2/3 w-16 2xl:w-20"
        sizes="80px"
      />
      <div className="mt-2 line-clamp-2 text-[13px] font-extrabold leading-tight tracking-tight 2xl:text-base">
        {teamName(state, index)}
      </div>
    </div>
  );
}

/**
 * 피라미드 하단 한 열 — 승자 슬롯 + 세로 스텁 + 팀 쌍(개별 카드 2장).
 * 승자 슬롯은 done 전엔 점선 "R1-N 승자", done 후엔 승자 팀명.
 * 추첨이 끝나면 승자 슬롯에 "→ R2-N" 진출 배지 — R2 는 랜덤이라 이 열에서
 * 준결승으로 선을 긋지 않는다 (긋는 순간 사이드 고정 진출로 읽힌다).
 */
function PairColumn({
  state,
  match,
  slotLabel,
  slotBg,
  championSlot = false,
}: {
  state: PublicState;
  match: Match;
  /** done 전 승자 슬롯 라벨 — R1 은 트랙명(8/22 운영자), R2/F 는 진출처 */
  slotLabel: ReactNode;
  /** R1 전용 (8/22 저녁): 슬롯 배경을 트랙 컬러로 — 글자색 표기를 대체 */
  slotBg?: string;
  /** 결선 전용 (8/22 저녁): CHAMPION 슬롯 강조 스타일 */
  championSlot?: boolean;
}) {
  const live = match.status === 'live';
  const done = match.status === 'done';
  const winnerIdx = winningTeamId(match);

  return (
    <div className="flex flex-col items-center">
      {/* R1 트랙 슬롯(slotBg)은 done 후에도 트랙 칩 그대로 (8/23 최종 — 승자명으로
          바꾸면 집결 박스의 팀명과 이중 표기가 된다. 승자는 카드 하이라이트·집결
          박스 몫). 승자명 슬롯은 R2/F(FINAL 진출·CHAMPION)에만 */}
      <div
        className={`rounded-lg py-1.5 text-center text-xs font-bold 2xl:text-sm ${
          championSlot && !done ? 'champ-slot w-52 py-2 2xl:w-64' : 'w-44 2xl:w-56'
        } ${
          done && !slotBg
            ? 'border border-(--orange)/45'
            : championSlot
              ? ''
              : slotBg
                ? 'border border-white/10'
                : 'border border-dashed border-white/20'
        }`}
        style={{
          background: slotBg ?? (done ? 'var(--orange-glow)' : championSlot ? undefined : 'rgba(255,255,255,0.03)'),
        }}
      >
        {done && !slotBg ? (
          /* 발표 순간 슬롯 채움 라이즈 — 팀명만, "→ 진출" 배지 없음 (8/23 확정) */
          <span className="champion-rise line-clamp-1 px-2">{teamName(state, winnerIdx)}</span>
        ) : (
          <span>{slotLabel}</span>
        )}
      </div>
                <div
            className="h-4"
            style={{ borderLeft: `2px ${done ? 'solid rgba(236,108,1,0.55)' : 'dashed rgba(255,255,255,0.16)'}` }}
            aria-hidden
          />
          {/* 쌍을 감싸던 테두리 박스 제거 (2026-08-22 피드백) — 개별 카드가 자체
              테두리·승자 하이라이트를 갖고 있어 박스 없이도 대진이 읽힌다.
              live 강조는 대결 포커스 화면이 대신하므로 (live 면 브래킷 자체가 안 보임)
              박스의 live 테두리도 함께 정리 — LIVE 배지만 남긴다 */}
          <div className="relative flex items-center gap-2.5 2xl:gap-4">
            {live && (
              <span className="live-pulse absolute -top-2.5 left-1/2 -translate-x-1/2 rounded bg-(--live) px-1.5 py-0.5 text-[10px] font-extrabold text-white">
                LIVE
              </span>
            )}
            <TeamSolo state={state} index={match.a} match={match} side="A" />
            <span className="text-[10px] font-extrabold text-white/25 2xl:text-xs">VS</span>
            <TeamSolo state={state} index={match.b} match={match} side="B" />
          </div>
    </div>
  );
}

const connLine = (drawn: boolean) =>
  `2px ${drawn ? 'solid' : 'dashed'} ${drawn ? 'rgba(236,108,1,0.55)' : 'rgba(255,255,255,0.14)'}`;

/**
 * 결승 ↔ 준결승 연결선 — 브래킷 그리드 첫 줄의 절반 셀. 셀 중심(= 준결승 카드
 * 중심 = 하위 두 열의 중점)에서 세로로 내려가고 안쪽으로 가로선을 긋는다.
 * 그리드 gap 이 끊는 중앙 구간과 결승으로 오르는 스텁은 그리드의 절대 요소가 채운다.
 * 고정 구조라 항상 그린다 (결선 확정 전 점선).
 */
function ConnectorHalf({ side, drawn }: { side: 'l' | 'r'; drawn: boolean }) {
  const line = connLine(drawn);
  return (
    <div className="relative h-8 w-full 2xl:h-9" aria-hidden>
      <div
        className="absolute"
        style={{ top: 14, ...(side === 'l' ? { left: '50%', right: 0 } : { left: 0, right: '50%' }), borderTop: line }}
      />
      <div className="absolute bottom-0 left-1/2" style={{ top: 14, borderLeft: line }} />
    </div>
  );
}

// ------------------------------------------------------------
// 대결 포커스 (live) · 투표 오픈 시퀀스 (공개 직후)
// ------------------------------------------------------------

const SIDE_COLORS: Record<'A' | 'B', string> = { A: 'var(--orange)', B: '#009be4' };

/** 투표 칩 오픈 간격(R1·R2) — 칩 애니메이션·카운터·시퀀스 길이가 이 값을 공유한다. */
const CHIP_INTERVAL_MS = 1600;
/** chipFlip 애니메이션 길이(ms) — 아래 CSS 와 같은 값이어야 한다. */
const CHIP_FLIP_MS = 600;
/** 결선 표 공개 총 길이(ms) — 첫 장 시작 ~ 마지막 장 플립 완료 (8/25 운영자 지정). */
const FINAL_REVEAL_MS = 6000;
/** 결선 가속 비율 — 간격이 매 장 이만큼씩 짧아진다 (등비 감소). */
const FINAL_ACCEL_RATIO = 0.7;

/**
 * 표 카드 i 번째의 플립 시작 시각(ms).
 * R1·R2 는 등간격. **결선은 점점 빨라진다** (8/25 운영자: "공개속도가 점점
 * 빨라질 수 있나? 대신 전체 속도는 6초") — 간격을 등비(0.7)로 줄이되 합을
 * 역산해 마지막 장이 정확히 FINAL_REVEAL_MS 에 플립을 끝내게 맞춘다.
 * 표 장수가 3장이든 5장이든 총 길이는 6초로 같다.
 */
function chipDelayMs(i: number, count: number, isFinal: boolean): number {
  if (!isFinal || count < 2) return i * CHIP_INTERVAL_MS;
  const span = FINAL_REVEAL_MS - CHIP_FLIP_MS; // 마지막 장 "시작" 시각
  const gaps = count - 1;
  const r = FINAL_ACCEL_RATIO;
  const first = (span * (1 - r)) / (1 - Math.pow(r, gaps)); // 등비수열 합 = span 역산
  let t = 0;
  for (let k = 0; k < i; k++) t += first * Math.pow(r, k);
  return t;
}

function TeamHero({
  state,
  index,
  dimmed,
  winner,
  compact,
}: {
  state: PublicState;
  index: number | null;
  dimmed?: boolean;
  winner?: boolean;
  compact?: boolean;
}) {
  const team = teamAt(state, index);
  return (
    <div
      className={`flex flex-col items-center text-center transition-all duration-700 ${dimmed ? 'opacity-25 grayscale' : ''} ${winner ? 'scale-105' : ''}`}
    >
      <CharacterArt
        characterKey={team?.character ?? null}
        className={`aspect-2/3 ${compact ? 'w-36 lg:w-44 2xl:w-56' : 'w-44 lg:w-60 2xl:w-80'} ${winner ? 'shadow-[0_0_70px_rgba(236,108,1,0.4)]' : ''}`}
        sizes="(min-width: 1536px) 320px, (min-width: 1024px) 240px, 176px"
      />
      <p
        className={`mt-5 max-w-full font-extrabold leading-tight tracking-tight ${compact ? 'text-2xl lg:text-3xl 2xl:text-4xl' : 'text-3xl lg:text-5xl 2xl:text-7xl'}`}
        style={{ textWrap: 'balance' }}
      >
        {teamName(state, index)}
      </p>
      {winner && (
        <span className="champion-rise mt-4 rounded-lg bg-(--orange) px-4 py-1.5 text-lg font-extrabold text-white">
          선정 확정
        </span>
      )}
    </div>
  );
}

/**
 * live 경기 포커스 — 대진표 대신 해당 대결을 크게 (§6.1).
 *
 * 배경 연출(8/19 결정 — 시안 2 구도 + 시안 1 강도): 화면을 대각으로 갈라
 * 좌 A(오렌지)/우 B(블루) 진영 톤 + 카드 뒤 스포트라이트 + 중앙 빔.
 * 등장 시 페이드인·빔 스윕 1회, 이후 글로우만 숨쉰다 (우승 연출과 같은 4초 리듬).
 * 배경은 fixed 레이어(z-0)라 헤더·본문·푸터에 relative z-10 이 필요하다 (ViewerPage).
 */
function FocusLive({ state, match }: { state: PublicState; match: Match }) {
  // VS 등장 임팩트 (8/22 운영자 요청) — 화면 전환은 정보라 reduced-motion 에도 낸다
  // (승자 클래터와 같은 판단). deps 가 match.id 인 이유: 이전 경기가 live 인 채로
  // 다음 경기를 시작하면 언마운트 없이 경기만 바뀐다 — 그때도 울려야 한다.
  // setTimeout + 클린업은 StrictMode(dev) 이중 실행 방어 — 동기 호출이면 두 번 울린다.
  // 전 라운드 공통 (8/24 운영자 — 8/23 "R2 무음" 번복: "r2에 vs할때 칼소리 똑같이").
  useEffect(() => {
    const timer = setTimeout(() => playVersus(), 50);
    return () => clearTimeout(timer);
  }, [match.id]);

  return (
    <>
      <div className="vs-backdrop fixed inset-0 z-0" aria-hidden>
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(105deg, rgba(236,108,1,0.13) 0%, rgba(236,108,1,0.05) 34%, transparent 49%,
              transparent 51%, rgba(0,155,228,0.05) 66%, rgba(0,155,228,0.12) 100%)`,
          }}
        />
        <div
          className="vs-glow absolute rounded-full"
          style={{
            left: '8%', top: '16%', width: '42vw', height: '42vw',
            background: 'radial-gradient(circle, rgba(236,108,1,0.13) 0%, transparent 62%)',
          }}
        />
        <div
          className="vs-glow absolute rounded-full"
          style={{
            right: '8%', top: '16%', width: '42vw', height: '42vw',
            background: 'radial-gradient(circle, rgba(0,155,228,0.12) 0%, transparent 62%)',
            animationDelay: '2s', // 좌우가 같은 박자로 숨쉬면 기계적으로 보인다
          }}
        />
        <div
          className="vs-beam absolute left-1/2 top-1/2"
          style={{
            width: 3, height: '140vh', transform: 'translate(-50%,-50%) rotate(15deg)',
            background: `linear-gradient(180deg, transparent, rgba(255,255,255,0.13) 30%,
              rgba(255,255,255,0.22) 50%, rgba(255,255,255,0.13) 70%, transparent)`,
          }}
        />
      </div>
      <div data-view="focus" className="relative z-10 grid flex-1 place-items-center py-6">
        <div className="grid w-full max-w-6xl grid-cols-1 items-center gap-8 lg:grid-cols-[1fr_auto_1fr] lg:gap-12">
          <TeamHero state={state} index={match.a} />
          {/* LIVE 칩은 여기 안 둔다 — 헤더 라이브 박스와 중복이고, 포커스 화면 자체가
              "지금 이 경기"라는 뜻이다. 그 자리는 라운드 표기가 가져간다 (8/19 피드백).
              표기는 운영 코드(R1-2)를 풀어 쓴 "ROUND 1-2" — 라운드만 쓰면 1라운드
              네 경기가 전부 같은 화면이 되고, 코드만 쓰면 관객이 못 읽는다 */}
          <div className="flex flex-col items-center gap-3">
            <span className="font-display text-3xl text-(--orange) lg:text-5xl 2xl:text-6xl">
              {match.round === 3 ? 'FINAL' : `ROUND ${match.round}-${match.id.split('-')[1]}`}
            </span>
            <span className="font-display text-6xl text-white/85 lg:text-8xl 2xl:text-9xl">VS</span>
          </div>
          <TeamHero state={state} index={match.b} />
        </div>
      </div>
    </>
  );
}

/**
 * 표 오픈 정지 화면 (8/22 개편, §6.1 2단계 공개의 1단계) — 뒷면 칩이 한 장씩
 * 뒤집히고, 전부 열린 뒤에도 **머문다** — 심사위원 코멘트 시간.
 * 다음 단계(결과 화면)는 운영자의 [발표] 액션이 연다.
 *
 * 구성 (8/22 심야 확정 — "이거 두 개만 남겨서 화면 꽉꽉"): **라운드+집계**와
 * **표 카드(심사위원 이름)** 둘뿐이다. 멘트·팀 히어로는 같은 날 저녁에 넣었다가
 * 원거리 가독을 위해 다시 뺐다 — 큰 행사장 뒷줄까지 읽혀야 해서 남은 두 요소를
 * 최대 크기로 키운다. 승자 강조는 여전히 [발표]가 여는 결과 화면의 몫.
 */
function FreezeReveal({ state, match }: { state: PublicState; match: Match }) {
  const votes = match.votes ?? [];
  const names = match.voteNames ?? [];
  const chipCharacter = (side: 'A' | 'B') => teamAt(state, side === 'A' ? match.a : match.b)?.character ?? null;
  const chipLabel = (side: 'A' | 'B') => teamName(state, side === 'A' ? match.a : match.b);

  // 오픈된 칩 수 — 집계·이름 표기가 따라간다. 시계는 chipFlip 의 animationend 하나
  // (JS 타이머로 CSS 타이밍을 수치 복제하면 두 시계가 되어 어긋난 전례 — PR #24)
  const [opened, setOpened] = useState(0);

  // 도입 무음 (8/23 운영자 — 부채꼴 폴리도 제거: 첫 플립 드럼과 겹친다.
  // mixkit 노티는 #72→#73→#75→#77 로 제거됨. 이 화면 소리는 플립 드럼뿐)

  // 모션 축소 환경은 칩이 즉시 다 보이고 animationend 도 오지 않는다 — 집계도 즉시 전체
  useEffect(() => {
    if (votes.length === 0 || !window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = setTimeout(() => setOpened(votes.length), 0);
    return () => clearTimeout(timer);
  }, [votes.length]);

  const openTally = (side: 'A' | 'B') => votes.slice(0, opened).filter((v) => v === side).length;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 py-6 lg:gap-10 2xl:gap-12">
      {/* 라운드 + 집계 — 뒷줄 가독이 목표라 화면 요소 중 최대 크기 */}
      <div className="flex w-full flex-col items-center gap-1">
        <span className="font-display text-4xl text-(--orange) lg:text-5xl 2xl:text-6xl">
          {match.round === 3 ? 'FINAL' : `ROUND ${match.round}-${match.id.split('-')[1]}`}
        </span>
        {/* 집계 양옆에 팀명+학교 (8/23 운영자 지시) — 같은 학교끼리 붙으면 숫자
            색만으로는 어느 쪽이 누구인지 확인이 안 된다. 행을 화면 전폭으로 펴야
            8xl 6자 팀명이 안 잘린다. 집계는 열린 칩만 센다 — 칩과 같은 시계 */}
        <div className="flex w-full items-center gap-6 px-8 lg:gap-9 2xl:gap-12">
          {(['A', 'B'] as const).map((side) => {
            const team = teamAt(state, side === 'A' ? match.a : match.b);
            return (
              <div
                key={side}
                className={`flex min-w-0 flex-1 flex-col ${
                  side === 'A' ? 'order-1 items-end text-right' : 'order-3 items-start text-left'
                }`}
              >
                {/* 8/24 최종 — 크기는 양쪽 동일 고정 5xl ("유동 금지·적당한 크기",
                    4xl "너무 작다"·6xl 은 20자 중 8자 잘림으로 기각). 20자처럼
                    한 줄을 넘는 팀명만 두 줄로 흐른다 (크기 유동 아님) —
                    line-clamp-2 가 상한 */}
                <span
                  className="line-clamp-2 text-2xl leading-tight font-extrabold lg:text-4xl 2xl:text-5xl"
                  style={{ color: SIDE_COLORS[side] }}
                >
                  {team?.team || '팀 미입력'}
                </span>
              </div>
            );
          })}
          <div className="font-en order-2 flex items-center gap-7 text-7xl font-extrabold tabular-nums lg:text-8xl 2xl:text-9xl">
            <span style={{ color: SIDE_COLORS.A }}>{openTally('A')}</span>
            <span className="text-4xl text-white/25">:</span>
            <span style={{ color: SIDE_COLORS.B }}>{openTally('B')}</span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-start justify-center gap-6 lg:gap-7 2xl:gap-8">
        {/* 실물 카드 문법 (8/20): 뒷면(card-back-Q)이 깔리고 한 장씩 앞면으로.
            앞면은 표받은 팀의 캐릭터 카드 — 테두리 진영색이 곧 개표 현황이다.
            플립 시작 = 효과음, 플립 종료 = 집계·이름 오픈 (단일 시계 원칙) */}
        {/* 카드 폭 = min(기준 폭, 화면에 표 수만큼 한 줄로 들어가는 폭) (8/24 —
            1920 미만 창에서 5장째가 줄바꿈돼 내려가던 것 수정. 프로젝터 1920 은
            기준 폭 그대로, 좁은 창에서만 자동 축소) */}
        {votes.map((side, i) => (
          <div
            key={i}
            className="flex flex-col items-center gap-3"
            style={{ '--chipw': `min(21rem, max(9rem, calc((100vw - 6rem) / ${votes.length} - 2rem)))` } as CSSProperties}
          >
            {/* 심사위원 명의 — 카드 위 (8/23 운영자 지시), 플립이 끝난 뒤에만
                (뒷면 상태에서 이름이 먼저 보이면 다음 표를 예고하는 꼴).
                이름 없는 표(도입 전 데이터)는 자리만 유지 */}
            <span
              className={`truncate text-center text-xl font-extrabold transition-opacity duration-500 lg:text-2xl 2xl:text-3xl ${
                i < opened && names[i] ? 'opacity-100' : 'opacity-0'
              }`}
              style={{ color: SIDE_COLORS[side], maxWidth: 'var(--chipw)' }}
            >
              {names[i] ?? ' '}
            </span>
            <div
              className="chip-outer relative aspect-2/3"
              style={{ animationDelay: `${i * 0.06}s`, width: 'var(--chipw)' }}
            >
              <div
                className="chip-inner relative h-full w-full"
                // 표 카드 플립 = 드럼 히트 (8/23 운영자 선곡 — 카드 놓기 폴리에서 교체.
                // 추첨 구간은 무음 — #91)
                onAnimationStart={(e) => e.animationName === 'chipFlip' && playDrum()}
                onAnimationEnd={(e) => e.animationName === 'chipFlip' && setOpened((n) => Math.max(n, i + 1))}
                style={{ animationDelay: `${chipDelayMs(i, votes.length, match.id === 'F') / 1000}s` }}
              >
                {/* 테두리·클리핑 래퍼 제거 (8/22 심야) — 에셋에 구운 곡률과 CSS
                    곡률이 근본적으로 안 맞아서(앞면 5.6~5.8%, 뒷면 6.1% 실측)
                    에셋을 원형 그대로 쓴다. 진영색은 카드 알파 모양을 따라가는
                    drop-shadow 글로우가 담당 — 안쪽 얇은 겹 + 바깥 퍼짐 두 겹 */}
                <div
                  className="chip-face absolute inset-0"
                  style={{
                    filter: `drop-shadow(0 0 3px ${SIDE_COLORS[side]}) drop-shadow(0 0 28px color-mix(in srgb, ${SIDE_COLORS[side]} 55%, transparent))`,
                  }}
                >
                  {chipCharacter(side) ? (
                    <Image src={characterImageSrc(chipCharacter(side)!)} alt="" fill sizes="336px" className="object-cover" />
                  ) : (
                    <span
                      className="grid h-full w-full place-items-center rounded-xl border-2 px-4 text-center text-3xl font-extrabold"
                      style={{ color: SIDE_COLORS[side], borderColor: SIDE_COLORS[side] }}
                    >
                      {chipLabel(side)}
                    </span>
                  )}
                </div>
                <div className="chip-face chip-back absolute inset-0">
                  <Image src="/card-back-Q-ver3.png" alt="" fill sizes="336px" className="object-cover" />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// 결과 화면(ResultScene)은 8/25 행사 아침 제거 — R1 도 [발표] 즉시 대진표로
// (운영자: "vs > 투표 공개 > 대진표로 하자"). R2 는 #73 부터 이미 즉시 복귀.
// [발표]는 이제 "정지 화면 → 대진표 이동" 버튼이다 (운영 콘솔 문구도 동기화).

// ------------------------------------------------------------
// R2 추첨 연출 — 모으기 → 뒤집어 셔플 → 배치·공개 (8/22 저녁 재지시:
// "진출 4팀을 한군데 모은 다음에 랜덤으로 돌려서 배치")
// ------------------------------------------------------------

/** 추첨 시퀀스 전체 길이(ms) — ViewerPage 의 종료 타이머와 아래 딜레이들이 공유한다. */
const DRAW_SEQUENCE_MS = 11000;
/** 공개 플립 시작 시점(s) — 모으기(1.0~2.2) → 뒤집기(2.3) → 셔플(2.9~5.3) → 복귀(5.5~6.5) 뒤. */
const DRAW_FLIP_BASE_S = 6.7;

function DrawCard({ state, index, order }: { state: PublicState; index: number | null; order: number }) {
  const team = teamAt(state, index);
  // 이동 3단계 + 플립 2단계를 전부 CSS 애니메이션 시퀀스로 (JS 타이머로 CSS 를
  // 복제하지 않는다 — 단일 시계 원칙, PR #24). 딜레이 전 구간에 fill 이 새지 않게
  // 이동·공개 플립은 forwards 만 쓴다 (both 는 딜레이 중에도 0% 를 그려버린다).
  return (
    <div
      className="draw-outer relative aspect-2/3 w-28 lg:w-36 2xl:w-48"
      style={{
        ['--gr' as string]: `${(order - 1.5) * 5}deg`,
        animation: `drawGather 1.2s cubic-bezier(0.4, 0, 0.2, 1) 1s forwards,
          drawMix${order} 2.4s ease-in-out 2.9s forwards,
          drawReturn 1s cubic-bezier(0.4, 0, 0.2, 1) 5.5s forwards`,
      }}
    >
      <div
        className="chip-inner relative h-full w-full"
        style={{
          animation: `drawToBack 0.45s ease 2.3s forwards,
            chipFlip 0.6s cubic-bezier(0.3, 0.8, 0.3, 1) ${DRAW_FLIP_BASE_S + order * 0.5}s forwards`,
        }}
      >
        {/* 테두리·클리핑 래퍼 제거 (8/22 심야, 공개 칩과 같은 이유) —
            에셋 원형 그대로 + 오렌지 drop-shadow 글로우 */}
        <div
          className="chip-face absolute inset-0"
          style={{ filter: 'drop-shadow(0 0 20px rgba(236,108,1,0.3))' }}
        >
          {team?.character ? (
            <Image src={characterImageSrc(team.character)} alt="" fill sizes="192px" className="object-cover" />
          ) : null}
        </div>
        <div className="chip-face chip-back absolute inset-0">
          <Image src="/card-back-0624-ver2.png" alt="" fill sizes="192px" className="object-cover" />
        </div>
      </div>
      {/* 확정 팀명 — 공개 플립 뒤 카드 위에 (8/23 재조정: "팀명 다 빼" 후
          "어느 팀인지 안 보인다" — 같은 캐릭터·학교가 붙을 수 있어 팀명은 필요.
          도입(모으기 전) 라벨은 계속 없음, 위치는 정지 화면과 같은 카드 위) */}
      <p
        className="draw-name absolute -top-9 left-1/2 w-48 -translate-x-1/2 truncate text-center text-lg font-extrabold lg:-top-10 lg:text-xl 2xl:-top-11 2xl:text-2xl"
        style={{ animationDelay: `${DRAW_FLIP_BASE_S + order * 0.5 + 0.45}s` }}
      >
        {teamName(state, index)}
      </p>
    </div>
  );
}

/**
 * R2 추첨 공개 — 브래킷 대신 전면 재생. 3단계 (8/22 저녁 확정):
 * ① 모으기 — 진출 4팀의 앞면 카드(팀명 포함)가 화면 중앙 한 덩이로 모인다
 * ② 셔플 — 모인 채로 전부 뒷면으로 뒤집혀 섞인다
 * ③ 배치 — 뒷면인 채 두 쌍의 자리로 흩어진 뒤 한 장씩 뒤집혀 대진 공개
 * 화면의 섞임은 연출일 뿐 — 실제 무작위성은 서버 추첨(drawRound2)이 이미 만들었다.
 * 중앙까지의 거리는 카드마다 달라 CSS 변수(--gx/--gy)로 마운트 때 실측해 꽂는다
 * (반응형 간격이라 고정 픽셀 키프레임으로는 중앙에 못 모은다).
 */
function DrawSequence({ state, semis }: { state: PublicState; semis: [Match, Match] }) {
  const bedRef = useRef<HTMLDivElement | null>(null);

  // 각 카드 → 컨테이너 중앙 벡터 실측. 애니메이션 딜레이(1s)가 첫 페인트보다 훨씬
  // 늦어 레이아웃 이펙트가 아니어도 안전하지만, 측정은 페인트 전이 정석이다.
  useLayoutEffect(() => {
    const bed = bedRef.current;
    if (!bed) return;
    const bedRect = bed.getBoundingClientRect();
    const cx = bedRect.left + bedRect.width / 2;
    const cy = bedRect.top + bedRect.height / 2;
    bed.querySelectorAll<HTMLElement>('.draw-outer').forEach((el) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--gx', `${cx - (r.left + r.width / 2)}px`);
      el.style.setProperty('--gy', `${cy - (r.top + r.height / 2)}px`);
    });
  }, []);

  // 추첨 구간은 **무음** (8/24 운영자 — 현장에서 소리가 이상하게 들림).
  // 종전: 뒤집기 폴리 1번 + 카드 믹싱 셔플 + 카드 4장 동시 플립 폴리 4중 —
  // 겹쳐서 지저분해지는 게 원인으로 보인다. 재도입 시 #91 diff 참조.

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-12 py-6">
      <p className="champion-rise text-2xl font-extrabold tracking-tight lg:text-4xl 2xl:text-5xl">2라운드 대진을 추첨합니다</p>
      <div ref={bedRef} className="flex items-start justify-center gap-14 lg:gap-24">
        {semis.map((semi, s) => (
          <div key={semi.id} className="flex flex-col items-center gap-12 2xl:gap-14">
            {/* 대진 라벨·VS 는 원거리 가독 크기로 (8/23 운영자: "너무 작아 안 보여").
                gap 이 넓은 이유: 카드 위 팀명 라벨(-top) 자리 */}
            <span
              className="draw-name font-display text-3xl tracking-wider text-(--orange) lg:text-4xl 2xl:text-5xl"
              style={{ animationDelay: `${DRAW_FLIP_BASE_S + 2 + s * 0.2}s` }}
            >
              {semi.id}
            </span>
            <div className="flex items-center gap-5 lg:gap-7 2xl:gap-9">
              <DrawCard state={state} index={semi.a} order={s * 2} />
              <span
                className="draw-name font-display text-2xl text-white/50 lg:text-3xl 2xl:text-4xl"
                style={{ animationDelay: `${DRAW_FLIP_BASE_S + 2 + s * 0.2}s` }}
              >
                VS
              </span>
              <DrawCard state={state} index={semi.b} order={s * 2 + 1} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// 우승 연출 — 디자이너 무대 연출 이식 (docs/championstage2.0.html, 2026-08-21)
// ------------------------------------------------------------

/** 카드 임팩트 시점(ms) — CSS 의 --tc 와 같은 값이어야 한다 (컨페티 발사 기준). */
const CHAMP_IMPACT_MS = 560;

/**
 * 우승 테이크오버 — 카드 슬램 → CHAMPION 레터 드롭 → 팀명 와이프 → 컨페티.
 *
 * 원본은 1920×1080 고정 좌표계에 scale 만 거는 무대 전용 구조인데, 이 화면은
 * 참가자 폰도 대상이라(명세 §6.1) 고정 스테이지 대신 반응형으로 옮겼다:
 * 모든 이펙트 치수를 카드 폭(--cardw) 배수로 묶어 어느 화면에서도 비율이 유지된다.
 * 카드 안쪽은 등록된 완성 카드 PNG 로 통째로 교체하는 방식 (디자이너 인계 메모 §6) —
 * 부유·글로우·포일 스윕 등 바깥 연출은 그대로 둔다.
 */
/** 결선 카운트다운 — 5→1, 한 숫자 1.2초 (8/24 라이브 확인 후 1초에서 상향 —
 * 무대 MC 카운트 체감에 맞춤). 총 6초. */
const COUNT_FROM = 5;
const COUNT_STEP_MS = 1200;

/**
 * 결선 카운트다운 오버레이 (8/24 시안) — [공개] 직후 표 카드가 열리기 전 5초.
 * 큐시트의 MC "5-4-3-2-1 → LED 결과" 순서에 화면이 함께 뛰고, 카운트가 끝나야
 * 첫 카드가 열린다. 무음 (카운트는 MC 육성 몫 — 화면 소리를 얹으면 어긋날 때
 * 티가 난다). 새로고침하면 건너뛰고 우승 무대 직행 (기존 1회성 연출과 같은 규칙).
 */
function Countdown({ onDone }: { onDone: () => void }) {
  const [n, setN] = useState(COUNT_FROM);
  useEffect(() => {
    const timer = setTimeout(() => {
      if (n > 1) setN(n - 1);
      else onDone();
    }, COUNT_STEP_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onDone 은 부모의 세터 고정 참조
  }, [n]);

  return (
    <div className="fixed inset-0 z-30 grid place-items-center overflow-hidden bg-black">
      <div className="count-bg" />
      {/* key={n} — 숫자가 바뀔 때마다 팝·링 애니메이션 재시작.
          최종 구성 (8/24 운영자 피드백 2회): 넘버 + 확산 링만 — WINNER ANNOUNCE
          라벨과 진행 도트는 제거 */}
      <div key={n} className="relative grid place-items-center">
        <span className="count-ring" />
        <span className="count-ring count-ring2" />
        <span className="count-num font-display">{n}</span>
      </div>
    </div>
  );
}

function ChampionTakeover({ state, final }: { state: PublicState; final: Match }) {
  const index = winningTeamId(final);
  const team = teamAt(state, index);
  const fxRef = useRef<HTMLCanvasElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);

  // 팡파레·슬램 소리는 8/24 제거 — 우승 무대는 무음 확정. 팡파레는 음향 콘솔
  // 담당 (8/24 운영자 확정 — 8/22 "화면 담당" 폐기, 음향팀 큐 필요. 재도입 시 #52).

  // 컨페티 — 마운트 1회 재생. 내부 좌표는 높이 1080 고정(원본 튜닝값 유지),
  // 폭만 화면 비율을 따른다. 발사 원점은 카드 DOM 실측 — 레이아웃이 달라도 정중앙.
  useEffect(() => {
    const cv = fxRef.current;
    if (!cv || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const cx = cv.getContext('2d');
    if (!cx) return;

    const H = 1080;
    const fit = () => {
      cv.width = Math.max(1, Math.round((innerWidth / innerHeight) * H));
      cv.height = H;
    };
    fit();
    addEventListener('resize', fit);

    const PALETTE = ['#EC6C01', '#FFB25E', '#F0A93B', '#F5EFE6', '#5A4D9B', '#FFD9A8'];
    type Confetto = {
      x: number; y: number; vx: number; vy: number; w: number; h: number;
      rot: number; vr: number; flip: number; vf: number; c: string;
    };
    type Spark = { x: number; y: number; vx: number; vy: number; life: number; c: string };
    const confetti: Confetto[] = [];
    const sparks: Spark[] = [];

    const fireConfetti = (n: number, ox: number, oy: number, from: number, to: number, power: number) => {
      for (let i = 0; i < n; i++) {
        const a = from + Math.random() * (to - from);
        const v = power * (0.55 + Math.random() * 0.75);
        confetti.push({
          x: ox + (Math.random() - 0.5) * 130, y: oy + (Math.random() - 0.5) * 90,
          vx: Math.cos(a) * v, vy: Math.sin(a) * v,
          w: 7 + Math.random() * 11, h: 10 + Math.random() * 16,
          rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.34,
          flip: Math.random() * 6.28, vf: 0.09 + Math.random() * 0.16,
          c: PALETTE[(Math.random() * PALETTE.length) | 0],
        });
      }
    };
    const fireSparks = (n: number, ox: number, oy: number) => {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * 6.28, v = 6 + Math.random() * 22;
        sparks.push({ x: ox, y: oy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, c: Math.random() < 0.5 ? '#FFB25E' : '#EC6C01' });
      }
    };

    let raf = 0;
    let t0 = performance.now();
    const loop = (now: number) => {
      const dt = Math.min((now - t0) / 16.67, 3);
      t0 = now;
      cx.clearRect(0, 0, cv.width, H);

      for (let i = confetti.length - 1; i >= 0; i--) {
        const c = confetti[i];
        c.vy += 0.19 * dt; c.vx *= 0.9955; c.vy *= 0.995;
        c.x += c.vx * dt; c.y += c.vy * dt;
        c.rot += c.vr * dt; c.flip += c.vf * dt;
        cx.save();
        cx.translate(c.x, c.y);
        cx.rotate(c.rot);
        cx.scale(1, Math.cos(c.flip));
        cx.fillStyle = c.c;
        cx.globalAlpha = 0.94;
        cx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
        cx.restore();
        if (c.y > H + 100) confetti.splice(i, 1);
      }

      cx.globalCompositeOperation = 'lighter';
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.x += s.vx * dt; s.y += s.vy * dt;
        s.vx *= 0.93; s.vy = s.vy * 0.93 + 0.22 * dt;
        s.life -= 0.022 * dt;
        if (s.life <= 0) { sparks.splice(i, 1); continue; }
        cx.globalAlpha = s.life;
        cx.strokeStyle = s.c; cx.lineWidth = 2.4; cx.lineCap = 'round';
        cx.beginPath();
        cx.moveTo(s.x, s.y);
        cx.lineTo(s.x - s.vx * 2.2, s.y - s.vy * 2.2);
        cx.stroke();
      }
      cx.globalAlpha = 1;
      cx.globalCompositeOperation = 'source-over';
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    // 발사 시점·좌표·수량은 원본 그대로 (championstage2.0.html §4 연출 재생)
    const timers = [
      setTimeout(() => {
        const r = cardRef.current?.getBoundingClientRect();
        const ox = r ? ((r.left + r.width / 2) / innerWidth) * cv.width : cv.width / 2;
        const oy = r ? ((r.top + r.height / 2) / innerHeight) * H : H * 0.46;
        fireSparks(46, ox, oy);
        fireConfetti(90, ox, oy + 24, -Math.PI, 0, 17); // 카드 중앙 폭발
      }, CHAMP_IMPACT_MS),
      setTimeout(() => {
        fireConfetti(104, 40, H + 20, -1.52, -0.44, 31); // 좌측 캐논
        fireConfetti(104, cv.width - 40, H + 20, -2.7, -1.62, 31); // 우측 캐논
      }, CHAMP_IMPACT_MS + 140),
      setTimeout(() => fireConfetti(70, cv.width / 2, -40, 0.35, 2.79, 7), CHAMP_IMPACT_MS + 620), // 상단 흩날림
    ];

    return () => {
      cancelAnimationFrame(raf);
      timers.forEach(clearTimeout);
      removeEventListener('resize', fit);
    };
  }, []);

  if (index === null) return null;
  const name = teamName(state, index);
  const finalLoser = final.winner === 'A' ? final.b : final.a;
  const third = roundRankings(state, 2).find((entry) => entry.teamIndex !== index && entry.teamIndex !== finalLoser)?.teamIndex ?? null;

  return (
    <div className="champ-stage fixed inset-0 z-50 overflow-hidden">
      <div className="champ-shake absolute inset-0">
        {/* L0 바탕 + 블룸 / L1 회전 광선 + 스포트라이트 빔 */}
        <div className="champ-ground absolute inset-0" aria-hidden />
        <div className="champ-bloom absolute inset-0" aria-hidden />
        <div className="champ-rays" aria-hidden />
        <div className="absolute inset-0 overflow-hidden" aria-hidden>
          <div className="champ-beam champ-beam--l" />
          <div className="champ-beam champ-beam--r" />
        </div>

        {/* 좌상단 브랜드 블록은 제거 (8/22 운영자: 로고·멘트 삭제 — 무대는 연출만) */}

        {/* 중앙 — CHAMPION → 카드 → 팀명 → 소속 */}
        <div className="relative flex h-full flex-col items-center justify-center py-[8vh]">
          <div className="champ-crown relative flex items-center">
            <span className="champ-rule" aria-hidden />
            <span className="champ-word font-display" role="text" aria-label="CHAMPION">
              {[...'CHAMPION'].map((ch, i) => (
                <i key={i} style={{ animationDelay: `${1.04 + i * 0.038}s` }} aria-hidden>
                  {ch}
                </i>
              ))}
            </span>
            <span className="champ-rule champ-rule--r" aria-hidden />
          </div>

          <div ref={cardRef} className="champ-card-wrap relative">
            {/* 카드 뒤 이펙트 — 카드 중심 기준 정렬 (아우라 링 · 충격파 · 조명 풀 · 글로우) */}
            <div className="champ-aura" aria-hidden>
              <span className="champ-ring champ-ring--outer" />
              <span className="champ-ring champ-ring--inner" />
            </div>
            <span className="champ-wave" aria-hidden />
            <span className="champ-wave" aria-hidden />
            <span className="champ-wave" aria-hidden />
            <div className="champ-pool" aria-hidden />
            <div className="champ-card-glow" aria-hidden />
            <div className="champ-card relative h-full w-full overflow-hidden">
              {team?.character ? (
                <Image src={characterImageSrc(team.character)} alt="" fill sizes="384px" className="object-cover" />
              ) : (
                <div className="grid h-full w-full place-items-center text-2xl text-white/25">?</div>
              )}
              <span className="champ-sheen" aria-hidden />
              <span className="champ-foil" aria-hidden />
            </div>
          </div>

          <div className="champ-name-wrap max-w-full overflow-hidden px-6">
            {/* 원본은 nowrap 75px 인데 실운영 팀명은 최대 20자 — 줄바꿈 허용 + 길이 조건 축소 */}
            <h2
              className="champ-name text-center font-extrabold tracking-tight"
              style={{ fontSize: `calc(var(--cardw) * ${name.length > 10 ? 0.125 : 0.195})`, textWrap: 'balance' }}
            >
              {name}
            </h2>
          </div>
          <div className="champ-meta">
            <span className="champ-org font-en" style={{ color: 'var(--orange)' }}>
              AI VIBETHON
            </span>
          </div>
          <div className="champ-podium mt-5 grid w-full max-w-3xl grid-cols-3 gap-3 px-6 text-center">
            {[
              ['1ST', index],
              ['2ND', finalLoser],
              ['3RD', third],
            ].map(([rank, teamIndex]) => (
              <div key={rank} className="rounded-xl border border-white/15 bg-black/25 px-3 py-3">
                <p className="font-en text-xs font-bold text-[var(--orange)]">{rank}</p>
                <p className="mt-1 line-clamp-2 text-sm font-extrabold text-white lg:text-lg">
                  {typeof teamIndex === 'number' ? teamName(state, teamIndex) : '집계 대기'}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* L7 컨페티 / L9 그레인 · 비네트 / L10 스캔 · 플래시 */}
        <canvas ref={fxRef} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden />
        <div className="champ-grain" aria-hidden />
        <div className="champ-vignette absolute inset-0" aria-hidden />
        <div className="champ-scan" aria-hidden />
        <div className="champ-flash absolute inset-0" aria-hidden />
      </div>
    </div>
  );
}

/**
 * 소리 배지 (8/31) — 자동재생 정책에 막혀 컨텍스트가 suspended 인 동안에만 뜬다.
 * 무대 화면에서 문구는 전부 뺐지만(§6.1) 이건 "지금 소리가 안 난다"는 사실을
 * 시작 전에 알려주는 유일한 신호다 — 클릭 한 번이 곧 제스처라 배지가 스스로 사라진다.
 * scripts/stage-launch.bat 로 연 무대에서는 처음부터 running 이라 나타나지 않는다.
 */
function SfxGate() {
  const [blocked, setBlocked] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const unlockingRef = useRef(false);

  useEffect(() => {
    const tick = () => setBlocked(sfxBlocked());
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleUnlock = useCallback(() => {
    if (unlockingRef.current) return;
    unlockingRef.current = true;
    setUnlocking(true);
    void unlockSfx().then(() => {
      setBlocked(sfxBlocked());
      setUnlocking(false);
      unlockingRef.current = false;
    });
  }, []);

  if (!blocked) return null;
  return (
    <button
      type="button"
      onPointerDown={handleUnlock}
      onClick={handleUnlock}
      className="fixed bottom-4 right-4 z-50 rounded-full border border-white/15 bg-black/55 px-4 py-2 text-sm font-bold text-white/70 backdrop-blur transition-colors hover:text-white"
    >
      {unlocking ? '소리 켜는 중' : '소리 꺼짐 — 클릭해서 켜기'}
    </button>
  );
}

// ------------------------------------------------------------
// 메인
// ------------------------------------------------------------

export default function ViewerPage() {
  const [state, setState] = useState<PublicState | null>(null);
  // 결선 표 연출 — 결선 공개는 즉시 발표 간주(결선 특례, 8/22 저녁)라 정지 화면이
  // 없다. 대신 이 1회성 시퀀스가 표 카드를 다 연 뒤 우승 테이크오버에 자리를 내준다
  const [finalSeq, setFinalSeq] = useState<Match | null>(null);
  // R2 추첨 시퀀스 — 추첨 순간의 준결승 스냅샷 고정 (폴링 갱신에 흔들리지 않게)
  const [drawSeq, setDrawSeq] = useState<[Match, Match] | null>(null);
  // 결선 카운트다운 (8/24 시안) — [공개] 감지 즉시 5초 카운트, 끝나면 표 연출 →
  // 우승 테이크오버 순. 카운트 도는 동안 공개할 결선 스냅샷은 ref 에 보관
  const [countdown, setCountdown] = useState(false);
  const pendingFinalRef = useRef<Match | null>(null);
  const revRef = useRef(0);
  const prevAnnouncedRef = useRef<Record<string, boolean> | null>(null); // null = 첫 스냅샷 전
  const prevDrawnRef = useRef<boolean | null>(null);

  const poll = useCallback(async () => {
    try {
      // no-store: s-maxage/SWR 헤더는 CDN 용인데 브라우저도 존중해서 폴링이 낡은
      // 캐시를 물고 늘어진다. 브라우저 캐시만 우회 (CDN 캐시는 그대로 동작)
      const res = await fetch('/api/state', { cache: 'no-store' });
      const body = await res.json();
      if (!body?.ok || body.rev < revRef.current) return; // 실패·낡은 스냅샷 → 마지막 정상 유지
      revRef.current = body.rev;
      const next: PublicState = { teams: body.teams, matches: body.matches, rev: body.rev };

      // 발표 전이 감지 (2단계 공개의 2단계, 8/22) — announced 로 바뀌는 순간 결과 화면.
      // 정지 화면(1단계)은 상태 파생이라 감지가 필요 없다 (done && !announced 면 항상 표시).
      // 첫 폴링에서는 재생하지 않는다 — 발표 끝난 상태로 새로고침한 화면의 재재생 방지.
      // 결선은 결과 화면 대신 우승 테이크오버가 바로 뜬다
      const prevA = prevAnnouncedRef.current;
      if (prevA) {
        // R1·R2 [발표] = 즉시 대진표 복귀 (8/25 — R1 결과 화면도 제거. 승자는
        // 카드 하이라이트·집결 박스·결승 선반영으로 이미 보인다)
        // 결선 특례 — 공개(=발표) 순간 카운트다운 → 표 연출 → 우승 무대.
        // 표 0건(백업 모드)도 **카운트다운은 돈다** (8/24 재확정 — MC 는 어차피
        // 카운트한다. 리허설 점프 후 0표 공개에서 카운트가 안 떠 발견) —
        // 카드 연출만 생략하고 우승 직행. 첫 폴링 가드(prevA)로 우승 확정
        // 상태에서 새로고침한 화면의 재재생을 막는다 (§6.1)
        const finalJust = next.matches.find(
          (m) => m.id === 'F' && isAnnounced(m) && prevA[m.id] === false,
        );
        if (finalJust) {
          pendingFinalRef.current = (finalJust.votes?.length ?? 0) > 0 ? finalJust : null;
          setCountdown(true);
        }
      }
      prevAnnouncedRef.current = Object.fromEntries(next.matches.map((m) => [m.id, isAnnounced(m)]));

      // R2 추첨 감지 — 준결승 슬롯이 비어 있다가 채워지는 순간 1회성 연출 (8/20).
      const semis = next.matches.filter((m) => m.round === 2);
      const drawnNow = semis.length === 2 && semis.every((m) => m.a !== null && m.b !== null);
      if (drawnNow && prevDrawnRef.current === false) {
        setDrawSeq([semis[0], semis[1]]);
        setTimeout(() => setDrawSeq(null), DRAW_SEQUENCE_MS);
      }
      prevDrawnRef.current = drawnNow;
      setState(next);
    } catch {
      /* 마지막 정상 스냅샷 유지 */
    }
  }, []);

  useEffect(() => {
    // 1.5초 폴링 (8/22 저녁, 3초에서 단축): 스크린이 프로젝터 전용이라 클라이언트가
    // 소수 — 콘솔 클릭 → 스크린 반영 지연(폴링 + CDN 1초 캐시)을 ~2초로 줄인다
    const kickoff = setTimeout(poll, 0);
    const timer = setInterval(poll, 1500);
    return () => {
      clearTimeout(kickoff);
      clearInterval(timer);
    };
  }, [poll]);

  // 효과음 준비 — 자동재생 정책상 첫 클릭/키 입력 후부터 소리가 난다 (lib/sfx.ts).
  // 무대 운영: 프로젝터 창에서 F(전체화면)를 누르는 것만으로도 언락된다.
  useEffect(() => armSfx(), []);

  if (state === null) {
    return (
      <main className="grid min-h-dvh place-items-center">
        <Wordmark className="h-3.5 w-auto text-white/30" />
      </main>
    );
  }

  const live = state.matches.find((m) => m.status === 'live') ?? null;
  const final = byId(state, 'F');
  const semi1 = byId(state, 'R2-1');
  const semi2 = byId(state, 'R2-2');
  const finalistPreview = topTeamsForRound(state, 2, 2);
  // 정지 화면은 상태 파생 — done && 미발표(표 있음)면 새로고침해도 그대로 유지된다.
  // 결선은 해당 없음: 공개 즉시 발표 간주(결선 특례)라 done 이면 항상 announced
  const frozen = state.matches.find((m) => m.status === 'done' && !isAnnounced(m) && m.id !== 'F') ?? null;
  const champion = isAnnounced(final);
  // 추첨 전에는 준결승 두 쌍 대신 중앙 집결 박스 하나 (8/22 저녁 — R1 승자가 모이는 곳)
  const semisDrawn = [semi1, semi2].every((m) => m.a !== null && m.b !== null);
  const r1Matches = state.matches.filter((m) => m.round === 1);

  return (
    <main className="flex min-h-dvh flex-col px-5 pb-3 pt-5 lg:px-10">
      <style>{`
        .font-display { font-family: var(--font-anton), var(--font-suit), sans-serif; }
        /* 무대 확대 (8/22) — 프로젝터(≥1880px)에서 피라미드 전체를 zoom 배.
           zoom 은 레이아웃 크기가 함께 커져 연결선↔준결승 정합이 그대로 유지된다.
           값 이력: 1.18 → 1.06(교명 2줄로 세로 초과) → 1.11(말줄임 복귀로 회복, 실측 상한).
           바꿀 땐 1920×1080 에서 scrollHeight ≤ 1080 실측으로 확인할 것 */
        @media (min-width: 1880px) { .pyramid-zoom { zoom: 1.11; } }
        .live-pulse { animation: livePulse 1.2s ease-in-out infinite; }
        @keyframes livePulse { 50% { opacity: 0.45; } }
        .card-live { box-shadow: 0 0 28px rgba(255,59,48,0.22); }
        .card-reveal { animation: reveal 3s ease-out 1; }
        @keyframes reveal {
          0% { transform: scale(1); box-shadow: 0 0 0 rgba(236,108,1,0); }
          12% { transform: scale(1.04); box-shadow: 0 0 60px rgba(236,108,1,0.65); }
          40% { transform: scale(1.015); box-shadow: 0 0 40px rgba(236,108,1,0.4); }
          100% { transform: scale(1); box-shadow: 0 0 0 rgba(236,108,1,0); }
        }
        @keyframes glowBreathe { 50% { opacity: 0.6; transform: scale(1.08); } }
        .champion-rise { animation: rise 0.9s cubic-bezier(0.2, 0.8, 0.2, 1) both; }
        @keyframes rise { from { opacity: 0; transform: translateY(28px); } to { opacity: 1; transform: none; } }

        /* ── 우승 테이크오버 (디자이너 무대 연출 이식 — docs/championstage2.0.html) ──
           원본은 1920×1080 고정 px 좌표계. 이 화면은 폰도 대상이라 이펙트 치수를
           전부 카드 폭(--cardw) 배수로 환산했다 — 카드가 줄면 링·빔·풀도 같이 준다.
           타임라인(--tc 카드 임팩트 등)은 원본 값 그대로. --tc 를 바꾸면
           CHAMP_IMPACT_MS 도 같이 바꿔야 한다 (컨페티 발사 시점). */
        .champ-stage {
          /* 8/22 저녁: 좌상단 브랜드 블록이 빠진 무대 여백만큼 확대 (384→432).
             모든 이펙트·타이포가 --cardw 배수라 이 한 줄이 전체 스케일이다 */
          /* 8/24: 432→372 축소 — CHAMPION 과 소속이 화면 위아래 끝에 붙어 보였다 */
          --cardw: clamp(170px, 38vmin, 372px);
          --cardh: calc(var(--cardw) * 1.484);
          --tsn: 0.1s; --tf: 0.52s; --tc: 0.56s; --tch: 1.04s; --tn: 1.5s; --tm: 1.92s;
          --eo: cubic-bezier(0.16, 1, 0.3, 1);
          --es: cubic-bezier(0.2, 1.4, 0.35, 1);
          --ember: #ffb25e;
          background: var(--bg);
        }
        .champ-shake { animation: champShake 0.34s steps(2, end) var(--tc); }
        @keyframes champShake {
          0% { transform: translate(0, 0); } 14% { transform: translate(-9px, 5px); }
          28% { transform: translate(8px, -6px); } 42% { transform: translate(-6px, -4px); }
          56% { transform: translate(5px, 6px); } 70% { transform: translate(-3px, 2px); }
          84% { transform: translate(2px, -2px); } 100% { transform: translate(0, 0); }
        }
        .champ-ground { background: radial-gradient(120% 90% at 50% 8%, #141110 0%, var(--bg) 62%); }
        .champ-bloom {
          background:
            radial-gradient(46% 46% at 50% 50%, rgba(236,108,1,0.3) 0%, rgba(236,108,1,0.1) 42%, transparent 72%),
            radial-gradient(80% 62% at 50% 58%, rgba(236,108,1,0.1) 0%, transparent 70%);
          opacity: 0;
          animation: champBloomIn 1.5s var(--eo) var(--tc) both, champBreathe 5.2s ease-in-out 2.4s infinite;
        }
        @keyframes champBloomIn { from { opacity: 0.2; } to { opacity: 1; } }
        @keyframes champBreathe { 50% { filter: brightness(1.22); } }
        .champ-rays {
          position: absolute; left: 50%; top: 50%; translate: -50% -50%;
          width: calc(var(--cardw) * 6.25); height: calc(var(--cardw) * 6.25);
          background: repeating-conic-gradient(from 0deg at 50% 50%, rgba(255,178,94,0.16) 0deg 0.8deg, transparent 0.8deg 16deg);
          mask-image: radial-gradient(circle closest-side, transparent 21.7%, rgba(0,0,0,0.9) 43.3%, transparent 81.7%);
          filter: blur(3px);
          opacity: 0;
          animation: champRaysIn 1.6s var(--eo) calc(var(--tc) + 0.1s) both, champSpin 96s linear 1s infinite;
        }
        @keyframes champRaysIn { from { opacity: 0; } to { opacity: 0.4; } }
        @keyframes champSpin { to { rotate: 360deg; } }
        @keyframes champSpinRev { to { rotate: -360deg; } }
        .champ-beam {
          position: absolute; top: -20vh; left: 50%;
          width: calc(var(--cardw) * 1.72); height: 140vh;
          background: linear-gradient(180deg, rgba(255,206,150,0.36) 0%, rgba(255,170,84,0.18) 26%,
            rgba(236,108,1,0.075) 58%, rgba(236,108,1,0.02) 80%, transparent 95%);
          clip-path: polygon(46% 0, 54% 0, 100% 100%, 0% 100%);
          filter: blur(40px);
          transform-origin: 50% 0;
          opacity: 0;
        }
        .champ-beam--l {
          margin-left: calc(var(--cardw) * -2.11); rotate: -29.5deg;
          animation: champFadeIn 1.3s var(--eo) calc(var(--tc) + 0.12s) both, champSwayL 13s ease-in-out calc(var(--tc) + 1.4s) infinite;
        }
        .champ-beam--r {
          margin-left: calc(var(--cardw) * 0.39); rotate: 29.5deg;
          animation: champFadeIn 1.3s var(--eo) calc(var(--tc) + 0.2s) both, champSwayR 16s ease-in-out calc(var(--tc) + 1.4s) infinite;
        }
        @keyframes champSwayL { 0%, 100% { rotate: -29.5deg; } 50% { rotate: -32.5deg; } }
        @keyframes champSwayR { 0%, 100% { rotate: 29.5deg; } 50% { rotate: 32.5deg; } }
        @keyframes champFadeIn { to { opacity: 1; } }
        .champ-aura {
          position: absolute; left: 50%; top: 50%; translate: -50% -50%;
          filter: drop-shadow(0 0 18px rgba(236,108,1,0.55));
        }
        .champ-ring { position: absolute; left: 50%; top: 50%; translate: -50% -50%; border-radius: 50%; opacity: 0; }
        /* 링 마스크는 원본 px 반지름의 closest-side % 환산 — 크기가 줄어도 띠가 유지된다 */
        .champ-ring--outer {
          width: calc(var(--cardw) * 2.448); height: calc(var(--cardw) * 2.448);
          background: conic-gradient(from 0deg, transparent 0 6%, var(--orange) 15%, var(--ember) 21%,
            transparent 32% 62%, var(--orange) 73%, transparent 86% 100%);
          mask-image: radial-gradient(circle closest-side, transparent 98%, #000 99% 99.9%, transparent 100%);
          animation: champRingOuterIn 1.2s ease-out var(--tch) forwards, champSpin 22s linear infinite;
        }
        .champ-ring--inner {
          width: calc(var(--cardw) * 1.823); height: calc(var(--cardw) * 1.823);
          background: conic-gradient(from 180deg, transparent 0 10%, var(--ember) 20%, transparent 34% 60%,
            var(--orange) 70%, transparent 84% 100%);
          mask-image: radial-gradient(circle closest-side, transparent 97.5%, #000 98.6% 100%, transparent 100%);
          animation: champRingInnerIn 1.2s ease-out calc(var(--tch) + 0.12s) forwards, champSpinRev 15s linear infinite;
        }
        @keyframes champRingOuterIn { to { opacity: 0.55; } }
        @keyframes champRingInnerIn { to { opacity: 0.4; } }
        .champ-wave {
          position: absolute; left: 50%; top: 50%; translate: -50% -50%;
          width: calc(var(--cardw) * 0.885); height: calc(var(--cardw) * 0.885);
          border-radius: 50%; border: 3px solid var(--ember); opacity: 0;
          animation: champBurst 1.05s var(--eo) forwards;
        }
        .champ-wave:nth-of-type(1) { animation-delay: var(--tc); }
        .champ-wave:nth-of-type(2) { animation-delay: calc(var(--tc) + 0.09s); border-color: var(--orange); }
        .champ-wave:nth-of-type(3) { animation-delay: calc(var(--tc) + 0.19s); border-width: 2px; }
        @keyframes champBurst {
          0% { opacity: 0.9; transform: scale(0.5); border-width: 6px; }
          100% { opacity: 0; transform: scale(4.6); border-width: 1px; }
        }
        .champ-pool {
          position: absolute; left: 50%; top: calc(100% + var(--cardw) * 0.19); translate: -50% -50%;
          width: calc(var(--cardw) * 2.135); height: calc(var(--cardw) * 0.495);
          background: radial-gradient(50% 50% at 50% 50%, rgba(255,178,94,0.42) 0%, rgba(236,108,1,0.18) 38%, transparent 72%);
          filter: blur(14px); opacity: 0;
          animation: champPoolIn 1.1s var(--eo) calc(var(--tc) + 0.06s) forwards, champBreathe 5.2s ease-in-out 2.4s infinite;
        }
        @keyframes champPoolIn { from { opacity: 0; transform: scaleX(0.3); } to { opacity: 1; transform: scaleX(1); } }
        .champ-crown { margin-bottom: calc(var(--cardw) * 0.146); gap: calc(var(--cardw) * 0.0573); }
        .champ-crown::before {
          content: ''; position: absolute; left: 50%; top: 50%; translate: -50% -50%;
          width: calc(var(--cardw) * 1.09); height: calc(var(--cardw) * 0.27); border-radius: 50%;
          background: radial-gradient(50% 50% at 50% 50%, rgba(236,108,1,0.22), transparent 70%);
          filter: blur(22px); opacity: 0; z-index: -1;
          animation: champFadeIn 0.9s ease-out calc(var(--tch) + 0.2s) forwards;
        }
        .champ-rule {
          width: 0; height: 2px; flex: none;
          background: linear-gradient(90deg, transparent, var(--orange));
          animation: champRuleGrow 0.9s var(--eo) calc(var(--tch) + 0.28s) forwards;
        }
        .champ-rule--r { background: linear-gradient(270deg, transparent, var(--orange)); }
        @keyframes champRuleGrow { to { width: calc(var(--cardw) * 0.27); } }
        .champ-word {
          display: flex; line-height: 1;
          font-size: calc(var(--cardw) * 0.12);
          color: var(--orange);
          text-shadow: 0 0 16px rgba(236,108,1,0.34), 0 0 44px rgba(236,108,1,0.14);
        }
        .champ-word i {
          display: inline-block; font-style: normal;
          opacity: 0; transform: translateY(-52px); filter: blur(9px);
          animation: champDrop 0.58s var(--es) forwards;
        }
        @keyframes champDrop { to { opacity: 1; transform: translateY(0); filter: blur(0); } }
        .champ-card-wrap { width: var(--cardw); height: var(--cardh); perspective: 1400px; }
        .champ-card-glow {
          position: absolute; inset: calc(var(--cardw) * -0.234) calc(var(--cardw) * -0.286);
          background: radial-gradient(50% 50% at 50% 50%, rgba(236,108,1,0.55), rgba(236,108,1,0.14) 46%, transparent 72%);
          filter: blur(30px); opacity: 0;
          animation: champFadeIn 0.9s ease-out var(--tc) forwards, champBreathe 5.2s ease-in-out 2.4s infinite;
        }
        .champ-card {
          border-radius: 5.7% / 3.8%; /* 카드 에셋 베이크 곡률 (ui.tsx CARD_RADIUS) */
          border: 1px solid rgba(255,255,255,0.16);
          box-shadow: 0 40px 90px rgba(0,0,0,0.72), 0 0 0 1px rgba(255,178,94,0.14), 0 0 70px rgba(236,108,1,0.34);
          transform-style: preserve-3d;
          opacity: 0;
          animation: champSlam 0.78s var(--es) var(--tc) forwards, champFloat 6.4s ease-in-out 2.2s infinite;
        }
        @keyframes champSlam {
          0% { opacity: 0; transform: scale(1.62) rotateX(14deg); filter: blur(22px); }
          55% { opacity: 1; }
          100% { opacity: 1; transform: scale(1) rotateX(0deg); filter: blur(0); }
        }
        @keyframes champFloat {
          0%, 100% { transform: translateY(0) rotateZ(0deg) rotateY(0deg); }
          25% { transform: translateY(-11px) rotateZ(-1.1deg) rotateY(3.5deg); }
          50% { transform: translateY(-4px) rotateZ(0deg) rotateY(0deg); }
          75% { transform: translateY(-13px) rotateZ(1.1deg) rotateY(-3.5deg); }
        }
        .champ-sheen {
          position: absolute; inset: 0; pointer-events: none;
          background: radial-gradient(120% 80% at 12% 0%, rgba(255,255,255,0.16), transparent 58%);
        }
        .champ-foil {
          position: absolute; top: -40%; left: -70%; width: 55%; height: 180%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.42), rgba(255,214,160,0.3), transparent);
          transform: rotate(18deg); mix-blend-mode: screen; pointer-events: none;
          opacity: 0;
          animation: champFoil 5.4s ease-in-out 2.6s infinite;
        }
        @keyframes champFoil {
          0% { left: -70%; opacity: 0; } 8% { opacity: 1; }
          34% { left: 120%; opacity: 0; } 100% { left: 120%; opacity: 0; }
        }
        .champ-name-wrap { margin-top: calc(var(--cardw) * 0.078); }
        .champ-name {
          color: #f5efe6; line-height: 1.14; letter-spacing: -0.035em;
          text-shadow: 0 1px 2px rgba(0,0,0,0.55), 0 2px 10px rgba(0,0,0,0.42), 0 4px 26px rgba(0,0,0,0.28);
          clip-path: inset(0 100% 0 0);
          animation: champWipe 0.66s var(--eo) var(--tn) forwards;
        }
        @keyframes champWipe { to { clip-path: inset(0 0 0 0); } }
        .champ-meta {
          display: flex; align-items: center; gap: calc(var(--cardw) * 0.036);
          margin-top: 14px; opacity: 0; transform: translateY(16px);
          animation: champRise 0.7s var(--eo) var(--tm) forwards;
        }
        @keyframes champRise { to { opacity: 1; transform: translateY(0); } }
        .champ-emblem {
          position: relative; flex: none; overflow: hidden;
          width: calc(var(--cardw) * 0.0885); height: calc(var(--cardw) * 0.0885);
          border-radius: 50%; background: rgba(255,255,255,0.95);
          border: 1px solid rgba(245,239,230,0.28);
        }
        .champ-univ {
          font-weight: 700; font-size: calc(var(--cardw) * 0.078);
          color: #f5efe6; letter-spacing: -0.02em;
          text-shadow: 0 1px 2px rgba(0,0,0,0.55), 0 2px 9px rgba(0,0,0,0.38);
        }
        .champ-dot { width: calc(var(--cardw) * 0.013); height: calc(var(--cardw) * 0.013); border-radius: 50%; flex: none; }
        .champ-org {
          font-weight: 700; font-size: calc(var(--cardw) * 0.057); letter-spacing: 0.16em;
          text-shadow: 0 1px 2px rgba(0,0,0,0.55), 0 2px 9px rgba(0,0,0,0.38);
        }
        .champ-grain {
          position: absolute; inset: -120px; pointer-events: none; opacity: 0.05;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
          animation: champGrain 0.6s steps(4, end) infinite;
        }
        @keyframes champGrain {
          0% { transform: translate(0, 0); } 25% { transform: translate(-38px, 22px); }
          50% { transform: translate(26px, -30px); } 75% { transform: translate(-18px, -14px); }
          100% { transform: translate(0, 0); }
        }
        .champ-vignette {
          pointer-events: none;
          background: radial-gradient(78% 74% at 50% 48%, transparent 44%, rgba(0,0,0,0.62) 100%);
        }
        .champ-flash { background: #fff; opacity: 0; pointer-events: none; animation: champFlash 0.3s ease-out var(--tf) forwards; }
        @keyframes champFlash { 0% { opacity: 0; } 10% { opacity: 0.9; } 100% { opacity: 0; } }
        .champ-scan {
          position: absolute; left: 0; top: 50%; height: 2px; width: 0;
          background: linear-gradient(90deg, transparent, var(--ember), transparent);
          box-shadow: 0 0 22px var(--orange); pointer-events: none; opacity: 0;
          animation: champScan 0.46s var(--eo) var(--tsn) forwards;
        }
        @keyframes champScan {
          0% { width: 0; left: 50%; opacity: 1; }
          60% { width: 100%; left: 0; opacity: 1; }
          100% { width: 100%; left: 0; opacity: 0; }
        }
        /* 카드 플립 공통 (공개 칩 · 추첨 카드) — 기본 상태(애니메이션 없음)가 앞면이라
           reduced-motion 에서 animation:none 만으로 완성 상태가 된다 */
        .chip-outer { perspective: 700px; animation: chipIn 0.4s ease-out both; }
        /* ── 결선 카운트다운 (8/24 시안) ────────────────────────────── */
        .count-bg {
          position: absolute; inset: 0;
          background:
            radial-gradient(ellipse 62% 46% at 50% 42%, rgba(236,108,1,0.17), transparent 70%),
            radial-gradient(ellipse 95% 60% at 50% 112%, rgba(236,108,1,0.10), transparent 70%),
            radial-gradient(ellipse 140% 100% at 50% 50%, transparent 55%, rgba(0,0,0,0.55) 100%);
          animation: backdropIn 0.6s ease-out;
        }
        .count-bg::before, .count-bg::after {
          content: ''; position: absolute; top: -22%; bottom: -22%; left: 50%; width: 17vw;
          background: linear-gradient(180deg, rgba(255,177,92,0.11), rgba(236,108,1,0.02) 70%, transparent);
          clip-path: polygon(38% 0, 62% 0, 96% 100%, 4% 100%);
          animation: beamShimmer 4s ease-in-out infinite;
        }
        .count-bg::before { transform: translateX(-50%) rotate(13deg); }
        .count-bg::after { transform: translateX(-50%) rotate(-13deg); animation-delay: 2s; }
        .count-num {
          font-size: min(46vh, 30rem); line-height: 0.95; padding: 0 0.12em;
          color: transparent; background: linear-gradient(180deg, #ffdfb4 0%, #ff9b3e 36%, var(--orange) 72%, #a34700 100%);
          -webkit-background-clip: text; background-clip: text;
          filter: drop-shadow(0 0 22px rgba(236,108,1,0.5)) drop-shadow(0 14px 70px rgba(236,108,1,0.35));
          animation: countPop ${COUNT_STEP_MS / 1000}s cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        /* 끝 페이드아웃 없음 (8/24 실측 후 조정) — 마지막 0.14초에 흐려지면
           숫자당 1초를 다 못 채운 것처럼 빨라 보인다. 다음 숫자 팝이 교체를 담당 */
        @keyframes countPop {
          0% { opacity: 0; transform: scale(2.1); }
          30% { opacity: 1; transform: scale(0.97); }
          48% { transform: scale(1.015); }
          62%, 100% { opacity: 1; transform: scale(1); }
        }
        .count-ring {
          position: absolute; width: min(52vh, 34rem); aspect-ratio: 1; border-radius: 9999px;
          border: 2px solid rgba(236,108,1,0.55);
          animation: countRing ${COUNT_STEP_MS / 1000}s ease-out both;
        }
        .count-ring2 { border-color: rgba(255,177,92,0.3); animation-delay: 0.12s; }
        @keyframes countRing { from { transform: scale(0.5); opacity: 0.9; } to { transform: scale(1.45); opacity: 0; } }
        @media (prefers-reduced-motion: reduce) {
          .count-num { animation: none; }
          .count-ring { display: none; }
        }

        @keyframes chipIn { from { opacity: 0; transform: translateY(22px); } }
        .chip-inner {
          transform-style: preserve-3d;
          animation: chipFlip 0.6s cubic-bezier(0.3, 0.8, 0.3, 1) both;
        }
        @keyframes chipFlip { from { transform: rotateY(180deg); } to { transform: rotateY(0deg); } }
        .chip-face { backface-visibility: hidden; }
        .chip-back { transform: rotateY(180deg); }
        /* 추첨 카드 — 모으기 → 셔플 → 배치 (8/22 저녁). 중앙 벡터(--gx/--gy)는
           DrawSequence 가 마운트 때 실측해 카드별로 꽂는다 (반응형 간격 대응).
           --gr = 카드별 기울기 — 겹친 덩이가 부채처럼 보이게 */
        .draw-outer { perspective: 700px; }
        @keyframes drawGather {
          from { transform: none; }
          to { transform: translate(var(--gx), var(--gy)) rotate(var(--gr)); }
        }
        /* 셔플 — 중앙 덩이 안에서 좌우로 엇갈리며 자리를 바꾸는 인상 (4벌).
           모든 키프레임이 중앙 벡터를 기저로 갖는다 (transform 은 통째로 덮인다) */
        @keyframes drawMix0 {
          0%, 100% { transform: translate(var(--gx), var(--gy)) rotate(var(--gr)); }
          25% { transform: translate(calc(var(--gx) + 70px), var(--gy)) rotate(6deg); }
          65% { transform: translate(calc(var(--gx) - 46px), calc(var(--gy) + 8px)) rotate(-5deg); }
        }
        @keyframes drawMix1 {
          0%, 100% { transform: translate(var(--gx), var(--gy)) rotate(var(--gr)); }
          30% { transform: translate(calc(var(--gx) - 64px), calc(var(--gy) - 6px)) rotate(-7deg); }
          70% { transform: translate(calc(var(--gx) + 52px), var(--gy)) rotate(4deg); }
        }
        @keyframes drawMix2 {
          0%, 100% { transform: translate(var(--gx), var(--gy)) rotate(var(--gr)); }
          22% { transform: translate(calc(var(--gx) + 48px), calc(var(--gy) + 10px)) rotate(5deg); }
          60% { transform: translate(calc(var(--gx) - 70px), var(--gy)) rotate(-4deg); }
        }
        @keyframes drawMix3 {
          0%, 100% { transform: translate(var(--gx), var(--gy)) rotate(var(--gr)); }
          35% { transform: translate(calc(var(--gx) - 50px), var(--gy)) rotate(-6deg); }
          75% { transform: translate(calc(var(--gx) + 62px), calc(var(--gy) - 8px)) rotate(7deg); }
        }
        @keyframes drawReturn {
          from { transform: translate(var(--gx), var(--gy)) rotate(var(--gr)); }
          to { transform: none; }
        }
        /* 모으기 뒤 전체가 뒷면으로 — 공개(chipFlip: 180→0)의 역방향 */
        @keyframes drawToBack { from { transform: rotateY(0deg); } to { transform: rotateY(180deg); } }
        .draw-name { animation: rise 0.5s ease-out both; }
        /* 대진표 배경 + CHAMPION 슬롯 (8/22 저녁 — "배경 추가", "CHAMPION 디자인") */
        .bracket-backdrop { pointer-events: none; animation: backdropIn 0.9s ease-out both; }
        .bracket-beam {
          position: absolute; top: -20vh; width: 16vw; height: 90vh;
          background: linear-gradient(180deg, rgba(255,214,165,0.05), transparent 75%);
          clip-path: polygon(38% 0, 62% 0, 100% 100%, 0 100%);
        }
        .champ-slot {
          border: 1px solid rgba(236,108,1,0.6);
          background: linear-gradient(180deg, rgba(236,108,1,0.2), rgba(236,108,1,0.05));
          box-shadow: 0 0 26px rgba(236,108,1,0.28), inset 0 0 16px rgba(236,108,1,0.12);
        }
        .champ-slot-text {
          background: linear-gradient(90deg, #ffd9a8, #ec6c01 55%, #ffb25e);
          -webkit-background-clip: text; background-clip: text; color: transparent;
          filter: drop-shadow(0 0 10px rgba(236,108,1,0.45));
        }
        .vs-backdrop { pointer-events: none; animation: backdropIn 0.9s ease-out both; }
        @keyframes backdropIn { from { opacity: 0; } }
        .vs-glow { animation: glowBreathe 4s ease-in-out infinite; }
        .vs-beam {
          animation: beamIn 1.1s cubic-bezier(0.2, 0.8, 0.2, 1) both,
            beamShimmer 6s ease-in-out 1.1s infinite;
        }
        @keyframes beamIn {
          from { opacity: 0; transform: translate(-50%, -150%) rotate(15deg); }
          to { opacity: 1; transform: translate(-50%, -50%) rotate(15deg); }
        }
        @keyframes beamShimmer { 50% { opacity: 0.55; } }
        @media (prefers-reduced-motion: reduce) {
          /* !important: 추첨 카드의 이동·플립은 인라인 animation 이라 클래스만으로는 못 끈다 */
          .live-pulse, .card-reveal, .champion-rise,
          .chip-outer, .chip-inner, .draw-outer, .draw-name,
          .vs-backdrop, .vs-glow, .vs-beam { animation: none !important; }
          /* 우승 무대 — 원본의 축소 규칙 그대로: 흔들림·플래시·충격파·포일·그레인만 끄고,
             페이드 계열(블룸·빔·레터 드롭·와이프)은 유지. 카드는 페이드 등장으로 대체 */
          .champ-shake, .champ-wave, .champ-flash, .champ-scan, .champ-foil, .champ-grain { animation: none !important; }
          .champ-card { animation: champFadeIn 0.5s ease-out var(--tc) forwards !important; }
          .champ-rays, .champ-ring--outer, .champ-ring--inner { animation-name: champFadeIn !important; animation-duration: 0.6s !important; }
        }
      `}</style>

      {/* 헤더·푸터·안내 문구는 전부 제거 (8/22 운영자: 무대에 필요없는 멘트 삭제) —
          화면은 연출과 대진표만 남긴다. 본문 우선순위:
          표 정지 화면 > 결선 표 연출 > 추첨 시퀀스 > live 대결 포커스 > 대진표 (§6.1) */}
      {frozen ? (
        <FreezeReveal state={state} match={frozen} />
      ) : finalSeq ? (
        <FreezeReveal state={state} match={finalSeq} />
      ) : drawSeq ? (
        <DrawSequence state={state} semis={drawSeq} />
      ) : live ? (
        <FocusLive state={state} match={live} />
      ) : (
        <>
      {/* 대진표 — xl(1280px) 이상은 피라미드형. 8/22 개편: 세 라운드 전부 R1 과 같은
          개별 카드 열(PairColumn)로 통일. 승자 슬롯 라벨은 R1 = 트랙명(같은 트랙 대결),
          R2/F = 진출처. xl 미만은 물리적으로 좁아 세로 스택 유지 */}
      {/* 대진표 배경 (8/22 저녁) — 무대 스포트라이트 톤의 은은한 글로우.
          fixed z-0 레이어라 본문에 relative z-10 필요 (FocusLive 배경과 같은 구조) */}
      <div className="bracket-backdrop fixed inset-0 z-0" aria-hidden>
        <div
          className="absolute"
          style={{
            left: '50%', top: '-18%', width: '72vw', height: '72vw', transform: 'translateX(-50%)',
            background: 'radial-gradient(circle, rgba(236,108,1,0.11) 0%, rgba(236,108,1,0.04) 42%, transparent 65%)',
          }}
        />
        <div className="bracket-beam" style={{ left: '50%', marginLeft: '-30vw', rotate: '24deg' }} />
        <div className="bracket-beam" style={{ left: '50%', marginLeft: '24vw', rotate: '-24deg' }} />
        <div
          className="absolute inset-0"
          style={{ background: 'radial-gradient(ellipse 90% 70% at 50% 45%, transparent 55%, rgba(0,0,0,0.5) 100%)' }}
        />
      </div>
      <div className="pyramid-zoom relative z-10 hidden flex-1 flex-col justify-center py-2 xl:flex">
        {/* 연결선 + 3개 라운드를 절반 셀 그리드로 — 연결선 끝점 = 준결승 열 중심 =
            하위 두 열 중점이 수치 없이 자동 성립 (8/22 정렬 결정 유지) */}
        <div className="relative mx-auto grid w-fit grid-cols-2 gap-x-7 2xl:gap-x-10">
          {/* 결선 열 — 두 셀에 걸쳐 중앙. CHAMPION 슬롯은 전용 강조 스타일 (8/22 저녁).
              대기 카드 쌍(?카드)은 추첨 전에도 항상 보인다 (8/23 재복원 — 감추면
              집결 4팀이 곧장 챔피언으로 가는 것처럼 읽힘: 결승 단계가 보여야 한다).
              대기 카드는 R2 승자가 나오는 즉시 표시로 선반영 (8/23 — R1 집결과 같은
              문법. 좌=R2-1·우=R2-2 승자, setFinal 의 a/b 매핑과 동일해 [결선 확정]
              때 자리 점프가 없다. 확정·경기 시작 가드는 여전히 setFinal 몫) */}
          <div className="col-span-2 flex justify-center">
            <PairColumn
              state={state}
              match={{ ...final, a: final.a ?? finalistPreview[0] ?? null, b: final.b ?? finalistPreview[1] ?? null }}
              championSlot
              slotLabel={
                <span className="font-display champ-slot-text text-sm tracking-[0.28em] 2xl:text-base">
                  🏆 CHAMPION
                </span>
              }
            />
          </div>
          {/* 연결선 줄 — 추첨 전에는 중앙 집결 박스 하나뿐이라 중앙 스텁만 (8/22 저녁) */}
          {semisDrawn ? (
            <div className="relative col-span-2 grid grid-cols-2 gap-x-9 2xl:gap-x-14">
              <ConnectorHalf side="l" drawn={final.a !== null && final.b !== null} />
              <ConnectorHalf side="r" drawn={final.a !== null && final.b !== null} />
              {/* 그리드 gap 이 끊는 가로선 중앙 구간 + 결선으로 오르는 스텁 */}
              <div
                className="absolute left-1/2 w-9 -translate-x-1/2 2xl:w-14"
                style={{ top: 14, borderTop: connLine(final.a !== null && final.b !== null) }}
                aria-hidden
              />
              <div
                className="absolute left-1/2 top-0"
                style={{ height: 14, borderLeft: connLine(final.a !== null && final.b !== null) }}
                aria-hidden
              />
            </div>
          ) : (
            <div className="relative col-span-2 h-8 2xl:h-9" aria-hidden>
              <div className="absolute bottom-0 left-1/2 top-0" style={{ borderLeft: connLine(false) }} />
            </div>
          )}
          {/* 준결승 — 추첨 후에만 두 쌍으로. 추첨 전에는 R1 승자 4팀이 모이는
              중앙 박스 하나 (8/22 저녁 운영자: "가운데 박스 하나에 합쳐라") */}
          {semisDrawn ? (
            [semi1, semi2].map((semi) => (
              <div key={semi.id} className="flex justify-center">
                <PairColumn state={state} match={semi} slotLabel="FINAL 후보" />
              </div>
            ))
          ) : (
            <div className="col-span-2 flex justify-center">
              {/* 상단 라벨("FINAL 진출 — R1 승자 집결 · 대진 추첨 대기")은 8/24 제거
                  (운영자 "이거 좀 빼줘") — 박스·카드만으로 집결이 읽힌다 */}
              <div className="rounded-2xl border border-dashed border-white/20 bg-white/3 px-8 py-4 2xl:px-10 2xl:py-5">
                <div className="flex items-start justify-center gap-5 2xl:gap-6">
                  {Array.from({ length: 4 }, (_, i) => {
                    const idx = topTeamsForRound(state, 1, 4)[i] ?? null;
                    const team = teamAt(state, idx);
                    return idx !== null && team ? (
                      <div key={idx} className="w-24 text-center 2xl:w-28">
                        <CharacterArt characterKey={team.character} className="chip-outer mx-auto aspect-2/3 w-full" sizes="112px" />
                        <p className="mt-1.5 line-clamp-1 text-xs font-extrabold 2xl:text-sm">{teamName(state, idx)}</p>
                      </div>
                    ) : (
                      <div key={i} className="w-24 text-center 2xl:w-28">
                        {/* 빈 슬롯 = 물음표 카드 에셋 (8/23 운영자 — 회색 ? 박스 대신) */}
                        <div className="relative aspect-2/3 w-full opacity-70">
                          <Image src="/card-back-Q-ver3.png" alt="" fill sizes="112px" className="object-cover" />
                        </div>
                        <p className="font-en mt-1.5 text-xs font-bold text-white/30 2xl:text-sm">TOP 후보</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
          {[r1Matches.slice(0, 2), r1Matches.slice(2)].map((half, i) => (
            <div key={i} className="mt-6 flex gap-7 2xl:gap-10">
              {half.map((m) => {
                const track = teamAt(state, m.a)?.track;
                return (
                  <PairColumn
                    key={m.id}
                    state={state}
                    match={m}
                    slotBg={track ? TRACK_COLORS[track] : undefined}
                    slotLabel={
                      track ? (
                        // 트랙 컬러는 배경으로 (8/22 저녁 — 글자색 표기 번복), 글자는 흰색 고정:
                        // 네 트랙색(핑크·그린·퍼플·블루) 모두에서 흰 글자가 안전하다
                        <span className="font-en font-extrabold tracking-wider text-white">{track} TRACK</span>
                      ) : (
                        '트랙 미정'
                      )
                    }
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* 세로 스택 — xl 미만 (좁은 노트북/태블릿 폴백) */}
      <div className="mx-auto w-full max-w-md space-y-7 pt-4 xl:hidden">
        {[
          { label: 'ROUND 1', matches: state.matches.filter((m) => m.round === 1), undrawn: undefined },
          { label: 'ROUND 2', matches: [semi1, semi2], undrawn: '추첨 대기' },
          { label: 'FINAL', matches: [final], undrawn: '결선 대진 확정 전' },
        ].map((group) => (
          <section key={group.label}>
            <h2 className="font-display mb-2.5 text-sm text-white/35">{group.label}</h2>
            <div className="space-y-3">
              {group.matches.map((m) => (
                <MatchCard key={m.id} state={state} match={m} undrawnLabel={group.undrawn} />
              ))}
            </div>
          </section>
        ))}
      </div>
        </>
      )}

      {/* 우승 테이크오버 — 결선 공개(=발표, 결선 특례) 시. 카운트다운 → 표 연출
          (finalSeq) 이 도는 동안은 뒤로 미룬다 (0표 백업·새로고침은 카운트 없이 직행) */}
      {champion && countdown && (
        <Countdown
          onDone={() => {
            setCountdown(false);
            const m = pendingFinalRef.current;
            if (m) {
              pendingFinalRef.current = null;
              setFinalSeq(m);
              // 6초 공개 + 3.4초 여운(마지막 집계를 읽을 시간) → 우승 무대
              setTimeout(() => setFinalSeq(null), FINAL_REVEAL_MS + 3400);
            }
          }}
        />
      )}
      {champion && !finalSeq && !countdown && <ChampionTakeover state={state} final={final} />}

      <SfxGate />
    </main>
  );
}
