// domain/stats/persistence/activity — the on-read behavioral analytics the rollup TABLES can't express:
//   • daily_stats is day-grained, so the hour-of-day axis (the day×hour heatmap) comes from message
//     timestamps directly.
//   • character_stats is CUMULATIVE (one row per character), so per-character momentum (this month vs last)
//     needs the per-(character, month) series, also straight from canon.
// Both are bounded owner-scoped scans (same cost class as latency.ts). Time buckets are UTC (strftime
// default — NO 'localtime'), matching readTemporal's UTC day math (one clock everywhere).
//
// ORBWEAVER (D18/D28): the heatmap counts user+assistant messages in the owner's CHATS — and under D18 a
// chat has no ownerId, so "the owner's chats" is membership-derived: chats with a character PARTICIPANT the
// owner owns (`chat_participants → characters.ownerId`). Momentum counts assistant turns per character
// (`messages.characterId → characters.ownerId`, D28). See the owner-attribution note in rebuild-from-canon.ts (PD-21 confirmed).

import type { Db } from "@orb/db";
import type { CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { sql } from "drizzle-orm";
import type { ActivityHeatmap, CharacterMomentum, MomentumRow } from "../contract/views";

const DAYS_PER_WEEK = 7;
const HOURS_PER_DAY = 24;
const MAX_DOW = 6; // Saturday (strftime %w: 0 = Sunday)
const MAX_HOUR = 23;
const DEFAULT_MOMENTUM_LIMIT = 10;

/** Messages-per-(weekday, hour) over the owner's whole history — the real heatmap behind the day-of-week
 *  row-sums `readTemporal` exposes. Counts user + assistant turns (the exchange), not system rows. Scoped
 *  to the owner's chats (membership via an owned character participant — D18). */
export async function readActivityHeatmap(db: Db, ownerId: string): Promise<ActivityHeatmap> {
  const rows = await db.all<{ dow: number; hour: number; n: number }>(sql`
    SELECT CAST(strftime('%w', m.created_at / 1000, 'unixepoch') AS INTEGER) AS dow,
           CAST(strftime('%H', m.created_at / 1000, 'unixepoch') AS INTEGER) AS hour,
           COUNT(*) AS n
    FROM messages m
    WHERE m.role IN ('user', 'assistant')
      AND m.chat_id IN (
        SELECT DISTINCT cp.chat_id FROM chat_participants cp
        JOIN characters c ON c.id = cp.character_id
        WHERE c.owner_id = ${ownerId}
      )
    GROUP BY dow, hour
  `);
  const matrix: number[][] = Array.from({ length: DAYS_PER_WEEK }, () =>
    new Array<number>(HOURS_PER_DAY).fill(0),
  );
  let total = 0;
  let peak: { dayOfWeek: number; hour: number; count: number } | null = null;
  for (const r of rows) {
    if (r.dow < 0 || r.dow > MAX_DOW || r.hour < 0 || r.hour > MAX_HOUR) {
      continue;
    }
    const row = matrix[r.dow];
    if (!row) {
      continue;
    }
    row[r.hour] = r.n;
    total += r.n;
    if (!peak || r.n > peak.count) {
      peak = { dayOfWeek: r.dow, hour: r.hour, count: r.n };
    }
  }
  return { matrix, total, peak };
}

// One row of the per-(character, month) assistant-turn count (file-local; not a leaked feature type).
interface MonthCountRow {
  characterId: CharacterId;
  name: string;
  month: string;
  n: number;
}

/** The two most-recent calendar months WITH activity (ascending), or nulls if fewer than two. Query-local
 *  dedup without a Set (persistence holds no in-memory state). */
function latestTwoMonths(rows: MonthCountRow[]): {
  latestMonth: string | null;
  prevMonth: string | null;
} {
  const months: string[] = [];
  for (const r of rows) {
    if (!months.includes(r.month)) {
      months.push(r.month);
    }
  }
  months.sort((a, b) => a.localeCompare(b));
  return { latestMonth: months.at(-1) ?? null, prevMonth: months.at(-2) ?? null };
}

/** Collapse the per-(character, month) rows into one `MomentumRow` per character over the two months. */
function momentumRows(
  rows: MonthCountRow[],
  latestMonth: string,
  prevMonth: string,
): MomentumRow[] {
  const byChar = new Map<string, { name: string; current: number; prev: number }>();
  for (const r of rows) {
    if (r.month !== latestMonth && r.month !== prevMonth) {
      continue;
    }
    const e = byChar.get(r.characterId) ?? { name: r.name, current: 0, prev: 0 };
    if (r.month === latestMonth) {
      e.current = r.n;
    } else {
      e.prev = r.n;
    }
    byChar.set(r.characterId, e);
  }
  return [...byChar.entries()].map(([characterId, e]) => ({
    characterId: castId<CharacterId>(characterId),
    name: e.name,
    current: e.current,
    prev: e.prev,
    delta: e.current - e.prev,
  }));
}

/** Per-character attention shift between the two most-recent active months. Anchored to the DATA's latest
 *  months (not wall-clock now) so a quiet current month doesn't read as "everything falling". Counts
 *  assistant turns (real generated engagement); per-character via `messages.characterId` (D28). */
export async function readCharacterMomentum(
  db: Db,
  ownerId: string,
  limit = DEFAULT_MOMENTUM_LIMIT,
): Promise<CharacterMomentum> {
  const rows = await db.all<MonthCountRow>(sql`
    SELECT m.character_id AS characterId, MIN(c.name) AS name,
           strftime('%Y-%m', m.created_at / 1000, 'unixepoch') AS month, COUNT(*) AS n
    FROM messages m
    JOIN characters c ON c.id = m.character_id
    WHERE c.owner_id = ${ownerId} AND m.role = 'assistant'
    GROUP BY m.character_id, month
  `);
  const empty: CharacterMomentum = { latestMonth: null, prevMonth: null, rising: [], falling: [] };
  const { latestMonth, prevMonth } = latestTwoMonths(rows);
  if (latestMonth === null || prevMonth === null) {
    return empty;
  }
  const all = momentumRows(rows, latestMonth, prevMonth);
  const rising = all
    .filter((r) => r.delta > 0)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, limit);
  const falling = all
    .filter((r) => r.delta < 0)
    .sort((a, b) => a.delta - b.delta)
    .slice(0, limit);
  return { latestMonth, prevMonth, rising, falling };
}
