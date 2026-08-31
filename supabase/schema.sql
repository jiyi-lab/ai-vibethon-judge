-- ============================================================
-- AI VIBETHON 본선 토너먼트 — 스키마
--
-- Supabase 대시보드 > SQL Editor 에 이 파일 전체를 붙여넣고 Run.
-- 여러 번 실행해도 안전합니다 (전부 if not exists / or replace).
--
-- ------------------------------------------------------------
-- 왜 public 이 아니라 vibethon 스키마인가 (2026-08-31)
-- ------------------------------------------------------------
-- 무료 플랜은 활성 프로젝트 2개가 계정 전체 한도라, 이 앱을 **다른 용도로 쓰던
-- 기존 프로젝트에 얹는다**. 그래서 두 가지를 분리한다.
--
--   1. 스키마 분리 — 이 앱의 테이블은 vibethon 스키마 안에만 산다.
--      호스트 프로젝트의 public 테이블과 이름이 겹칠 일도, 섞일 일도 없다.
--
--   2. 권한 분리 — 앱은 service_role 이 아니라 **vibethon_app 전용 role** 로 붙는다.
--      service_role 은 그 프로젝트 DB 전체의 마스터 키다. 그 키를 이 앱과
--      Vercel 환경변수에 넣는 순간, 행사 앱이 뚫리면 호스트 프로젝트 데이터까지
--      열린다. vibethon_app 은 vibethon 스키마 밖으로는 아무것도 못 본다 —
--      스키마만 나누는 것으로는 권한이 1도 줄지 않으므로 이쪽이 본체다.
--
-- 적용 순서
--   ① 이 파일을 SQL Editor 에서 Run
--   ② 대시보드 Settings > API > Exposed schemas 에 `vibethon` 추가
--      (PostgREST 가 서빙할 스키마 목록. 추가해도 grant 없는 role 은 여전히 못 읽는다)
--   ③ node scripts/mint-supabase-key.mjs 로 vibethon_app 키 발급 → Vercel 환경변수
-- ============================================================

create schema if not exists vibethon;

-- ------------------------------------------------------------
-- 0. 전용 role — 이 앱이 DB 에 붙을 때 쓰는 유일한 신분
--
-- NOLOGIN 이다: 직접 접속용이 아니라 PostgREST 가 JWT 의 role 클레임을 보고
-- SET ROLE 로 갈아타기 위한 role 이라 비밀번호가 필요 없다. 그래서
-- authenticator(PostgREST 접속 role)에 이 role 을 grant 해야 갈아탈 수 있다.
--
-- public 스키마에는 아무 권한도 주지 않는다. Postgres 기본값이 public 스키마에
-- USAGE 를 주긴 하지만 테이블 권한은 따로 grant 해야 읽히므로, 호스트 프로젝트의
-- 테이블은 목록조차 의미가 없다. anon / authenticated / service_role 중 어느
-- 그룹에도 넣지 않는다.
-- ------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'vibethon_app') then
    create role vibethon_app nologin;
  end if;
end
$$;

grant vibethon_app to authenticator;
grant usage on schema vibethon to vibethon_app;

comment on schema vibethon is
  'AI VIBETHON 토너먼트 운영 도구 전용. 호스트 프로젝트의 public 과 무관하다.';

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
create table if not exists vibethon.tournament_state (
  id         smallint    primary key default 1 check (id = 1),
  data       jsonb       not null,
  rev        integer     not null default 1,
  updated_at timestamptz not null default now()
);

comment on table vibethon.tournament_state is
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
create table if not exists vibethon.votes (
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

alter table vibethon.votes add column if not exists scores jsonb;
alter table vibethon.votes add column if not exists feedback_a text;
alter table vibethon.votes add column if not exists feedback_b text;

comment on column vibethon.votes.judge_slug is
  '심사위원 명의를 정규화한 키. 대리 입력 시에도 실제 심사위원 명의로 저장한다.';
comment on column vibethon.votes.video_a is
  '라운드 2 전용 — A팀이 시연 장애로 영상 대체를 했는지 (명세 §2, 실현 가능성 20점 반영 근거).';

create index if not exists idx_votes_match on vibethon.votes (match_id);

-- ------------------------------------------------------------
-- 3. 권한 — 두 테이블에 대해서만, vibethon_app 에게만
--
-- 여기 적히지 않은 role 은 이 스키마를 못 읽는다. 특히 anon / authenticated 는
-- 아무 권한도 받지 않으므로, Exposed schemas 에 vibethon 이 올라가 있어도
-- 브라우저에서 publishable 키로 두드릴 수 있는 게 없다.
-- ------------------------------------------------------------
grant select, insert, update, delete on vibethon.tournament_state to vibethon_app;
grant select, insert, update, delete on vibethon.votes            to vibethon_app;

-- ------------------------------------------------------------
-- 4. RLS — 이중 잠금
--
-- 위 grant 만으로도 다른 role 은 못 읽지만, RLS 를 켜두면 나중에 누가 실수로
-- anon 에 grant 를 주더라도 행 단위에서 한 번 더 막힌다.
-- vibethon_app 은 BYPASSRLS 가 없는 평범한 role 이라 명시적 정책이 필요하다.
-- (service_role 로 붙는 경우에는 BYPASSRLS 라 정책과 무관하게 통과한다)
-- ------------------------------------------------------------
alter table vibethon.tournament_state enable row level security;
alter table vibethon.votes            enable row level security;

drop policy if exists vibethon_app_all on vibethon.tournament_state;
create policy vibethon_app_all on vibethon.tournament_state
  for all to vibethon_app using (true) with check (true);

drop policy if exists vibethon_app_all on vibethon.votes;
create policy vibethon_app_all on vibethon.votes
  for all to vibethon_app using (true) with check (true);

-- ============================================================
-- 운영용 조회 (SQL Editor 에서 직접 실행)
-- ============================================================

-- 현재 브래킷 상태를 사람이 읽기 좋게
-- select
--   m ->> 'id'     as 경기,
--   m ->> 'status' as 상태,
--   m ->> 'winner' as 승자
-- from vibethon.tournament_state,
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
-- from vibethon.votes
-- group by match_id
-- order by match_id;

-- 행사 뒤 정리 — 이 앱의 흔적만 통째로 지운다 (호스트 프로젝트는 그대로)
-- drop schema vibethon cascade;
-- revoke vibethon_app from authenticator;
-- drop role vibethon_app;
