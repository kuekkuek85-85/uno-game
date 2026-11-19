-- ════════════════════════════════════════════════════════════════
-- UNO 다인원(3인) 대전 — Supabase 스키마
-- 1:1 대전(pvp_schema.sql)과 별도. pvp_players(대기 풀/하트비트)는 공유한다.
-- Supabase SQL Editor 에 붙여넣고 실행하세요. (pvp_schema.sql 이 먼저 실행돼 있어야 함)
-- 여러 번 실행해도 안전합니다.
-- ════════════════════════════════════════════════════════════════

create table if not exists public.pvp_multi_rooms (
  id uuid primary key default gen_random_uuid(),
  capacity int not null default 3 check (capacity between 2 and 4),
  status text not null default 'waiting'
    check (status in ('waiting', 'active', 'finished', 'abandoned')),
  -- 좌석 순서대로 [{ "id": player_id, "name": 이름 }]
  players jsonb not null default '[]'::jsonb,
  state jsonb,
  -- 낙관적 동시성 제어용(수를 둘 때마다 +1)
  version int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pvp_multi_rooms_waiting_idx
  on public.pvp_multi_rooms (status, capacity, created_at);

-- ── 하트비트(서버 시계로 기록 — 학생 기기 시계가 틀려도 정확) ──
create or replace function public.pvp_heartbeat(p_player uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.pvp_players set last_seen = now() where id = p_player;
$$;

-- ── 공통: 대기 방에서 응답 없는(하트비트 12초 끊긴) 사람 제거 ──
create or replace function public.pvp_multi_prune(p_room uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.pvp_multi_rooms r
     set players = (
       select coalesce(jsonb_agg(e order by ord), '[]'::jsonb)
         from jsonb_array_elements(r.players) with ordinality as t(e, ord)
        where exists (
          select 1 from public.pvp_players hp
           where hp.id = (e->>'id')::uuid
             and hp.last_seen > now() - interval '12 seconds'
        )
     )
   where r.status = 'waiting'
     and (p_room is null or r.id = p_room);
$$;

-- ── 입장(매칭): 같은 정원의 가장 오래된 대기 방에 들어가거나 새로 만든다 ──
create or replace function public.pvp_multi_join(p_player uuid, p_capacity int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me   public.pvp_players%rowtype;
  room public.pvp_multi_rooms%rowtype;
begin
  perform pg_advisory_xact_lock(428942);

  select * into me from public.pvp_players where id = p_player;
  if not found then
    return jsonb_build_object('error', 'player_not_found');
  end if;

  -- 내가 이미 들어가 있던 대기 방에서는 빠진다(재입장)
  update public.pvp_multi_rooms
     set players = (
       select coalesce(jsonb_agg(e order by ord), '[]'::jsonb)
         from jsonb_array_elements(players) with ordinality as t(e, ord)
        where e->>'id' <> p_player::text
     )
   where status = 'waiting'
     and players @> jsonb_build_array(jsonb_build_object('id', p_player::text));

  -- 응답 없는 사람 제거 + 빈 방/너무 오래된 방 정리
  perform public.pvp_multi_prune(null);
  update public.pvp_multi_rooms
     set status = 'abandoned'
   where status = 'waiting'
     and (jsonb_array_length(players) = 0 or created_at < now() - interval '120 seconds');

  -- 자리가 남은 가장 오래된 같은 정원 대기 방
  select * into room
    from public.pvp_multi_rooms
   where status = 'waiting'
     and capacity = p_capacity
     and jsonb_array_length(players) < capacity
   order by created_at asc
   limit 1;

  if found then
    update public.pvp_multi_rooms
       set players = players || jsonb_build_array(
             jsonb_build_object('id', p_player::text, 'name', me.name)),
           status = case when jsonb_array_length(players) + 1 >= capacity
                         then 'active' else 'waiting' end,
           updated_at = now()
     where id = room.id
     returning * into room;
  else
    insert into public.pvp_multi_rooms (capacity, players)
    values (p_capacity, jsonb_build_array(
              jsonb_build_object('id', p_player::text, 'name', me.name)))
    returning * into room;
  end if;

  update public.pvp_players set status = 'queued', room_id = null where id = p_player;

  return jsonb_build_object('room_id', room.id, 'status', room.status);
end;
$$;

-- ── 15초 판정: 2명 이상이면 시작, 혼자면 AI 연습으로 (원자적) ──
--   반환: 'waiting' | 'active' | 'ai' | 'gone' | 그 외 현재 상태
create or replace function public.pvp_multi_tick(p_room uuid, p_player uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  room public.pvp_multi_rooms%rowtype;
begin
  perform pg_advisory_xact_lock(428942);
  perform public.pvp_multi_prune(p_room);

  select * into room from public.pvp_multi_rooms where id = p_room;
  if not found then return 'gone'; end if;
  if room.status <> 'waiting' then return room.status; end if;
  if not (room.players @> jsonb_build_array(jsonb_build_object('id', p_player::text))) then
    return 'gone';
  end if;
  if room.created_at > now() - interval '15 seconds' then return 'waiting'; end if;

  if jsonb_array_length(room.players) >= 2 then
    update public.pvp_multi_rooms set status = 'active', updated_at = now() where id = p_room;
    return 'active';
  end if;

  update public.pvp_multi_rooms set status = 'abandoned' where id = p_room;
  update public.pvp_players set status = 'ai_game' where id = p_player;
  return 'ai';
end;
$$;

-- ── 대기 중 나가기: 대기 방에서 빠진다(빈 방은 정리) ──
create or replace function public.pvp_multi_leave_wait(p_room uuid, p_player uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(428942);
  update public.pvp_multi_rooms
     set players = (
       select coalesce(jsonb_agg(e order by ord), '[]'::jsonb)
         from jsonb_array_elements(players) with ordinality as t(e, ord)
        where e->>'id' <> p_player::text
     )
   where id = p_room and status = 'waiting';
  update public.pvp_multi_rooms
     set status = 'abandoned'
   where id = p_room and status = 'waiting' and jsonb_array_length(players) = 0;
  update public.pvp_players set status = 'idle' where id = p_player;
end;
$$;

-- ── RLS (수업용 간이 정책) + 권한 ────────────────────────────────
alter table public.pvp_multi_rooms enable row level security;
drop policy if exists "pvp_multi_rooms all" on public.pvp_multi_rooms;
create policy "pvp_multi_rooms all" on public.pvp_multi_rooms
  for all using (true) with check (true);

grant execute on function public.pvp_heartbeat(uuid) to anon, authenticated;
grant execute on function public.pvp_multi_join(uuid, int) to anon, authenticated;
grant execute on function public.pvp_multi_tick(uuid, uuid) to anon, authenticated;
grant execute on function public.pvp_multi_leave_wait(uuid, uuid) to anon, authenticated;

-- ── Realtime ─────────────────────────────────────────────────────
do $$
begin
  alter publication supabase_realtime add table public.pvp_multi_rooms;
exception when duplicate_object then null;
end $$;
