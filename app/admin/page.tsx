'use client';

// 운영(admin) 화면 — 명세 §6.3.
//
// PIN 입장 → 탭 3개 (경기 진행 / 팀 관리 / 설정).
// 모든 쓰기는 POST /api/admin/action 단일 진입점을 거치고,
// 응답의 최신 스냅샷으로 화면을 즉시 동기화한다. 폴링(4초)은 보조 수단.
// 결과 공개·추첨·초기화처럼 되돌릴 수 없는 액션은 반드시 확인 다이얼로그를 거친다 (결과 취소 없음 결정).

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
// 워드마크는 공용 조각을 그대로 쓴다 (2026-08-31 — 종전에는 화면 간 PR 분리 관례로
// admin 이 사본을 들고 있었는데, 행사 브랜딩이 바뀌면서 두 벌을 따로 고쳐야 했다)
import { Wordmark, characterImageSrc } from '@/components/ui';
import { noteServerNow } from '@/lib/clock';
import type { Match, Team, Side, TimerState } from '@/lib/tournament';
import { isAnnounced, topTeamsForRound } from '@/lib/tournament';
import { CRITERIA, emptyMatchFeedback, emptyMatchScores, sideTotal, type FeedbackSet, type MatchFeedback, type MatchScores } from '@/lib/scoring';


// ------------------------------------------------------------
// 타입 · API 헬퍼
// ------------------------------------------------------------

type AdminState = {
  teams: Team[];
  matches: Match[];
  judges: string[];
  judgeCode: string;
  timer: TimerState | null;
  finalRankingShown: boolean;
  /** 서버 현재 시각 — 기기 시계 편차 보정용 (lib/clock.ts). 구버전 응답엔 없다 */
  now?: number;
  rev: number;
  trackWarnings: string[];
};

type VoteRow = {
  judge_slug: string;
  name: string;
  winner: Side;
  scores: MatchScores | null;
  feedback_a: string | null;
  feedback_b: string | null;
  comment: string | null;
  video_a: boolean;
  video_b: boolean;
  ts: number;
};

class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

async function api<T = Record<string, unknown>>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: init?.body ? { 'content-type': 'application/json', ...init?.headers } : init?.headers,
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.ok) {
    const err = body?.error ?? { code: 'UNKNOWN', message: `요청 실패 (${res.status})` };
    throw new ApiError(res.status, err.code, err.message);
  }
  return body as T;
}

const action = (payload: Record<string, unknown>) =>
  api<{ state: AdminState }>('/api/admin/action', { method: 'POST', body: JSON.stringify(payload) });

// ------------------------------------------------------------
// 공용 조각
// ------------------------------------------------------------

function CharacterThumb({ characterKey, size = 40 }: { characterKey: string | null; size?: number }) {
  return (
    <div
      className="relative shrink-0 overflow-hidden rounded-lg border border-white/10 bg-white/5"
      style={{ width: size, height: size * 1.4 }}
    >
      {characterKey ? (
        <Image src={characterImageSrc(characterKey)} alt="" fill sizes={`${size}px`} className="object-cover" />
      ) : (
        <div className="grid h-full w-full place-items-center text-[10px] text-white/30">?</div>
      )}
    </div>
  );
}

/** 확인 다이얼로그. requireText 를 주면 그 문구를 그대로 입력해야 확정된다 (초기화용). */
type Confirm = {
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  requireText?: string;
  onConfirm: () => void;
};

function ConfirmDialog({ confirm, onClose }: { confirm: Confirm; onClose: () => void }) {
  const [typed, setTyped] = useState('');
  const blocked = confirm.requireText !== undefined && typed !== confirm.requireText;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-2xl border border-white/10 bg-[var(--surface)] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-2 text-lg font-bold">{confirm.title}</h3>
        <p className="mb-5 whitespace-pre-line text-sm leading-relaxed text-white/60">{confirm.body}</p>
        {confirm.requireText !== undefined && (
          <input
            autoFocus
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={`"${confirm.requireText}" 입력`}
            className="mb-4 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm outline-none focus:border-[var(--orange)]"
          />
        )}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-white/60 hover:bg-white/5">
            취소
          </button>
          <button
            disabled={blocked}
            onClick={() => {
              confirm.onConfirm();
              onClose();
            }}
            className="rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-30"
            style={{ background: confirm.danger ? 'var(--live)' : 'var(--orange)', color: '#fff' }}
          >
            {confirm.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// PIN 입장
// ------------------------------------------------------------

function PinGate({ onSuccess }: { onSuccess: () => void }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin || busy) return;
    setBusy(true);
    setError('');
    try {
      await api('/api/admin/auth', { method: 'POST', body: JSON.stringify({ pin }) });
      onSuccess();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '로그인에 실패했습니다.');
      setPin('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <form onSubmit={submit} className="w-full max-w-xs text-center">
        <Wordmark className="mx-auto mb-2 h-2.5 w-auto text-[var(--orange)]" />
        <h1 className="mb-8 text-2xl font-extrabold">운영 콘솔</h1>
        <input
          autoFocus
          type="password"
          inputMode="numeric"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="운영 PIN"
          className="mb-3 w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-center text-lg tracking-[0.4em] outline-none focus:border-[var(--orange)]"
        />
        {error && <p className="mb-3 text-sm text-[var(--live)]">{error}</p>}
        <button
          disabled={busy || !pin}
          className="w-full rounded-xl bg-[var(--orange)] py-3 font-bold text-white disabled:opacity-40"
        >
          {busy ? '확인 중…' : '입장'}
        </button>
      </form>
    </main>
  );
}

// ------------------------------------------------------------
// 경기 진행 탭
// ------------------------------------------------------------

function teamLabel(team: Team | null, index: number | null): string {
  if (index === null) return '선정팀 대기';
  return team?.team || `팀 ${index + 1}`;
}

function TeamLine({ state, index, dimmed }: { state: AdminState; index: number | null; dimmed?: boolean }) {
  const team = index !== null ? state.teams[index] : null;
  return (
    <div className={`flex items-center gap-3 ${dimmed ? 'opacity-35' : ''}`}>
      <CharacterThumb characterKey={team?.character ?? null} size={34} />
      <div className="min-w-0">
        <div className="truncate text-sm font-bold">{teamLabel(team, index)}</div>
      </div>
    </div>
  );
}

function parseStoredFeedback(value: string | null): FeedbackSet {
  if (!value) return { good: '', improve: '', other: '' };
  try {
    const parsed = JSON.parse(value) as Partial<FeedbackSet>;
    return {
      good: typeof parsed.good === 'string' ? parsed.good : '',
      improve: typeof parsed.improve === 'string' ? parsed.improve : '',
      other: typeof parsed.other === 'string' ? parsed.other : '',
    };
  } catch {
    return { good: value, improve: '', other: '' };
  }
}

function VotesPanel({
  match,
  state,
  onReveal,
  readOnly = false,
}: {
  match: Match;
  state: AdminState;
  onReveal: (side: Side, tallyText: string) => void;
  readOnly?: boolean;
}) {
  const [votes, setVotes] = useState<VoteRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api<{ votes: VoteRow[] }>(`/api/admin/votes?matchId=${match.id}`);
      setVotes(res.votes);
      setFailed(false);
    } catch {
      setFailed(true); // 마지막 정상 집계 유지 (명세 §7)
    }
  }, [match.id]);

  useEffect(() => {
    // 첫 호출도 타이머로 미룬다 — react-hooks/set-state-in-effect (effect 본문 직접 setState 금지)
    const kickoff = setTimeout(load, 0);
    const timer = setInterval(load, 4000);
    return () => {
      clearTimeout(kickoff);
      clearInterval(timer);
    };
  }, [load]);

  const totals = (votes ?? []).reduce(
    (acc, vote) => {
      if (vote.scores) {
        acc.A += sideTotal(vote.scores, 'A');
        acc.B += sideTotal(vote.scores, 'B');
      }
      return acc;
    },
    { A: 0, B: 0 },
  );
  const submissions = votes?.filter((vote) => vote.scores !== null).length ?? 0;
  const averages = {
    A: submissions > 0 ? totals.A / submissions : 0,
    B: submissions > 0 ? totals.B / submissions : 0,
  };
  const tie = submissions > 0 && totals.A === totals.B;
  const aggregateWinner: Side = totals.A >= totals.B ? 'A' : 'B';
  const sideName = (side: Side) => {
    const index = side === 'A' ? match.a : match.b;
    return teamLabel(state.teams[index ?? -1] ?? null, index);
  };
  const tallyText = `현재 총점 ${sideName('A')} ${totals.A}점 · ${sideName('B')} ${totals.B}점${submissions === 0 ? ' (제출 없음 — 백업 모드)' : ''}`;

  return (
    <div className="mt-3 rounded-xl border border-white/10 bg-black/25 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-bold text-white/50">
          실시간 점수 집계 {votes === null ? '(불러오는 중…)' : `— 제출 ${votes.length}건`}
          {failed && <span className="ml-2 text-[var(--live)]">갱신 실패, 마지막 값 표시 중</span>}
        </span>
        <button onClick={load} className="rounded-md px-2 py-1 text-xs text-white/50 hover:bg-white/10">
          ↻ 새로고침
        </button>
      </div>

      {tie && (
        <div className="mb-2 rounded-lg border border-[var(--live)]/40 bg-[var(--live)]/10 px-3 py-2 text-xs font-bold text-[var(--live)]">
          동점 — 공개 연출용 우세 팀만 운영진 합의로 선택하세요. 라운드 진출은 전체 총점으로 따로 정해집니다.
        </div>
      )}

      <div className="mb-3 grid grid-cols-2 gap-2">
        {(['A', 'B'] as const).map((side) => {
          const index = side === 'A' ? match.a : match.b;
          const leading = submissions > 0 && totals[side] > totals[side === 'A' ? 'B' : 'A'];
          return (
            <div
              key={side}
              className="rounded-lg border p-2 text-center"
              style={{
                borderColor: leading ? 'var(--orange)' : 'rgba(255,255,255,0.1)',
                background: leading ? 'var(--orange-glow)' : 'transparent',
              }}
            >
              <div className="truncate text-xs text-white/60">
                {teamLabel(state.teams[index ?? -1] ?? null, index)}
              </div>
              <div className="text-xl font-extrabold" style={{ color: leading ? 'var(--orange)' : undefined }}>
                {totals[side]}
              </div>
              <div className="text-[11px] text-white/40">평균 {averages[side].toFixed(1)} / 100</div>
            </div>
          );
        })}
      </div>

      {!readOnly && (
        tie ? (
          <div className="mb-3 grid grid-cols-2 gap-2">
            {(['A', 'B'] as const).map((side) => (
              <button
                key={side}
                onClick={() => onReveal(side, tallyText)}
                className="rounded-md border border-[var(--live)]/40 bg-[var(--live)]/10 py-2 text-xs font-bold text-[var(--live)]"
              >
                우세 팀 수동 공개 · {sideName(side)}
              </button>
            ))}
          </div>
        ) : (
          <button
            disabled={submissions === 0}
            onClick={() => onReveal(aggregateWinner, tallyText)}
            className="mb-3 w-full rounded-md bg-[var(--orange)] py-2 text-xs font-bold text-white hover:opacity-90 disabled:opacity-25"
          >
            페어 우세 공개 · {sideName(aggregateWinner)}
          </button>
        )
      )}

      {!readOnly && <ProxyEntry match={match} state={state} onSubmitted={load} />}

      {votes && votes.length > 0 && (
        <ul className="space-y-1.5">
          {votes.map((v) => (
            <li key={v.judge_slug} className="rounded-lg bg-white/5 px-3 py-2 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <b>{v.name}</b>
                <span className="font-bold text-[var(--orange)]">
                  {sideName('A')} {v.scores ? sideTotal(v.scores, 'A') : 0}점 · {sideName('B')} {v.scores ? sideTotal(v.scores, 'B') : 0}점
                </span>
              </div>
              {v.scores && (
                <div className="mt-2 grid gap-1 sm:grid-cols-2">
                  {(['A', 'B'] as const).map((side) => {
                    const teamIndex = side === 'A' ? match.a : match.b;
                    const stored = parseStoredFeedback(side === 'A' ? v.feedback_a : v.feedback_b);
                    return (
                    <div key={side} className="rounded-md bg-black/20 p-2">
                      <p className="mb-1 font-bold text-white/60">
                        {teamLabel(state.teams[teamIndex ?? -1] ?? null, teamIndex)} 피드백
                      </p>
                      {[
                        ['잘한 점', stored.good],
                        ['개선하면 좋을 점', stored.improve],
                        ['기타 의견', stored.other],
                      ].map(([label, text]) => (
                        <p key={label} className="whitespace-pre-line text-white/55">
                          <b className="text-white/70">{label}</b> {text || '없음'}
                        </p>
                      ))}
                    </div>
                    );
                  })}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * 간사 대리 입력 — 집계 패널 안에서 심사위원 명의로 표를 대신 제출한다.
 * 심사 화면(/judge)의 대리 모드와 같은 서버 가드(proxyVote: 명단제·live·덮어쓰기)를 쓰되,
 * 운영자가 콘솔을 떠나 심사 페이지로 재입장하지 않게 하는 것이 목적 (8/19 운영 동선 결정).
 * 심사 카드 전체를 복제하지 않는다 — 팀·집계는 바로 위 패널에 이미 보인다.
 */
function ProxyEntry({
  match,
  state,
  onSubmitted,
}: {
  match: Match;
  state: AdminState;
  onSubmitted: () => void;
}) {
  const [name, setName] = useState('');
  const [scores, setScores] = useState<MatchScores>(() => emptyMatchScores());
  const [feedback, setFeedback] = useState<MatchFeedback>(() => emptyMatchFeedback());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  const teamLabelOf = (side: Side) => {
    const index = side === 'A' ? match.a : match.b;
    return teamLabel(state.teams[index ?? -1] ?? null, index);
  };

  const submit = async () => {
    if (!name || busy) return;
    setBusy(true);
    setError('');
    try {
      await action({ action: 'proxyVote', matchId: match.id, name, scores, feedback });
      setSaved(`${name} 명의로 저장됨 — 공개 전까지 다시 제출하면 덮어씁니다.`);
      setScores(emptyMatchScores());
      setFeedback(emptyMatchFeedback());
      onSubmitted(); // 집계·목록 즉시 갱신
    } catch (err) {
      setSaved('');
      setError(err instanceof Error ? err.message : '저장에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="mb-3 rounded-lg border border-white/10">
      <summary className="cursor-pointer px-3 py-2 text-xs font-bold text-white/50 hover:bg-white/5">
        간사 대리 입력 — 심사위원 대신 제출
      </summary>
      <div className="space-y-2 px-3 pb-3 pt-1">
        <div className="flex gap-2">
          <select
            value={name}
            onChange={(e) => { setName(e.target.value); setSaved(''); }}
            className="flex-1 rounded-lg border border-white/15 bg-black/30 px-2 py-2 text-xs outline-none"
          >
            <option value="">제출 명의 선택…</option>
            {state.judges.map((judge) => (
              <option key={judge} value={judge}>{judge}</option>
            ))}
          </select>
        </div>
        {(['A', 'B'] as const).map((side) => (
          <div key={side} className="rounded-lg border border-white/10 bg-black/20 p-2">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="truncate text-xs font-bold text-white/65">{teamLabelOf(side)}</p>
              <b className="text-xs text-[var(--orange)]">{sideTotal(scores, side)}점</b>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {CRITERIA.map((criterion, criterionIndex) => (
                <label key={criterion.key} className="text-[11px] text-white/45">
                  {(criterionIndex === 0 || CRITERIA[criterionIndex - 1].group !== criterion.group) && (
                    <span className="col-span-2 mb-1 block text-[11px] font-extrabold text-[var(--orange)]">
                      {criterion.group}
                    </span>
                  )}
                  <span className="flex items-center justify-between gap-2">
                    <span>{criterion.label}</span>
                    <b className="rounded bg-white/8 px-1.5 py-0.5 text-white/65">만점 {criterion.max}점</b>
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={criterion.max}
                    value={scores[side][criterion.key] || ''}
                    onChange={(e) => {
                      const next = Math.max(0, Math.min(criterion.max, Number(e.target.value) || 0));
                      setScores((prev) => ({ ...prev, [side]: { ...prev[side], [criterion.key]: next } }));
                    }}
                    className="mt-1 w-full rounded-md border border-white/15 bg-black/30 px-2 py-1.5 text-xs font-bold outline-none"
                  />
                </label>
              ))}
            </div>
            <div className="mt-2 space-y-1.5">
              {[
                ['good', '잘한 점'],
                ['improve', '개선하면 좋을 점'],
                ['other', '기타 의견'],
              ].map(([key, label]) => (
                <input
                  key={key}
                  value={feedback[side][key as keyof FeedbackSet]}
                  onChange={(e) =>
                    setFeedback((prev) => ({
                      ...prev,
                      [side]: { ...prev[side], [key]: e.target.value },
                    }))
                  }
                  placeholder={label}
                  maxLength={500}
                  className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-xs outline-none"
                />
              ))}
            </div>
          </div>
        ))}
        {error && <p className="text-xs text-[var(--live)]">{error}</p>}
        {saved && !error && <p className="text-xs text-[var(--done)]">✓ {saved}</p>}
        <button
          disabled={!name || busy}
          onClick={submit}
          className="w-full rounded-lg bg-[var(--orange)] py-2 text-xs font-bold text-white disabled:opacity-25"
        >
          {busy ? '저장 중…' : name ? `${name} 명의로 제출` : '명의를 선택하세요'}
        </button>
      </div>
    </details>
  );
}

const STATUS_LABEL = { ready: '대기', live: 'LIVE', done: '종료' } as const;

/* 라운드 타이머 UI 제거 (8/23 운영자 결정) — 타이머는 행사장 별도 화면이 송출한다.
   서버 쪽 타이머 상태·setTimer 액션은 남겨둔다 (외부 타이머 불발 시 UI 만 되살리면
   되는 백업 — lib/tournament.ts §6.2). */

/**
 * 수동 대진 — R1 총점 상위 4팀 중 R2-1 의 두 팀을 고르면 나머지가 R2-2.
 * 규정(§2) 기본은 랜덤 추첨 — 이 패널은 운영 재량용이고, 스크린 연출은 어느 쪽이든
 * 동일한 셔플 애니메이션이다 (무작위성의 출처만 다름).
 */
function ManualDraw({
  state,
  busy,
  onDraw,
}: {
  state: AdminState;
  busy: boolean;
  onDraw: (pairs: [[number, number], [number, number]], label: string) => void;
}) {
  const winners = topTeamsForRound(state, 1, 4);
  const [picked, setPicked] = useState<number[]>([]);
  if (winners.length !== 4) return null;

  const toggle = (n: number) =>
    setPicked((p) => (p.includes(n) ? p.filter((x) => x !== n) : p.length < 2 ? [...p, n] : p));
  const rest = winners.filter((n) => !picked.includes(n));
  const name = (n: number) => teamLabel(state.teams[n] ?? null, n);

  return (
    <div className="mb-3 rounded-xl border border-white/10 bg-black/20 p-3">
      <p className="mb-2 text-xs font-bold text-white/50">
        수동 대진 — <b className="text-white/75">R1 총점 상위 4팀 중 R2-1 에 붙일 두 팀</b>을 고르면 나머지가 R2-2 로 갑니다.
        (기본은 위의 🎲 랜덤 추첨 · 스크린 연출은 동일)
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {winners.map((n) => (
          <button
            key={n}
            disabled={busy}
            onClick={() => toggle(n)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-bold ${
              picked.includes(n)
                ? 'border-[var(--orange)] bg-[var(--orange-glow)] text-[var(--orange)]'
                : 'border-white/15 text-white/60'
            }`}
          >
            {name(n)}
          </button>
        ))}
        <button
          disabled={picked.length !== 2 || busy}
          onClick={() =>
            onDraw(
              [
                [picked[0], picked[1]],
                [rest[0], rest[1]],
              ],
              `R2-1: ${name(picked[0])} vs ${name(picked[1])}\nR2-2: ${name(rest[0])} vs ${name(rest[1])}`,
            )
          }
          className="rounded-lg border border-[var(--orange)]/50 px-3 py-1.5 text-xs font-bold text-[var(--orange)] hover:bg-[var(--orange-glow)] disabled:opacity-30"
        >
          이 대진으로 확정
        </button>
      </div>
    </div>
  );
}

function MatchCard({
  match,
  state,
  busy,
  onStart,
  onReveal,
  onAnnounce,
}: {
  match: Match;
  state: AdminState;
  busy: boolean;
  onStart: () => void;
  onReveal: (side: Side, tallyText: string) => void;
  onAnnounce: () => void;
}) {
  const resolved = match.a !== null && match.b !== null;
  const winnerIndex = match.winner === 'A' ? match.a : match.winner === 'B' ? match.b : null;

  return (
    <div
      className="rounded-2xl border bg-[var(--surface)] p-4"
      style={{
        borderColor:
          match.status === 'live' ? 'var(--live)' : match.status === 'done' ? 'rgba(52,199,89,0.35)' : 'var(--border)',
      }}
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="font-mono text-sm font-bold text-white/70">
          {match.round === 1 ? `${match.id.split('-')[1]}조` : match.id}
        </span>
        <span
          className={`rounded-full px-2.5 py-0.5 text-[11px] font-extrabold ${match.status === 'live' ? 'animate-pulse' : ''}`}
          style={{
            background:
              match.status === 'live' ? 'var(--live)' : match.status === 'done' ? 'rgba(52,199,89,0.15)' : 'rgba(255,255,255,0.07)',
            color: match.status === 'live' ? '#fff' : match.status === 'done' ? 'var(--done)' : 'rgba(255,255,255,0.5)',
          }}
        >
          {STATUS_LABEL[match.status]}
        </span>
      </div>

      <div className="space-y-2">
        <TeamLine state={state} index={match.a} />
        <TeamLine state={state} index={match.b} />
      </div>

      {match.status === 'ready' && (
        <button
          disabled={!resolved || busy}
          onClick={onStart}
          className="mt-3 w-full rounded-lg border border-[var(--orange)]/50 py-2 text-sm font-bold text-[var(--orange)] hover:bg-[var(--orange-glow)] disabled:cursor-not-allowed disabled:border-white/10 disabled:text-white/25"
        >
          {resolved ? '발표 시작' : '조 미확정'}
        </button>
      )}

      {(match.status === 'live' || match.status === 'done') && (
        <VotesPanel match={match} state={state} onReveal={onReveal} readOnly={match.status === 'done'} />
      )}

      {match.status === 'done' && winnerIndex !== null && (
        <div className="mt-3 rounded-lg bg-[rgba(52,199,89,0.1)] px-3 py-2 text-sm font-bold text-[var(--done)]">
          공개 우세 · {teamLabel(state.teams[winnerIndex] ?? null, winnerIndex)}
        </div>
      )}

      {match.status === 'done' && !isAnnounced(match) && (
        <div className="mt-2">
          <button
            disabled={busy}
            onClick={onAnnounce}
            className="w-full animate-pulse rounded-lg bg-[var(--orange)] py-2 text-sm font-extrabold text-white disabled:opacity-40"
          >
            코멘트 끝 — 순위 보기
          </button>
          <p className="mt-1 text-[11px] text-white/40">
            스크린은 표 카드 정지 화면입니다. 심사위원 코멘트가 끝나면 누르세요.
          </p>
        </div>
      )}
    </div>
  );
}

function MatchesTab({
  state,
  busy,
  run,
  askConfirm,
}: {
  state: AdminState;
  busy: boolean;
  run: (payload: Record<string, unknown>) => void;
  askConfirm: (c: Confirm) => void;
}) {
  const r1 = state.matches.filter((m) => m.round === 1);
  const canShowFinalRanking = r1.every((m) => m.status === 'done');
  const live = state.matches.find((m) => m.status === 'live');

  const startWithGuard = (match: Match) => {
    if (live && live.id !== match.id) {
      askConfirm({
        title: `${match.id.split('-')[1] ?? match.id}조 발표 시작`,
        body: `${live.id} 가 진행 중입니다.\n이 조를 시작하면 ${live.id} 는 대기로 돌아갑니다 (제출된 표는 유지).`,
        confirmLabel: '시작',
        onConfirm: () => run({ action: 'startMatch', matchId: match.id }),
      });
    } else {
      run({ action: 'startMatch', matchId: match.id });
    }
  };

  // 발표 (2단계 공개의 2단계) — R1·R2 전용. 이미 공개된 결과의 송출 타이밍일 뿐이라
  // 진행 속도 우선으로 즉시. 결선은 발표 단계 자체가 없다 (공개 즉시 발표, 결선 특례)
  const announceMatch = (match: Match) => {
    run({ action: 'announceResult', matchId: match.id });
  };

  const revealWithConfirm = (match: Match) => (side: Side, tallyText: string) => {
    const index = side === 'A' ? match.a : match.b;
    const name = teamLabel(state.teams[index ?? -1] ?? null, index);
    // 결선은 공개가 곧 발표 (결선 특례, 8/22 저녁 — MC 큐시트 카운트다운 대응):
    // 표 연출이 끝나면 우승 무대가 자동으로 뜬다는 걸 확인 창에서 못박는다
    askConfirm({
      title: match.id === 'F' ? '결선 공개 = 우승 발표' : '조 결과 공개',
      body:
        match.id === 'F'
          ? `「${name}」 우승으로 공개합니다.\n${tallyText}\n\n스크린에 5-4-3-2-1 카운트다운(6초)이 뜬 뒤 표 카드가 점점 빠르게 열리고 연출이 끝나면 우승 무대로 자동 전환됩니다. 되돌릴 수 없습니다.`
          : `「${name}」 쪽 총점 우세로 공개합니다.\n${tallyText}\n\n이 공개는 탈락 결정이 아니라 현재 순위 반영용입니다. 전체 순위는 모든 조의 총점으로 계산됩니다.`,
      confirmLabel: '공개 (되돌릴 수 없음)',
      danger: true,
      onConfirm: () => run({ action: 'revealResult', matchId: match.id, winner: side }),
    });
  };

  const section = (title: string, extra?: React.ReactNode) => (
    <div className="mb-3 mt-7 flex items-center justify-between first:mt-0">
      <h2 className="text-sm font-extrabold text-white/50">{title}</h2>
      {extra}
    </div>
  );

  return (
    <div>
      {state.trackWarnings.length > 0 && (
        <div className="mb-4 rounded-xl border border-yellow-500/40 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-300">
          ⚠ 트랙 불일치: {state.trackWarnings.join(', ')} — 라운드 1 은 같은 트랙끼리입니다 (규정 §2). 팀 관리에서 순서를
          조정하세요.
        </div>
      )}

      {section(
        '조별 발표',
        <button
          disabled={!canShowFinalRanking || busy || state.finalRankingShown}
          onClick={() =>
            askConfirm({
              title: '최종 결과 보기',
              body: '모든 조의 총점 기준 최종 LIVE RANKING 화면을 스크린에 띄웁니다.',
              confirmLabel: '최종 결과 보기',
              onConfirm: () => run({ action: 'showFinalRanking' }),
            })
          }
          className="rounded-lg bg-[var(--orange)] px-4 py-1.5 text-sm font-bold text-white disabled:opacity-25"
        >
          {state.finalRankingShown ? '최종 결과 표시 중' : '최종 결과 보기'}
        </button>,
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {r1.map((m) => (
          <MatchCard key={m.id} match={m} state={state} busy={busy} onStart={() => startWithGuard(m)} onReveal={revealWithConfirm(m)} onAnnounce={() => announceMatch(m)} />
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// 팀 관리 탭
// ------------------------------------------------------------

function CharacterPicker({
  current,
  usedBy,
  onPick,
  onClose,
}: {
  current: string | null;
  usedBy: Map<string, number>;
  onPick: (key: string) => void;
  onClose: () => void;
}) {
  const keys = Array.from({ length: 8 }, (_, i) => `team_${String(i + 1).padStart(2, '0')}`);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="max-h-[80dvh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-[var(--surface)] p-4 xl:max-w-4xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-3 text-sm font-bold text-white/70">팀 카드 이미지 선택</h3>
        <div className="grid grid-cols-5 gap-2 sm:grid-cols-8 xl:grid-cols-10">
          {keys.map((key) => {
            const owner = usedBy.get(key);
            const name = `${owner !== undefined ? owner + 1 : Number(key.slice(-2))}팀`;
            return (
              <button
                key={key}
                onClick={() => onPick(key)}
                className="relative aspect-[2/3] overflow-hidden rounded-lg border transition-transform hover:scale-105"
                style={{ borderColor: key === current ? 'var(--orange)' : 'rgba(255,255,255,0.1)' }}
                title={owner !== undefined ? `${name} — 팀 ${owner + 1} 사용 중` : name}
              >
                <Image src={characterImageSrc(key)} alt={key} fill sizes="90px" className="object-cover" />
                {owner !== undefined && (
                  <span className="absolute bottom-0 inset-x-0 bg-black/70 text-[9px] font-bold text-[var(--orange)]">
                    팀{owner + 1}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function TeamsTab({
  state,
  busy,
  run,
}: {
  state: AdminState;
  busy: boolean;
  run: (payload: Record<string, unknown>) => void;
}) {
  // 행별 임시 편집본. 저장 전까지 폴링이 덮어쓰지 않도록 draft 를 우선한다.
  const [drafts, setDrafts] = useState<Record<number, Partial<Team>>>({});
  const [picking, setPicking] = useState<number | null>(null);

  const value = (i: number): Team => ({ ...state.teams[i], ...drafts[i] });
  const edit = (i: number, patch: Partial<Team>) =>
    setDrafts((d) => ({ ...d, [i]: { ...d[i], ...patch } }));
  const dirty = (i: number) => drafts[i] !== undefined;

  const save = (i: number) => {
    const patch = drafts[i];
    if (!patch) return;
    run({ action: 'updateTeam', index: i, patch });
    setDrafts((d) => {
      const next = { ...d };
      delete next[i];
      return next;
    });
  };

  const usedBy = new Map<string, number>();
  state.teams.forEach((t, i) => {
    const key = drafts[i]?.character ?? t.character;
    if (key) usedBy.set(key, i);
  });

  return (
    <div>
      <p className="mb-4 rounded-xl bg-white/5 px-4 py-3 text-xs leading-relaxed text-white/50">
        팀 순서가 곧 R1 대진입니다: 1–2 / 3–4 / 5–6 / 7–8 이 각각 맞붙습니다.
        팀명과 캐릭터만 확인하세요.
      </p>

      <div className="space-y-2">
        {state.teams.map((_, i) => {
          const t = value(i);
          return (
            <div key={i} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-[var(--surface)] p-3">
              <span className="w-6 text-center font-mono text-sm text-white/40">{i + 1}</span>
              <button onClick={() => setPicking(i)} title="캐릭터 선택">
                <CharacterThumb characterKey={t.character} size={40} />
              </button>
              <input
                value={t.team}
                onChange={(e) => edit(i, { team: e.target.value })}
                placeholder="팀명"
                maxLength={40}
                className="w-40 flex-1 rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm outline-none focus:border-[var(--orange)]"
              />
              <button
                disabled={!dirty(i) || busy}
                onClick={() => save(i)}
                className="rounded-lg bg-[var(--orange)] px-4 py-2 text-sm font-bold text-white disabled:opacity-20"
              >
                저장
              </button>
            </div>
          );
        })}
      </div>

      {picking !== null && (
        <CharacterPicker
          current={value(picking).character}
          usedBy={usedBy}
          onPick={(key) => {
            edit(picking, { character: key });
            setPicking(null);
          }}
          onClose={() => setPicking(null)}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------
// 설정 탭
// ------------------------------------------------------------

function SettingsTab({
  state,
  busy,
  run,
  askConfirm,
}: {
  state: AdminState;
  busy: boolean;
  run: (payload: Record<string, unknown>) => void;
  askConfirm: (c: Confirm) => void;
}) {
  const [judgeCode, setJudgeCode] = useState(state.judgeCode);
  const [pin, setPin] = useState('');
  const [judgeName, setJudgeName] = useState('');
  const [clearTeams, setClearTeams] = useState(false);

  const card = 'rounded-2xl border border-white/10 bg-[var(--surface)] p-5';
  const input =
    'rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm outline-none focus:border-[var(--orange)]';
  const btn = 'rounded-lg bg-[var(--orange)] px-4 py-2 text-sm font-bold text-white disabled:opacity-25';

  return (
    <div className="space-y-4 xl:max-w-2xl">
      <div className={card}>
        <h2 className="mb-1 font-bold">심사위원 명단</h2>
        <p className="mb-3 text-xs text-white/45">
          명단에 없는 명의의 제출은 서버가 거부합니다. 동명이인은 구분자를 붙여 등록하세요 (예: 김OO A).
        </p>
        <div className="mb-3 flex gap-2">
          <input
            value={judgeName}
            onChange={(e) => setJudgeName(e.target.value)}
            placeholder="심사위원 이름"
            maxLength={30}
            className={`${input} flex-1`}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && judgeName.trim()) {
                run({ action: 'addJudge', name: judgeName });
                setJudgeName('');
              }
            }}
          />
          <button
            disabled={busy || !judgeName.trim()}
            onClick={() => {
              run({ action: 'addJudge', name: judgeName });
              setJudgeName('');
            }}
            className={btn}
          >
            추가
          </button>
        </div>
        {state.judges.length === 0 ? (
          <p className="text-sm text-white/35">아직 등록된 심사위원이 없습니다. 등록 전에는 어떤 제출도 받지 않습니다.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {state.judges.map((name) => (
              <li key={name} className="flex items-center gap-2 rounded-full bg-white/8 py-1 pl-3 pr-1 text-sm">
                {name}
                <button
                  onClick={() =>
                    askConfirm({
                      title: '심사위원 삭제',
                      body: `"${name}" 을 명단에서 삭제합니다. 이미 제출한 표는 유지됩니다.`,
                      confirmLabel: '삭제',
                      danger: true,
                      onConfirm: () => run({ action: 'removeJudge', name }),
                    })
                  }
                  className="grid h-6 w-6 place-items-center rounded-full text-white/40 hover:bg-white/10 hover:text-white"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={card}>
        <h2 className="mb-3 font-bold">심사 코드</h2>
        <div className="flex gap-2">
          <input value={judgeCode} onChange={(e) => setJudgeCode(e.target.value)} maxLength={30} className={`${input} flex-1`} />
          <button
            disabled={busy || !judgeCode.trim() || judgeCode.trim() === state.judgeCode}
            onClick={() => run({ action: 'setJudgeCode', code: judgeCode })}
            className={btn}
          >
            변경
          </button>
        </div>
        <p className="mt-2 text-xs text-white/45">현재: <b className="text-white/70">{state.judgeCode}</b> · 대소문자 무시 비교</p>
      </div>

      <div className={card}>
        <h2 className="mb-3 font-bold">운영 PIN</h2>
        <div className="flex gap-2">
          <input
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="새 PIN (6자리 이상 권장)"
            maxLength={30}
            className={`${input} flex-1`}
          />
          <button
            disabled={busy || pin.trim().length === 0}
            onClick={() =>
              askConfirm({
                title: '운영 PIN 변경',
                body: '변경 즉시 다른 운영자의 세션이 전부 무효화됩니다 (본인 세션은 유지).\n행사 전에 저장소 초기값에서 반드시 바꿔두세요.',
                confirmLabel: '변경',
                onConfirm: () => {
                  run({ action: 'setAdminPin', pin });
                  setPin('');
                },
              })
            }
            className={btn}
          >
            변경
          </button>
        </div>
      </div>

      <div className={card}>
        <h2 className="mb-1 font-bold">리허설 점프</h2>
        <p className="mb-3 text-xs leading-relaxed text-white/45">
          경기 상태를 지우고 선택한 시점으로 바로 이동합니다 (8/24 — 리허설 중 실수해도
          전체 초기화 없이 재시작). 지나가는 경기는 전부 A 우세·표 0건으로 채워지고,
          팀 · 심사위원 명단 · 코드는 유지됩니다. 심사 제출 기록은 삭제됩니다.
        </p>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ['pre', '시작 전'],
              ['r1-live', 'R1-1 진행 중'],
              ['r1-done', 'R1 완료 · 추첨 대기'],
              ['drawn', 'R2 대진 확정'],
              ['r2-done', 'R2 완료'],
              ['final-live', '결선 진행 중'],
              ['champion', '우승 확정'],
            ] as const
          ).map(([stage, label]) => (
            <button
              key={stage}
              disabled={busy}
              onClick={() =>
                askConfirm({
                  title: `리허설 점프 — ${label}`,
                  body: `현재 경기 진행과 심사 제출이 삭제되고 "${label}" 시점으로 이동합니다.\n(팀·명단·코드는 유지)`,
                  confirmLabel: '이동',
                  danger: true,
                  onConfirm: () => run({ action: 'seekStage', stage }),
                })
              }
              className={btn}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className={`${card} border-[var(--live)]/30`}>
        <h2 className="mb-1 font-bold text-[var(--live)]">전체 초기화</h2>
        <p className="mb-3 text-xs leading-relaxed text-white/45">
          모든 경기 진행 상황과 심사 제출 기록을 삭제합니다. 리허설 후 본 행사 전에 사용하세요.
          <br />
          심사 코드 · PIN · 심사위원 명단은 유지됩니다.
        </p>
        <label className="mb-3 flex items-center gap-2 text-sm text-white/60">
          <input type="checkbox" checked={clearTeams} onChange={(e) => setClearTeams(e.target.checked)} />
          팀 명단도 비우기 (리허설용 더미였을 때)
        </label>
        <button
          disabled={busy}
          onClick={() =>
            askConfirm({
              title: '전체 초기화',
              body: '브래킷 진행 상황과 모든 심사 제출이 삭제됩니다.\n되돌릴 수 없습니다. 확인 문구를 입력하세요.',
              confirmLabel: '초기화 실행',
              danger: true,
              requireText: '초기화',
              onConfirm: () => run({ action: 'reset', clearTeams }),
            })
          }
          className="rounded-lg bg-[var(--live)] px-4 py-2 text-sm font-bold text-white disabled:opacity-25"
        >
          전체 초기화
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// 메인
// ------------------------------------------------------------

const TABS = [
  { key: 'matches', label: '경기 진행' },
  { key: 'teams', label: '팀 관리' },
  { key: 'settings', label: '설정' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

export default function AdminPage() {
  const [authed, setAuthed] = useState<boolean | null>(null); // null = 확인 중
  const [state, setState] = useState<AdminState | null>(null);
  const [tab, setTab] = useState<TabKey>('matches');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const revRef = useRef(0);

  const apply = useCallback((next: AdminState) => {
    noteServerNow(next.now); // 시계 편차 갱신 — rev 가드보다 먼저 (낡은 스냅샷도 시각은 유효)
    if (next.rev < revRef.current) return; // 낡은 스냅샷 무시 (명세 §4.1)
    revRef.current = next.rev;
    setState(next);
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await api<{ state: AdminState }>('/api/admin/state');
      apply(res.state);
      setAuthed(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setAuthed(false);
      // 그 외(네트워크 등)는 마지막 정상 스냅샷 유지
    }
  }, [apply]);

  useEffect(() => {
    const kickoff = setTimeout(load, 0);
    return () => clearTimeout(kickoff);
  }, [load]);

  // 폴링 4초 — 다른 운영자·심사 제출 반영. 액션 응답이 1차, 폴링은 보조.
  useEffect(() => {
    if (!authed) return;
    const timer = setInterval(load, 4000);
    return () => clearInterval(timer);
  }, [authed, load]);

  const run = useCallback(
    async (payload: Record<string, unknown>) => {
      setBusy(true);
      setError('');
      try {
        const res = await action(payload);
        apply(res.state);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          setAuthed(false);
        } else {
          setError(err instanceof Error ? err.message : '요청에 실패했습니다.');
        }
      } finally {
        setBusy(false);
      }
    },
    [apply],
  );

  if (authed === null) {
    return <main className="grid min-h-dvh place-items-center text-white/40">불러오는 중…</main>;
  }
  if (!authed) {
    return <PinGate onSuccess={load} />;
  }
  if (!state) {
    return <main className="grid min-h-dvh place-items-center text-white/40">상태를 불러오는 중…</main>;
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6 xl:max-w-6xl xl:px-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <Wordmark className="mb-0.5 h-2.5 w-auto text-[var(--orange)]" />
          <h1 className="text-xl font-extrabold xl:text-2xl">운영 콘솔</h1>
        </div>
        <div className="flex items-center gap-3 text-xs text-white/40">
          <span>rev {state.rev}</span>
          <button
            onClick={async () => {
              await api('/api/admin/auth', { method: 'DELETE' }).catch(() => {});
              setAuthed(false);
            }}
            className="rounded-lg border border-white/15 px-3 py-1.5 hover:bg-white/5"
          >
            로그아웃
          </button>
        </div>
      </header>

      {error && (
        <div
          className="mb-4 flex items-center justify-between rounded-xl border border-[var(--live)]/40 bg-[var(--live)]/10 px-4 py-3 text-sm text-[var(--live)]"
          role="alert"
        >
          <span>{error}</span>
          <button onClick={() => setError('')} className="ml-3 font-bold">
            ×
          </button>
        </div>
      )}

      <nav className="mb-6 flex gap-1 rounded-xl bg-white/5 p-1 xl:max-w-xl">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="flex-1 rounded-lg py-2 text-sm font-bold transition-colors"
            style={
              tab === t.key
                ? { background: 'var(--orange)', color: '#fff' }
                : { color: 'rgba(255,255,255,0.5)' }
            }
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'matches' && <MatchesTab state={state} busy={busy} run={run} askConfirm={setConfirm} />}
      {tab === 'teams' && <TeamsTab state={state} busy={busy} run={run} />}
      {tab === 'settings' && <SettingsTab key={state.judgeCode} state={state} busy={busy} run={run} askConfirm={setConfirm} />}

      {confirm && <ConfirmDialog confirm={confirm} onClose={() => setConfirm(null)} />}
    </main>
  );
}
