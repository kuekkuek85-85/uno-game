# UNO 인간 vs 인간(PvP) — 설계 문서 (SDD)

> 익명 1:1 온라인 대전. 접속 순서대로 매칭, 홀수는 AI와 하며 대기, 끝나면 풀로 복귀해 (직전 상대 제외) 랜덤 재매칭.
> 이 문서는 구현 전 합의를 위한 초안이다. 확정되면 단계별로 구현한다.

---

## 1. 목표 / 요구사항 (수업 상황)

- **익명**: 로그인 없이 기존처럼 학번·이름으로 입장. 상대에겐 이름만 표시.
- **접속 순서 매칭**: 먼저 대기 중인 사람과 1:1로 짝지음(FIFO).
- **홀수 처리**: 짝이 없으면 **AI와 한 판** 하며 대기. AI 판이 끝나면 다시 풀로.
- **재매칭**: 게임이 끝나면 **대기 풀로 복귀 → 랜덤 매칭**. 단, **직전 상대와는 바로 다시 붙지 않음**(가능하면 회피).
- **접속 시간대가 제각각**: 늦게 오는 친구도 들어오는 즉시 자연스럽게 풀에 합류.

### 비범위(v1 제외, 추후)
- 치팅 방지 강화(서버 권위 검증), 관전, 토너먼트, 전적 랭킹 세분화.

---

## 2. 전체 구조

게임 로직은 지금처럼 **클라이언트의 순수 엔진**(`src/game/*`)을 그대로 재사용한다. Supabase는 **매칭 + 상태 동기화**만 담당한다.

- **상태의 단일 출처 = DB 한 행**(`pvp_rooms.state` JSONB). 호스트 없이도 양쪽이 같은 행을 보고 두므로 **새로고침·재접속에 강함**.
- **동기화 = Supabase Realtime**(postgres_changes). 각 플레이어는 자기 방 행을 구독.
- **엔진 재사용**: `GameState`는 그대로 JSON 직렬화. PvP에선 슬롯을 이렇게 매핑한다.
  - `player` 슬롯 = **host**(방 만든 사람)
  - `ai` 슬롯 = **guest**(나중에 들어온 사람)
  - 각 클라이언트는 자기 좌석(`mySeat`)만 "내 손패"로 보여주고, 상대 손패는 장수만 노출. AI 판단 로직은 PvP에선 호출하지 않는다.

> 신뢰 모델: 수업용이라 **클라이언트 신뢰**(각자 자기 턴에 행을 갱신). 누구나 행을 쓸 수 있어 이론상 조작 가능하지만 수업엔 충분. 추후 RPC 검증으로 강화 가능.

---

## 3. 데이터 모델 (Supabase)

### `pvp_players` — 대기 풀 / 접속 상태
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid PK default gen_random_uuid() | |
| student_id | uuid (FK → students.id, nullable) | 익명 식별 |
| name | text | 표시용 이름 |
| status | text | 'idle' / 'queued' / 'in_game' / 'ai_game' |
| room_id | uuid (nullable) | 현재 방 |
| last_opponent | uuid (nullable) | 직전 상대 player id (회피용) |
| last_seen | timestamptz default now() | 하트비트 |
| created_at | timestamptz default now() | 접속 순서(FIFO 기준) |

### `pvp_rooms` — 한 판(공유 게임 상태)
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid PK | |
| host_id | uuid (→ pvp_players.id) | player 슬롯 |
| guest_id | uuid (nullable) | ai 슬롯 |
| host_name / guest_name | text | 표시용 |
| status | text | 'waiting' / 'active' / 'finished' / 'abandoned' |
| state | jsonb (nullable) | 직렬화된 GameState |
| turn_seat | text | 'host' / 'guest' — 현재 둘 차례(빠른 판정용) |
| winner_seat | text (nullable) | 'host' / 'guest' |
| updated_at | timestamptz default now() | 마지막 수 시각(턴 타이머용) |
| created_at | timestamptz default now() | |

### `pvp_matches` — 결과 기록(선택: 결정 필요)
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id, room_id, winner_student_id, loser_student_id, played_at | | PvP 전적 |

> 순위 반영 여부는 **열린 결정**(5장) 참고.

---

## 4. 매칭 알고리즘 ("열린 방" 모델)

서버 프로세스 없이 **Postgres RPC + 자문 잠금(advisory lock)**으로 동시성 안전하게 짝짓는다.

### RPC `pvp_request_match(player_id uuid)` (SECURITY DEFINER)
```text
lock = pg_advisory_xact_lock(42)   -- 매칭을 전역 직렬화(학급 규모엔 충분)
me = pvp_players[player_id]

-- 1) 들어갈 수 있는 가장 오래된 대기 방 찾기 (FIFO + 직전 상대 회피)
room = SELECT * FROM pvp_rooms
       WHERE status='waiting'
         AND host_id <> player_id
         AND host_id IS DISTINCT FROM me.last_opponent
       ORDER BY created_at ASC
       LIMIT 1

IF room FOUND:
   -- guest로 입장 + 게임 시작
   room.guest_id = player_id; room.guest_name = me.name
   room.status='active'
   room.state = <초기 GameState>     -- (아래 '게임 초기화' 참고)
   room.turn_seat = <무작위 host/guest>
   players: 양쪽 status='in_game', room_id=room.id, 서로 last_opponent 설정
   RETURN { role:'guest', room_id }
ELSE:
   -- 없으면 내가 대기 방을 만든다(host)
   newRoom = INSERT pvp_rooms(host_id=player_id, host_name=me.name, status='waiting')
   me.status='queued', me.room_id=newRoom.id
   RETURN { role:'host', room_id:newRoom.id, waiting:true }
```

- **FIFO**: 가장 오래된 대기 방부터 입장 → 먼저 기다린 사람이 먼저 매칭.
- **직전 상대 회피**: `host_id <> last_opponent`. 모두가 직전 상대뿐이면(2명만 남은 경우) 폴백으로 그냥 매칭(회피 조건 완화).

### 홀수/대기 → AI 폴백 (클라이언트)
- host로 대기 중이고 **T초(기본 10초)** 동안 guest가 안 오면:
  - 내 대기 방을 취소(`status='abandoned'` 또는 삭제), `status='ai_game'`로 전환하고 **로컬 AI 게임** 시작.
  - AI 게임 종료 시 다시 `pvp_request_match` 호출(풀 복귀).
- 대기 중 다른 사람이 내 방에 들어오면(Realtime로 `status='active'` 수신) 즉시 PvP 시작(AI 폴백 타이머 취소).

### 재매칭(게임 종료 후)
- 승/패 모달에서 "**다시 매칭**" → `pvp_request_match` 재호출 → 풀로 복귀.
- `last_opponent`가 설정돼 있어 직전 상대는 회피.

---

## 5. 게임 동기화 프로토콜

### 게임 초기화
- 매칭 성사 시 **guest의 클라이언트**가 `createInitialGame()`로 초기 상태를 만들어 `room.state`에 기록(또는 RPC가 시드만 정하고 guest가 채움). 선공은 `turn_seat`로 무작위.

### 한 수 두기
1. 내 좌석이 `turn_seat`일 때만 조작 가능(아니면 읽기 전용, "상대 차례" 표시).
2. 내가 카드를 내면: 로컬 엔진으로 `next = playCard(state, mySeat==='host'?'player':'ai', ...)` 계산.
3. `pvp_rooms` 행을 `state=next, turn_seat=<next.turn 매핑>, updated_at=now()`로 **UPDATE**.
4. 상대는 Realtime로 변경을 받아 화면 갱신.
5. 승리 시 `status='finished', winner_seat=...` 기록.

> 우노 외치기/같은 숫자 여러 장/벌칙 등 기존 규칙은 엔진에 이미 있으므로 PvP에서도 동일 동작. (우노 "잡기"는 상대가 사람이므로 **상대가 버튼으로** 처리 — 타이머 공유 방식은 6장 참고.)

### 재접속
- `room_id`를 localStorage에 저장. 새로고침 시 그 방을 다시 읽어 이어서.

---

## 6. 끊김 / 타이머 처리

- **하트비트**: 게임 중 각 클라이언트가 `pvp_players.last_seen`을 ~5초마다 갱신.
- **상대 이탈**: 내 차례 상대의 `last_seen`이 **20초** 넘게 멈추고 방이 `active`면, "상대가 나갔습니다" → 내가 `status='abandoned', winner_seat=me`로 종료하고 재매칭 가능.
- **턴 타이머(선택)**: `updated_at` 기준 30~45초 초과 시 자동 패스 또는 기권 처리(수업 운영 편의). → 열린 결정.
- **우노 외치기(PvP)**: AI판처럼 타이머+확률이 아니라, **상대 사람이 "우노!"를 눌러 잡는** 방식. 구현 난이도가 있어 v1에선 **PvP는 우노 자동 안전(벌칙 생략)**으로 두고, v2에서 실시간 잡기 추가 제안. → 열린 결정.

---

## 7. 화면 / 흐름

1. **입장(기존)** → 모드 선택 추가: **[AI와 대전] / [친구와 대전]**
2. **친구와 대전 선택 →** `pvp_request_match` 호출
   - 매칭됨 → 바로 게임
   - 대기 → "친구를 기다리는 중…(N초 후 AI와 연습)" 로딩. 타이머 후 AI 폴백.
3. **PvP 게임 화면**: 기존 게임 UI 재사용. 상단에 **상대 이름** 표시, 내 차례/상대 차례 뱃지.
4. **게임 종료 모달**: "다시 매칭 / 그만두기". 다시 매칭 → 풀 복귀.
5. 로비에 **현재 대기/게임 중 인원** 간단 표시(선택).

---

## 8. Supabase 설정(배포 시 필요)

- `supabase/pvp_schema.sql` 실행(테이블 + RPC + RLS).
- **Realtime 활성화**: `alter publication supabase_realtime add table pvp_rooms, pvp_players;`
- RLS(수업용): anon 에게 select/insert/update 허용(민감정보 없음). 매칭은 `SECURITY DEFINER` RPC로 감쌈.
- 주기적 청소(선택): 오래된 `finished/abandoned` 방, `last_seen` 끊긴 player 정리(크론 또는 입장 시 lazy cleanup).

---

## 9. 구현 단계(제안)

1. **스키마 + RPC**: `pvp_players`, `pvp_rooms`, `pvp_request_match`, RLS, Realtime.
2. **로비/매칭 훅**: `useMatchmaking` — request_match, 대기, AI 폴백 타이머, 재매칭.
3. **PvP 게임 훅**: `usePvpGame` — 방 구독, 내 좌석, 수 두기(행 UPDATE), 재접속.
4. **UI**: 모드 선택, 대기 화면, PvP 게임 화면(기존 컴포넌트 재사용), 종료 모달.
5. **끊김/하트비트** 처리.
6. (선택) PvP 전적 기록 + 로비 인원 표시.
7. (v2) PvP 실시간 "우노 잡기", 턴 타이머, 치팅 방지 강화.

---

## 10. 열린 결정 (확인 필요)

1. **우노 외치기(PvP)**: v1은 자동 안전(벌칙 생략) → v2에서 실시간 잡기? (권장: v1 자동)
2. **전적 기록/순위**: PvP 결과를 순위에 반영할까? (권장: 별도 `pvp_matches`에 기록, 순위는 v2)
3. **턴 타이머**: 둘까? 둔다면 몇 초? (권장: v1은 없음, 상대 이탈만 처리)
4. **AI 폴백 대기 시간**: 기본 10초 적절? 더 길게/짧게?
5. **동시 접속 규모**: 한 반(~30명) 기준이면 전역 advisory lock으로 충분. 여러 반 동시면 방 키를 반별로 분리 고려.
