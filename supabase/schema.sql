-- ════════════════════════════════════════════════════════════════
-- UNO vs AI — Supabase 스키마
-- Supabase 프로젝트 > SQL Editor 에 붙여넣고 실행하세요.
-- 스펙 2장(데이터 모델) 기준.
-- ════════════════════════════════════════════════════════════════

-- 확장: gen_random_uuid()
create extension if not exists "pgcrypto";

-- ── students ────────────────────────────────────────────────────
create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  student_no text not null,
  name text not null,
  created_at timestamptz not null default now(),
  unique (student_no, name)
);

-- ── matches ─────────────────────────────────────────────────────
create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  difficulty text not null check (difficulty in ('easy', 'normal', 'hard')),
  result text not null check (result in ('win', 'lose')),
  turns int,
  played_at timestamptz not null default now()
);

create index if not exists matches_student_id_idx on public.matches(student_id);

-- ── leaderboard 뷰 (가중 점수 집계) ─────────────────────────────
-- 승리 1판당: 쉬움 1 / 보통 2 / 어려움 3
create or replace view public.leaderboard as
select
  s.id as student_id,
  s.student_no,
  s.name,
  count(*) filter (where m.result = 'win') as total_wins,
  count(m.id) as total_games,
  coalesce(sum(case
        when m.result = 'win' and m.difficulty = 'easy'   then 1
        when m.result = 'win' and m.difficulty = 'normal' then 2
        when m.result = 'win' and m.difficulty = 'hard'   then 3
        else 0 end), 0) as score
from public.students s
left join public.matches m on m.student_id = s.id
group by s.id, s.student_no, s.name
order by score desc, total_wins desc;

-- ── RLS (수업용 간이 정책) ──────────────────────────────────────
-- 익명 키로 insert/select 허용. 엄격히 하려면 정책을 조정하세요.
alter table public.students enable row level security;
alter table public.matches  enable row level security;

drop policy if exists "students read"   on public.students;
drop policy if exists "students insert" on public.students;
drop policy if exists "matches read"    on public.matches;
drop policy if exists "matches insert"  on public.matches;

create policy "students read"   on public.students for select using (true);
create policy "students insert" on public.students for insert with check (true);
create policy "matches read"    on public.matches  for select using (true);
create policy "matches insert"  on public.matches  for insert with check (true);

-- 뷰 접근 권한 (anon/authenticated)
grant select on public.leaderboard to anon, authenticated;
