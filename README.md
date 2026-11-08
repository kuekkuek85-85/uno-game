# UNO vs AI 🎴

중학교 정보 수업용 웹앱. **사람(학생) 1명 vs AI 1명** 으로 표준 UNO를 플레이하고,
Supabase에 결과를 기록해 **순위**와 **교사 대시보드**를 제공합니다.

> 로그인 없이 학번·이름으로 입장 · AI 난이도 3단계 · 난이도별 가중 점수

## 기술 스택

- **프론트엔드**: React 18 + TypeScript + Vite + Tailwind CSS + React Router
- **DB/백엔드**: Supabase (Postgres + REST)
- **게임 로직은 전부 클라이언트에서 실행** — Supabase는 결과 기록·조회만 담당 (실시간 동기화 불필요)

## 빠른 시작

```bash
npm install
npm run dev     # http://localhost:5173
```

Supabase 없이도 **연습 모드**로 바로 플레이할 수 있습니다(결과 미저장).

### Supabase 연동(기록·순위 활성화)

1. [Supabase](https://supabase.com) 프로젝트 생성
2. **SQL Editor** 에서 [`supabase/schema.sql`](supabase/schema.sql) 전체 실행
   (students / matches 테이블 + leaderboard 뷰 + RLS 정책 생성)
3. `.env.example` 을 복사해 `.env` 생성 후 값 입력

   ```bash
   cp .env.example .env
   ```

   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   ```

4. `npm run dev` 재시작

## 명령어

| 명령어 | 설명 |
|---|---|
| `npm run dev` | 개발 서버 |
| `npm run build` | 프로덕션 빌드(타입 체크 포함) |
| `npm run preview` | 빌드 결과 미리보기 |
| `npm run test` | 게임 엔진 단위 테스트(vitest) |
| `npm run lint` | 타입 체크만 |

## 화면

| 경로 | 설명 |
|---|---|
| `/` | 입장: 학번·이름 입력 → 난이도 선택 → 시작 |
| `/play` | 게임 화면 (AI 손패 · 버린/뽑기 더미 · 내 손패) |
| `/leaderboard` | 순위표(가중 점수 내림차순) |
| `/teacher` | 교사 대시보드(학생별·난이도별 통계) |

## 프로젝트 구조

```
src/
├─ game/            # 게임 코어 (DB와 무관, 순수 로직)
│  ├─ types.ts      # 카드·게임 상태 타입
│  ├─ deck.ts       # 108장 덱 생성·셔플
│  ├─ engine.ts     # 규칙 판정·턴 진행·승패 (순수 함수)
│  ├─ ai.ts         # ⭐ aiMoveEasy / aiMoveNormal / aiMoveHard
│  └─ engine.test.ts
├─ hooks/useGame.ts # 게임 진행 + AI 턴 자동화
├─ lib/supabase.ts  # 학생 upsert · 경기 기록 · 순위 조회
├─ components/      # CardView · ColorPicker
├─ pages/           # Entry / Game / Leaderboard / Teacher
└─ session.tsx      # 입장 세션(학번·이름·난이도)
supabase/schema.sql # DB 스키마
```

## AI 난이도 (수업 핵심)

세 단계를 **`aiMoveEasy` / `aiMoveNormal` / `aiMoveHard`** 함수로 **명확히 분리**해
학생이 코드를 비교·수정하기 쉽도록 했습니다. (`src/game/ai.ts`)

| 단계 | 전략 | 교육 포인트 |
|---|---|---|
| **쉬움** | 낼 수 있는 카드 중 **무작위** | "AI가 그냥 아무거나 낸다" — 기본 조건문 |
| **보통** | 숫자 우선·색 유지·상대 견제(**규칙 기반 휴리스틱**) | "조건을 쌓으면 전략이 된다" |
| **어려움** | 상대/내 손패 수로 **공격·수비 모드** 전환, 와일드 색 회피 | "AI가 왜 이렇게 두지?" — 알고리즘 읽기 |

## 순위 점수

승리 1판당 **쉬움 1 · 보통 2 · 어려움 3** 점. (`leaderboard` 뷰에서 집계)

## 게임 규칙 메모 (2인전 단순화)

- **Reverse = Skip** (낸 사람이 한 번 더)
- **Draw2 / Draw4**: 상대가 즉시 뽑고 턴 넘김 (누적 규칙 생략)
- **UNO 외치기 벌칙 없음** (자동 안전)
- 뽑을 더미 소진 시: 버린 더미 top 1장만 남기고 재셔플
