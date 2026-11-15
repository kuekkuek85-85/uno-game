-- ════════════════════════════════════════════════════════════════
-- UNO 인간 vs 인간(PvP) — Supabase 스키마
-- 설계: docs/pvp-spec.md
-- Supabase SQL Editor 에 붙여넣고 실행하세요. (students 테이블이 이미 있어야 함)
-- ════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";

-- ── pvp_players: 대기 풀 / 접속 상태 ────────────────────────────
create table if not exists public.pvp_players (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references public.students(id) on delete set null,
  name text not null,
  status text not null default 'idle'
    check (status in ('idle', 'queued', 'in_game', 'ai_game')),
  room_id uuid,
  last_opponent uuid,
  last_seen timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- ── pvp_rooms: 한 판(공유 게임 상태) ────────────────────────────
create table if not exists public.pvp_rooms (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.pvp_players(id) on delete cascade,
  guest_id uuid references public.pvp_players(id) on delete set null,
  host_name text not null,
  guest_name text,
  status text not null default 'waiting'
    check (status in ('waiting', 'active', 'finished', 'abandoned')),
  state jsonb,
  turn_seat text check (turn_seat in ('host', 'guest')),
  winner_seat text check (winner_seat in ('host', 'guest')),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists pvp_rooms_waiting_idx
  on public.pvp_rooms (status, created_at);

-- ── pvp_matches: 결과 기록(순위는 v2) ──────────────────────────
create table if not exists public.pvp_matches (
  id uuid primary key default gen_random_uuid(),
  room_id uuid,
  winner_student_id uuid,
  loser_student_id uuid,
  winner_name text,
  loser_name text,
  played_at timestamptz not null default now()
);

-- ════════════════════════════════════════════════════════════════
-- 매칭 RPC: "열린 방" 모델 + 전역 자문 잠금으로 동시성 안전
--   - 들어갈 수 있는 가장 오래된 대기 방(FIFO, 직전 상대 회피)에 guest로 입장
--   - 없으면 내가 대기 방(host)을 만든다
--   초기 게임 상태(state)는 guest 클라이언트가 채운다(JS 엔진 사용).
-- ════════════════════════════════════════════════════════════════
create or replace function public.pvp_request_match(p_player uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me       public.pvp_players%rowtype;
  room     public.pvp_rooms%rowtype;
  new_room public.pvp_rooms%rowtype;
begin
  -- 매칭을 전역 직렬화(한 반 규모엔 충분)
  perform pg_advisory_xact_lock(428941);

  select * into me from public.pvp_players where id = p_player;
  if not found then
    return jsonb_build_object('error', 'player_not_found');
  end if;

  -- 내가 이미 걸어둔 대기 방이 있으면 정리
  update public.pvp_rooms
     set status = 'abandoned'
   where host_id = p_player and status = 'waiting';

  -- 1) 들어갈 수 있는 가장 오래된 대기 방 (직전 상대 회피)
  select * into room
    from public.pvp_rooms r
   where r.status = 'waiting'
     and r.host_id <> p_player
     and (me.last_opponent is null or r.host_id <> me.last_opponent)
   order by r.created_at asc
   limit 1;

  -- 회피 조건 때문에 없을 수도 있으니, 그땐 조건 완화해서 재시도
  if not found then
    select * into room
      from public.pvp_rooms r
     where r.status = 'waiting'
       and r.host_id <> p_player
     order by r.created_at asc
     limit 1;
  end if;

  if found then
    -- guest 로 입장 + 게임 활성화 (state 는 guest 가 채움)
    update public.pvp_rooms
       set guest_id = p_player,
           guest_name = me.name,
           status = 'active',
           updated_at = now()
     where id = room.id;

    update public.pvp_players
       set status = 'in_game', room_id = room.id, last_opponent = room.host_id
     where id = p_player;
    update public.pvp_players
       set status = 'in_game', room_id = room.id, last_opponent = p_player
     where id = room.host_id;

    return jsonb_build_object(
      'role', 'guest', 'room_id', room.id,
      'opponent_name', room.host_name, 'waiting', false
    );
  else
    -- 대기 방 생성(host)
    insert into public.pvp_rooms (host_id, host_name, status)
    values (p_player, me.name, 'waiting')
    returning * into new_room;

    update public.pvp_players
       set status = 'queued', room_id = new_room.id
     where id = p_player;

    return jsonb_build_object(
      'role', 'host', 'room_id', new_room.id, 'waiting', true
    );
  end if;
end;
$$;

-- ── RLS (수업용 간이 정책) ──────────────────────────────────────
alter table public.pvp_players enable row level security;
alter table public.pvp_rooms   enable row level security;
alter table public.pvp_matches enable row level security;

drop policy if exists "pvp_players all" on public.pvp_players;
drop policy if exists "pvp_rooms all"   on public.pvp_rooms;
drop policy if exists "pvp_matches read"   on public.pvp_matches;
drop policy if exists "pvp_matches insert" on public.pvp_matches;

create policy "pvp_players all" on public.pvp_players
  for all using (true) with check (true);
create policy "pvp_rooms all" on public.pvp_rooms
  for all using (true) with check (true);
create policy "pvp_matches read"   on public.pvp_matches for select using (true);
create policy "pvp_matches insert" on public.pvp_matches for insert with check (true);

grant execute on function public.pvp_request_match(uuid) to anon, authenticated;

-- ── Realtime 활성화 ─────────────────────────────────────────────
-- (이미 추가돼 있으면 에러가 날 수 있으니 무시해도 됩니다)
do $$
begin
  alter publication supabase_realtime add table public.pvp_rooms;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.pvp_players;
exception when duplicate_object then null;
end $$;
