-- ============================================================
-- AI VIBETHON 본선 토너먼트 — 스키마
--
-- Supabase 대시보드 > SQL Editor 에 이 파일 전체를 붙여넣고 Run.
-- 여러 번 실행해도 안전합니다 (전부 if not exists).
-- ============================================================

-- ------------------------------------------------------------
-- 1. 전역 상태 — 단일 행 (명세 §4.1)
--
-- teams / matches / judgeCode / adminPin 을 통째로 jsonb 한 덩어리로 둔다.
-- 경기 하나를 바꿀 때 브래킷 전체가 원자적으로 함께 움직여야 해서,
-- 정규화하는 것보다 문서 하나를 통으로 교체하는 편이 안전하다.
--
-- rev 는 낙관적 잠금용. 서버는 UPDATE ... WHERE rev = <읽은 값> 으로 쓰고,
-- 0행이 갱신되면 누가 먼저 썼다는 뜻이므로 다시 읽어서 재시도한다.
-- ------------------------------------------------------------
create table if not exists public.tournament_state (
  id         smallint    primary key default 1 check (id = 1),
  data       jsonb       not null,
  rev        integer     not null default 1,
  updated_at timestamptz not null default now()
);

comment on table public.tournament_state is
  '토너먼트 전역 상태. id=1 단일 행만 존재. 앱이 최초 접근 시 기본 브래킷으로 생성한다.';

-- 초기 행은 여기서 넣지 않는다.
-- 8팀·7경기 초기 브래킷 모양은 lib/tournament.ts 에 정의돼 있고,
-- 서버가 첫 접근 때 그 값으로 생성한다. SQL 과 TS 두 곳에 두면 반드시 어긋난다.

-- ------------------------------------------------------------
-- 2. 심사 제출 — (경기, 심사위원 명의) 당 한 행 (명세 §4.2)
--
-- 명의별로 행을 분리해 동시 제출이 서로 덮어쓰지 않게 한다.
-- 같은 명의로 다시 내면 upsert 로 덮어쓰기 = 재제출 (명세 §3).
-- ------------------------------------------------------------
create table if not exists public.votes (
  match_id   text        not null,
  judge_slug text        not null,
  name       text        not null,
  winner     text        not null check (winner in ('A', 'B')),
  scores     jsonb,
  feedback_a text,
  feedback_b text,
  comment    text,
  video_a    boolean     not null default false,
  video_b    boolean     not null default false,
  ts         bigint      not null,
  updated_at timestamptz not null default now(),
  primary key (match_id, judge_slug)
);

alter table public.votes add column if not exists scores jsonb;
alter table public.votes add column if not exists feedback_a text;
alter table public.votes add column if not exists feedback_b text;

comment on column public.votes.judge_slug is
  '심사위원 명의를 정규화한 키. 대리 입력 시에도 실제 심사위원 명의로 저장한다.';
comment on column public.votes.video_a is
  '라운드 2 전용 — A팀이 시연 장애로 영상 대체를 했는지 (명세 §2, 실현 가능성 20점 반영 근거).';

create index if not exists idx_votes_match on public.votes (match_id);

-- ------------------------------------------------------------
-- 3. RLS — 정책을 만들지 않아 anon / authenticated 는 전면 차단
--
-- 모든 읽기·쓰기는 service_role 키를 쓰는 Next.js API 라우트를 통해서만 이뤄진다.
-- service_role 은 RLS 를 우회하므로 별도 정책이 필요 없다.
-- 이렇게 하면 브라우저에 DB 키가 내려가지 않아, 참가자가 API 를 직접 두드려
-- 대진이나 표를 조작할 여지가 없다 (명세 §7).
-- ------------------------------------------------------------
alter table public.tournament_state enable row level security;
alter table public.votes            enable row level security;

-- ============================================================
-- 운영용 조회 (SQL Editor 에서 직접 실행)
-- ============================================================

-- 현재 브래킷 상태를 사람이 읽기 좋게
-- select
--   m ->> 'id'     as 경기,
--   m ->> 'status' as 상태,
--   m ->> 'winner' as 승자
-- from public.tournament_state,
--      jsonb_array_elements(data -> 'matches') as m
-- where id = 1;

-- 경기별 점수 집계
-- select match_id,
--        sum(
--          (scores #>> '{A,problem_clear}')::int + (scores #>> '{A,problem_value}')::int + (scores #>> '{A,problem_originality}')::int +
--          (scores #>> '{A,ai_effective}')::int + (scores #>> '{A,ai_core_value}')::int +
--          (scores #>> '{A,mvp_core}')::int + (scores #>> '{A,mvp_working}')::int +
--          (scores #>> '{A,presentation_clarity}')::int + (scores #>> '{A,presentation_demo}')::int +
--          (scores #>> '{A,feasibility_service}')::int + (scores #>> '{A,feasibility_growth}')::int
--        ) as a_total,
--        sum(
--          (scores #>> '{B,problem_clear}')::int + (scores #>> '{B,problem_value}')::int + (scores #>> '{B,problem_originality}')::int +
--          (scores #>> '{B,ai_effective}')::int + (scores #>> '{B,ai_core_value}')::int +
--          (scores #>> '{B,mvp_core}')::int + (scores #>> '{B,mvp_working}')::int +
--          (scores #>> '{B,presentation_clarity}')::int + (scores #>> '{B,presentation_demo}')::int +
--          (scores #>> '{B,feasibility_service}')::int + (scores #>> '{B,feasibility_growth}')::int
--        ) as b_total
-- from public.votes
-- group by match_id
-- order by match_id;

-- 영상 대체가 기록된 제출 (라운드 2 검토용)
-- select match_id, name, video_a, video_b, comment
-- from public.votes
-- where video_a or video_b;
