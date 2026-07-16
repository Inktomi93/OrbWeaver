// domain/stats/persistence/activity — on-read behavioral analytics the rollup tables can't express: the
// day×hour heatmap (daily_stats is day-grained) and per-character momentum (character_stats is cumulative),
// both straight from canon. Bounded owner-scoped scans. Time buckets are UTC (strftime default, no
// 'localtime'). A chat has no ownerId (D18) — "the owner's chats" is membership-derived via an owned
// character participant.

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

/** Messages-per-(weekday, hour) over the owner's whole history. Counts user + assistant turns, not system
 *  rows; scoped to the owner's chats (membership via an owned character participant). */
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
  const matrix: number[][] = Array.from({ length: DAYS_PER_WEEK }, () => new Array<number>(HOURS_PER_DAY).fill(0));
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

interface MonthCountRow {
  characterId: CharacterId;
  name: string;
  month: string;
  n: number;
}

/** The two most-recent calendar months with activity (ascending), or nulls if fewer than two. */
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
function momentumRows(rows: MonthCountRow[], latestMonth: string, prevMonth: string): MomentumRow[] {
  // @orb-gate-ignore persistence-no-in-memory-state: query-local lookup map for momentum rows by character
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

/** Per-character attention shift between the two most-recent active months. Anchored to the data's latest
 *  months (not wall-clock now) so a quiet current month doesn't read as "everything falling". */
export async function readCharacterMomentum(db: Db, ownerId: string, limit = DEFAULT_MOMENTUM_LIMIT): Promise<CharacterMomentum> {
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
