// domain/stats/persistence/activity — per-character momentum straight from canon (character_stats is
// cumulative). Months are UTC (strftime default). Owner scope is the one-home membership definition in
// `substrate/owner-chat-scope.ts`, so a husk room is invisible here exactly as it is to the rollup writers.

import type { Db } from "@orb/db";
import type { CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { sql } from "drizzle-orm";
import type { CharacterMomentum, MomentumRow } from "../contract/views.ts";
import { ownerChatIds } from "../substrate/owner-chat-scope.ts";

const DEFAULT_MOMENTUM_LIMIT = 10;

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
  // @orb-waive persistence-no-in-memory-state(Map): query-local lookup map for momentum rows by character. Ends if it outlives the call.
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
 *  months (not wall-clock now) so a quiet current month doesn't read as "everything falling". Husk-excluded
 *  through the one-home owner-chat scope: a never-started room's seeded greeting is not attention the user
 *  paid a character (#1477). */
export async function readCharacterMomentum(db: Db, ownerId: string, limit = DEFAULT_MOMENTUM_LIMIT): Promise<CharacterMomentum> {
  const rows = await db.all<MonthCountRow>(sql`
    SELECT m.character_id AS characterId, MIN(c.name) AS name,
           strftime('%Y-%m', m.created_at / 1000, 'unixepoch') AS month, COUNT(*) AS n
    FROM messages m
    JOIN characters c ON c.id = m.character_id
    WHERE c.owner_id = ${ownerId} AND m.role = 'assistant'
      AND m.chat_id IN (${ownerChatIds(ownerId)})
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
