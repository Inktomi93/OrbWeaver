// A library whose planner statistics claim near-empty message tables, plus the plan the chat recency
// subquery gets over it. Seeding is bulk SQL: the row counts, not the row contents, are what flips the plan.

import type { Db } from "@orb/db";
import { chats } from "@orb/db";
import { chatRecencyExpr } from "@orb/db/kit";
import { sql } from "drizzle-orm";

/** Enough rows that a stale "4 rows" claim flips the recency subquery to a bare `SEARCH m`. */
export const STALE_STATS_CHATS = 40;
export const STALE_STATS_MESSAGES_PER_CHAT = 100;
export const STALE_STATS_INDEX = "messages_chat_seq_unique";

/**
 * Leave `sqlite_stat1` describing a tiny library, then grow it without re-analyzing: exactly how an import
 * outruns the statistics. Run on a db with no message rows; the stats load into the connection at ANALYZE.
 */
export async function seedStaleMessageStats(db: Db): Promise<void> {
  await db.run(sql`INSERT INTO chats (id, started_at, created_at, updated_at) VALUES ('cb_stale_seed', 1, 1, 1)`);
  await db.run(sql`INSERT INTO messages (id, chat_id, seq, role, created_at) VALUES ('cb_stale_seed_m', 'cb_stale_seed', 0, 'assistant', 1)`);
  await db.run(sql`INSERT INTO message_variants (id, message_id, idx, content, created_at) VALUES ('cb_stale_seed_v', 'cb_stale_seed_m', 0, 'x', 1)`);
  await db.run(sql`ANALYZE`);
  await db.run(sql`DELETE FROM message_variants`);
  await db.run(sql`DELETE FROM messages`);
  await db.run(sql`DELETE FROM chats`);
  await db.run(
    sql.raw(`WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ${STALE_STATS_CHATS})
    INSERT INTO chats (id, started_at, created_at, updated_at) SELECT 'cb_chat_' || i, 1, 1, 1 FROM n`),
  );
  await db.run(
    sql.raw(`WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ${STALE_STATS_CHATS * STALE_STATS_MESSAGES_PER_CHAT})
    INSERT INTO messages (id, chat_id, seq, role, created_at)
    SELECT 'cb_msg_' || i, 'cb_chat_' || (i % ${STALE_STATS_CHATS} + 1), i / ${STALE_STATS_CHATS}, 'assistant', i FROM n`),
  );
  await db.run(sql`INSERT INTO message_variants (id, message_id, idx, content, created_at) SELECT 'cb_var_' || id, id, 0, 'x', created_at FROM messages`);
  await db.run(sql`UPDATE messages SET selected_variant_id = 'cb_var_' || id`);
}

/** The `EXPLAIN QUERY PLAN` detail lines for the recency subquery the chat and character libraries both embed. */
export async function recencyPlan(db: Db): Promise<readonly string[]> {
  const query = db.select({ at: chatRecencyExpr(db) }).from(chats);
  // The builder renders parenthesised inside a template, which EXPLAIN refuses; the statement has no params.
  const rows = await db.all<{ detail: string }>(sql.raw(`EXPLAIN QUERY PLAN ${query.toSQL().sql}`));
  return rows.map((row) => row.detail);
}
